import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { ok, fail, logActivity } from '@/lib/api-helpers'

// GET /api/admin/cms — all CMS content: settings, pages, FAQs, testimonials
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return fail('Admin access required', 403)

  const [settings, pages, faqs, testimonials] = await Promise.all([
    db.systemSetting.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }] }),
    db.cmsPage.findMany({ orderBy: { slug: 'asc' } }),
    db.faq.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.testimonial.findMany({ orderBy: { sortOrder: 'asc' } }),
  ])
  return ok({ settings, pages, faqs, testimonials })
}

// PUT /api/admin/cms — update CMS content
// body: { settings?: {key,value}[], pages?: {slug,title,content,...}[], faqs?: full list, testimonials?: full list }
export async function PUT(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return fail('Admin access required', 403)

  try {
    const body = await req.json()

    if (Array.isArray(body.settings)) {
      for (const s of body.settings) {
        const key = String(s.key || '')
        if (!key) continue
        await db.systemSetting.upsert({
          where: { key },
          create: { key, value: String(s.value ?? ''), label: s.label ?? null, category: s.category || 'GENERAL', updatedById: admin.id },
          update: { value: String(s.value ?? ''), updatedById: admin.id },
        })
      }
    }

    if (Array.isArray(body.pages)) {
      for (const p of body.pages) {
        const slug = String(p.slug || '')
        if (!slug) continue
        const data: Record<string, unknown> = { updatedById: admin.id }
        if (p.title !== undefined) data.title = String(p.title)
        if (p.content !== undefined) data.content = String(p.content)
        if (p.metaTitle !== undefined) data.metaTitle = p.metaTitle ? String(p.metaTitle) : null
        if (p.metaDescription !== undefined) data.metaDescription = p.metaDescription ? String(p.metaDescription) : null
        await db.cmsPage.upsert({ where: { slug }, create: { slug, title: String(p.title || slug), content: String(p.content || ''), ...data }, update: data })
      }
    }

    if (Array.isArray(body.faqs)) {
      const keepIds: string[] = []
      for (let i = 0; i < body.faqs.length; i++) {
        const f = body.faqs[i]
        const data = {
          question: String(f.question || '').trim(),
          answer: String(f.answer || '').trim(),
          category: String(f.category || 'General'),
          sortOrder: i,
          active: f.active !== false,
        }
        if (!data.question) continue
        if (f.id) {
          const exists = await db.faq.findUnique({ where: { id: String(f.id) } })
          if (exists) {
            await db.faq.update({ where: { id: exists.id }, data })
            keepIds.push(exists.id)
            continue
          }
        }
        const created = await db.faq.create({ data })
        keepIds.push(created.id)
      }
      // Remove deleted FAQs
      const all = await db.faq.findMany({ select: { id: true } })
      for (const row of all) {
        if (!keepIds.includes(row.id)) await db.faq.delete({ where: { id: row.id } })
      }
    }

    if (Array.isArray(body.testimonials)) {
      const keepIds: string[] = []
      for (let i = 0; i < body.testimonials.length; i++) {
        const t = body.testimonials[i]
        const data = {
          name: String(t.name || '').trim(),
          role: String(t.role || ''),
          quote: String(t.quote || '').trim(),
          rating: Math.max(1, Math.min(5, Number(t.rating) || 5)),
          sortOrder: i,
          active: t.active !== false,
        }
        if (!data.name || !data.quote) continue
        if (t.id) {
          const exists = await db.testimonial.findUnique({ where: { id: String(t.id) } })
          if (exists) {
            await db.testimonial.update({ where: { id: exists.id }, data })
            keepIds.push(exists.id)
            continue
          }
        }
        const created = await db.testimonial.create({ data })
        keepIds.push(created.id)
      }
      const all = await db.testimonial.findMany({ select: { id: true } })
      for (const row of all) {
        if (!keepIds.includes(row.id)) await db.testimonial.delete({ where: { id: row.id } })
      }
    }

    await logActivity('CMS_UPDATED', 'Website content updated', admin.id)
    return ok({ saved: true })
  } catch (e) {
    console.error('cms update failed', e)
    return fail('Failed to save CMS content', 500)
  }
}
