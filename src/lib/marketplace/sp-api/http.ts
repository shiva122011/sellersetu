// ---------------------------------------------------------------------------
// Core Amazon SP-API HTTP client.
//
// - Regional endpoint resolution (NA / EU / FE) — India sellers are served by
//   the EU endpoint.
// - Request timeouts via AbortController.
// - Automatic retry with exponential backoff for 429 / 5xx responses,
//   honoring Amazon's Retry-After header (rate limits are real: e.g. the
//   Orders API allows only 1 req/5s sustained).
// - Typed errors: permission gaps (403), rate limits (429), expired
//   authorization (LWA) and network failures are all distinguishable so the
//   dashboard can show precise, actionable messages.
// ---------------------------------------------------------------------------

export const SPAPI_HOSTS: Record<string, string> = {
  NA: 'https://sellingpartnerapi-na.amazon.com',
  EU: 'https://sellingpartnerapi-eu.amazon.com',
  FE: 'https://sellingpartnerapi-fe.amazon.com',
}

// Amazon's official SP-API Sandbox — same operations, same LWA tokens, fixed
// canned test data. Draft (unpublished) developer apps can ONLY use these
// hosts: production endpoints answer 403 until Amazon grants the app roles.
export const SPAPI_SANDBOX_HOSTS: Record<string, string> = {
  NA: 'https://sandbox.sellingpartnerapi-na.amazon.com',
  EU: 'https://sandbox.sellingpartnerapi-eu.amazon.com',
  FE: 'https://sandbox.sellingpartnerapi-fe.amazon.com',
}

// Default SP-API marketplace per region. This platform's primary market is
// India (A21TJRUUN4KGV), which SP-API serves from the EU endpoint.
export const REGION_DEFAULT_MARKETPLACES: Record<string, string[]> = {
  NA: ['ATVPDKIKX0DER'], // United States
  EU: ['A21TJRUUN4KGV'], // India
  FE: ['A1VC38T7YXB528'], // Japan
}

export const SPAPI_REGIONS = ['NA', 'EU', 'FE'] as const

export interface SpApiContext {
  region: string // NA | EU | FE
  accessToken: string
  /** Route this call to Amazon's sandbox endpoint (draft-app testing). */
  sandbox?: boolean
}

export interface SpApiCallOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  query?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
  /** Overrides the context access token — used for Restricted Data Tokens. */
  accessToken?: string
  maxRetries?: number
  timeoutMs?: number
  /** Human-readable permission name surfaced when Amazon answers 403. */
  requiredPermission?: string
}

export class SpApiError extends Error {
  status: number
  code: string
  requiredPermission?: string
  retryable: boolean

