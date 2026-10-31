import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { hashPassword, signSession, setSessionCookie, verifyPassword } from '@/lib/auth'
import { ok, fail, logActivity, notifyStaff } from '@/lib/api-helpers'

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Valid email required'),
  phone: z.string().min(10, 'Valid 10-digit phone required'),
  company: z.string().optional().nullable(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  accountType: z.enum(['CUSTOMER', 'VENDOR']).default('CUSTOMER'),
  // vendor-only fields
  businessName: z.string().optional().nullable(),
  expertise: z.string().optional().nullable(), // comma-separated
  serviceLocations: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
})

const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password required'),
})

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode') || 'login'
  try {
    if (mode === 'register') {
      const body = await req.json()
      const parsed = registerSchema.safeParse(body)
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message || 'Invalid input', 400)
      }
      const { name, email, phone, company, password, accountType, businessName, expertise, serviceLocations, website, description } = parsed.data
      const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } })
      if (existing) return fail('An account with this email already exists', 409)

      if (accountType === 'VENDOR' && !businessName) {
        return fail('Business name is required for vendor registration', 400)
      }

      const passwordHash = await hashPassword(password)
      const user = await db.user.create({
        data: {
          name,
          email: email.toLowerCase(),
          phone,
          company: accountType === 'VENDOR' ? businessName || null : company || null,
          passwordHash,
          role: accountType,
        },
      })

      if (accountType === 'VENDOR') {
        await db.vendorProfile.create({
          data: {
            userId: user.id,
            businessName: businessName!,
            contactPerson: name,
            phone,
            website: website || '',
            description: description || '',
            expertise: JSON.stringify((expertise || '').split(',').map((s) => s.trim()).filter(Boolean)),
            serviceLocations: JSON.stringify((serviceLocations || '').split(',').map((s) => s.trim()).filter(Boolean)),
            status: 'PENDING',
          },
        })
        await notifyStaff('New vendor registration', `${businessName} (${name}) registered and is awaiting approval.`, null, 'VENDOR')
        await logActivity('VENDOR_REGISTERED', `Vendor registration: ${businessName} <${user.email}>`, user.id)
      } else {
        await logActivity('CUSTOMER_REGISTERED', `New customer registered: ${user.email}`, user.id)
      }

      const token = await signSession({ userId: user.id, email: user.email, role: user.role })
      await setSessionCookie(token)

      return ok({
        user: { id: user.id, email: user.email, name: user.name, phone: user.phone, company: user.company, role: user.role },
      }, 201)
    } else {
      const body = await req.json()
      const parsed = loginSchema.safeParse(body)
      if (!parsed.success) return fail(parsed.error.issues[0]?.message || 'Invalid input', 400)
      const { email, password } = parsed.data
      const user = await db.user.findUnique({ where: { email: email.toLowerCase() } })
      if (!user) return fail('Invalid email or password', 401)

      const valid = await verifyPassword(password, user.passwordHash)
      if (!valid) return fail('Invalid email or password', 401)

      const token = await signSession({ userId: user.id, email: user.email, role: user.role })
      await setSessionCookie(token)
      await logActivity('USER_LOGIN', `${user.name} logged in`, user.id)

      return ok({
        user: { id: user.id, email: user.email, name: user.name, phone: user.phone, company: user.company, role: user.role },
      })
    }
  } catch (e) {
    console.error('auth error', e)
    return fail('Authentication failed. Please try again.', 500)
  }
}
