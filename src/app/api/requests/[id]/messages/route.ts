import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity, notifyUser } from '@/lib/api-helpers'
import { isStaffRole } from '@/lib/constants'

// GET /api/requests/[id]/messages — chat history (internal notes filtered out for customers)
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  const { id } = await ctx.params

  const request = await db.serviceRequest.findUnique({ where: { id } })
  if (!request) return fail('Request not found', 404)

  // Access: customer owns it; staff all; vendor only on authorized/active connections or assigned projects
  if (user.role === 'CUSTOMER') {
    if (request.customerId !== user.id) return fail('Access denied', 403)
  } else if (user.role === 'VENDOR') {
    const project = await db.project.findUnique({ where: { requestId: id }, select: { vendorId: true } })
    const conn = await db.vendorConnection.findFirst({ where: { requestId: id, vendorId: user.id, status: { in: ['AUTHORIZED', 'ACTIVE', 'COMPLETED'] } } })
    if (project?.vendorId !== user.id && !conn) return fail('Access denied', 403)
  } else if (!isStaffRole(user.role)) {
    return fail('Access denied', 403)
  }

  const isStaff = isStaffRole(user.role)
  const messages = await db.message.findMany({
    where: { requestId: id, ...(isStaff ? {} : { isInternal: false }) },
    orderBy: { createdAt: 'asc' },
    include: { sender: { select: { id: true, name: true, role: true } } },
  })
  return ok({ messages })
}

// POST /api/requests/[id]/messages — send a message (persisted; real-time via socket relay from client)
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  const { id } = await ctx.params

  const request = await db.serviceRequest.findUnique({ where: { id } })
  if (!request) return fail('Request not found', 404)

  if (user.role === 'CUSTOMER') {
    if (request.customerId !== user.id) return fail('Access denied', 403)
  } else if (user.role === 'VENDOR') {
    const project = await db.project.findUnique({ where: { requestId: id }, select: { vendorId: true } })
    const conn = await db.vendorConnection.findFirst({ where: { requestId: id, vendorId: user.id, status: { in: ['AUTHORIZED', 'ACTIVE'] } } })
    if (project?.vendorId !== user.id && !conn) return fail('Access denied', 403)
  } else if (!isStaffRole(user.role)) {
    return fail('Access denied', 403)
  }

  try {
    const body = await req.json()
    const content = String(body.content || '').trim()
    if (!content) return fail('Message cannot be empty', 400)
    if (content.length > 2000) return fail('Message is too long (max 2000 characters)', 400)

    const isStaff = isStaffRole(user.role)
    const isInternal = isStaff && body.isInternal === true

    const message = await db.message.create({
      data: { requestId: id, senderId: user.id, content, isInternal },
      include: { sender: { select: { id: true, name: true, role: true } } },
    })

    // Notify the other party (internal notes stay inside the team)
    if (isInternal) {
      const staff = await db.user.findMany({
        where: { role: { in: ['ADMIN', 'TEAM'] }, id: { not: user.id } },
        select: { id: true },
      })
      if (staff.length) {
        await db.notification.createMany({
          data: staff.map((s) => ({
            userId: s.id,
            title: `Internal note on ${request.requestCode}`,
            body: `${user.name}: ${content.slice(0, 80)}`,
            requestId: id,
            type: 'MESSAGE',
          })),
        })
      }
    } else if (user.role === 'CUSTOMER') {
      const staff = await db.user.findMany({ where: { role: { in: ['ADMIN', 'TEAM'] } }, select: { id: true } })
      if (staff.length) {
        await db.notification.createMany({
          data: staff.map((s) => ({
            userId: s.id,
            title: `New message on ${request.requestCode}`,
            body: `${user.name}: ${content.slice(0, 80)}`,
            requestId: id,
            type: 'MESSAGE',
          })),
        })
      }
    } else {
      await notifyUser(request.customerId, `New message on ${request.requestCode}`, `${user.name}: ${content.slice(0, 80)}`, id, 'MESSAGE')
    }

    await logActivity('MESSAGE_SENT', `${request.requestCode}: ${user.name} ${isInternal ? 'added an internal note' : 'sent a message'}`, user.id, id)
    return ok({ message }, 201)
  } catch (e) {
    console.error('send message failed', e)
    return fail('Failed to send message', 500)
  }
}
