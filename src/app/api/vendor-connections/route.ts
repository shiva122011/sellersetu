import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, notifyUser, notifyStaff } from '@/lib/api-helpers'
import { isStaffRole } from '@/lib/constants'

// GET /api/vendor-connections — staff: all; vendor: own; customer: own (via requests)
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)

  const where: Record<string, unknown> = {}
  if (user.role === 'VENDOR') where.vendorId = user.id
  else if (user.role === 'CUSTOMER') where.request = { is: { customerId: user.id } }
  else if (!isStaffRole(user.role)) return fail('Access denied', 403)

  const connections = await db.vendorConnection.findMany({
    where,
    include: {
      vendor: { select: { id: true, name: true, email: true, vendorProfile: { select: { businessName: true, rating: true, status: true } } } },
      request: { select: { id: true, requestCode: true, title: true, status: true, executionModel: true, customerId: true,
        customer: { select: { id: true, name: true, company: true, email: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Confidential commercial data (managed-fee/margin notes, internal platform notes) is staff-only.
  // Customers and vendors must never receive these fields.
  const visible = connections.map((c) => {
    if (isStaffRole(user.role)) return c
    const { managedFeeNote, notes, ...rest } = c
    return rest
  })
  return ok({ connections: visible })
}

// POST /api/vendor-connections — staff proposes a vendor engagement on a request
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  if (!isStaffRole(user.role)) return fail('Staff access required', 403)

  try {
    const body = await req.json()
    const requestId = String(body.requestId || '')
    const vendorId = String(body.vendorId || '')
    const model = String(body.model || 'DIRECT_CONNECTION')

    const request = await db.serviceRequest.findUnique({ where: { id: requestId } })
    if (!request) return fail('Request not found', 404)
    const vendor = await db.user.findFirst({ where: { id: vendorId, role: 'VENDOR' }, include: { vendorProfile: true } })
    if (!vendor || vendor.vendorProfile?.status !== 'APPROVED') return fail('Vendor must be approved', 400)
    if (!['DIRECT_CONNECTION', 'MANAGED'].includes(model)) return fail('Invalid connection model', 400)

    const existing = await db.vendorConnection.findFirst({
      where: { requestId, vendorId, status: { in: ['PROPOSED', 'AUTHORIZED', 'ACTIVE'] } },
    })
    if (existing) return fail('This vendor already has an active engagement on this request', 409)

    const connection = await db.vendorConnection.create({
      data: {
        requestId, vendorId, model,
        status: 'PROPOSED',
        connectionFee: Math.max(0, Number(body.connectionFee) || 0),
        managedFeeNote: body.managedFeeNote ? String(body.managedFeeNote) : '',
        notes: body.notes ? String(body.notes) : '',
      },
      include: { vendor: { select: { id: true, name: true, vendorProfile: { select: { businessName: true } } } } },
    })

    // Keep request vendor + model in sync (and the project row, which gates vendor execution)
    await db.serviceRequest.update({
      where: { id: requestId },
      data: { vendorId, executionModel: model === 'MANAGED' ? 'THIRD_PARTY_MANAGED' : 'DIRECT_CONNECTION' },
    })
    await db.project.updateMany({ where: { requestId }, data: { vendorId } })

    await logActivity('VENDOR_CONNECTION_PROPOSED', `${request.requestCode}: ${model === 'MANAGED' ? 'managed' : 'direct-connection'} engagement proposed with ${vendor.vendorProfile?.businessName}`, user.id, requestId)
    return ok({ connection }, 201)
  } catch (e) {
    console.error('create connection failed', e)
    return fail('Failed to create vendor connection', 500)
  }
}
