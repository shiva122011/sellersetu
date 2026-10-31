'use client'

// Customer dashboard — "My Services" portal.
// Overview → request list → dedicated workspace per request:
// Overview | Quotation | Project | Documents | Deliverables | Payments | Chat | Timeline

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '@/hooks/use-toast'
import { api, ApiRequest, ApiQuotation, ApiPayment, ApiUser, requestServiceLabel } from '@/lib/client'
import {
  STATUS_LABELS, STATUS_COLORS, STAGE_LABELS, STAGE_COLORS, EXECUTION_MODEL_SHORT,
  EXECUTION_MODEL_COLORS, EXECUTION_MODEL_LABELS, QUOTATION_STATUS_LABELS, QUOTATION_STATUS_COLORS,
  MILESTONE_STATUS_LABELS, PAYMENT_TYPE_LABELS, formatINR, formatDate, formatDateTime,
} from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { StatusBadge, ProgressBar, DocStatusIcon, formatBytes, CompanyLogo } from '@/components/shared'
import ChatPanel from '@/components/chat-panel'
import NotificationsBell from '@/components/notifications-bell'
import PaymentGatewayDialog from '@/components/payment-gateway'
import RequirementDialog from '@/components/requirement-dialog'
import AiAssistantWidget from '@/components/ai-assistant'
import {
  LogOut, Plus, FileText, MessageSquare, Wallet, PackageCheck, ClipboardList,
  ArrowLeft, CheckCircle2, XCircle, RefreshCcw, Send, Upload, Download,
  CalendarClock, MapPin, ChevronRight, IndianRupee, CircleDollarSign,
} from 'lucide-react'

