import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, notifyUser, notifyStaff } from '@/lib/api-helpers'
import { canManageQuotations, isStaffRole, STATUS_STAGE, SUGGESTED_PROGRESS } from '@/lib/constants'

type Auth = { id: string; role: string }

async function loadQuotation(id: string) {
  return db.quotation.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
      request: { select: { id: true, requestCode: true, title: true, customerId: true, vendorId: true, status: true, executionModel: true } },
      createdBy: { select: { name: true } },
    },
  })
}

function assertQuotationAccess(q: NonNullable<Awaited<ReturnType<typeof loadQuotation>>>, user: Auth) {
  if (isStaffRole(user.role)) return true
  if (user.role === 'CUSTOMER') return q.request.customerId === user.id
  return false
}

// GET /api/quotations/[id]
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  const { id } = await ctx.params
  const q = await loadQuotation(id)
  if (!q) return fail('Quotation not found', 404)
  if (!assertQuotationAccess(q, user)) return fail('Access denied', 403)
  if (!isStaffRole(user.role)) {
    const { internalNotes, ...rest } = q
    return ok({ quotation: rest })
  }
  return ok({ quotation: q })
}

// PATCH /api/quotations/[id] — edit a DRAFT (authorized staff only)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  if (!canManageQuotations(user.role)) return fail('Not authorized to edit quotations', 403)
  const { id } = await ctx.params
  const q = await db.quotation.findUnique({ where: { id }, include: { items: true } })
  if (!q) return fail('Quotation not found', 404)
  if (!['DRAFT'].includes(q.status)) {
    return fail('Only draft quotations can be edited. Send it, or create a revision instead.', 400)
  }

  try {
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if (body.scope !== undefined) data.scope = String(body.scope).trim()
    if (body.deliverablesNote !== undefined) data.deliverablesNote = String(body.deliverablesNote).trim()
    if (body.timelineNote !== undefined) data.timelineNote = String(body.timelineNote).trim()
    if (body.paymentTerms !== undefined) data.paymentTerms = String(body.paymentTerms).trim()
    if (body.notes !== undefined) data.notes = String(body.notes).trim()
    if (body.internalNotes !== undefined) data.internalNotes = body.internalNotes ? String(body.internalNotes) : null
    if (body.taxLabel !== undefined) data.taxLabel = String(body.taxLabel || 'GST')
    if (body.taxRatePct !== undefined) data.taxRatePct = Math.max(0, Number(body.taxRatePct) || 0)
    if (body.validUntil !== undefined) data.validUntil = body.validUntil ? new Date(String(body.validUntil)) : null

    if (Array.isArray(body.items)) {
      const items = (body.items as { description?: unknown; detail?: unknown; quantity?: unknown; unit?: unknown; unitPrice?: unknown }[])
        .map((it, i) => {
          const quantity = Math.max(0, Number(it.quantity) || 0)
          const unitPrice = Math.max(0, Number(it.unitPrice) || 0)
          return {
            description: String(it.description || '').trim().slice(0, 300),
            detail: String(it.detail || '').trim().slice(0, 500),
            quantity, unit: String(it.unit || 'lot').slice(0, 20), unitPrice,
            amount: Math.round(quantity * unitPrice * 100) / 100, sortOrder: i,
          }
        })
        .filter((it) => it.description.length > 0)
      if (items.length === 0) return fail('Add at least one line item', 400)
      await db.quotationItem.deleteMany({ where: { quotationId: id } })
      await db.quotationItem.createMany({ data: items.map((it) => ({ ...it, quotationId: id })) })
      const subtotal = Math.round(items.reduce((s, it) => s + it.amount, 0) * 100) / 100
      const taxRate = (data.taxRatePct as number) ?? q.taxRatePct
      data.subtotal = subtotal
      data.taxAmount = Math.round(subtotal * taxRate / 100 * 100) / 100
      data.total = Math.round((subtotal + (data.taxAmount as number)) * 100) / 100
    } else if (data.taxRatePct !== undefined) {
      data.taxAmount = Math.round(q.subtotal * (data.taxRatePct as number) / 100 * 100) / 100
      data.total = Math.round((q.subtotal + (data.taxAmount as number)) * 100) / 100
    }

    const quotation = await db.quotation.update({ where: { id }, data, include: { items: { orderBy: { sortOrder: 'asc' } } } })
    await logActivity('QUOTATION_UPDATED', `${q.quotationNo} draft updated (₹${quotation.total})`, user.id, q.requestId)
    return ok({ quotation })
  } catch (e) {
    console.error('update quotation failed', e)
    return fail('Failed to update quotation', 500)
  }
}

