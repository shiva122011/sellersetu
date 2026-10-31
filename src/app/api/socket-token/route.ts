import { SignJWT } from 'jose'
import { getSessionUser } from '@/lib/auth'
import { ok, fail } from '@/lib/api-helpers'

// GET /api/socket-token — short-lived JWT for authenticating to the chat relay service.
// The session cookie is httpOnly, so the socket service cannot read it directly;
// this endpoint mints a 1-hour token scoped to the same identity.
const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'sellersetu-dev-secret-change-in-production'
)

export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('Not authenticated', 401)
  const token = await new SignJWT({ userId: user.id, email: user.email, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(SECRET)
  return ok({ token })
}
