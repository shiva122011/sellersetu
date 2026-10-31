import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, notifyStaff, canOwnConnection } from '@/lib/api-helpers'
import { amazonLiveConfigured, bootstrapConnection, encryptToken } from '@/lib/marketplace/sync'
import { getProvider } from '@/lib/marketplace/sync'
import { isSandboxMode } from '@/lib/marketplace/settings'
import { MARKETPLACE_LABELS } from '@/lib/marketplace/types'

// Customer marketplace connections — Phase 1: Amazon Seller Central.
// REAL SP-API only: a connection exists exclusively through Amazon's official
// authorization. No demo/simulated data path exists.

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'sellersetu-dev-secret-change-in-production'
)

// Short-lived signed state for the OAuth round-trip.
async function signOAuthState(customerId: string): Promise<string> {
  return new SignJWT({ customerId, purpose: 'mp-oauth' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(SECRET)
}

function connectionView(c: {
  id: string
  marketplace: string
  status: string
  sellerId: string | null
  sellerName: string | null
  region: string | null
  autoSyncEnabled: boolean
  authorizedAt: Date | null
  lastSyncAt: Date | null
  lastSyncError: string | null
  createdAt: Date
}) {
  return {
    id: c.id,
    marketplace: c.marketplace,
    marketplaceLabel: MARKETPLACE_LABELS[c.marketplace] || c.marketplace,
    status: c.status,
    sellerId: c.sellerId,
    sellerName: c.sellerName,
    region: c.region,
    autoSyncEnabled: c.autoSyncEnabled,
    authorizedAt: c.authorizedAt,
    lastSyncAt: c.lastSyncAt,
    lastSyncError: c.lastSyncError,
    createdAt: c.createdAt,
    // Tokens intentionally never leave the server.
  }
}

// GET — list my connections + whether the platform SP-API app is configured
// (customers AND admins who connected their own seller account)
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('Unauthorized', 401)
  if (!canOwnConnection(user.role)) return fail('Only sellers (customers/administrators) manage marketplace connections here', 403)

  const [connections, liveConfigured, sandboxMode] = await Promise.all([
    db.marketplaceConnection.findMany({
      where: { customerId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, marketplace: true, status: true, sellerId: true,
        sellerName: true, region: true, autoSyncEnabled: true, authorizedAt: true,
        lastSyncAt: true, lastSyncError: true, createdAt: true,
      },
    }),
    amazonLiveConfigured(),
    isSandboxMode(),
  ])

  const counts = await Promise.all(
    connections.map(async (c) => ({
      id: c.id,
      orderCount: await db.syncedOrder.count({ where: { connectionId: c.id } }),
      listingCount: await db.listing.count({ where: { connectionId: c.id } }).catch(() => 0),
    }))
  )
  const countMap = Object.fromEntries(counts.map((c) => [c.id, c]))

  return ok({
    connections: connections.map((c) => ({
      ...connectionView(c),
      orderCount: countMap[c.id]?.orderCount || 0,
      listingCount: countMap[c.id]?.listingCount || 0,
    })),
    liveConfigured,
    // True while the platform routes SP-API calls to Amazon's sandbox
    // (draft-app testing) — the dashboard badges this so nobody mistakes
    // Amazon's fixed sandbox test data for production data.
    sandboxMode,
  })
}

// POST — start connecting a marketplace account.
//   flow=oauth (default): returns the official Amazon authorization URL; the
//     browser redirects to Amazon for consent, then back to /api/marketplace/callback.
//   flow=refresh_token: self-authorization — the seller pastes the refresh
//     token generated in their own SP-API developer console. The token is
//     validated against LWA immediately, so only real authorizations connect.
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Unauthorized', 401)
  if (user.role !== 'CUSTOMER') return fail('Only customers can connect marketplace accounts', 403)

  const body = await req.json().catch(() => ({}))
  const marketplace = body.marketplace || 'amazon'
  if (marketplace !== 'amazon') {
    return fail('Only Amazon is available in Phase 1. Flipkart and Meesho are coming in a later phase.', 400)
  }

  const configured = await amazonLiveConfigured()
  if (!configured) {
    return fail(
      'The Amazon Selling Partner API app is not configured yet. The platform administrator must add the LWA app credentials under Admin → Integrations before accounts can be authorized.',
      400
    )
  }

  const existing = await db.marketplaceConnection.findUnique({
    where: { customerId_marketplace: { customerId: user.id, marketplace } },
  })
  if (existing && existing.status === 'CONNECTED') {
    return fail('Your Amazon account is already connected.', 409)
  }

  const flow = body.flow === 'refresh_token' ? 'refresh_token' : 'oauth'
  const provider = getProvider('amazon')

  if (flow === 'oauth') {
    const redirectUri = `${req.nextUrl.origin}/api/marketplace/callback`
    const state = await signOAuthState(user.id)
    try {
      const url = await provider.authorizeUrl({ customerId: user.id, redirectUri, state })
      return ok({ flow: 'oauth', authorizeUrl: url })
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Could not start Amazon authorization', 500)
    }
  }

  // flow=refresh_token (self-authorization)
  const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken.trim() : ''
  const sellerIdInput = typeof body.sellerId === 'string' ? body.sellerId.trim() : ''
  if (!refreshToken) return fail('Paste the refresh token generated in your SP-API developer console.', 400)

  try {
    const creds = await provider.refreshTokens({ refreshToken })
    const profile = await provider.fetchSellerProfile(creds)

    const data = {
      status: 'CONNECTED',
      sellerId: sellerIdInput || null,
      sellerName: profile.sellerName,
      region: profile.region,
      marketplaceIds: JSON.stringify(profile.marketplaceIds),
      accessToken: encryptToken(creds.accessToken),
      refreshToken: encryptToken(refreshToken),
      tokenExpiresAt: creds.expiresAt || null,
      authorizedAt: new Date(),
      lastSyncError: null,
      lastSyncAt: null,
      pendingReturnsReportId: null,
    }
    const connection = existing
      ? await db.marketplaceConnection.update({ where: { id: existing.id }, data })
      : await db.marketplaceConnection.create({ data: { customerId: user.id, marketplace, ...data } })

    const sync = await bootstrapConnection(connection.id)

    await logActivity(
      'MARKETPLACE_CONNECTED',
      `Amazon seller account connected via self-authorization refresh token (store: ${profile.sellerName})`,
      user.id
    )
    await notifyStaff(
      'Amazon account connected',
      `${user.name} connected their Amazon seller account "${profile.sellerName}" (self-authorization).`
    )

    return ok({
      flow: 'refresh_token',
      connection: connectionView(connection),
      sync,
      notice: sync.ok
        ? `Connected as "${profile.sellerName}". First sync completed: ${sync.ordersSynced} orders, ${sync.listingsSynced} listings.`
        : `Connected as "${profile.sellerName}", but the first sync reported issues: ${sync.message || sync.warnings?.join(' ') || 'unknown error'}`,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Amazon rejected this refresh token.'
    await logActivity('MARKETPLACE_CONNECT_ERROR', message.slice(0, 300), user.id)
    return fail(message, 400)
  }
}
