// Client-side API helpers + shared TypeScript types (universal platform)

export interface ApiUser {
  id: string
  email: string
  name: string
  phone?: string | null
  company?: string | null
  role: string
  createdAt?: string
  vendorProfile?: ApiVendorProfile | null
}

export interface ApiVendorProfile {
  id: string
  businessName: string
  logoUrl?: string
  contactPerson?: string
  phone?: string
  gstin?: string
  address?: string
  city?: string
  state?: string
  payoutMode?: '' | 'BANK' | 'UPI'
  payoutAccountName?: string
  payoutAccountNumber?: string
  payoutIfsc?: string
  payoutUpiId?: string
  approvedAt?: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'
  reviewNote?: string | null
  expertise?: string
  serviceLocations?: string
  description?: string
  website?: string
  rating?: number
  completedProjects?: number
}

export interface ApiMessage {
  id: string
  requestId: string
  senderId: string
  content: string
  isInternal: boolean
  isRead: boolean
  createdAt: string
  sender: { id: string; name: string; role: string; company?: string | null }
}

export interface ApiPayment {
  id: string
  type: string
  label?: string | null
  amount: number
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'
  method?: string | null
  transactionId?: string | null
  receiptNo?: string | null
  paidAt?: string | null
  note?: string | null
  createdAt: string
  milestone?: { title: string } | null
  request?: { requestCode: string; title: string; executionModel: string; customer?: { name: string; email: string } }
}

export interface ApiDocument {
  id: string
  name: string
  fileName: string
  mimeType: string
  size: number
  category: string
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SHARED'
  reviewNote?: string | null
  isDeliverable?: boolean
  documentRequestId?: string | null
  uploadedById?: string | null
  createdAt: string
}

export interface ApiDocumentRequest {
  id: string
  requestId: string
  title: string
  description: string
  category: string
  mandatory: boolean
  source: 'TEMPLATE' | 'STAFF' | 'SUBMISSION'
  status: 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'WAIVED'
  dueDate?: string | null
  reviewNote?: string | null
  requestedBy?: { name: string } | null
  createdAt: string
}

export interface ApiTask {
  id: string
  title: string
  detail?: string | null
  owner: 'CUSTOMER' | 'TEAM'
  isDone: boolean
  createdAt: string
}

export interface ApiStatusEvent {
  id: string
  status: string
  stage: string
  progress: number
  note?: string | null
  createdAt: string
  createdBy?: { name: string } | null
}

export interface ApiCategory {
  id: string
  code: string
  slug: string
  name: string
  description: string
  icon: string
  featured: boolean
  faqs?: string
  sortOrder: number
  subcategories?: { id: string; name: string; slug: string }[]
}

export interface ApiCatalogService {
  id: string
  name: string
  slug: string
  description: string
  executionType: string
  status: 'AVAILABLE' | 'COMING_SOON'
  featured: boolean
  timeline: string
  icon: string
  scopeExamples: string
  deliverables: string
  process?: string
  formConfig?: string
  docRequirements?: string
  categoryId?: string
  subcategoryId?: string | null
  category?: { code: string; name: string; slug: string; icon: string; faqs?: string }
  subcategory?: { name: string } | null
  active?: boolean
  displayOrder?: number
}

export interface ApiQuotationItem {
  id?: string
  description: string
  detail?: string
  quantity: number
  unit: string
  unitPrice: number
  amount: number
  sortOrder: number
}

export interface ApiQuotation {
  id: string
  quotationNo: string
  requestId: string
  version: number
  status: string
  scope: string
  deliverablesNote: string
  timelineNote: string
  paymentTerms: string
  notes: string
  internalNotes?: string | null
  subtotal: number
  taxLabel: string
  taxRatePct: number
  taxAmount: number
  total: number
  validUntil?: string | null
  lockedAt?: string | null
  customerNote?: string | null
  acceptedAt?: string | null
  sentAt?: string | null
  createdAt: string
  items: ApiQuotationItem[]
  createdBy?: { name: string } | null
  request?: {
    id: string
    requestCode: string
    title: string
    status: string
    executionModel: string
    customer?: { id: string; name: string; company?: string | null; email: string }
  }
}

export interface ApiMilestone {
  id: string
  title: string
  description: string
  weight: number
  amount?: number // client billing (hidden from vendors on managed projects)
  vendorPayoutAmount?: number | null // vendor's payout (managed execution; null = to be confirmed)
  payoutStatus?: 'PENDING' | 'RELEASED'
  payoutReleasedAt?: string | null
  payoutNote?: string
  dueDate?: string | null
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'APPROVED'
  completedAt?: string | null
  sortOrder: number
}