  constructor(
    message: string,
    status: number,
    code = 'SpApiError',
    requiredPermission?: string,
    retryable = false
  ) {
    super(message)
    this.name = 'SpApiError'
    this.status = status
    this.code = code
    this.requiredPermission = requiredPermission
    this.retryable = retryable
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function firstErrorMessage(text: string): { code?: string; message?: string } {
  try {
    const json = JSON.parse(text) as { errors?: Array<{ code?: string; message?: string }> }
    const err = json.errors?.[0]
    if (err) return { code: err.code, message: err.message }
  } catch {
    /* plain-text error body */
  }
  return { message: text.slice(0, 300) || undefined }
}

function parseError(status: number, text: string, requiredPermission?: string): SpApiError {
  const { code, message } = firstErrorMessage(text)
  if (status === 400 && (code === 'invalid_grant' || /invalid_grant|expired|revoked/i.test(message || ''))) {
    return new SpApiError(
      'The Amazon authorization has expired or was revoked. Please reconnect your seller account.',
      status,
      'AUTH_EXPIRED',
      undefined,
      false
    )
  }
  if (status === 401) {
    return new SpApiError(
      'Amazon rejected the access token (401 Unauthorized). The authorization may have expired — please reconnect or retry in a moment.',
      status,
      'UNAUTHORIZED',
      undefined,
      false
    )
  }
  if (status === 403) {
    const base = requiredPermission
      ? `Amazon denied this request (403). The app authorization is missing the ${requiredPermission} permission.`
      : 'Amazon denied this request (403). The app authorization is missing a required permission for this feature.'
    // Draft apps ALWAYS get 403 on production endpoints — point the
    // administrator at both official ways forward (publish, or sandbox).
    const draftHint =
      ' If your SP-API app is still in Draft (not published) in Amazon Developer Central, production endpoints always answer 403: either publish the app with this role granted, or enable "Amazon sandbox mode" under Admin → Integrations to test against Amazon\'s sandbox while the app is in Draft.'
    return new SpApiError(
      base + draftHint,
      status,
      code || 'ACCESS_DENIED',
      requiredPermission,
      false
    )
  }
  if (status === 404) {
    return new SpApiError(
      message || 'Amazon has no data for this request (404 Not Found).',
      status,
      'NOT_FOUND',
      undefined,
      false
    )
  }
  if (status === 429) {
    return new SpApiError(
      'Amazon rate limit reached (429). The request was retried automatically — please try again shortly.',
      status,
      'RATE_LIMITED',
      undefined,
      true
    )
  }
  if (status >= 500) {
    return new SpApiError(
      `Amazon service error (${status})${message ? `: ${message}` : ''}. Please retry in a moment.`,
      status,
      code || 'SERVER_ERROR',
      undefined,
      true
    )
  }
  return new SpApiError(`Amazon API error (${status})${message ? `: ${message}` : ''}`, status, code, undefined, false)
}

/**
 * Execute a single SP-API call with timeout + automatic retries.
 * Returns the parsed JSON payload (or null for empty 204 responses).
 */
export async function spApiFetch<T>(
  ctx: SpApiContext,
  path: string,
  opts: SpApiCallOptions = {}
): Promise<T> {
  const host = ctx.sandbox
    ? (SPAPI_SANDBOX_HOSTS[ctx.region] || SPAPI_SANDBOX_HOSTS.EU)
    : (SPAPI_HOSTS[ctx.region] || SPAPI_HOSTS.EU)
  const url = new URL(host + path)
  for (const [k, v] of Object.entries(opts.query || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }

  const method = opts.method || 'GET'
  const maxRetries = opts.maxRetries ?? 3
  const timeoutMs = opts.timeoutMs ?? 45000
  const token = opts.accessToken || ctx.accessToken

  let attempt = 0
  for (;;) {
    attempt++
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url.toString(), {
        method,
        headers: {
          'x-amz-access-token': token,
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (res.ok) {
        if (res.status === 204) return null as T
        const text = await res.text()
        if (!text) return null as T
        try {
          return JSON.parse(text) as T
        } catch {
          return text as unknown as T
        }
      }

      const errText = await res.text().catch(() => '')
      const error = parseError(res.status, errText, opts.requiredPermission)
      const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10)
      if (error.retryable && attempt <= maxRetries) {
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(30000, 1000 * 2 ** (attempt - 1)) + Math.random() * 800
        await sleep(waitMs)
        continue
      }
      throw error
    } catch (e) {
      clearTimeout(timer)
      if (e instanceof SpApiError) throw e
      // Network failure / abort — retry with backoff, then surface clearly.
      if (attempt <= maxRetries) {
        await sleep(1000 * 2 ** (attempt - 1))
        continue
      }
      const reason = e instanceof Error ? (e.name === 'AbortError' ? 'request timed out' : e.message) : 'network error'
      throw new SpApiError(
        `Could not reach the Amazon Selling Partner API (${reason}). Check network connectivity and try again.`,
        0,
        'NETWORK',
        undefined,
        true
      )
    }
  }
}

/** Small concurrency limiter used to stay inside Amazon's item-level rate limits. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}
