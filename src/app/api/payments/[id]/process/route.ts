import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, generateTransactionId, generateReceiptNo, notifyStaff } from '@/lib/api-helpers'
import { PAYMENT_TYPE_LABELS } from '@/lib/constants'

// POST /api/payments/[id]/process — simulated payment gateway
// In production this endpoint would be replaced by the gateway's server-side
// webhook verification (e.g. Razorpay signature verification) before any
// status is updated. The client never marks a payment as paid — only this
// server-side "gateway callback" does.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  const { id } = await ctx.params

  const payment = await db.payment.findUnique({ where: { id }, include: { request: true } })
  if (!payment) return fail('Payment not found', 404)
  if (user.role === 'CUSTOMER' && payment.request.customerId !== user.id) return fail('Access denied', 403)
  if (payment.status === 'PAID') return fail('Payment already completed', 400)

  try {
    const body = await req.json()
    const method = String(body.method || 'UPI').toUpperCase()
    if (!['UPI', 'CARD', 'NETBANKING', 'BANK_TRANSFER'].includes(method)) return fail('Unsupported payment method', 400)

    // Simulated gateway-side validation of instrument details
    if (method === 'UPI') {
      const vpa = String(body.vpa || '')
      if (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(vpa)) return fail('Enter a valid UPI ID (e.g. name@okhdfcbank)', 400)
    } else if (method === 'CARD') {
      const num = String(body.cardNumber || '').replace(/\s/g, '')
      if (!/^\d{12,19}$/.test(num)) return fail('Enter a valid card number', 400)
      if (!/^\d{2}\/\d{2}$/.test(String(body.expiry || ''))) return fail('Expiry must be in MM/YY format', 400)
      if (!/^\d{3,4}$/.test(String(body.cvv || ''))) return fail('Enter a valid CVV', 400)
    } else if (method === 'NETBANKING' || method === 'BANK_TRANSFER') {
      if (!String(body.bank || '')) return fail('Select your bank', 400)
    }

    // Simulated gateway latency + deterministic success (demo environment).
    await new Promise((r) => setTimeout(r, 1200))
    const success = Math.random() > 0.03

    if (!success) {
      await db.payment.update({ where: { id }, data: { status: 'FAILED', method } })
      await logActivity('PAYMENT_FAILED', `${payment.request.requestCode}: ${payment.type} payment failed at gateway`, user.id, payment.requestId)
      return ok({ status: 'FAILED', message: 'Payment failed at the gateway. No amount was charged. Please try again.' })
    }

    const transactionId = generateTransactionId()
    const receiptNo = generateReceiptNo(payment.request.requestCode, payment.type)

    const paid = await db.payment.update({
      where: { id },
      data: { status: 'PAID', method, transactionId, receiptNo, paidAt: new Date() },
    })

    const request = payment.request

    // --- Workflow effects by payment type ---
    let note = ''
    if (payment.type === 'ADVANCE' || payment.type === 'MANAGED_SERVICE') {
      // Work can start once the advance is in
      if (request.status === 'QUOTATION_ACCEPTED' || request.status === 'AWAITING_PAYMENT') {
        await db.serviceRequest.update({
          where: { id: request.id },
          data: { status: 'PLANNING', stage: 'EXECUTION', progress: Math.max(request.progress, 48) },
        })
        await db.requestStatusHistory.create({
          data: { requestId: request.id, status: 'PLANNING', stage: 'EXECUTION', progress: 48,
            note: `${PAYMENT_TYPE_LABELS[payment.type] || payment.type} of ₹${paid.amount} received (${method}, ${transactionId})`, createdById: user.id },
        })
        note = 'Work planning started'
      }
    } else if (payment.type === 'CONNECTION_FEE') {
      await db.vendorConnection.updateMany({ where: { requestId: request.id, model: 'DIRECT_CONNECTION', status: 'PROPOSED' }, data: { feePaid: true } })
      await db.serviceRequest.update({
        where: { id: request.id },
        data: { pendingAction: null, progress: Math.max(request.progress, 38) },
      })
      note = 'Connection fee settled — the team can now authorize the vendor connection'
    } else if (payment.type === 'MILESTONE' && payment.milestoneId) {
      await db.milestone.update({ where: { id: payment.milestoneId }, data: {} }).catch(() => {})
      note = 'Milestone payment received'
    } else if (payment.type === 'FINAL') {
      if (request.status !== 'COMPLETED' && request.status !== 'CLOSED') {
        await db.serviceRequest.update({
          where: { id: request.id },
          data: { progress: Math.max(request.progress, 92) },
        })
      }
      note = 'Final payment received'
    }

    await logActivity('PAYMENT_SUCCESS', `${request.requestCode}: ${payment.type} payment of ₹${paid.amount} confirmed (${method})`, user.id, request.id)
    await notifyStaff('Payment received', `${request.requestCode}: ₹${paid.amount} (${PAYMENT_TYPE_LABELS[payment.type] || payment.type}) confirmed via ${method}.`, request.id, 'PAYMENT')

    return ok({ status: 'PAID', payment: paid, note })
  } catch (e) {
    console.error('payment process failed', e)
    return fail('Payment processing failed. Please try again.', 500)
  }
}
