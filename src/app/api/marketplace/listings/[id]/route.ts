import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, notifyStaff, canOwnConnection } from '@/lib/api-helpers'
import { loadScopedConnection } from '@/lib/marketplace/ops-bridge'

// REAL inventory update — PATCH /listings/2021-06-30/items/{sellerId}/{sku}
// (Listings Items API). Updates the merchant-fulfilled quantity on the live
// Amazon offer, then refreshes the local cache. Amazon's own response (or
// error) is returned — nothing is simulated.

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getSessionUser()
  if (!user) return fail('Unauthorized', 401)
  if (!canOwnConnection(user.role)) return fail('Only the connection owner can update listings', 403)

  const { id } = await params
  const listing = await db.listing.findUnique({
    where: { id },
    include: { connection: { select: { id: true, customerId: true, status: true } } },
  })
  if (!listing || listing.connection.customerId !== user.id) {
    return fail('Listing not found', 404)
  }

  const body = await req.json().catch(() => ({}))
  const quantity = Number(body.quantity)
  if (!Number.isFinite(quantity) || quantity < 0 || quantity > 100000) {
    return fail('Enter a valid quantity (0–100000).', 400)
  }
  if (listing.fulfillmentChannel !== 'MERCHANT') {
    return fail('Amazon-managed (FBA) inventory can only be changed by sending stock into FBA warehouses — update it in Seller Central.', 400)
  }

  const scoped = await loadScopedConnection(listing.connection.id, user.id)
  if (!scoped) return fail('Connection not found', 404)
  if (!scoped.connection.sellerId) {
    return fail('Seller id unknown for this connection — reconnect the account so listings can be updated.', 400)
  }
  const marketplaceId = scoped.connection.marketplaceIds[0]

  try {
    // Resolve the offer's productType (required by the Listings Items API).
    const item = await scoped.ops.getListingItem({
      creds: scoped.creds,
      sellerId: scoped.connection.sellerId,
      sku: listing.sku,
      marketplaceId,
    })
    const productType = item.productType || 'PRODUCT'
    await scoped.ops.patchListingInventory({
      creds: scoped.creds,
      sellerId: scoped.connection.sellerId,
      sku: listing.sku,
      marketplaceId,
      productType,
      quantity: Math.round(quantity),
    })

    // Amazon accepted the patch — update the local snapshot.
    const updated = await db.listing.update({
      where: { id: listing.id },
      data: { quantity: Math.round(quantity), updatedAt: new Date() },
    })

    await logActivity(
      'AMAZON_INVENTORY_UPDATED',
      `Inventory updated on Amazon: SKU ${listing.sku} → ${Math.round(quantity)} unit(s)`,
      user.id
    )
    await notifyStaff(
      'Amazon inventory updated',
      `${user.name} set ${listing.sku} to ${Math.round(quantity)} unit(s) via the Listings Items API.`
    )

    return ok({
      listing: updated,
      message: `Amazon accepted the update — ${listing.sku} is now ${Math.round(quantity)} unit(s) in stock.`,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Inventory update failed.'
    return fail(message, message.includes('403') ? 403 : 400)
  }
}
