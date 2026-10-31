import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, notifyUser, notifyStaff } from '@/lib/api-helpers'
import {
  REQUEST_STATUSES, STATUS_STAGE, STATUS_LABELS, SUGGESTED_PROGRESS,
  isStaffRole, canManageProjects,
} from '@/lib/constants'

type Auth = { id: string; role: string }

async function accessTo(request: { id: string; customerId: string; vendorId: string | null; draft: boolean }, user: Auth) {
  if (user.role === 'CUSTOMER') return request.customerId === user.id
  if (isStaffRole(user.role)) return true
  if (user.role === 'VENDOR') {
    if (request.vendorId === user.id) return true
    const conn = await db.vendorConnection.findFirst({
      where: { requestId: request.id, vendorId: user.id, status: { in: ['AUTHORIZED', 'ACTIVE', 'COMPLETED'] } },
    })
    if (conn) return true
    const project = await db.project.findUnique({ where: { requestId: request.id }, select: { vendorId: true } })
    return project?.vendorId === user.id
  }
  return false
}

// GET /api/requests/[id] — full request workspace (role-scoped)
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  const { id } = await ctx.params

  const request = await db.serviceRequest.findUnique({ where: { id } })
  if (!request) return fail('Request not found', 404)
  if (!(await accessTo(request, user))) return fail('Access denied', 403)

  const full = await db.serviceRequest.findUnique({
    where: { id },
    include: {
      service: {
        include: {
          category: { select: { id: true, code: true, name: true, slug: true, icon: true } },
          subcategory: { select: { id: true, name: true } },
        },
      },
      customer: { select: { id: true, name: true, email: true, phone: true, company: true, createdAt: true } },
      assignedTo: { select: { id: true, name: true, email: true, role: true } },
      vendor: {
        select: { id: true, name: true, email: true, company: true, vendorProfile: { select: { businessName: true, rating: true, logoUrl: true } } },
      },
      documents: { orderBy: { createdAt: 'desc' } },
      documentRequests: { orderBy: { createdAt: 'asc' } },
      payments: { orderBy: { createdAt: 'asc' }, include: { milestone: { select: { title: true } } } },
      invoices: { orderBy: { issuedAt: 'desc' } },
      quotations: {
        orderBy: { version: 'desc' },
        include: { items: { orderBy: { sortOrder: 'asc' } }, createdBy: { select: { name: true } } },
      },
      project: {
        include: {
          milestones: { orderBy: { sortOrder: 'asc' } },
          tasks: { orderBy: { createdAt: 'asc' }, include: { assignee: { select: { id: true, name: true } } } },
          vendor: { select: { id: true, name: true, vendorProfile: { select: { businessName: true, logoUrl: true } } } },
        },
      },
      vendorConnections: {
        include: { vendor: { select: { id: true, name: true, email: true, vendorProfile: { select: { businessName: true, rating: true, serviceLocations: true, logoUrl: true } } } } },
        orderBy: { createdAt: 'desc' },
      },
      messages: { orderBy: { createdAt: 'asc' }, include: { sender: { select: { id: true, name: true, role: true, company: true } } } },
      statusHistory: { orderBy: { createdAt: 'desc' }, include: { createdBy: { select: { name: true } } } },
      tasks: { orderBy: { createdAt: 'asc' } },
      refunds: { include: { initiatedBy: { select: { name: true } }, decidedBy: { select: { name: true } } }, orderBy: { createdAt: 'desc' } },
      credentials: {
        select: { id: true, title: true, hint: true, status: true, accessCount: true, lastAccessedAt: true, createdAt: true, createdBy: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  if (!full) return fail('Request not found', 404)

  // Role-based message visibility
  let messages = full.messages
  if (user.role === 'CUSTOMER') {
    messages = messages.filter((m) => !m.isInternal)
  } else if (user.role === 'VENDOR') {
    messages = messages.filter((m) => !m.isInternal)
    // Vendors only see messages once their connection is authorized/active
    const connected = full.vendorConnections.some((c) => c.vendorId === user.id && ['AUTHORIZED', 'ACTIVE', 'COMPLETED'].includes(c.status))
      || full.project?.vendorId === user.id
      || (full.vendorId === user.id && ['ASSIGNED', 'IN_PROGRESS', 'WORK_REVIEW', 'DELIVERED'].includes(full.status))
    if (!connected) messages = []
  }

  // Staff-only fields stripped for customer/vendor
  if (!isStaffRole(user.role)) {
    const { internalNotes, ...rest } = full
    // Confidential commercial data: managed-fee/margin notes are internal-only
    const sanitized: Record<string, unknown> = {
      ...rest,
      vendorConnections: (rest.vendorConnections || []).map(({ managedFeeNote, ...c }) => c),
    }

    // Customer/vendor milestone commercial projections
    if (rest.project?.milestones) {
      if (user.role === 'VENDOR') {
        // Vendor payout fields stay visible; client billing per milestone is hidden
        // for platform-managed execution (vendor sees their own payout instead).
        // Direct-connection vendors keep `amount` — they bill the customer directly.
        if (rest.project.executionModel !== 'DIRECT_CONNECTION') {
          sanitized.project = {
            ...rest.project,
            milestones: rest.project.milestones.map((m) => {
              const { amount, ...rest_m } = m
              void amount
              return rest_m
            }),
          }
        }
      } else if (user.role === 'CUSTOMER') {
        // Vendor payout data is staff/vendor-only — never shown to customers
        sanitized.project = {
          ...rest.project,
          milestones: rest.project.milestones.map((m) => {
            const { vendorPayoutAmount, payoutStatus, payoutReleasedAt, payoutNote, ...rest_m } = m
            void vendorPayoutAmount; void payoutStatus; void payoutReleasedAt; void payoutNote
            return rest_m
          }),
        }
      }
    }

    return ok({ request: { ...sanitized, messages } })
  }
  return ok({ request: { ...full, messages } })
}

// PATCH /api/requests/[id]
// staff: status/stage/assignment/execution model/vendor/internal notes/pending action
// customer: submit a draft; cancel own request in early stages
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  const { id } = await ctx.params

  const existing = await db.serviceRequest.findUnique({ where: { id } })
  if (!existing) return fail('Request not found', 404)
  if (!(await accessTo(existing, user))) return fail('Access denied', 403)

  try {
    const body = await req.json()

    // ---------- CUSTOMER actions ----------
    if (user.role === 'CUSTOMER') {
      if (body.action === 'submit_draft') {
        if (!existing.draft) return fail('This request is not a draft', 400)
        if (!existing.title || existing.title === 'Untitled request (draft)' || !existing.description) {
          return fail('Add a title and requirement description before submitting', 400)
        }
        const updated = await db.serviceRequest.update({
          where: { id }, data: { draft: false, status: 'SUBMITTED', stage: 'REQUEST', progress: SUGGESTED_PROGRESS.SUBMITTED ?? 5 },
        })
        // Generate template document checklist now
        if (existing.serviceId) {
          const service = await db.service.findUnique({ where: { id: existing.serviceId } })
          if (service) {
            const docs = parseDocReqs(service.docRequirements) as import('@/lib/forms').DocRequirement[]
            const responses = JSON.parse(existing.formResponses || '{}')
            const { isRequirementVisible } = await import('@/lib/forms')
            const rows = docs.filter((d) => isRequirementVisible(d, responses)).map((d) => ({
              requestId: id, title: d.label, description: d.description || '', category: d.category || 'OTHER',
              mandatory: !!d.mandatory, source: 'TEMPLATE', status: 'PENDING',
            }))
            if (r…60144 tokens truncated…y you can see your store&apos;s data. Disconnect any time to revoke access and purge cached data.</p>
            </div>
            {!liveConfigured && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 flex gap-2">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">Waiting for the Amazon SP-API app setup</p>
                  <p>
                    This platform connects <b>only through Amazon&apos;s official Selling Partner API</b> — there is no simulated/demo data.
                    The platform administrator must save the Login-with-Amazon app credentials under <b>Admin → Integrations</b>
                    {' '}(requires an Amazon-approved developer profile and app). Once saved, the authorization buttons above become active.
                  </p>
                </div>
              </div>
            )}
            {liveConfigured && sandboxMode && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 flex gap-2">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">Amazon sandbox mode is active</p>
                  <p>
                    The platform&apos;s SP-API app is still in Draft, so connections run against Amazon&apos;s official <b>SP-API Sandbox</b>
                    {' '}(fixed test data from Amazon — not your live account). Once the app is published, sandbox is switched off and your real orders flow in.
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
        <Lock className="h-3 w-3" /> SellerSetu is an independent service provider — not affiliated with Amazon. All marketplace data is retrieved via the official Selling Partner API under your authorization.
      </p>
    </div>
  )
}
