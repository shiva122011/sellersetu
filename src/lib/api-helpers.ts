import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { STAFF_ROLES } from '@/lib/constants'

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status })
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

export async function logActivity(
  action: string,
  details: string | null,
  userId?: string | null,
  requestId?: string | null
) {
  try {
    await db.activityLog.create({
      data: {
        action,
        details,
        userId: userId ?? null,
        requestId: requestId ?? null,
      },
    })
  } catch (e) {
    console.error('activity log failed', e)
  }
}

// Create in-app notifications for all staff members (any staff role)
export async function notifyStaff(
  title: string,
  body: string,
  requestId?: string | null,
  type: string = 'INFO',
  excludeUserId?: string | null
) {
  try {
    const staff = await db.user.findMany({
      where: { role: { in: STAFF_ROLES }, id: excludeUserId ? { not: excludeUserId } : undefined },
      select: { id: true },
    })
    if (staff.length === 0) return
    await db.notification.createMany({
      data: staff.map((s) => ({
        userId: s.id,
        title,
        body,
        requestId: requestId ?? null,
        type,
      })),
    })
  } catch (e) {
    console.error('notifyStaff failed', e)
  }
}

export async function notifyUser(
  userId: string,
  title: string,
  body: string,
  requestId?: string | null,
  type: string = 'INFO'
) {
  try {
    await db.notification.create({
      data: { userId, title, body, requestId: requestId ?? null, type },
    })
  } catch (e) {
    console.error('notifyUser failed', e)
  }
}

// Generate a unique sequential request code like SR-2026-00042
export async function generateRequestCode(): Promise<string> {
  const year = new Date().getFullYear()
  const count = await db.serviceRequest.count()
  let seq = count + 1
  for (let i = 0; i < 50; i++) {
    const code = `SR-${year}-${String(seq).padStart(5, '0')}`
    const exists = await db.serviceRequest.findUnique({ where: { requestCode: code } })
    if (!exists) return code
    seq++
  }
  return `SR-${year}-${Date.now().toString().slice(-6)}`
}

// QT-2026-00042
export async function generateQuotationNo(): Promise<string> {
  const year = new Date().getFullYear()
  const count = await db.quotation.count()
  let seq = count + 1
  for (let i = 0; i < 50; i++) {
    const no = `QT-${year}-${String(seq).padStart(5, '0')}`
    const exists = await db.quotation.findUnique({ where: { quotationNo: no } })
    if (!exists) return no
    seq++
  }
  return `QT-${year}-${Date.now().toString().slice(-6)}`
}

// INV-2026-00042
export async function generateInvoiceNo(): Promise<string> {
  const year = new Date().getFullYear()
  const count = await db.invoice.count()
  let seq = count + 1
  for (let i = 0; i < 50; i++) {
    const no = `INV-${year}-${String(seq).padStart(5, '0')}`
    const exists = await db.invoice.findUnique({ where: { invoiceNo: no } })
    if (!exists) return no
    seq++
  }
  return `INV-${year}-${Date.now().toString().slice(-6)}`
}

export function generateTransactionId(): string {
  return 'TXN' + Date.now().toString().toUpperCase() + Math.floor(Math.random() * 900 + 100).toString()
}

export function generateReceiptNo(requestCode: string, type: string): string {
  const t = (type || 'X').slice(0, 1).toUpperCase()
  return `${requestCode.split('-').slice(0, 2).join('-')}-RCPT-${t}${Math.floor(Math.random() * 9000 + 1000)}`
}

// Marketplace seller connections belong to the signed-in customer account.
// Platform administrators may also manage their own connection for testing
// and operations, but other staff roles must not access seller credentials.
export function canOwnConnection(role: string | undefined | null): boolean {
  return role === 'CUSTOMER' || role === 'SUPER_ADMIN' || role === 'ADMIN'
}
