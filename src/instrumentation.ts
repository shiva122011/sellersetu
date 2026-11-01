// Next.js instrumentation hook — starts the marketplace auto-sync scheduler
// exactly once per server process (nodejs runtime only).
export async function register() {
  // Marketplace models are optional until the marketplace schema is enabled.
  // Keep the scheduler opt-in so it cannot crash the main application when
  // those tables/delegates are not present in the deployed Prisma client.
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.ENABLE_MARKETPLACE_SCHEDULER === 'true') {
    try {
      const { startMarketplaceScheduler } = await import('@/lib/marketplace/scheduler')
      startMarketplaceScheduler()
    } catch (e) {
      console.error('[instrumentation] marketplace scheduler failed to start:', e)
    }
  }
}
