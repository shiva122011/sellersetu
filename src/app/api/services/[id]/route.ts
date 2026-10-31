import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { ok, fail, logActivity } from '@/lib/api-helpers'
import { stringifyFormConfig, stringifyDocRequirements, FormConfig, DocRequirements } from '@/lib/forms'

const EXECUTION_TYPES = ['IN_HOUSE', 'THIRD_PARTY_MANAGED', 'DIRECT_CONNECTION', 'HYBRID']
const SERVICE_STATUSES = ['AVAILABLE', 'COMING_SOON']

// PATCH /api/services/[id] — admin updates a service (catalog info, execution type, form, docs)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return fail('Admin access required', 403)
  const { id } = await ctx.params

  const existing = await db.service.findUnique({ where: { id }, include: { _count: { select: { requests: true } } } })
  if (!existing) return fail('Service not found', 404)

  try {
    const body = await req.json()
    const data: Record<string, unknown> = {}

    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name) return fail('Service name cannot be empty', 400)
      data.name = name
    }
    if (body.categoryId !== undefined) {
      const cat = await db.serviceCategory.findUnique({ where: { id: String(body.categoryId) } })
      if (!cat) return fail('Invalid category', 400)
      data.categoryId = cat.id
      data.subcategoryId = null
    }
    if (body.subcategoryId !== undefined) {
      if (!body.subcategoryId) {
        data.subcategoryId = null
      } else {
        const sub = await db.serviceSubcategory.findUnique({ where: { id: String(body.subcategoryId) } })
        if (!sub) return fail('Invalid subcategory', 400)
        data.subcategoryId = sub.id
        data.categoryId = sub.categoryId
      }
    }
    if (body.description !== undefined) data.description = String(body.description).trim()
    if (body.timeline !== undefined) data.timeline = String(body.timeline).trim()
    if (body.icon !== undefined) data.icon = String(body.icon || 'briefcase')
    if (body.active !== undefined) data.active = !!body.active
    if (body.featured !== undefined) data.featured = !!body.featured
    if (body.displayOrder !== undefined) data.displayOrder = Number(body.displayOrder) || 0
    if (body.scopeExamples !== undefined) {
      data.scopeExamples = JSON.stringify(Array.isArray(body.scopeExamples) ? body.scopeExamples : [])
    }
    if (body.deliverables !== undefined) {
      data.deliverables = JSON.stringify(Array.isArray(body.deliverables) ? body.deliverables : [])
    }
    if (body.process !== undefined) {
      data.process = JSON.stringify(Array.isArray(body.process) ? body.process : [])
    }
    if (body.executionType !== undefined) {
      const t = String(body.executionType).toUpperCase()
      if (!EXECUTION_TYPES.includes(t)) return fail('Invalid execution type', 400)
      data.executionType = t
    }
    if (body.status !== undefined) {
      const s = String(body.status).toUpperCase()
      if (!SERVICE_STATUSES.includes(s)) return fail('Invalid service status', 400)
      data.status = s
    }
    if (body.formConfig !== undefined) {
      const fc: FormConfig = body.formConfig && Array.isArray(body.formConfig.fields) ? body.formConfig : { fields: [] }
      data.formConfig = stringifyFormConfig(fc)
    }
    if (body.docRequirements !== undefined) {
      const dr: DocRequirements = body.docRequirements && Array.isArray(body.docRequirements.documents)
        ? body.docRequirements : { documents: [] }
      data.docRequirements = stringifyDocRequirements(dr)
    }

    const service = await db.service.update({ where: { id }, data })
    await logActivity('SERVICE_UPDATED', `Service "${service.name}" updated`, admin.id, null)
    return ok({ service })
  } catch (e) {
    console.error('update service failed', e)
    return fail('Failed to update service', 500)
  }
}

// DELETE /api/services/[id] — deactivates when referenced by requests, hard-deletes otherwise
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return fail('Admin access required', 403)
  const { id } = await ctx.params

  const existing = await db.service.findUnique({
    where: { id },
    include: { _count: { select: { requests: true } } },
  })
  if (!existing) return fail('Service not found', 404)

  if (existing._count.requests > 0) {
    await db.service.update({ where: { id }, data: { active: false } })
    await logActivity('SERVICE_DEACTIVATED', `Service "${existing.name}" deactivated (in use by ${existing._count.requests} requests)`, admin.id, null)
    return ok({ deactivated: true, message: 'Service is used by existing requests — it has been deactivated instead of deleted.' })
  }

  await db.service.delete({ where: { id } })
  await logActivity('SERVICE_DELETED', `Service "${existing.name}" deleted`, admin.id, null)
  return ok({ deleted: true })
}
