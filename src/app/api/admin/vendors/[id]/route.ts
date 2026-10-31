import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { ok, fail, logActivity, notifyUser } from '@/lib/api-helpers'

const VENDOR_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']

// PATCH /api/admin/vendors/[id]
// Modes:
//  1. body.status present → approve/reject/suspend decision (as before)
//  2. body.status absent  → company-details update (logo, description, expertise,
//     locations, website, contact/address fields, payout channel, rating, completedProjects)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return fail('Admin access required', 403)
  const { id } = await ctx.params

  const profile = await db.vendorProfile.findUnique({ where: { id }, include: { user: true } })
  if (!profile) return fail('Vendor not found', 404)

  try {
    const body = await req.json()

    // ---- Company-details update mode ----
    if (body.status === undefined) {
      const data: Record<string, unknown> = {}
      if (body.logoUrl !== undefined) data.logoUrl = String(body.logoUrl || '').trim()
      if (body.contactPerson !== undefined) data.contactPerson = String(body.contactPerson).trim()
      if (body.phone !== undefined) data.phone = String(body.phone).trim()
      if (body.website !== undefined) data.website = String(body.website).trim()
      if (body.description !== undefined) data.description = String(body.description).trim()
      if (body.gstin !== undefined) data.gstin = String(body.gstin).trim().toUpperCase()
      if (body.address !== undefined) data.address = String(body.address).trim()
      if (body.city !== undefined) data.city = String(body.city).trim()
      if (body.state !== undefined) data.state = String(body.state).trim()
      // Payout channel is staff-manageable (vendors can also edit their own)
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
      if (body.expertise !== undefined) {
        data.expertise = JSON.stringify(Array.isArray(body.expertise)
          ? body.expertise.map(String).filter(Boolean)
          : String(body.expertise).split(',').map((s) => s.trim()).filter(Boolean))
      }
      if (body.serviceLocations !== undefined) {
        data.serviceLocations = JSON.stringify(Array.isArray(body.serviceLocations)
          ? body.serviceLocations.map(String).filter(Boolean)
          : String(body.serviceLocations).split(',').map((s) => s.trim()).filter(Boolean))
      }
      if (body.rating !== undefined) {
        const r = Number(body.rating)
        if (Number.isNaN(r) || r < 0 || r > 5) return fail('Rating must be between 0 and 5', 400)
        data.rating = r
      }
      if (body.completedProjects !== undefined) {
        const c = Number(body.completedProjects)
        if (Number.isNaN(c) || c < 0) return fail('Completed projects must be a non-negative number', 400)
        data.completedProjects = Math.floor(c)
      }
      if (Object.keys(data).length === 0) return fail('No profile fields to update', 400)

      const updated = await db.vendorProfile.update({ where: { id }, data, include: { user: { select: { id: true, name: true, email: true } } } })
      await logActivity('VENDOR_PROFILE_UPDATED', `Vendor "${updated.businessName}" company details updated by admin`, admin.id, null)
      return ok({ vendor: updated })
    }

    // ---- Status decision mode ----
    const status = String(body.status || '')
    if (!VENDOR_STATUSES.includes(status)) return fail('Invalid vendor status', 400)

    const data: Record<string, unknown> = {
      status,
      reviewNote: body.reviewNote !== undefined ? String(body.reviewNote || '') : profile.reviewNote,
    }
    if (status === 'APPROVED') {
      data.approvedById = admin.id
      data.approvedAt = new Date()
    }
    const updated = await db.vendorProfile.update({ where: { id }, data, include: { user: { select: { id: true, name: true, email: true } } } })

    const messages: Record<string, string> = {
      APPROVED: 'Your vendor account is approved. You can now receive project assignments and direct-connection requests.',
      REJECTED: `Your vendor application was not approved.${body.reviewNote ? ' Note: ' + String(body.reviewNote) : ''}`,
      SUSPENDED: `Your vendor account has been suspended.${body.reviewNote ? ' Note: ' + String(body.reviewNote) : ''}`,
      PENDING: 'Your vendor account was moved back to review.',
    }
    await notifyUser(profile.userId, 'Vendor account update', messages[status] || 'Your vendor status changed.', null, 'VENDOR')
    await logActivity('VENDOR_STATUS_CHANGED', `Vendor "${profile.businessName}" → ${status}`, admin.id, null)
    return ok({ vendor: updated })
  } catch (e) {
    console.error('vendor update failed', e)
    return fail('Failed to update vendor', 500)
  }
}
