import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, notifyUser, notifyStaff } from '@/lib/api-helpers'
import { isStaffRole } from '@/lib/constants'

// POST /api/vendor-connections/[id] — lifecycle actions
// staff: authorize | cancel | complete
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  if (!isStaffRole(user.role)) return fail('Staff access required', 403)
  const { id } = await ctx.params

  const connection = await db.vendorConnection.findUnique({
    where: { id },
    include: { vendor: { select: { id: true, name: true, vendorProfile: { select: { businessName: true } } } }, request: true },
  })
  if (!connection) return fail('Connection not found', 404)

  try {
    const body = await req.json()
    const action = String(body.action || '')

    if (action === 'authorize') {
      if (connection.status !== 'PROPOSED') return fail('Only proposed connections can be authorized', 400)
      // Direct connections require the connection fee to be settled first
      if (connection.model === 'DIRECT_CONNECTION' && !connection.feePaid) {
        const paid = await db.payment.findFirst({ where: { requestId: connection.requestId, type: 'CONNECTION_FEE', status: 'PAID' } })
        if (!paid) {
          return fail('Record and settle the connection-fee payment first (type: CONNECTION_FEE), then authorize', 400)
        }
        await db.vendorConnection.update({ where: { id }, data: { feePaid: true } })
      }
      const updated = await db.vendorConnection.update({
        where: { id }, data: { status: 'ACTIVE', authorizedAt: new Date() },
      })
      await db.serviceRequest.update({
        where: { id: connection.requestId },
        data: {
          vendorId: connection.vendorId,
          executionModel: connection.model === 'MANAGED' ? 'THIRD_PARTY_MANAGED' : 'DIRECT_CONNECTION',
          status: connection.request.status === 'QUOTATION_ACCEPTED' ? 'ASSIGNED' : connection.request.status,
          stage: connection.request.status === 'QUOTATION_ACCEPTED' ? 'EXECUTION' : connection.request.stage,
          pendingAction: connection.model === 'DIRECT_CONNECTION'
            ? 'Vendor connection authorized — you can now chat with the provider directly'
            : null,
        },
      })
      await db.requestStatusHistory.create({
        data: { requestId: connection.requestId, status: 'ASSIGNED', stage: 'EXECUTION',
          progress: 42, note: `${connection.model === 'MANAGED' ? 'Managed vendor' : 'Direct vendor connection'} authorized: ${connection.vendor.vendorProfile?.businessName}`, createdById: user.id },
      })
      await notifyUser(connection.request.customerId,
        connection.model === 'MANAGED' ? 'Vendor assigned to your project' : 'Vendor connection authorized',
        connection.model === 'MANAGED'
          ? `${connection.vendor.vendorProfile?.businessName} will execute the work under our management.`
          : `${connection.vendor.vendorProfile?.businessName} is now available in your project chat — the service contract is directly between you and them.`,
        connection.requestId, 'VENDOR')
      await notifyUser(connection.vendorId, 'New engagement assigned', `${connection.request.requestCode}: ${connection.request.title}`, connection.requestId, 'VENDOR')
      await logActivity('VENDOR_CONNECTION_AUTHORIZED', `${connection.request.requestCode}: ${connection.vendor.vendorProfile?.businessName} (${connection.model}) authorized`, user.id, connection.requestId)
      // Sync the project row so vendor execution gates (milestones, submissions, chat) unlock
      await db.project.updateMany({ where: { requestId: connection.requestId }, data: { vendorId: connection.vendorId } })
      return ok({ connection: updated })
    }

    if (action === 'complete') {
      if (!['ACTIVE', 'AUTHORIZED'].includes(connection.status)) return fail('Only active connections can be completed', 400)
      const updated = await db.vendorConnection.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date() } })
      const vp = await db.vendorProfile.findUnique({ where: { userId: connection.vendorId } })
      if (vp) {
        await db.vendorProfile.update({ where: { id: vp.id }, data: { completedProjects: vp.completedProjects + 1 } })
      }
      await notifyStaff('Vendor engagement completed', `${connection.request.requestCode}: ${connection.vendor.vendorProfile?.businessName} engagement marked complete.`, connection.requestId, 'VENDOR')
      await logActivity('VENDOR_CONNECTION_COMPLETED', `${connection.request.requestCode}: engagement completed`, user.id, connection.requestId)
      return ok({ connection: updated })
    }

    if (action === 'cancel') {
      if (['COMPLETED', 'CANCELLED'].includes(connection.status)) return fail('Connection already closed', 400)
      const updated = await db.vendorConnection.update({ where: { id }, data: { status: 'CANCELLED' } })
      // Clear the vendor from the project row if it pointed at this vendor
      await db.project.updateMany({ where: { requestId: connection.requestId, vendorId: connection.vendorId }, data: { vendorId: null } })
      await notifyUser(connection.vendorId, 'Engagement cancelled', `${connection.request.requestCode}: the engagement was cancelled by the platform.`, connection.requestId, 'VENDOR')
      await logActivity('VENDOR_CONNECTION_CANCELLED', `${connection.request.requestCode}: engagement cancelled`, user.id, connection.requestId)
      return ok({ connection: updated })
    }

    if (action === 'mark_fee_paid') {
      const updated = await db.vendorConnection.update({ where: { id }, data: { feePaid: true } })
      await logActivity('CONNECTION_FEE_MARKED', `${connection.request.requestCode}: connection fee marked settled`, user.id, connection.requestId)
      return ok({ connection: updated })
    }

    return fail('Invalid action', 400)
  } catch (e) {
    console.error('connection action failed', e)
    return fail('Failed to process connection action', 500)
  }
}
