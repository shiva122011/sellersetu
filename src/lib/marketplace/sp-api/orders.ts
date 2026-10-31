// ---------------------------------------------------------------------------
// SP-API Orders v0 — real order data, order items, restricted PII (address /
// buyer info via Restricted Data Tokens), shipment confirmation, and the
// Merchant Fulfillment (MFN) eligible shipping services lookup.
//
// Every mutation (shipment confirmation) hits the real Amazon endpoint —
// nothing is simulated, and failures are surfaced verbatim to the dashboard.
// ---------------------------------------------------------------------------

import { spApiFetch, type SpApiContext } from './http'
import type { NormalizedOrder, NormalizedOrderItem } from '../types'

interface RawOrder {
  AmazonOrderId: string
  PurchaseDate?: string
  LastUpdateDate?: string
  OrderStatus?: string
  FulfillmentChannel?: string
  SalesChannel?: string
  ShipServiceLevel?: string
  OrderTotal?: { Amount?: string; CurrencyCode?: string }
  NumberOfItemsShipped?: number
  NumberOfItemsUnshipped?: number
  PaymentMethod?: string
  ShippingAddress?: { City?: string; StateOrRegion?: string; CountryCode?: string; PostalCode?: string }
  EarliestShipDate?: string
  LatestShipDate?: string
  EarliestDeliveryDate?: string
  LatestDeliveryDate?: string
  PromiseDate?: string
  CanceledReason?: string
}

interface RawOrderItem {
  OrderItemId?: string
  ASIN?: string
  SellerSKU?: string
  Title?: string
  QuantityOrdered?: number
  QuantityShipped?: number
  ItemPrice?: { Amount?: string; CurrencyCode?: string }
  Condition?: string
}

