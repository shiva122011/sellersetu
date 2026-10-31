import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { db } from '@/lib/db'
import { logActivity, notifyStaff, notifyUser } from '@/lib/api-helpers'
import { getProvider, bootstrapConnection, encryptToken } from '@/lib/marketplace/sync'

// Official Amazon OAuth redirect target (SP-API app authorization consent).
// Amazon redirects here with ?code=...&selling_partner_id=...&state=... after
// the seller consents. We exchange the code, profile the seller, store
// encrypted tokens, bootstrap the first sync, and send the seller back to
// their dashboard. Real authorization only — no fallback path.

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'sellersetu-dev-secret-change-in-production'
)

function redirectTo(origin: string, params: Record<string, string>) {
  const url = new URL('/', origin)
  url.searchParams.set('view', 'orders')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return NextResponse.redirect(url.toString())
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const origin = req.nextUrl.origin
  const code = sp.get('code') || sp.get('spapi_oauth_code')
  const state = sp.get('state')
  const sellingPartnerId = sp.get('selling_partner_id')

  if (sp.get('error')) {
    return redirectTo(origin, {
      connected: 'error',
      reason: sp.get('error_description') || 'Authorization was cancelled on Amazon.',
    })
  }
  if (!code || !state) {
    return redirectTo(origin, { connected: 'error', reason: 'Missing authorization parameters.' })
  }

  // Validate signed state → which customer started this flow
  let customerId: string
  try {
    const { payload } = await jwtVerify(state, SECRET)
    if (payload.purpose !== 'mp-oauth' || typeof payload.customerId !== 'string') throw new Error('bad state')
    customerId = payload.customerId
  } catch {
    return redirectTo(origin, { connected: 'error', reason: 'Authorization link expired — please try again.' })
  }

  const customer = await db.user.findUnique({ where: { id: customerId } })
  if (!customer) return redirectTo(origin, { connected: 'error', reason: 'Account no longer exists.' })

  try {
    const provider = getProvider('amazon')
    const redirectUri = `${origin}/api/marketplace/callback`
    const creds = await provider.exchangeCode({ code, redirectUri })
    const profile = await provider.fetchSellerProfile(creds)

    const data = {
      status: 'CONNECTED',
      // The real selling-partner id comes from Amazon's redirect parameter.
      sellerId: sellingPartnerId || profile.sellerId || null,
      sellerName: profile.sellerName,
      region: profile.region,
      marketplaceIds: JSON.stringify(profile.marketplaceIds),
      accessToken: encryptToken(creds.accessToken),
      refreshToken: creds.refreshToken ? encryptToken(creds.refreshToken) : null,
      tokenExpiresAt: creds.expiresAt || null,
      authorizedAt: new Date(),
      lastSyncError: null,
      lastSyncAt: null,
      pendingReturnsReportId: null,
    }
    const existing = await db.marketplaceConnection.findUnique({
      where: { customerId_marketplace: { customerId, marketplace: 'amazon' } },
    })
    const connection = existing
      ? await db.marketplaceConnection.update({ where: { id: existing.id }, data })
      : await db.marketplaceConnection.create({ data: { customerId, marketplace: 'amazon', ...data } })

    const sync = await bootstrapConnection(connection.id)

    await logActivity(
      'MARKETPLACE_CONNECTED',
      `Amazon seller account authorized via official SP-API OAuth (seller ${profile.sellerName || sellingPartnerId || ''})`,
      customerId
    )
    await notifyUser(
      customerId,
      'Amazon account connected',
      sync.ok
        ? `Your Amazon seller account "${profile.sellerName}" is connected. ${sync.ordersSynced} orders and ${sync.listingsSynced} listings were synced to your dashboard.`
        : `Your Amazon seller account is connected, but the first sync reported issues: ${sync.message || sync.warnings?.join(' ') || 'unknown error'}`
    )
    await notifyStaff(
      'Amazon account authorized',
      `${customer.name} authorized their Amazon seller account via SP-API (${profile.sellerName || sellingPartnerId || 'unknown'}).`
    )

    return redirectTo(origin, { connected: 'success' })
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'Authorization failed.'
    await logActivity('MARKETPLACE_CONNECT_ERROR', reason.slice(0, 300), customerId)
    return redirectTo(origin, { connected: 'error', reason: reason.slice(0, 200) })
  }
}
