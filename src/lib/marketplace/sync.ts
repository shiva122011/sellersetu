import { db } from '@/lib/db'
import { logActivity, notifyUser, notifyStaff } from '@/lib/api-helpers'
import { encryptVaultPayload, decryptVaultPayload } from '@/lib/crypto'
import { amazonProvider, amazonOps } from './amazon'
import { getAutoSyncIntervalMinutes, getLowStockThreshold, isSandboxMode } from './settings'
import type { MarketplaceProvider, ProviderCredentials, NormalizedListing } from './types'

// ---------------------------------------------------------------------------
// Sync engine — pulls REAL marketplace data into the local cache.
//
//   Orders            Orders API v0 (incremental via LastUpdatedAfter watermark)
//   Listings          Listings Items API (merchant offers)
//   Inventory         FBA Inventory API (Amazon-fulfilled stock)
//   Returns           Reports API (FBA customer returns, async report flow)
//
// Dedup guarantee: orders/listings are upserted on stable natural keys, so
// repeated syncs never create duplicates. Shipment confirmations are guarded
// by ShipmentRecord rows (see the ship route).
//
// Watermark rule: lastSyncAt only advances on a successful orders sync — a
// failed run must not skip data, so the next run re-fetches the same window.
// ---------------------------------------------------------------------------

// Tokens are stored encrypted at rest: "<iv>:<authTag>:<cipherText>"
export function encryptToken(token: string): string {
  const { cipherText, iv, authTag } = encryptVaultPayload({ value: token })
  return `${iv}:${authTag}:${cipherText}`
}

export function encryptJson(value: unknown): string {
  const { cipherText, iv, authTag } = encryptVaultPayload({ json: JSON.stringify(value) })
  return `${iv}:${authTag}:${cipherText}`
}

export function decryptJson<T>(stored: string | null | undefined): T | null {
  if (!stored) return null
  const parts = stored.split(':')
  if (parts.length !== 3) return null
  try {
    const payload = decryptVaultPayload(parts[2], parts[0], parts[1]) as unknown as Record<string, unknown>
    if (typeof payload?.json !== 'string') return null
    return JSON.parse(payload.json) as T
  } catch {
    return null
  }
}

export function decryptToken(stored: string | null): string | null {
  if (!stored) return null
  const parts = stored.split(':')
  if (parts.length !== 3) return null
  try {
    const payload = decryptVaultPayload(parts[2], parts[0], parts[1]) as unknown as Record<string, unknown>
    return typeof payload?.value === 'string' ? payload.value : null
  } catch {
    return null
  }
}

export function getProvider(marketplace: string): MarketplaceProvider {
  if (marketplace === 'amazon') return amazonProvider
  throw new Error(`Marketplace "${marketplace}" is not supported yet. Flipkart and Meesho are planned for a later phase.`)
}

function getOps(marketplace: string) {
  if (marketplace === 'amazon') return amazonOps
  throw new Error(`Extended operations for "${marketplace}" are not supported yet.`)
}
export { getOps }

export class AuthExpiredError extends Error {
  constructor(message = 'The Amazon authorization has expired or was revoked. Please reconnect your seller account.') {
    super(message)
    this.name = 'AuthExpiredError'
  }
}

type ConnectionRow = {
  id: string
  marketplace: string
  status: string
  accessToken: string | null
  refreshToken: string | null
  tokenExpiresAt: Date | null
}

/** Returns fresh credentials, refreshing the access token when close to expiry. */
export async function ensureFreshCredentials(connection: ConnectionRow): Promise<ProviderCredentials> {
  const accessToken = decryptToken(connection.accessToken)
  const refreshToken = decryptToken(connection.refreshToken)
  if (!refreshToken) {
    throw new AuthExpiredError('Stored authorization is incomplete — please reconnect your account.')
  }
  const expiresSoon =
    !connection.tokenExpiresAt || connection.tokenExpiresAt.getTime() - Date.now() < 120 * 1000
  if (accessToken && !expiresSoon) {
    return { accessToken, refreshToken, expiresAt: connection.tokenExpiresAt }
  }
  const provider = getProvider(connection.marketplace)
  try {
    const refreshed = await provider.refreshTokens({ refreshToken })
    await db.marketplaceConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: encryptToken(refreshed.accessToken),
        refreshToken: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : connection.refreshToken,
        tokenExpiresAt: refreshed.expiresAt || null,
        status: 'CONNECTED',
      },
    })
    return refreshed
  } catch (e) {
    if (e instanceof Error && (e.name === 'LwaError' || /invalid_grant|expired|revoked/i.test(e.message))) {
      throw new AuthExpiredError()
    }
    throw e
  }
}

