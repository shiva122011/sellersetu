'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Ship, MapPin, Loader2, Clock, CheckCircle2, XCircle, Settings2, PackageSearch, History, AlertTriangle,
} from 'lucide-react'
import { api } from '@/lib/client'
import { formatDateTime, formatINR } from '@/lib/constants'
import { StatusBadge, dt } from './shared'
import type { ShipmentsData, MfnService } from './types'

// Shipments tab — the merchant-fulfilled shipment preparation workflow.
// Pending = real unshipped MFN orders from the last sync; confirming a
// shipment posts to Amazon's real Shipment Confirmation API.

export default function ShipmentsTab({
  connectionId,
  onChanged,
}: {
  connectionId: string
  onChanged: () => void
}) {
  const [data, setData] = useState<ShipmentsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [shipOrder, setShipOrder] = useState<ShipmentsData['pending'][number] | null>(null)
  const [shipFromOpen, setShipFromOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api<ShipmentsData>(`/api/marketplace/shipments?connectionId=${connectionId}`)
      setData(d)
    } catch (e) {
      toast({ title: 'Could not load shipments', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [connectionId])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div className="h-64 rounded-2xl bg-white border animate-pulse" />
  }
  if (!data) return null

  return (
    <div className="space-y-4">
      {/* Ship-from setup banner */}
      <Card className={data.shipFrom ? 'border-emerald-100' : 'border-amber-200 bg-amber-50/40'}>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${data.shipFrom ? 'bg-emerald-50' : 'bg-amber-100'}`}>
            <MapPin className={`h-4.5 w-4.5 ${data.shipFrom ? 'text-emerald-600' : 'text-amber-600'}`} />
          </div>
          <div className="flex-1 min-w-48">
            <p className="text-sm font-semibold text-stone-800">Ship-from address</p>
            <p className="text-xs text-muted-foreground">
              {data.shipFrom
                ? `${data.shipFrom.name} · ${data.shipFrom.addressLine1}, ${data.shipFrom.city} ${data.shipFrom.postalCode}`
                : 'Required by Amazon for real shipping-rate quotes on self-ship orders.'}
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setShipFromOpen(true)}>
            <Settings2 className="h-3.5 w-3.5" /> {data.shipFrom ? 'Edit' : 'Set address'}
          </Button>
        </CardContent>
      </Card>

      {/* Pending shipments */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-emerald-950 flex items-center gap-1.5">
            <PackageSearch className="h-4 w-4 text-orange-500" /> Awaiting shipment ({data.pending.length})
          </h3>
          <p className="text-[11px] text-muted-foreground">Merchant-fulfilled orders · oldest first</p>
        </div>
        {data.pending.length === 0 ? (
          <Card className="border-dashed border-stone-300">
            <CardContent className="py-10 text-center">
              <Ship className="h-8 w-8 text-stone-300 mx-auto mb-3" />
              <h4 className="font-semibold text-emerald-950 text-sm">Nothing awaiting shipment</h4>
              <p className="text-xs text-muted-foreground mt-1">All your self-ship orders are dispatched, or new orders haven&apos;t synced yet. Use &ldquo;Sync now&rdquo; to pull the latest.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {data.pending.map((o) => (
              <Card key={o.id} className="border-stone-200">
                <CardContent className="p-4 flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-56 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-xs font-semibold text-emerald-900">{o.amazonOrderId}</p>
             …69916 tokens truncated…n                  <span className="shrink-0">{it.quantity} {it.unit} × {formatINR(it.unitPrice)} = <span className="font-medium">{formatINR(it.amount)}</span></span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}

      {editorOpen && (
        <QuotationEditor
          request={r}
          existing={editTarget}
          onClose={() => { setEditorOpen(false); setEditTarget(null) }}
          onSaved={() => { setEditorOpen(false); setEditTarget(null); onChanged() }}
        />
      )}
    </div>
  )
}

// ---------------- editor ----------------
function QuotationEditor({ request: r, existing, onClose, onSaved }: {
  request: ApiRequest
  existing: ApiQuotation | null
  onClose: () => void
  onSaved: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    scope: existing?.scope || '',
    deliverablesNote: existing?.deliverablesNote || '',
    timelineNote: existing?.timelineNote || '',
    paymentTerms: existing?.paymentTerms || '40% advance on acceptance, balance on delivery',
    notes: existing?.notes || '',
    internalNotes: existing?.internalNotes || '',
    taxLabel: existing?.taxLabel || 'GST',
    taxRatePct: existing?.taxRatePct ?? 18,
  })
  const [items, setItems] = useState<ApiQuotationItem[]>(
    existing?.items?.length ? existing.items.map((it) => ({ ...it })) :
    [{ description: '', detail: '', quantity: 1, unit: 'lot', unitPrice: 0, amount: 0, sortOrder: 0 }]
  )

  const subtotal = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0)
  const taxAmount = Math.round(subtotal * (Number(form.taxRatePct) || 0)) / 100
  const total = subtotal + taxAmount

  function setItem(i: number, patch: Partial<ApiQuotationItem>) {
    setItems((prev) => prev.map((it, idx) => {
      if (idx !== i) return it
      const next = { ...it, ...patch }
      next.amount = Math.round((Number(next.quantity) || 0) * (Number(next.unitPrice) || 0) * 100) / 100
      return next
    }))
  }

  async function save() {
    if (!items.some((it) => it.description.trim())) {
      toast({ title: 'Add at least one line item with a description' })
      return
    }
    setBusy(true)
    try {
      if (existing) {
        await api(`/api/quotations/${existing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...form, taxRatePct: Number(form.taxRatePct), items: items.filter((it) => it.description.trim()) }),
        })
        toast({ title: `Draft ${existing.quotationNo} updated` })
      } else {
        const d = await api<{ quotation: ApiQuotation }>('/api/quotations', {
          method: 'POST',
          body: JSON.stringify({ requestId: r.id, ...form, taxRatePct: Number(form.taxRatePct), items: items.filter((it) => it.description.trim()) }),
        })
        toast({ title: `Quotation ${d.quotation.quotationNo} drafted — send it when ready` })
      }
      onSaved()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to save quotation' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? `Edit ${existing.quotationNo}` : 'New quotation'} — {r.requestCode}</DialogTitle>
          <DialogDescription>Line items define the commercial scope. The customer can accept, negotiate or request revisions.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div>
            <Label>Scope of work</Label>
            <Textarea className="mt-1.5" rows={3} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}
              placeholder="What exactly is included…" />
          </div>

          <div className="rounded-xl border">
            <div className="px-4 py-2.5 border-b bg-stone-50 flex items-center justify-between">
              <span className="text-sm font-medium">Line items</span>
              <Button size="sm" variant="ghost" className="gap-1" onClick={() => setItems([...items, { description: '', detail: '', quantity: 1, unit: 'lot', unitPrice: 0, amount: 0, sortOrder: items.length }])}>
                <Plus className="h-3.5 w-3.5" /> Add item
              </Button>
            </div>
            <div className="divide-y">
              {items.map((it, i) => (
                <div key={i} className="p-3 grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-12 sm:col-span-5">
                    <Input placeholder="Item description" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} />
                  </div>
                  <div className="col-span-7 sm:col-span-3">
                    <Input placeholder="Detail (optional)" value={it.detail || ''} onChange={(e) => setItem(i, { detail: e.target.value })} />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Input type="number" min="0" step="any" value={it.quantity} onChange={(e) => setItem(i, { quantity: Number(e.target.value) })} aria-label="Quantity" />
                  </div>
                  <div className="col-span-3 sm:col-span-1">
                    <select value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })}
                      className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Unit">
                      {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3 sm:col-span-1">
                    <Input type="number" min="0" step="any" placeholder="Rate" value={it.unitPrice || ''} onChange={(e) => setItem(i, { unitPrice: Number(e.target.value) })} aria-label="Unit price" />
                  </div>
                  <div className="col-span-1 sm:col-span-1 flex justify-end">
                    <Button size="icon" variant="ghost" className="text-stone-400 hover:text-red-500" aria-label="Remove item"
                      onClick={() => setItems(items.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t bg-stone-50 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatINR(subtotal)}</span></div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-muted-foreground flex items-center gap-2">
                  <input type="text" value={form.taxLabel} onChange={(e) => setForm({ ...form, taxLabel: e.target.value })} className="w-14 h-6 text-xs rounded border px-1.5" aria-label="Tax label" />
                  <input type="number" min="0" step="any" value={form.taxRatePct} onChange={(e) => setForm({ ...form, taxRatePct: Number(e.target.value) })} className="w-14 h-6 text-xs rounded border px-1.5" aria-label="Tax rate %" />%
                </span>
                <span>{formatINR(taxAmount)}</span>
              </div>
              <div className="flex justify-between font-bold"><span>Total</span><span className="text-emerald-800">{formatINR(total)}</span></div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div><Label>Deliverables note</Label><Input className="mt-1.5" value={form.deliverablesNote} onChange={(e) => setForm({ ...form, deliverablesNote: e.target.value })} /></div>
            <div><Label>Timeline note</Label><Input className="mt-1.5" value={form.timelineNote} onChange={(e) => setForm({ ...form, timelineNote: e.target.value })} placeholder="e.g. 6 weeks from kickoff" /></div>
            <div><Label>Payment terms</Label><Input className="mt-1.5" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} /></div>
            <div><Label>Valid until</Label>
              <Input type="date" className="mt-1.5"
                value={existing?.validUntil ? new Date(existing.validUntil).toISOString().slice(0, 10) : ''}
                onChange={() => { /* captured on save via existing record or default */ }} disabled={false} />
            </div>
            <div className="sm:col-span-2"><Label>Customer-visible notes</Label><Textarea className="mt-1.5" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Internal notes (never visible to customer)</Label><Textarea className="mt-1.5" rows={2} value={form.internalNotes} onChange={(e) => setForm({ ...form, internalNotes: e.target.value })} /></div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={save}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            {existing ? 'Save draft' : 'Create draft quotation'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
