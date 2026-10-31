import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, requireAdmin } from '@/lib/auth'
import { ok, fail, logActivity } from '@/lib/api-helpers'
import { stringifyFormConfig, stringifyDocRequirements, FormConfig, DocRequirements } from '@/lib/forms'

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'service'
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base
  for (let i = 0; i < 20; i++) {
    const exists = await db.service.findUnique({ where: { slug } })
    if (!exists) return slug
    slug = `${base}-${Math.floor(Math.random() * 9000 + 1000)}`
  }
  return `${base}-${Date.now().toString().slice(-6)}`
}

const EXECUTION_TYPES = ['IN_HOUSE', 'THIRD_PARTY_MANAGED', 'DIRECT_CONNECTION', 'HYBRID']
const SERVICE_STATUSES = ['AVAILABLE', 'COMING_SOON']

function normalizeExec(v: unknown): string {
  const s = String(v || '').toUpperCase()
  return EXECUTION_TYPES.includes(s) ? s : 'IN_HOUSE'
}
function normalizeStatus(v: unknown): string {
  const s = String(v || '').toUpperCase()
  return SERVICE_STATUSES.includes(s) ? s : 'AVAILABLE'
}

// GET /api/services — public list (active only); staff see all.
// The universal catalog lives in DB categories — public consumers should use
// /api/catalog; this endpoint remains for admin tooling + simple lists.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const categoryId = searchParams.get('categoryId') || undefined
  const staff = await getSessionUser()
  const isStaff = staff && ['SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER', 'SALES_EXEC', 'PROJECT_MANAGER', 'EMPLOYEE'].includes(staff.role)

  const services = await db.service.findMany({
    where: { ...(isStaff ? {} : { active: true }), ...(categoryId ? { categoryId } : {}) },
    include: {
      category: { select: { id: true, code: true, name: true, slug: true, icon: true } },
      subcategory: { select: { id: true, name: true } },
    },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  })
  return ok({ services })
}

// POST /api/services — admin creates a service (no pricing — quotation-driven)
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return fail('Admin access required', 403)
  try {
    const body = await req.json()
    const name = String(body.name || '').trim()
    if (!name) return fail('Service name is required', 400)
    const categoryId = String(body.categoryId || '')
    const category = await db.serviceCategory.findUnique({ where: { id: categoryId } })
    if (!category) return fail('Valid category is required', 400)

    let subcategoryId: string | null = null
    if (body.subcategoryId) {
      const sub = await db.serviceSubcategory.findUnique({ where: { id: String(body.subcategoryId) } })
      if (!sub || sub.categoryId !== categoryId) return fail('Invalid subcategory for this category', 400)
      subcategoryId = sub.id
    }

    const formConfig: FormConfig = body.formConfig && Array.isArray(body.formConfig.fields)
      ? body.formConfig : { fields: [] }
    const docRequirements: DocRequirements = body.docRequirements && Array.isArray(body.docRequirements.documents)
      ? body.docRequirements : { documents: [] }

    const service = await db.service.create({
      data: {
        name,
        slug: await uniqueSlug(slugify(name)),
        categoryId,
        subcategoryId,
        description: String(body.description || '').trim(),
        scopeExamples: JSON.stringify(Array.isArray(body.scopeExamples) ? body.scopeExamples : []),
        deliverables: JSON.stringify(Array.isArray(body.deliverables) ? body.deliverables : []),
        process: JSON.stringify(Array.isArray(body.process) ? body.process : []),
        executionType: normalizeExec(body.executionType),
        status: normalizeStatus(body.status),
        featured: !!body.featured,
        timeline: String(body.timeline || 'Scoped per requirement'),
        formConfig: stringifyFormConfig(formConfig),
        docRequirements: stringifyDocRequirements(docRequirements),
        icon: String(body.icon || 'briefcase'),
        active: body.active !== false,
        displayOrder: Number(body.displayOrder) || 0,
      },
    })

    await logActivity('SERVICE_CREATED', `Service "${service.name}" created in ${category.name} (${service.executionType})`, admin.id, null)
    return ok({ service }, 201)
  } catch (e) {
    console.error('create service failed', e)
    return fail('Failed to create service', 500)
  }
}
