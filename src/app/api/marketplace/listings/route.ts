import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, canOwnConnection } from '@/lib/api-helpers'
import { getLowStockThreshold } from '@/lib/marketplace/settings'

// REAL product listings + inventory (merchant offers via Listings Items API,
// FBA stock via FBA Inventory API — materialised locally by the sync engine).

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Unauthorized', 401)
  if (!canOwnConnection(user.role)) return fail('Only the seller account owner can view listings', 403)

  const sp = req.nextUrl.searchParams
  const connectionId = sp.get('connectionId') || null
  const q = (sp.get('q') || '').trim()
  const channel = sp.get('channel') || 'ALL' // ALL | MERCHANT | AMAZON
  const stock = sp.get('stock') || 'ALL' // ALL | LOW | OUT | OK
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1)

  const connection = await db.marketplaceConnection.findFirst({
    where: { id: connectionId || undefined, customerId: user.id },
  })
  if (!connection) return fail('Connection not found', 404)

  const threshold = await getLowStockThreshold()

  const where: Record<string, unknown> = { connectionId: connection.id }
  if (channel !== 'ALL') where.fulfillmentChannel = channel
  if (q) {
    where.OR = [
      { sku: { contains: q } },
      { productName: { contains: q } },
      { asin: { contains: q } },
    ]
  }
  if (stock === 'OUT') where.quantity = 0
  else if (stock === 'LOW') where.quantity = { gt: 0, lte: threshold }
  else if (stock === 'OK') where.quantity = { gt: threshold }
  else if (stock === 'ISSUES') where.status = 'HAS_ISSUES'

  const [total, listings, channelCounts, issueCount] = await Promise.all([
    db.listing.count({ where }),
    db.listing.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * 15,
      take: 15,
    }),
    db.listing.groupBy({
      by: ['fulfillmentChannel'],
      where: { connectionId: connection.id },
      _count: { _all: true },
    }),
    db.listing.count({ where: { connectionId: connection.id, status: 'HAS_ISSUES' } }),
  ])

  const [lowStock, outOfStock] = await Promise.all([
    db.listing.count({ where: { connectionId: connection.id, quantity: { gt: 0, lte: threshold } } }),
    db.listing.count({ where: { connectionId: connection.id, quantity: 0 } }),
  ])

  const channelMap: Record<string, number> = {}
  for (const g of channelCounts) channelMap[g.fulfillmentChannel] = g._count._all

  return ok({
    connection: {
      id: connection.id,
      status: connection.status,
      sellerId: connection.sellerId,
      sellerName: connection.sellerName,
      lastSyncAt: connection.lastSyncAt,
    },
    lowStockThreshold: threshold,
    listings: listings.map((l) => ({
      ...l,
      issues: l.issuesJson ? (JSON.parse(l.issuesJson) as Array<{ code?: string; message: string; severity: string }>) : [],
    })),
    stats: {
      total: channelCounts.reduce((s, g) => s + g._count._all, 0),
      merchant: channelMap.MERCHANT || 0,
      fba: channelMap.AMAZON || 0,
      lowStock,
      outOfStock,
      withIssues: issueCount,
    },
    pagination: { page, pageSize: 15, total, totalPages: Math.max(1, Math.ceil(total / 15)) },
  })
}
