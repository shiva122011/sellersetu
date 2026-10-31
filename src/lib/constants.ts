// Shared domain constants for the Universal Service Management Platform.
// Every catalog, workflow and commercial rule below is mirrored by admin-managed
// database configuration — these constants are defaults + display helpers only.

// ---------- Roles & permission groups ----------
export const ROLES = [
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'OPS_MANAGER', label: 'Operations Manager' },
  { value: 'SALES_EXEC', label: 'Sales / Quotation Executive' },
  { value: 'PROJECT_MANAGER', label: 'Project Manager' },
  { value: 'EMPLOYEE', label: 'Employee / Service Executive' },
  { value: 'VENDOR', label: 'Vendor' },
] as const

export const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  ROLES.map((r) => [r.value, r.label])
)

export const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER', 'SALES_EXEC', 'PROJECT_MANAGER', 'EMPLOYEE']
export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN']
// Quotation creation / sending authorization
export const QUOTATION_ROLES = ['SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER', 'SALES_EXEC']
// Project & milestone management authorization
export const PROJECT_MGMT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER', 'PROJECT_MANAGER']

export function isStaffRole(role: string | undefined | null): boolean {
  return !!role && STAFF_ROLES.includes(role)
}
export function isAdminRole(role: string | undefined | null): boolean {
  return !!role && ADMIN_ROLES.includes(role)
}
export function canManageQuotations(role: string | undefined | null): boolean {
  return !!role && QUOTATION_ROLES.includes(role)
}
export function canManageProjects(role: string | undefined | null): boolean {
  return !!role && PROJECT_MGMT_ROLES.includes(role)
}