async function markExpired(connectionId: string, customerId: string) {
  await db.marketplaceConnection.update({
    where: { id: connectionId },
    data: { status: 'EXPIRED', lastSyncError: 'Authorization expired or revoked on Amazon — please reconnect.' },
  })
  await notifyUser(
    customerId,
    'Amazon authorization expired',
    'The connection to your Amazon seller account needs to be renewed. Open Amazon Orders and reconnect to continue syncing.'
  )
  await notifyStaff('Amazon authorization expired', 'A customer connection needs re-authorization (reconnect from their dashboard).')
}

// ------------------------------- orders sync --------------------------------

async function syncOrders(
  connection: { id: string; marketplace: string; lastSyncAt: Date | null },
  creds: ProviderCredentials,
  marketplaceIds: string[]
): Promise<number> {
  const provider = getProvider(connection.marketplace)
  const existing = await db.syncedOrder.findFirst({
    where: { connectionId: connection.id },
    orderBy: { lastUpdateDate: 'desc' },
    select: { lastUpdateDate: true },
  })

  // Incremental: fetch everything updated since the last successful sync,
  // with a 10-minute overlap to absorb clock drift. Initial run: 180 days.
  const updatedAfter = existing?.lastUpdateDate
    ? new Date(existing.lastUpdateDate.getTime() - 10 * 60 * 1000)
    : connection.lastSyncAt
      ? new Date(connection.lastSyncAt.getTime() - 10 * 60 * 1000)
      : undefined
  const createdAfter = updatedAfter ? undefined : new Date(Date.now() - 180 * 24 * 3600 * 1000)

  const fetched = await provider.fetchOrders({
    creds,
    marketplaceIds,
    updatedAfter,
    createdAfter,
  })

  let count = 0
  for (const order of fetched) {
    const prev = await db.syncedOrder.findUnique({
      where: { connectionId_amazonOrderId: { connectionId: connection.id, amazonOrderId: order.amazonOrderId } },
      select: { id: true, isReturned: true, returnInfo: true, shippingAddressJson: true, buyerInfoJson: true },
    })
    // Never clobber synced return/PII state with an empty fresh snapshot.
    const isReturned = order.isReturned || prev?.isReturned || false
    const returnInfo = order.returnInfo || prev?.returnInfo || null
    const data = {
      amazonOrderId: order.amazonOrderId,
      purchaseDate: order.purchaseDate,
      lastUpdateDate: order.lastUpdateDate || null,
      orderStatus: order.orderStatus,
      fulfillmentChannel: order.fulfillmentChannel || null,
      salesChannel: order.salesChannel || null,
      shipServiceLevel: order.shipServiceLevel || null,
      orderTotal: order.orderTotal ?? null,
      currency: order.currency || null,
      numberOfItems: order.numberOfItems ?? null,
      paymentMethod: order.paymentMethod || null,
      shipCity: order.shipCity || null,
      shipState: order.shipState || null,
      shipCountry: order.shipCountry || null,
      shipPostalCode: order.shipPostalCode || null,
      earliestShipDate: order.earliestShipDate || null,
      latestShipDate: order.latestShipDate || null,
      earliestDeliveryDate: order.earliestDeliveryDate || null,
      latestDeliveryDate: order.latestDeliveryDate || null,
      promiseDate: order.promiseDate || null,
      carrier: order.carrier || null,
      trackingNumber: order.trackingNumber || null,
      deliveryStatus: order.deliveryStatus || null,
      canceledReason: order.canceledReason || null,
      isReturned,
      returnInfo,
      shippingAddressJson: prev?.shippingAddressJson ?? null,
      buyerInfoJson: prev?.buyerInfoJson ?? null,
    }
    const saved = prev
      ? await db.syncedOrder.update({ where: { id: prev.id }, data })
      : await db.syncedOrder.create({ data: { ...data, connectionId: connection.id } })

    // Replace items (correct + small lists); keep item ids for shipment flows.
    await db.orderItem.deleteMany({ where: { orderId: saved.id } })
    if (order.items.length) {
      await db.orderItem.createMany({
        data: order.items.map((it) => ({
          orderId: saved.id,
          orderItemId: it.orderItemId || null,
          asin: it.asin || null,
          sellerSku: it.sellerSku || null,
          title: it.title,
          quantityOrdered: it.quantityOrdered,
          quantityShipped: it.quantityShipped,
          itemPrice: it.itemPrice ?? null,
          currency: it.currency || null,
          condition: it.condition || null,
        })),
      })
    }
    count++
  }
  return count
}

