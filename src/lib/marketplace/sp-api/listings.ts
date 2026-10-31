// ---------------------------------------------------------------------------
// SP-API Listings Items 2021-06-30 + FBA Inventory — real product listing and
// stock data, plus the inventory quantity update operation (an authorized
// PATCH against the seller's actual offer — never simulated).
// ---------------------------------------------------------------------------

import { spApiFetch, type SpApiContext } from './http'
import type { NormalizedListing, NormalizedListingIssue } from '../types'

interface SearchListingsResponse {
  items?: Array<{
    sku?: string
    productType?: string
    summaries?: Array<{
      marketplaceId?: string
      asin?: string
      itemName?: string
      brand?: string
      conditionType?: string
      listingsPrice?: { amount?: number | string; currencyCode?: string }
    }>
    issues?: Array<{ code?: string; message?: string; severity?: string }>
    attributes?: Record<string, unknown>
  }>
  pagination?: { nextToken?: string }
}

function merchantQuantity(attributes: Record<string, unknown> | undefined): number | null {
  if (!attributes) return null
  const fa = attributes.fulfillment_availability as
    | Array<{ fulfillment_channel?: string; quantity?: number }>
    | undefined
  if (!Array.isArray(fa)) return null
  const entry = fa.find((f) => f.fulfillment_channel === 'DEFAULT') || fa[0]
  return typeof entry?.quantity === 'number' ? entry.quantity : null
}

/** GET /listings/2021-06-30/items/{sellerId} — one page of merchant offers. */
export async function searchListingsPage(
  ctx: SpApiContext,
  input: { sellerId: string; marketplaceIds: string[]; pageToken?: string | null; pageSize?: number }
): Promise<{ items: NormalizedListing[]; nextToken: string | null }> {
  const json = await spApiFetch<SearchListingsResponse>(
    ctx,
    `/listings/2021-06-30/items/${encodeURIComponent(input.sellerId)}`,
    {
      query: {
        marketplaceIds: input.marketplaceIds.join(','),
        includedData: 'summaries,issues,attributes',
        pageSize: input.pageSize || 20,
        pageToken: input.pageToken || undefined,
      },
      requiredPermission: 'Listings (Product Listing)',
    }
  )
  const items: NormalizedListing[] = []
  for (const it of json?.items || []) {
    if (!it.sku) continue
    const issues: NormalizedListingIssue[] = (it.issues || []).map((i) => ({
      code: i.code,
      message: i.message || 'Listing issue',
      severity: (i.severity || 'INFO').toUpperCase(),
    }))
    const summary = it.summaries?.[0]
    const priceRaw = summary?.listingsPrice?.amount
    const price = priceRaw !== undefined ? parseFloat(String(priceRaw)) : null
    const hasErrors = issues.some((i) => i.severity === 'ERROR')
    items.push({
      sku: it.sku,
      asin: summary?.asin || null,
      productName: summary?.itemName || null,
      status: hasErrors ? 'HAS_ISSUES' : 'ACTIVE',
      price: price !== null && !isNaN(price) ? price : null,
      currency: summary?.listingsPrice?.currencyCode || null,
      quantity: merchantQuantity(it.attributes),
      reservedQuantity: null,
      inboundQuantity: null,
      fulfillmentChannel: 'MERCHANT',
      issues,
    })
  }
  return { items, nextToken: json?.pagination?.nextToken || null }
}

/** GET /listings/2021-06-30/items/{sellerId}/{sku} — single item (productType for patches). */
export async function getListingItem(
  ctx: SpApiContext,
  input: { sellerId: string; sku: string; marketplaceId: string }
): Promise<{ productType: string | null; attributes: Record<string, unknown> | null }> {
  const json = await spApiFetch<{ sku?: string; productType?: string; attributes?: Record<string, unknown> }>(
    ctx,
    `/listings/2021-06-30/items/${encodeURIComponent(input.sellerId)}/${encodeURIComponent(input.sku)}`,
    {
      query: {
        marketplaceIds: input.marketplaceId,
        includedData: 'summaries,attributes',
      },
      requiredPermission: 'Listings (Product Listing)',
      maxRetries: 1,
    }
  )
  return {
    productType: json?.productType || null,
    attributes: json?.attributes || null,
  }
}

/**
 * PATCH /listings/2021-06-30/items/{sellerId}/{sku} — update the live
 * merchant-fulfilled inventory quantity on Amazon.
 */
export async function patchListingInventory(
  ctx: SpApiContext,
  input: { sellerId: string; sku: string; marketplaceId: string; productType: string; quantity: number }
): Promise<Record<string, unknown> | null> {
  return spApiFetch<Record<string, unknown>>(
    ctx,
    `/listings/2021-06-30/items/${encodeURIComponent(input.sellerId)}/${encodeURIComponent(input.sku)}`,
    {
      method: 'PATCH',
      query: {
        marketplaceIds: input.marketplaceId,
        issueLocale: 'en_IN',
      },
      body: {
        productType: input.productType,
        patches: [
          {
            op: 'replace',
            path: '/attributes/fulfillment_availability',
            value: [{ fulfillment_channel: 'DEFAULT', quantity: input.quantity }],
          },
        ],
      },
      requiredPermission: 'Listings (Product Listing)',
      maxRetries: 1,
    }
  )
}

interface FbaInventoryResponse {
  payload?: {
    inventorySummaries?: Array<{
      asin?: string
      sellerSku?: string
      itemName?: string
      totalQuantity?: number
      fulfillableQuantity?: number
      reservedQuantity?: { totalReservedQuantity?: number }
      inboundWorkingQuantity?: number
      inboundShippedQuantity?: number
    }>
  }
}

/** GET /fba/inventory/v1/summaries — Amazon-fulfilled stock levels. */
export async function fetchFbaInventory(
  ctx: SpApiContext,
  marketplaceId: string
): Promise<NormalizedListing[]> {
  const json = await spApiFetch<FbaInventoryResponse>(ctx, '/fba/inventory/v1/summaries', {
    query: {
      granularityType: 'Marketplace',
      granularityId: marketplaceId,
      marketplaceIds: marketplaceId,
      details: true,
    },
    requiredPermission: 'FBA Inventory (Amazon Fulfillment)',
    maxRetries: 1,
  })
  const out: NormalizedListing[] = []
  for (const s of json?.payload?.inventorySummaries || []) {
    if (!s.sellerSku) continue
    out.push({
      sku: s.sellerSku,
      asin: s.asin || null,
      productName: s.itemName || null,
      status: 'ACTIVE',
      price: null,
      currency: null,
      quantity: s.totalQuantity ?? s.fulfillableQuantity ?? 0,
      reservedQuantity: s.reservedQuantity?.totalReservedQuantity ?? 0,
      inboundQuantity: (s.inboundWorkingQuantity || 0) + (s.inboundShippedQuantity || 0),
      fulfillmentChannel: 'AMAZON',
      issues: [],
    })
  }
  return out
}
