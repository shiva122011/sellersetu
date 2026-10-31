import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity } from '@/lib/api-helpers'
import { isStaffRole } from '@/lib/constants'

// GET /api/vendors — vendor: own profile; staff: list (?status=)
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)

  if (user.role === 'VENDOR') {
    const profile = await db.vendorProfile.findUnique({
      where: { userId: user.id },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    })
    return ok({ profile })
  }

  if (!isStaffRole(user.role)) return fail('Access denied', 403)
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || undefined

  const vendors = await db.vendorProfile.findMany({
    where: status ? { status } : undefined,
    include: { user: { select: { id: true, name: true, email: true, phone: true, createdAt: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return ok({ vendors })
}

// PATCH /api/vendors — vendor updates own profile (business details + payout channel)
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  if (user.role !== 'VENDOR') return fail('Vendor access required', 403)

  const profile = await db.vendorProfile.findUnique({ where: { userId: user.id } })
  if (!profile) return fail('Vendor profile not found', 404)

  try {
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if (body.businessName !== undefined) data.businessName = String(body.businessName).trim()
    if (body.contactPerson !== undefined) data.contactPerson = String(body.contactPerson).trim()
    if (body.phone !== undefined) data.phone = String(body.phone).trim()
    if (body.website !== undefined) data.website = String(body.website).trim()
    if (body.description !== undefined) data.description = String(body.description).trim()
    if (body.gstin !== undefined) data.gstin = String(body.gstin).trim().toUpperCase()
    if (body.logoUrl !== undefined) data.logoUrl = String(body.logoUrl).trim()
    if (body.address !== undefined) data.address = String(body.address).trim()
    if (body.city !== undefined) data.city = String(body.city).trim()
    if (body.state !== undefined) data.state = String(body.state).trim()
    if (body.expertise !== undefined) {
      data.expertise = JSON.stringify(Array.isArray(body.expertise) ? body.expertise.map(String).filter(Boolean) : String(body.expertise).split(',').map((s: string) => s.trim()).filter(Boolean))
    }
    if (body.serviceLocations !== undefined) {
      data.serviceLocations = JSON.stringify(Array.isArray(body.serviceLocations) ? body.serviceLocations.map(String).filter(Boolean) : String(body.serviceLocations).split(',').map((s: string) => s.trim()).filter(Boolean))
    }

    // ---- Payout channel (used by the platform to release vendor payments) ----
    if (body.payoutMode !== undefined) {
      const mode = String(body.payoutMode).trim().toUpperCase()
      if (!['', 'BANK', 'UPI'].includes(mode)) return fail('Payout mode must be BANK, UPI or empty', 400)
      data.payoutMode = mode
    }
    if (body.payoutAccountName !== undefined) data.payoutAccountName = String(body.payoutAccountName).trim()
    if (body.payoutAccountNumber !== undefined) {
      const acc = String(body.payoutAccountNumber).trim()
      if (acc && !/^[0-9]{6,20}$/.test(acc)) return fail('Bank account number must be 6-20 digits', 400)
      data.payoutAccountNumber = acc
    }
    if (body.payoutIfsc !== undefined) {
      const ifsc = String(body.payoutIfsc).trim().toUpperCase()
      if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return fail('IFSC must look like HDFC0001234', 400)
      data.payoutIfsc = ifsc
    }
    if (body.payoutUpiId !== undefined) {
      const upi = String(body.payoutUpiId).trim().toLowerCase()
      if (upi && !/^[a-z0-9._-]{2,}@[a-z]{2,}$/.test(upi)) return fail('UPI ID must look like name@bank', 400)
      data.payoutUpiId = upi
    }

    const updated = await db.vendorProfile.update({ where: { id: profile.id }, data })
    await logActivity('VENDOR_PROFILE_UPDATED', `Vendor "${updated.businessName}" updated profile`, user.id, null)
    return ok({ profile: updated })
  } catch (e) {
    console.error('update vendor profile failed', e)
    return fail('Failed to update profile', 500)
  }
}
