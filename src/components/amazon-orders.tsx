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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  RefreshCw, Unlink, ShieldCheck, AlertTriangle, ShoppingBag, Truck,
  XCircle, Clock, ChevronLeft, ChevronRight, Search, Loader2,
  Store, Undo2, Package, Boxes, Ship, Zap, Info,
} from 'lucide-react'
import { api, ApiUser } from '@/lib/client'
import { formatDateTime } from '@/lib/constants'
import { StatusBadge, DeliveryBadge, money } from './amazon/shared'
import ConnectView from './amazon/connect-view'
import { OrderDetailDialog } from './amazon/order-detail'
import ShipmentsTab from './amazon/shipments-tab'
import ProductsTab from './amazon/products-tab'
import type { ApiConnection, ApiOrder, OrdersData, DashboardAlert } from './amazon/types'

// ---------------------------------------------------------------------------
// Amazon Seller Dashboard (customer side) — REAL SP-API data only.
// Every number shown comes from the connected Amazon seller account via the
// official Selling Partner API. Refresh = authorized sync; auto-sync runs in
// the background on the platform-configured interval.
// ---------------------------------------------------------------------------

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All orders' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'UNSHIPPED', label: 'Unshipped' },
  { value: 'PARTIALLY_SHIPPED', label: 'Partially shipped' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'CANCELED', label: 'Cancelled' },
  { value: 'RETURNED', label: 'Returned' },
]

