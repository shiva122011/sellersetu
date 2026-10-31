const required = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']
const missing = required.filter((name) => !process.env[name])

if (!process.env.DATABASE_URL && missing.length === 0) {
  const user = encodeURIComponent(process.env.DB_USER)
  const password = encodeURIComponent(process.env.DB_PASSWORD)
  const host = process.env.DB_HOST
  const port = process.env.DB_PORT
  const database = encodeURIComponent(process.env.DB_NAME)
  process.env.DATABASE_URL = `mysql://${user}:${password}@${host}:${port}/${database}`
}

if (!process.env.DATABASE_URL) {
  throw new Error(`DATABASE_URL is missing, and GoDaddy DB variables are incomplete: ${missing.join(', ')}`)
}

process.env.NODE_ENV = 'production'
require('../.next/standalone/server.js')
