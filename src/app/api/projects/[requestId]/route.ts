import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, notifyUser, notifyStaff } from '@/lib/api-helpers'
import { canManageProjects, isStaffRole, STATUS_LABELS, SUGGESTED_PROGRESS } from '@/lib/constants'

// GET /api/projects/[requestId] — project workspace (customer own / staff / assigned vendor)
export async function GET(_req: NextRequest, ctx: { params: Promise<{ requestId: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  const { requestId } = await ctx.params

  const request = await db.serviceRequest.findUnique({ where: { id: requestId } })
  if (!request) return fail('Request not found', 404)

  if (user.role === 'CUSTOMER' && request.customerId !== user.id) return fail('Access denied', 403)
  if (user.role === 'VENDOR') {
    const project = await db.project.findUnique({ where: { requestId }, select: { vendorId: true } })
    const conn = await db.vendorConnection.findFirst({ where: { requestId, vendorId: user.id, status: { in: ['AUTHORIZED', 'ACTIVE', 'COMPLETED'] } } })
    if (project?.vendorId !== user.id && !conn) return fail('Access denied', 403)
  } else if (!isStaffRole(user.role)) {
    return fail('Access denied', 403)
  }

  const project = await db.project.findUnique({
    where: { requestId },
    include: {
      milestones: { orderBy: { sortOrder: 'asc' } },
      tasks: { orderBy: [{ status: 'asc' }, { createdAt: 'asc' }], include: { assignee: { select: { id: true, name: true } } } },
      vendor: { select: { id: true, name: true, email: true, vendorProfile: { select: { businessName: true, rating: true } } } },
    },
  })
  if (!project) return fail('No project workspace for this request yet — it appears once a quotation is accepted', 404)

  if (!isStaffRole(user.role)) {
    const safe = { ...project, tasks: user.role === 'VENDOR' ? project.tasks.filter((t) => t.assigneeId === user.id) : project.tasks }
    return ok({ project: safe })
  }
  return ok({ project })
}

// PATCH /api/projects/[requestId] — staff (project mgmt roles) or assigned vendor (status only)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ requestId: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  const { requestId } = await ctx.params

  const request = await db.serviceRequest.findUnique({ where: { id: requestId } })
  if (!request) return fail('Request not found', 404)
  const project = await db.project.findUnique({ where: { requestId } })
  if (!project) return fail('Project not found', 404)

  try {
    const body = await req.json()
    const data: Record<string, unknown> = {}

    if (canManageProjects(user.role)) {
      if (body.status !== undefined) {
        const status = String(body.status)
        const allowed = ['ASSIGNED', 'PLANNING', 'IN_PROGRESS', 'AWAITING_CUSTOMER_INPUT', 'WORK_REVIEW', 'REVISION_REQUIRED', 'READY_FOR_DELIVERY', 'DELIVERED', 'CUSTOMER_APPROVAL_PENDING', 'COMPLETED', 'CLOSED', 'CANCELLED', 'ON_HOLD']
        if (!allowed.includes(status)) return fail('Invalid project status', 400)
        data.status = status
        if (status === 'COMPLETED') data.completedAt = new Date()
        // Mirror key transitions onto the request status machine
        const mirror: Record<string, string> = {
          ASSIGNED: 'ASSIGNED', PLANNING: 'PLANNING', IN_PROGRESS: 'IN_PROGRESS',
          AWAITING_CUSTOMER_INPUT: 'AWAITING_CUSTOMER_INPUT', WORK_REVIEW: 'WORK_REVIEW',
          REVISION_REQUIRED: 'REVISION_REQUIRED', READY_FOR_DELIVERY: 'READY_FOR_DELIVERY',
          DELIVERED: 'DELIVERED', CUSTOMER_APPROVAL_PENDING: 'CUSTOMER_APPROVAL_PENDING',
          COMPLETED: 'COMPLETED', CLOSED: 'CLOSED', CANCELLED: 'CANCELLED', ON_HOLD: 'ON_HOLD',
        }
        if (mirror[status]) {
          await db.serviceRequest.update({
            where: { id: requestId },
            data: { status: mirror[status], stage: 'EXECUTION' },
          })
          await db.requestStatusHistory.create({
            data: { requestId, status: mirror[status], stage: mirror[status] === 'COMPLETED' || mirror[status] === 'CLOSED' ? 'COMPLETION' : 'EXECUTION',
              progress: SUGGESTED_PROGRESS[mirror[status]] ?? request.progress,
              note: body.note ? String(body.note) : `Project status: ${status}`, createdById: user.id },
          })
          await notifyUser(request.customerId, `Update on ${request.requestCode}`, `Status: ${STATUS_LABELS[mirror[status]]}${body.note ? ' — ' + String(body.note).slice(0, 150) : ''}`, requestId, 'STATUS')
        }
      }
      if (body.vendorId !== undefined) {
        if (body.vendorId) {
          const vendor = await db.user.findFirst({ where: { id: String(body.vendorId), role: 'VENDOR' }, include: { vendorProfile: true } })
          if (!vendor || vendor.vendorProfile?.status !== 'APPROVED') return fail('Vendor must be approved before assignment', 400)
          data.vendorId = vendor.id
        } else {
          data.vendorId = null
        }
      }
      if (body.executionModel !== undefined) {
        if (!['IN_HOUSE', 'THIRD_PARTY_MANAGED', 'DIRECT_CONNECTION', 'HYBRID'].includes(String(body.executionModel))) {
          return fail('Invalid execution model', 400)
        }
        data.executionModel = String(body.executionModel)
        await db.serviceRequest.update({ where: { id: requestId }, data: { executionModel: String(body.executionModel) } })
      }
      if (body.expectedEndDate !== undefined) {
        data.expectedEndDate = body.expectedEndDate ? new Date(String(body.expectedEndDate)) : null
      }
      if (body.startedAt !== undefined && !project.startedAt) {
        data.startedAt = body.startedAt ? new Date(String(body.startedAt)) : new Date()
      }
    } else if (user.role === 'VENDOR') {
      // Assigned vendor may submit work for review
      if (project.vendorId !== user.id && request.vendorId !== user.id) return fail('Access denied', 403)
      if (body.action === 'submit_for_review') {
        data.status = 'WORK_REVIEW'
        await notifyStaff('Work submitted for review', `${request.requestCode}: vendor submitted work for internal review.`, requestId, 'PROJECT')
        await db.requestStatusHistory.create({
          data: { requestId, status: 'WORK_REVIEW', stage: 'EXECUTION', progress: Math.max(request.progress, SUGGESTED_PROGRESS.WORK_REVIEW ?? 72), note: 'Vendor submitted work for review', createdById: user.id },
        })
      } else {
        return fail('Vendors can only submit work for review', 403)
      }
    } else {
      return fail('Staff access required', 403)
    }

    const updated = await db.project.update({ where: { id: project.id }, data, include: { milestones: { orderBy: { sortOrder: 'asc' } } } })
    await logActivity('PROJECT_UPDATED', `${request.requestCode}: project updated`, user.id, requestId)
    return ok({ project: updated })
  } catch (e) {
    console.error('update project failed', e)
    return fail('Failed to update project', 500)
  }
}
