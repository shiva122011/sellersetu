'use client'

// Admin & staff backend — module shell + overview + request pipeline + request workspace.
// Role-aware: SUPER_ADMIN/ADMIN get everything; OPS_MANAGER/PROJECT_MANAGER manage
// projects & vendors; SALES_EXEC manages quotations; EMPLOYEE sees assigned work.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '@/hooks/use-toast'
import { api, ApiRequest, ApiUser, requestServiceLabel } from '@/lib/client'
import {
  STATUS_LABELS, STATUS_COLORS, STAGE_LABELS, STAGE_COLORS, REQUEST_STATUSES,
  EXECUTION_MODELS, EXECUTION_MODEL_SHORT, EXECUTION_MODEL_COLORS, EXECUTION_MODEL_LABELS,
  ROLE_LABELS, formatINR, formatDate, formatDateTime, isStaffRole, isAdminRole,
  canManageQuotations, canManageProjects,
} from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { StatusBadge, ProgressBar, CompanyLogo } from '@/components/shared'
import ChatPanel from '@/components/chat-panel'
import NotificationsBell from '@/components/notifications-bell'
import {
  LogOut, LayoutDashboard, Inbox, FileSignature, LayoutGrid, Users, Handshake,
  Wallet, BarChart3, PanelsTopLeft, Settings2, History, Search, Plus, Send,
  IndianRupee, RefreshCcw, CheckCircle2, Building2, ChevronRight, Loader2, FileText,
} from 'lucide-react'
import AdminModules from '@/components/admin-modules'
import StaffQuotationPanel from '@/components/staff-quotation-panel'
import StaffProjectPanel from '@/components/staff-project-panel'
import StaffDocsPaymentsPanel from '@/components/staff-docs-payments-panel'

