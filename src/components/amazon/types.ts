// Shared client-side types for the Amazon (SP-API) seller dashboard.

export interface ApiConnection {
  id: string
  marketplace: string
  marketplaceLabel: string
  status: string
  sellerId?: string | null
  sellerName?: string | null
  region?: string | null
  autoSyncEnabled?: boolean
  authorizedAt?: string | null
  lastSyncAt?: string | null
  lastSyncError?: string | null
  orderCount: number
  listingCount?: number
  createdAt: string
}

export interface ApiOrderItem {
  id: string
  orderItemId?: string | null
  title: string
  sellerSku?: string | null
  asin?: string | null
  quantityOrdered: number
  quantityShipped: number
  itemPrice?: number | null
  currency?: string | null
}

export interface ApiShipmentRecord {
  id: string
  amazonOrderId: string
  type: string
  status: string
  carrier?: string | null
  trackingNumber?: string | null
  error?: string | null
  createdAt: string
}

export interface ApiReturnRecord {
  id: string
  amazonOrderId: string
  sku?: string | null
  productName?: string | null
  quantity: number
  returnDate?: string | null
  reason?: string | null
  status?: string | null
  comments?: string | null
}

export interface ApiOrder {
  id: string
  amazonOrderId: string
  purchaseDate: string
  lastUpdateDate?: string | null
  orderStatus: string
  fulfillmentChannel?: string | null
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
  latestShipDate?: string | null
  latestDeliveryDate?: string | null
  carrier?: string | null
  trackingNumber?: string | null
  deliveryStatus?: string | null
  canceledReason?: string | null
  isReturned: boolean
  returnInfo?: string | null
  items: ApiOrderItem[]
  shipmentRecords?: ApiShipmentRecord[]
  returnRecords?: ApiReturnRecord[]
}

export interface DashboardAlert {
  key: string
  tone: 'info' | 'warning' | 'danger'
  text: string
  link?: string
}

export interface OrdersData {
  connection: {
    id: string
    marketplace: string
    status: string
    sellerName?: string | null
    autoSyncEnabled?: boolean
    lastSyncAt?: string | null
    lastSyncError?: string | null
  }
  orders: ApiOrder[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
  stats: { total: number; pending: number; partiallyShipped: number; shipped: number; canceled: number; returned: number; mfnUnshipped: number }
  inventoryStats?: { lowStock: number; outOfStock: number; listingIssues: number }
  alerts?: DashboardAlert[]
}

export interface MfnService {
  shippingServiceId?: string
  serviceName?: string
  carrierName?: string
  rateAmount?: number
  rateCurrency?: string
  deliveryExperience?: string
  earliestEstimatedDeliveryDate?: string | null
  latestEstimatedDeliveryDate?: string | null
}

export interface ShipmentsData {
  connection: { id: string; status: string; sellerName?: string | null; lastSyncAt?: string | null }
  pending: Array<{
    id: string
    amazonOrderId: string
    purchaseDate: string
    orderStatus: string
    orderTotal?: number | null
    currency?: string | null
    latestShipDate?: string | null
    shipCity?: string | null
    shipState?: string | null
    items: Array<{ id: string; title: string; sellerSku?: string | null; quantityOrdered: number; hasItemIds: boolean }>
    units: number
  }>
  confirmed: Array<{
    id: string
    amazonOrderId: string
    orderStatus?: string | null
    carrier?: string | null
    trackingNumber?: string | null
    createdAt: string
  }>
  failed: Array<{ id: string; amazonOrderId: string; error?: string | null; createdAt: string }>
  shipFrom: Record<string, string> | null
}

export interface ApiListingIssue {
  code?: string
  message: string
  severity: string
}

export interface ApiListing {
  id: string
  sku: string
  asin?: string | null
  productName?: string | null
  status: string
  price?: number | null
  currency?: string | null
  quantity?: number | null
  reservedQuantity?: number | null
  inboundQuantity?: number | null
  fulfillmentChannel: string
  issues: ApiListingIssue[]
  updatedAt: string
}

export interface ListingsData {
  connection: { id: string; status: string; sellerId?: string | null; sellerName?: string | null; lastSyncAt?: string | null }
  lowStockThreshold: number
  listings: ApiListing[]
  stats: { total: number; merchant: number; fba: number; lowStock: number; outOfStock: number; withIssues: number }
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}
