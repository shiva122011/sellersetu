import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'sellersetu-dev-secret-change-in-production'
)

if (process.env.NODE_ENV === 'production' && !process.env.AUTH_SECRET) {
  // Loud, unmissable ops warning — sessions signed with the fallback dev secret are forgeable.
  console.warn(
    '[SECURITY] AUTH_SECRET is not set — falling back to the built-in dev secret. ' +
      'Set a strong random AUTH_SECRET env var before serving real traffic.'
  )
}

export const SESSION_COOKIE = 'sellersetu_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days in seconds

export interface SessionPayload {
  userId: string
  email: string
  role: string
}

// ---------- Password hashing (never store plain text) ----------
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

// ---------- JWT session tokens ----------
export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET)
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    if (!payload.userId) return null
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      role: payload.role as string,
    }
  } catch {
    return null
  }
}

// ---------- Cookie helpers ----------
export async function setSessionCookie(token: string) {
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Production deployments behind HTTPS set AUTH_COOKIE_SECURE=true so the
    // session cookie is only ever sent over TLS (local/HTTP smoke tests stay functional).
    secure: process.env.AUTH_COOKIE_SECURE === 'true',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  store.set(SESSION_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' })
}

// ---------- Current user resolution ----------
export async function getSessionUser() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  const session = await verifySessionToken(token)
  if (!session) return null
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true, email: true, name: true, phone: true, company: true,
      role: true, createdAt: true,
    },
  })
  return user
}

// Returns user or null; allows any staff role (admin backend / employee portal)
export async function requireStaff() {
  const user = await getSessionUser()
  if (!user) return null
  const { isStaffRole } = await import('@/lib/constants')
  if (!isStaffRole(user.role)) return null
  return user
}

// Returns user or null; only full admin roles (SUPER_ADMIN / ADMIN)
export async function requireAdmin() {
  const user = await getSessionUser()
  if (!user) return null
  const { isAdminRole } = await import('@/lib/constants')
  if (!isAdminRole(user.role)) return null
  return user
}
