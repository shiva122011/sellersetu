import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, notifyUser } from '@/lib/api-helpers'
import { isStaffRole } from '@/lib/constants'

// PATCH /api/document-requests/[id] — staff reviews (APPROVED / REJECTED / WAIVED)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  if (!isStaffRole(user.role)) return fail('Staff access required', 403)
  const { id } = await ctx.params

  const docRequest = await db.documentRequest.findUnique({ where: { id }, include: { request: true } })
  if (!docRequest) return fail('Document request not found', 404)

  try {
    const body = await req.json()
    const status = String(body.status || '')
    if (!['APPROVED', 'REJECTED', 'WAIVED', 'PENDING'].includes(status)) return fail('Invalid status', 400)

    const reviewNote = body.reviewNote !== undefined ? String(body.reviewNote || '') : docRequest.reviewNote
    if (status === 'REJECTED' && !reviewNote) {
      return fail('A rejection reason is required so the customer knows what to fix', 400)
    }

    const updated = await db.documentRequest.update({ where: { id }, data: { status, reviewNote } })

    // Keep linked documents in the same state
    if (['APPROVED', 'REJECTED'].includes(status)) {
      await db.document.updateMany({ where: { documentRequestId: id }, data: { status, reviewNote } })
    }

    if (['APPROVED', 'REJECTED', 'WAIVED'].includes(status)) {
      const label = status === 'APPROVED' ? 'approved' : status === 'REJECTED' ? `rejected — ${reviewNote}` : 'marked as not required'
      await notifyUser(docRequest.request.customerId, `Document update on ${docRequest.request.requestCode}`, `"${docRequest.title}" was ${label}.`, docRequest.requestId, 'DOCUMENT')
    }
    await logActivity('DOCUMENT_REQUEST_REVIEWED', `${docRequest.request.requestCode}: "${docRequest.title}" → ${status}`, user.id, docRequest.requestId)
    return ok({ documentRequest: updated })
  } catch (e) {
    console.error('review document request failed', e)
    return fail('Failed to review document request', 500)
  }
}
