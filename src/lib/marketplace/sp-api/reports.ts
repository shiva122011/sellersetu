// ---------------------------------------------------------------------------
// SP-API Reports 2021-06-30 — async report flow used for real FBA customer
// return data (GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA):
//   create report → poll status → fetch document → download TSV → parse.
// Amazon reports take time to process, so a run may still be in progress; the
// sync engine keeps the report id and retries on the next sync.
// ---------------------------------------------------------------------------

import { spApiFetch, type SpApiContext } from './http'
import zlib from 'zlib'
import type { NormalizedReturnRow } from '../types'

interface ReportResponse {
  reportId?: string
  processingStatus?: string // SUBMITTED | IN_QUEUE | IN_PROGRESS | DONE | CANCELLED | FATAL
  reportDocumentId?: string
}

interface DocumentResponse {
  payload?: {
    url?: string
    compressionAlgorithm?: string | null
  }
}

export async function createReturnsReport(
  ctx: SpApiContext,
  input: { marketplaceId: string; dataStart: Date; dataEnd: Date }
): Promise<string | null> {
  const json = await spApiFetch<ReportResponse>(ctx, '/reports/2021-06-30/reports', {
    method: 'POST',
    body: {
      reportType: 'GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA',
      marketplaceIds: [input.marketplaceId],
      dataStartTime: input.dataStart.toISOString(),
      dataEndTime: input.dataEnd.toISOString(),
    },
    requiredPermission: 'Reports (FBA Analytics)',
    maxRetries: 1,
  })
  return json?.reportId || null
}

export async function getReport(
  ctx: SpApiContext,
  reportId: string
): Promise<{ status: string; documentId: string | null }> {
  const json = await spApiFetch<ReportResponse>(ctx, `/reports/2021-06-30/reports/${encodeURIComponent(reportId)}`, {
    requiredPermission: 'Reports (FBA Analytics)',
    maxRetries: 1,
  })
  return {
    status: json?.processingStatus || 'UNKNOWN',
    documentId: json?.reportDocumentId || null,
  }
}

async function downloadReportDocument(
  ctx: SpApiContext,
  documentId: string
): Promise<string> {
  const json = await spApiFetch<DocumentResponse>(
    ctx,
    `/reports/2021-06-30/documents/${encodeURIComponent(documentId)}`,
    {
      requiredPermission: 'Reports (FBA Analytics)',
      maxRetries: 1,
    }
  )
  const url = json?.payload?.url
  if (!url) throw new Error('Amazon returned a report document without a download URL.')
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!res.ok) throw new Error(`Report document download failed (${res.status}).`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (json?.payload?.compressionAlgorithm === 'GZIP') {
    return zlib.gunzipSync(buf).toString('utf8')
  }
  return buf.toString('utf8')
}

/** Parse the FBA customer returns TSV into normalized rows. */
export function parseReturnsTsv(tsv: string): NormalizedReturnRow[] {
  const lines = tsv.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return []
  const headers = lines[0].split('\t').map((h) => h.trim())
  const idx = (name: string) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase())
  const iOrderId = idx('order-id')
  const iOrderItemId = idx('order-item-id')
  const iSku = idx('sku')
  const iAsin = idx('asin')
  const iTitle = idx('product-name')
  const iQty = idx('quantity')
  const iReturnDate = idx('return-date')
  const iReason = idx('reason')
  const iDisposition = idx('detailed-disposition')
  const iStatus = idx('status')
  const iComments = idx('customer-comments')

  const rows: NormalizedReturnRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t')
    const get = (index: number) => (index >= 0 && index < cols.length ? cols[index].trim() : '')
    const orderId = get(iOrderId)
    if (!orderId) continue
    const dateStr = get(iReturnDate)
    const returnDate = dateStr ? new Date(dateStr) : null
    const qty = parseInt(get(iQty) || '1', 10)
    rows.push({
      amazonOrderId: orderId,
      orderItemId: get(iOrderItemId) || null,
      sku: get(iSku) || null,
      asin: get(iAsin) || null,
      productName: get(iTitle) || null,
      quantity: isNaN(qty) ? 1 : qty,
      returnDate: returnDate && !isNaN(returnDate.getTime()) ? returnDate : null,
      reason: get(iReason) || null,
      disposition: get(iDisposition) || null,
      status: get(iStatus) || null,
      comments: get(iComments) || null,
    })
  }
  return rows
}

/**
 * One bounded step of the returns sync: poll a pending report (if any) or
 * create one; when DONE, download + parse. Returns parsed rows or a flag that
 * the report is still processing on Amazon's side.
 */
export async function syncReturnsReportStep(
  ctx: SpApiContext,
  input: {
    marketplaceId: string
    pendingReportId?: string | null
    dataStart: Date
    dataEnd: Date
  }
): Promise<{ rows: NormalizedReturnRow[]; reportId: string | null; stillProcessing: boolean }> {
  let reportId = input.pendingReportId || null
  let documentId: string | null = null

  if (reportId) {
    const st = await getReport(ctx, reportId)
    if (st.status === 'DONE' && st.documentId) {
      documentId = st.documentId
    } else if (['SUBMITTED', 'IN_QUEUE', 'IN_PROGRESS'].includes(st.status)) {
      return { rows: [], reportId, stillProcessing: true }
    } else if (st.status === 'CANCELLED' || st.status === 'FATAL' || st.status === 'UNKNOWN') {
      // fall through: create a fresh report below
      reportId = null
    }
  }

  if (!reportId) {
    reportId = await createReturnsReport(ctx, {
      marketplaceId: input.marketplaceId,
      dataStart: input.dataStart,
      dataEnd: input.dataEnd,
    })
    if (!reportId) return { rows: [], reportId: null, stillProcessing: false }
    // First poll right away — small reports are often ready immediately.
    const st = await getReport(ctx, reportId)
    if (st.status === 'DONE' && st.documentId) {
      documentId = st.documentId
    } else if (['SUBMITTED', 'IN_QUEUE', 'IN_PROGRESS'].includes(st.status)) {
      return { rows: [], reportId, stillProcessing: true }
    } else {
      return { rows: [], reportId, stillProcessing: false }
    }
  }

  if (!documentId) return { rows: [], reportId, stillProcessing: true }

  // Poll a couple more times for freshly completed reports whose document id
  // may only appear on a second status check.
  const tsv = await downloadReportDocument(ctx, documentId)
  return { rows: parseReturnsTsv(tsv), reportId: null, stillProcessing: false } // reportId null → clear pending
}
