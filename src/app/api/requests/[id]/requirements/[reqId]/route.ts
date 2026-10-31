import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireStaff } from '@/lib/auth'
import { ok, fail, logActivity, notifyUser } from '@/lib/api-helpers'

// PATCH /api/requests/[id]/requirements/[reqId] — staff waives or restores a checklist item
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; reqId: string }> }) {
  const staff = await requireStaff()
  if (!staff) return fail('Staff access required', 403)
  const { id, reqId } = await ctx.params

  const requirement = await db.requestRequirement.findUnique({
    where: { id: reqId },
    include: { request: true, service: true },
  })
  if (!requirement || requirement.requestId !== id) return fail('Requirement not found', 404)

  try {
    const body = await req.json()
    const status = String(body.status || '').toUpperCase()
    if (!['WAIVED', 'PENDING'].includes(status)) return fail('Status must be WAIVED or PENDING', 400)

    const updated = await db.requestRequirement.update({ where: { id: reqId }, data: { status } })

    if (status === 'WAIVED') {
      await notifyUser(
        requirement.request.customerId,
        `Document no longer required on ${requirement.request.requestCode}`,
        `"${requirement.label}" (${requirement.service.name}) was marked as not required by the team.`,
        id,
        'DOCUMENT'
      )
      await logActivity('REQUIREMENT_WAIVED', `${requirement.request.requestCode}: "${requirement.label}" waived`, staff.id, id)
    } else {
      await logActivity('REQUIREMENT_RESTORED', `${requirement.request.requestCode}: "${requirement.label}" restored to pending`, staff.id, id)
    }

    return ok({ requirement: updated })
  } catch (e) {
    console.error('requirement update failed', e)
    return fail('Failed to update requirement', 500)
  }
}
