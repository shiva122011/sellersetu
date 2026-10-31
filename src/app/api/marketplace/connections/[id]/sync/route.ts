import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, canOwnConnection } from '@/lib/api-helpers'
import { syncConnection } from '@/lib/marketplace/sync'

// Manual "Sync now" — pulls fresh REAL data (orders, listings, inventory,
// returns) from Amazon into the local cache via the authorized SP-API.

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const user = await getSessionUser()
  if (!user) return fail('Unauthorized', 401)
  if (!canOwnConnection(user.role)) return fail('Only the connection owner can sync this marketplace account', 403)

  const { id } = await params
  const connection = await db.marketplaceConnection.findUnique({ where: { id } })
  if (!connection || connection.customerId !== user.id) {
    return fail('Connection not found', 404)
  }

  const result = await syncConnection(connection.id, 'MANUAL')
  await logActivity(
    result.ok ? 'MARKETPLACE_SYNC' : 'MARKETPLACE_SYNC_ERROR',
    result.ok
      ? `Amazon sync completed: ${result.ordersSynced} orders, ${result.listingsSynced} listings, ${result.returnsSynced} return rows${result.warnings?.length ? ` (${result.warnings.length} warning(s))` : ''}`
      : `Amazon sync failed: ${result.message}`,
    user.id
  )

  const updated = await db.marketplaceConnection.findUnique({
    where: { id },
    select: { lastSyncAt: true, lastSyncError: true, status: true },
  })

  return ok({ sync: result, connection: updated })
}
