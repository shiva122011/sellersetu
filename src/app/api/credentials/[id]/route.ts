import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, notifyStaff } from '@/lib/api-helpers'

// DELETE /api/credentials/[id] — revoke a vault entry (customer owner or staff)
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  const { id } = await ctx.params

  const entry = await db.credentialShare.findUnique({
    where: { id },
    include: { request: { select: { requestCode: true, customerId: true } } },
  })
  if (!entry) return fail('Credential entry not found', 404)

  const isStaff = user.role === 'ADMIN' || user.role === 'TEAM'
  const isOwner = user.role === 'CUSTOMER' && entry.request.customerId === user.id
  if (!isStaff && !isOwner) return fail('Access denied', 403)

  await db.credentialShare.update({ where: { id }, data: { status: 'REVOKED' } })

  if (isOwner) {
    await notifyStaff('Credential revoked by customer', `"${entry.title}" on ${entry.request.requestCode} was revoked by the customer.`, entry.requestId, 'CREDENTIAL')
  }
  await logActivity('CREDENTIAL_REVOKED', `${entry.request.requestCode}: "${entry.title}" revoked`, user.id, entry.requestId)

  return ok({ revoked: true })
}
