import type {
  MarketplaceProvider,
  MarketplaceOps,
  ProviderCredentials,
  NormalizedOrder,
  NormalizedSellerProfile,
} from './types'
import { getAmazonAppConfig } from './settings'
import { REGION_DEFAULT_MARKETPLACES, spApiFetch, mapWithConcurrency } from './sp-api/http'
import { lwaTokenRequest, lwaRevoke } from './sp-api/lwa'
import {
  normalizeOrder,
  getOrdersPage,
  fetchOrderItems,
  fetchOrderAddress,
  fetchOrderBuyerInfo,
  confirmShipment,
  fetchEligibleShippingServices,
} from './sp-api/orders'
import {
  searchListingsPage,
  getListingItem,
  patchListingInventory,
  fetchFbaInventory,
} from './sp-api/listings'
import { syncReturnsReportStep } from './sp-api/reports'

// ---------------------------------------------------------------------------
// Amazon Selling Partner API (SP-API) provider — the real integration.
//
// Authorization uses the official Login with Amazon (LWA) OAuth flow. Amazon
// seller passwords / OTPs are never collected or stored — only OAuth tokens,
// which the connection layer encrypts at rest (AES-256-GCM).
//
// The provider becomes active as soon as the platform admin saves the LWA app
// credentials (client id + secret) under Admin → Integrations. There is no
// demo/simulated mode: every connection is a real authorized seller account.
// ---------------------------------------------------------------------------

// Centralized SP-API app authorization (seller consent) endpoint.
function consentHost(region: string): string {
  const hosts: Record<string, string> = {
    NA: 'https://sellingpartnerapi-na.amazon.com',
    EU: 'https://sellingpartnerapi-eu.amazon.com',
    FE: 'https://sellingpartnerapi-fe.amazon.com',
  }
  return hosts[region] || hosts.EU
}

export function credentialsFromTokenResponse(
  token: { access_token: string; refresh_token?: string; expires_in: number },
  refreshTokenFallback?: string | null
): ProviderCredentials {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token || refreshTokenFallback || null,
    expiresAt: new Date(Date.now() + (token.expires_in || 3600) * 1000),
  }
}

export const amazonProvider: MarketplaceProvider = {
  marketplace: 'amazon',

  async isConfigured() {
    const cfg = await getAmazonAppConfig()
    return cfg.configured
  },

  async authorizeUrl({ redirectUri, state }) {
    const cfg = await getAmazonAppConfig()
    if (!cfg.clientId) throw new Error('The Amazon integration is not configured yet — the administrator must save the SP-API app credentials first.')
    // SP-API app authorization: the seller consents on Amazon's official page.
    const params = new URLSearchParams({
      application_id: cfg.clientId,
      state,
      redirect_uri: redirectUri,
    })
    return `${consentHost(cfg.region)}/apps/authorize?${params.toString()}`
  },

  async exchangeCode({ code }) {
    const cfg = await getAmazonAppConfig()
    if (!cfg.clientId || !cfg.clientSecret) throw new Error('The Amazon integration is not configured yet.')
    const token = await lwaTokenRequest({
      grant_type: 'authorization_code',
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    })
    return credentialsFromTokenResponse(token)
  },

  async refreshTokens({ refreshToken }) {
    const cfg = await getAmazonAppConfig()
    if (!cfg.clientId || !cfg.clientSecret) throw new Error('The Amazon integration is not configured yet.')
    const token = await lwaTokenRequest({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    })
    return credentialsFromTokenResponse(token, refreshToken)
  },

  async revoke({ token }) {
    const cfg = await getAmazonAppConfig()
    if (!cfg.clientId || !cfg.clientSecret) return
    const ok = await lwaRevoke(token, cfg.clientId, cfg.clientSecret)
    if (!ok) console.error('LWA revoke failed — local disconnect still proceeds and is audit-logged.')
  },

  async fetchSellerProfile(creds) {
    const cfg = await getAmazonAppConfig()
    const json = await spApiFetch<{
      payload?: Array<{ marketplace?: { id?: string; country?: string }; participating?: boolean; storeName?: string }>
    }>(
      { region: cfg.region, accessToken: creds.accessToken, sandbox: cfg.sandbox },
      '/sellers/v1/marketplaceParticipations',
      { requiredPermission: 'Sellers (Selling Partner Insights)', maxRetries: 1 }
    )
    const participating = (json?.payload || []).filter((p) => p.participating)
    const marketplaceIds = participating
      .map((p) => p.marketplace?.id)
      .filter((id): id is string => Boolean(id))
    const profile: NormalizedSellerProfile = {
      sellerId: null, // the real selling-partner id arrives via the OAuth redirect (selling_partner_id)
      sellerName: participating[0]?.storeName || 'Amazon Seller',
      region: cfg.region,
      marketplaceIds: marketplaceIds.length ? marketplaceIds : REGION_DEFAULT_MARKETPLACES[cfg.region] || [],
    }
    return profile
  },

  async fetchOrders({ creds, marketplaceIds, updatedAfter, createdAfter, maxPages = 10 }) {
    const cfg = await getAmazonAppConfig()
    const ctx = { region: cfg.region, accessToken: creds.accessToken, sandbox: cfg.sandbox }
    const ids = marketplaceIds.length ? marketplaceIds : REGION_DEFAULT_MARKETPLACES[cfg.region] || []
    const orders: NormalizedOrder[] = []

    let nextToken: string | null = null
    for (let page = 0; page < maxPages; page++) {
      const { orders: rawOrders, nextToken: nt } = await getOrdersPage(ctx, {
        marketplaceIds: ids,
        updatedAfter,
        createdAfter,
        nextToken,
      })
      for (const raw of rawOrders) orders.push(normalizeOrder(raw))
      nextToken = nt
      if (!nextToken) break
    }

    // Resolve line items with bounded concurrency to respect item-level rate
    // limits. Amazon throttles getOrderItems hard, so a single run resolves
    // items for the most recent orders; older rows backfill lazily when the
    // order is opened (the detail route fetches items live if missing).
    const byRecent = [...orders].sort(
      (a, b) => b.purchaseDate.getTime() - a.purchaseDate.getTime()
    )
    const ITEM_RESOLVE_CAP = 150
    const itemSet = new Set(byRecent.slice(0, ITEM_RESOLVE_CAP).map((o) => o.amazonOrderId))
    await mapWithConcurrency(orders, 3, async (order) => {
      if (!itemSet.has(order.amazonOrderId)) return
      try {
        order.items = await fetchOrderItems(ctx, order.amazonOrderId)
      } catch {
        // tolerate: PENDING orders may have no items yet on Amazon's side
      }
    })

    return orders
  },
}

