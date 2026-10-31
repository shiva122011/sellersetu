import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { ok, fail, logActivity } from '@/lib/api-helpers'

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'category'
}

// GET /api/admin/catalog/categories — all categories incl. inactive
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return fail('Admin access required', 403)
  const categories = await db.serviceCategory.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { services: true } } },
  })
  return ok({ categories })
}

// POST /api/admin/catalog/categories — create a category (unlimited categories supported)
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return fail('Admin access required', 403)
  try {
    const body = await req.json()
    const name = String(body.name || '').trim()
    if (!name) return fail('Category name is required', 400)
    const existing = await db.serviceCategory.findUnique({ where: { slug: slugify(name) } })
    if (existing) return fail('A category with this name already exists', 409)

    const count = await db.serviceCategory.count()
    const category = await db.serviceCategory.create({
      data: {
        code: String(body.code || '').toUpperCase().slice(0, 2) || String.fromCharCode(65 + count),
        slug: slugify(name),
        name,
        description: String(body.description || ''),
        icon: String(body.icon || 'layers'),
        featured: !!body.featured,
        sortOrder: count + 1,
      },
    })
    await logActivity('CATEGORY_CREATED', `Category "${category.name}" (${category.code}) created`, admin.id, null)
    return ok({ category }, 201)
  } catch (e) {
    console.error('create category failed', e)
    return fail('Failed to create category', 500)
  }
}

// PATCH /api/admin/catalog/categories — update { id, name?, description?, icon?, featured?, active?, sortOrder? }
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return fail('Admin access required', 403)
  try {
    const body = await req.json()
    const id = String(body.id || '')
    const existing = await db.serviceCategory.findUnique({ where: { id } })
    if (!existing) return fail('Category not found', 404)
    const data: Record<string, unknown> = {}
    if (body.name !== undefined) data.name = String(body.name).trim()
    if (body.description !== undefined) data.description = String(body.description)
    if (body.icon !== undefined) data.icon = String(body.icon)
    if (body.faqs !== undefined) {
      data.faqs = JSON.stringify(Array.isArray(body.faqs) ? body.faqs : [])
    }
    if (body.featured !== undefined) data.featured = !!body.featured
    if (body.active !== undefined) data.active = !!body.active
    if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0
    const category = await db.serviceCategory.update({ where: { id }, data })
    await logActivity('CATEGORY_UPDATED', `Category "${category.name}" updated`, admin.id, null)
    return ok({ category })
  } catch (e) {
    console.error('update category failed', e)
    return fail('Failed to update category', 500)
  }
}