function toDate(v?: string): Date | null {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

export function normalizeOrder(raw: RawOrder): NormalizedOrder {
  return {
    amazonOrderId: raw.AmazonOrderId,
    purchaseDate: toDate(raw.PurchaseDate) || new Date(),
    lastUpdateDate: toDate(raw.LastUpdateDate),
    orderStatus: raw.OrderStatus || 'PENDING',
    fulfillmentChannel: raw.FulfillmentChannel || null,
    salesChannel: raw.SalesChannel || null,
    shipServiceLevel: raw.ShipServiceLevel || null,
    orderTotal: raw.OrderTotal?.Amount ? parseFloat(raw.OrderTotal.Amount) : null,
    currency: raw.OrderTotal?.CurrencyCode || null,
    numberOfItems: (raw.NumberOfItemsShipped || 0) + (raw.NumberOfItemsUnshipped || 0) || null,
    paymentMethod: raw.PaymentMethod || null,
    shipCity: raw.ShippingAddress?.City || null,
    shipState: raw.ShippingAddress?.StateOrRegion || null,
    shipCountry: raw.ShippingAddress?.CountryCode || null,
    shipPostalCode: raw.ShippingAddress?.PostalCode || null,
    earliestShipDate: toDate(raw.EarliestShipDate),
    latestShipDate: toDate(raw.LatestShipDate),
    earliestDeliveryDate: toDate(raw.EarliestDeliveryDate),
    latestDeliveryDate: toDate(raw.LatestDeliveryDate),
    promiseDate: toDate(raw.PromiseDate),
    carrier: null,
    trackingNumber: null,
    // Amazon does not expose delivery milestones on the Orders API — tracking
    // numbers arrive via order items / shipment flows; delivery status only
    // via notifications. Never invented here.
    deliveryStatus: null,
    canceledReason: raw.CanceledReason || null,
    isReturned: false,
    returnInfo: null,
    items: [],
  }
}

/** GET /orders/v0/orders — one page (caller follows NextToken). */
export async function getOrdersPage(
  ctx: SpApiContext,
  params: {
    marketplaceIds: string[]
    updatedAfter?: Date
    createdAfter?: Date
    nextToken?: string | null
  }
): Promise<{ orders: RawOrder[]; nextToken: string | null }> {
  const query: Record<string, string> = { MarketplaceIds: params.marketplaceIds.join(',') }
  if (params.nextToken) {
    query.NextToken = params.nextToken
  } else {
    if (params.updatedAfter) query.LastUpdatedAfter = params.updatedAfter.toISOString()
    if (params.createdAfter) query.CreatedAfter = params.createdAfter.toISOString()
  }
  const json = await spApiFetch<{ payload?: { Orders?: RawOrder[]; NextToken?: string } }>(
    ctx,
    '/orders/v0/orders',
    { query, requiredPermission: 'Order (Manage Orders)' }
  )
  return {
    orders: json?.payload?.Orders || [],
    nextToken: json?.payload?.NextToken || null,
  }
}

/** GET /orders/v0/orders/{orderId}/orderItems — follows NextToken pagination. */
export async function fetchOrderItems(ctx: SpApiContext, orderId: string): Promise<NormalizedOrderItem[]> {
  const items: NormalizedOrderItem[] = []
  let nextToken: string | null = null
  for (let page = 0; page < 5; page++) {
    const query: Record<string, string> = {}
    if (nextToken) query.NextToken = nextToken
    const json = await spApiFetch<{ payload?: { OrderItems?: RawOrderItem[]; NextToken?: string } }>(
      ctx,
      `/orders/v0/orders/${encodeURIComponent(orderId)}/orderItems`,
      { query, requiredPermission: 'Order (Manage Orders)' }
    )
    for (const it of json?.payload?.OrderItems || []) {
      items.push({
        orderItemId: it.OrderItemId || null,
        asin: it.ASIN || null,
        sellerSku: it.SellerSKU || null,
        title: it.Title || 'Item',
        quantityOrdered: it.QuantityOrdered ?? 1,
        quantityShipped: it.QuantityShipped ?? 0,
        itemPrice: it.ItemPrice?.Amount ? parseFloat(it.ItemPrice.Amount) : null,
        currency: it.ItemPrice?.CurrencyCode || null,
        condition: it.Condition || null,
      })
    }
    nextToken = json?.payload?.NextToken || null
    if (!nextToken) break
  }
  return items
}

// ------------------------- Restricted Data Tokens ---------------------------

interface RdtResponse {
  payload?: { restrictedDataToken?: string; expiresAt?: string }
}

/**
 * Obtain a Restricted Data Token for PII endpoints. Amazon only issues these
 * when the app holds the "Personally Identifiable Information" grant.
 */
async function getRestrictedDataToken(
  ctx: SpApiContext,
  resources: Array<{ method: string; path: string; dataElement: string }>
): Promise<string> {
  const json = await spApiFetch<RdtResponse>(ctx, '/tokens/2021-06-30/restrictedDataToken', {
    method: 'POST',
    body: { restrictedResources: resources },
    requiredPermission: 'Restricted Information (Personally Identifiable Information)',
    maxRetries: 1,
  })
  const token = json?.payload?.restrictedDataToken
  if (!token) {
    throw new Error('Amazon did not return a Restricted Data Token — PII access may not be approved for this app.')
  }
  return token
}

export async function fetchOrderAddress(
  ctx: SpApiContext,
  orderId: string
): Promise<Record<string, unknown> | null> {
  const rdt = await getRestrictedDataToken(ctx, [
    { method: 'GET', path: `/orders/v0/orders/${orderId}/address`, dataElement: 'shippingAddress' },
  ])
  const json = await spApiFetch<{ payload?: Record<string, unknown> }>(
    ctx,
    `/orders/v0/orders/${encodeURIComponent(orderId)}/address`,
    {
      accessToken: rdt,
      requiredPermission: 'Restricted Information (Personally Identifiable Information)',
      maxRetries: 1,
    }
  )
  return json?.payload || null
}

export async function fetchOrderBuyerInfo(
  ctx: SpApiContext,
  orderId: string
): Promise<Record<string, unknown> | null> {
  const rdt = await getRestrictedDataToken(ctx, [
    { method: 'GET', path: `/orders/v0/orders/${orderId}/buyerInfo`, dataElement: 'buyerInfo' },
  ])
  const json = await spApiFetch<{ payload?: Record<string, unknown> }>(
    ctx,
    `/orders/v0/orders/${encodeURIComponent(orderId)}/buyerInfo`,
    {
      accessToken: rdt,
      requiredPermission: 'Restricted Information (Personally Identifiable Information)',
      maxRetries: 1,
    }
  )
  return json?.payload || null
}

// --------------------------- Shipment confirmation ---------------------------

/**
 * POST /orders/v0/orders/{orderId}/shipmentConfirmation — the real, official
 * operation that marks a merchant-fulfilled order as shipped on Amazon.
 */
export async function confirmShipment(
  ctx: SpApiContext,
  input: {
    orderId: string
    marketplaceId: string
    shipmentItems: Array<{ orderItemId: string; quantity: number }>
    carrierCode?: string
    trackingNumber?: string
    shipFromAddress?: Record<string, unknown> | null
  }
): Promise<Record<string, unknown> | null> {
  const shipment: Record<string, unknown> = {
    shipmentItems: input.shipmentItems.map((i) => ({
      orderItemId: i.orderItemId,
      quantity: i.quantity,
    })),
  }
  const packageDetail: Record<string, unknown> = {
    packageReferenceId: `PKG-${Date.now().toString(36).toUpperCase()}`,
    estimatedShipDate: Date.now(),
  }
  if (input.carrierCode) packageDetail.carrierCode = input.carrierCode
  if (input.trackingNumber) packageDetail.trackingNumber = input.trackingNumber
  if (input.shipFromAddress) packageDetail.shipFromAddress = input.shipFromAddress
  shipment.packageDetail = packageDetail

  return spApiFetch<Record<string, unknown>>(
    ctx,
    `/orders/v0/orders/${encodeURIComponent(input.orderId)}/shipmentConfirmation`,
    {
      method: 'POST',
      body: { marketplaceId: input.marketplaceId, shipment },
      requiredPermission: 'Order (Manage Orders)',
      maxRetries: 1,
    }
  )
}

// --------------------- Merchant Fulfillment shipping options -----------------

export interface MfnEligibleService {
  shippingServiceId?: string
  serviceName?: string
  carrierName?: string
  rateAmount?: number
  rateCurrency?: string
  deliveryExperience?: string
  earliestEstimatedDeliveryDate?: string | null
  latestEstimatedDeliveryDate?: string | null
  availableDeliveryExperience?: string[]
  raw: Record<string, unknown>
}

/**
 * POST /mfn/v0/eligibleShippingServices — real shipping service options and
 * rates for a merchant-fulfilled package (requires the Amazon Fulfillment
 * grant; a 403 is surfaced with that requirement).
 */
export async function fetchEligibleShippingServices(
  ctx: SpApiContext,
  input: {
    orderId: string
    shipFrom: Record<string, unknown>
    packageDimensions: { length: number; width: number; height: number; unit: string }
    weight: { value: number; unit: string }
    shipmentItems: Array<{ orderItemId: string; quantity: number }>
  }
): Promise<MfnEligibleService[]> {
  const json = await spApiFetch<{
    payload?: {
      EligibleShippingServices?: Array<{
        ShippingService?: {
          ShippingServiceId?: string
          ShippingServiceName?: string
          CarrierName?: string
          Rate?: { Amount?: number | string; CurrencyCode?: string }
          DeliveryExperience?: string
          EarliestEstimatedDeliveryDate?: string
          LatestEstimatedDeliveryDate?: string
          AvailableDeliveryExperiences?: string[]
        }
      }>
    }
  }>(ctx, '/mfn/v0/eligibleShippingServices', {
    method: 'POST',
    body: {
      ShipmentRequestDetails: {
        AmazonOrderId: input.orderId,
        ShipFromAddress: input.shipFrom,
        PackageDimensions: {
          Length: input.packageDimensions.length,
          Width: input.packageDimensions.width,
          Height: input.packageDimensions.height,
          Unit: input.packageDimensions.unit,
        },
        Weight: { Value: input.weight.value, Unit: input.weight.unit },
        Items: input.shipmentItems.map((i) => ({ OrderItemId: i.orderItemId, Quantity: i.quantity })),
      },
      ShippingOfferingFilter: {
        IncludeFlexibleShippingServices: true,
        IncludeUnqualifiedShippingServices: false,
      },
    },
    requiredPermission: 'Merchant Fulfillment (Amazon Fulfillment)',
    maxRetries: 1,
  })
  return (json?.payload?.EligibleShippingServices || []).map((s) => {
    const svc = s.ShippingService || {}
    const rateAmount = svc.Rate?.Amount !== undefined ? parseFloat(String(svc.Rate.Amount)) : undefined
    return {
      shippingServiceId: svc.ShippingServiceId,
      serviceName: svc.ShippingServiceName,
      carrierName: svc.CarrierName,
      rateAmount: isNaN(rateAmount as number) ? undefined : rateAmount,
      rateCurrency: svc.Rate?.CurrencyCode,
      deliveryExperience: svc.DeliveryExperience,
      earliestEstimatedDeliveryDate: svc.EarliestEstimatedDeliveryDate || null,
      latestEstimatedDeliveryDate: svc.LatestEstimatedDeliveryDate || null,
      availableDeliveryExperience: svc.AvailableDeliveryExperiences || [],
      raw: s as Record<string, unknown>,
    }
  })
}
