import { db } from '@/lib/db'
import { encryptVaultPayload, decryptVaultPayload } from '@/lib/crypto'

// Admin-configurable integration settings stored in SystemSetting.
// Secret values (client secrets, API keys) are AES-256-GCM encrypted at rest.

interface SettingDef {
  isSecret: boolean
}

// Known settings registry — new marketplaces add their keys here.
export const SETTING_DEFS: Record<string, SettingDef> = {
  amazon_lwa_client_id: { isSecret: false },
  amazon_lwa_client_secret: { isSecret: true },
  amazon_region: { isSecret: false }, // NA | EU | FE (India sellers → EU)
  amazon_auto_sync_interval_minutes: { isSecret: false }, // auto-sync polling cadence
  amazon_low_stock_threshold: { isSecret: false }, // low-stock alert threshold
  // SP-API Sandbox toggle: while the developer app is in Draft (roles not yet
  // granted), Amazon's PRODUCTION endpoints always answer 403. Amazon's
  // official way to test the exact same app is the SP-API Sandbox endpoint
  // (sandbox.sellingpartnerapi-<region>.amazon.com) — same LWA tokens, fixed
  // test data. "1" routes every SP-API call to the sandbox host.
  amazon_sandbox_mode: { isSecret: false },
}

export const AUTO_SYNC_DEFAULT_MINUTES = 15
export const AUTO_SYNC_MIN_MINUTES = 10 // stay well inside Amazon's Orders API rate limits
export const LOW_STOCK_DEFAULT_THRESHOLD = 5

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.systemSetting.findUnique({ where: { key } })
  if (!row) return null
  if (!row.isSecret) return row.value
  // Secrets are stored as "<iv>:<authTag>:<cipherText>" in the value column.
  try {
    const [iv, authTag, cipherText] = row.value.split(':')
    if (!iv || !authTag || !cipherText) return null
    const payload = decryptVaultPayload(cipherText, iv, authTag) as unknown as Record<string, unknown>
    if (typeof payload === 'string') return payload as unknown as string
    if (payload && typeof payload.value === 'string') return payload.value
    return null
  } catch {
    return null
  }
}

export async function getSecretValue(key: string): Promise<string | null> {
  return getSetting(key)
}

export async function setSetting(
  key: string,
  value: string,
  updatedById?: string | null
): Promise<void> {
  const def = SETTING_DEFS[key]
  const isSecret = def?.isSecret ?? false
  let stored = value
  if (isSecret && value) {
    const { cipherText, iv, authTag } = encryptVaultPayload({ value })
    stored = `${iv}:${authTag}:${cipherText}`
  }
  await db.systemSetting.upsert({
    where: { key },
    create: { key, value: stored, isSecret, updatedById: updatedById ?? null },
    update: { value: stored, isSecret, updatedById: updatedById ?? null },
  })
}

export interface AmazonAppConfig {
  clientId: string | null
  clientSecret: string | null
  region: string // NA | EU | FE
  configured: boolean
  /** When true, all SP-API calls target Amazon's sandbox endpoint (draft-app testing). */
  sandbox: boolean
}

export async function getAmazonAppConfig(): Promise<AmazonAppConfig> {
  const clientId = await getSecretValue('amazon_lwa_client_id')
  const clientSecret = await getSecretValue('amazon_lwa_client_secret')
  const region = (await getSecretValue('amazon_region')) || 'EU'
  const sandboxRaw = await getSetting('amazon_sandbox_mode')
  const configured = Boolean(clientId && clientSecret)
  return {
    clientId,
    clientSecret,
    region: ['NA', 'EU', 'FE'].includes(region) ? region : 'EU',
    configured,
    sandbox: configured && sandboxRaw === '1',
  }
}

export async function getAutoSyncIntervalMinutes(): Promise<number> {
  const raw = await getSetting('amazon_auto_sync_interval_minutes')
  const n = raw ? parseInt(raw, 10) : NaN
  if (!isNaN(n) && n >= AUTO_SYNC_MIN_MINUTES) return n
  return AUTO_SYNC_DEFAULT_MINUTES
}

export async function getLowStockThreshold(): Promise<number> {
  const raw = await getSetting('amazon_low_stock_threshold')
  const n = raw ? parseInt(raw, 10) : NaN
  return !isNaN(n) && n >= 0 ? n : LOW_STOCK_DEFAULT_THRESHOLD
}

export async function setAmazonAppConfig(
  input: { clientId?: string; clientSecret?: string | null; region?: string; sandbox?: boolean },
  updatedById?: string | null
): Promise<void> {
  if (input.clientId !== undefined) await setSetting('amazon_lwa_client_id', input.clientId.trim(), updatedById)
  // clientSecret: only overwrite when a new non-empty value is provided;
  // null clears it explicitly.
  if (input.clientSecret === null) await db.systemSetting.deleteMany({ where: { key: 'amazon_lwa_client_secret' } })
  else if (input.clientSecret !== undefined && input.clientSecret !== '')
    await setSetting('amazon_lwa_client_secret', input.clientSecret.trim(), updatedById)
  if (input.region && ['NA', 'EU', 'FE'].includes(input.region))
    await setSetting('amazon_region', input.region, updatedById)
  if (input.sandbox !== undefined)
    await setSetting('amazon_sandbox_mode', input.sandbox ? '1' : '0', updatedById)
}

export async function isSandboxMode(): Promise<boolean> {
  const raw = await getSetting('amazon_sandbox_mode')
  return raw === '1'
}

export interface AmazonOpsSettings {
  autoSyncIntervalMinutes: number
  lowStockThreshold: number
}

export async function setAmazonOpsSettings(
  input: { autoSyncIntervalMinutes?: number; lowStockThreshold?: number },
  updatedById?: string | null
): Promise<AmazonOpsSettings> {
  if (input.autoSyncIntervalMinutes !== undefined) {
    const n = Math.max(AUTO_SYNC_MIN_MINUTES, Math.min(720, Math.round(input.autoSyncIntervalMinutes)))
    await setSetting('amazon_auto_sync_interval_minutes', String(n), updatedById)
  }
  if (input.lowStockThreshold !== undefined) {
    const n = Math.max(0, Math.min(1000, Math.round(input.lowStockThreshold)))
    await setSetting('amazon_low_stock_threshold', String(n), updatedById)
  }
  return {
    autoSyncIntervalMinutes: await getAutoSyncIntervalMinutes(),
    lowStockThreshold: await getLowStockThreshold(),
  }
}

export function maskSecret(value: string | null): string {
  if (!value) return ''
  if (value.length <= 8) return '••••••••'
  return value.slice(0, 4) + '••••••••' + value.slice(-4)
}
