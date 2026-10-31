import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, notifyStaff, notifyUser, canOwnConnection } from '@/lib/api-helpers'
import { loadScopedConnection, decryptJson } from '@/lib/marketplace/ops-bridge'
import { SpApiError } from '@/lib/marketplace/sp-api/http'

// REAL shipment confirmation — POST /orders/v0/orders/{orderId}/shipmentConfirmation.
// This mutates the actual Amazon order (marks it shipped). Nothing is
// simulated: the result stored and shown is Amazon's own response/error.
//
// Duplicate protection: a successful confirmation is recorded in
// ShipmentRecord; further confirmations for the same order are rejected.

type Params = { params: Promise<{ id: string }> }

const CONFIRMABLE = ['UNSHIPPED', 'PARTIALLY_SHIPPED']

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getSessionUser()
  if (!user) return fail('Unauthorized', 401)
  if (!canOwnConnection(user.role)) return fail('Only the connection owner can confirm shipments', 403)

  const { id } = await params
  const order = await db.syncedOrder.findUnique({
    where: { id },
    include: { items: true, connection: { select: { id: true, customerId: true } } },
  })
  if (!order || order.connection.customerId !== user.id) {
    return fail('Order not found', 404)
  }

  const body = await req.json().catch(() => ({}))
  const carrier = typeof body.carrier === 'string' ? body.carrier.trim() : ''
  const trackingNumber = typeof body.trackingNumber === 'string' ? body.trackingNumber.trim() : ''
  const quantities: Record<string, number> = body.quantities && typeof body.quantities === 'object' ? body.quantities : {}

  if (!carrier) return fail('Carrier name is required (as required by Amazon).', 400)

  // Eligibility: merchant-fulfilled + confirmable status (real Amazon rule).
  if (order.fulfillmentChannel !== 'MFN') {
    return fail('Only merchant-fulfilled (self-ship) orders can be confirmed here — FBA orders are shipped by Amazon.', 400)
  }
  if (!CONFIRMABLE.includes(order.orderStatus)) {
    return fail(`Amazon only allows shipment confirmation for Unshipped/Partially shipped orders (this order is ${order.orderStatus}).`, 400)
  }

  // Duplicate guard (idempotency).
  const existingSuccess = await db.shipmentRecord.findFirst({
    where: { orderId: order.id, type: 'CONFIRMATION', status: 'SUCCEEDED' },
  })
  if (existingSuccess || order.orderStatus === 'SHIPPED') {
    return fail('This order was already confirmed as shipped — check the shipment history before retrying.', 409)
  }

  const scoped = await loadScopedConnection(order.connection.id, user.id)
  if (!scoped) return fail('Connection not found', 404)

  const confirmableItems = order.items.filter((it) => it.orderItemId && it.quantityOrdered > 0)
  if (confirmableItems.length === 0) {
    return fail('Amazon has not exposed order item ids for this order yet (PENDING orders cannot be confirmed). Sync and retry shortly.', 400)
  }
  const shipmentItems = confirmableItems.map((it) => ({
    orderItemId: it.orderItemId as string,
    quantity:
      quantities[it.id] !== undefined && Number.isFinite(Number(quantities[it.id]))
        ? Math.max(0, Math.round(Number(quantities[it.id])))
        : it.quantityOrdered,
  })).filter((i) => i.quantity > 0)

  if (shipmentItems.length === 0) return fail('Select at least one unit to ship.', 400)

  const marketplaceId = scoped.connection.marketplaceIds[0]
  const shipFrom = decryptJson<Record<string, unknown>>(scoped.connection.shipFromAddress)

  const requestJson = JSON.stringify({ carrier, trackingNumber, shipmentItems, marketplaceId })
  try {
    const response = await scoped.ops.confirmShipment({
      creds: scoped.creds,
      orderId: order.amazonOrderId,
      marketplaceId,
      shipmentItems,
      carrierCode: carrier,
      trackingNumber: trackingNumber || undefined,
      shipFromAddress: shipFrom || null,
    })

    // Success — record + reflect immediately (next sync will match Amazon).
    await db.shipmentRecord.create({
      data: {
        connectionId: order.connection.id,
        orderId: order.id,
        amazonOrderId: order.amazonOrderId,
        type: 'CONFIRMATION',
        status: 'SUCCEEDED',
        carrier,
        trackingNumber: trackingNumber || null,
        requestJson,
        responseJson: response ? JSON.stringify(response) : null,
        createdById: user.id,
      },
    })
    await db.syncedOrder.update({
      where: { id: order.id },
      data: { orderStatus: 'SHIPPED', carrier, trackingNumber: trackingNumber || null },
    })
    for (const it of shipmentItems) {
      await db.orderItem.updateMany({
        where: { orderId: order.id, orderItemId: it.orderItemId },
        data: { quantityShipped: it.quantity },
      })
    }

    await logActivity(
      'AMAZON_SHIPMENT_CONFIRMED',
      `Order ${order.amazonOrderId} confirmed shipped on Amazon (carrier: ${carrier}${trackingNumber ? `, tracking: ${trackingNumber}` : ''})`,
      user.id
    )
    await notifyStaff(
      'Amazon shipment confirmed',
      `${user.name} confirmed shipment for order ${order.amazonOrderId} (${carrier}${trackingNumber ? ` · ${trackingNumber}` : ''}).`
    )
    await notifyUser(
      user.id,
      'Shipment confirmed on Amazon',
      `Order ${order.amazonOrderId} is now marked as shipped. Tracking: ${trackingNumber || '—'} (${carrier}).`
    )

    return ok({
      confirmed: true,
      carrier,
      trackingNumber: trackingNumber || null,
      amazonResponse: response,
      message: 'Shipment confirmed on Amazon — the order is now marked as shipped.',
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Shipment confirmation failed.'
    // Real failure — record it so the seller sees exactly what Amazon said.
    await db.shipmentRecord.create({
      data: {
        connectionId: order.connection.id,
        orderId: order.id,
        amazonOrderId: order.amazonOrderId,
        type: 'CONFIRMATION',
        status: 'FAILED',
        carrier,
        trackingNumber: trackingNumber || null,
        requestJson,
        error: message.slice(0, 500),
        createdById: user.id,
      },
    })
    await logActivity('AMAZON_SHIPMENT_FAILED', `Order ${order.amazonOrderId} shipment confirmation failed: ${message}`, user.id)
    if (e instanceof SpApiError && e.status === 403) {
      return fail(message, 403)
    }
    return fail(message, 400)
  }
}
