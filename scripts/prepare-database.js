const { spawnSync } = require('node:child_process')

if (!process.env.DATABASE_URL && process.env.DB_HOST && process.env.DB_PORT && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD) {
  process.env.DATABASE_URL = `mysql://${encodeURIComponent(process.env.DB_USER)}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST}:${process.env.DB_PORT}/${encodeURIComponent(process.env.DB_NAME)}`
}

if (!process.env.DATABASE_URL) {
  console.log('No DATABASE_URL or GoDaddy DB_* variables found; skipping database setup.')
  process.exit(0)
}

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(command, ['prisma', 'db', 'push', '--accept-data-loss'], {
  stdio: 'inherit',
  env: process.env,
})

if (result.status !== 0) process.exit(result.status || 1)
