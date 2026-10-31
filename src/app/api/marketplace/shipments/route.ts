import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, canOwnConnection } from '@/lib/api-helpers'
import { decryptJson } from '@/lib/marketplace/ops-bridge'

// Shipment workflow overview: pending merchant-fulfilled shipments (real
// unshipped orders) + the confirmed-shipment history (real Amazon actions).

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Unauthorized', 401)
  if (!canOwnConnection(user.role)) return fail('Only the seller account owner can view shipments', 403)

  const sp = req.nextUrl.searchParams
  const connectionId = sp.get('connectionId') || null

  const connection = await db.marketplaceConnection.findFirst({
    where: { id: connectionId || undefined, customerId: user.id },
  })
  if (!connection) return fail('Connection not found', 404)

  const [pendingOrders, confirmed, failed] = await Promise.all([
    db.syncedOrder.findMany({
      where: {
        connectionId: connection.id,
        fulfillmentChannel: 'MFN',
        orderStatus: { in: ['UNSHIPPED', 'PARTIALLY_SHIPPED'] },
      },
      orderBy: { purchaseDate: 'asc' },
      take: 50,
      include: { items: true },
    }),
    db.shipmentRecord.findMany({
      where: { connectionId: connection.id, type: 'CONFIRMATION', status: 'SUCCEEDED' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { order: { select: { amazonOrderId: true, orderStatus: true } } },
    }),
    db.shipmentRecord.findMany({
      where: { connectionId: connection.id, type: 'CONFIRMATION', status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { order: { select: { amazonOrderId: true } } },
    }),
  ])

  const shipFrom = decryptJson<Record<string, string>>(connection.shipFromAddress)

  return ok({
    connection: {
      id: connection.id,
      status: connection.status,
      sellerName: connection.sellerName,
      lastSyncAt: connection.lastSyncAt,
    },
    pending: pendingOrders.map((o) => ({
      id: o.id,
      amazonOrderId: o.amazonOrderId,
      purchaseDate: o.purchaseDate,
      orderStatus: o.orderStatus,
      orderTotal: o.orderTotal,
      currency: o.currency,
      latestShipDate: o.latestShipDate,
      shipCity: o.shipCity,
      shipState: o.shipState,
      items: o.items.map((it) => ({
        id: it.id,
        title: it.title,
        sellerSku: it.sellerSku,
        quantityOrdered: it.quantityOrdered,
        hasItemIds: Boolean(it.orderItemId),
      })),
      units: o.items.reduce((s, it) => s + it.quantityOrdered, 0),
    })),
    confirmed: confirmed.map((r) => ({
      id: r.id,
      amazonOrderId: r.amazonOrderId,
      orderStatus: r.order?.orderStatus || null,
      carrier: r.carrier,
      trackingNumber: r.trackingNumber,
      createdAt: r.createdAt,
    })),
    failed: failed.map((r) => ({
      id: r.id,
      amazonOrderId: r.amazonOrderId,
      error: r.error,
      createdAt: r.createdAt,
    })),
    shipFrom: shipFrom ? { ...shipFrom } : null,
  })
}
