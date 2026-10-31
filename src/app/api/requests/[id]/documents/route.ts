import { NextRequest } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, notifyUser, notifyStaff } from '@/lib/api-helpers'
import { isStaffRole } from '@/lib/constants'

const UPLOAD_DIR = path.join(process.cwd(), 'uploads')
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
]

// POST /api/requests/[id]/documents — multipart upload (customer, staff, or connected vendor)
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  const { id } = await ctx.params

  const request = await db.serviceRequest.findUnique({ where: { id } })
  if (!request) return fail('Request not found', 404)

  let role: 'CUSTOMER' | 'STAFF' | 'VENDOR' | null = null
  if (user.role === 'CUSTOMER') role = request.customerId === user.id ? 'CUSTOMER' : null
  else if (isStaffRole(user.role)) role = 'STAFF'
  else if (user.role === 'VENDOR') {
    const project = await db.project.findUnique({ where: { requestId: id }, select: { vendorId: true } })
    const conn = await db.vendorConnection.findFirst({ where: { requestId: id, vendorId: user.id, status: { in: ['AUTHORIZED', 'ACTIVE'] } } })
    role = (project?.vendorId === user.id || conn) ? 'VENDOR' : null
  }
  if (!role) return fail('Access denied', 403)
  if (request.status === 'CANCELLED') return fail('This request is cancelled. Please contact support.', 400)

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return fail('No file provided', 400)
    if (file.size > MAX_SIZE) return fail('File too large (max 10 MB)', 400)
    if (file.size === 0) return fail('File is empty', 400)

    const mime = file.type || 'application/octet-stream'
    if (!ALLOWED_MIME.includes(mime)) {
      return fail('Unsupported file type. Allowed: PDF, images, Word, Excel, CSV, TXT', 400)
    }

    const category = String(form.get('category') || 'OTHER').toUpperCase().slice(0, 30)
    const displayName = String(form.get('name') || file.name).slice(0, 120)
    const documentRequestId = (form.get('documentRequestId') as string) || null
    const isDeliverable = role === 'STAFF' && form.get('deliverable') === 'true'

    // Link to a document request when provided
    let docRequest: { id: string; title: string; status: string } | null = null
    if (documentRequestId) {
      const dr = await db.documentRequest.findFirst({ where: { id: documentRequestId, requestId: id } })
      if (dr) docRequest = { id: dr.id, title: dr.title, status: dr.status }
    }

    // Save file to disk with random name (never trust client filename)
    await mkdir(UPLOAD_DIR, { recursive: true })
    const ext = path.extname(file.name).slice(0, 10) || ''
    const storedName = `${crypto.randomUUID()}${ext}`
    const bytes = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(UPLOAD_DIR, storedName), bytes)

    const doc = await db.document.create({
      data: {
        requestId: id,
        name: displayName,
        fileName: storedName,
        mimeType: mime,
        size: file.size,
        category: isDeliverable ? 'DELIVERABLE' : category,
        status: isDeliverable ? 'SHARED' : 'SUBMITTED',
        isDeliverable,
        documentRequestId: docRequest?.id || null,
        uploadedById: user.id,
      },
    })

    // Document request follows the upload state
    if (docRequest) {
      await db.documentRequest.update({ where: { id: docRequest.id }, data: { status: 'SUBMITTED' } })
    }

    if (isDeliverable) {
      await notifyUser(request.customerId, `Deliverable shared on ${request.requestCode}`, `The team delivered "${displayName}". Download it from your workspace.`, id, 'DOCUMENT')
      await logActivity('DELIVERABLE_SHARED', `${request.requestCode}: deliverable "${displayName}" shared`, user.id, id)
    } else if (role === 'STAFF') {
      await notifyUser(request.customerId, `Document uploaded on ${request.requestCode}`, `"${displayName}" was uploaded by the team.`, id, 'DOCUMENT')
    } else if (role === 'VENDOR') {
      await notifyStaff('Vendor file uploaded', `${request.requestCode}: ${user.name} uploaded "${displayName}".`, id, 'DOCUMENT')
      await logActivity('VENDOR_FILE_UPLOADED', `${request.requestCode}: vendor uploaded "${displayName}"`, user.id, id)
    } else {
      await notifyStaff('Document received on ' + request.requestCode, `${user.name} uploaded "${displayName}"${docRequest ? ` for "${docRequest.title}"` : ''} for review.`, id, 'DOCUMENT')
      await logActivity('DOCUMENT_UPLOADED', `${request.requestCode}: customer uploaded "${displayName}"${docRequest ? ' (requested: ' + docRequest.title + ')' : ''}`, user.id, id)
    }

    return ok({ document: doc }, 201)
  } catch (e) {
    console.error('document upload failed', e)
    return fail('Failed to upload document', 500)
  }
}
