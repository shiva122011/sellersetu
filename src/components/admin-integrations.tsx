'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Plug, ShieldCheck, Loader2, Info, Store, RefreshCw, CheckCircle2, AlertTriangle, Lock, Zap, KeyRound, Play, XCircle,
} from 'lucide-react'
import { api, ApiUser } from '@/lib/client'
import { formatDateTime } from '@/lib/constants'
import { AMAZON_PERMISSION_REQUIREMENTS } from '@/lib/marketplace/types'

// ---------------------------------------------------------------------------
// Admin — Amazon SP-API integration settings (Phase 1, real-data only).
// Saving the LWA app credentials activates the official Amazon authorization
// for customers. There is no demo mode anywhere in the system.
// ---------------------------------------------------------------------------

interface IntegrationData {
  config: {
    clientId: string
    clientSecretMasked: string
    hasSecret: boolean
    region: string
    configured: boolean
    sandboxMode: boolean
  }
  opsSettings: { autoSyncIntervalMinutes: number; lowStockThreshold: number }
  redirectUriNote: string
  requirementNote: string
  connections: Array<{
    id: string
    marketplace: string
    status: string
    sellerName?: string | null
    sellerId?: string | null
    authorizedAt?: string | null
    lastSyncAt?: string | null
    lastSyncError?: string | null
    orderCount: number
    listingCount: number
    customer: { id: string; name: string; email: string; company?: string | null }
  }>
}

interface ConnectResult {
  connection: { id: string; status: string; sellerName?: string | null; sellerId?: string | null; region?: string | null }
  profile: { sellerName: string; marketplaceIds: string[]; region: string }
  sync: {
    ok: boolean; status: string; ordersSynced: number; listingsSynced: number; returnsSynced: number
    message?: string; warnings?: string[]
  }
  notice: string
}

