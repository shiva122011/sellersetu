import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireStaff } from '@/lib/auth'
import { ok, fail } from '@/lib/api-helpers'
import { STAFF_ROLES, INACTIVE_STATUSES } from '@/lib/constants'

// GET /api/admin/reports — reports & analytics with filters
// ?from= &to= (ISO dates) &categoryId= &employeeId= &format=csv
export async function GET(req: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return fail('Staff access required', 403)

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ? new Date(String(searchParams.get('from'))) : null
  const to = searchParams.get('to') ? new Date(String(searchParams.get('to'))) : null
  const categoryId = searchParams.get('categoryId') || undefined
  const employeeId = searchParams.get('employeeId') || undefined
  const format = searchParams.get('format') || 'json'

  const createdFilter: Record<string, unknown> = { draft: false }
  if (from || to) {
    createdFilter.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }
  }
  if (categoryId) createdFilter.service = { is: { categoryId } }
  if (employeeId) createdFilter.assignedToId = employeeId

  const [requests, quotations, payments, projects, vendors] = await Promise.all([
    db.serviceRequest.findMany({
      where: createdFilter,
      select: {
        id: true, requestCode: true, title: true, status: true, stage: true, executionModel: true,
        progress: true, createdAt: true, assignedToId: true, vendorId: true,
        service: { select: { name: true, category: { select: { id: true, name: true, code: true } } } },
        customCategory: true,
        customer: { select: { name: true, company: true } },
        project: { select: { startedAt: true, completedAt: true, progressPct: true } },
        assignedTo: { select: { name: true } },
        vendor: { select: { name: true, vendorProfile: { select: { businessName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.quotation.findMany({
      where: { status: { in: ['SENT', 'NEGOTIATION', 'REVISION_REQUESTED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED'] },
        ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
      select: { id: true, quotationNo: true, status: true, total: true, version: true, requestId: true, createdAt: true },
    }),
    db.payment.findMany({
      where: { status: 'PAID', ...(from || to ? { paidAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
      select: { id: true, type: true, amount: true, paidAt: true, requestId: true,
        request: { select: { requestCode: true, executionModel: true, service: { select: { category: { select: { name: true, code: true } } } } } } },
    }),
    db.project.findMany({
      where: { completedAt: { not: null }, ...(from || to ? { completedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
      select: { id: true, startedAt: true, completedAt: true, requestId: true, executionModel: true },
    }),
    db.vendorProfile.findMany({
      select: { id: true, businessName: true, status: true, rating: true, completedProjects: true,
        user: { select: { id: true, name: true } } },
    }),
  ])

  // --- aggregates ---
  const byCategory: Record<string, { count: number; label: string }> = {}
  const byExecutionModel: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  for (const r of requests) {
    const label = r.service?.category?.name || r.customCategory || 'Custom'
    byCategory[label] = (byCategory[label] || { count: 0, label })
    byCategory[label].count++
    byExecutionModel[r.executionModel] = (byExecutionModel[r.executionModel] || 0) + 1
    byStatus[r.status] = (byStatus[r.status] || 0) + 1
  }

  const liveQuotations = quotations.filter((q) => ['SENT', 'NEGOTIATION', 'REVISION_REQUESTED'].includes(q.status))
  const acceptedQuotations = quotations.filter((q) => q.status === 'ACCEPTED')
  const acceptanceRate = quotations.length > 0 ? Math.round(acceptedQuotations.length / quotations.length * 100) : 0

  const revenueByCategory: Record<string, number> = {}
  const revenueByModel: Record<string, number> = {}
  const revenueByType: Record<string, number> = {}
  let totalRevenue = 0
  for (const p of payments) {
    totalRevenue += p.amount
    const label = p.request?.service?.category?.name || 'Custom / Other'
    revenueByCategory[label] = (revenueByCategory[label] || 0) + p.amount
    revenueByModel[p.request?.executionModel || 'IN_HOUSE'] = (revenueByModel[p.request?.executionModel || 'IN_HOUSE'] || 0) + p.amount
    revenueByType[p.type] = (revenueByType[p.type] || 0) + p.amount
  }

  // Employee workload
  const employeeMap: Record<string, { name: string; active: number; completed: number }> = {}
  for (const r of requests) {
    if (!r.assignedTo) continue
    const key = r.assignedToId!
    employeeMap[key] = employeeMap[key] || { name: r.assignedTo.name, active: 0, completed: 0 }
    if (!['COMPLETED', ...INACTIVE_STATUSES].includes(r.status)) employeeMap[key].active++
    else if (r.status === 'COMPLETED') employeeMap[key].completed++
  }

  // Avg completion time (days)
  const completionDurations = projects
    .filter((p) => p.startedAt && p.completedAt)
    .map((p) => (new Date(p.completedAt!).getTime() - new Date(p.startedAt!).getTime()) / 864e5)
  const avgCompletionDays = completionDurations.length
    ? Math.round(completionDurations.reduce((s, d) => s + d, 0) / completionDurations.length * 10) / 10 : null

  const outstanding = await db.payment.aggregate({ where: { status: 'PENDING' }, _sum: { amount: true }, _count: true })

  const report = {
    summary: {
      totalRequests: requests.length,
      totalRevenue,
      outstandingAmount: outstanding._sum.amount || 0,
      outstandingCount: outstanding._count,
      quotationAcceptanceRate: acceptanceRate,
      liveQuotations: liveQuotations.length,
      avgCompletionDays,
    },
    byCategory, byExecutionModel, byStatus,
    revenueByCategory, revenueByModel, revenueByType,
    employeeWorkload: Object.entries(employeeMap).map(([id, v]) => ({ id, ...v })),
    vendorPerformance: vendors.map((v) => ({ id: v.id, businessName: v.businessName, status: v.status, rating: v.rating, completedProjects: v.completedProjects })),
    quotations: quotations.slice(0, 100),
    payments: payments.slice(0, 100),
  }

  if (format === 'csv') {
    const rows = [
      ['RequestID', 'Title', 'Category', 'ExecutionModel', 'Status', 'Progress%', 'AssignedTo', 'Vendor', 'Created'],
      ...requests.map((r) => [
        r.requestCode, `"${r.title.replace(/"/g, '""')}"`, r.service?.category?.name || r.customCategory || 'Custom',
        r.executionModel, r.status, String(r.progress), r.assignedTo?.name || '', r.vendor?.vendorProfile?.businessName || '',
        new Date(r.createdAt).toISOString().slice(0, 10),
      ]),
    ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="reports-${new Date().toISOString().slice(0, 10)}.csv"` } })
  }

  return ok({ report })
}
