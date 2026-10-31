import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, canOwnConnection } from '@/lib/api-helpers'
import { loadScopedConnection, decryptJson } from '@/lib/marketplace/ops-bridge'
import { encryptJson } from '@/lib/marketplace/sync'
import { fetchOrderItems } from '@/lib/marketplace/sp-api/orders'

// Single REAL order detail: cached snapshot + lazy item backfill + live PII
// (full address / buyer info via Restricted Data Tokens) + shipment history.
// Strictly scoped to the signed-in customer's own connection.

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const user = await getSessionUser()
  if (!user) return fail('Unauthorized', 401)
  if (!canOwnConnection(user.role)) return fail('Only the seller account owner can view marketplace orders', 403)

  const { id } = await params
  const order = await db.syncedOrder.findUnique({
    where: { id },
    include: {
      items: true,
      connection: { select: { id: true, customerId: true, marketplace: true, sellerId: true, status: true } },
      shipmentRecords: { orderBy: { createdAt: 'desc' } },
      returnRecords: { orderBy: { returnDate: 'desc' } },
    },
  })
  if (!order || order.connection.customerId !== user.id) {
    return fail('Order not found', 404)
  }

  // Lazy item backfill: Amazon throttles item lookups, so a bootstrap sync
  // may leave older orders without cached items — fetch them live once.
  let items = order.items
  if (items.length === 0 && order.connection.status !== 'EXPIRED') {
    try {
      const scoped = await loadScopedConnection(order.connection.id, user.id)
      if (scoped) {
        const liveItems = await fetchOrderItems(scoped.ctx, order.amazonOrderId)
        if (liveItems.length) {
          await db.orderItem.deleteMany({ where: { orderId: order.id } })
          await db.orderItem.createMany({
            data: liveItems.map((it) => ({
              orderId: order.id,
              orderItemId: it.orderItemId || null,
              asin: it.asin || null,
              sellerSku: it.sellerSku || null,
              title: it.title,
              quantityOrdered: it.quantityOrdered,
              quantityShipped: it.quantityShipped,
              itemPrice: it.itemPrice ?? null,
              currency: it.currency || null,
              condition: it.condition || null,
            })),
          })
          items = await db.orderItem.findMany({ where: { orderId: order.id } })
        }
      }
    } catch {
      // non-fatal: cached state is still shown
    }
  }

  // Live PII (optional): full shipping address + buyer info through the
  // official Restricted Data Token flow. Results are cached encrypted.
  const withPii = req.nextUrl.searchParams.get('pii') === '1'
  let address: Record<string, unknown> | null = null
  let buyer: Record<string, unknown> | null = null
  let piiError: string | null = null

  if (withPii && order.connection.status !== 'EXPIRED') {
    address = decryptJson<Record<string, unknown>>(order.shippingAddressJson)
    buyer = decryptJson<Record<string, unknown>>(order.buyerInfoJson)

    if (!address || !buyer) {
      try {
        const scoped = await loadScopedConnection(order.connection.id, user.id)
        if (scoped) {
          if (!address) {
            address = await scoped.ops.fetchOrderAddress({ creds: scoped.creds, orderId: order.amazonOrderId })
            if (address) {
              await db.syncedOrder.update({
                where: { id: order.id },
                data: { shippingAddressJson: encryptJson(address) },
              })
              const a = address as Record<string, string>
              await db.syncedOrder.update({
                where: { id: order.id },
                data: {
                  shipCity: a.City || a.city || order.shipCity,
                  shipState: a.StateOrRegion || a.stateOrRegion || order.shipState,
                  shipCountry: a.CountryCode || a.countryCode || order.shipCountry,
                  shipPostalCode: a.PostalCode || a.postalCode || order.shipPostalCode,
                },
              })
            }
          }
          if (!buyer) {
            buyer = await scoped.ops.fetchOrderBuyerInfo({ creds: scoped.creds, orderId: order.amazonOrderId })
            if (buyer) {
              await db.syncedOrder.update({
                where: { id: order.id },
                data: { buyerInfoJson: encryptJson(buyer) },
              })
            }
          }
        }
      } catch (e) {
        piiError = e instanceof Error ? e.message : 'Buyer/address information could not be retrieved from Amazon.'
      }
    }
  }

  return ok({
    order: {
      id: order.id,
      amazonOrderId: order.amazonOrderId,
      purchaseDate: order.purchaseDate,
      lastUpdateDate: order.lastUpdateDate,
      orderStatus: order.orderStatus,
      fulfillmentChannel: order.fulfillmentChannel,
      salesChannel: order.salesChannel,
      shipServiceLevel: order.shipServiceLevel,
      orderTotal: order.orderTotal,
      currency: order.currency,
      numberOfItems: order.numberOfItems,
      paymentMethod: order.paymentMethod,
      shipCity: order.shipCity,
      shipState: order.shipState,
      shipCountry: order.shipCountry,
      shipPostalCode: order.shipPostalCode,
      earliestShipDate: order.earliestShipDate,
      latestShipDate: order.latestShipDate,
      earliestDeliveryDate: order.earliestDeliveryDate,
      latestDeliveryDate: order.latestDeliveryDate,
      promiseDate: order.promiseDate,
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      deliveryStatus: order.deliveryStatus,
      canceledReason: order.canceledReason,
      isReturned: order.isReturned,
      returnInfo: order.returnInfo,
      items,
      shipmentRecords: order.shipmentRecords,
      returnRecords: order.returnRecords,
    },
    pii: {
      address,
      buyer,
      error: piiError,
      note: piiError
        ? 'Buyer name, full address and contact details require the "Personally Identifiable Information" permission on our SP-API app (Amazon restricts PII access).'
        : null,
    },
  })
}
