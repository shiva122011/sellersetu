import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, notifyStaff, notifyUser } from '@/lib/api-helpers'
import { getProvider, bootstrapConnection, encryptToken } from '@/lib/marketplace/sync'
import { MARKETPLACE_LABELS } from '@/lib/marketplace/types'

// POST /api/admin/integrations/amazon/connect
// ADMIN-only: connect a seller account by pasting the LWA refresh token
// generated through Amazon's SELF-AUTHORIZATION (Developer Console → your app
// → LWA Credentials → Self authorization). This is the official Amazon flow
// for a seller connecting their own account to their own private app —
// no password or OTP is ever handled.
//
// The token is validated with a REAL Login-with-Amazon refresh grant, the
// seller profile is fetched from the REAL Sellers API, the connection is
// stored (tokens AES-256-GCM encrypted) and the first sync runs immediately.

type SyncSummary = {
  ok: boolean
  status: string
  ordersSynced: number
  listingsSynced: number
  returnsSynced: number
  message?: string
  warnings?: string[]
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Unauthorized', 401)
  if (user.role !== 'ADMIN') return fail('Only administrators can connect seller accounts here', 403)

  const body = await req.json().catch(() => ({}))
  const marketplace = typeof body.marketplace === 'string' && body.marketplace ? body.marketplace : 'amazon'
  if (marketplace !== 'amazon') {
    return fail('Only Amazon is available in Phase 1. Flipkart and Meesho are coming in a later phase.', 400)
  }

  const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken.trim() : ''
  const sellerIdInput = typeof body.sellerId === 'string' ? body.sellerId.trim() : ''
  const force = body.force === true
  if (!refreshToken) {
    return fail('Paste the LWA refresh token from your SP-API app (Seller Central → Develop Apps → your app → LWA Credentials → Self authorization).', 400)
  }

  // Which account owns this connection? Default: the admin's own account.
  let targetId = user.id
  if (body.linkTo && body.linkTo !== 'self') {
    const target = await db.user.findUnique({ where: { id: String(body.linkTo) }, select: { id: true, name: true, role: true } })
    if (!target || target.role !== 'CUSTOMER') {
      return fail('The selected account does not exist or is not a customer account.', 400)
    }
    targetId = target.id
  }

  const target = await db.user.findUnique({ where: { id: targetId }, select: { name: true } })
  if (!target) return fail('Target account not found', 404)

  const existing = await db.marketplaceConnection.findUnique({
    where: { customerId_marketplace: { customerId: targetId, marketplace } },
  })
  if (existing && existing.status === 'CONNECTED' && !force) {
    return fail(
      `"${target.name}" already has a connected Amazon account. Tick "Replace the existing connection" to overwrite it (cached data is purged), or disconnect it first.`,
      409
    )
  }

  const provider = getProvider(marketplace)

  try {
    // 1) REAL LWA refresh-token exchange — proves the token belongs to the
    //    saved app (client id/secret) and is not revoked/expired.
    const creds = await provider.refreshTokens({ refreshToken })

    // 2) REAL seller profile from the Sellers API. If the SP-API app is still
    //    in Draft or lacks roles, Amazon's exact 403 message is surfaced here.
    const profile = await provider.fetchSellerProfile(creds)

    // 3) Store the connection (replace = delete row; all cached rows cascade).
    if (existing) await db.marketplaceConnection.delete({ where: { id: existing.id } })

    const connection = await db.marketplaceConnection.create({
      data: {
        customerId: targetId,
        marketplace,
        status: 'CONNECTED',
        sellerId: sellerIdInput || null,
        sellerName: profile.sellerName,
        region: profile.region,
        marketplaceIds: JSON.stringify(profile.marketplaceIds),
        accessToken: encryptToken(creds.accessToken),
        refreshToken: encryptToken(refreshToken),
        tokenExpiresAt: creds.expiresAt || null,
        authorizedAt: new Date(),
      },
    })

    // 4) First sync — pulls real orders, listings, inventory and returns.
    const sync = await bootstrapConnection(connection.id)

    await logActivity(
      'MARKETPLACE_CONNECTED',
      `Amazon seller account connected via admin-pasted self-authorization token (store: ${profile.sellerName}, linked to: ${target.name})`,
      user.id
    )
    await notifyStaff(
      'Amazon account connected',
      `${user.name} connected the Amazon seller account "${profile.sellerName}" using a self-authorization refresh token (linked to ${target.name}).`
    )
    if (targetId !== user.id) {
      await notifyUser(
        targetId,
        'Amazon account connected',
        `Your Amazon seller account "${profile.sellerName}" was linked by the platform team. Open Amazon Orders to see your live data.`
      )
    }

    const syncSummary: SyncSummary = {
      ok: sync.ok,
      status: sync.status,
      ordersSynced: sync.ordersSynced,
      listingsSynced: sync.listingsSynced,
      returnsSynced: sync.returnsSynced,
      message: sync.message,
      warnings: sync.warnings,
    }

    const notice = sync.ok
      ? `Connected as "${profile.sellerName}"${targetId !== user.id ? ` (linked to ${target.name})` : ''}. First sync completed: ${sync.ordersSynced} orders, ${sync.listingsSynced} listings, ${sync.returnsSynced} returns.`
      : `Connected as "${profile.sellerName}", but the first sync reported issues: ${sync.message || sync.warnings?.join(' ') || 'unknown error'}`

    return ok({
      connection: {
        id: connection.id,
        marketplace,
        marketplaceLabel: MARKETPLACE_LABELS[marketplace] || marketplace,
        status: connection.status,
        sellerId: connection.sellerId,
        sellerName: connection.sellerName,
        region: connection.region,
        lastSyncAt: connection.lastSyncAt,
      },
      profile: { sellerName: profile.sellerName, marketplaceIds: profile.marketplaceIds, region: profile.region },
      sync: syncSummary,
      notice,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Amazon rejected this refresh token.'
    await logActivity('MARKETPLACE_CONNECT_ERROR', message.slice(0, 300), user.id)
    return fail(message, 400)
  }
}
