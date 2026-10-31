// ---------------------------------------------------------------------------
// Auto-synchronization scheduler.
//
// Amazon's push notifications (Orders API change notifications) require an
// AWS SQS/EventBridge destination; polling the authorized Orders API is the
// equivalent supported API mechanism and needs no extra AWS infrastructure.
// A single background loop ticks every 60s and syncs each active connection
// whose watermark is older than the admin-configured interval
// (Admin → Integrations → auto-sync interval, default 15 min).
// ---------------------------------------------------------------------------

const globalScope = globalThis as unknown as { __sellerSetuSchedulerStarted?: boolean }

let tickRunning = false

async function tick() {
  if (tickRunning) return
  tickRunning = true
  try {
    // Load the sync engine only when the timer fires, after the application
    // and Prisma environment have been initialized.
    const { syncDueConnections } = await import('./sync')
    await syncDueConnections()
  } catch (e) {
    console.error('[marketplace-scheduler] tick failed:', e instanceof Error ? e.message : e)
  } finally {
    tickRunning = false
  }
}

export function startMarketplaceScheduler(): void {
  if (globalScope.__sellerSetuSchedulerStarted) return
  globalScope.__sellerSetuSchedulerStarted = true
  const timer = setInterval(() => {
    void tick()
  }, 60 * 1000)
  // Never keep the process alive just for the scheduler.
  if (typeof timer.unref === 'function') timer.unref()
  console.log('[marketplace-scheduler] auto-sync scheduler started (60s tick)')
}
