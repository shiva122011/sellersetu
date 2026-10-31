import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireStaff } from '@/lib/auth'
import { ok, fail } from '@/lib/api-helpers'

// GET /api/admin/activity — audit log (?limit=N)
export async function GET(req: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return fail('Staff access required', 403)

  const { searchParams } = new URL(req.url)
  const limit = Math.min(200, Number(searchParams.get('limit')) || 80)

  const logs = await db.activityLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { user: { select: { name: true, role: true } } },
  })
  return ok({ logs })
}
