import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'
import { getSessionUser, clearSessionCookie } from '@/lib/auth'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)

  // Vendors need their approval status surfaced in the UI
  let vendorProfile: Record<string, unknown> | null = null
  if (user.role === 'VENDOR') {
    const vp = await db.vendorProfile.findUnique({ where: { userId: user.id } })
    if (vp) {
      vendorProfile = {
        id: vp.id, businessName: vp.businessName, logoUrl: vp.logoUrl, status: vp.status,
        contactPerson: vp.contactPerson, phone: vp.phone, gstin: vp.gstin,
        reviewNote: vp.reviewNote, expertise: vp.expertise, serviceLocations: vp.serviceLocations,
        description: vp.description, website: vp.website, rating: vp.rating,
        completedProjects: vp.completedProjects, approvedAt: vp.approvedAt,
        address: vp.address, city: vp.city, state: vp.state,
        payoutMode: vp.payoutMode, payoutAccountName: vp.payoutAccountName,
        payoutAccountNumber: vp.payoutAccountNumber, payoutIfsc: vp.payoutIfsc, payoutUpiId: vp.payoutUpiId,
      }
    }
  }

  return ok({ user: { ...user, vendorProfile } })
}

export async function DELETE() {
  await clearSessionCookie()
  return ok({ loggedOut: true })
}