// ------------------------------ listings sync -------------------------------

async function upsertListing(
  connectionId: string,
  listing: NormalizedListing,
  lowStockThreshold: number
): Promise<'created' | 'updated'> {
  const prev = await db.listing.findUnique({
    where: { connectionId_sku_fulfillmentChannel: { connectionId, sku: listing.sku, fulfillmentChannel: listing.fulfillmentChannel } },
    select: { id: true, quantity: true, lowStockNotifiedAt: true },
  })
  const data = {
    asin: listing.asin || null,
    productName: listing.productName || null,
    status: listing.status,
    price: listing.price ?? null,
    currency: listing.currency || null,
    quantity: listing.quantity ?? null,
    reservedQuantity: listing.reservedQuantity ?? null,
    inboundQuantity: listing.inboundQuantity ?? null,
    issuesJson: listing.issues.length ? JSON.stringify(listing.issues) : null,
    updatedAt: new Date(),
  }
  const saved = prev
    ? await db.listing.update({ where: { id: prev.id }, data })
    : await db.listing.create({ data: { ...data, connectionId, sku: listing.sku, fulfillmentChannel: listing.fulfillmentChannel } })

  // Low / out-of-stock alert — at most once per day per SKU.
  const qty = listing.quantity ?? null
  if (qty !== null && qty <= lowStockThreshold) {
    const notifiedToday = prev?.lowStockNotifiedAt && Date.now() - prev.lowStockNotifiedAt.getTime() < 20 * 3600 * 1000
    if (!notifiedToday) {
      const conn = await db.marketplaceConnection.findUnique({
        where: { id: connectionId },
        select: { customerId: true, marketplace: true },
      })
      if (conn) {
        await notifyUser(
          conn.customerId,
          qty === 0 ? 'Out of stock on Amazon' : 'Low stock on Amazon',
          `${listing.productName || listing.sku} is ${qty === 0 ? 'OUT of stock' : `down to ${qty} unit(s)`}. Restock to keep selling.`
        )
      }
      await db.listing.update({ where: { id: saved.id }, data: { lowStockNotifiedAt: new Date() } })
    }
  }
  return prev ? 'updated' : 'created'
}

