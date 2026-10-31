import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireStaff } from '@/lib/auth'
import { ok, fail, logActivity, notifyUser } from '@/lib/api-helpers'
import { formatINR } from '@/lib/constants'

// PATCH /api/refunds/[id] — admin approves (processes) or rejects a refund
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff()
  if (!staff || staff.role !== 'ADMIN') return fail('Only admins can decide refunds', 403)
  const { id } = await ctx.params

  const refund = await db.refund.findUnique({
    where: { id },
    include: { request: true },
  })
  if (!refund) return fail('Refund not found', 404)
  if (refund.status !== 'REQUESTED') return fail('This refund has already been decided', 400)

  try {
    const body = await req.json()
    const action = String(body.action || '').toUpperCase()
    const decisionNote = String(body.decisionNote || '').trim() || null
    if (!['PROCESSED', 'REJECTED'].includes(action)) return fail('Action must be PROCESSED or REJECTED', 400)

    const updated = await db.refund.update({
      where: { id },
      data: {
        status: action,
        decisionNote,
        decidedById: staff.id,
        processedAt: action === 'PROCESSED' ? new Date() : null,
      },
    })

    if (action === 'PROCESSED') {
      await notifyUser(
        refund.request.customerId,
        `Refund processed for ${refund.request.requestCode}`,
        `Your refund of ${formatINR(refund.amount)} has been processed to your original payment method. It usually reflects in 5-7 working days.${decisionNote ? ` Note: ${decisionNote}` : ''}`,
        refund.requestId,
        'REFUND'
      )
      await logActivity('REFUND_PROCESSED', `${refund.request.requestCode}: refund of ${formatINR(refund.amount)} processed by ${staff.name}`, staff.id, refund.requestId)
    } else {
      await notifyUser(
        refund.request.customerId,
        `Refund update on ${refund.request.requestCode}`,
        `The refund of ${formatINR(refund.amount)} was not approved.${decisionNote ? ` Reason: ${decisionNote}` : ''} Please check the chat with our team.`,
        refund.requestId,
        'REFUND'
      )
      await logActivity('REFUND_REJECTED', `${refund.request.requestCode}: refund of ${formatINR(refund.amount)} rejected by ${staff.name}`, staff.id, refund.requestId)
    }

    return ok({ refund: updated })
  } catch (e) {
    console.error('refund decision failed', e)
    return fail('Failed to update refund', 500)
  }
}