export default function CustomerDashboard({ user, onLogout }: { user: ApiUser; onLogout: () => void }) {
  const [requests, setRequests] = useState<ApiRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ApiRequest | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [newReqOpen, setNewReqOpen] = useState(false)
  const [payDialog, setPayDialog] = useState<ApiPayment | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    try {
      const d = await api<{ requests: ApiRequest[] }>('/api/requests')
      setRequests(d.requests)
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to load requests' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    try {
      const d = await api<{ request: ApiRequest }>(`/api/requests/${id}`)
      setDetail(d.request)
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to load request' })
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId) loadDetail(selectedId)
    else setDetail(null)
  }, [selectedId, loadDetail, refreshKey])

  const stats = useMemo(() => {
    const active = requests.filter((r) => !r.draft && !['COMPLETED', 'CLOSED', 'CANCELLED', 'QUOTATION_REJECTED'].includes(r.status))
    return {
      total: requests.filter((r) => !r.draft).length,
      active: active.length,
      drafts: requests.filter((r) => r.draft).length,
      pendingAction: active.filter((r) => r.pendingAction).length,
      unread: detail?.messages?.filter((m) => m.senderId !== user.id && !m.isRead).length || 0,
      pendingDocs: detail?.documentRequests?.filter((d) => d.status === 'PENDING').length || 0,
    }
  }, [requests, detail, user.id])

  const filtered = requests.filter((r) =>
    !search || r.requestCode.toLowerCase().includes(search.toLowerCase()) || r.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-500 flex items-center justify-center text-white font-bold shrink-0">S</span>
            {selectedId ? (
              <Button variant="ghost" size="sm" className="gap-1 -ml-1" onClick={() => setSelectedId(null)}>
                <ArrowLeft className="h-4 w-4" /> My Services
              </Button>
            ) : (
              <div className="min-w-0">
                <p className="font-bold leading-tight">My Services</p>
                <p className="text-xs text-muted-foreground truncate">Hello, {user.name}{user.company ? ` · ${user.company}` : ''}</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setNewReqOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5">
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New Request</span>
            </Button>
            <NotificationsBell refreshKey={refreshKey} />
            <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Sign out"><LogOut className="h-4.5 w-4.5" /></Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full">
        {selectedId ? (
          detailLoading ? <Loading /> :
          detail ? (
            <RequestWorkspace
              request={detail} user={user}
              onBack={() => setSelectedId(null)}
              onChanged={() => setRefreshKey((k) => k + 1)}
              onPay={(p) => setPayDialog(p)}
            />
          ) : <p className="text-muted-foreground">Select a service to open its workspace.</p>
        ) : (
          <>
            {/* Overview cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <StatCard icon={<ClipboardList className="h-4 w-4" />} label="Total services" value={stats.total} />
              <StatCard icon={<RefreshCcw className="h-4 w-4" />} label="Active" value={stats.active} tone="teal" />
              <StatCard icon={<FileText className="h-4 w-4" />} label="Quotations / actions" value={stats.pendingAction} tone="amber" />
              <StatCard icon={<MessageSquare className="h-4 w-4" />} label="Drafts" value={stats.drafts} />
            </div>

            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold">All services</h2>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by ID or title…"
                className="max-w-xs h-9" aria-label="Search requests" />
            </div>

            {loading ? <Loading /> : filtered.length === 0 ? (
              <EmptyState onNew={() => setNewReqOpen(true)} />
            ) : (
              <div className="space-y-3">
                {filtered.map((r) => (
                  <button key={r.id} onClick={() => setSelectedId(r.id)}
                    className="w-full text-left rounded-2xl border bg-white p-4 sm:p-5 hover:border-emerald-300 hover:shadow-sm transition-all">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className="font-mono text-xs text-muted-foreground">{r.requestCode}</span>
                          <Badge variant="outline" className={`text-[10px] ${EXECUTION_MODEL_COLORS[r.executionModel] || ''}`}>
                            {EXECUTION_MODEL_SHORT[r.executionModel] || r.executionModel}
                          </Badge>
                          {r.draft && <Badge variant="outline" className="text-[10px] bg-zinc-100 text-zinc-600 border-zinc-200">Draft</Badge>}
                          {r.vendor && <Badge variant="outline" className="text-[10px] bg-stone-50 text-stone-600 border-stone-200">
                            <CompanyLogo name={r.vendor.vendorProfile?.businessName || r.vendor.name} src={r.vendor.vendorProfile?.logoUrl} className="h-3.5 w-3.5 rounded mr-1" />
                            {r.vendor.vendorProfile?.businessName || r.vendor.name}
                          </Badge>}
                        </div>
                        <h3 className="font-semibold truncate">{r.title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{requestServiceLabel(r)} · created {formatDate(r.createdAt)}</p>
                        {r.pendingAction && !r.draft && (
                          <p className="mt-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 inline-flex items-center gap-1.5">
                            <CircleDollarSign className="h-3.5 w-3.5" /> {r.pendingAction}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <StatusBadge status={r.status} />
                        {!r.draft && (
                          <div className="w-36">
                            <ProgressBar value={r.progress} />
                            <p className="text-[10px] text-muted-foreground mt-1 text-right">{r.progress}% complete</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {newReqOpen && (
        <RequirementDialog service={null} onClose={() => setNewReqOpen(false)} onAuth={() => {}} />
      )}
      {payDialog && (
        <PaymentGatewayDialog
          open onClose={() => setPayDialog(null)}
          payment={payDialog}
          requestLabel={`${detail?.requestCode || ''} · ${detail?.title || ''}`}
          onPaid={() => { setPayDialog(null); setRefreshKey((k) => k + 1) }}
        />
      )}
      <AiAssistantWidget />
    </div>
  )
}

// ================= WORKSPACE =================
function RequestWorkspace({ request: r, user, onBack, onChanged, onPay }: {
  request: ApiRequest
  user: ApiUser
  onBack: () => void
  onChanged: () => void
  onPay: (p: ApiPayment) => void
}) {
  const [tab, setTab] = useState('overview')
  const latestQuotation = useMemo(
    () => (r.quotations || []).slice().sort((a, b) => b.version - a.version).find((q) => q.status !== 'SUPERSEDED' && q.status !== 'REJECTED')
      || (r.quotations || []).slice().sort((a, b) => b.version - a.version)[0],
    [r.quotations]
  )
  const accepted = (r.quotations || []).find((q) => q.status === 'ACCEPTED')
  const deliverables = (r.documents || []).filter((d) => d.isDeliverable)
  const pendingDocRequests = (r.documentRequests || []).filter((d) => d.status === 'PENDING')

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'quotation', label: `Quotation${latestQuotation ? ` (${latestQuotation.version})` : ''}` },
    { key: 'project', label: 'Project' },
    { key: 'documents', label: `Documents${pendingDocRequests.length ? ` (${pendingDocRequests.length})` : ''}` },
    { key: 'deliverables', label: `Deliverables${deliverables.length ? ` (${deliverables.length})` : ''}` },
    { key: 'payments', label: 'Payments' },
    { key: 'chat', label: 'Chat' },
    { key: 'timeline', label: 'Timeline' },
  ]

  return (
    <div>
      <Button variant="ghost" size="sm" className="gap-1 -ml-2 mb-3 text-muted-foreground" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Back to services
      </Button>

      {/* Header card */}
      <div className="rounded-2xl border bg-white p-5 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-mono text-xs text-muted-foreground">{r.requestCode}</span>
              <Badge variant="outline" className={`text-[10px] ${STAGE_COLORS[r.stage] || ''}`}>{STAGE_LABELS[r.stage] || r.stage} stage</Badge>
              <Badge variant="outline" className={`text-[10px] ${EXECUTION_MODEL_COLORS[r.executionModel] || ''}`}>
                {EXECUTION_MODEL_LABELS[r.executionModel] || r.executionModel}
              </Badge>
            </div>
            <h1 className="text-xl font-bold truncate">{r.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{requestServiceLabel(r)}</p>
          </div>
          <div className="text-right shrink-0">
            <StatusBadge status={r.status} />
            <div className="mt-2 w-48">
              <ProgressBar value={r.progress} />
              <p className="text-[11px] text-muted-foreground mt-1">{r.progress}% complete</p>
            </div>
          </div>
        </div>
        {r.pendingAction && (
          <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            <span className="font-semibold">Next step: </span>{r.pendingAction}
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto h-auto flex-wrap">
          {tabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="text-xs sm:text-sm">{t.label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview"><OverviewTab r={r} /></TabsContent>
        <TabsContent value="quotation"><QuotationTab r={r} onChanged={onChanged} onTab={(t) => setTab(t)} /></TabsContent>
        <TabsContent value="project"><ProjectTab r={r} onChanged={onChanged} /></TabsContent>
        <TabsContent value="documents"><DocumentsTab r={r} onChanged={onChanged} /></TabsContent>
        <TabsContent value="deliverables"><DeliverablesTab r={r} onChanged={onChanged} /></TabsContent>
        <TabsContent value="payments"><PaymentsTab r={r} onPay={onPay} onChanged={onChanged} /></TabsContent>
        <TabsContent value="chat"><ChatPanel request={{ id: r.id, requestCode: r.requestCode }} user={user} /></TabsContent>
        <TabsContent value="timeline"><TimelineTab r={r} /></TabsContent>
      </Tabs>
    </div>
  )
}

// ---------- Overview ----------
function OverviewTab({ r }: { r: ApiRequest }) {
  const responses = useMemo(() => {
    try { return JSON.parse(r.formResponses || '{}') as Record<string, unknown> } catch { return {} }
  }, [r.formResponses])
  const milestones = r.project?.milestones || []
  const nextMilestone = milestones.find((m) => m.status === 'PENDING' || m.status === 'IN_PROGRESS')

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="rounded-2xl border bg-white p-5 space-y-3">
        <h3 className="font-semibold">Requirement</h3>
        <p className="text-sm text-stone-700 whitespace-pre-wrap leading-relaxed">{r.description}</p>
        <dl className="text-sm space-y-2 pt-2">
          {r.expectedDeliverables && (<div className="flex gap-2"><dt className="text-muted-foreground shrink-0 w-32">Deliverables</dt><dd>{r.expectedDeliverables}</dd></div>)}
          {r.preferredTimeline && (<div className="flex gap-2"><dt className="text-muted-foreground shrink-0 w-32">Timeline</dt><dd className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{r.preferredTimeline}</dd></div>)}
          {r.projectLocation && (<div className="flex gap-2"><dt className="text-muted-foreground shrink-0 w-32">Location</dt><dd className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{r.projectLocation}</dd></div>)}
          <div className="flex gap-2"><dt className="text-muted-foreground shrink-0 w-32">Assigned to</dt><dd>{r.assignedTo?.name || 'Being assigned'}</dd></div>
          {r.vendor && (<div className="flex gap-2"><dt className="text-muted-foreground shrink-0 w-32">Executing partner</dt><dd className="flex items-center gap-1.5"><CompanyLogo name={r.vendor.vendorProfile?.businessName || r.vendor.name} src={r.vendor.vendorProfile?.logoUrl} className="h-5 w-5 rounded" />{r.vendor.vendorProfile?.businessName || r.vendor.name}</dd></div>)}
        </dl>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border bg-white p-5">
          <h3 className="font-semibold mb-3">Progress</h3>
          <ProgressBar value={r.progress} />
          <p className="text-xs text-muted-foreground mt-2">
            {nextMilestone ? `Current milestone: ${nextMilestone.title}` : r.project ? 'All milestones completed' : 'Milestones appear once work starts'}
          </p>
          <div className="mt-4 space-y-2">
            {milestones.slice(0, 5).map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${m.status === 'APPROVED' || m.status === 'DONE' ? 'bg-emerald-500' : m.status === 'IN_PROGRESS' ? 'bg-amber-500' : 'bg-stone-300'}`} />
                  <span className="truncate">{m.title}</span>
                </span>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">{MILESTONE_STATUS_LABELS[m.status]}</span>
              </div>
            ))}
          </div>
        </div>
        {Object.keys(responses).length > 0 && (
          <div className="rounded-2xl border bg-white p-5">
            <h3 className="font-semibold mb-2">Your form answers</h3>
            <dl className="text-sm space-y-1.5">
              {Object.entries(responses).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="text-muted-foreground shrink-0">{k}:</dt>
                  <dd className="min-w-0">{Array.isArray(v) ? v.join(', ') : String(v)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Quotation (negotiation) ----------
function QuotationTab({ r, onChanged, onTab }: { r: ApiRequest; onChanged: () => void; onTab: (t: string) => void }) {
  const quotations = (r.quotations || []).slice().sort((a, b) => b.version - a.version)
  const [responding, setResponding] = useState<{ q: ApiQuotation; action: 'reject' | 'revision' } | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function act(qid: string, action: 'accept' | 'reject' | 'request_revision', noteText?: string) {
    setBusy(true)
    try {
      await api(`/api/quotations/${qid}`, { method: 'POST', body: JSON.stringify({ action, note: noteText }) })
      toast({ title:
        action === 'accept' ? 'Quotation accepted — commercial record locked' :
        action === 'reject' ? 'Quotation rejected' : 'Revision requested — the team will respond shortly',
      })
      setResponding(null)
      setNote('')
      onChanged()
      if (action === 'accept') onTab('project')
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Action failed' })
    } finally {
      setBusy(false)
    }
  }

  if (quotations.length === 0) {
    return (
      <div className="rounded-2xl border bg-white p-10 text-center">
        <FileText className="h-10 w-10 text-stone-300 mx-auto" />
        <p className="mt-3 font-medium">No quotation yet</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          The team is reviewing your requirement. Your customized, line-item quotation will appear here — you will also get a notification.
        </p>
      </div>
    )
  }

  const canRespond = (status: string) => ['SENT', 'NEGOTIATION', 'REVISION_REQUESTED'].includes(status)

  return (
    <div className="space-y-4">
      {quotations.map((q, idx) => (
        <div key={q.id} className={`rounded-2xl border bg-white overflow-hidden ${idx === 0 ? '' : 'opacity-80'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b bg-stone-50/70">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold">{q.quotationNo}</span>
              <Badge variant="outline" className={`text-[10px] ${QUOTATION_STATUS_COLORS[q.status] || ''}`}>
                {QUOTATION_STATUS_LABELS[q.status] || q.status}
              </Badge>
              {q.lockedAt && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Locked record</Badge>}
            </div>
            <span className="text-xs text-muted-foreground">v{q.version} · {q.sentAt ? `sent ${formatDate(q.sentAt)}` : `drafted ${formatDate(q.createdAt)}`}{q.validUntil ? ` · valid till ${formatDate(q.validUntil)}` : ''}</span>
          </div>

          <div className="p-5 space-y-4">
            {q.scope && (<div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Scope</p><p className="text-sm text-stone-700 whitespace-pre-wrap">{q.scope}</p></div>)}

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm min-w-[480px]">
                <thead><tr className="bg-stone-50 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium text-right">Qty</th>
                  <th className="px-3 py-2 font-medium text-right">Rate</th>
                  <th className="px-3 py-2 font-medium text-right">Amount</th>
                </tr></thead>
                <tbody>
                  {q.items.map((it) => (
                    <tr key={it.id || it.sortOrder} className="border-t">
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{it.description}</p>
                        {it.detail && <p className="text-xs text-muted-foreground">{it.detail}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">{it.quantity} {it.unit}</td>
                      <td className="px-3 py-2.5 text-right">{formatINR(it.unitPrice)}</td>
                      <td className="px-3 py-2.5 text-right font-medium">{formatINR(it.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t"><td colSpan={3} className="px-3 py-2 text-right text-muted-foreground">Subtotal</td><td className="px-3 py-2 text-right">{formatINR(q.subtotal)}</td></tr>
                  <tr className="border-t"><td colSpan={3} className="px-3 py-2 text-right text-muted-foreground">{q.taxLabel} @ {q.taxRatePct}%</td><td className="px-3 py-2 text-right">{formatINR(q.taxAmount)}</td></tr>
                  <tr className="border-t bg-emerald-50/60"><td colSpan={3} className="px-3 py-2.5 text-right font-bold">Total</td><td className="px-3 py-2.5 text-right font-bold text-emerald-800">{formatINR(q.total)}</td></tr>
                </tbody>
              </table>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              {q.deliverablesNote && (<div><p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Deliverables</p><p className="text-stone-700">{q.deliverablesNote}</p></div>)}
              {q.timelineNote && (<div><p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Timeline</p><p className="text-stone-700">{q.timelineNote}</p></div>)}
              {q.paymentTerms && (<div><p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Payment terms</p><p className="text-stone-700">{q.paymentTerms}</p></div>)}
              {q.notes && (<div><p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Notes</p><p className="text-stone-700">{q.notes}</p></div>)}
            </div>

            {q.customerNote && (q.status === 'REVISION_REQUESTED' || q.status === 'REJECTED') && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                <span className="font-semibold">Your note: </span>{q.customerNote}
              </div>
            )}

            {canRespond(q.status) && idx === 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button className="bg-emerald-600 hover:bg-emerald-700 gap-1.5" disabled={busy} onClick={() => act(q.id, 'accept')}>
                  <CheckCircle2 className="h-4 w-4" /> Accept quotation
                </Button>
                <Button variant="outline" className="gap-1.5" disabled={busy}
                  onClick={() => { setResponding({ q, action: 'revision' }); setNote('') }}>
                  <RefreshCcw className="h-4 w-4" /> Request changes
                </Button>
                <Button variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => onTab('chat')}>
                  <MessageSquare className="h-4 w-4" /> Discuss in chat
                </Button>
              </div>
            )}
          </div>
        </div>
      ))}

      <Dialog open={!!responding} onOpenChange={(o) => !o && setResponding(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{responding?.action === 'reject' ? 'Reject quotation' : 'Request changes'}</DialogTitle>
            <DialogDescription>
              {responding?.action === 'reject'
                ? 'Tell the team why — they may prepare a better-fitting quotation.'
                : 'What should change? The team will prepare a revised version.'}
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Can we reduce the design line and extend support to 45 days?" aria-label="Your note" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setResponding(null)}>Cancel</Button>
            <Button
              className={responding?.action === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}
              disabled={busy || !note.trim()}
              onClick={() => responding && act(responding.q.id, responding.action === 'reject' ? 'reject' : 'request_revision', note.trim())}
            >
              {responding?.action === 'reject' ? <><XCircle className="h-4 w-4 mr-1.5" /> Reject</> : <><Send className="h-4 w-4 mr-1.5" /> Send request</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------- Project (milestones & progress) ----------
function ProjectTab({ r, onChanged }: { r: ApiRequest; onChanged: () => void }) {
  const p = r.project
  const [busy, setBusy] = useState(false)

  async function approveDelivery() {
    if (!r.id) return
    setBusy(true)
    try {
      await api(`/api/requests/${r.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED' }) })
      toast({ title: 'Delivery approved — thank you!' })
      onChanged()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Action failed' })
    } finally {
      setBusy(false)
    }
  }

  if (!p) {
    return (
      <div className="rounded-2xl border bg-white p-10 text-center">
        <ClipboardList className="h-10 w-10 text-stone-300 mx-auto" />
        <p className="mt-3 font-medium">Project workspace opens after quotation acceptance</p>
        <p className="text-sm text-muted-foreground mt-1">Once you accept a quotation, milestones and progress tracking appear here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <StatusBadge status={p.status} />
            {p.vendor && <span className="text-sm text-muted-foreground">Executed by <span className="inline-flex items-center gap-1.5 align-middle mx-0.5"><CompanyLogo name={p.vendor.vendorProfile?.businessName || p.vendor.name} src={p.vendor.vendorProfile?.logoUrl} className="h-5 w-5 rounded" /><span className="font-medium text-stone-700">{p.vendor.vendorProfile?.businessName || p.vendor.name}</span></span></span>}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-emerald-700">{p.progressPct}%</p>
            {p.expectedEndDate && <p className="text-xs text-muted-foreground">Target: {formatDate(p.expectedEndDate)}</p>}
          </div>
        </div>
        <ProgressBar value={p.progressPct} className="mt-3" />
      </div>

      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b bg-stone-50/70"><h3 className="font-semibold">Milestones</h3></div>
        <ol className="divide-y">
          {p.milestones.map((m, i) => {
            const done = m.status === 'DONE' || m.status === 'APPROVED'
            return (
              <li key={m.id} className="flex gap-4 px-5 py-4">
                <span className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${done ? 'bg-emerald-100 text-emerald-700' : m.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-500'}`}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-sm">{m.title}</p>
                    <Badge variant="outline" className="text-[10px]">{m.weight}% weight</Badge>
                    {(m.amount ?? 0) > 0 && <Badge variant="outline" className="text-[10px]">{formatINR(m.amount ?? 0)}</Badge>}
                  </div>
                  {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-xs font-medium ${done ? 'text-emerald-700' : m.status === 'IN_PROGRESS' ? 'text-amber-700' : 'text-stone-500'}`}>
                    {MILESTONE_STATUS_LABELS[m.status]}
                  </p>
                  {m.dueDate && <p className="text-[11px] text-muted-foreground">due {formatDate(m.dueDate)}</p>}
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      {(r.status === 'DELIVERED' || r.status === 'CUSTOMER_APPROVAL_PENDING' || r.status === 'READY_FOR_DELIVERY') && (
        <div className="rounded-2xl border bg-emerald-50/60 border-emerald-200 p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-emerald-900">Work delivered — review and approve</p>
            <p className="text-sm text-emerald-800/80">Check the Deliverables tab, then close the engagement.</p>
          </div>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={approveDelivery}>
            <CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve & complete
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------- Documents ----------
function DocumentsTab({ r, onChanged }: { r: ApiRequest; onChanged: () => void }) {
  const [uploading, setUploading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [target, setTarget] = useState<string | null>(null) // documentRequestId

  async function upload() {
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('name', name || file.name)
      fd.append('category', 'OTHER')
      if (target) fd.append('documentRequestId', target)
      await api(`/api/requests/${r.id}/documents`, { method: 'POST', body: fd })
      toast({ title: 'Document uploaded', description: 'The team has been notified for review.' })
      setFile(null); setName(''); setTarget(null)
      onChanged()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Upload failed' })
    } finally {
      setUploading(false)
    }
  }

  const docRequests = r.documentRequests || []
  const otherDocs = (r.documents || []).filter((d) => !d.isDeliverable)

  return (
    <div className="space-y-4">
      {/* Team-requested documents */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b bg-stone-50/70 flex items-center justify-between">
          <h3 className="font-semibold">Requested documents</h3>
        </div>
        {docRequests.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">No documents have been requested yet.</p>
        ) : (
          <ul className="divide-y">
            {docRequests.map((d) => {
              const linked = (r.documents || []).filter((doc) => doc.documentRequestId === d.id)
              return (
                <li key={d.id} className="px-5 py-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{d.title} {d.mandatory && <span className="text-red-500">*</span>}</p>
                    {d.description && <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <DocStatusBadge status={d.status} />
                      {d.dueDate && <span className="text-[11px] text-muted-foreground">due {formatDate(d.dueDate)}</span>}
                      {linked.map((doc) => (
                        <a key={doc.id} href={`/api/documents/${doc.id}/download`} className="text-xs text-emerald-700 font-medium hover:underline flex items-center gap-1">
                          <Download className="h-3 w-3" /> {doc.name} ({formatBytes(doc.size)})
                        </a>
                      ))}
                    </div>
                    {d.status === 'REJECTED' && d.reviewNote && (
                      <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">Rejected: {d.reviewNote}</p>
                    )}
                  </div>
                  {(d.status === 'PENDING' || d.status === 'REJECTED' || d.status === 'SUBMITTED') && (
                    <Button size="sm" variant={d.status === 'SUBMITTED' ? 'ghost' : 'outline'}
                      onClick={() => { setTarget(d.id); setName(d.title) }}>
                      <Upload className="h-3.5 w-3.5 mr-1" /> {d.status === 'SUBMITTED' ? 'Replace' : 'Upload'}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Upload + other documents */}
      <div className="rounded-2xl border bg-white p-5">
        <h3 className="font-semibold mb-3">Upload a document</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name (optional)" className="sm:max-w-52" aria-label="Document name" />
          <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)}
            accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt" className="flex-1" aria-label="Choose file" />
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={!file || uploading} onClick={upload}>
            {uploading ? 'Uploading…' : <><Upload className="h-4 w-4 mr-1.5" /> Upload</>}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">PDF, images, Word, Excel or CSV — up to 10 MB. You can upload additional files anytime.</p>
      </div>

      {otherDocs.length > 0 && (
        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-stone-50/70"><h3 className="font-semibold">Shared files</h3></div>
          <ul className="divide-y">
            {otherDocs.map((doc) => (
              <li key={doc.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-4 w-4 text-stone-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(doc.size)} · {formatDateTime(doc.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <DocStatusIcon doc={doc} />
                  <a href={`/api/documents/${doc.id}/download`} className="text-emerald-700 hover:underline" aria-label={`Download ${doc.name}`}>
                    <Download className="h-4 w-4" />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ---------- Deliverables ----------
function DeliverablesTab({ r, onChanged }: { r: ApiRequest; onChanged: () => void }) {
  const deliverables = (r.documents || []).filter((d) => d.isDeliverable)
  const [busy, setBusy] = useState(false)

  async function approve() {
    setBusy(true)
    try {
      await api(`/api/requests/${r.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED' }) })
      toast({ title: 'Delivery approved — thank you!' })
      onChanged()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Action failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b bg-stone-50/70"><h3 className="font-semibold">Completed work</h3></div>
        {deliverables.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Deliverables will appear here as the team shares completed work.</p>
        ) : (
          <ul className="divide-y">
            {deliverables.map((doc) => (
              <li key={doc.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <PackageCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(doc.size)} · shared {formatDateTime(doc.createdAt)}</p>
                  </div>
                </div>
                <a href={`/api/documents/${doc.id}/download`} className="text-emerald-700 hover:underline text-sm font-medium shrink-0">Download</a>
              </li>
            ))}
          </ul>
        )}
      </div>
      {deliverables.length > 0 && ['DELIVERED', 'CUSTOMER_APPROVAL_PENDING'].includes(r.status) && (
        <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={approve}>
          <CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve delivery & complete engagement
        </Button>
      )}
    </div>
  )
}

// ---------- Payments ----------
function PaymentsTab({ r, onPay, onChanged }: { r: ApiRequest; onPay: (p: ApiPayment) => void; onChanged: () => void }) {
  const payments = r.payments || []
  const accepted = (r.quotations || []).find((q) => q.status === 'ACCEPTED')
  const invoices = r.invoices || []
  const paid = payments.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.amount, 0)
  const due = payments.filter((p) => p.status === 'PENDING').reduce((s, p) => s + p.amount, 0)

  return (
    <div className="space-y-4">
      {accepted && (
        <div className="rounded-2xl border bg-white p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Accepted quotation {accepted.quotationNo}</p>
            <p className="text-xs text-muted-foreground">{accepted.paymentTerms}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-emerald-800">{formatINR(accepted.total)}</p>
            <p className="text-xs text-muted-foreground">incl. {accepted.taxLabel}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border bg-white p-4">
          <p className="text-xs text-muted-foreground">Paid</p>
          <p className="text-xl font-bold text-emerald-700">{formatINR(paid)}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <p className="text-xs text-muted-foreground">Due</p>
          <p className={`text-xl font-bold ${due > 0 ? 'text-amber-600' : 'text-stone-500'}`}>{formatINR(due)}</p>
        </div>
      </div>

      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b bg-stone-50/70"><h3 className="font-semibold">Payment schedule</h3></div>
        {payments.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            No payments scheduled yet. After quotation acceptance, the team schedules payments per the agreed terms.
          </p>
        ) : (
          <ul className="divide-y">
            {payments.map((p) => (
              <li key={p.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{p.label || PAYMENT_TYPE_LABELS[p.type] || p.type}</p>
                  {p.milestone && <p className="text-xs text-muted-foreground">Milestone: {p.milestone.title}</p>}
                  {p.paidAt && <p className="text-xs text-muted-foreground">Paid {formatDateTime(p.paidAt)} · {p.method} · {p.receiptNo}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{formatINR(p.amount)}</span>
                  {p.status === 'PENDING' && (
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => onPay(p)}>
                      <IndianRupee className="h-3.5 w-3.5 mr-1" /> Pay now
                    </Button>
                  )}
                  {p.status === 'PAID' && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Paid</Badge>}
                  {p.status === 'FAILED' && <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Failed</Badge>}
                  {p.status === 'REFUNDED' && <Badge variant="outline">Refunded</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {invoices.length > 0 && (
        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-stone-50/70"><h3 className="font-semibold">Invoices</h3></div>
          <ul className="divide-y">
            {invoices.map((inv) => (
              <li key={inv.id} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium font-mono">{inv.invoiceNo}</p>
                  <p className="text-xs text-muted-foreground">{inv.description || inv.type.replace('_', ' ')} · {formatDate(inv.issuedAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{formatINR(inv.totalAmount)}</span>
                  <Badge variant="outline" className={inv.status === 'PAID' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}>{inv.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ---------- Timeline ----------
function TimelineTab({ r }: { r: ApiRequest }) {
  const history = (r.statusHistory || []).slice().reverse()
  return (
    <div className="rounded-2xl border bg-white p-5">
      <h3 className="font-semibold mb-4">Activity timeline</h3>
      {history.length === 0 ? <p className="text-sm text-muted-foreground">No activity recorded yet.</p> : (
        <ol className="relative border-l ml-3 space-y-5">
          {history.map((h) => (
            <li key={h.id} className="ml-5">
              <span className="absolute -left-[7px] h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={h.status} />
                <span className="text-xs text-muted-foreground">{formatDateTime(h.createdAt)}</span>
              </div>
              {h.note && <p className="text-sm text-stone-700 mt-1">{h.note}</p>}
              {h.createdBy?.name && <p className="text-xs text-muted-foreground mt-0.5">by {h.createdBy.name}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// ---------- small shared pieces ----------
function DocStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PENDING: { label: 'Waiting for upload', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    SUBMITTED: { label: 'Under review', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
    APPROVED: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    REJECTED: { label: 'Rejected — re-upload', cls: 'bg-red-50 text-red-700 border-red-200' },
    WAIVED: { label: 'Not required', cls: 'bg-zinc-50 text-zinc-600 border-zinc-200' },
  }
  const s = map[status] || map.PENDING
  return <Badge variant="outline" className={`text-[10px] ${s.cls}`}>{s.label}</Badge>
}

function StatCard({ icon, label, value, tone = 'stone' }: { icon: React.ReactNode; label: string; value: number; tone?: 'stone' | 'teal' | 'amber' }) {
  const tones: Record<string, string> = {
    stone: 'text-stone-600 bg-stone-100',
    teal: 'text-teal-700 bg-teal-50',
    amber: 'text-amber-700 bg-amber-50',
  }
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${tones[tone]}`}>{icon}</span>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}

function Loading() {
  return <div className="py-20 flex justify-center"><div className="h-8 w-8 rounded-full border-3 border-emerald-200 border-t-emerald-600 animate-spin" /></div>
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed bg-white p-12 text-center">
      <ClipboardList className="h-12 w-12 text-stone-300 mx-auto" />
      <h3 className="mt-4 font-semibold">No services yet</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
        Browse the catalog or describe any requirement — you&apos;ll receive a customized quotation before any commitment.
      </p>
      <Button className="mt-5 bg-emerald-600 hover:bg-emerald-700 gap-1.5" onClick={onNew}>
        <Plus className="h-4 w-4" /> Submit your first requirement
      </Button>
    </div>
  )
}