// ---------- Service execution models ----------
export const EXECUTION_MODELS = [
  {
    value: 'IN_HOUSE',
    label: 'In-House Execution',
    short: 'In-house',
    description: 'Planned, executed and delivered by our internal team.',
    color: 'bg-teal-100 text-teal-800 border-teal-200',
  },
  {
    value: 'THIRD_PARTY_MANAGED',
    label: 'Third-Party Managed Service',
    short: 'Managed service',
    description: 'We manage the project end-to-end; work is executed by a vetted vendor partner.',
    color: 'bg-violet-100 text-violet-800 border-violet-200',
  },
  {
    value: 'DIRECT_CONNECTION',
    label: 'Direct Vendor Connection',
    short: 'Direct connection',
    description: 'We connect you directly with a vetted provider for a facilitation fee; you contract with them directly.',
    color: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  {
    value: 'HYBRID',
    label: 'Hybrid',
    short: 'Hybrid',
    description: 'A mix of in-house and vendor execution, coordinated by our team.',
    color: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  },
] as const

export const EXECUTION_MODEL_LABELS: Record<string, string> = Object.fromEntries(
  EXECUTION_MODELS.map((m) => [m.value, m.label])
)
export const EXECUTION_MODEL_SHORT: Record<string, string> = Object.fromEntries(
  EXECUTION_MODELS.map((m) => [m.value, m.short])
)
export const EXECUTION_MODEL_COLORS: Record<string, string> = Object.fromEntries(
  EXECUTION_MODELS.map((m) => [m.value, m.color])
)

// ---------- Request lifecycle: 4 stages ----------
export const REQUEST_STAGES = ['REQUEST', 'QUOTATION', 'EXECUTION', 'COMPLETION'] as const

export const STAGE_LABELS: Record<string, string> = {
  REQUEST: 'Request',
  QUOTATION: 'Quotation',
  EXECUTION: 'Execution',
  COMPLETION: 'Completion',
}

export const STAGE_COLORS: Record<string, string> = {
  REQUEST: 'bg-slate-100 text-slate-700 border-slate-200',
  QUOTATION: 'bg-violet-100 text-violet-800 border-violet-200',
  EXECUTION: 'bg-teal-100 text-teal-800 border-teal-200',
  COMPLETION: 'bg-emerald-100 text-emerald-800 border-emerald-200',
}

// ---------- Status machine (all statuses, grouped by stage) ----------
export const REQUEST_STATUSES = [
  // Request stage
  'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'MORE_INFO_REQUIRED', 'DISCUSSION_IN_PROGRESS',
  // Quotation stage
  'QUOTATION_PREPARATION', 'QUOTATION_SENT', 'NEGOTIATION', 'REVISION_REQUESTED',
  'QUOTATION_ACCEPTED', 'QUOTATION_REJECTED',
  // Execution stage
  'AWAITING_PAYMENT', 'ASSIGNED', 'PLANNING', 'IN_PROGRESS', 'AWAITING_CUSTOMER_INPUT',
  'WORK_REVIEW', 'REVISION_REQUIRED', 'READY_FOR_DELIVERY',
  // Completion stage
  'DELIVERED', 'CUSTOMER_APPROVAL_PENDING', 'COMPLETED', 'CLOSED', 'CANCELLED', 'ON_HOLD',
] as const

export type RequestStatus = (typeof REQUEST_STATUSES)[number]

export const STATUS_STAGE: Record<string, string> = {
  DRAFT: 'REQUEST', SUBMITTED: 'REQUEST', UNDER_REVIEW: 'REQUEST',
  MORE_INFO_REQUIRED: 'REQUEST', DISCUSSION_IN_PROGRESS: 'REQUEST',
  QUOTATION_PREPARATION: 'QUOTATION', QUOTATION_SENT: 'QUOTATION', NEGOTIATION: 'QUOTATION',
  REVISION_REQUESTED: 'QUOTATION', QUOTATION_ACCEPTED: 'QUOTATION', QUOTATION_REJECTED: 'QUOTATION',
  AWAITING_PAYMENT: 'EXECUTION', ASSIGNED: 'EXECUTION', PLANNING: 'EXECUTION',
  IN_PROGRESS: 'EXECUTION', AWAITING_CUSTOMER_INPUT: 'EXECUTION', WORK_REVIEW: 'EXECUTION',
  REVISION_REQUIRED: 'EXECUTION', READY_FOR_DELIVERY: 'EXECUTION',
  DELIVERED: 'COMPLETION', CUSTOMER_APPROVAL_PENDING: 'COMPLETION', COMPLETED: 'COMPLETION',
  CLOSED: 'COMPLETION', CANCELLED: 'COMPLETION', ON_HOLD: 'COMPLETION',
}

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  MORE_INFO_REQUIRED: 'More Information Required',
  DISCUSSION_IN_PROGRESS: 'Discussion in Progress',
  QUOTATION_PREPARATION: 'Quotation Preparation',
  QUOTATION_SENT: 'Quotation Sent',
  NEGOTIATION: 'Negotiation',
  REVISION_REQUESTED: 'Revision Requested',
  QUOTATION_ACCEPTED: 'Quotation Accepted',
  QUOTATION_REJECTED: 'Quotation Rejected',
  AWAITING_PAYMENT: 'Awaiting Payment / Authorization',
  ASSIGNED: 'Assigned',
  PLANNING: 'Planning',
  IN_PROGRESS: 'In Progress',
  AWAITING_CUSTOMER_INPUT: 'Awaiting Customer Input',
  WORK_REVIEW: 'Under Review',
  REVISION_REQUIRED: 'Revision Required',
  READY_FOR_DELIVERY: 'Ready for Delivery',
  DELIVERED: 'Delivered',
  CUSTOMER_APPROVAL_PENDING: 'Customer Approval Pending',
  COMPLETED: 'Completed',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
  ON_HOLD: 'On Hold',
}

export const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  SUBMITTED: 'bg-slate-100 text-slate-700 border-slate-200',
  UNDER_REVIEW: 'bg-violet-100 text-violet-800 border-violet-200',
  MORE_INFO_REQUIRED: 'bg-amber-100 text-amber-800 border-amber-200',
  DISCUSSION_IN_PROGRESS: 'bg-sky-100 text-sky-800 border-sky-200',
  QUOTATION_PREPARATION: 'bg-violet-100 text-violet-800 border-violet-200',
  QUOTATION_SENT: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  NEGOTIATION: 'bg-amber-100 text-amber-800 border-amber-200',
  REVISION_REQUESTED: 'bg-orange-100 text-orange-800 border-orange-200',
  QUOTATION_ACCEPTED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  QUOTATION_REJECTED: 'bg-rose-100 text-rose-800 border-rose-200',
  AWAITING_PAYMENT: 'bg-amber-100 text-amber-800 border-amber-200',
  ASSIGNED: 'bg-slate-100 text-slate-700 border-slate-200',
  PLANNING: 'bg-sky-100 text-sky-800 border-sky-200',
  IN_PROGRESS: 'bg-teal-100 text-teal-800 border-teal-200',
  AWAITING_CUSTOMER_INPUT: 'bg-orange-100 text-orange-800 border-orange-200',
  WORK_REVIEW: 'bg-violet-100 text-violet-800 border-violet-200',
  REVISION_REQUIRED: 'bg-rose-100 text-rose-800 border-rose-200',
  READY_FOR_DELIVERY: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  DELIVERED: 'bg-green-100 text-green-800 border-green-200',
  CUSTOMER_APPROVAL_PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
  COMPLETED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  CLOSED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  CANCELLED: 'bg-rose-100 text-rose-700 border-rose-200',
  ON_HOLD: 'bg-yellow-100 text-yellow-800 border-yellow-200',
}

