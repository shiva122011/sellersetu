import { db } from '@/lib/db'
import { getProvider, getOps, ensureFreshCredentials, AuthExpiredError, decryptJson } from './sync'
import { amazonOps } from './amazon'
import { SPAPI_HOSTS, type SpApiContext } from './sp-api/http'
import type { MarketplaceProvider, MarketplaceOps, ProviderCredentials } from './types'

// ---------------------------------------------------------------------------
// Route-facing bridge: loads a connection (with ownership scoping), refreshes
// credentials when needed, and hands back everything a handler needs.
// ---------------------------------------------------------------------------

export { getProvider, getOps, AuthExpiredError, decryptJson }

export interface ScopedConnection {
  connection: {
    id: string
    customerId: string
    marketplace: string
    status: string
    sellerId: string | null
    sellerName: string | null
    region: string | null
    marketplaceIds: string[]
    accessToken: string | null
    refreshToken: string | null
    tokenExpiresAt: Date | null
    shipFromAddress: string | null
  }
  provider: MarketplaceProvider
  ops: MarketplaceOps
  creds: ProviderCredentials
  ctx: SpApiContext
}

/**
 * Load + validate a marketplace connection owned by `customerId` (or any
 * staff role when customerId is null) and prepare fresh credentials.
 */
export async function loadScopedConnection(
  connectionId: string,
  customerId: string | null
): Promise<ScopedConnection | null> {
  const connection = await db.marketplaceConnection.findUnique({ where: { id: connectionId } })
  if (!connection) return null
  if (customerId && connection.customerId !== customerId) return null

  const provider = getProvider(connection.marketplace)
  const ops = connection.marketplace === 'amazon' ? amazonOps : getOps(connection.marketplace)
  const creds = await ensureFreshCredentials(connection)
  const { getAmazonAppConfig } = await import('./settings')
  const cfg = await getAmazonAppConfig()

  const marketplaceIds: string[] = connection.marketplaceIds
    ? JSON.parse(connection.marketplaceIds)
    : []

  return {
    connection: {
      id: connection.id,
      customerId: connection.customerId,
      marketplace: connection.marketplace,
      status: connection.status,
      sellerId: connection.sellerId,
      sellerName: connection.sellerName,
      region: connection.region,
      marketplaceIds,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      tokenExpiresAt: connection.tokenExpiresAt,
      shipFromAddress: connection.shipFromAddress,
    },
    provider,
    ops,
    creds,
    ctx: { region: connection.region || cfg.region, accessToken: creds.accessToken },
  }
}

export { SPAPI_HOSTS }
