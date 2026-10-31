import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, notifyStaff, generateRequestCode } from '@/lib/api-helpers'
import { STAFF_ROLES, isStaffRole, STATUS_STAGE, SUGGESTED_PROGRESS } from '@/lib/constants'
import {
  parseFormConfig, parseDocRequirements, validateFormResponses, isRequirementVisible,
  FormResponses,
} from '@/lib/forms'

// GET /api/requests — customer: own; vendor: assigned/connected; staff: all (+ ?status= &stage= &q= filters)
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || undefined
  const stage = searchParams.get('stage') || undefined
  const q = searchParams.get('q') || undefined
  const draft = searchParams.get('draft')

  const where: Record<string, unknown> = {}
  if (user.role === 'CUSTOMER') {
    where.customerId = user.id
    if (draft !== '1') where.draft = false
  } else if (user.role === 'VENDOR') {
    where.OR = [
      { vendorId: user.id },
      { vendorConnections: { some: { vendorId: user.id, status: { in: ['AUTHORIZED', 'ACTIVE', 'COMPLETED'] } } } },
      { project: { is: { vendorId: user.id } } },
    ]
  } else if (!isStaffRole(user.role)) {
    return fail('Access denied', 403)
  }
  if (status) where.status = status
  if (stage) where.stage = stage
  if (user.role === 'CUSTOMER' && draft === '1') where.draft = true
  if (q) {
    where.OR = [
      { requestCode: { contains: q } },
      { title: { contains: q } },
      { customer: { is: { name: { contains: q } } } },
      { customer: { is: { email: { contains: q } } } },
    ]
  }

  const requests = await db.serviceRequest.findMany({
    where,
    include: {
      service: {
        select: { id: true, name: true, slug: true, executionType: true, timeline: true,
          category: { select: { code: true, name: true, slug: true, icon: true } } },
      },
      customer: { select: { id: true, name: true, email: true, phone: true, company: true } },
      assignedTo: { select: { id: true, name: true } },
      vendor: { select: { id: true, name: true, vendorProfile: { select: { businessName: true, logoUrl: true } } } },
      payments: { select: { id: true, type: true, status: true, amount: true } },
      quotations: { select: { id: true, quotationNo: true, version: true, status: true, total: true } },
      project: { select: { id: true, status: true, progressPct: true } },
      documents: { select: { id: true, status: true, isDeliverable: true } },
      tasks: { where: { isDone: false }, select: { id: true, title: true, owner: true } },
      _count: { select: { messages: true, documentRequests: { where: { status: 'PENDING' } } } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Hide staff-only fields from customers & vendors
  const visible = requests.map((r) => {
    if (user.role === 'CUSTOMER') {
      const { internalNotes, ...rest } = r
      return rest
    }
    if (user.role === 'VENDOR') {
      const { internalNotes, assignedTo, ...rest } = r
      return rest
    }
    return r
  })

  return ok({ requests: visible })
}

// POST /api/requests — universal intake: catalog service OR custom "not listed" requirement.
// Supports drafts (?draft flow: draft=true in body, status DRAFT).
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  if (user.role !== 'CUSTOMER') return fail('Only customers can submit service requests', 403)

  try {
    const body = await req.json()
    const isDraft = !!body.draft
    const title = String(body.title || '').trim()
    if (!title && !isDraft) return fail('Project title is required', 400)
    const description = String(body.description || '').trim()
    if (!description && !isDraft) return fail('Please describe your requirement', 400)

    let serviceId: string | null = null
    let customCategory: string | null = null
    let serviceName = 'Custom requirement'
    let executionModel = 'IN_HOUSE'
    let responses: FormResponses = {}
    let service: { id: string; name: string; active: boolean; status: string; executionType: string; formConfig: string; docRequirements: string } | null = null

    if (body.serviceId) {
      service = await db.service.findUnique({ where: { id: String(body.serviceId) } })
      if (!service || !service.active) return fail('Selected service is not available', 400)
      if (service.status === 'COMING_SOON' && !isDraft) {
        return fail(`${service.name} is coming soon and cannot be requested yet`, 400)
      }
      serviceId = service.id
      serviceName = service.name
      executionModel = service.executionType
      responses = body.formResponses && typeof body.formResponses === 'object' ? body.formResponses : {}
      const formError = validateFormResponses(parseFormConfig(service.formConfig), responses)
      if (formError && !isDraft) return fail(formError, 400)
    } else {
      // Custom / Other request
      customCategory = String(body.customCategory || 'Other').trim() || 'Other'
      executionModel = ['IN_HOUSE', 'THIRD_PARTY_MANAGED', 'DIRECT_CONNECTION', 'HYBRID'].includes(String(body.executionModel))
        ? String(body.executionModel) : 'HYBRID'
    }

    const requestCode = await generateRequestCode()
    const request = await db.serviceRequest.create({
      data: {
        requestCode,
        customerId: user.id,
        title: title || 'Untitled request (draft)',
        description,
        expectedDeliverables: String(body.expectedDeliverables || ''),
        preferredTimeline: String(body.preferredTimeline || ''),
        projectLocation: String(body.projectLocation || ''),
        additionalNotes: String(body.additionalNotes || ''),
        serviceId,
        customCategory,
        formResponses: JSON.stringify(responses),
        draft: isDraft,
        stage: isDraft ? 'REQUEST' : 'REQUEST',
        status: isDraft ? 'DRAFT' : 'SUBMITTED',
        progress: isDraft ? 0 : (SUGGESTED_PROGRESS.SUBMITTED ?? 5),
        executionModel,
      },
      include: { service: { include: { category: true } } },
    })

    if (!isDraft) {
      // Generate document checklist from the service template → DocumentRequest rows
      if (service) {
        const docs = parseDocRequirements(service.docRequirements).documents
        const rows = docs
          .filter((d) => isRequirementVisible(d, responses))
          .map((d) => ({
            requestId: request.id,
            title: d.label,
            description: d.description || '',
            category: d.category || 'OTHER',
            mandatory: !!d.mandatory,
            source: 'TEMPLATE',
            status: 'PENDING',
          }))
        if (rows.length) await db.documentRequest.createMany({ data: rows })
      }

      await db.requestStatusHistory.create({
        data: {
          requestId: request.id,
          status: 'SUBMITTED',
          stage: STATUS_STAGE.SUBMITTED,
          progress: SUGGESTED_PROGRESS.SUBMITTED ?? 5,
          note: `Request submitted${serviceId ? ` for ${serviceName}` : ` (custom — ${customCategory})`}`,
          createdById: user.id,
        },
      })

      await db.pendingTask.createMany({ data: [
        { requestId: request.id, title: 'Review the requirement and clarify open points in chat', owner: 'TEAM' },
        { requestId: request.id, title: 'Prepare a customized quotation', owner: 'TEAM' },
      ] })

      await notifyStaff(
        'New service request received',
        `${user.name} submitted ${requestCode} — ${title}${serviceId ? ` (${serviceName})` : ` (custom: ${customCategory})`}`,
        request.id,
        'STATUS'
      )
      await logActivity('REQUEST_SUBMITTED', `${requestCode} created: ${title}`, user.id, request.id)
    } else {
      await logActivity('REQUEST_DRAFT_SAVED', `${requestCode} draft saved: ${title}`, user.id, request.id)
    }

    return ok({ request }, 201)
  } catch (e) {
    console.error('create request failed', e)
    return fail('Failed to submit service request', 500)
  }
}
