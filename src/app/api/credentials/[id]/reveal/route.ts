import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireStaff } from '@/lib/auth'
import { ok, fail, logActivity, notifyUser } from '@/lib/api-helpers'
import { decryptVaultPayload } from '@/lib/crypto'

// POST /api/credentials/[id]/reveal — staff decrypts a vault entry (audited)
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff()
  if (!staff) return fail('Staff access required', 403)
  const { id } = await ctx.params

  const entry = await db.credentialShare.findUnique({
    where: { id },
    include: { request: { select: { requestCode: true, customerId: true } } },
  })
  if (!entry) return fail('Credential entry not found', 404)
  if (entry.status !== 'ACTIVE') return fail('This credential entry has been revoked', 400)

  try {
    const payload = decryptVaultPayload(entry.cipherText, entry.iv, entry.authTag)

    await db.credentialShare.update({
      where: { id },
      data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
    })

    // Transparency: the customer is told the team viewed the credentials
    await notifyUser(
      entry.request.customerId,
      'Team accessed your stored credentials',
      `${staff.name} viewed "${entry.title}" on ${entry.request.requestCode}.`,
      entry.requestId,
      'CREDENTIAL'
    )
    await logActivity('CREDENTIAL_REVEALED', `${entry.request.requestCode}: "${entry.title}" decrypted by ${staff.name}`, staff.id, entry.requestId)

    return ok({ credential: { id: entry.id, title: entry.title, payload } })
  } catch (e) {
    console.error('credential reveal failed', e)
    return fail('Failed to decrypt credentials — the entry may be corrupted', 500)
  }
}