// Suggested completion % per status (project milestones refine this once active)
export const SUGGESTED_PROGRESS: Record<string, number> = {
  DRAFT: 0, SUBMITTED: 5, UNDER_REVIEW: 10, MORE_INFO_REQUIRED: 10, DISCUSSION_IN_PROGRESS: 15,
  QUOTATION_PREPARATION: 20, QUOTATION_SENT: 25, NEGOTIATION: 28, REVISION_REQUESTED: 28,
  QUOTATION_ACCEPTED: 35, QUOTATION_REJECTED: 0,
  AWAITING_PAYMENT: 38, ASSIGNED: 42, PLANNING: 48, IN_PROGRESS: 60,
  AWAITING_CUSTOMER_INPUT: 62, WORK_REVIEW: 72, REVISION_REQUIRED: 65, READY_FOR_DELIVERY: 82,
  DELIVERED: 88, CUSTOMER_APPROVAL_PENDING: 92, COMPLETED: 100, CLOSED: 100, CANCELLED: 0, ON_HOLD: 50,
}

// Statuses visible to customers (internal-only workflow states excluded)
export const CUSTOMER_VISIBLE_STATUSES = REQUEST_STATUSES

// Terminal / inactive statuses
export const INACTIVE_STATUSES = ['CLOSED', 'CANCELLED', 'REJECTED']

// ---------- Documents ----------
export const DOCUMENT_CATEGORIES = [
  'PAN', 'AADHAAR', 'GST', 'BANK', 'ADDRESS', 'LOGO', 'BRAND', 'PRODUCT',
  'LEGAL', 'TECHNICAL', 'REFERENCE', 'DELIVERABLE', 'OTHER',
] as const

export const DOCUMENT_REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Waiting for upload',
  SUBMITTED: 'Submitted — under review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected — re-upload needed',
  WAIVED: 'Not required (waived by team)',
}

// ---------- Payments & invoices ----------
export const PAYMENT_TYPES = ['ADVANCE', 'MILESTONE', 'FINAL', 'CONNECTION_FEE', 'MANAGED_SERVICE', 'CUSTOM'] as const

export const PAYMENT_TYPE_LABELS: Record<string, string> = {
  ADVANCE: 'Advance payment',
  MILESTONE: 'Milestone payment',
  FINAL: 'Final payment',
  CONNECTION_FEE: 'Vendor connection fee',
  MANAGED_SERVICE: 'Managed service charge',
  CUSTOM: 'Other charge',
}

export const PAYMENT_STATUS = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'] as const
export const PAYMENT_METHODS = ['UPI', 'CARD', 'NETBANKING', 'BANK_TRANSFER', 'OTHER'] as const

export const INVOICE_TYPES = ['TAX_INVOICE', 'RECEIPT', 'PROFORMA'] as const
export const INVOICE_STATUS = ['ISSUED', 'PAID', 'CANCELLED'] as const

// ---------- Milestones ----------
export const MILESTONE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  DONE: 'Completed',
  APPROVED: 'Approved by customer',
}

// ---------- Refunds ----------
export const REFUND_STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Refund initiated',
  PROCESSED: 'Refund processed',
  REJECTED: 'Refund rejected',
}

export const REFUND_STATUS_COLORS: Record<string, string> = {
  REQUESTED: 'bg-amber-100 text-amber-800 border-amber-200',
  PROCESSED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
}

// ---------- Quotations ----------
export const QUOTATION_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent to customer',
  NEGOTIATION: 'In negotiation',
  REVISION_REQUESTED: 'Revision requested',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  SUPERSEDED: 'Superseded by a newer version',
  EXPIRED: 'Expired',
}

export const QUOTATION_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  SENT: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  NEGOTIATION: 'bg-amber-100 text-amber-800 border-amber-200',
  REVISION_REQUESTED: 'bg-orange-100 text-orange-800 border-orange-200',
  ACCEPTED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-rose-100 text-rose-800 border-rose-200',
  SUPERSEDED: 'bg-slate-100 text-slate-500 border-slate-200',
  EXPIRED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
}

// ---------- Formatters ----------
export function formatINR(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

export function formatDateTime(d: string | Date): string {
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}
