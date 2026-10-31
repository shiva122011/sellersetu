import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, notifyStaff, notifyUser } from '@/lib/api-helpers'
import { isStaffRole, PAYMENT_TYPES } from '@/lib/constants'

// GET /api/requests/[id]/payments — payment schedule for a request
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  const { id } = await ctx.params

  const request = await db.serviceRequest.findUnique({ where: { id } })
  if (!request) return fail('Request not found', 404)
  if (user.role === 'CUSTOMER' && request.customerId !== user.id) return fail('Access denied', 403)
  if (user.role === 'VENDOR') return fail('Vendors do not have access to platform payments', 403)

  const payments = await db.payment.findMany({ where: { requestId: id }, orderBy: { createdAt: 'asc' }, include: { milestone: { select: { title: true } } } })
  return ok({ payments })
}

// POST /api/requests/[id]/payments
// customer: initiate payment of an existing PENDING schedule row (quotation-based)
// staff: create a payment schedule row (advance/milestone/final/connection fee/…) linked to the accepted quotation
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  const { id } = await ctx.params

  const request = await db.serviceRequest.findUnique({ where: { id }, include: { payments: true } })
  if (!request) return fail('Request not found', 404)
  if (user.role === 'VENDOR') return fail('Vendors do not have access to platform payments', 403)

  try {
    const body = await req.json()

    // ---------- STAFF: schedule a payment ----------
    if (isStaffRole(user.role)) {
      const type = String(body.type || '').toUpperCase()
      if (!PAYMENT_TYPES.includes(type as never)) return fail('Invalid payment type', 400)
      const amount = Math.max(0, Number(body.amount) || 0)
      if (amount <= 0) return fail('Amount must be greater than 0', 400)

      let quotationId: string | null = null
      if (body.quotationId) {
        const q = await db.quotation.findFirst({ where: { id: String(body.quotationId), requestId: id } })
        if (q?.status !== 'ACCEPTED' && q) quotationId = q.id
        else if (q) quotationId = q.id
      } else {
        const accepted = await db.quotation.findFirst({ where: { requestId: id, status: 'ACCEPTED' } })
        quotationId = accepted?.id ?? null
      }

      let milestoneId: string | null = null
      if (body.milestoneId) {
        const milestone = await db.milestone.findFirst({ where: { id: String(body.milestoneId), project: { is: { requestId: id } } } })
        if (!milestone) return fail('Milestone not found on this request', 400)
        milestoneId = milestone.id
      }

      const payment = await db.payment.create({
        data: {
          requestId: id, quotationId, milestoneId, type,
          label: String(body.label || '').slice(0, 120),
          amount, status: 'PENDING',
          note: body.note ? String(body.note) : null,
        },
        include: { milestone: { select: { title: true } } },
      })
      await notifyUser(request.customerId, `Payment scheduled for ${request.requestCode}`, `${payment.label || type} — ₹${amount.toLocaleString('en-IN')}. Pay from your dashboard when ready.`, id, 'PAYMENT')
      await logActivity('PAYMENT_SCHEDULED', `${request.requestCode}: ${type} ₹${amount} scheduled`, user.id, id)
      return ok({ payment }, 201)
    }

    // ---------- CUSTOMER: pay a scheduled row ----------
    if (user.role !== 'CUSTOMER') return fail('Access denied', 403)
    if (request.customerId !== user.id) return fail('Access denied', 403)

    const paymentId = String(body.paymentId || '')
    if (!paymentId) return fail('paymentId is required', 400)
    const payment = await db.payment.findFirst({ where: { id: paymentId, requestId: id } })
    if (!payment) return fail('Payment not found on this request', 404)
    if (payment.status === 'PAID') return fail('This payment is already completed', 400)
    if (payment.status === 'REFUNDED') return fail('This payment was refunded — contact support', 400)

    await logActivity('PAYMENT_INITIATED', `${request.requestCode}: ${payment.type} payment of ₹${payment.amount} initiated`, user.id, id)
    await notifyStaff('Payment initiated', `${user.name} started paying "${payment.label || payment.type}" (₹${payment.amount}) on ${request.requestCode}.`, id, 'PAYMENT')

    return ok({ payment }, 200)
  } catch (e) {
    console.error('payment action failed', e)
    return fail('Failed to process payment action', 500)
  }
}
