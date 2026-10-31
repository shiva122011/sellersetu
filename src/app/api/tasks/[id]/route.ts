import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity } from '@/lib/api-helpers'

// PATCH /api/tasks/[id] — toggle a task done/not done
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  const { id } = await ctx.params

  const task = await db.pendingTask.findUnique({ where: { id }, include: { request: true } })
  if (!task) return fail('Task not found', 404)
  if (user.role === 'CUSTOMER' && task.request.customerId !== user.id) return fail('Access denied', 403)

  try {
    const body = await req.json()
    const isDone = body.isDone !== undefined ? Boolean(body.isDone) : !task.isDone
    const updated = await db.pendingTask.update({ where: { id }, data: { isDone } })
    await logActivity('TASK_UPDATED', `${task.request.requestCode}: task "${task.title}" ${isDone ? 'completed' : 'reopened'}`, user.id, task.requestId)
    return ok({ task: updated })
  } catch (e) {
    console.error('task update failed', e)
    return fail('Failed to update task', 500)
  }
}
