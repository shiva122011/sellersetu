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
            if (rows.length) await db.documentRequest.createMany({ data: rows })
          }
        }
        await db.requestStatusHistory.create({ data: { requestId: id, status: 'SUBMITTED', stage: 'REQUEST', progress: 5, note: 'Draft submitted', createdById: user.id } })
        await notifyStaff('Draft request submitted', `${user.name} submitted draft ${existing.requestCode}: ${existing.title}`, id, 'STATUS')
        await logActivity('REQUEST_SUBMITTED', `${existing.requestCode} draft submitted`, user.id, id)
        return ok({ request: updated })
      }
      if (body.action === 'cancel') {
        if (!['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'MORE_INFO_REQUIRED', 'DISCUSSION_IN_PROGRESS'].includes(existing.status)) {
          return fail('This request can no longer be cancelled from your side. Please contact support.', 400)
        }
        const updated = await db.serviceRequest.update({ where: { id }, data: { status: 'CANCELLED', stage: 'COMPLETION', progress: 0 } })
        await db.requestStatusHistory.create({ data: { requestId: id, status: 'CANCELLED', stage: 'COMPLETION', progress: 0, note: 'Cancelled by customer', createdById: user.id } })
        await notifyStaff('Request cancelled', `${existing.requestCode} was cancelled by the customer.`, id, 'STATUS')
        await logActivity('REQUEST_CANCELLED', `${existing.requestCode} cancelled by customer`, user.id, id)
        return ok({ request: updated })
      }
      return fail('Invalid action', 400)
    }

    // ---------- VENDOR actions ----------
    if (user.role === 'VENDOR') {
      // Vendors may post delivery updates via chat/documents — no status changes here
      return fail('Vendors update work through the project workspace, not the request', 403)
    }

    // ---------- STAFF actions ----------
    if (!isStaffRole(user.role)) return fail('Staff access required', 403)
    const data: Record<string, unknown> = {}

    if (body.status !== undefined) {
      const status = String(body.status)
      if (!REQUEST_STATUSES.includes(status as never)) return fail('Invalid status', 400)
      data.status = status
      data.stage = STATUS_STAGE[status] || existing.stage
      if (SUGGESTED_PROGRESS[status] !== undefined) data.progress = SUGGESTED_PROGRESS[status]
      // Side effects on completion
      if (status === 'COMPLETED') {
        const project = await db.project.findUnique({ where: { requestId: id } })
        if (project) {
          await db.project.update({ where: { id: project.id }, data: { status: 'COMPLETED', completedAt: new Date(), progressPct: 100 } })
          await db.milestone.updateMany({ where: { projectId: project.id, status: { in: ['PENDING', 'IN_PROGRESS', 'DONE'] } }, data: { status: 'APPROVED', completedAt: new Date() } })
        }
      }
    }
    if (body.progress !== undefined) data.progress = Math.max(0, Math.min(100, Number(body.progress) || 0))
    if (body.pendingAction !== undefined) data.pendingAction = body.pendingAction ? String(body.pendingAction) : null
    if (body.internalNotes !== undefined) data.internalNotes = body.internalNotes ? String(body.internalNotes) : null

    if (body.assignedToId !== undefined) {
      if (!canManageProjects(user.role)) return fail('Not authorized to assign employees', 403)
      if (body.assignedToId) {
        const assignee = await db.user.findUnique({ where: { id: String(body.assignedToId) } })
        if (!assignee || !isStaffRole(assignee.role)) return fail('Assignee must be a staff member', 400)
        data.assignedToId = assignee.id
      } else {
        data.assignedToId = null
      }
    }

    if (body.executionModel !== undefined) {
      const m = String(body.executionModel)
      if (!['IN_HOUSE', 'THIRD_PARTY_MANAGED', 'DIRECT_CONNECTION', 'HYBRID'].includes(m)) {
        return fail('Invalid execution model', 400)
      }
      data.executionModel = m
    }

    if (body.vendorId !== undefined) {
      if (!canManageProjects(user.role)) return fail('Not authorized to assign vendors', 403)
      if (body.vendorId) {
        const vendor = await db.user.findFirst({ where: { id: String(body.vendorId), role: 'VENDOR' }, include: { vendorProfile: true } })
        if (!vendor || vendor.vendorProfile?.status !== 'APPROVED') return fail('Vendor must exist and be approved', 400)
        data.vendorId = vendor.id
      } else {
        data.vendorId = null
      }
      // Keep the project row in sync so vendor execution gates (milestones, submissions, chat) unlock
      await db.project.updateMany({ where: { requestId: id }, data: { vendorId: (data.vendorId as string | null) ?? null } })
    }

    const updated = await db.serviceRequest.update({ where: { id }, data })

    if (data.status && data.status !== existing.status) {
      await db.requestStatusHistory.create({
        data: {
          requestId: id, status: String(data.status), stage: String(data.stage || existing.stage),
          progress: typeof data.progress === 'number' ? data.progress : existing.progress,
          note: body.statusNote ? String(body.statusNote) : `Status changed to ${STATUS_LABELS[String(data.status)]}`,
          createdById: user.id,
        },
      })
      const statusNote = body.statusNote ? ` — ${String(body.statusNote)}` : ''
      await notifyUser(existing.customerId, `Update on ${existing.requestCode}`, `Status: ${STATUS_LABELS[String(data.status)]}${statusNote}`, id, 'STATUS')
      if (existing.vendorId) await notifyUser(existing.vendorId, `Status update on ${existing.requestCode}`, `${STATUS_LABELS[String(data.status)]}${statusNote}`, id, 'STATUS')
      await logActivity('REQUEST_STATUS_CHANGED', `${existing.requestCode}: ${existing.status} → ${String(data.status)}`, user.id, id)
    }
    if (body.assignedToId && body.assignedToId !== existing.assignedToId) {
      await notifyUser(String(body.assignedToId), 'Request assigned to you', `${existing.requestCode}: ${existing.title}`, id, 'STATUS')
    }

    return ok({ request: updated })
  } catch (e) {
    console.error('update request failed', e)
    return fail('Failed to update request', 500)
  }
}

// Local minimal doc-requirement parse (avoids extra import cycles in this route)
function parseDocReqs(raw: string): { label: string; description?: string; category?: string; mandatory?: boolean }[] {
  try {
    const parsed = JSON.parse(raw || '{"documents":[]}')
    return Array.isArray(parsed.documents) ? parsed.documents : []
  } catch {
    return []
  }
}
