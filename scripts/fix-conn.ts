import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const rahul = await db.user.findUnique({ where: { email: 'rahul@example.com' } })
const conn = await db.marketplaceConnection.findFirst({ where: { customerId: rahul!.id, marketplace: 'amazon' } })
if (conn && !conn.sellerName) {
  await db.marketplaceConnection.update({
    where: { id: conn.id },
    data: {
      sellerName: 'Sharma Essentials',
      sellerId: 'A0010522859',
      region: 'NA',
      marketplaceIds: JSON.stringify(['A21TJRUUN4KGV']),
    },
  })
  console.log('seller profile set')
} else console.log('already set or no conn:', conn?.sellerName)
await db.$disconnect()
