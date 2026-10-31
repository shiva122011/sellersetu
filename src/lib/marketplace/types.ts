// Marketplace integration architecture — Phase 1: Amazon Seller Central (real SP-API only).
//
// Every marketplace (Amazon today; Flipkart, Meesho tomorrow) plugs in through
// the MarketplaceProvider interface, so the customer dashboard, order cache
// and sync engine never need to change when new marketplaces are added.
//
// There is NO demo/simulated provider: every connection is a real authorized
// seller account and every dashboard number comes from the marketplace API.

export interface NormalizedOrderItem {
  orderItemId?: string | null // Amazon order item id — required for shipment confirmation
  asin?: string | null
  sellerSku?: string | null
  title: string
  quantityOrdered: number
  quantityShipped: number
  itemPrice?: number | null
  currency?: string | null
  condition?: string | null
}

export interface NormalizedOrder {
  amazonOrderId: string
  purchaseDate: Date
  lastUpdateDate?: Date | null
  orderStatus: string // PENDING | UNSHIPPED | PARTIALLY_SHIPPED | SHIPPED | CANCELED | UNFULFILLABLE | INVOICE_UNCONFIRMED
  fulfillmentChannel?: string | null // AFN (FBA) | MFN (merchant)
  salesChannel?: string | null
  shipServiceLevel?: string | null
  orderTotal?: number | null
  currency?: string | null
  numberOfItems?: number | null
  paymentMethod?: string | null
  shipCity?: string | null
  shipState?: string | null
  shipCountry?: string | null
  shipPostalCode?: string | null
  earliestShipDate?: Date | null
  latestShipDate?: Date | null
  earliestDeliveryDate?: Date | null
  latestDeliveryDate?: Date | null
  promiseDate?: Date | null
  carrier?: string | null
  trackingNumber?: string | null
  deliveryStatus?: string | null // only where the API actually provides delivery data
  canceledReason?: string | null
  isReturned?: boolean
  returnInfo?: string | null // JSON string
  items: NormalizedOrderItem[]
}

export interface NormalizedListingIssue {
  code?: string
  message: string
  severity: string // ERROR | WARNING | INFO
}

export interface NormalizedListing {
  sku: string
  asin?: string | null
  productName?: string | null
  status: string // ACTIVE | HAS_ISSUES | INACTIVE
  price?: number | null
  currency?: string | null
  quantity?: number | null
  reservedQuantity?: number | null
  inboundQuantity?: number | null
  fulfillmentChannel: 'MERCHANT' | 'AMAZON'
  issues: NormalizedListingIssue[]
}

export interface NormalizedSellerProfile {
  sellerId: string | null
  sellerName: string
  region: string
  marketplaceIds: string[]
}

export interface NormalizedReturnRow {
  amazonOrderId: string
  orderItemId?: string | null
  sku?: string | null
  asin?: string | null
  productName?: string | null
  quantity: number
  returnDate?: Date | null
  reason?: string | null
  disposition?: string | null
  status?: string | null
  comments?: string | null
}

export interface ProviderCredentials {
  accessToken: string
  refreshToken?: string | null
  expiresAt?: Date | null
}

/**
 * Contract every marketplace provider must implement.
 * authorizeUrl/exchangeCode/revoke apply to OAuth flows (Amazon LWA);
 * providers for other marketplaces adapt their own auth into this shape.
 * connectWithRefreshToken is optional — for marketplaces where a seller can
 * paste a token generated in their own developer console (self-authorization).
 */
export interface MarketplaceProvider {
  readonly marketplace: string

  /** True when the platform owner has configured the integration. */
  isConfigured(): Promise<boolean>

  /** Build the customer-facing OAuth authorization URL. */
  authorizeUrl(input: { customerId: string; redirectUri: string; state: string }): Promise<string>

  /** Exchange the OAuth authorization code for tokens. */
  exchangeCode(input: { code: string; redirectUri?: string }): Promise<ProviderCredentials>

  /** Refresh an expired access token (also validates refresh tokens). */
  refreshTokens(input: { refreshToken: string }): Promise<ProviderCredentials>

  /** Revoke consent server-side (disconnect). */
  revoke(input: { token: string }): Promise<void>

  /** Fetch the authorized seller's profile (name, marketplaces). */
  fetchSellerProfile(creds: ProviderCredentials): Promise<NormalizedSellerProfile>

  /** Fetch orders updated/purchased in the given window, with items resolved. */
  fetchOrders(input: {
    creds: ProviderCredentials
    marketplaceIds: string[]
    updatedAfter?: Date
    createdAfter?: Date
    maxPages?: number
  }): Promise<NormalizedOrder[]>
}

/**
 * Extended per-marketplace capabilities. Amazon implements all of them;
 * future marketplaces implement their equivalents or throw "not supported".
 */
