import { db } from '@/lib/db'
import { requireStaff } from '@/lib/auth'
import { ok, fail } from '@/lib/api-helpers'

// GET /api/admin/payments — all transactions across requests
export async function GET() {
  const staff = await requireStaff()
  if (!staff) return fail('Staff access required', 403)

  const payments = await db.payment.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      request: {
        select: { requestCode: true, title: true, executionModel: true, customer: { select: { name: true, email: true } } },
      },
    },
  })
  return ok({ payments })
}
