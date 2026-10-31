// ---------------------------------------------------------------------------
// Login with Amazon (LWA) — the official OAuth authorization server calls for
// SP-API. Amazon seller passwords and OTPs are NEVER handled: only OAuth
// authorization codes / refresh tokens issued by Amazon itself.
// ---------------------------------------------------------------------------

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token'
const LWA_REVOKE_URL = 'https://api.amazon.com/auth/o2/revoke'

export class LwaError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code = 'LwaError') {
    super(message)
    this.name = 'LwaError'
    this.status = status
    this.code = code
  }
}

export interface LwaTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
}

export async function lwaTokenRequest(body: Record<string, string>): Promise<LwaTokenResponse> {
  let res: Response
  try {
    res = await fetch(LWA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(30000),
    })
  } catch (e) {
    throw new LwaError(
      `Could not reach the Amazon authorization server: ${e instanceof Error ? e.message : 'network error'}`,
      0,
      'NETWORK'
    )
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let code = 'LwaError'
    try {
      const json = JSON.parse(text) as { error?: string; error_description?: string }
      if (json.error) code = json.error
    } catch { /* plain text */ }
    if (code === 'invalid_grant') {
      throw new LwaError(
        'Amazon rejected this authorization (invalid_grant). The code/refresh token is invalid, expired, or the authorization was revoked on Amazon.',
        res.status,
        'invalid_grant'
      )
    }
    if (code === 'invalid_client') {
      throw new LwaError(
        'Amazon rejected the LWA client credentials (invalid_client). Check the Client ID and Client Secret saved by the administrator.',
        res.status,
        'invalid_client'
      )
    }
    throw new LwaError(`Amazon LWA token request failed (${res.status}): ${text.slice(0, 300)}`, res.status, code)
  }
  return (await res.json()) as LwaTokenResponse
}

/** Revoke a refresh/access token server-side (best effort). */
export async function lwaRevoke(token: string, clientId: string, clientSecret: string): Promise<boolean> {
  try {
    const res = await fetch(LWA_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      signal: AbortSignal.timeout(30000),
    })
    return res.ok
  } catch (e) {
    console.error('LWA revoke failed', e)
    return false
  }
}
