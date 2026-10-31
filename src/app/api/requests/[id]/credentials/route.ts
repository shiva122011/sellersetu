import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, requireStaff } from '@/lib/auth'
import { ok, fail, logActivity, notifyStaff } from '@/lib/api-helpers'
import { isStaffRole } from '@/lib/constants'
import { encryptVaultPayload, VaultPayload } from '@/lib/crypto'

// GET /api/requests/[id]/credentials — staff: list vault entries (metadata only, never secrets)
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff()
  if (!staff) return fail('Staff access required', 403)
  const { id } = await ctx.params

  const entries = await db.credentialShare.findMany({
    where: { requestId: id },
    select: {
      id: true, title: true, hint: true, status: true, accessCount: true,
      lastAccessedAt: true, createdAt: true, createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return ok({ credentials: entries })
}

// POST /api/requests/[id]/credentials — customer stores access details in the encrypted vault
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  const { id } = await ctx.params

  const request = await db.serviceRequest.findUnique({
    where: { id },
    include: { service: { select: { name: true, category: { select: { name: true } } } } },
  })
  if (!request) return fail('Request not found', 404)
  if (user.role === 'CUSTOMER' && request.customerId !== user.id) return fail('Access denied', 403)
  if (user.role === 'CUSTOMER' && ['CLOSED', 'CANCELLED'].includes(request.status)) {
    return fail('This request is closed. Please contact support.', 400)
  }

  // The vault is available on any submitted engagement (staff or customer) —
  // account/platform onboarding work often needs secure credential handover.
  const isStaff = isStaffRole(user.role)

  try {
    const body = await req.json()
    const title = String(body.title || '').trim()
    if (!title) return fail('Please give this access entry a title (e.g. "Amazon Seller Central")', 400)

    const payload: VaultPayload = {
      loginUrl: String(body.loginUrl || '').trim() || undefined,
      username: String(body.username || '').trim() || undefined,
      password: body.password ? String(body.password) : undefined,
      mfaNote: String(body.mfaNote || '').trim() || undefined,
      recoveryCodes: String(body.recoveryCodes || '').trim() || undefined,
    }
    const hasSecret = payload.username || payload.password || payload.recoveryCodes || payload.mfaNote
    if (!hasSecret) return fail('Add at least one access detail (username, password, MFA or recovery codes)', 400)
    if (body.password && String(body.password).length > 500) return fail('Value too long', 400)

    const { cipherText, iv, authTag } = encryptVaultPayload(payload)
    const hint = String(body.hint || '').trim() || null

    const entry = await db.credentialShare.create({
      data: {
        requestId: id,
        title: title.slice(0, 120),
        hint: hint ? hint.slice(0, 300) : null,
        cipherText, iv, authTag,
        createdById: user.id,
      },
    })

    await notifyStaff(
      'Credentials added to secure vault',
      `${user.name} stored encrypted access details "${entry.title}" on ${request.requestCode}. Reveal from the request's Security tab when needed.`,
      id,
      'CREDENTIAL'
    )
    await logActivity('CREDENTIAL_STORED', `${request.requestCode}: encrypted credential "${entry.title}" stored`, user.id, id)

    return ok({
      credential: {
        id: entry.id, title: entry.title, hint: entry.hint, status: entry.status,
        accessCount: entry.accessCount, lastAccessedAt: entry.lastAccessedAt,
        createdAt: entry.createdAt, createdBy: { name: user.name },
      },
    }, 201)
  } catch (e) {
    console.error('credential store failed', e)
    return fail('Failed to store credentials', 500)
  }
}
