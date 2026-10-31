import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail } from '@/lib/api-helpers'

// POST /api/notifications/read — mark notifications as read { id? } or all
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  try {
    const body = await req.json().catch(() => ({}))
    if (body.id) {
      await db.notification.updateMany({
        where: { id: String(body.id), userId: user.id },
        data: { isRead: true },
      })
    } else {
      await db.notification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } })
    }
    return ok({ success: true })
  } catch (e) {
    console.error('mark read failed', e)
    return fail('Failed to update notifications', 500)
  }
}
