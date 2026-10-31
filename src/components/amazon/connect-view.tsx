'use client'

import { useState } from 'react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  ShoppingBag, Package, Truck, Clock, XCircle, Undo2, Boxes, ShieldCheck, Info,
  Link2, Loader2, KeyRound, ExternalLink, Lock, BarChart3,
} from 'lucide-react'
import { api } from '@/lib/client'
import { StepDot } from './shared'

// Not-connected state: the official authorization entry point.
// Real SP-API only — when the platform app is not yet configured we clearly
// say so instead of offering simulated data.

export default function ConnectView({
  liveConfigured,
  sandboxMode = false,
  connecting,
  onConnect,
}: {
  liveConfigured: boolean
  sandboxMode?: boolean
  connecting: boolean
  onConnect: () => void
}) {
  const [tokenOpen, setTokenOpen] = useState(false)
  const [refreshToken, setRefreshToken] = useState('')
  const [sellerId, setSellerId] = useState('')
  const [savingToken, setSavingToken] = useState(false)

  async function connectWithToken(e: React.FormEvent) {
    e.preventDefault()
    setSavingToken(true)
    try {
      const d = await api<{ notice: string }>('/api/marketplace/connections', {
        method: 'POST',
        body: JSON.stringify({ marketplace: 'amazon', flow: 'refresh_token', refreshToken, sellerId }),
      })
      toast({ title: 'Amazon account connected', description: d.notice })
      setRefreshToken('')
      setSellerId('')
      setTokenOpen(false)
      onConnect()
    } catch (err) {
      toast({
        title: 'Amazon rejected the connection',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      })
    } finally {
      setSavingToken(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-emerald-950">Amazon Seller Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Orders, shipments, inventory and returns — live from your connected Amazon seller account.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
          <ExternalLink className="h-3.5 w-3.5" /> Amazon Seller Central · Phase 1
        </span>
      </div>

      <Card className="border-emerald-100 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-5 text-white flex flex-wrap items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-white/15 flex items-center justify-center">
            <ShoppingBag className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-56">
            <h2 className="text-lg font-bold">Connect your Amazon seller account</h2>
            <p className="text-sm opacity-90">Authorize once through Amazon&apos;s official process — your real orders, stock and returns then appear right here.</p>
          </div>
          {liveConfigured && (
            <Button onClick={onConnect} disabled={connecting} className="bg-white text-emerald-800 hover:bg-emerald-50 gap-2">
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Authorize with Amazon
            </Button>
          )}
        </div>
        <CardContent className="p-6 grid md:grid-cols-2 gap-5">
          <div className="space-y-3">
            <h3 className="font-semibold text-emerald-950 text-sm">How it works</h3>
            <ol className="space-y-2.5 text-sm text-stone-600">
              <li className="flex gap-2.5"><StepDot n={1} /> Click <b>Authorize with Amazon</b> — you land on Amazon&apos;s official consent page.</li>
              <li className="flex gap-2.5"><StepDot n={2} /> Sign in with Amazon and approve the requested permissions.</li>
              <li className="flex gap-2.5"><StepDot n={3} /> Your seller account is linked to your SellerSetu profile (encrypted OAuth tokens only).</li>
              <li className="flex gap-2.5"><StepDot n={4} /> Orders, shipments, listings, inventory and returns sync automatically — everything shown comes from the real SP-API.</li>
            </ol>
            {liveConfigured && (
              <Dialog open={tokenOpen} onOpenChange={setTokenOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 border-emerald-200 text-emerald-800">
                    <KeyRound className="h-3.5 w-3.5" /> Self-authorization (developer refresh token)
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-emerald-950">Connect with a self-authorization token</DialogTitle>
                    <DialogDescription>
                      For sellers with their own SP-API developer profile: paste the LWA refresh token generated in your
                      developer console (Developer Console → Authorise). The token is validated with Amazon immediately and stored encrypted.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={connectWithToken} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="rt" className="text-xs">LWA Refresh token</Label>
                      <Textarea id="rt" value={refreshToken} onChange={(e) => setRefreshToken(e.target.value)}
                        placeholder="Atzr|IwEBIA..." className="font-mono text-xs min-h-20" required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sid" className="text-xs">Selling Partner ID (optional)</Label>
                      <Input id="sid" value={sellerId} onChange={(e) => setSellerId(e.target.value)} placeholder="e.g. A1B2C3D4E5" />
                    </div>
                    <Button type="submit" disabled={savingToken || !refreshToken.trim()} className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2">
                      {savingToken && <Loader2 className="h-4 w-4 animate-spin" />} Validate & connect
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
          <div className="space-y-3">
            <h3 className="font-semibold text-emerald-950 text-sm">What you&apos;ll see</h3>
            <ul className="grid grid-cols-2 gap-2 text-sm text-stone-600">
              <li className="flex items-center gap-2"><Package className="h-4 w-4 text-emerald-600" /> Orders & items</li>
              <li className="flex items-center gap-2"><Truck className="h-4 w-4 text-emerald-600" /> Shipping & tracking</li>
              <li className="flex items-center gap-2"><Clock className="h-4 w-4 text-emerald-600" /> Pending vs shipped</li>
              <li className="flex items-center gap-2"><XCircle className="h-4 w-4 text-emerald-600" /> Cancelled orders</li>
              <li className="flex items-center gap-2"><Undo2 className="h-4 w-4 text-emerald-600" /> Returns</li>
              <li className="flex items-center gap-2"><Boxes className="h-4 w-4 text-emerald-600" /> Listings & inventory</li>
              <li className="flex items-center gap-2 col-span-2"><BarChart3 className="h-4 w-4 text-emerald-600" /> Shipment preparation for self-ship orders</li>
            </ul>
            <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3.5 text-xs text-violet-900 space-y-1.5">
              <p className="flex items-center gap-1.5 font-semibold"><ShieldCheck className="h-4 w-4" /> Security by design</p>
              <p>Authorization uses Amazon&apos;s official OAuth flow. We <b>never ask for or store your Amazon password or OTPs</b>; tokens are AES-256-GCM encrypted at rest; only you can see your store&apos;s data. Disconnect any time to revoke access and purge cached data.</p>
            </div>
            {!liveConfigured && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 flex gap-2">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">Waiting for the Amazon SP-API app setup</p>
                  <p>
                    This platform connects <b>only through Amazon&apos;s official Selling Partner API</b> — there is no simulated/demo data.
                    The platform administrator must save the Login-with-Amazon app credentials under <b>Admin → Integrations</b>
                    {' '}(requires an Amazon-approved developer profile and app). Once saved, the authorization buttons above become active.
                  </p>
                </div>
              </div>
            )}
            {liveConfigured && sandboxMode && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 flex gap-2">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">Amazon sandbox mode is active</p>
                  <p>
                    The platform&apos;s SP-API app is still in Draft, so connections run against Amazon&apos;s official <b>SP-API Sandbox</b>
                    {' '}(fixed test data from Amazon — not your live account). Once the app is published, sandbox is switched off and your real orders flow in.
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
        <Lock className="h-3 w-3" /> SellerSetu is an independent service provider — not affiliated with Amazon. All marketplace data is retrieved via the official Selling Partner API under your authorization.
      </p>
    </div>
  )
}
