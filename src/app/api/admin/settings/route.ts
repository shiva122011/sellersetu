import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { ok, fail, logActivity } from '@/lib/api-helpers'

// GET /api/admin/settings — system settings grouped by category
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return fail('Admin access required', 403)
  const settings = await db.systemSetting.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }] })
  return ok({ settings })
}

// PUT /api/admin/settings — update system settings
export async function PUT(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return fail('Admin access required', 403)
  try {
    const body = await req.json()
    if (!Array.isArray(body.settings)) return fail('settings[] required', 400)
    for (const s of body.settings) {
      const key = String(s.key || '')
      if (!key) continue
      await db.systemSetting.upsert({
        where: { key },
        create: { key, value: String(s.value ?? ''), label: s.label ?? null, category: s.category || 'GENERAL', updatedById: admin.id },
        update: { value: String(s.value ?? ''), updatedById: admin.id },
      })
    }
    await logActivity('SETTINGS_UPDATED', `System settings updated (${body.settings.length} keys)`, admin.id)
    const settings = await db.systemSetting.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }] })
    return ok({ settings })
  } catch (e) {
    console.error('settings update failed', e)
    return fail('Failed to save settings', 500)
  }
}
