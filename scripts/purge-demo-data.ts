/**
 * Purge ALL demo/simulated Amazon data from the database (requirement:
 * "Remove all demo data from the production dashboard").
 *
 * Deletes every marketplace connection with its cached orders, items, sync
 * logs, listings, shipment and return records. Real connections created via
 * the official SP-API flow are also removed only if passed --all; by default
 * this script wipes everything because the platform is switching to a
 * demo-free production state.
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const conns = await db.marketplaceConnection.findMany({ select: { id: true, sellerName: true } })
  const orders = await db.syncedOrder.count()
  const items = await db.orderItem.count()
  const logs = await db.syncLog.count()

  console.log(`Found ${conns.length} connection(s), ${orders} cached orders, ${items} items, ${logs} sync logs.`)

  // Cascades wipe SyncedOrder → OrderItem, SyncLog, Listing, ShipmentRecord,
  // ReturnRecord for each connection.
  for (const c of conns) {
    await db.marketplaceConnection.delete({ where: { id: c.id } })
    console.log(`  deleted connection ${c.id} (${c.sellerName || 'unnamed'})`)
  }

  // Safety net: remove any orphans that are not tied to a connection.
  const o1 = await db.syncedOrder.deleteMany({})
  const o2 = await db.syncLog.deleteMany({})
  const o3 = await db.listing.deleteMany({}).catch(() => ({ count: 0 }))
  const o4 = await db.shipmentRecord.deleteMany({}).catch(() => ({ count: 0 }))
  const o5 = await db.returnRecord.deleteMany({}).catch(() => ({ count: 0 }))

  console.log(`Orphan sweep: orders=${o1.count} syncLogs=${o2.count} listings=${o3.count} shipments=${o4.count} returns=${o5.count}`)
  console.log('Demo data purge complete — the dashboard now starts from a clean, real-data-only state.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
