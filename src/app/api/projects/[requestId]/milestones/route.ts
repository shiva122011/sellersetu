import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, notifyUser, notifyStaff } from '@/lib/api-helpers'
import { canManageProjects, isStaffRole } from '@/lib/constants'
import { recalcProjectProgress } from '@/lib/projects'

const MILESTONE_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE', 'APPROVED']

async function guard(requestId: string, user: { id: string; role: string }) {
  const request = await db.serviceRequest.findUnique({ where: { id: requestId } })
  if (!request) return { error: 'Request not found' as string, status: 404 as const }
  const project = await db.project.findUnique({ where: { requestId } })
  if (!project) return { error: 'Project not found' as string, status: 404 as const }
  if (!canManageProjects(user.role)) return { error: 'Not authorized to manage milestones' as string, status: 403 as const }
  return { project, request }
}

// POST /api/projects/[requestId]/milestones — create a milestone (staff w/ project rights)
export async function POST(req: NextRequest, ctx: { params: Promise<{ requestId: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  const { requestId } = await ctx.params

  const g = await guard(requestId, user)
  if ('error' in g) return fail(g.error ?? 'Access denied', g.status)

  try {
    const body = await req.json()
    const title = String(body.title || '').trim()
    if (!title) return fail('Milestone title is required', 400)
    const weight = Math.max(0, Math.min(100, Number(body.weight) || 0))
    const last = await db.milestone.findFirst({ where: { projectId: g.project.id }, orderBy: { sortOrder: 'desc' } })

    const milestone = await db.milestone.create({
      data: {
        projectId: g.project.id,
        title,
        description: String(body.description || ''),
        weight,
        amount: Math.max(0, Number(body.amount) || 0),
        dueDate: body.dueDate ? new Date(String(body.dueDate)) : null,
        sortOrder: (last?.sortOrder ?? 0) + 1,
        // Optional vendor payout for managed execution — staff sets it up front
        ...(body.vendorPayoutAmount !== undefined && body.vendorPayoutAmount !== null && body.vendorPayoutAmount !== ''
          ? { vendorPayoutAmount: Math.max(0, Number(body.vendorPayoutAmount) || 0) }
          : {}),
      },
    })
    if (g.project.status === 'PLANNING') {
      await db.project.update({ where: { id: g.project.id }, data: { status: 'ASSIGNED' } })
    }
    await logActivity('MILESTONE_CREATED', `${g.request.requestCode}: milestone "${title}" (${weight}%)`, user.id, requestId)
    return ok({ milestone }, 201)
  } catch (e) {
    console.error('create milestone failed', e)
    return fail('Failed to create milestone', 500)
  }
}

// PATCH /api/projects/[requestId]/milestones — update a milestone by id in body
// Staff with project rights: any field. Assigned vendor: status → DONE (submit completion).
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
    const milestoneId = String(body.id || '')
    const milestone = await db.milestone.findFirst({ where: { id: milestoneId, projectId: project.id } })
    if (!milestone) return fail('Milestone not found', 404)

    const isVendor = user.role === 'VENDOR' && (project.vendorId === user.id || request.vendorId === user.id)
    const data: Record<string, unknown> = {}

    if (isVendor) {
      // Vendor marks milestone complete → goes to DONE for staff verification
      if (body.status !== 'DONE') return fail('Vendors can only mark milestones complete', 403)
      data.status = 'DONE'
      data.completedAt = new Date()
      await notifyStaff('Milestone completed by vendor', `${request.requestCode}: vendor marked "${milestone.title}" complete. Verify and approve.`, requestId, 'PROJECT')
    } else if (canManageProjects(user.role)) {
      if (body.title !== undefined) data.title = String(body.title).trim()
      if (body.description !== undefined) data.description = String(body.description)
      if (body.weight !== undefined) data.weight = Math.max(0, Math.min(100, Number(body.weight) || 0))
      if (body.amount !== undefined) data.amount = Math.max(0, Number(body.amount) || 0)
      if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(String(body.dueDate)) : null
      if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0
      // Vendor payout management (managed execution):
      if (body.vendorPayoutAmount !== undefined) {
        if (body.vendorPayoutAmount === null || body.vendorPayoutAmount === '') {
          data.vendorPayoutAmount = null
        } else {
          const p = Number(body.vendorPayoutAmount)
          if (Number.isNaN(p) || p < 0) return fail('Vendor payout amount must be a non-negative number', 400)
          data.vendorPayoutAmount = p
        }
      }
      if (body.payoutNote !== undefined) data.payoutNote = String(body.payoutNote).trim()
      if (body.payoutStatus !== undefined) {
        const ps = String(body.payoutStatus).toUpperCase()
        if (!['PENDING', 'RELEASED'].includes(ps)) return fail('Payout status must be PENDING or RELEASED', 400)
        data.payoutStatus = ps
        data.payoutReleasedAt = ps === 'RELEASED' ? (milestone.payoutReleasedAt ?? new Date()) : null
      }
      if (body.status !== undefined) {
        const status = String(body.status)
        if (!MILESTONE_STATUSES.includes(status)) return fail('Invalid milestone status', 400)
        data.status = status
        data.completedAt = status === 'DONE' || status === 'APPROVED' ? (milestone.completedAt ?? new Date()) : null
        if (status === 'APPROVED') {
          await notifyUser(request.customerId, `Milestone approved on ${request.requestCode}`, `"${milestone.title}" is approved and counted in your project progress.`, requestId, 'PROJECT')
        }
      }
    } else {
      return fail('Not authorized', 403)
    }

    await db.milestone.update({ where: { id: milestone.id }, data })
    const pct = await recalcProjectProgress(project.id)
    await logActivity('MILESTONE_UPDATED', `${request.requestCode}: "${milestone.title}" → ${String(data.status || milestone.status)} (progress ${pct}%)`, user.id, requestId)

    // Notify the vendor when their payout is released or reverted
    if (data.payoutStatus === 'RELEASED') {
      const vendorUserId = project.vendorId || request.vendorId
      if (vendorUserId) {
        const payoutAmt = data.vendorPayoutAmount !== undefined ? data.vendorPayoutAmount : milestone.vendorPayoutAmount
        const note = String(data.payoutNote !== undefined ? data.payoutNote : milestone.payoutNote) || ''
        await notifyUser(
          vendorUserId,
          `Payout released — ${request.requestCode}`,
          `Payout for "${milestone.title}"${payoutAmt !== null && payoutAmt !== undefined ? ` (₹${Number(payoutAmt).toLocaleString('en-IN')})` : ''} has been released.${note ? ` Reference: ${note}.` : ''} It should reach your registered ${((project.vendorId ? (await db.vendorProfile.findUnique({ where: { userId: vendorUserId } }))?.payoutMode : '') || 'payout') === 'UPI' ? 'UPI' : 'bank'} account in 1-2 business days.`,
          requestId,
          'PAYMENT'
        )
      }
    } else if (data.payoutStatus === 'PENDING' && milestone.payoutStatus === 'RELEASED') {
      const vendorUserId = project.vendorId || request.vendorId
      if (vendorUserId) {
        await notifyUser(vendorUserId, `Payout reverted — ${request.requestCode}`, `The payout release for "${milestone.title}" was put back on hold by the platform team. Please reach out to your platform contact for details.`, requestId, 'PAYMENT')
      }
    }

    const updated = await db.milestone.findUnique({ where: { id: milestone.id } })
    return ok({ milestone: updated, progress: pct })
  } catch (e) {
    console.error('update milestone failed', e)
    return fail('Failed to update milestone', 500)
  }
}

// DELETE /api/projects/[requestId]/milestones?id=... — remove a milestone
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ requestId: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  if (!canManageProjects(user.role)) return fail('Not authorized', 403)
  const { requestId } = await ctx.params
  const { searchParams } = new URL(req.url)
  const milestoneId = searchParams.get('id') || ''

  const request = await db.serviceRequest.findUnique({ where: { id: requestId }, select: { requestCode: true } })
  const project = await db.project.findUnique({ where: { requestId } })
  if (!project) return fail('Project not found', 404)
  const milestone = await db.milestone.findFirst({ where: { id: milestoneId, projectId: project.id } })
  if (!milestone) return fail('Milestone not found', 404)
  const payments = await db.payment.count({ where: { milestoneId: milestone.id } })
  if (payments > 0) return fail('This milestone has payments linked — waive/remove them first', 400)

  await db.milestone.delete({ where: { id: milestone.id } })
  const pct = await recalcProjectProgress(project.id)
  await logActivity('MILESTONE_DELETED', `${request?.requestCode || requestId}: milestone "${milestone.title}" removed`, user.id, requestId)
  return ok({ deleted: true, progress: pct })
}
