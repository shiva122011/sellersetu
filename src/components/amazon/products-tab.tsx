'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Boxes, Loader2, Search, PackageX, AlertTriangle, TrendingDown, ChevronLeft, ChevronRight,
  Warehouse, Store, PackageCheck, Truck, PencilLine, Info,
} from 'lucide-react'
import { api } from '@/lib/client'
import { formatDateTime, formatINR } from '@/lib/constants'
import type { ListingsData, ApiListing } from './types'

// Products & Inventory tab — REAL listings and stock pulled from the
// Listings Items API + FBA Inventory API. Quantity updates post to Amazon's
// real Listings Items PATCH endpoint.

const STOCK_FILTERS = [
  { value: 'ALL', label: 'All stock levels' },
  { value: 'LOW', label: 'Low stock' },
  { value: 'OUT', label: 'Out of stock' },
  { value: 'ISSUES', label: 'With listing issues' },
  { value: 'OK', label: 'Healthy stock' },
]

export default function ProductsTab({ connectionId }: { connectionId: string }) {
  const [data, setData] = useState<ListingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [channel, setChannel] = useState('ALL')
  const [stock, setStock] = useState('ALL')
  const [page, setPage] = useState(1)
  const [editListing, setEditListing] = useState<ApiListing | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ connectionId, page: String(page) })
      if (q.trim()) params.set('q', q.trim())
      if (channel !== 'ALL') params.set('channel', channel)
      if (stock !== 'ALL') params.set('stock', stock)
      const d = await api<ListingsData>(`/api/marketplace/listings?${params.toString()}`)
      setData(d)
    } catch (e) {
      toast({ title: 'Could not load listings', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [connectionId, q, channel, stock, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [q, channel, stock, connectionId])

  if (loading && !data) return <div className="h-72 rounded-2xl bg-white border animate-pulse" />

  return (
    <div className="space-y-4">
      {/* Stats */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniStat label="Total SKUs" value={data.stats.total} icon={<Boxes className="h-4 w-4 text-emerald-600" />} tone="text-emerald-950" />
          <MiniStat label={`Low stock (≤ ${data.lowStockThreshold})`} value={data.stats.lowStock} icon={<TrendingDown className="h-4 w-4 text-amber-500" />} tone="text-amber-700" />
          <MiniStat label="Out of stock" value={data.stats.outOfStock} icon={<PackageX className="h-4 w-4 text-red-500" />} tone="text-red-700" />
          <MiniStat label="Listing issues" value={data.stats.withIssues} icon={<AlertTriangle className="h-4 w-4 text-orange-500" />} tone="text-orange-700" />
        </div>
      )}

      {/* Filters */}
      <Card className="border-stone-200">
        <CardContent className="p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="listing-search" className="text-xs">Search SKU, ASIN or product name</Label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <Input id="listing-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. BOTTLE-SS-1L" className="pl-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fulfilment</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All channels</SelectItem>
                <SelectItem value="MERCHANT"><span className="flex items-center gap-1.5"><Store className="h-3.5 w-3.5" /> Self-ship (MFN)</span></SelectItem>
                <SelectItem value="AMAZON"><span className="flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> FBA</span></SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Stock</Label>
            <Select value={stock} onValueChange={setStock}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STOCK_FILTERS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Listings table */}
      {data && data.listings.length > 0 && (
        <Card className="border-emerald-100 overflow-hidden">
          <div className="max-h-[560px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10">
                <TableRow className="border-emerald-100">
                  <TableHead className="text-emerald-900">Product</TableHead>
                  <TableHead className="text-emerald-900">SKU / ASIN</TableHead>
                  <TableHead className="text-emerald-900">Price</TableHead>
                  <TableHead className="text-emerald-900">Stock</TableHead>
                  <TableHead className="text-emerald-900">Channel</TableHead>
                  <TableHead className="text-emerald-900">Health</TableHead>
                  <TableHead className="text-emerald-900 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.listings.map((l) => {
                  const qty = l.quantity
                  const low = qty !== null && qty !== undefined && qty > 0 && qty <= data.lowStockThreshold
                  const out = qty === 0
                  return (
                    <TableRow key={l.id} className="border-stone-100">
                      <TableCell className="max-w-64">
                        <p className="text-xs font-medium text-stone-800 truncate">{l.productName || '—'}</p>
                        <p className="text-[10px] text-muted-foreground">Updated {formatDateTime(l.updatedAt)}</p>
                      </TableCell>
                      <TableCell>
                        <p className="font-mono text-xs text-emerald-900">{l.sku}</p>
                        {l.asin && <p className="text-[10px] text-muted-foreground font-mono">ASIN {l.asin}</p>}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-emerald-900 whitespace-nowrap">
                        {l.price !== null && l.price !== undefined ? formatINR(l.price) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${
                          out ? 'border-red-200 bg-red-50 text-red-700'
                          : low ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        }`}>
                          {qty === null || qty === undefined ? '—' : out ? 'Out of stock' : `${qty} unit(s)`}
                        </Badge>
                        {l.fulfillmentChannel === 'AMAZON' && typeof l.reservedQuantity === 'number' && l.reservedQuantity > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-1">{l.reservedQuantity} reserved</p>
                        )}
                        {l.fulfillmentChannel === 'AMAZON' && typeof l.inboundQuantity === 'number' && l.inboundQuantity > 0 && (
                          <p className="text-[10px] text-muted-foreground">{l.inboundQuantity} inbound</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${l.fulfillmentChannel === 'AMAZON' ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-orange-200 bg-orange-50 text-orange-800'}`}>
                          {l.fulfillmentChannel === 'AMAZON' ? 'FBA' : 'Self-ship'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {l.status === 'HAS_ISSUES' ? (
                          <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700 gap-1"><AlertTriangle className="h-3 w-3" /> Issues</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] border-emerald-200 text-emerald-700 gap-1"><PackageCheck className="h-3 w-3" /> Active</Badge>
                        )}
                        {l.issues.length > 0 && (
                          <p className="text-[10px] text-orange-700 mt-1 max-w-44 truncate" title={l.issues.map((i) => i.message).join('; ')}>
                            {l.issues[0].message}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {l.fulfillmentChannel === 'MERCHANT' ? (
                          <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1.5" onClick={() => setEditListing(l)}>
                            <PencilLine className="h-3 w-3" /> Update stock
                          </Button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Amazon-managed</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Empty states */}
      {data && data.listings.length === 0 && (
        <Card className="border-dashed border-stone-300">
          <CardContent className="py-12 text-center">
            <Boxes className="h-8 w-8 text-stone-300 mx-auto mb-3" />
            {data.stats.total === 0 ? (
              <>
                <h3 className="font-semibold text-emerald-950">No listings synced yet</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  Listings appear after the first successful synchronization. If your account was connected recently, use &ldquo;Sync now&rdquo;.
                  Listing data requires the Product Listing permission on our SP-API app — the sync warning will say so if Amazon restricts it.
                </p>
              </>
            ) : (
              <>
                <h3 className="font-semibold text-emerald-950">No listings match your filters</h3>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => { setQ(''); setChannel('ALL'); setStock('ALL') }}>Clear filters</Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Showing {data.listings.length} of {data.pagination.total} listings</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-xs">Page {data.pagination.page} / {data.pagination.totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      <UpdateStockDialog listing={editListing} onClose={() => setEditListing(null)} onSaved={load} />
    </div>
  )
}

function MiniStat({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: string }) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-4 flex items-center gap-3">
      <div className="h-9 w-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className={`text-xl font-bold leading-none ${tone}`}>{value}</p>
        <p className="text-[11px] text-muted-foreground mt-1 truncate">{label}</p>
      </div>
    </div>
  )
}

function UpdateStockDialog({
  listing,
  onClose,
  onSaved,
}: {
  listing: ApiListing | null
  onClose: () => void
  onSaved: () => void
}) {
  const [quantity, setQuantity] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (listing) setQuantity(String(listing.quantity ?? 0))
  }, [listing])

  if (!listing) return null

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const d = await api<{ message: string }>(`/api/marketplace/listings/${listing!.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity: Number(quantity) }),
      })
      toast({ title: 'Inventory updated on Amazon', description: d.message })
      onClose()
      onSaved()
    } catch (err) {
      toast({ title: 'Amazon rejected the update', description: err instanceof Error ? err.message : 'Try again', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!listing} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-emerald-950">Update inventory</DialogTitle>
          <DialogDescription>
            {listing.productName || listing.sku} · {listing.asin ? `ASIN ${listing.asin}` : ''}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="qty" className="text-xs">Fulfillable quantity</Label>
            <Input id="qty" type="number" min={0} max={100000} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
          </div>
          <div className="rounded-lg bg-teal-50 border border-teal-100 p-3 text-[11px] text-teal-900 flex gap-2">
            <Warehouse className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            This calls Amazon&apos;s official Listings Items API and changes the live offer on your Seller Central account.
          </div>
          <Button type="submit" disabled={saving} className="w-full bg-teal-600 hover:bg-teal-700 gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PencilLine className="h-4 w-4" />}
            Update on Amazon
          </Button>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Info className="h-3 w-3" /> FBA stock is managed by Amazon — send inventory to FBA warehouses in Seller Central.</p>
        </form>
      </DialogContent>
    </Dialog>
  )
}
