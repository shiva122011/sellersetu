import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, notifyStaff, canOwnConnection } from '@/lib/api-helpers'
import { getProvider, decryptToken, encryptJson, decryptJson } from '@/lib/marketplace/sync'

// Connection lifecycle: disconnect (revoke + purge), sync-log history, and
// ship-from address / auto-sync preference updates for merchant fulfillment.

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getSessionUser()
  if (!user) return fail('Unauthorized', 401)
  if (!canOwnConnection(user.role)) return fail('Only the connection owner can disconnect a marketplace account', 403)

  const { id } = await params
  const connection = await db.marketplaceConnection.findUnique({ where: { id } })
  if (!connection || connection.customerId !== user.id) {
    return fail('Connection not found', 404)
  }

  // Best-effort server-side revocation of the OAuth grant at Amazon.
  try {
    const token = decryptToken(connection.refreshToken) || decryptToken(connection.accessToken)
    if (token) {
      const provider = getProvider(connection.marketplace)
      await provider.revoke({ token })
    }
  } catch (e) {
    console.error('Token revoke failed (continuing with local disconnect)', e)
  }

  await db.marketplaceConnection.delete({ where: { id } })

  await logActivity(
    'MARKETPLACE_DISCONNECTED',
    'Amazon seller account disconnected, authorization revoked and all stored marketplace data deleted',
    user.id
  )
  await notifyStaff('Amazon account disconnected', `${user.name} disconnected their Amazon seller account.`)

  return ok({ disconnected: true })
}

// GET — sync logs for this connection (audit of sync runs)
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getSessionUser()
  if (!user) return fail('Unauthorized', 401)
  const { id } = await params
  const connection = await db.marketplaceConnection.findUnique({ where: { id } })
  if (!connection || (connection.customerId !== user.id && !['ADMIN', 'TEAM'].includes(user.role))) {
    return fail('Connection not found', 404)
  }
  const logs = await db.syncLog.findMany({
    where: { connectionId: id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  return ok({
    logs: logs.map((l) => ({
      ...l,
      warnings: l.warnings ? (JSON.parse(l.warnings) as string[]) : [],
    })),
  })
}

// PATCH — update ship-from address (encrypted at rest; used for MFN shipping
// service quotes) and the auto-sync preference.
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getSessionUser()
  if (!user) return fail('Unauthorized', 401)
  if (!canOwnConnection(user.role)) return fail('Only the connection owner manages their marketplace connection', 403)

  const { id } = await params
  const connection = await db.marketplaceConnection.findUnique({ where: { id } })
  if (!connection || connection.customerId !== user.id) {
    return fail('Connection not found', 404)
  }

  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}

  if (body.autoSyncEnabled !== undefined) {
    data.autoSyncEnabled = Boolean(body.autoSyncEnabled)
  }

  if (body.shipFromAddress !== undefined) {
    const a = body.shipFromAddress
    if (a === null) {
      data.shipFromAddress = null
    } else {
      const required: Array<[string, string]> = [
        ['name', 'Name'],
        ['addressLine1', 'Address line 1'],
        ['city', 'City'],
        ['postalCode', 'Postal code'],
        ['countryCode', 'Country code'],
      ]
      for (const [key, label] of required) {
        if (!a[key] || typeof a[key] !== 'string') return fail(`${label} is required for the ship-from address.`, 400)
      }
      if (typeof a.phone !== 'string' || !a.phone.trim()) {
        return fail('Phone is required by Amazon for merchant shipping requests.', 400)
      }
      data.shipFromAddress = encryptJson({
        name: String(a.name).trim(),
        addressLine1: String(a.addressLine1).trim(),
        addressLine2: a.addressLine2 ? String(a.addressLine2).trim() : undefined,
        city: String(a.city).trim(),
        stateOrRegion: a.stateOrRegion ? String(a.stateOrRegion).trim() : undefined,
        postalCode: String(a.postalCode).trim(),
        countryCode: String(a.countryCode).trim().toUpperCase(),
        email: a.email ? String(a.email).trim() : undefined,
        phone: String(a.phone).trim(),
      })
    }
  }

  const updated = await db.marketplaceConnection.update({ where: { id }, data })
  await logActivity(
    'MARKETPLACE_CONNECTION_UPDATED',
    `Connection settings updated${data.shipFromAddress ? ' (ship-from address saved)' : ''}${data.autoSyncEnabled !== undefined ? ` (auto-sync: ${data.autoSyncEnabled ? 'on' : 'off'})` : ''}`,
    user.id
  )
  return ok({ id: updated.id, autoSyncEnabled: updated.autoSyncEnabled })
}

// GET ship-from (decoded for the owner only) — via query ?include=shipFrom
export async function POST(_req: NextRequest, { params }: Params) {
  // Kept minimal: the encrypted ship-from never leaves the server except to
  // its owner through this explicit action.
  const user = await getSessionUser()
  if (!user) return fail('Unauthorized', 401)
  const { id } = await params
  const connection = await db.marketplaceConnection.findUnique({ where: { id } })
  if (!connection || connection.customerId !== user.id) {
    return fail('Connection not found', 404)
  }
  const shipFrom = decryptJson<Record<string, string>>(connection.shipFromAddress)
  return ok({ shipFrom })
}