// POST /api/quotations/[id] — workflow actions
// staff: send | revise
// customer: accept | reject | request_revision
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  const { id } = await ctx.params
  const q = await loadQuotation(id)
  if (!q) return fail('Quotation not found', 404)
  if (!assertQuotationAccess(q, user)) return fail('Access denied', 403)

  try {
    const body = await req.json()
    const action = String(body.action || '')

    // ---------- SEND (staff) ----------
    if (action === 'send') {
      if (!canManageQuotations(user.role)) return fail('Not authorized to send quotations', 403)
      if (q.status !== 'DRAFT') return fail('Only draft quotations can be sent', 400)
      const quotation = await db.quotation.update({
        where: { id }, data: { status: 'SENT', sentAt: new Date() }, include: { items: { orderBy: { sortOrder: 'asc' } } },
      })
      // Supersede other live quotations on this request
      await db.quotation.updateMany({
        where: { requestId: q.requestId, id: { not: id }, status: { in: ['SENT', 'NEGOTIATION', 'REVISION_REQUESTED'] } },
        data: { status: 'SUPERSEDED' },
      })
      await db.serviceRequest.update({
        where: { id: q.requestId },
        data: { status: 'QUOTATION_SENT', stage: 'QUOTATION', progress: SUGGESTED_PROGRESS.QUOTATION_SENT ?? 25, pendingAction: 'Review the quotation and respond' },
      })
      await db.requestStatusHistory.create({
        data: { requestId: q.requestId, status: 'QUOTATION_SENT', stage: 'QUOTATION', progress: SUGGESTED_PROGRESS.QUOTATION_SENT ?? 25, note: `Quotation ${q.quotationNo} sent (₹${q.total})`, createdById: user.id },
      })
      await notifyUser(q.request.customerId, `Quotation ready for ${q.request.requestCode}`, `${q.quotationNo} — ₹${q.total.toLocaleString('en-IN')}. Review and respond in your dashboard.`, q.requestId, 'QUOTATION')
      await logActivity('QUOTATION_SENT', `${q.quotationNo} sent for ${q.request.requestCode}`, user.id, q.requestId)
      return ok({ quotation })
    }

    // ---------- REVISE (staff) — creates a new version ----------
    if (action === 'revise') {
      if (!canManageQuotations(user.role)) return fail('Not authorized to revise quotations', 403)
      if (!['SENT', 'NEGOTIATION', 'REVISION_REQUESTED'].includes(q.status)) {
        return fail('Only live quotations can be revised', 400)
      }
      const maxVersion = await db.quotation.aggregate({ where: { requestId: q.requestId }, _max: { version: true } })
      const newVersion = (maxVersion._max.version || 0) + 1
      const revisionNo = q.quotationNo.replace(/-R\d+$/, '') + `-R${newVersion}`
      const quotation = await db.quotation.create({
        data: {
          quotationNo: revisionNo, requestId: q.requestId, version: newVersion, parentQuotationId: q.id,
          status: 'DRAFT',
          scope: body.scope !== undefined ? String(body.scope).trim() : q.scope,
          deliverablesNote: body.deliverablesNote !== undefined ? String(body.deliverablesNote).trim() : q.deliverablesNote,
          timelineNote: body.timelineNote !== undefined ? String(body.timelineNote).trim() : q.timelineNote,
          paymentTerms: body.paymentTerms !== undefined ? String(body.paymentTerms).trim() : q.paymentTerms,
          notes: body.notes !== undefined ? String(body.notes).trim() : q.notes,
          internalNotes: body.internalNotes !== undefined ? (body.internalNotes ? String(body.internalNotes) : null) : q.internalNotes,
          taxLabel: q.taxLabel,
          taxRatePct: body.taxRatePct !== undefined ? Math.max(0, Number(body.taxRatePct) || 0) : q.taxRatePct,
          validUntil: body.validUntil ? new Date(String(body.validUntil)) : new Date(Date.now() + 15 * 864e5),
          createdById: user.id,
          items: {
            create: Array.isArray(body.items) && body.items.length
              ? (body.items as { description?: unknown; detail?: unknown; quantity?: unknown; unit?: unknown; unitPrice?: unknown }[]).map((it, i) => {
                  const quantity = Math.max(0, Number(it.quantity) || 0)
                  const unitPrice = Math.max(0, Number(it.unitPrice) || 0)
                  return {
                    description: String(it.description || '').trim().slice(0, 300),
                    detail: String(it.detail || '').trim().slice(0, 500),
                    quantity, unit: String(it.unit || 'lot').slice(0, 20), unitPrice,
                    amount: Math.round(quantity * unitPrice * 100) / 100, sortOrder: i,
                  }
                }).filter((it) => it.description.length > 0)
              : q.items.map((it, i) => ({
                  description: it.description, detail: it.detail, quantity: it.quantity,
                  unit: it.unit, unitPrice: it.unitPrice, amount: it.amount, sortOrder: i,
                })),
          },
        },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      })
      // Recompute totals on the revision
      const subtotal = Math.round(quotation.items.reduce((s, it) => s + it.amount, 0) * 100) / 100
      const taxAmount = Math.round(subtotal * quotation.taxRatePct / 100 * 100) / 100
      const updated = await db.quotation.update({
        where: { id: quotation.id }, data: { subtotal, taxAmount, total: Math.round((subtotal + taxAmount) * 100) / 100 },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      })
      await db.serviceRequest.update({ where: { id: q.requestId }, data: { status: 'QUOTATION_PREPARATION', stage: 'QUOTATION', progress: SUGGESTED_PROGRESS.QUOTATION_PREPARATION ?? 20 } })
      await logActivity('QUOTATION_REVISED', `${q.quotationNo} → revision v${newVersion} (${updated.quotationNo})`, user.id, q.requestId)
      return ok({ quotation: updated })
    }

    // ---------- CUSTOMER actions ----------
    if (user.role === 'CUSTOMER') {
      if (q.request.customerId !== user.id) return fail('Access denied', 403)

      if (action === 'accept') {
        if (!['SENT', 'NEGOTIATION', 'REVISION_REQUESTED'].includes(q.status)) {
          return fail('This quotation is not open for acceptance', 400)
        }
        const quotation = await db.quotation.update({
          where: { id }, data: { status: 'ACCEPTED', lockedAt: new Date(), acceptedAt: new Date() },
          include: { items: { orderBy: { sortOrder: 'asc' } } },
        })
        await db.quotation.updateMany({
          where: { requestId: q.requestId, id: { not: id }, status: { in: ['SENT', 'NEGOTIATION', 'REVISION_REQUESTED', 'DRAFT'] } },
          data: { status: 'SUPERSEDED' },
        })
        // Project workspace is created on acceptance (inherits the vendor if one was connected pre-acceptance)
        const existingProject = await db.project.findUnique({ where: { requestId: q.requestId } })
        if (!existingProject) {
          await db.project.create({
            data: { requestId: q.requestId, status: 'PLANNING', executionModel: q.request.executionModel, vendorId: q.request.vendorId },
          })
        } else if (q.request.vendorId && !existingProject.vendorId) {
          await db.project.update({ where: { id: existingProject.id }, data: { vendorId: q.request.vendorId } })
        }
        await db.serviceRequest.update({
          where: { id: q.requestId },
          data: { status: 'QUOTATION_ACCEPTED', stage: 'QUOTATION', progress: SUGGESTED_PROGRESS.QUOTATION_ACCEPTED ?? 35, pendingAction: null },
        })
        await db.requestStatusHistory.create({
          data: { requestId: q.requestId, status: 'QUOTATION_ACCEPTED', stage: 'QUOTATION', progress: SUGGESTED_PROGRESS.QUOTATION_ACCEPTED ?? 35, note: `Quotation ${q.quotationNo} accepted (₹${q.total}) — commercial record locked`, createdById: user.id },
        })
        await db.pendingTask.createMany({ data: [
          { requestId: q.requestId, title: 'Plan milestones and schedule payments as per accepted terms', owner: 'TEAM' },
        ] })
        await notifyStaff('Quotation accepted', `${q.request.requestCode}: customer accepted ${q.quotationNo} (₹${q.total}). Project workspace created.`, q.requestId, 'QUOTATION')
        await logActivity('QUOTATION_ACCEPTED', `${q.request.requestCode}: ${q.quotationNo} accepted (₹${q.total})`, user.id, q.requestId)
        return ok({ quotation })
      }

      if (action === 'reject') {
        if (!['SENT', 'NEGOTIATION', 'REVISION_REQUESTED'].includes(q.status)) {
          return fail('This quotation is not open for response', 400)
        }
        const quotation = await db.quotation.update({
          where: { id }, data: { status: 'REJECTED', customerNote: body.note ? String(body.note).slice(0, 1000) : null },
        })
        await db.serviceRequest.update({
          where: { id: q.requestId },
          data: { status: 'QUOTATION_REJECTED', stage: 'QUOTATION', progress: SUGGESTED_PROGRESS.QUOTATION_REJECTED ?? 0 },
        })
        await db.requestStatusHistory.create({
          data: { requestId: q.requestId, status: 'QUOTATION_REJECTED', stage: 'QUOTATION', progress: 0, note: `Quotation ${q.quotationNo} rejected${body.note ? ': ' + String(body.note).slice(0, 200) : ''}`, createdById: user.id },
        })
        await notifyStaff('Quotation rejected', `${q.request.requestCode}: customer rejected ${q.quotationNo}.${body.note ? ' Note: ' + String(body.note).slice(0, 200) : ''}`, q.requestId, 'QUOTATION')
        await logActivity('QUOTATION_REJECTED', `${q.request.requestCode}: ${q.quotationNo} rejected`, user.id, q.requestId)
        return ok({ quotation })
      }

      if (action === 'request_revision') {
        if (!['SENT', 'NEGOTIATION'].includes(q.status)) {
          return fail('A revision is already requested or this quotation is closed', 400)
        }
        const note = String(body.note || '').trim()
        if (!note) return fail('Please tell the team what you would like changed', 400)
        const quotation = await db.quotation.update({
          where: { id }, data: { status: 'REVISION_REQUESTED', customerNote: note.slice(0, 1000) },
        })
        await db.serviceRequest.update({
          where: { id: q.requestId },
          data: { status: 'REVISION_REQUESTED', stage: 'QUOTATION', progress: SUGGESTED_PROGRESS.REVISION_REQUESTED ?? 28, pendingAction: 'Team: prepare the requested quotation revision' },
        })
        await db.requestStatusHistory.create({
          data: { requestId: q.requestId, status: 'REVISION_REQUESTED', stage: 'QUOTATION', progress: SUGGESTED_PROGRESS.REVISION_REQUESTED ?? 28, note: `Revision requested on ${q.quotationNo}: ${note.slice(0, 200)}`, createdById: user.id },
        })
        await notifyStaff('Quotation revision requested', `${q.request.requestCode}: ${q.quotationNo} — "${note.slice(0, 200)}"`, q.requestId, 'QUOTATION')
        await logActivity('QUOTATION_REVISION_REQUESTED', `${q.request.requestCode}: revision requested on ${q.quotationNo}`, user.id, q.requestId)
        return ok({ quotation })
      }

      return fail('Invalid action', 400)
    }

    return fail('Access denied', 403)
  } catch (e) {
    console.error('quotation action failed', e)
    return fail('Failed to process quotation action', 500)
  }
}
