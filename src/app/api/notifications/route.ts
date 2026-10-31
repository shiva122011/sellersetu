import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail } from '@/lib/api-helpers'

// GET /api/notifications — current user's notifications
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)

  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  const unread = notifications.filter((n) => !n.isRead).length
  return ok({ notifications, unread })
}