export default function AmazonOrdersView({ user: _user }: { user: ApiUser }) {
  const [loading, setLoading] = useState(true)
  const [connections, setConnections] = useState<ApiConnection[]>([])
  const [liveConfigured, setLiveConfigured] = useState(false)
  const [sandboxMode, setSandboxMode] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [orders, setOrders] = useState<OrdersData | null>(null)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [disconnectId, setDisconnectId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ApiOrder | null>(null)
  const [tab, setTab] = useState('orders')

  // orders filters
  const [status, setStatus] = useState('ALL')
  const [channel, setChannel] = useState('ALL')
  const [sort, setSort] = useState('newest')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  const loadConnections = useCallback(async () => {
    try {
      const d = await api<{ connections: ApiConnection[]; liveConfigured: boolean; sandboxMode?: boolean }>('/api/marketplace/connections')
      setConnections(d.connections)
      setLiveConfigured(d.liveConfigured)
      setSandboxMode(Boolean(d.sandboxMode))
      setActiveId((prev) => {
        if (prev && d.connections.some((c) => c.id === prev)) return prev
        const connected = d.connections.find((c) => c.status === 'CONNECTED')
        return connected?.id || d.connections[0]?.id || null
      })
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [])

  const loadOrders = useCallback(async () => {
    if (!activeId) return
    setOrdersLoading(true)
    try {
      const params = new URLSearchParams({ connectionId: activeId, status, page: String(page) })
      if (channel !== 'ALL') params.set('channel', channel)
      if (sort !== 'newest') params.set('sort', sort)
      if (q.trim()) params.set('q', q.trim())
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const d = await api<OrdersData>(`/api/marketplace/orders?${params.toString()}`)
      setOrders(d)
    } catch (e) {
      toast({
        title: 'Could not load orders',
        description: e instanceof Error ? e.message : 'Please try again',
        variant: 'destructive',
      })
    } finally {
      setOrdersLoading(false)
    }
  }, [activeId, status, page, q, from, to, channel, sort])

  useEffect(() => { loadConnections() }, [loadConnections])
  useEffect(() => { setPage(1) }, [status, q, from, to, activeId, channel, sort])
  useEffect(() => { loadOrders() }, [loadOrders])

  // OAuth round-trip feedback (redirect back from Amazon authorization)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('connected') === 'success') {
      toast({
        title: 'Amazon account connected',
        description: 'Your seller account was authorized via the official Amazon process. Real data is syncing now.',
      })
      window.history.replaceState({}, '', '/')
    } else if (sp.get('connected') === 'error') {
      toast({
        title: 'Amazon authorization incomplete',
        description: sp.get('reason') || 'Please try connecting again.',
        variant: 'destructive',
      })
      window.history.replaceState({}, '', '/')
    }
  }, [])

  async function connect() {
    setConnecting(true)
    try {
      const d = await api<{ flow: string; authorizeUrl?: string }>('/api/marketplace/connections', {
        method: 'POST',
        body: JSON.stringify({ marketplace: 'amazon', flow: 'oauth' }),
      })
      if (d.authorizeUrl) {
        window.location.href = d.authorizeUrl
        return
      }
      await loadConnections()
    } catch (e) {
      toast({
        title: 'Could not start Amazon authorization',
        description: e instanceof Error ? e.message : 'Please try again',
        variant: 'destructive',
      })
    } finally {
      setConnecting(false)
    }
  }

  async function syncNow() {
    if (!activeId) return
    setSyncing(true)
    try {
      const d = await api<{ sync: { ok: boolean; status: string; ordersSynced: number; listingsSynced: number; returnsSynced: number; message?: string; warnings?: string[] } }>(
        `/api/marketplace/connections/${activeId}/sync`,
        { method: 'POST' }
      )
      if (d.sync.ok) {
        toast({
          title: 'Synchronized with Amazon',
          description: `${d.sync.ordersSynced} orders · ${d.sync.listingsSynced} listings · ${d.sync.returnsSynced} return rows${d.sync.warnings?.length ? ` — ${d.sync.warnings.length} permission warning(s)` : ''}`,
        })
        if (d.sync.warnings?.length) {
          toast({ title: 'Some data needs extra Amazon permissions', description: d.sync.warnings[0], variant: 'destructive' })
        }
      } else {
        toast({ title: 'Sync failed', description: d.sync.message || 'Please try again.', variant: 'destructive' })
      }
      await loadConnections()
      await loadOrders()
    } catch (e) {
      toast({
        title: 'Sync failed',
        description: e instanceof Error ? e.message : 'Please try again',
        variant: 'destructive',
      })
    } finally {
      setSyncing(false)
    }
  }

  async function disconnect() {
    if (!disconnectId) return
    try {
      await api(`/api/marketplace/connections/${disconnectId}`, { method: 'DELETE' })
      toast({ title: 'Amazon account disconnected', description: 'Authorization revoked and all cached marketplace data removed.' })
      setDisconnectId(null)
      setOrders(null)
      setActiveId(null)
      await loadConnections()
    } catch (e) {
      toast({
        title: 'Could not disconnect',
        description: e instanceof Error ? e.message : 'Please try again',
        variant: 'destructive',
      })
    }
  }

  const active = connections.find((c) => c.id === activeId) || null

  // ============================= LOADING =============================
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-stone-200/60 rounded animate-pulse" />
        <div className="h-36 rounded-2xl bg-white border animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{[...Array(5)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-white border animate-pulse" />)}</div>
        <div className="h-72 rounded-2xl bg-white border animate-pulse" />
      </div>
    )
  }

  // ============================= NOT CONNECTED =============================
  if (connections.length === 0) {
    return <ConnectView liveConfigured={liveConfigured} sandboxMode={sandboxMode} connecting={connecting} onConnect={connect} />
  }

  // ============================= CONNECTED =============================
  const expired = active?.status === 'EXPIRED'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-emerald-950">Amazon Seller Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Live order, shipment, inventory and return data from your connected Amazon seller account.</p>
        </div>
        <Badge variant="outline" className={sandboxMode ? 'gap-1.5 border-amber-200 bg-amber-50 text-amber-800' : 'gap-1.5 border-teal-200 bg-teal-50 text-teal-800'}>
          <ShieldCheck className="h-3.5 w-3.5" /> {sandboxMode ? 'Official SP-API · Amazon sandbox data' : 'Official SP-API · live data'}
        </Badge>
      </div>

      {/* Alerts bar */}
      {orders?.alerts && orders.alerts.length > 0 && (
        <div className="space-y-2">
          {orders.alerts.map((a: DashboardAlert) => (
            <div key={a.key} className={`rounded-xl border px-4 py-2.5 text-xs flex items-center gap-2 ${
              a.tone === 'danger' ? 'border-red-200 bg-red-50 text-red-800'
              : a.tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-teal-200 bg-teal-50 text-teal-900'
            }`}>
              {a.tone === 'danger' ? <XCircle className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
              <p className="flex-1">{a.text}</p>
              {a.link === 'shipments' && <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setTab('shipments')}>Open</Button>}
              {a.link === 'products' && <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setTab('products')}>Open</Button>}
            </div>
          ))}
        </div>
      )}

      {/* Connection status card */}
      {active && (
        <Card className="border-emerald-100">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start gap-4">
              <div className="h-11 w-11 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                <Store className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-48">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-emerald-950">{active.sellerName || 'Amazon Seller Account'}</h3>
                  <Badge variant="outline" className={`text-[10px] ${
                    active.status === 'CONNECTED' ? 'border-emerald-200 text-emerald-700'
                    : active.status === 'EXPIRED' ? 'border-red-200 text-red-600'
                    : 'border-amber-200 text-amber-700'
                  }`}>
                    {active.status === 'CONNECTED' ? 'Connected' : active.status === 'EXPIRED' ? 'Authorization expired' : 'Sync error'}
                  </Badge>
                  {active.region && <Badge variant="outline" className="text-[10px] border-stone-200 text-stone-600">Region {active.region}</Badge>}
                  {sandboxMode && (
                    <Badge variant="outline" className="text-[10px] gap-1 border-amber-200 bg-amber-50 text-amber-800">
                      <Info className="h-3 w-3" /> Sandbox data
                    </Badge>
                  )}
                  {active.autoSyncEnabled && (
                    <Badge variant="outline" className="text-[10px] gap-1 border-violet-200 bg-violet-50 text-violet-700">
                      <Zap className="h-3 w-3" /> Auto-sync on
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Authorized {active.authorizedAt ? formatDateTime(active.authorizedAt) : '—'}
                  {active.sellerId ? ` · Seller ID ${active.sellerId}` : ''}
                  {` · ${active.orderCount} orders · ${active.listingCount ?? 0} listings cached`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Last synchronization: <b className={active.lastSyncAt ? 'text-emerald-700' : 'text-amber-600'}>
                    {active.lastSyncAt ? formatDateTime(active.lastSyncAt) : 'never — run a sync'}
                  </b>
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={syncNow} disabled={syncing || expired} size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                  {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />}
                  Sync now
                </Button>
                <Button onClick={() => setDisconnectId(active.id)} size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 gap-2">
                  <Unlink className="h-4 w-4" /> Disconnect
                </Button>
              </div>
            </div>
            {(active.lastSyncError || orders?.connection.lastSyncError) && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Last synchronization error</p>
                  <p>{active.lastSyncError || orders?.connection.lastSyncError}</p>
                </div>
              </div>
            )}
            {expired && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50/70 px-3.5 py-2.5 text-xs text-red-800 flex items-start gap-2">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <p>Amazon revoked or expired the authorization. Data shown is stale. Disconnect and connect again to re-authorize through Amazon&apos;s official flow.</p>
              </div>
            )}
            {sandboxMode && !expired && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-900 flex items-start gap-2">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <p>
                  <b>Sandbox mode is on.</b> All data is fetched from Amazon&apos;s official SP-API Sandbox (Amazon&apos;s fixed test dataset) while the platform&apos;s SP-API app is in Draft. Once the app is published, the platform team turns sandbox off and this dashboard switches to your live account data.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {orders && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <StatCard label="Total orders" value={orders.stats.total} tone="text-emerald-950" icon={<ShoppingBag className="h-4 w-4 text-emerald-600" />} />
          <StatCard label="Pending / unshipped" value={orders.stats.pending} tone="text-amber-700" icon={<Clock className="h-4 w-4 text-amber-500" />} />
          <StatCard label="Awaiting shipment" value={orders.stats.mfnUnshipped} tone="text-orange-700" icon={<Ship className="h-4 w-4 text-orange-500" />} />
          <StatCard label="Shipped" value={orders.stats.shipped} tone="text-emerald-700" icon={<Truck className="h-4 w-4 text-emerald-500" />} />
          <StatCard label="Cancelled" value={orders.stats.canceled} tone="text-red-700" icon={<XCircle className="h-4 w-4 text-red-500" />} />
          <StatCard label="Returned" value={orders.stats.returned} tone="text-violet-700" icon={<Undo2 className="h-4 w-4 text-violet-500" />} />
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white border border-stone-200 rounded-xl p-1 h-auto w-full sm:w-auto flex-wrap">
          <TabsTrigger value="orders" className="gap-1.5 text-xs rounded-lg"><ShoppingBag className="h-3.5 w-3.5" /> Orders</TabsTrigger>
          <TabsTrigger value="shipments" className="gap-1.5 text-xs rounded-lg"><Ship className="h-3.5 w-3.5" /> Shipments</TabsTrigger>
          <TabsTrigger value="products" className="gap-1.5 text-xs rounded-lg"><Boxes className="h-3.5 w-3.5" /> Products & Inventory</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4 space-y-4">
          {/* Filters */}
          <Card className="border-stone-200">
            <CardContent className="p-4 grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 items-end">
              <div className="space-y-1.5 xl:col-span-2">
                <Label htmlFor="order-search" className="text-xs">Search order ID or product</Label>
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <Input id="order-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 402-1234567" className="pl-9" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_FILTERS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fulfilment</Label>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All</SelectItem>
                    <SelectItem value="MFN">Self-ship (MFN)</SelectItem>
                    <SelectItem value="AFN">FBA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Sort</Label>
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                    <SelectItem value="updated">Last updated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="order-from" className="text-xs">From</Label>
                  <Input id="order-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="order-to" className="text-xs">To</Label>
                  <Input id="order-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Orders — desktop table */}
          {orders && orders.orders.length > 0 && (
            <Card className="border-emerald-100 hidden md:block overflow-hidden">
              <div className="max-h-[560px] overflow-y-auto orders-table-scroll">
                <Table>
                  <TableHeader className="sticky top-0 bg-white z-10">
                    <TableRow className="border-emerald-100">
                      <TableHead className="text-emerald-900">Order</TableHead>
                      <TableHead className="text-emerald-900">Date</TableHead>
                      <TableHead className="text-emerald-900">Status</TableHead>
                      <TableHead className="text-emerald-900">Products</TableHead>
                      <TableHead className="text-emerald-900">Fulfilment</TableHead>
                      <TableHead className="text-emerald-900 text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.orders.map((o) => (
                      <TableRow key={o.id} className="cursor-pointer hover:bg-emerald-50/40 border-stone-100" onClick={() => setDetail(o)}>
                        <TableCell>
                          <p className="font-mono text-xs font-semibold text-emerald-900">{o.amazonOrderId}</p>
                          {o.isReturned && <Badge variant="outline" className="text-[9px] border-violet-200 text-violet-700 gap-1 mt-1"><Undo2 className="h-2.5 w-2.5" /> Returned</Badge>}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{formatDateTime(o.purchaseDate)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <StatusBadge status={o.orderStatus} />
                            {o.deliveryStatus && <DeliveryBadge status={o.deliveryStatus} />}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-72">
                          <p className="text-xs truncate">{o.items[0]?.title || '—'}</p>
                          {o.items.length > 1 && <p className="text-[10px] text-muted-foreground">+ {o.items.length - 1} more item{o.items.length > 2 ? 's' : ''} · {o.numberOfItems || o.items.reduce((s, it) => s + it.quantityOrdered, 0)} units</p>}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="font-medium">{o.fulfillmentChannel === 'AFN' ? 'Amazon (FBA)' : 'Merchant (self-ship)'}</span>
                          {o.trackingNumber && <p className="text-[10px] text-muted-foreground font-mono">{o.trackingNumber}</p>}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-emerald-900 whitespace-nowrap">{money(o.orderTotal, o.currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {/* Orders — mobile cards */}
          {orders && orders.orders.length > 0 && (
            <div className="md:hidden space-y-3">
              {orders.orders.map((o) => (
                <Card key={o.id} className="border-stone-200 cursor-pointer hover:border-emerald-300 transition-colors" onClick={() => setDetail(o)}>
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-mono text-xs font-semibold text-emerald-900">{o.amazonOrderId}</p>
                      <p className="font-semibold text-sm text-emerald-900">{money(o.orderTotal, o.currency)}</p>
                    </div>
                    <p className="text-xs text-stone-600 line-clamp-2">{o.items[0]?.title}{o.items.length > 1 ? ` + ${o.items.length - 1} more` : ''}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <StatusBadge status={o.orderStatus} />
                      {o.deliveryStatus && <DeliveryBadge status={o.deliveryStatus} />}
                      {o.isReturned && <Badge variant="outline" className="text-[10px] border-violet-200 text-violet-700">Returned</Badge>}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{formatDateTime(o.purchaseDate)} · {o.fulfillmentChannel === 'AFN' ? 'FBA' : 'Self-ship'}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Empty state */}
          {orders && orders.orders.length === 0 && (
            <Card className="border-dashed border-stone-300">
              <CardContent className="py-12 text-center">
                <Package className="h-8 w-8 text-stone-300 mx-auto mb-3" />
                <h3 className="font-semibold text-emerald-950">
                  {orders.pagination.total === 0 ? 'No orders synced yet' : 'No orders match your filters'}
                </h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  {orders.pagination.total === 0
                    ? 'Your connected account has no orders in the synced window. Run "Sync now" to pull the latest data from Amazon.'
                    : 'Try clearing the search, widening the date range, or syncing for fresh data.'}
                </p>
                {orders.pagination.total > 0 && (
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => { setQ(''); setStatus('ALL'); setFrom(''); setTo(''); setChannel('ALL') }}>
                    Clear filters
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Pagination */}
          {orders && orders.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {orders.orders.length} of {orders.pagination.total} orders
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-xs">Page {orders.pagination.page} / {orders.pagination.totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= orders.pagination.totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="shipments" className="mt-4">
          {activeId && <ShipmentsTab connectionId={activeId} onChanged={() => { loadConnections(); loadOrders() }} />}
        </TabsContent>

        <TabsContent value="products" className="mt-4">
          {activeId && <ProductsTab connectionId={activeId} />}
        </TabsContent>
      </Tabs>

      {/* Order detail dialog */}
      <OrderDetailDialog order={detail} onClose={() => setDetail(null)} onChanged={() => { loadConnections(); loadOrders() }} />

      {/* Disconnect confirm */}
      <AlertDialog open={!!disconnectId} onOpenChange={(open) => !open && setDisconnectId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect your Amazon account?</AlertDialogTitle>
            <AlertDialogDescription>
              This revokes SellerSetu&apos;s access at Amazon (server-side token revocation), deletes all cached order, listing and shipment data from our servers, and removes the connection. You can reconnect any time through the official authorization flow.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep connected</AlertDialogCancel>
            <AlertDialogAction onClick={disconnect} className="bg-red-600 hover:bg-red-700">Disconnect</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function StatCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: string }) {
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