export interface ApiProjectTask {
  id: string
  title: string
  detail: string
  assigneeId?: string | null
  assignee?: { id: string; name: string } | null
  status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED'
  dueDate?: string | null
  createdAt: string
}

export interface ApiProject {
  id: string
  requestId: string
  status: string
  executionModel: string
  vendorId?: string | null
  vendor?: { id: string; name: string; vendorProfile?: { businessName: string; rating: number; logoUrl?: string } | null } | null
  startedAt?: string | null
  expectedEndDate?: string | null
  completedAt?: string | null
  progressPct: number
  milestones: ApiMilestone[]
  tasks?: ApiProjectTask[]
}

export interface ApiVendorConnection {
  id: string
  requestId: string
  vendorId: string
  model: 'DIRECT_CONNECTION' | 'MANAGED'
  status: 'PROPOSED' | 'AUTHORIZED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  connectionFee: number
  managedFeeNote?: string
  feePaid: boolean
  authorizedAt?: string | null
  completedAt?: string | null
  notes?: string
  createdAt: string
  vendor?: { id: string; name: string; email: string; vendorProfile?: { businessName: string; rating: number; serviceLocations?: string; logoUrl?: string } | null }
  request?: { id: string; requestCode: string; title: string; status: string; executionModel: string; customer?: { id: string; name: string; company?: string | null; email: string } }
}

export interface ApiInvoice {
  id: string
  invoiceNo: string
  requestId: string
  type: string
  description: string
  amount: number
  gstRatePct: number
  gstAmount: number
  totalAmount: number
  billToName: string
  billToGstin?: string | null
  status: 'ISSUED' | 'PAID' | 'CANCELLED'
  issuedAt: string
  request?: { requestCode: string; title: string; customer?: { name: string; company?: string | null; email: string } }
}

export interface ApiRequest {
  id: string
  requestCode: string
  title: string
  description: string
  expectedDeliverables: string
  preferredTimeline: string
  projectLocation: string
  additionalNotes: string
  serviceId?: string | null
  customCategory?: string | null
  formResponses: string
  draft: boolean
  stage: string
  status: string
  progress: number
  executionModel: string
  assignedToId?: string | null
  vendorId?: string | null
  internalNotes?: string | null
  pendingAction?: string | null
  createdAt: string
  updatedAt: string
  service?: ApiCatalogService | null
  customer?: { id: string; name: string; email: string; phone?: string | null; company?: string | null }
  assignedTo?: { id: string; name: string; email: string; role?: string } | null
  vendor?: { id: string; name: string; vendorProfile?: { businessName: string; logoUrl?: string } | null } | null
  documents?: ApiDocument[]
  documentRequests?: ApiDocumentRequest[]
  payments?: ApiPayment[]
  invoices?: ApiInvoice[]
  quotations?: ApiQuotation[]
  project?: ApiProject | null
  vendorConnections?: ApiVendorConnection[]
  messages?: ApiMessage[]
  statusHistory?: ApiStatusEvent[]
  tasks?: ApiTask[]
  refunds?: ApiRefund[]
  credentials?: ApiCredentialShare[]
  _count?: { messages: number; documentRequests: number }
}

export interface ApiRequestRequirement {
  id: string
  serviceId: string
  requirementId: string
  label: string
  category: string
  mandatory: boolean
  description?: string | null
  status: 'PENDING' | 'UPLOADED' | 'APPROVED' | 'REJECTED' | 'WAIVED'
  service?: { id: string; name: string }
}

export interface ApiRefund {
  id: string
  amount: number
  reason: string
  policyNote?: string | null
  status: 'REQUESTED' | 'PROCESSED' | 'REJECTED'
  decisionNote?: string | null
  processedAt?: string | null
  createdAt: string
  initiatedBy?: { name: string } | null
  decidedBy?: { name: string } | null
}

export interface ApiCredentialShare {
  id: string
  title: string
  hint?: string | null
  status: 'ACTIVE' | 'REVOKED'
  accessCount: number
  lastAccessedAt?: string | null
  createdAt: string
  createdBy?: { name: string } | null
}

export interface ApiNotification {
  id: string
  title: string
  body: string
  type: string
  requestId?: string | null
  isRead: boolean
  createdAt: string
}

// Display helper: service label for a request (catalog name or custom category)
export function requestServiceLabel(r: ApiRequest): string {
  if (r.service?.name) return r.service.name
  if (r.customCategory) return `Custom — ${r.customCategory}`
  return 'Service'
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function api<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options?.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
  })
  let json: { ok: boolean; data?: T; error?: string } | null = null
  try {
    json = await res.json()
  } catch {
    throw new ApiError('Server returned an invalid response', res.status)
  }
  if (!res.ok || !json?.ok) {
    throw new ApiError(json?.error || `Request failed (${res.status})`, res.status)
  }
  return json.data as T
}
