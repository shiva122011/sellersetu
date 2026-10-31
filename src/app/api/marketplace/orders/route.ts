import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, canOwnConnection } from '@/lib/api-helpers'
import { getLowStockThreshold } from '@/lib/marketplace/settings'

// Cached REAL marketplace orders for the customer dashboard.
// All queries are strictly scoped to the signed-in customer's connections —
// a customer can never see another seller's data.

const PAGE_SIZE = 12

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Unauthorized', 401)
  if (!canOwnConnection(user.role)) return fail('Only the seller account owner can view marketplace orders', 403)

  const sp = req.nextUrl.searchParams
  const connectionId = sp.get('connectionId') || null
  const status = sp.get('status') || 'ALL'
  // ALL | PENDING | UNSHIPPED | PARTIALLY_SHIPPED | SHIPPED | CANCELED | RETURNED | SHIPMENT_PENDING
  const channel = sp.get('channel') || 'ALL' // ALL | MFN | AFN
  const sort = sp.get('sort') === 'oldest' ? 'oldest' : sp.get('sort') === 'updated' ? 'updated' : 'newest'
  const q = (sp.get('q') || '').trim()
  const from = sp.get('from')
  const to = sp.get('to')
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1)

  const connection = await db.marketplaceConnection.findFirst({
    where: { id: connectionId || undefined, customerId: user.id },
  })
  if (!connection) return fail('Connection not found', 404)

  const where: Record<string, unknown> = { connectionId: connection.id }
  if (status === 'RETURNED') {
    where.isReturned = true
  } else if (status === 'SHIPMENT_PENDING') {
    where.orderStatus = { in: ['UNSHIPPED', 'PARTIALLY_SHIPPED'] }
  } else if (status !== 'ALL') {
    where.orderStatus = status
  }
  if (channel !== 'ALL') where.fulfillmentChannel = channel
  if (q) {
    where.OR = [
      { amazonOrderId: { contains: q } },
      { items: { some: { title: { contains: q } } } },
      { items: { some: { sellerSku: { contains: q } } } },
    ]
  }
  if (from || to) {
    const purchaseDate: Record<string, Date> = {}
    if (from) purchaseDate.gte = new Date(from + 'T00:00:00.000Z')
    if (to) purchaseDate.lte = new Date(to + 'T23:59:59.999Z')
    where.purchaseDate = purchaseDate
  }

  const orderBy =
    sort === 'oldest' ? { purchaseDate: 'asc' as const }
    : sort === 'updated' ? { lastUpdateDate: 'desc' as const }
    : { purchaseDate: 'desc' as const }

  const [total, orders, statusCounts, returnedCount, mfnUnshipped, lowStock, outOfStock, listingIssues] =
    await Promise.all([
      db.syncedOrder.count({ where }),
      db.syncedOrder.findMany({
        where,
        orderBy,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { items: true },
      }),
      db.syncedOrder.groupBy({
        by: ['orderStatus'],
        where: { connectionId: connection.id },
        _count: { _all: true },
      }),
      db.syncedOrder.count({ where: { connectionId: connection.id, isReturned: true } }),
      db.syncedOrder.count({
        where: {
          connectionId: connection.id,
          fulfillmentChannel: 'MFN',
          orderStatus: { in: ['UNSHIPPED', 'PARTIALLY_SHIPPED'] },
        },
      }),
      db.listing.count({
        where: { connectionId: connection.id, quantity: { gt: 0, lte: await getLowStockThreshold() } },
      }),
      db.listing.count({ where: { connectionId: connection.id, quantity: 0 } }),
      db.listing.count({ where: { connectionId: connection.id, status: 'HAS_ISSUES' } }),
    ])

  const countMap: Record<string, number> = {}
  for (const g of statusCounts) countMap[g.orderStatus] = g._count._all

  // Derived alerts — computed strictly from real synced data + connection state.
  const alerts: Array<{ key: string; tone: 'info' | 'warning' | 'danger'; text: string; link?: string }> = []
  if (connection.status === 'EXPIRED') {
    alerts.push({ key: 'auth', tone: 'danger', text: 'Amazon authorization expired — reconnect your account to resume syncing.' })
  }
  if (connection.lastSyncError && connection.status !== 'EXPIRED') {
    alerts.push({ key: 'sync', tone: 'warning', text: `Last sync failed: ${connection.lastSyncError}` })
  }
  if (mfnUnshipped > 0) {
    alerts.push({ key: 'unshipped', tone: 'warning', text: `${mfnUnshipped} merchant-fulfilled order(s) awaiting shipment — open the Shipments tab to prepare them.`, link: 'shipments' })
  }
  if (lowStock > 0) {
    alerts.push({ key: 'lowstock', tone: 'warning', text: `${lowStock} product(s) are low on stock — review inventory.`, link: 'products' })
  }
  if (outOfStock > 0) {
    alerts.push({ key: 'outofstock', tone: 'danger', text: `${outOfStock} product(s) are out of stock.`, link: 'products' })
  }
  if (listingIssues > 0) {
    alerts.push({ key: 'issues', tone: 'info', text: `${listingIssues} listing(s) reported issues by Amazon.`, link: 'products' })
  }

  return ok({
    connection: {
      id: connection.id,
      marketplace: connection.marketplace,
      status: connection.status,
      sellerName: connection.sellerName,
      autoSyncEnabled: connection.autoSyncEnabled,
      lastSyncAt: connection.lastSyncAt,
      lastSyncError: connection.lastSyncError,
    },
    orders: orders.map((o) => ({
      id: o.id,
      amazonOrderId: o.amazonOrderId,
      purchaseDate: o.purchaseDate,
      lastUpdateDate: o.lastUpdateDate,
      orderStatus: o.orderStatus,
      fulfillmentChannel: o.fulfillmentChannel,
      salesChannel: o.salesChannel,
      shipServiceLevel: o.shipServiceLevel,
      orderTotal: o.orderTotal,
      currency: o.currency,
      numberOfItems: o.numberOfItems,
      shipCity: o.shipCity,
      shipState: o.shipState,
      carrier: o.carrier,
      trackingNumber: o.trackingNumber,
      deliveryStatus: o.deliveryStatus,
      canceledReason: o.canceledReason,
      isReturned: o.isReturned,
      returnInfo: o.returnInfo,
      items: o.items.map((it) => ({
        id: it.id, title: it.title, sellerSku: it.sellerSku, asin: it.asin,
        quantityOrdered: it.quantityOrdered, quantityShipped: it.quantityShipped,
        itemPrice: it.itemPrice, currency: it.currency,
      })),
    })),
    pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
    stats: {
      total: statusCounts.reduce((s, g) => s + g._count._all, 0),
      pending: (countMap.PENDING || 0) + (countMap.UNSHIPPED || 0) + (countMap.INVOICE_UNCONFIRMED || 0),
      partiallyShipped: countMap.PARTIALLY_SHIPPED || 0,
      shipped: countMap.SHIPPED || 0,
      canceled: (countMap.CANCELED || 0) + (countMap.UNFULFILLABLE || 0),
      returned: returnedCount,
      mfnUnshipped,
    },
    inventoryStats: { lowStock, outOfStock, listingIssues },
    alerts,
  })
}
