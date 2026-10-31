import { db } from '@/lib/db'
import { requireStaff } from '@/lib/auth'
import { ok, fail } from '@/lib/api-helpers'
import { STAFF_ROLES, INACTIVE_STATUSES } from '@/lib/constants'

// GET /api/admin/stats — dashboard KPIs for the universal platform
export async function GET() {
  const staff = await requireStaff()
  if (!staff) return fail('Staff access required', 403)

  const [
    totalRequests, drafts, activeRequests, completedRequests, totalCustomers,
    pendingVendors, approvedVendors, allPayments, documentsPending,
    quotationsSent, quotationsAccepted, quotationsEver, recentRequests, unreadMessages,
  ] = await Promise.all([
    db.serviceRequest.count({ where: { draft: false } }),
    db.serviceRequest.count({ where: { draft: true } }),
    db.serviceRequest.count({ where: { status: { notIn: [...INACTIVE_STATUSES, 'QUOTATION_REJECTED', 'COMPLETED'] }, draft: false } }),
    db.serviceRequest.count({ where: { status: 'COMPLETED' } }),
    db.user.count({ where: { role: 'CUSTOMER' } }),
    db.vendorProfile.count({ where: { status: 'PENDING' } }),
    db.vendorProfile.count({ where: { status: 'APPROVED' } }),
    db.payment.findMany({ where: { status: 'PAID' } }),
    db.document.count({ where: { status: 'SUBMITTED' } }),
    db.quotation.count({ where: { status: { in: ['SENT', 'NEGOTIATION', 'REVISION_REQUESTED'] } } }),
    db.quotation.count({ where: { status: 'ACCEPTED' } }),
    db.quotation.count({ where: { status: { in: ['SENT', 'NEGOTIATION', 'REVISION_REQUESTED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'EXPIRED'] } } }),
    db.serviceRequest.findMany({
      where: { draft: false },
      orderBy: { createdAt: 'desc' },
      take: 6,
      include: {
        customer: { select: { name: true, company: true } },
        service: { select: { name: true, category: { select: { name: true } } } },
      },
    }),
    db.message.count({ where: { isRead: false, sender: { role: { in: ['CUSTOMER', 'VENDOR'] } } } }),
  ])

  const revenue = allPayments.reduce((sum, p) => sum + p.amount, 0)
  const revenueByType: Record<string, number> = {}
  for (const p of allPayments) revenueByType[p.type] = (revenueByType[p.type] || 0) + p.amount
  const outstanding = await db.payment.aggregate({ where: { status: 'PENDING' }, _sum: { amount: true } })

  const byStage = {
    REQUEST: await db.serviceRequest.count({ where: { stage: 'REQUEST', draft: false } }),
    QUOTATION: await db.serviceRequest.count({ where: { stage: 'QUOTATION', draft: false } }),
    EXECUTION: await db.serviceRequest.count({ where: { stage: 'EXECUTION' } }),
    COMPLETION: await db.serviceRequest.count({ where: { stage: 'COMPLETION' } }),
  }

  return ok({
    stats: {
      totalRequests, drafts, activeRequests, completedRequests, totalCustomers,
      pendingVendors, approvedVendors, revenue, revenueByType,
      outstanding: outstanding._sum.amount || 0, documentsPending,
      liveQuotations: quotationsSent, quotationAcceptanceRate: quotationsEver > 0
        ? Math.round(quotationsAccepted / quotationsEver * 100) : 0,
      unreadMessages,
    },
    byStage,
    recentRequests,
  })
}
