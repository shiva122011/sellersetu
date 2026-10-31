import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, notifyStaff, canOwnConnection } from '@/lib/api-helpers'
import { amazonLiveConfigured, bootstrapConnection, encryptToken } from '@/lib/marketplace/sync'
import { getProvider } from '@/lib/marketplace/sync'
import { isSandboxMode } from '@/lib/marketplace/settings'
import { MARKETPLACE_LABELS } from '@/lib/marketplace/types'

// Customer marketplace connections — Phase 1: Amazon Seller Central.
// REAL SP-API only: a connection exists exclusively through Amazon's official
// authorization. No demo/simulated data path exists.

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'sellersetu-dev-secret-change-in-production'
)

// Short-lived signed state for the OAuth round-trip.
async function signOAuthState(customerId: string): Promise<string> {
  return new SignJWT({ customerId, purpose: 'mp-oauth' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(SECRET)
}

function connectionView(c: {
  id: string
  marketplace: string
  status: string
  sellerId: string | null
  sellerName: string | null
  region: string | null
  autoSyncEnabled: boolean
  authorizedAt: Date | null
  lastSyncAt: Date | null
  lastSyncError: string | null
  createdAt: Date
}) {
  return {
    id: c.id,
    marketplace: c.marketplace,
    marketplaceLabel: MARKETPLACE_LABELS[c.marketplace] || c.marketplace,
    status: c.status,
    sellerId: c.sellerId,
    sellerName: c.sellerName,
    region: c.region,
    autoSyncEnabled: c.autoSyncEnabled,
    authorizedAt: c.authorizedAt,
    lastSyncAt: c.lastSyncAt,
    lastSyncError: c.lastSyncError,
    createdAt: c.createdAt,
    // Tokens intentionally never leave the server.
  }
}

// GET — list my connections + whether the platform SP-API app is configured
// (customers AND admins who connected their own seller account)
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('Unauthorized', 401)
  if (!canOwnConnection(user.role)) return fail('Only sellers (customers/administrators) manage marketplace connections here', 403)

  const [connections, liveConfigured, sandboxMode] = await Promise.all([
    db.marketplaceConnection.findMany({
      where: { customerId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, marketplace: true, status: true, sellerId: true,
        sellerName: true, region: true, autoSyncEnabled: true, authorizedAt: true,
        lastSyncAt: true, lastSyncError: true, createdAt: true,
      },
    }),
    amazonLiveConfigured(),
    isSandboxMode(),
  ])

  const counts = await Promise.all(
    connections.map(async (c) => ({
      id: c.id,
      orderCount: await db.syncedOrder.count({ where: { connectionId: c.id } }),
      listingCount: await db.listing.count({ where: { connectionId: c.id } }).catch(() => 0),
    }))
  )
  const countMap = Object.fromEntries(counts.map((c) => [c.id, c]))

  return ok({
    connections: connections.map((c) => ({
      ...connectionView(c),
      orderCount: countMap[c.id]?.orderCount || 0,
      listingCount: countMap[c.id]?.listingCount || 0,
    })),
    liveConfigured,
    // True while the platform routes SP-API calls to Amazon's sandbox
    // (draft-app testing) — the dashboard badges this so nobody mistakes
    // Amazon's fixed sandbox test data for production data.
    sandboxMode,
  })
}

// POST — start connecting a marketplace account.
//   flow=oauth (default): returns the official Amazon authorization URL; the
//     browser redirects to Amazon for consent, then back to /api/marketplace/callback.
//   flow=refresh_token: self-authorization — the seller pastes the refresh
//     token generated in th…19844 tokens truncated…TATION', progress: SUGGESTED_PROGRESS.QUOTATION_PREPARATION ?? 20 } })
      await logActivity('QUOTATION_REVISED', `${q.quotationNo} → revision v${newVersion} (${updated.quotationNo})`, user.id, q.requestId)
      return ok({ quotation: updated })
    }

    // ---------- CUSTOMER actions ----------
    if (user.role === 'CUSTOMER') {
      if (q.request.customerId !== user.id) return fail('Access denied', 403)

      if (action === 'accept') {
        if (!['SENT', 'NEGOTIATION', 'REVISION_REQUESTED'].includes(q.status)) {
          return fail('This quotation is not open for acceptance', 400)
        }
        const quotation = await db.quotation.update({
          where: { id }, data: { status: 'ACCEPTED', lockedAt: new Date(), acceptedAt: new Date() },
          include: { items: { orderBy: { sortOrder: 'asc' } } },
        })
        await db.quotation.updateMany({
          where: { requestId: q.requestId, id: { not: id }, status: { in: ['SENT', 'NEGOTIATION', 'REVISION_REQUESTED', 'DRAFT'] } },
          data: { status: 'SUPERSEDED' },
        })
        // Project workspace is created on acceptance (inherits the vendor if one was connected pre-acceptance)
        const existingProject = await db.project.findUnique({ where: { requestId: q.requestId } })
        if (!existingProject) {
          await db.project.create({
            data: { requestId: q.requestId, status: 'PLANNING', executionModel: q.request.executionModel, vendorId: q.request.vendorId },
          })
        } else if (q.request.vendorId && !existingProject.vendorId) {
          await db.project.update({ where: { id: existingProject.id }, data: { vendorId: q.request.vendorId } })
        }
        await db.serviceRequest.update({
          where: { id: q.requestId },
          data: { status: 'QUOTATION_ACCEPTED', stage: 'QUOTATION', progress: SUGGESTED_PROGRESS.QUOTATION_ACCEPTED ?? 35, pendingAction: null },
        })
        await db.requestStatusHistory.create({
          data: { requestId: q.requestId, status: 'QUOTATION_ACCEPTED', stage: 'QUOTATION', progress: SUGGESTED_PROGRESS.QUOTATION_ACCEPTED ?? 35, note: `Quotation ${q.quotationNo} accepted (₹${q.total}) — commercial record locked`, createdById: user.id },
        })
        await db.pendingTask.createMany({ data: [
          { requestId: q.requestId, title: 'Plan milestones and schedule payments as per accepted terms', owner: 'TEAM' },
        ] })
        await notifyStaff('Quotation accepted', `${q.request.requestCode}: customer accepted ${q.quotationNo} (₹${q.total}). Project workspace created.`, q.requestId, 'QUOTATION')
        await logActivity('QUOTATION_ACCEPTED', `${q.request.requestCode}: ${q.quotationNo} accepted (₹${q.total})`, user.id, q.requestId)
        return ok({ quotation })
      }

      if (action === 'reject') {
        if (!['SENT', 'NEGOTIATION', 'REVISION_REQUESTED'].includes(q.status)) {
          return fail('This quotation is not open for response', 400)
        }
        const quotation = await db.quotation.update({
          where: { id }, data: { status: 'REJECTED', customerNote: body.note ? String(body.note).slice(0, 1000) : null },
        })
        await db.serviceRequest.update({
          where: { id: q.requestId },
          data: { status: 'QUOTATION_REJECTED', stage: 'QUOTATION', progress: SUGGESTED_PROGRESS.QUOTATION_REJECTED ?? 0 },
        })
        await db.requestStatusHistory.create({
          data: { requestId: q.requestId, status: 'QUOTATION_REJECTED', stage: 'QUOTATION', progress: 0, note: `Quotation ${q.quotationNo} rejected${body.note ? ': ' + String(body.note).slice(0, 200) : ''}`, createdById: user.id },
        })
        await notifyStaff('Quotation rejected', `${q.request.requestCode}: customer rejected ${q.quotationNo}.${body.note ? ' Note: ' + String(body.note).slice(0, 200) : ''}`, q.requestId, 'QUOTATION')
        await logActivity('QUOTATION_REJECTED', `${q.request.requestCode}: ${q.quotationNo} rejected`, user.id, q.requestId)
        return ok({ quotation })
      }

      if (action === 'request_revision') {
        if (!['SENT', 'NEGOTIATION'].includes(q.status)) {
          return fail('A revision is already requested or this quotation is closed', 400)
        }
        const note = String(body.note || '').trim()
        if (!note) return fail('Please tell the team what you would like changed', 400)
        const quotation = await db.quotation.update({
          where: { id }, data: { status: 'REVISION_REQUESTED', customerNote: note.slice(0, 1000) },
        })
        await db.serviceRequest.update({
          where: { id: q.requestId },
          data: { status: 'REVISION_REQUESTED', stage: 'QUOTATION', progress: SUGGESTED_PROGRESS.REVISION_REQUESTED ?? 28, pendingAction: 'Team: prepare the requested quotation revision' },
        })
        await db.requestStatusHistory.create({
          data: { requestId: q.requestId, status: 'REVISION_REQUESTED', stage: 'QUOTATION', progress: SUGGESTED_PROGRESS.REVISION_REQUESTED ?? 28, note: `Revision requested on ${q.quotationNo}: ${note.slice(0, 200)}`, createdById: user.id },
        })
        await notifyStaff('Quotation revision requested', `${q.request.requestCode}: ${q.quotationNo} — "${note.slice(0, 200)}"`, q.requestId, 'QUOTATION')
        await logActivity('QUOTATION_REVISION_REQUESTED', `${q.request.requestCode}: revision requested on ${q.quotationNo}`, user.id, q.requestId)
        return ok({ quotation })
      }

      return fail('Invalid action', 400)
    }

    return fail('Access denied', 403)
  } catch (e) {
    console.error('quotation action failed', e)
    return fail('Failed to process quotation action', 500)
  }
}
