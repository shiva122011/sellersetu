'use client'

// Staff quotation panel — create, edit, send, revise quotations with line items.
// Authorized roles: SUPER_ADMIN, ADMIN, OPS_MANAGER, SALES_EXEC.

import { useState } from 'react'
import { toast } from '@/hooks/use-toast'
import { api, ApiQuotation, ApiQuotationItem, ApiRequest } from '@/lib/client'
import { QUOTATION_STATUS_LABELS, QUOTATION_STATUS_COLORS, formatINR, formatDate } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { formatBytes } from '@/components/shared'
import { Plus, Send, Trash2, Copy, FileSignature, Loader2, FileDown } from 'lucide-react'

const UNITS = ['lot', 'job', 'hrs', 'pcs', 'pages', 'mo']

export default function StaffQuotationPanel({ request: r, onChanged }: { request: ApiRequest; onChanged: () => void }) {
  const quotations = (r.quotations || []).slice().sort((a, b) => b.version - a.version)
  const latest = quotations[0]
  const accepted = quotations.find((q) => q.status === 'ACCEPTED')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ApiQuotation | null>(null) // null = new
  const [busy, setBusy] = useState(false)

  async function act(qid: string, action: 'send' | 'revise') {
    setBusy(true)
    try {
      const d = await api<{ quotation: ApiQuotation }>(`/api/quotations/${qid}`, { method: 'POST', body: JSON.stringify({ action }) })
      toast({ title: action === 'send' ? `${d.quotation.quotationNo} sent to customer` : `Revision drafted (v${d.quotation.version}) — review and send` })
      onChanged()
      if (action === 'revise') {
        setEditTarget(d.quotation)
        setEditorOpen(true)
      }
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Action failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Quotations</h3>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
          onClick={() => { setEditTarget(null); setEditorOpen(true) }}>
          <Plus className="h-4 w-4" /> New quotation
        </Button>
      </div>

      {accepted && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900">
          <span className="font-semibold">Accepted commercial record: </span>
          {accepted.quotationNo} · {formatINR(accepted.total)} · locked {accepted.lockedAt ? formatDate(accepted.lockedAt) : ''}.
          Changes require a revision or change request per the locked-terms policy.
        </div>
      )}

      {quotations.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center">
          <FileSignature className="h-10 w-10 text-stone-300 mx-auto" />
          <p className="mt-3 text-sm text-muted-foreground">No quotations yet — create the first line-item quotation for this request.</p>
        </div>
      ) : quotations.map((q) => (
        <div key={q.id} className="rounded-2xl border bg-white overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b bg-stone-50/70">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold">{q.quotationNo}</span>
              <Badge variant="outline" className={`text-[10px] ${QUOTATION_STATUS_COLORS[q.status] || ''}`}>{QUOTATION_STATUS_LABELS[q.status] || q.status}</Badge>
              <span className="text-xs text-muted-foreground">v{q.version} · {formatINR(q.total)}</span>
            </div>
            <div className="flex items-center gap-2">
              {q.status === 'DRAFT' && (
                <>
                  <Button size="sm" variant="outline" onClick={() => { setEditTarget(q); setEditorOpen(true) }}>Edit</Button>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1" disabled={busy} onClick={() => act(q.id, 'send')}>
                    <Send className="h-3.5 w-3.5" /> Send
                  </Button>
                </>
              )}
              {['SENT', 'NEGOTIATION', 'REVISION_REQUESTED'].includes(q.status) && !accepted && (
                <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => act(q.id, 'revise')}>
                  <Copy className="h-3.5 w-3.5" /> Revise (v{(quotations[0]?.version || 1) + 1})
                </Button>
              )}
            </div>
          </div>
          <div className="px-5 py-4 text-sm">
            {q.customerNote && ['REVISION_REQUESTED', 'REJECTED'].includes(q.status) && (
              <p className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800 text-xs">
                <span className="font-semibold">Customer note: </span>{q.customerNote}
              </p>
            )}
            <div className="grid sm:grid-cols-3 gap-3 text-xs mb-3">
              {q.timelineNote && <div><span className="text-muted-foreground block">Timeline</span>{q.timelineNote}</div>}
              {q.paymentTerms && <div><span className="text-muted-foreground block">Payment terms</span>{q.paymentTerms}</div>}
              <div><span className="text-muted-foreground block">Total</span><span className="font-semibold">{formatINR(q.total)} (incl. {q.taxLabel} {q.taxRatePct}%)</span></div>
            </div>
            <ul className="divide-y border rounded-lg text-xs">
              {q.items.map((it) => (
                <li key={it.id} className="px-3 py-2 flex justify-between gap-3">
                  <span className="min-w-0"><span className="font-medium">{it.description}</span>{it.detail && <span className="text-muted-foreground"> — {it.detail}</span>}</span>
                  <span className="shrink-0">{it.quantity} {it.unit} × {formatINR(it.unitPrice)} = <span className="font-medium">{formatINR(it.amount)}</span></span>
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
