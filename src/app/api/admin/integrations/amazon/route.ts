import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity } from '@/lib/api-helpers'
import { getAmazonAppConfig, setAmazonAppConfig, setAmazonOpsSettings, maskSecret, getAutoSyncIntervalMinutes, getLowStockThreshold, isSandboxMode } from '@/lib/marketplace/settings'

// Admin configuration for the Amazon SP-API integration (Phase 1).
// GET  — current config (secrets masked), connected-customer health summary
// PUT  — save LWA app credentials / region / auto-sync settings
//
// The integration only runs when real LWA app credentials are configured.
// There is no demo mode anywhere in the system.

const REQUIREMENT_NOTE =
  'Live integration requires: 1) a Developer Profile approved by Amazon, 2) an SP-API app with the Authorize Selling Partner App grant, 3) the OAuth redirect URL below whitelisted on the app, 4) the role grants listed under "Required Amazon permissions".'

export async function GET() {
  const user = await getSessionUser()
  if (!user || !['ADMIN', 'TEAM'].includes(user.role)) return fail('Unauthorized', 401)

  const cfg = await getAmazonAppConfig()
  const [autoSyncIntervalMinutes, lowStockThreshold] = await Promise.all([
    getAutoSyncIntervalMinutes(),
    getLowStockThreshold(),
  ])
  const sandboxMode = await isSandboxMode()

  const connections = await db.marketplaceConnection.findMany({
    orderBy: { createdAt: 'desc' },
    include: { customer: { select: { id: true, name: true, email: true, company: true } } },
  })
  const counts = await Promise.all(
    connections.map(async (c) => ({
      id: c.id,
      orders: await db.syncedOrder.count({ where: { connectionId: c.id } }),
      listings: await db.listing.count({ where: { connectionId: c.id } }).catch(() => 0),
      lastSync: c.lastSyncAt,
      lastError: c.lastSyncError,
    }))
  )
  const countMap = Object.fromEntries(counts.map((c) => [c.id, c]))

  return ok({
    config: {
      clientId: cfg.clientId || '',
      clientSecretMasked: maskSecret(cfg.clientSecret),
      hasSecret: Boolean(cfg.clientSecret),
      region: cfg.region,
      configured: cfg.configured,
      sandboxMode,
    },
    opsSettings: { autoSyncIntervalMinutes, lowStockThreshold },
    redirectUriNote: '/api/marketplace/callback',
    requirementNote: REQUIREMENT_NOTE,
    connections: connections.map((c) => ({
      id: c.id,
      marketplace: c.marketplace,
      status: c.status,
      sellerName: c.sellerName,
      sellerId: c.sellerId,
      authorizedAt: c.authorizedAt,
      lastSyncAt: c.lastSyncAt,
      lastSyncError: c.lastSyncError,
      orderCount: countMap[c.id]?.orders || 0,
      listingCount: countMap[c.id]?.listings || 0,
      customer: c.customer,
    })),
  })
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Unauthorized', 401)
  if (user.role !== 'ADMIN') return fail('Only administrators can change integration settings', 403)

  const body = await req.json().catch(() => ({}))
  const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : undefined
  const clientSecret = typeof body.clientSecret === 'string' ? body.clientSecret : undefined
  const region = typeof body.region === 'string' ? body.region : undefined
  const autoSyncIntervalMinutes = typeof body.autoSyncIntervalMinutes === 'number' ? body.autoSyncIntervalMinutes : undefined
  const lowStockThreshold = typeof body.lowStockThreshold === 'number' ? body.lowStockThreshold : undefined
  const sandbox = typeof body.sandboxMode === 'boolean' ? body.sandboxMode : undefined

  if (clientSecret !== undefined && clientSecret !== '' && clientSecret.length < 8) {
    return fail('Client secret looks too short to be valid.', 400)
  }

  await setAmazonAppConfig(
    {
      clientId,
      // empty string = keep existing secret; explicit null clears it
      clientSecret: clientSecret === '' ? undefined : clientSecret === '__CLEAR__' ? null : clientSecret,
      region,
      sandbox,
    },
    user.id
  )
  await setAmazonOpsSettings({ autoSyncIntervalMinutes, lowStockThreshold }, user.id)

  const cfg = await getAmazonAppConfig()
  const sandboxNow = await isSandboxMode()
  await logActivity(
    'INTEGRATION_SETTINGS_UPDATED',
    `Amazon SP-API integration settings updated (credentials configured: ${cfg.configured ? 'yes' : 'no'}, sandbox mode: ${sandboxNow ? 'on' : 'off'})`,
    user.id
  )

  const [autoSyncIntervalMinutes2, lowStockThreshold2] = await Promise.all([
    getAutoSyncIntervalMinutes(),
    getLowStockThreshold(),
  ])

  return ok({
    config: {
      clientId: cfg.clientId || '',
      clientSecretMasked: maskSecret(cfg.clientSecre…6137 tokens truncated…tus', 400)

    const data: Record<string, unknown> = {
      status,
      reviewNote: body.reviewNote !== undefined ? String(body.reviewNote || '') : profile.reviewNote,
    }
    if (status === 'APPROVED') {
      data.approvedById = admin.id
      data.approvedAt = new Date()
    }
    const updated = await db.vendorProfile.update({ where: { id }, data, include: { user: { select: { id: true, name: true, email: true } } } })

    const messages: Record<string, string> = {
      APPROVED: 'Your vendor account is approved. You can now receive project assignments and direct-connection requests.',
      REJECTED: `Your vendor application was not approved.${body.reviewNote ? ' Note: ' + String(body.reviewNote) : ''}`,
      SUSPENDED: `Your vendor account has been suspended.${body.reviewNote ? ' Note: ' + String(body.reviewNote) : ''}`,
      PENDING: 'Your vendor account was moved back to review.',
    }
    await notifyUser(profile.userId, 'Vendor account update', messages[status] || 'Your vendor status changed.', null, 'VENDOR')
    await logActivity('VENDOR_STATUS_CHANGED', `Vendor "${profile.businessName}" → ${status}`, admin.id, null)
    return ok({ vendor: updated })
  } catch (e) {
    console.error('vendor update failed', e)
    return fail('Failed to update vendor', 500)
  }
}
