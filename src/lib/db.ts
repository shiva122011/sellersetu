import { PrismaClient } from '@prisma/client'

// GoDaddy injects these DB_* variables for its hosted MySQL database.
// Build DATABASE_URL here so the app works even when the platform launches
// the generated standalone server directly instead of running npm start.
if (!process.env.DATABASE_URL && process.env.DB_HOST && process.env.DB_PORT && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD) {
  const user = encodeURIComponent(process.env.DB_USER)
  const password = encodeURIComponent(process.env.DB_PASSWORD)
  const database = encodeURIComponent(process.env.DB_NAME)
  process.env.DATABASE_URL = `mysql://${user}:${password}@${process.env.DB_HOST}:${process.env.DB_PORT}/${database}`
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