export default function AdminIntegrations({ user }: { user: ApiUser }) {
  const [data, setData] = useState<IntegrationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [region, setRegion] = useState('EU')
  const [autoSync, setAutoSync] = useState(15)
  const [lowStock, setLowStock] = useState(5)
  const [sandboxMode, setSandboxMode] = useState(false)
  const [savingSandbox, setSavingSandbox] = useState(false)
  const isAdmin = user.role === 'ADMIN'

  // Self-authorization connect (paste the refresh token created in Amazon)
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; email: string; company?: string | null }>>([])
  const [linkTo, setLinkTo] = useState('self')
  const [refreshToken, setRefreshToken] = useState('')
  const [sellerId, setSellerId] = useState('')
  const [forceReplace, setForceReplace] = useState(false)
  const [testing, setTesting] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [connectResult, setConnectResult] = useState<ConnectResult | null>(null)

  useEffect(() => {
    if (!isAdmin) return
    api<{ customers: Array<{ id: string; name: string; email: string; company?: string | null }> }>('/api/admin/customers')
      .then((d) => setCustomers(d.customers))
      .catch(() => { /* directory is optional for the link-to picker */ })
  }, [isAdmin])

  async function testCredentials() {
    setTesting(true)
    setTestResult(null)
    try {
      const d = await api<{ message: string }>('/api/admin/integrations/amazon/test-credentials', { method: 'POST' })
      setTestResult({ ok: true, message: d.message })
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : 'The credentials test failed.' })
    } finally {
      setTesting(false)
    }
  }

  async function connectWithToken(e: React.FormEvent) {
    e.preventDefault()
    setConnecting(true)
    setConnectResult(null)
    try {
      const d = await api<ConnectResult>('/api/admin/integrations/amazon/connect', {
        method: 'POST',
        body: JSON.stringify({ refreshToken, sellerId, linkTo, force: forceReplace }),
      })
      setConnectResult(d)
      toast({ title: 'Amazon seller account connected', description: d.notice })
      setRefreshToken('')
      setSellerId('')
      setForceReplace(false)
      await load()
    } catch (err) {
      toast({
        title: 'Amazon rejected the connection',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      })
    } finally {
      setConnecting(false)
    }
  }

  const load = useCallback(async () => {
    try {
      const d = await api<IntegrationData>('/api/admin/integrations/amazon')
      setData(d)
      setClientId(d.config.clientId || '')
      setRegion(d.config.region || 'EU')
      setAutoSync(d.opsSettings.autoSyncIntervalMinutes)
      setLowStock(d.opsSettings.lowStockThreshold)
      setSandboxMode(Boolean(d.config.sandboxMode))
      setClientSecret('')
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Sandbox mode is saved immediately on toggle — it decides which Amazon
  // endpoint (sandbox vs production) every SP-API call and connect attempt uses.
  async function toggleSandbox(on: boolean) {
    setSavingSandbox(true)
    try {
      await api<{ config: IntegrationData['config'] }>('/api/admin/integrations/amazon', {
        method: 'PUT',
        body: JSON.stringify({ sandboxMode: on }),
      })
      setSandboxMode(on)
      toast({
        title: on ? 'Amazon sandbox mode enabled' : 'Sandbox mode disabled — live SP-API',
        description: on
          ? 'SP-API calls now target sandbox.sellingpartnerapi — draft-app tokens can connect and pull Amazon\'s fixed sandbox test data.'
          : 'SP-API calls now target the production endpoints — the app must be published with roles granted.',
      })
      await load()
    } catch (err) {
      toast({ title: 'Could not update sandbox mode', description: err instanceof Error ? err.message : 'Try again', variant: 'destructive' })
    } finally {
      setSavingSandbox(false)
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const body: Record<string, string | number> = { region, autoSyncIntervalMinutes: autoSync, lowStockThreshold: lowStock }
      if (clientId.trim() && clientId.trim() !== (data?.config.clientId || '')) body.clientId = clientId.trim()
      if (clientSecret.trim()) body.clientSecret = clientSecret.trim()
      const d = await api<{ config: IntegrationData['config'] }>('/api/admin/integrations/amazon', {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      toast({
        title: 'Amazon integration updated',
        description: d.config.configured
          ? 'Live integration active — customers can now authorize their real Amazon seller accounts.'
          : 'Saved. Add both the Client ID and Client Secret to activate customer authorization.',
      })
      await load()
    } catch (err) {
      toast({ title: 'Could not save settings', description: err instanceof Error ? err.message : 'Try again', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="h-64 rounded-2xl bg-white border animate-pulse" />
  }
  if (!data) return null

  const configured = data.config.configured

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-emerald-950">Marketplace integrations</h2>
          <p className="text-sm text-muted-foreground">Connect customers&apos; seller accounts via official marketplace APIs — real data only, no simulated providers.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-2"><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
      </div>

      {/* Mode banner */}
      <Card className={configured ? 'border-teal-200 bg-teal-50/60' : 'border-amber-200 bg-amber-50/60'}>
        <CardContent className="p-4 flex items-start gap-3">
          {configured ? <ShieldCheck className="h-5 w-5 text-teal-700 shrink-0 mt-0.5" /> : <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />}
          <div className="text-sm space-y-1">
            <p className={`font-semibold ${configured ? 'text-teal-900' : 'text-amber-900'}`}>
              {configured ? 'Live — official Amazon SP-API' : 'Not configured — customer authorization is locked'}
              {configured && sandboxMode && (
                <Badge variant="outline" className="ml-2 text-[10px] border-amber-300 bg-amber-100 text-amber-800">Sandbox mode ON</Badge>
              )}
            </p>
            <p className={configured ? 'text-teal-900/80' : 'text-amber-900/80'}>
              {configured
                ? (sandboxMode
                    ? 'SP-API calls currently target Amazon\'s sandbox endpoint (draft-app testing): connections validate and sync Amazon\'s fixed sandbox test data. Turn sandbox off once the app is published for live data.'
                    : 'Customers authorize through Amazon\'s official consent page, and every dashboard shows real Selling Partner API data. Tokens are stored AES-256-GCM encrypted.')
                : 'Until the Login-with-Amazon app credentials are saved below, customers cannot connect an Amazon account (no demo data exists). Complete Amazon\'s developer approval, then save the credentials.'}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Credentials + sync settings */}
        <Card className="border-emerald-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Plug className="h-4 w-4 text-emerald-600" /> Amazon Selling Partner API</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="lwa-client-id" className="text-xs">LWA Client ID (app id)</Label>
                <Input
                  id="lwa-client-id"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder={data.config.clientId || 'amzn1.application-oa2-client.xxxxxxxx'}
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lwa-secret" className="text-xs">LWA Client Secret</Label>
                <Input
                  id="lwa-secret"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder={data.config.hasSecret ? `${data.config.clientSecretMasked} — saved (leave blank to keep)` : 'amzn1.oa2-cs.v1.xxxxxxxx'}
                  disabled={!isAdmin}
                  autoComplete="new-password"
                />
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Stored encrypted (AES-256-GCM); masked after saving.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">SP-API region</Label>
                <Select value={region} onValueChange={setRegion} disabled={!isAdmin}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EU">Europe (EU endpoint — serves India, UAE, UK & EU)</SelectItem>
                    <SelectItem value="NA">North America (sellingpartnerapi-na)</SelectItem>
                    <SelectItem value="FE">Far East (sellingpartnerapi-fe)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">Amazon India sellers are served by the EU regional endpoint.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="auto-sync" className="text-xs flex items-center gap-1"><Zap className="h-3 w-3" /> Auto-sync interval (min)</Label>
                  <Input id="auto-sync" type="number" min={10} max={720} value={autoSync} onChange={(e) => setAutoSync(Number(e.target.value))} disabled={!isAdmin} />
                  <p className="text-[10px] text-muted-foreground">Background sync poll for all connected accounts (min 10 to respect Amazon rate limits).</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="low-stock" className="text-xs flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Low-stock threshold</Label>
                  <Input id="low-stock" type="number" min={0} max={1000} value={lowStock} onChange={(e) => setLowStock(Number(e.target.value))} disabled={!isAdmin} />
                  <p className="text-[10px] text-muted-foreground">SKUs at or below this quantity raise low-stock alerts.</p>
                </div>
              </div>

              <div className={`rounded-lg border p-3 space-y-1.5 ${sandboxMode ? 'border-amber-200 bg-amber-50/70' : 'border-stone-200 bg-stone-50'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label htmlFor="sandbox-mode" className="text-xs font-semibold text-stone-800">Amazon sandbox mode (draft apps)</Label>
                    <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                      App still in Draft? Production endpoints always return 403. Sandbox mode routes every SP-API call to Amazon&apos;s official sandbox host so your pasted token validates, connects and syncs Amazon&apos;s fixed test data until the app is published.
                    </p>
                  </div>
                  <Switch
                    id="sandbox-mode"
                    checked={sandboxMode}
                    onCheckedChange={toggleSandbox}
                    disabled={!isAdmin || savingSandbox}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600 space-y-1">
                <p><b>OAuth redirect URL</b> — whitelist this on your SP-API app:</p>
                <code className="block font-mono text-[11px] bg-white border rounded px-2 py-1 select-all">
                  {typeof window !== 'undefined' ? window.location.origin : ''}{data.redirectUriNote}
                </code>
                <p className="pt-1">{data.requirementNote}</p>
              </div>
              {isAdmin && (
                <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save settings
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        <div className="space-y-5">
          {/* Permission requirements */}
          <Card className="border-emerald-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4 text-emerald-600" /> Required Amazon permissions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-2.5">
                Each dashboard capability depends on a specific grant on the SP-API app. If Amazon returns 403 for one, the dashboard says exactly which one is missing.
              </p>
              <div className="rounded-lg border border-stone-200 divide-y divide-stone-100 max-h-72 overflow-y-auto">
                {AMAZON_PERMISSION_REQUIREMENTS.map((p) => (
                  <div key={p.key} className="p-2.5 space-y-0.5">
                    <p className="text-xs font-semibold text-stone-800">{p.label}</p>
                    <p className="text-[11px] text-emerald-800">{p.role}</p>
                    <p className="text-[10px] text-muted-foreground">{p.usedBy}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* How it works for customers */}
          <Card className="border-emerald-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Customer authorization workflow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-stone-600">
              <ol className="space-y-2.5">
                <li className="flex gap-2.5"><span className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span> Customer clicks <b>&ldquo;Authorize with Amazon&rdquo;</b> (or self-authorizes with a developer refresh token).</li>
                <li className="flex gap-2.5"><span className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span> They consent on Amazon&apos;s official page — <b>no passwords or OTPs are ever collected</b>.</li>
                <li className="flex gap-2.5"><span className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span> The seller account links to their profile; the first sync pulls real orders, listings, inventory and returns.</li>
                <li className="flex gap-2.5"><span className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">4</span> Auto-sync keeps data fresh; customers can sync manually, manage shipments, update stock, or disconnect to revoke everything.</li>
              </ol>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-3 text-xs text-emerald-900 space-y-1">
                <p className="font-semibold">Data isolation & audit</p>
                <p>Each customer&apos;s Amazon data is scoped strictly to their own connection — every API request enforces per-customer access. Connect, sync, shipment confirmations, inventory updates and disconnects are all audit-logged.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ---- Connect a seller account (paste the self-authorization token) ---- */}
      <Card className="border-emerald-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-emerald-600" /> Connect a seller account — paste your Amazon token
            <Badge variant="outline" className="text-[10px]">Self-authorization</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid lg:grid-cols-2 gap-5">
          {/* Left: the paste form */}
          <form onSubmit={connectWithToken} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mp-link-to" className="text-xs">Link the seller account to</Label>
              <Select value={linkTo} onValueChange={setLinkTo} disabled={!isAdmin}>
                <SelectTrigger id="mp-link-to"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">My own account ({user.name})</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.company ? ` — ${c.company}` : ''} ({c.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                The Amazon dashboard (orders, shipments, inventory) appears under the linked account&apos;s login.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mp-refresh-token" className="text-xs">LWA refresh token (from Amazon self-authorization)</Label>
              <Textarea
                id="mp-refresh-token"
                value={refreshToken}
                onChange={(e) => setRefreshToken(e.target.value)}
                placeholder="Atzr|IwEBIA... — paste the refresh token shown in your SP-API app"
                className="font-mono text-xs min-h-24"
                required
                disabled={!isAdmin}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mp-seller-id" className="text-xs">Selling Partner ID (optional)</Label>
                <Input id="mp-seller-id" value={sellerId} onChange={(e) => setSellerId(e.target.value)} placeholder="A1B2C3D4E5" disabled={!isAdmin} />
              </div>
              <label className="flex items-start gap-2 mt-6 cursor-pointer">
                <Checkbox checked={forceReplace} onCheckedChange={(v) => setForceReplace(v === true)} disabled={!isAdmin} className="mt-0.5" />
                <span className="text-xs text-stone-600 leading-snug">
                  Replace the existing connection (purges its cached data; tokens are overwritten)
                </span>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={testCredentials}
                disabled={testing || !configured || !isAdmin}
                className="gap-2 border-emerald-200 text-emerald-800"
              >
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run credentials test
              </Button>
              <Button type="submit" disabled={connecting || !refreshToken.trim() || !configured || !isAdmin} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />} Validate &amp; connect
              </Button>
            </div>
            {!configured && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Save the LWA Client ID and Client Secret (form above) first — the pasted token is validated against those app credentials.
              </p>
            )}
            {testResult && (
              <div className={`text-xs rounded-lg border p-2.5 flex gap-1.5 ${testResult.ok ? 'text-emerald-900 bg-emerald-50 border-emerald-200' : 'text-red-800 bg-red-50 border-red-200'}`}>
                {testResult.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                <span>{testResult.message}</span>
              </div>
            )}
            {connectResult && (
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 space-y-2 text-xs">
                <p className="font-semibold text-emerald-900 flex items-center gap-1.5">
                  <Store className="h-3.5 w-3.5" /> {connectResult.profile.sellerName}
                  <Badge variant="outline" className="text-[10px]">{connectResult.profile.region}</Badge>
                </p>
                {connectResult.profile.marketplaceIds.length > 0 && (
                  <p className="text-stone-500 font-mono text-[10px] break-all">Marketplaces: {connectResult.profile.marketplaceIds.join(', ')}</p>
                )}
                <p className={connectResult.sync.ok ? 'text-emerald-800' : 'text-amber-800'}>
                  First sync: {connectResult.sync.ordersSynced} orders · {connectResult.sync.listingsSynced} listings · {connectResult.sync.returnsSynced} return rows
                  {connectResult.sync.status !== 'SUCCESS' ? ` (${connectResult.sync.status})` : ''}
                </p>
                {connectResult.sync.message && <p className="text-red-700">{connectResult.sync.message}</p>}
                {connectResult.sync.warnings?.map((w, i) => (
                  <p key={i} className="text-amber-700">⚠ {w}</p>
                ))}
                <p className="text-stone-500">Open the <b>Amazon Orders</b> tab to browse the live data{linkTo !== 'self' ? ' from the linked account' : ''}.</p>
              </div>
            )}
          </form>

          {/* Right: where the token comes from + sandbox/draft note */}
          <div className="space-y-3">
            <h3 className="font-semibold text-emerald-950 text-sm">Where do I get the token?</h3>
            <ol className="space-y-2.5 text-sm text-stone-600">
              <li className="flex gap-2.5"><span className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span> Seller Central → <b>Develop Apps</b> (Partnering with Developers) → your app.</li>
              <li className="flex gap-2.5"><span className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span> Copy its <b>LWA Client ID</b> and <b>Client Secret</b> into the form above and save.</li>
              <li className="flex gap-2.5"><span className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span> On the same app open <b>LWA Credentials → Self authorization</b> and copy the shown <b>Refresh token</b>.</li>
              <li className="flex gap-2.5"><span className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">4</span> Paste it on the left and press <b>Validate &amp; connect</b> — it is verified with Amazon in real time, then the first sync runs.</li>
            </ol>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-3 text-xs text-emerald-900 space-y-1">
              <p className="font-semibold flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Official flow only</p>
              <p>This is Amazon&apos;s own self-authorization for private developer apps — <b>no Amazon password or OTP is entered anywhere</b>. The token is validated against api.amazon.com, stored AES-256-GCM encrypted, and revocable any time via Disconnect.</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 space-y-1">
              <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Draft / sandbox apps</p>
              <p>A token from a <b>Draft</b> app passes the Login-with-Amazon validation, but Amazon&apos;s <b>production endpoints always answer 403</b> until the app is published and its roles granted. Two official ways forward:</p>
              <p><b>1. Test now:</b> switch on <b>Amazon sandbox mode</b> (settings card on the left), then press <b>Validate &amp; connect</b> — the token validates, the connection succeeds and Amazon&apos;s sandbox returns its fixed test data.</p>
              <p><b>2. Go live:</b> grant the roles (Orders, Inventory &amp; Listings, FBA, Sellers — Selling Partner Insights, …), publish the app, switch sandbox mode off and reconnect for real account data. Amazon&apos;s exact message is always shown.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connected accounts */}
      <Card className="border-emerald-100">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Store className="h-4 w-4 text-emerald-600" /> Connected seller accounts ({data.connections.length})</CardTitle>
        </CardHeader>
        <CardContent className="max-h-96 overflow-y-auto">
          {data.connections.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No customers have connected a marketplace account yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-emerald-100">
                  <TableHead className="text-emerald-900">Customer</TableHead>
                  <TableHead className="text-emerald-900">Seller store</TableHead>
                  <TableHead className="text-emerald-900">Data</TableHead>
                  <TableHead className="text-emerald-900">Last sync</TableHead>
                  <TableHead className="text-emerald-900">Health</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.connections.map((c) => (
                  <TableRow key={c.id} className="border-stone-100">
                    <TableCell>
                      <p className="text-xs font-semibold text-emerald-950">{c.customer.name}</p>
                      <p className="text-[10px] text-muted-foreground">{c.customer.email}{c.customer.company ? ` · ${c.customer.company}` : ''}</p>
                    </TableCell>
                    <TableCell className="text-xs">
                      {c.sellerName || '—'}
                      {c.sellerId && <p className="text-[10px] text-muted-foreground font-mono">{c.sellerId}</p>}
                    </TableCell>
                    <TableCell className="text-xs">{c.orderCount} orders · {c.listingCount} listings</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{c.lastSyncAt ? formatDateTime(c.lastSyncAt) : 'never'}</TableCell>
                    <TableCell>
                      {c.status === 'CONNECTED' && !c.lastSyncError ? (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Healthy</span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] text-red-600" title={c.lastSyncError || ''}><AlertTriangle className="h-3.5 w-3.5" /> {c.status === 'CONNECTED' ? 'Sync error' : c.status}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Roadmap */}
      <div className="grid sm:grid-cols-2 gap-3">
        <Card className="border-stone-200 bg-stone-50/50">
          <CardContent className="p-4 text-sm">
            <p className="font-semibold text-stone-700 flex items-center gap-2"><Plug className="h-4 w-4 text-stone-400" /> Flipkart Seller Hub <Badge variant="outline" className="text-[10px]">Planned — Phase 2</Badge></p>
            <p className="text-xs text-muted-foreground mt-1">The integration layer is marketplace-agnostic (MarketplaceProvider + MarketplaceOps contracts): adding Flipkart means registering a new provider — the dashboard and sync engine stay unchanged.</p>
          </CardContent>
        </Card>
        <Card className="border-stone-200 bg-stone-50/50">
          <CardContent className="p-4 text-sm">
            <p className="font-semibold text-stone-700 flex items-center gap-2"><Plug className="h-4 w-4 text-stone-400" /> Meesho Supplier Panel <Badge variant="outline" className="text-[10px]">Planned — Phase 2</Badge></p>
            <p className="text-xs text-muted-foreground mt-1">Same provider contract as Amazon: consent, order sync, listings and shipment operations — no rebuild required.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
