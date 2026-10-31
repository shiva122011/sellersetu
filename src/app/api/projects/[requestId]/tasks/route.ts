import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, notifyUser } from '@/lib/api-helpers'
import { canManageProjects, isStaffRole } from '@/lib/constants'

const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']

// POST /api/projects/[requestId]/tasks — create a project task (staff)
export async function POST(req: NextRequest, ctx: { params: Promise<{ requestId: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  if (!canManageProjects(user.role) && user.role !== 'EMPLOYEE') return fail('Not authorized', 403)
  const { requestId } = await ctx.params

  const request = await db.serviceRequest.findUnique({ where: { id: requestId }, select: { id: true, requestCode: true, vendorId: true } })
  if (!request) return fail('Request not found', 404)
  const project = await db.project.findUnique({ where: { requestId } })
  if (!project) return fail('Project not found', 404)

  try {
    const body = await req.json()
    const title = String(body.title || '').trim()
    if (!title) return fail('Task title is required', 400)
    let assigneeId: string | null = null
    if (body.assigneeId) {
      const assignee = await db.user.findUnique({ where: { id: String(body.assigneeId) } })
      // Staff are always assignable; the connected vendor is assignable too (they execute the work)
      const isVendorAssignee = assignee?.role === 'VENDOR' && (assignee.id === request.vendorId || assignee.id === project.vendorId)
      if (!assignee || (!isStaffRole(assignee.role) && !isVendorAssignee)) {
        return fail('Assignee must be a staff member or the connected vendor', 400)
      }
      assigneeId = assignee.id
    }
    const task = await db.projectTask.create({
      data: {
        projectId: project.id,
        title,
        detail: String(body.detail || ''),
        assigneeId,
        status: 'TODO',
        dueDate: body.dueDate ? new Date(String(body.dueDate)) : null,
      },
    })
    if (assigneeId) await notifyUser(assigneeId, 'New task assigned', `${request.requestCode}: ${title}`, requestId, 'STATUS')
    return ok({ task }, 201)
  } catch (e) {
    console.error('create task failed', e)
    return fail('Failed to create task', 500)
  }
}

// PATCH /api/projects/[requestId]/tasks — update by id in body
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ requestId: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  const { requestId } = await ctx.params
  const request = await db.serviceRequest.findUnique({ where: { id: requestId }, select: { requestCode: true, vendorId: true } })
  const project = await db.project.findUnique({ where: { requestId } })
  if (!project) return fail('Project not found', 404)

  try {
    const body = await req.json()
    const taskId = String(body.id || '')
    const task = await db.projectTask.findFirst({ where: { id: taskId, projectId: project.id } })
    if (!task) return fail('Task not found', 404)

    const isVendor = user.role === 'VENDOR' && project.vendorId === user.id
    const isAssignee = task.assigneeId === user.id
    if (!isStaffRole(user.role) && !isVendor && !isAssignee) return fail('Access denied', 403)

    const data: Record<string, unknown> = {}
    if (isVendor || isAssignee) {
      if (body.status !== undefined) {
        const status = String(body.status)
        if (!TASK_STATUSES.includes(status)) return fail('Invalid task status', 400)
        data.status = status
      }
    } else if (canManageProjects(user.role) || user.role === 'EMPLOYEE') {
      if (body.title !== undefined) data.title = String(body.title).trim()
      if (body.detail !== undefined) data.detail = String(body.detail)
      if (body.status !== undefined) {
        const status = String(body.status)
        if (!TASK_STATUSES.includes(status)) return fail('Invalid task status', 400)
        data.status = status
      }
      if (body.assigneeId !== undefined) {
        if (body.assigneeId) {
          const assignee = await db.user.findUnique({ where: { id: String(body.assigneeId) } })
          const isVendorAssignee = assignee?.role === 'VENDOR' && (assignee.id === request?.vendorId || assignee.id === project.vendorId)
          if (!assignee || (!isStaffRole(assignee.role) && !isVendorAssignee)) {
            return fail('Assignee must be a staff member or the connected vendor', 400)
          }
          data.assigneeId = assignee.id
        } else data.assigneeId = null
      }
      if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(String(body.dueDate)) : null
    }

    const updated = await db.projectTask.update({ where: { id: task.id }, data, include: { assignee: { select: { id: true, name: true } } } })
    await logActivity('TASK_UPDATED', `${request?.requestCode || ''}: task "${updated.title}" → ${updated.status}`, user.id, requestId)
    return ok({ task: updated })
  } catch (e) {
    console.error('update task failed', e)
    return fail('Failed to update task', 500)
  }
}
