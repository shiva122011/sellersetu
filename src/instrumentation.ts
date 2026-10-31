// Next.js instrumentation hook — starts the marketplace auto-sync scheduler
// exactly once per server process (nodejs runtime only).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { startMarketplaceScheduler } = await import('@/lib/marketplace/scheduler')
      startMarketplaceScheduler()
    } catch (e) {
      console.error('[instrumentation] marketplace scheduler failed to start:', e)
    }
  }
}