async function syncListings(
  connection: { id: string; marketplace: string },
  creds: ProviderCredentials,
  marketplaceIds: string[],
  sellerId: string | null
): Promise<{ count: number; warnings: string[] }> {
  const warnings: string[] = []
  const ops = getOps(connection.marketplace)
  const threshold = await getLowStockThreshold()
  if (!sellerId) {
    warnings.push('Listings skipped — seller id unknown until first authorization (OAuth redirect supplies it).')
    return { count: 0, warnings }
  }

  // Merchant offers via Listings Items search.
  let count = 0
  let pageToken: string | null = null
  let pages = 0
  try {
    do {
      const page = await ops.searchListings({ creds, sellerId, marketplaceIds, pageToken: pageToken || undefined })
      for (const listing of page.items) {
        await upsertListing(connection.id, listing, threshold)
        count++
      }
      pageToken = page.nextToken || null
      pages++
    } while (pageToken && pages < 25)
  } catch (e) {
    if (e instanceof Error && e.name === 'SpApiError' && e.message.includes('403')) {
      warnings.push('Listings unavailable — the SP-API app needs the Product Listing permission (403 from Amazon).')
    } else {
      warnings.push(`Listings sync issue: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  // FBA inventory merged in as AMAZON-channel rows.
  try {
    const fba = await ops.fetchFbaInventory({ creds, marketplaceId: marketplaceIds[0] })
    for (const listing of fba) {
      await upsertListing(connection.id, listing, threshold)
      count++
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'SpApiError' && e.message.includes('403')) {
      warnings.push('FBA inventory unavailable — the SP-API app needs the FBA Inventory permission (403 from Amazon).')
    } else {
      warnings.push(`FBA inventory sync issue: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  return { count, warnings }
}

// ------------------------------- returns sync -------------------------------

async function syncReturns(
  connection: { id: string; marketplace: string; pendingReturnsReportId: string | null },
  creds: ProviderCredentials,
  marketplaceIds: string[]
): Promise<{ count: number; warnings: string[] }> {
  const warnings: string[] = []
  const ops = getOps(connection.marketplace)
  try {
    const dataEnd = new Date()
    // Full-window snapshot each run (60 days) — simple + idempotent.
    const dataStart = new Date(Date.now() - 60 * 24 * 3600 * 1000)
    const step = await ops.syncReturnsReport({
      creds,
      marketplaceId: marketplaceIds[0],
      pendingReportId: connection.pendingReturnsReportId,
      dataStart,
      dataEnd,
    })

    if (step.stillProcessing) {
      await db.marketplaceConnection.update({
        where: { id: connection.id },
        data: { pendingReturnsReportId: step.reportId },
      })
      warnings.push('FBA returns report is still processing on Amazon — will be picked up on the next sync.')
      return { count: 0, warnings }
    }

    await db.marketplaceConnection.update({
      where: { id: connection.id },
      data: { pendingReturnsReportId: null },
    })

    if (step.rows.length === 0) return { count: 0, warnings }

    // Full replace for the connection (report is a full-window snapshot).
    await db.returnRecord.deleteMany({ where: { connectionId: connection.id } })
    const orderIds = [...new Set(step.rows.map((r) => r.amazonOrderId))]
    const linked = await db.syncedOrder.findMany({
      where: { connectionId: connection.id, amazonOrderId: { in: orderIds } },
      select: { id: true, amazonOrderId: true },
    })
    const orderMap = new Map(linked.map((o) => [o.amazonOrderId, o.id]))
    await db.returnRecord.createMany({
      data: step.rows.map((r) => ({
        connectionId: connection.id,
        orderId: orderMap.get(r.amazonOrderId) || null,
        amazonOrderId: r.amazonOrderId,
        orderItemId: r.orderItemId || null,
        sku: r.sku || null,
        asin: r.asin || null,
        productName: r.productName || null,
        quantity: r.quantity || 1,
        returnDate: r.returnDate || null,
        reason: r.reason || null,
        disposition: r.disposition || null,
        status: r.status || null,
        comments: r.comments || null,
      })),
    })

    // Reflect returns on cached orders.
    for (const r of step.rows) {
      const orderId = orderMap.get(r.amazonOrderId)
      if (!orderId) continue
      const info = {
        reason: r.reason,
        status: r.status,
        returnDate: r.returnDate ? r.returnDate.toISOString() : null,
        disposition: r.disposition,
        quantity: r.quantity,
        source: 'FBA customer returns report',
      }
      await db.syncedOrder.update({
        where: { id: orderId },
        data: { isReturned: true, returnInfo: JSON.stringify(info) },
      })
    }
    return { count: step.rows.length, warnings }
  } catch (e) {
    if (e instanceof Error && e.name === 'SpApiError' && e.message.includes('403')) {
      warnings.push('Returns data unavailable — the SP-API app needs the Reports + FBA Analytics permissions (403 from Amazon).')
    } else {
      warnings.push(`Returns sync issue: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
    return { count: 0, warnings }
  }
}

// ------------------------------ orchestrator --------------------------------

export interface SyncResult {
  ok: boolean
  status: 'SUCCESS' | 'ERROR' | 'PARTIAL' | 'SKIPPED'
  ordersSynced: number
  listingsSynced: number
  returnsSynced: number
  message?: string
  warnings?: string[]
  durationMs: number
}

export async function syncConnection(
  connectionId: string,
  trigger: 'MANUAL' | 'AUTO' | 'INITIAL' = 'MANUAL'
): Promise<SyncResult> {
  const startedAt = Date.now()
  const connection = await db.marketplaceConnection.findUnique({ where: { id: connectionId } })
  if (!connection) throw new Error('Connection not found')

  if (connection.status === 'EXPIRED') {
    return {
      ok: false, status: 'SKIPPED', ordersSynced: 0, listingsSynced: 0, returnsSynced: 0,
      message: 'Authorization expired — please reconnect your Amazon account to resume syncing.',
      durationMs: Date.now() - startedAt,
    }
  }

  const marketplaceIds: string[] = connection.marketplaceIds
    ? JSON.parse(connection.marketplaceIds)
    : []

  const warnings: string[] = []
  let ordersCount = 0
  let listingsCount = 0
  let returnsCount = 0
  let ordersOk = false
  let errorMessage: string | undefined

  // Sandbox annotation: while sandbox mode is on, every value comes from
  // Amazon's SP-API Sandbox (fixed canned test data). Recording it on every
  // sync keeps dashboards and sync history honest about the data source.
  if (await isSandboxMode()) {
    warnings.push('Sandbox mode: data comes from Amazon\'s SP-API Sandbox (fixed test data) — turn sandbox off under Admin → Integrations once the SP-API app is published for live data.')
  }

  try {
    const creds = await ensureFreshCredentials(connection)

    try {
      ordersCount = await syncOrders(connection, creds, marketplaceIds)
      ordersOk = true
    } catch (e) {
      if (e instanceof AuthExpiredError) throw e
      errorMessage = e instanceof Error ? e.message : 'Order sync failed'
    }

    try {
      const res = await syncListings(connection, creds, marketplaceIds, connection.sellerId)
      listingsCount = res.count
      warnings.push(...res.warnings)
    } catch (e) {
      warnings.push(`Listings sync issue: ${e instanceof Error ? e.message : 'unknown error'}`)
    }

    try {
      const res = await syncReturns(
        { id: connection.id, marketplace: connection.marketplace, pendingReturnsReportId: connection.pendingReturnsReportId },
        creds,
        marketplaceIds
      )
      returnsCount = res.count
      warnings.push(...res.warnings)
    } catch (e) {
      warnings.push(`Returns sync issue: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  } catch (e) {
    if (e instanceof AuthExpiredError) {
      await markExpired(connection.id, connection.customerId)
      await db.syncLog.create({
        data: {
          connectionId: connection.id,
          trigger,
          status: 'ERROR',
          message: 'Authorization expired — reconnect required.',
          durationMs: Date.now() - startedAt,
        },
      })
      return {
        ok: false, status: 'SKIPPED', ordersSynced: 0, listingsSynced: 0, returnsSynced: 0,
        message: e.message, durationMs: Date.now() - startedAt,
      }
    }
    errorMessage = e instanceof Error ? e.message : 'Sync failed'
  }

  const status: SyncResult['status'] = ordersOk
    ? warnings.length > 0 ? 'PARTIAL' : 'SUCCESS'
    : 'ERROR'

  // Watermark only advances when orders synced successfully.
  await db.marketplaceConnection.update({
    where: { id: connection.id },
    data: {
      ...(ordersOk ? { lastSyncAt: new Date() } : {}),
      lastSyncError: ordersOk ? null : (errorMessage || 'Sync failed'),
      status: ordersOk ? 'CONNECTED' : 'ERROR',
    },
  })

  await db.syncLog.create({
    data: {
      connectionId: connection.id,
      trigger,
      status,
      ordersSynced: ordersCount,
      listingsSynced: listingsCount,
      returnsSynced: returnsCount,
      message: ordersOk
        ? `${ordersCount} orders · ${listingsCount} listings · ${returnsCount} returns in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`
        : (errorMessage || 'Sync failed'),
      warnings: warnings.length ? JSON.stringify(warnings) : null,
      durationMs: Date.now() - startedAt,
    },
  })

  if (!ordersOk) {
    // Notify only on the first failure of a streak (avoid notification spam).
    if (connection.lastSyncError === null && trigger === 'AUTO') {
      await notifyUser(
        connection.customerId,
        'Amazon sync failed',
        `The last automatic synchronization could not complete: ${errorMessage}. Data may be out of date — try "Sync now", or reconnect if authorization expired.`
      )
    }
    await logActivity(
      'MARKETPLACE_SYNC_ERROR',
      `${connection.marketplace} sync failed: ${errorMessage}`,
      connection.customerId
    )
  }

  return {
    ok: ordersOk,
    status,
    ordersSynced: ordersCount,
    listingsSynced: listingsCount,
    returnsSynced: returnsCount,
    message: ordersOk ? undefined : errorMessage,
    warnings: warnings.length ? warnings : undefined,
    durationMs: Date.now() - startedAt,
  }
}

/** Initial connection bootstrap used right after authorization. */
export async function bootstrapConnection(connectionId: string): Promise<SyncResult> {
  return syncConnection(connectionId, 'INITIAL')
}

/** Auto-sync: every active connection whose watermark is older than the configured interval. */
export async function syncDueConnections(): Promise<void> {
  const intervalMinutes = await getAutoSyncIntervalMinutes()
  const cutoff = Date.now() - intervalMinutes * 60 * 1000
  const due = await db.marketplaceConnection.findMany({
    where: {
      autoSyncEnabled: true,
      status: { in: ['CONNECTED', 'ERROR'] },
      OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(cutoff) } }],
    },
    select: { id: true },
  })
  for (const c of due) {
    try {
      await syncConnection(c.id, 'AUTO')
    } catch (e) {
      console.error(`Auto-sync failed for connection ${c.id}:`, e)
    }
  }
}

/** True when the admin has real SP-API app credentials configured. */
export async function amazonLiveConfigured(): Promise<boolean> {
  const provider = getProvider('amazon')
  return provider.isConfigured()
}
