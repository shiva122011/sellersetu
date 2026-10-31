import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok } from '@/lib/api-helpers'

// GET /api/catalog — public universal catalog (no auth, no pricing)
// Returns categories (with subcategories) + services + homepage CMS data.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const featuredOnly = searchParams.get('featured') === '1'

  const [categories, services, settings, faqs, testimonials] = await Promise.all([
    db.serviceCategory.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      include: { subcategories: { where: { active: true }, orderBy: { sortOrder: 'asc' } } },
    }),
    db.service.findMany({
      where: { active: true, ...(featuredOnly ? { featured: true, status: 'AVAILABLE' } : {}) },
      orderBy: [{ categoryId: 'asc' }, { displayOrder: 'asc' }],
      select: {
        id: true, name: true, slug: true, description: true, categoryId: true, subcategoryId: true,
        executionType: true, status: true, featured: true, timeline: true, icon: true,
        scopeExamples: true, deliverables: true, process: true, formConfig: true, docRequirements: true,
        category: { select: { code: true, name: true, slug: true, icon: true, faqs: true } },
        subcategory: { select: { name: true } },
      },
    }),
    db.systemSetting.findMany(),
    db.faq.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    db.testimonial.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
  ])

  const pages = await db.cmsPage.findMany({
    select: { slug: true, title: true, content: true, metaTitle: true, metaDescription: true, updatedAt: true },
  })

  const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]))

  return ok({ categories, services, settings: settingsMap, faqs, testimonials, pages })
}
