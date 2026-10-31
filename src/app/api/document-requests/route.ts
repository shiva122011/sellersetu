import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, notifyUser, notifyStaff } from '@/lib/api-helpers'
import { isStaffRole } from '@/lib/constants'

// POST /api/document-requests — staff requests a document from the customer
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  if (!isStaffRole(user.role)) return fail('Staff access required', 403)

  try {
    const body = await req.json()
    const requestId = String(body.requestId || '')
    const title = String(body.title || '').trim()
    if (!title) return fail('Document title is required', 400)
    const request = await db.serviceRequest.findUnique({ where: { id: requestId } })
    if (!request) return fail('Request not found', 404)

    const docRequest = await db.documentRequest.create({
      data: {
        requestId,
        title,
        description: String(body.description || ''),
        category: String(body.category || 'OTHER').toUpperCase(),
        mandatory: body.mandatory !== false,
        source: 'STAFF',
        status: 'PENDING',
        dueDate: body.dueDate ? new Date(String(body.dueDate)) : null,
        requestedById: user.id,
      },
    })
    await notifyUser(request.customerId, `Document requested on ${request.requestCode}`, `"${title}" — upload it from your dashboard${body.dueDate ? ' by ' + new Date(String(body.dueDate)).toLocaleDateString('en-IN') : ''}.`, requestId, 'DOCUMENT')
    await logActivity('DOCUMENT_REQUESTED', `${request.requestCode}: "${title}" requested`, user.id, requestId)
    return ok({ documentRequest: docRequest }, 201)
  } catch (e) {
    console.error('create document request failed', e)
    return fail('Failed to create document request', 500)
  }
}
