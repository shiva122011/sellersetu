import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, canOwnConnection } from '@/lib/api-helpers'
import { loadScopedConnection, decryptJson } from '@/lib/marketplace/ops-bridge'

// REAL shipping service lookup — POST /mfn/v0/eligibleShippingServices.
// Returns actual carriers, rates and delivery estimates Amazon offers for
// this package right now. Requires the Merchant Fulfillment grant; a 403 is
// surfaced with that exact requirement (no invented services, ever).

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getSessionUser()
  if (!user) return fail('Unauthorized', 401)
  if (!canOwnConnection(user.role)) return fail('Only the connection owner can request shipping services', 403)

  const { id } = await params
  const order = await db.syncedOrder.findUnique({
    where: { id },
    include: { items: true, connection: { select: { id: true, customerId: true } } },
  })
  if (!order || order.connection.customerId !== user.id) {
    return fail('Order not found', 404)
  }
  if (order.fulfillmentChannel !== 'MFN') {
    return fail('Shipping service quotes apply to merchant-fulfilled (self-ship) orders only.', 400)
  }

  const body = await req.json().catch(() => ({}))
  const dims = body.packageDimensions || {}
  const weight = body.weight || {}
  const packageDimensions = {
    length: Number(dims.length) || 30,
    width: Number(dims.width) || 20,
    height: Number(dims.height) || 10,
    unit: dims.unit === 'inches' ? 'inches' : 'centimeters',
  }
  const weightInput = {
    value: Number(weight.value) || 500,
    unit: weight.unit === 'oz' ? 'oz' : 'g',
  }

  const scoped = await loadScopedConnection(order.connection.id, user.id)
  if (!scoped) return fail('Connection not found', 404)

  const shipFrom = body.shipFromAddress || decryptJson<Record<string, unknown>>(scoped.connection.shipFromAddress)
  if (!shipFrom) {
    return fail(
      'Add your ship-from address first (Shipments tab → Ship-from settings). Amazon requires the pickup address for real rate quotes.',
      400
    )
  }

  const confirmableItems = order.items.filter((it) => it.orderItemId)
  if (confirmableItems.length === 0) {
    return fail('Amazon has not exposed order item ids for this order yet — sync and retry shortly.', 400)
  }

  try {
    const services = await scoped.ops.eligibleShippingServices({
      creds: scoped.creds,
      orderId: order.amazonOrderId,
      shipFrom,
      packageDimensions,
      weight: weightInput,
      shipmentItems: confirmableItems.map((it) => ({
        orderItemId: it.orderItemId as string,
        quantity: it.quantityOrdered,
      })),
    })
    return ok({ services, packageDimensions, weight: weightInput })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Shipping service lookup failed.'
    return fail(message, e instanceof Error && message.includes('403') ? 403 : 400)
  }
}
