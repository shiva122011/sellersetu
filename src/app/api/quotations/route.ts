import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, generateQuotationNo } from '@/lib/api-helpers'
import { canManageQuotations, isStaffRole } from '@/lib/constants'

interface ItemInput { description?: unknown; detail?: unknown; quantity?: unknown; unit?: unknown; unitPrice?: unknown }

function normalizeItems(input: unknown) {
  const list = Array.isArray(input) ? (input as ItemInput[]) : []
  return list
    .map((it, i) => {
      const quantity = Math.max(0, Number(it.quantity) || 0)
      const unitPrice = Math.max(0, Number(it.unitPrice) || 0)
      return {
        description: String(it.description || '').trim().slice(0, 300),
        detail: String(it.detail || '').trim().slice(0, 500),
        quantity,
        unit: String(it.unit || 'lot').slice(0, 20),
        unitPrice,
        amount: Math.round(quantity * unitPrice * 100) / 100,
        sortOrder: i,
      }
    })
    .filter((it) => it.description.length > 0)
}

// GET /api/quotations — staff: all (?requestId= &status=); customer: own (via their requests)
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)

  const { searchParams } = new URL(req.url)
  const requestId = searchParams.get('requestId') || undefined
  const status = searchParams.get('status') || undefined

  const where: Record<string, unknown> = {}
  if (requestId) where.requestId = requestId
  if (status) where.status = status

  if (user.role === 'CUSTOMER') {
    where.request = { is: { customerId: user.id } }
  } else if (!isStaffRole(user.role)) {
    return fail('Access denied', 403)
  }

  const quotations = await db.quotation.findMany({
    where,
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
      request: {
        select: { id: true, requestCode: true, title: true, status: true, executionModel: true,
          customer: { select: { id: true, name: true, company: true, email: true } } },
      },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const visible = quotations.map((q) => {
    if (isStaffRole(user.role)) return q
    const { internalNotes, ...rest } = q
    return rest
  })
  return ok({ quotations: visible })
}

// POST /api/quotations — authorized staff creates a quotation draft for a request
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  if (!canManageQuotations(user.role)) return fail('Not authorized to create quotations', 403)

  try {
    const body = await req.json()
    const requestId = String(body.requestId || '')
    const request = await db.serviceRequest.findUnique({ where: { id: requestId } })
    if (!request) return fail('Request not found', 404)
    if (request.draft) return fail('Submit the request draft before quoting it', 400)

    const items = normalizeItems(body.items)
    if (items.length === 0) return fail('Add at least one line item', 400)

    const gstSetting = await db.systemSetting.findUnique({ where: { key: 'defaultGstRatePct' } })
    const defaultTax = gstSetting ? Number(gstSetting.value) || 0 : 18

    const taxRatePct = body.taxRatePct !== undefined ? Math.max(0, Number(body.taxRatePct) || 0) : defaultTax
    const subtotal = Math.round(items.reduce((s, it) => s + it.amount, 0) * 100) / 100
    const taxAmount = Math.round(subtotal * taxRatePct / 100 * 100) / 100
    const total = Math.round((subtotal + taxAmount) * 100) / 100

    const quotationNo = await generateQuotationNo()
    const quotation = await db.quotation.create({
      data: {
        quotationNo,
        requestId,
        version: 1,
        status: 'DRAFT',
        scope: String(body.scope || '').trim(),
        deliverablesNote: String(body.deliverablesNote || '').trim(),
        timelineNote: String(body.timelineNote || '').trim(),
        paymentTerms: String(body.paymentTerms || '50% advance on acceptance, 50% on delivery').trim(),
        notes: String(body.notes || '').trim(),
        internalNotes: body.internalNotes ? String(body.internalNotes) : null,
        subtotal, taxLabel: String(body.taxLabel || 'GST'), taxRatePct, taxAmount, total,
        validUntil: body.validUntil ? new Date(String(body.validUntil)) : new Date(Date.now() + 15 * 864e5),
        createdById: user.id,
        items: { create: items },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    })

    // Move the request into quotation preparation if it is still in the request stage
    if (['SUBMITTED', 'UNDER_REVIEW', 'MORE_INFO_REQUIRED', 'DISCUSSION_IN_PROGRESS'].includes(request.status)) {
      await db.serviceRequest.update({ where: { id: requestId }, data: { status: 'QUOTATION_PREPARATION', stage: 'QUOTATION', progress: 20 } })
      await db.requestStatusHistory.create({
        data: { requestId, status: 'QUOTATION_PREPARATION', stage: 'QUOTATION', progress: 20, note: `Quotation ${quotationNo} drafted`, createdById: user.id },
      })
    }

    await logActivity('QUOTATION_DRAFTED', `${quotationNo} drafted for ${request.requestCode} (₹${total})`, user.id, requestId)
    return ok({ quotation }, 201)
  } catch (e) {
    console.error('create quotation failed', e)
    return fail('Failed to create quotation', 500)
  }
}
