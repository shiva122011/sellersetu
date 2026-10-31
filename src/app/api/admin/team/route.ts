import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, hashPassword } from '@/lib/auth'
import { ok, fail, logActivity } from '@/lib/api-helpers'
import { STAFF_ROLES, ROLES } from '@/lib/constants'

const ASSIGNABLE_ROLES = STAFF_ROLES.filter((r) => r !== 'SUPER_ADMIN')

// GET /api/admin/team — list employees with role, workload and quotation capability
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return fail('Admin access required', 403)

  const team = await db.user.findMany({
    where: { role: { in: STAFF_ROLES } },
    select: {
      id: true, name: true, email: true, phone: true, role: true, createdAt: true,
      assigned: { where: { status: { notIn: ['CLOSED', 'CANCELLED'] } }, select: { id: true } },
    },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  })
  return ok({
    team: team.map((t) => ({ id: t.id, name: t.name, email: t.email, phone: t.phone, role: t.role, createdAt: t.createdAt, activeAssignments: t.assigned.length })),
    assignableRoles: ROLES.filter((r) => ASSIGNABLE_ROLES.includes(r.value)),
  })
}

// POST /api/admin/team — admin adds an employee with a specific staff role
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return fail('Admin access required', 403)
  try {
    const body = await req.json()
    const name = String(body.name || '').trim()
    const email = String(body.email || '').toLowerCase().trim()
    const password = String(body.password || '')
    const role = String(body.role || 'EMPLOYEE')
    if (!name || !email) return fail('Name and email are required', 400)
    if (password.length < 8) return fail('Password must be at least 8 characters', 400)
    if (!ASSIGNABLE_ROLES.includes(role)) return fail('Invalid staff role', 400)

    const exists = await db.user.findUnique({ where: { email } })
    if (exists) return fail('A user with this email already exists', 409)

    const passwordHash = await hashPassword(password)
    const member = await db.user.create({
      data: { name, email, passwordHash, role, phone: body.phone ? String(body.phone) : null },
    })
    await logActivity('EMPLOYEE_ADDED', `${member.name} (${member.email}) added as ${role}`, admin.id)
    return ok({ member: { id: member.id, name: member.name, email: member.email, role: member.role } }, 201)
  } catch (e) {
    console.error('add employee failed', e)
    return fail('Failed to add employee', 500)
  }
}

// PATCH /api/admin/team — change an employee's role or details
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return fail('Admin access required', 403)
  try {
    const body = await req.json()
    const id = String(body.id || '')
    const member = await db.user.findUnique({ where: { id } })
    if (!member) return fail('Employee not found', 404)
    if (member.role === 'SUPER_ADMIN') return fail('Super Admin accounts cannot be modified', 403)

    const data: Record<string, unknown> = {}
    if (body.role !== undefined) {
      const role = String(body.role)
      if (!ASSIGNABLE_ROLES.includes(role)) return fail('Invalid staff role', 400)
      data.role = role
    }
    if (body.name !== undefined) data.name = String(body.name).trim()
    if (body.phone !== undefined) data.phone = String(body.phone).trim()
    if (body.password !== undefined) {
      const password = String(body.password)
      if (password.length < 8) return fail('Password must be at least 8 characters', 400)
      data.passwordHash = await hashPassword(password)
    }
    const updated = await db.user.update({ where: { id }, data })
    await logActivity('EMPLOYEE_UPDATED', `${updated.name} updated (role: ${updated.role})`, admin.id)
    return ok({ member: { id: updated.id, name: updated.name, email: updated.email, role: updated.role } })
  } catch (e) {
    console.error('update employee failed', e)
    return fail('Failed to update employee', 500)
  }
}
