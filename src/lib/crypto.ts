import crypto from 'crypto'

// Secure credential vault encryption.
// Payloads are AES-256-GCM encrypted at rest; the key is derived from AUTH_SECRET
// via scrypt, so credentials are never stored in plain text or recoverable from the DB alone.

const ALGO = 'aes-256-gcm'
const SALT = 'sellersetu-credential-vault-v1'

function getKey(): Buffer {
  const secret = process.env.AUTH_SECRET || 'sellersetu-dev-secret-change-in-production'
  return crypto.scryptSync(secret, SALT, 32)
}

export interface VaultPayload {
  loginUrl?: string
  username?: string
  password?: string
  mfaNote?: string
  recoveryCodes?: string
  value?: string
  json?: string
}

export function encryptVaultPayload(payload: VaultPayload): {
  cipherText: string; iv: string; authTag: string
} {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const json = JSON.stringify(payload)
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  return {
    cipherText: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  }
}

export function decryptVaultPayload(cipherText: string, iv: string, authTag: string): VaultPayload {
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherText, 'base64')),
    decipher.final(),
  ])
  return JSON.parse(decrypted.toString('utf8'))
}
