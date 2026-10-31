import { db } from '@/lib/db'
import { requireStaff } from '@/lib/auth'
import { ok, fail } from '@/lib/api-helpers'

// GET /api/admin/customers — customer directory with request stats
export async function GET() {
  const staff = await requireStaff()
  if (!staff) return fail('Staff access required', 403)

  const customers = await db.user.findMany({
    where: { role: 'CUSTOMER' },
    select: {
      id: true, name: true, email: true, phone: true, company: true, createdAt: true,
      requests: {
        select: { id: true, status: true, payments: { where: { status: 'PAID' }, select: { amount: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const result = customers.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    company: c.company,
    createdAt: c.createdAt,
    requestCount: c.requests.length,
    activeCount: c.requests.filter((r) => !['CLOSED', 'CANCELLED', 'COMPLETED'].includes(r.status)).length,
    lifetimeValue: c.requests.reduce((s, r) => s + r.payments.reduce((x, p) => x + p.amount, 0), 0),
  }))

  return ok({ customers: result })
}