// ---------------------------------------------------------------------------
// Amazon-specific extended operations (shipments, PII, listings, inventory,
// returns). Future marketplaces implement their own MarketplaceOps.
// ---------------------------------------------------------------------------

export const amazonOps: MarketplaceOps = {
  fetchOrderAddress: ({ creds, orderId }) => {
    return withCtx(creds, (ctx) => fetchOrderAddress(ctx, orderId))
  },

  fetchOrderBuyerInfo: ({ creds, orderId }) => {
    return withCtx(creds, (ctx) => fetchOrderBuyerInfo(ctx, orderId))
  },

  confirmShipment: ({ creds, orderId, marketplaceId, shipmentItems, carrierCode, trackingNumber, shipFromAddress }) => {
    return withCtx(creds, (ctx) =>
      confirmShipment(ctx, { orderId, marketplaceId, shipmentItems, carrierCode, trackingNumber, shipFromAddress })
    )
  },

  eligibleShippingServices: async (input) => {
    const services = await withCtx(input.creds, (ctx) =>
      fetchEligibleShippingServices(ctx, {
        orderId: input.orderId,
        shipFrom: input.shipFrom,
        packageDimensions: input.packageDimensions,
        weight: input.weight,
        shipmentItems: input.shipmentItems,
      })
    )
    return services.map((s) => s as unknown as Record<string, unknown>)
  },

  searchListings: async ({ creds, sellerId, marketplaceIds, pageToken }) => {
    const cfg = await getAmazonAppConfig()
    const ctx = { region: cfg.region, accessToken: creds.accessToken, sandbox: cfg.sandbox }
    return searchListingsPage(ctx, { sellerId, marketplaceIds, pageToken })
  },

  getListingItem: ({ creds, sellerId, sku, marketplaceId }) => {
    return withCtx(creds, (ctx) => getListingItem(ctx, { sellerId, sku, marketplaceId }))
  },

  patchListingInventory: ({ creds, sellerId, sku, marketplaceId, productType, quantity }) => {
    return withCtx(creds, (ctx) =>
      patchListingInventory(ctx, { sellerId, sku, marketplaceId, productType, quantity })
    )
  },

  fetchFbaInventory: ({ creds, marketplaceId }) => {
    return withCtx(creds, (ctx) => fetchFbaInventory(ctx, marketplaceId))
  },

  syncReturnsReport: (input) => {
    return withCtx(input.creds, (ctx) =>
      syncReturnsReportStep(ctx, {
        marketplaceId: input.marketplaceId,
        pendingReportId: input.pendingReportId,
        dataStart: input.dataStart,
        dataEnd: input.dataEnd,
      })
    )
  },
}

async function withCtx<T>(creds: ProviderCredentials, fn: (ctx: { region: string; accessToken: string; sandbox: boolean }) => Promise<T>): Promise<T> {
  const cfg = await getAmazonAppConfig()
  return fn({ region: cfg.region, accessToken: creds.accessToken, sandbox: cfg.sandbox })
}
