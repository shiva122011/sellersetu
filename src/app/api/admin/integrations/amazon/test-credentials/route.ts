import { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity } from '@/lib/api-helpers'
import { getAmazonAppConfig } from '@/lib/marketplace/settings'
import { lwaTokenRequest } from '@/lib/marketplace/sp-api/lwa'

// POST /api/admin/integrations/amazon/test-credentials
// ADMIN-only "Run test": proves the saved LWA Client ID + Secret are a valid
// app credential pair by performing a REAL client_credentials grant against
// api.amazon.com. No seller authorization is involved in this call.

export async function POST(_req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Unauthorized', 401)
  if (user.role !== 'ADMIN') return fail('Only administrators can test the integration credentials', 403)

  const cfg = await getAmazonAppConfig()
  if (!cfg.clientId || !cfg.clientSecret) {
    return fail(
      'Save the LWA Client ID and Client Secret first (form above), then run the test.',
      400
    )
  }

  try {
    // Real network call to Amazon's authorization server. If the client id /
    // secret pair is wrong, Amazon answers invalid_client and we surface it.
    await lwaTokenRequest({
      grant_type: 'client_credentials',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    })
    await logActivity(
      'MARKETPLACE_CREDENTIALS_TESTED',
      `Amazon LWA credentials test succeeded (region ${cfg.region})`,
      user.id
    )
    return ok({
      tested: true,
      region: cfg.region,
      message: `LWA credentials are valid — api.amazon.com accepted the Client ID + Secret (region ${cfg.region}).`,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'The credentials test failed.'
    await logActivity(
      'MARKETPLACE_CREDENTIALS_TEST_ERROR',
      message.slice(0, 300),
      user.id
    )
    return fail(message, 400)
  }
}
