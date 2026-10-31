import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, requireStaff } from '@/lib/auth'
import { ok, fail, logActivity, notifyUser } from '@/lib/api-helpers'
import { formatINR } from '@/lib/constants'

// GET /api/requests/[id]/refunds — refund history (customer sees own; staff see all)
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  const { id } = await ctx.params

  const request = await db.serviceRequest.findUnique({ where: { id } })
  if (!request) return fail('Request not found', 404)
  if (user.role === 'CUSTOMER' && request.customerId !== user.id) return fail('Access denied', 403)

  const refunds = await db.refund.findMany({
    where: { requestId: id },
    include: { initiatedBy: { select: { name: true } }, decidedBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return ok({ refunds })
}

// POST /api/requests/[id]/refunds — staff initiates a refund after case review
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff()
  if (!staff) return fail('Staff access required', 403)
  const { id } = await ctx.params

  const request = await db.serviceRequest.findUnique({
    where: { id },
    include: { payments: true, refunds: true },
  })
  if (!request) return fail('Request not found', 404)

  try {
    const body = await req.json()
    const amount = Math.round(Number(body.amount) || 0)
    const reason = String(body.reason || '').trim()
    const policyNote = String(body.policyNote || '').trim() || null

    if (amount <= 0) return fail('Refund amount must be greater than 0', 400)
    if (!reason) return fail('Please record the reason for the refund (visible to the customer)', 400)

    // Refund cannot exceed what the customer actually paid so far
    const paid = request.payments
      .filter((p) => p.status === 'PAID')
      .reduce((sum, p) => sum + p.amount, 0)
    const alreadyRefunded = request.refunds
      .filter((r) => r.status !== 'REJECTED')
      .reduce((sum, r) => sum + r.amount, 0)
    if (amount > paid - alreadyRefunded) {
      return fail(`Refund cannot exceed the net amount paid (${formatINR(paid - alreadyRefunded)})`, 400)
    }

    const refund = await db.refund.create({
      data: {
        requestId: id,
        amount,
        reason: reason.slice(0, 500),
        policyNote: policyNote ? policyNote.slice(0, 500) : null,
        initiatedById: staff.id,
      },
    })

    await notifyUser(
      request.customerId,
      `Refund initiated on ${request.requestCode}`,
      `A refund of ${formatINR(amount)} has been initiated. Reason: ${reason}. It will be processed to your original payment method.`,
      id,
      'REFUND'
    )
    await logActivity('REFUND_INITIATED', `${request.requestCode}: refund of ${formatINR(amount)} initiated — ${reason}`, staff.id, id)

    return ok({ refund }, 201)
  } catch (e) {
    console.error('refund initiation failed', e)
    return fail('Failed to initiate refund', 500)
  }
}
