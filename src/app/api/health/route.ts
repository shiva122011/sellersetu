import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/health — public liveness & readiness probe (uptime monitors, container orchestrators).
// Deliberately unauthenticated and leak-free: reports only service status, DB reachability and latency.
export async function GET() {
  const startedAt = Date.now()
  let dbUp = false
  let dbLatencyMs: number | null = null
  try {
    const t0 = Date.now()
    await db.$queryRaw`SELECT 1`
    dbUp = true
    dbLatencyMs = Date.now() - t0
  } catch {
    dbUp = false
  }

  const healthy = dbUp
  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      service: 'sellersetu',
      checks: {
        database: { up: dbUp, latencyMs: dbLatencyMs },
      },
      totalLatencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  )
}
