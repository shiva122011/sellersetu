'use client'

// Staff documents & payments panel — document requests, document review,
// payment scheduling and invoice issuance.

import { useState } from 'react'
import { toast } from '@/hooks/use-toast'
import { api, ApiRequest, ApiDocumentRequest, ApiDocument, ApiPayment } from '@/lib/client'
import { PAYMENT_TYPES, PAYMENT_TYPE_LABELS, DOCUMENT_CATEGORIES, formatINR, formatDate, formatDateTime } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatBytes, DocStatusIcon } from '@/components/shared'
import { Plus, CheckCircle2, XCircle, IndianRupee, FileText, Ban, Download, Loader2 } from 'lucide-react'

export default function StaffDocsPaymentsPanel({ request: r, onChanged }: { request: ApiRequest; onChanged: () => void }) {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <DocsSection request={r} onChanged={onChanged} />
      <PaymentsSection request={r} onChanged={onChanged} />
    </div>
  )
}

// ---------------- documents ----------------
function DocsSection({ request: r, onChanged }: { request: ApiRequest; onChanged: () => void }) {
  const [reqOpen, setReqOpen] = useState(false)
  const [reviewing, setReviewing] = useState<{ doc: ApiDocument } | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function reviewDoc(status: 'APPROVED' | 'REJECTED') {
    if (!reviewing) return
    if (status === 'REJECTED' && !reviewNote.trim()) {
      toast({ title: 'A rejection reason is required' })
      return
    }
    setBusy(true)
    try {
      await api(`/api/documents/${reviewing.doc.id}`, { method: 'PATCH', body: JSON.stringify({ status, reviewNote: reviewNote.trim() || undefined }) })
      toast({ title: `Document ${status.toLowerCase()}` })
      setReviewing(null); setReviewNote('')
      onChanged()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Review failed' })
    } finally {
      setBusy(false)
    }
  }

  async function reviewDocRequest(dr: ApiDocumentRequest, status: 'APPROVED' | 'REJECTED' | 'WAIVED', note?: string) {
    setBusy(true)
    try {
      await api(`/api/document-requests/${dr.id}`, { method: 'PATCH', body: JSON.stringify({ status, reviewNote: note }) })
      toast({ title: `"${dr.title}" → ${status.toLowerCase()}` })
      onChanged()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Review failed' })
    } finally {
      setBusy(false)
    }
  }

  const docRequests = r.documentRequests || []
  const docs = (r.documents || []).filter((d) => !d.isDeliverable)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Document requests</h3>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setReqOpen(true)}><Plus className="h-3.5 w-3.5" /> Request document</Button>
        </div>
        {docRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No document requests yet.</p>
        ) : (
          <ul className="divide-y border rounded-xl">
            {docRequests.map((d) => (
              <li key={d.id} className="px-3.5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{d.title} <Badge variant="outline" className="ml-1 text-[10px]">{d.source}</Badge></p>
                    {d.description && <p className="text-xs text-muted-foreground">{d.description}</p>}
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">{d.status}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {d.status === 'SUBMITTED' && (
                    <>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={busy} onClick={() => reviewDocRequest(d, 'APPROVED')}>
                        <CheckCircle2 className="h-3 w-3" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-600" disabled={busy} onClick={() => {
                        const note = window.prompt('Rejection reason (shared with the customer):')
                        if (note) reviewDocRequest(d, 'REJECTED', note)
                      }}>
                        <XCircle className="h-3 w-3" /> Reject
                      </Button>
                    </>
                  )}
                  {['PENDING', 'SUBMITTED'].includes(d.status) && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => reviewDocRequest(d, 'WAIVED')}>
                      <Ban className="h-3 w-3" /> Not required
                    </Button>
                  )}
                  {(r.documents || []).filter((doc) => doc.documentRequestId === d.id).map((doc) => (
                    <a key={doc.id} href={`/api/documents/${doc.id}/download`} className="text-xs text-emerald-700 font-medium hover:underline flex items-center gap-1">
                      <Download className="h-3 w-3" /> {doc.name}
                    </a>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border bg-white p-5">
        <h3 className="font-semibold mb-3">Uploaded documents</h3>
        {docs.length === 0 ? <p className="text-sm text-muted-foreground">No documents uploaded yet.</p> : (
          <ul className="divide-y border rounded-xl">
            {docs.map((d) => (
              <li key={d.id} className="px-3.5 py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(d.size)} · {formatDateTime(d.createdAt)} · {d.uploadedById === r.customer?.id ? 'customer' : 'team'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <DocStatusIcon doc={d} />
                  {d.status === 'SUBMITTED' && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setReviewing({ doc: d }); setReviewNote('') }}>Review</Button>
                  )}
                  <a href={`/api/documents/${d.id}/download`} className="text-emerald-700 hover:underline"><Download className="h-4 w-4" /></a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {reqOpen && <DocRequestEditor requestId={r.id} onClose={() => setReqOpen(false)} onSaved={() => { setReqOpen(false); onChanged() }} />}

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Review document</DialogTitle></DialogHeader>
          <p className="text-sm">{reviewing?.doc.name}</p>
          <Textarea rows={2} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Note (required for rejection)" aria-label="Review note" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="text-red-600" disabled={busy} onClick={() => reviewDoc('REJECTED')}>
              <XCircle className="h-4 w-4 mr-1.5" /> Reject
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => reviewDoc('APPROVED')}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DocRequestEditor({ requestId, onClose, onSaved }: { requestId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ title: '', description: '', category: 'OTHER', mandatory: true, dueDate: '' })
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!form.title.trim()) return
    setBusy(true)
    try {
      await api('/api/document-requests', {
        method: 'POST',
        body: JSON.stringify({ ...form, requestId, dueDate: form.dueDate || undefined }),
      })
      toast({ title: 'Document requested — customer notified' })
      onSaved()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Request a document</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input className="mt-1.5" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. GST certificate copy" /></div>
          <div><Label>Instructions for the customer</Label><Textarea className="mt-1.5" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Category</Label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1.5 w-full h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Category">
                {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><Label>Due date</Label><Input type="date" className="mt-1.5" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.mandatory} onChange={(e) => setForm({ ...form, mandatory: e.target.checked })} /> Mandatory
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy || !form.title.trim()} onClick={save}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- payments & invoices ----------------
function PaymentsSection({ request: r, onChanged }: { request: ApiRequest; onChanged: () => void }) {
  const accepted = (r.quotations || []).find((q) => q.status === 'ACCEPTED')
  const [addOpen, setAddOpen] = useState(false)
  const [invOpen, setInvOpen] = useState<ApiPayment | null>(null)
  const payments = r.payments || []
  const invoices = r.invoices || []

  const paidTotal = payments.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.amount, 0)
  const pendingTotal = payments.filter((p) => p.status === 'PENDING').reduce((s, p) => s + p.amount, 0)

  return (
    <div className="space-y-4">
      {accepted && (
        <div className="rounded-2xl border bg-white p-4 text-sm">
          <p className="font-medium">Accepted quotation {accepted.quotationNo}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{formatINR(accepted.total)} incl. tax · Terms: {accepted.paymentTerms}</p>
        </div>
      )}

      <div className="rounded-2xl border bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Payment schedule</h3>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setAddOpen(true)}><Plus className="h-3.5 w-3.5" /> Schedule payment</Button>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
          <div className="rounded-lg bg-stone-50 border px-3 py-2"><span className="text-xs text-muted-foreground block">Collected</span><span className="font-bold text-emerald-700">{formatINR(paidTotal)}</span></div>
          <div className="rounded-lg bg-stone-50 border px-3 py-2"><span className="text-xs text-muted-foreground block">Pending</span><span className="font-bold text-amber-600">{formatINR(pendingTotal)}</span></div>
        </div>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments scheduled. Create rows matching the accepted quotation&apos;s payment terms (e.g. Advance 40%).</p>
        ) : (
          <ul className="divide-y border rounded-xl">
            {payments.map((p) => (
              <li key={p.id} className="px-3.5 py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{p.label || PAYMENT_TYPE_LABELS[p.type]} <Badge variant="outline" className="ml-1 text-[10px]">{p.type}</Badge></p>
                  <p className="text-xs text-muted-foreground">
                    {p.milestone ? `Milestone: ${p.milestone.title} · ` : ''}{p.status === 'PAID' ? `Paid ${formatDateTime(p.paidAt || p.createdAt)} · ${p.method} · ${p.receiptNo}` : `created ${formatDate(p.createdAt)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{formatINR(p.amount)}</span>
                  {p.status === 'PAID' && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">PAID</Badge>}
                  {p.status === 'PENDING' && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">PENDING</Badge>}
                  {p.status === 'PAID' && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setInvOpen(p)}>
                      <FileText className="h-3 w-3" /> Invoice
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {invoices.length > 0 && (
        <div className="rounded-2xl border bg-white p-5">
          <h3 className="font-semibold mb-3">Issued invoices</h3>
          <ul className="divide-y border rounded-xl text-sm">
            {invoices.map((inv) => (
              <li key={inv.id} className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                <span className="font-mono text-xs">{inv.invoiceNo}</span>
                <span className="text-xs text-muted-foreground flex-1 truncate px-2">{inv.description}</span>
                <span className="font-medium">{formatINR(inv.totalAmount)}</span>
                <Badge variant="outline" className="text-[10px]">{inv.status}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {addOpen && <PaymentEditor request={r} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); onChanged() }} />}
      {invOpen && <InvoiceEditor request={r} payment={invOpen} onClose={() => setInvOpen(null)} onSaved={() => { setInvOpen(null); onChanged() }} />}
    </div>
  )
}

function PaymentEditor({ request: r, onClose, onSaved }: { request: ApiRequest; onClose: () => void; onSaved: () => void }) {
  const accepted = (r.quotations || []).find((q) => q.status === 'ACCEPTED')
  const suggestedAdvance = accepted ? Math.round(accepted.total * 0.4) : 0
  const [form, setForm] = useState({ type: 'ADVANCE', label: '', amount: suggestedAdvance, milestoneId: '', note: '' })
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!form.amount || form.amount <= 0) {
      toast({ title: 'Enter a valid amount' })
      return
    }
    setBusy(true)
    try {
      await api(`/api/requests/${r.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({ ...form, amount: Number(form.amount), milestoneId: form.milestoneId || undefined }),
      })
      toast({ title: 'Payment scheduled — customer notified' })
      onSaved()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to schedule payment' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Schedule a payment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Type</Label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="mt-1.5 w-full h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Payment type">
              {PAYMENT_TYPES.map((t) => <option key={t} value={t}>{PAYMENT_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div><Label>Label (customer-visible)</Label><Input className="mt-1.5" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Advance (40%)" /></div>
          <div><Label>Amount (₹)</Label><Input type="number" min="1" className="mt-1.5" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
          <div>
            <Label>Link to milestone (optional)</Label>
            <select value={form.milestoneId} onChange={(e) => setForm({ ...form, milestoneId: e.target.value })}
              className="mt-1.5 w-full h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Milestone">
              <option value="">None</option>
              {(r.project?.milestones || []).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={save}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} <IndianRupee className="h-4 w-4 mr-1" /> Schedule
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function InvoiceEditor({ request: r, payment, onClose, onSaved }: { request: ApiRequest; payment: ApiPayment; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    type: 'TAX_INVOICE',
    description: payment.label || PAYMENT_TYPE_LABELS[payment.type] || '',
    amount: payment.amount,
    gstRatePct: 0,
    billToName: r.customer?.company || r.customer?.name || '',
    billToGstin: '',
    notes: '',
  })
  const [busy, setBusy] = useState(false)
  const gstAmount = Math.round((Number(form.amount) || 0) * (Number(form.gstRatePct) || 0)) / 100

  async function save() {
    setBusy(true)
    try {
      const d = await api<{ invoice: { invoiceNo: string } }>('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          requestId: r.id, paymentId: payment.id, ...form,
          amount: Number(form.amount), gstRatePct: Number(form.gstRatePct),
        }),
      })
      toast({ title: `Invoice ${d.invoice.invoiceNo} issued` })
      onSaved()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to issue invoice' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Issue invoice for {formatINR(payment.amount)}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Type</Label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="mt-1.5 w-full h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Invoice type">
              <option value="TAX_INVOICE">Tax invoice</option>
              <option value="RECEIPT">Receipt</option>
              <option value="PROFORMA">Proforma</option>
            </select>
          </div>
          <div><Label>Description</Label><Input className="mt-1.5" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Base amount (₹)</Label><Input type="number" min="1" className="mt-1.5" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
            <div><Label>GST %</Label><Input type="number" min="0" className="mt-1.5" value={form.gstRatePct} onChange={(e) => setForm({ ...form, gstRatePct: Number(e.target.value) })} /></div>
          </div>
          <p className="text-xs text-muted-foreground">GST {formatINR(gstAmount)} · Total {formatINR((Number(form.amount) || 0) + gstAmount)}</p>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Bill to</Label><Input className="mt-1.5" value={form.billToName} onChange={(e) => setForm({ ...form, billToName: e.target.value })} /></div>
            <div><Label>Customer GSTIN</Label><Input className="mt-1.5" value={form.billToGstin} onChange={(e) => setForm({ ...form, billToGstin: e.target.value })} /></div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={save}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Issue invoice
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