export interface MarketplaceOps {
  /** Full shipping address of an order (restricted PII endpoint). */
  fetchOrderAddress(input: { creds: ProviderCredentials; orderId: string }): Promise<Record<string, unknown> | null>
  /** Buyer info of an order (restricted PII endpoint). */
  fetchOrderBuyerInfo(input: { creds: ProviderCredentials; orderId: string }): Promise<Record<string, unknown> | null>
  /** Confirm shipment to Amazon (real order mutation). */
  confirmShipment(input: {
    creds: ProviderCredentials
    orderId: string
    marketplaceId: string
    shipmentItems: Array<{ orderItemId: string; quantity: number }>
    carrierCode?: string
    trackingNumber?: string
    shipFromAddress?: Record<string, unknown> | null
  }): Promise<Record<string, unknown> | null>
  /** Retrieve real shipping service options for a merchant-fulfilled package. */
  eligibleShippingServices(input: {
    creds: ProviderCredentials
    orderId: string
    shipFrom: Record<string, unknown>
    packageDimensions: { length: number; width: number; height: number; unit: string }
    weight: { value: number; unit: string }
    shipmentItems: Array<{ orderItemId: string; quantity: number }>
  }): Promise<Array<Record<string, unknown>>>
  /** Search product listings (merchant offers). */
  searchListings(input: { creds: ProviderCredentials; sellerId: string; marketplaceIds: string[]; pageToken?: string }): Promise<{ items: NormalizedListing[]; nextToken?: string | null }>
  /** Fetch a single listing item (used to resolve productType before patching). */
  getListingItem(input: { creds: ProviderCredentials; sellerId: string; sku: string; marketplaceId: string }): Promise<{ productType?: string | null; attributes?: Record<string, unknown> | null }>
  /** Update merchant-fulfilled inventory quantity via the Listings Items API. */
  patchListingInventory(input: { creds: ProviderCredentials; sellerId: string; sku: string; marketplaceId: string; productType: string; quantity: number }): Promise<Record<string, unknown> | null>
  /** FBA inventory summaries. */
  fetchFbaInventory(input: { creds: ProviderCredentials; marketplaceId: string }): Promise<NormalizedListing[]>
  /** Create + poll + download the FBA customer returns report. Returns parsed rows. */
  syncReturnsReport(input: {
    creds: ProviderCredentials
    marketplaceId: string
    pendingReportId?: string | null
    dataStart: Date
    dataEnd: Date
  }): Promise<{ rows: NormalizedReturnRow[]; reportId: string | null; stillProcessing: boolean }>
}

// ---- shared status metadata for dashboards ----

export const MARKETPLACE_LABELS: Record<string, string> = {
  amazon: 'Amazon Seller Central',
  flipkart: 'Flipkart Seller Hub',
  meesho: 'Meesho Supplier Panel',
}

export const AMAZON_ORDER_STATUSES = [
  'PENDING',
  'UNSHIPPED',
  'PARTIALLY_SHIPPED',
  'SHIPPED',
  'CANCELED',
  'UNFULFILLABLE',
  'INVOICE_UNCONFIRMED',
] as const

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  UNSHIPPED: 'Unshipped',
  PARTIALLY_SHIPPED: 'Partially shipped',
  SHIPPED: 'Shipped',
  CANCELED: 'Cancelled',
  UNFULFILLABLE: 'Unfulfillable',
  INVOICE_UNCONFIRMED: 'Invoice unconfirmed',
}

export const ORDER_STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
  UNSHIPPED: 'bg-orange-100 text-orange-800 border-orange-200',
  PARTIALLY_SHIPPED: 'bg-violet-100 text-violet-800 border-violet-200',
  SHIPPED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  CANCELED: 'bg-red-100 text-red-700 border-red-200',
  UNFULFILLABLE: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  INVOICE_UNCONFIRMED: 'bg-stone-100 text-stone-600 border-stone-200',
}

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
}

export const DELIVERY_STATUS_BADGE: Record<string, string> = {
  IN_TRANSIT: 'bg-sky-100 text-sky-800 border-sky-200',
  OUT_FOR_DELIVERY: 'bg-teal-100 text-teal-800 border-teal-200',
  DELIVERED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
}

// ---------------------------------------------------------------------------
// Amazon SP-API permission map — every dashboard capability that depends on an
// extra app grant is declared here so the UI and error messages can point the
// seller/administrator at exactly what Amazon needs to approve.
// ---------------------------------------------------------------------------

export interface PermissionRequirement {
  key: string
  label: string
  role: string
  usedBy: string
}

export const AMAZON_PERMISSION_REQUIREMENTS: PermissionRequirement[] = [
  {
    key: 'orders',
    label: 'Orders',
    role: 'Order API — "Manage Orders" app grant',
    usedBy: 'Fetching orders, order items, order status and confirming shipments.',
  },
  {
    key: 'pii',
    label: 'Buyer & address (PII)',
    role: 'Restricted Information — "Personally Identifiable Information" grant + Data Kiosk/PII approval',
    usedBy: 'Showing buyer names, full shipping addresses and contact details on orders.',
  },
  {
    key: 'mfn',
    label: 'Merchant shipping options',
    role: 'Merchant Fulfillment API — "Amazon Fulfillment" app grant',
    usedBy: 'Retrieving real shipping service options and rates for self-ship orders.',
  },
  {
    key: 'listings',
    label: 'Listings',
    role: 'Product Listing API — "Product Listing" app grant',
    usedBy: 'Viewing listings, listing issues and updating inventory quantities.',
  },
  {
    key: 'inventory',
    label: 'FBA inventory',
    role: 'FBA Inventory API — "Amazon Fulfillment" app grant',
    usedBy: 'Showing Amazon-fulfilled (FBA) stock levels.',
  },
  {
    key: 'reports',
    label: 'Returns data',
    role: 'Reports API + "FBA Analytics" grant',
    usedBy: 'Downloading the FBA customer returns report for return reasons and statuses.',
  },
  {
    key: 'sellers',
    label: 'Seller profile',
    role: 'Sellers API — "Selling Partner Insights" grant',
    usedBy: 'Identifying your store name and the marketplaces you sell on.',
  },
]
