import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, notifyUser, generateInvoiceNo } from '@/lib/api-helpers'
import { isStaffRole } from '@/lib/constants'

// GET /api/invoices — staff: all (?requestId=); customer: own
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  const { searchParams } = new URL(req.url)
  const requestId = searchParams.get('requestId') || undefined

  const where: Record<string, unknown> = {}
  if (requestId) where.requestId = requestId
  if (user.role === 'CUSTOMER') where.request = { is: { customerId: user.id } }
  else if (!isStaffRole(user.role)) return fail('Access denied', 403)

  const invoices = await db.invoice.findMany({
    where,
    include: { request: { select: { requestCode: true, title: true, customer: { select: { name: true, company: true, email: true } } } } },
    orderBy: { issuedAt: 'desc' },
  })
  return ok({ invoices })
}

// POST /api/invoices — staff issues an invoice against a request (optionally a payment/quotation)
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  if (!isStaffRole(user.role)) return fail('Staff access required', 403)

  try {
    const body = await req.json()
    const requestId = String(body.requestId || '')
    const request = await db.serviceRequest.findUnique({
      where: { id: requestId },
      include: { customer: true },
    })
    if (!request) return fail('Request not found', 404)

    const amount = Math.max(0, Number(body.amount) || 0)
    if (amount <= 0) return fail('Invoice amount must be greater than 0', 400)

    const gstSetting = await db.systemSetting.findUnique({ where: { key: 'defaultGstRatePct' } })
    const gstRatePct = body.gstRatePct !== undefined ? Math.max(0, Number(body.gstRatePct) || 0) : Number(gstSetting?.value || 0)
    const gstAmount = Math.round(amount * gstRatePct / 100 * 100) / 100

    const invoiceNo = await generateInvoiceNo()
    const invoice = await db.invoice.create({
      data: {
        invoiceNo,
        requestId,
        paymentId: body.paymentId ? String(body.paymentId) : null,
        quotationId: body.quotationId ? String(body.quotationId) : null,
        type: ['TAX_INVOICE', 'RECEIPT', 'PROFORMA'].includes(String(body.type)) ? String(body.type) : 'TAX_INVOICE',
        description: String(body.description || ''),
        amount, gstRatePct, gstAmount, totalAmount: Math.round((amount + gstAmount) * 100) / 100,
        billToName: String(body.billToName || request.customer.company || request.customer.name),
        billToGstin: body.billToGstin ? String(body.billToGstin).toUpperCase() : null,
        status: 'ISSUED',
        notes: body.notes ? String(body.notes) : null,
        issuedById: user.id,
      },
    })
    if (body.paymentId) {
      await db.invoice.updateMany({ where: { paymentId: String(body.paymentId), id: { not: invoice.id } }, data: {} })
    }
    await notifyUser(request.customerId, `Invoice issued for ${request.requestCode}`, `${invoiceNo} — ₹${invoice.totalAmount.toLocaleString('en-IN')}`, requestId, 'PAYMENT')
    await logActivity('INVOICE_ISSUED', `${request.requestCode}: ${invoiceNo} (₹${invoice.totalAmount})`, user.id, requestId)
    return ok({ invoice }, 201)
  } catch (e) {
    console.error('create invoice failed', e)
    return fail('Failed to issue invoice', 500)
  }
}
