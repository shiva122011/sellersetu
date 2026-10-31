import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, requireStaff } from '@/lib/auth'
import { ok, fail, notifyUser } from '@/lib/api-helpers'

// POST /api/requests/[id]/tasks — staff adds a pending task / customer action item
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff()
  if (!staff) return fail('Staff access required', 403)
  const { id } = await ctx.params

  const request = await db.serviceRequest.findUnique({ where: { id } })
  if (!request) return fail('Request not found', 404)

  try {
    const body = await req.json()
    const title = String(body.title || '').trim()
    if (!title) return fail('Task title is required', 400)

    const task = await db.pendingTask.create({
      data: {
        requestId: id,
        title,
        detail: body.detail ? String(body.detail) : null,
        owner: body.owner === 'TEAM' ? 'TEAM' : 'CUSTOMER',
      },
    })

    if (task.owner === 'CUSTOMER') {
      await notifyUser(request.customerId, `New action required on ${request.requestCode}`, title, id, 'DOCUMENT')
    }
    return ok({ task }, 201)
  } catch (e) {
    console.error('add task failed', e)
    return fail('Failed to add task', 500)
  }
}
