import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireStaff } from '@/lib/auth'
import { ok, fail, logActivity, notifyUser } from '@/lib/api-helpers'

// PATCH /api/documents/[id] — staff reviews a document (approve / reject / request re-upload)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff()
  if (!staff) return fail('Staff access required', 403)
  const { id } = await ctx.params

  const doc = await db.document.findUnique({ where: { id }, include: { request: true } })
  if (!doc) return fail('Document not found', 404)

  try {
    const body = await req.json()
    const status = String(body.status || '').toUpperCase()
    if (!['SUBMITTED', 'APPROVED', 'REJECTED'].includes(status)) return fail('Invalid document status', 400)
    const reviewNote = body.reviewNote !== undefined ? String(body.reviewNote) : doc.reviewNote

    if (status === 'REJECTED' && !reviewNote) {
      return fail('Please add a note explaining why this document is rejected', 400)
    }

    const updated = await db.document.update({ where: { id }, data: { status, reviewNote } })

    // Keep the linked document request in sync with the review decision
    if (doc.documentRequestId) {
      await db.documentRequest.update({
        where: { id: doc.documentRequestId },
        data: { status: status === 'APPROVED' ? 'APPROVED' : status === 'REJECTED' ? 'REJECTED' : 'SUBMITTED' },
      })
    }

    if (status === 'APPROVED') {
      await notifyUser(doc.request.customerId, `Document approved on ${doc.request.requestCode}`, `"${doc.name}" has been approved.`, doc.requestId, 'DOCUMENT')
      await logActivity('DOCUMENT_APPROVED', `${doc.request.requestCode}: "${doc.name}" approved`, staff.id, doc.requestId)
    } else if (status === 'REJECTED') {
      await notifyUser(doc.request.customerId, `Document rejected on ${doc.request.requestCode}`, `"${doc.name}" was rejected. Reason: ${reviewNote}. Please upload a revised copy.`, doc.requestId, 'DOCUMENT')
      await logActivity('DOCUMENT_REJECTED', `${doc.request.requestCode}: "${doc.name}" rejected — ${reviewNote}`, staff.id, doc.requestId)
    }

    return ok({ document: updated })
  } catch (e) {
    console.error('document review failed', e)
    return fail('Failed to review document', 500)
  }
}