export default function AdminDashboard({ user, onLogout }: { user: ApiUser; onLogout: () => void }) {
  const [tab, setTab] = useState('overview')
  const [requests, setRequests] = useState<ApiRequest[]>([])
  const [stats, setStats] = useState<{ stats: Record<string, number>; byStage: Record<string, number>; recentRequests: ApiRequest[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ApiRequest | null>(null)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<string>('ALL')
  const [refreshKey, setRefreshKey] = useState(0)

  const admin = isAdminRole(user.role)
  const pm = canManageProjects(user.role)
  const quotes = canManageQuotations(user.role)

  const load = useCallback(async () => {
    try {
      const [reqs, st] = await Promise.all([
        api<{ requests: ApiRequest[] }>('/api/requests'),
        api<{ stats: Record<string, number>; byStage: Record<string, number>; recentRequests: ApiRequest[] }>('/api/admin/stats'),
      ])
      setRequests(reqs.requests)
      setStats(st)
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to load dashboard' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const loadDetail = useCallback(async (id: string) => {
    try {
      const d = await api<{ request: ApiRequest }>(`/api/requests/${id}`)
      setDetail(d.request)
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to load request' })
    }
  }, [])

  useEffect(() => {
    if (selectedId) loadDetail(selectedId)
    else setDetail(null)
  }, [selectedId, loadDetail, refreshKey])

  const filtered = requests.filter((r) =>
    (stageFilter === 'ALL' || r.stage === stageFilter) &&
    (!search || r.requestCode.toLowerCase().includes(search.toLowerCase()) || r.title.toLowerCase().includes(search.toLowerCase()) || (r.customer?.name || '').toLowerCase().includes(search.toLowerCase()))
  )

  const nav = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'requests', label: 'Requests', icon: Inbox },
    ...(quotes ? [{ key: 'quotations', label: 'Quotations', icon: FileSignature }] : []),
    { key: 'catalog', label: 'Catalog', icon: LayoutGrid },
    { key: 'customers', label: 'Customers', icon: Users },
    { key: 'vendors', label: 'Vendors', icon: Handshake },
    { key: 'team', label: 'Employees', icon: Users },
    { key: 'payments', label: 'Payments & Invoices', icon: Wallet },
    { key: 'reports', label: 'Reports', icon: BarChart3 },
    ...(admin ? [{ key: 'cms', label: 'CMS', icon: PanelsTopLeft }] : []),
    ...(admin ? [{ key: 'settings', label: 'Settings', icon: Settings2 }] : []),
    { key: 'activity', label: 'Audit Log', icon: History },
  ]

  if (selectedId && detail) {
    return (
      <div className="min-h-screen flex flex-col bg-stone-50">
        <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" className="gap-1 -ml-1" onClick={() => setSelectedId(null)}>
              <ChevronRight className="h-4 w-4 rotate-180" /> Back to {nav.find((n) => n.key === tab)?.label || 'Requests'}
            </Button>
            <div className="flex items-center gap-2">
              <NotificationsBell refreshKey={refreshKey} />
              <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Sign out"><LogOut className="h-4.5 w-4.5" /></Button>
            </div>
          </div>
        </header>
        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full">
          <RequestStaffWorkspace request={detail} user={user} onChanged={() => setRefreshKey((k) => k + 1)} />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 lg:flex-row">
      {/* Sidebar */}
      <aside className="lg:w-60 lg:min-h-screen border-b lg:border-b-0 lg:border-r bg-white shrink-0">
        <div className="sticky top-0">
          <div className="flex items-center gap-2 px-4 h-16 border-b">
            { }
            <img src="/logos/sellersetu-mark.png" alt="SellerSetu logo" className="h-9 w-9 rounded-xl border object-cover" />
            <div className="min-w-0">
              <p className="font-bold leading-tight text-sm">Operations</p>
              <p className="text-[11px] text-muted-foreground truncate">{user.name} · {ROLE_LABELS[user.role] || user.role}</p>
            </div>
          </div>
          <nav className="p-2 flex lg:flex-col gap-1 overflow-x-auto" aria-label="Admin navigation">
            {nav.map((n) => (
              <button key={n.key} onClick={() => setTab(n.key)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${tab === n.key ? 'bg-emerald-50 text-emerald-800' : 'text-stone-600 hover:bg-stone-100'}`}>
                <n.icon className="h-4 w-4 shrink-0" /> {n.label}
              </button>
            ))}
            <div className="lg:mt-auto lg:pt-4 px-1">
              <button onClick={onLogout} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-stone-500 hover:bg-stone-100 w-full">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </nav>
        </div>
      </aside>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full min-w-0">
        {tab === 'overview' && <OverviewTab stats={stats} requests={requests} onOpen={(id) => { setTab('requests'); setSelectedId(id) }} loading={loading} />}
        {tab === 'requests' && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h1 className="text-lg font-semibold">Service requests</h1>
              <div className="flex gap-2">
                <Select value={stageFilter} onValueChange={setStageFilter}>
                  <SelectTrigger className="w-40 h-9" aria-label="Filter by stage"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All stages</SelectItem>
                    {Object.entries(STAGE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-8 h-9 w-48" aria-label="Search requests" />
                </div>
              </div>
            </div>
            {loading ? <CenteredSpinner /> : filtered.length === 0 ? (
              <p className="text-muted-foreground py-12 text-center">No requests match.</p>
            ) : (
              <div className="space-y-2">
                {filtered.map((r) => (
                  <button key={r.id} onClick={() => setSelectedId(r.id)}
                    className="w-full text-left rounded-xl border bg-white px-4 py-3.5 hover:border-emerald-300 transition-colors flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{r.requestCode}</span>
                        <Badge variant="outline" className={`text-[10px] ${STAGE_COLORS[r.stage] || ''}`}>{STAGE_LABELS[r.stage]}</Badge>
                        <Badge variant="outline" className={`text-[10px] ${EXECUTION_MODEL_COLORS[r.executionModel] || ''}`}>{EXECUTION_MODEL_SHORT[r.executionModel]}</Badge>
                        {r.draft && <Badge variant="outline" className="text-[10px]">DRAFT</Badge>}
                      </div>
                      <p className="font-medium text-sm truncate mt-0.5">{r.title}</p>
                      <p className="text-xs text-muted-foreground">{requestServiceLabel(r)} · {r.customer?.company || r.customer?.name}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <StatusBadge status={r.status} />
                      <span className="text-[11px] text-muted-foreground">{r.assignedTo?.name || 'Unassigned'}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {tab !== 'overview' && tab !== 'requests' && (
          <AdminModules tab={tab} user={user} onChanged={() => setRefreshKey((k) => k + 1)} onOpenRequest={(id) => setSelectedId(id)} />
        )}
      </main>
    </div>
  )
}

// ================= OVERVIEW =================
function OverviewTab({ stats, requests, onOpen, loading }: {
  stats: { stats: Record<string, number>; byStage: Record<string, number>; recentRequests: ApiRequest[] } | null
  requests: ApiRequest[]
  onOpen: (id: string) => void
  loading: boolean
}) {
  if (loading || !stats) return <CenteredSpinner />
  const s = stats.stats
  const cards = [
    { label: 'Total requests', value: s.totalRequests, icon: Inbox },
    { label: 'Active', value: s.activeRequests, icon: RefreshCcw },
    { label: 'Revenue collected', value: s.revenue ? formatINR(s.revenue) : formatINR(0), icon: IndianRupee },
    { label: 'Outstanding', value: s.outstanding ? formatINR(s.outstanding) : formatINR(0), icon: Wallet },
    { label: 'Live quotations', value: s.liveQuotations, icon: FileSignature },
    { label: 'Quote acceptance', value: `${s.quotationAcceptanceRate}%`, icon: BarChart3 },
    { label: 'Customers', value: s.totalCustomers, icon: Users },
    { label: 'Vendors pending', value: s.pendingVendors, icon: Handshake },
  ]
  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">Operations overview</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border bg-white p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><c.icon className="h-4 w-4" /></span>
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </div>
            <p className="text-xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Stage pipeline */}
      <div className="mt-6 rounded-2xl border bg-white p-5">
        <h2 className="font-semibold mb-4">Pipeline by stage</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(STAGE_LABELS).map(([k, label]) => (
            <div key={k} className="rounded-xl border p-4">
              <Badge variant="outline" className={`text-[10px] ${STAGE_COLORS[k]}`}>{label}</Badge>
              <p className="text-2xl font-bold mt-2">{stats.byStage[k] || 0}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b bg-stone-50/70"><h2 className="font-semibold">Latest requests</h2></div>
        <ul className="divide-y">
          {stats.recentRequests.map((r) => (
            <li key={r.id}>
              <button onClick={() => onOpen(r.id)} className="w-full text-left px-5 py-3 flex items-center justify-between gap-3 hover:bg-stone-50">
                <div className="min-w-0">
                  <span className="font-mono text-xs text-muted-foreground">{r.requestCode}</span>
                  <p className="text-sm font-medium truncate">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{r.customer?.company || r.customer?.name} · {formatDate(r.createdAt)}</p>
                </div>
                <StatusBadge status={r.status} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ================= REQUEST STAFF WORKSPACE =================
export function RequestStaffWorkspace({ request: r, user, onChanged }: {
  request: ApiRequest
  user: ApiUser
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [statusNote, setStatusNote] = useState('')
  const [tab, setTab] = useState('manage')

  const pm = canManageProjects(user.role)
  const quotes = canManageQuotations(user.role)
  const admin = isAdminRole(user.role)

  async function patch(body: Record<string, unknown>, msg: string) {
    setBusy(true)
    try {
      await api(`/api/requests/${r.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      toast({ title: msg })
      onChanged()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Update failed' })
    } finally {
      setBusy(false)
    }
  }

  const nextStatuses = useMemo(() => {
    // Suggest the natural next statuses based on current stage
    const flow: Record<string, string[]> = {
      DRAFT: ['SUBMITTED'],
      SUBMITTED: ['UNDER_REVIEW', 'MORE_INFO_REQUIRED', 'QUOTATION_PREPARATION'],
      UNDER_REVIEW: ['MORE_INFO_REQUIRED', 'DISCUSSION_IN_PROGRESS', 'QUOTATION_PREPARATION'],
      MORE_INFO_REQUIRED: ['UNDER_REVIEW'],
      DISCUSSION_IN_PROGRESS: ['QUOTATION_PREPARATION'],
      QUOTATION_PREPARATION: ['QUOTATION_SENT'],
      QUOTATION_SENT: ['NEGOTIATION', 'REVISION_REQUESTED', 'QUOTATION_ACCEPTED'],
      NEGOTIATION: ['QUOTATION_SENT', 'REVISION_REQUESTED', 'QUOTATION_ACCEPTED'],
      REVISION_REQUESTED: ['QUOTATION_PREPARATION', 'QUOTATION_SENT'],
      QUOTATION_ACCEPTED: ['AWAITING_PAYMENT', 'ASSIGNED', 'PLANNING'],
      QUOTATION_REJECTED: ['QUOTATION_PREPARATION', 'DISCUSSION_IN_PROGRESS'],
      AWAITING_PAYMENT: ['ASSIGNED', 'PLANNING'],
      ASSIGNED: ['PLANNING', 'IN_PROGRESS'],
      PLANNING: ['IN_PROGRESS'],
      IN_PROGRESS: ['AWAITING_CUSTOMER_INPUT', 'WORK_REVIEW', 'REVISION_REQUIRED'],
      AWAITING_CUSTOMER_INPUT: ['IN_PROGRESS'],
      WORK_REVIEW: ['IN_PROGRESS', 'READY_FOR_DELIVERY', 'REVISION_REQUIRED'],
      REVISION_REQUIRED: ['IN_PROGRESS', 'WORK_REVIEW'],
      READY_FOR_DELIVERY: ['DELIVERED'],
      DELIVERED: ['CUSTOMER_APPROVAL_PENDING', 'COMPLETED'],
      CUSTOMER_APPROVAL_PENDING: ['COMPLETED'],
      COMPLETED: ['CLOSED'],
      CLOSED: [], CANCELLED: [], ON_HOLD: ['IN_PROGRESS'],
    }
    const suggested = flow[r.status] || []
    return { suggested, all: [...REQUEST_STATUSES] }
  }, [r.status])

  return (
    <div>
      <div className="rounded-2xl border bg-white p-5 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-mono text-xs text-muted-foreground">{r.requestCode}</span>
              <Badge variant="outline" className={`text-[10px] ${STAGE_COLORS[r.stage] || ''}`}>{STAGE_LABELS[r.stage]} stage</Badge>
              <Badge variant="outline" className={`text-[10px] ${EXECUTION_MODEL_COLORS[r.executionModel] || ''}`}>{EXECUTION_MODEL_LABELS[r.executionModel]}</Badge>
            </div>
            <h1 className="text-xl font-bold">{r.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {requestServiceLabel(r)} · Customer: <span className="font-medium text-stone-700">{r.customer?.company || r.customer?.name}</span> ({r.customer?.email})
            </p>
          </div>
          <div className="text-right shrink-0">
            <StatusBadge status={r.status} />
            <div className="mt-2 w-44"><ProgressBar value={r.progress} /><p className="text-[11px] text-muted-foreground mt-1">{r.progress}%</p></div>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="manage">Manage</TabsTrigger>
          {quotes && <TabsTrigger value="quotation">Quotation</TabsTrigger>}
          {pm && <TabsTrigger value="project">Project & Milestones</TabsTrigger>}
          <TabsTrigger value="docs">Docs & Payments</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
        </TabsList>

        <TabsContent value="manage" className="mt-4 grid lg:grid-cols-2 gap-4">
          {/* Status control */}
          <div className="rounded-2xl border bg-white p-5 space-y-4">
            <h3 className="font-semibold">Workflow status</h3>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Change status to</label>
              <div className="mt-2 flex gap-2">
                <Select value={r.status} onValueChange={(v) => patch({ status: v, statusNote: statusNote || undefined }, 'Status updated')}>
                  <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {nextStatuses.suggested.length > 0 && (
                      <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground">Suggested next</div>
                    )}
                    {nextStatuses.suggested.map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                    ))}
                    <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground">All statuses</div>
                    {nextStatuses.all.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Input className="mt-2" value={statusNote} onChange={(e) => setStatusNote(e.target.value)}
                placeholder="Optional note recorded with the status change…" aria-label="Status note" />
            </div>
            {pm && (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Assign employee</label>
                  <EmployeeSelect value={r.assignedToId || ''} onChange={(v) => patch({ assignedToId: v || null }, v ? 'Employee assigned' : 'Assignment cleared')} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Execution model</label>
                  <Select value={r.executionModel} onValueChange={(v) => patch({ executionModel: v }, 'Execution model updated')}>
                    <SelectTrigger aria-label="Execution model"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EXECUTION_MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Executing vendor (must be approved)</label>
                  <VendorSelect value={r.vendorId || ''} onChange={(v) => patch({ vendorId: v || null }, v ? 'Vendor assigned' : 'Vendor cleared')} />
                </div>
              </>
            )}
            {admin && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Internal notes (never visible to customer/vendor)</label>
                <Textarea className="mt-1.5" rows={3} defaultValue={r.internalNotes || ''}
                  onBlur={(e) => e.target.value !== (r.internalNotes || '') && patch({ internalNotes: e.target.value }, 'Internal notes saved')} />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Pending customer action</label>
              <Input className="mt-1.5" defaultValue={r.pendingAction || ''}
                onBlur={(e) => e.target.value !== (r.pendingAction || '') && patch({ pendingAction: e.target.value }, 'Customer action updated')}
                placeholder="e.g. Review the revised quotation and respond" />
            </div>
          </div>

          {/* Requirement + info */}
          <div className="space-y-4">
            <div className="rounded-2xl border bg-white p-5">
              <h3 className="font-semibold mb-2">Requirement</h3>
              <p className="text-sm text-stone-700 whitespace-pre-wrap">{r.description}</p>
              <dl className="mt-3 text-sm space-y-1.5">
                {r.expectedDeliverables && <div className="flex gap-2"><dt className="text-muted-foreground w-32 shrink-0">Deliverables</dt><dd>{r.expectedDeliverables}</dd></div>}
                {r.preferredTimeline && <div className="flex gap-2"><dt className="text-muted-foreground w-32 shrink-0">Timeline</dt><dd>{r.preferredTimeline}</dd></div>}
                {r.projectLocation && <div className="flex gap-2"><dt className="text-muted-foreground w-32 shrink-0">Location</dt><dd>{r.projectLocation}</dd></div>}
                {r.additionalNotes && <div className="flex gap-2"><dt className="text-muted-foreground w-32 shrink-0">Notes</dt><dd>{r.additionalNotes}</dd></div>}
              </dl>
            </div>
            <div className="rounded-2xl border bg-white p-5">
              <h3 className="font-semibold mb-3">Recent history</h3>
              <ol className="space-y-2.5">
                {(r.statusHistory || []).slice(0, 5).map((h) => (
                  <li key={h.id} className="flex items-start gap-2 text-sm">
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${STATUS_COLORS[h.status] || ''}`}>{STATUS_LABELS[h.status]}</Badge>
                    <div className="min-w-0">
                      {h.note && <p className="text-xs text-stone-700">{h.note}</p>}
                      <p className="text-[11px] text-muted-foreground">{formatDateTime(h.createdAt)} · {h.createdBy?.name || 'System'}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </TabsContent>

        {quotes && <TabsContent value="quotation" className="mt-4"><StaffQuotationPanel request={r} onChanged={onChanged} /></TabsContent>}
        {pm && <TabsContent value="project" className="mt-4"><StaffProjectPanel request={r} user={user} onChanged={onChanged} /></TabsContent>}
        <TabsContent value="docs" className="mt-4"><StaffDocsPaymentsPanel request={r} onChanged={onChanged} /></TabsContent>
        <TabsContent value="chat" className="mt-4">
          <div className="rounded-2xl border bg-white p-4">
            <ChatPanel request={{ id: r.id, requestCode: r.requestCode }} user={user} allowInternal />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------- selects ----------
export function EmployeeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [staff, setStaff] = useState<{ id: string; name: string; role: string }[]>([])
  useEffect(() => {
    api<{ team: { id: string; name: string; role: string }[] }>('/api/admin/team')
      .then((d) => setStaff(d.team))
      .catch(() => {})
  }, [])
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="Assign employee"><SelectValue placeholder="Unassigned" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Unassigned</SelectItem>
        {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} — {ROLE_LABELS[s.role] || s.role}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

export function VendorSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [vendors, setVendors] = useState<{ id: string; user: { id: string; name: string }; businessName: string; logoUrl?: string }[]>([])
  useEffect(() => {
    api<{ vendors: { id: string; user: { id: string; name: string }; businessName: string; logoUrl?: string }[] }>('/api/vendors?status=APPROVED')
      .then((d) => setVendors(d.vendors))
      .catch(() => {})
  }, [])
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="Assign vendor"><SelectValue placeholder="No vendor" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No vendor</SelectItem>
        {vendors.map((v) => (
          <SelectItem key={v.user.id} value={v.user.id}>
            <span className="flex items-center gap-2">
              <CompanyLogo name={v.businessName} src={v.logoUrl} className="h-5 w-5 rounded" />
              {v.businessName} ({v.user.name})
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function CenteredSpinner() {
  return <div className="py-20 flex justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>
}
