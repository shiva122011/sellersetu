'use client'

// Vendor portal — registration status, profile management, assigned engagements,
// milestone updates, work submission, documents and chat (authorized connections only).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '@/hooks/use-toast'
import { api, ApiRequest, ApiUser, ApiVendorConnection, ApiProjectTask, ApiMilestone } from '@/lib/client'
import {
  STATUS_LABELS, EXECUTION_MODEL_LABELS, MILESTONE_STATUS_LABELS, formatINR, formatDate, formatDateTime,
} from '@/lib/constants'
import { parseFormConfig, isFieldVisible } from '@/lib/forms'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProgressBar, formatBytes, CompanyLogo } from '@/components/shared'
import ChatPanel from '@/components/chat-panel'
import NotificationsBell from '@/components/notifications-bell'
import AiAssistantWidget from '@/components/ai-assistant'
import {
  LogOut, Building2, MapPin, Globe, CheckCircle2, Clock, Hourglass, XCircle,
  Upload, Download, Send, ArrowLeft, Star, Loader2, PackageCheck, ClipboardList, History,
  Wallet, Landmark, Smartphone, Info, IndianRupee, BadgeCheck,
} from 'lucide-react'

export default function VendorPortal({ user, onLogout }: { user: ApiUser; onLogout: () => void }) {
  const [profile, setProfile] = useState<ApiUser['vendorProfile']>(user.vendorProfile || null)
  const [connections, setConnections] = useState<ApiVendorConnection[]>([])
  const [projects, setProjects] = useState<ApiRequest[]>([])
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ApiRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const load = useCallback(async () => {
    try {
      const [me, conn, reqs] = await Promise.all([
        api<{ user: ApiUser }>('/api/auth/me'),
        api<{ connections: ApiVendorConnection[] }>('/api/vendor-connections'),
        api<{ requests: ApiRequest[] }>('/api/requests'),
      ])
      setProfile(me.user.vendorProfile || null)
      setConnections(conn.connections)
      setProjects(reqs.requests)
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to load portal' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  useEffect(() => {
    if (selectedRequestId) {
      api<{ request: ApiRequest }>(`/api/requests/${selectedRequestId}`)
        .then((d) => setDetail(d.request))
        .catch((e) => toast({ title: e instanceof Error ? e.message : 'Failed to load project' }))
    } else {
      setDetail(null)
    }
  }, [selectedRequestId, refreshKey])

  const activeEngagements = connections.filter((c) => ['AUTHORIZED', 'ACTIVE'].includes(c.status))
  const completed = connections.filter((c) => c.status === 'COMPLETED')

  // Unique request ids for the vendor's payouts view (connections + assigned projects)
  const payoutRequestIds = useMemo(() => {
    const ids = new Set<string>()
    connections.forEach((c) => { if (c.request?.id) ids.add(c.request.id) })
    projects.forEach((r) => ids.add(r.id))
    return Array.from(ids)
  }, [connections, projects])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-stone-50"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
  }

  // ------- No profile / pending / rejected -------
  if (!profile || profile.status !== 'APPROVED') {
    return (
      <div className="min-h-screen flex flex-col bg-stone-50">
        <header className="border-b bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-500 flex items-center justify-center text-white font-bold">S</span>
              <span className="font-bold">Vendor Portal</span>
            </div>
            <div className="flex items-center gap-2">
              <NotificationsBell />
              <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Sign out"><LogOut className="h-4.5 w-4.5" /></Button>
            </div>
          </div>
        </header>
        <main className="flex-1 max-w-2xl mx-auto px-4 py-16 w-full">
          {(!profile || profile.status === 'PENDING') ? (
            <div className="rounded-2xl border bg-white p-10 text-center">
              <Hourglass className="h-12 w-12 text-amber-500 mx-auto" />
              <h1 className="mt-4 text-xl font-bold">Application under review</h1>
              <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                Thank you for registering{profile?.businessName ? ` as ${profile.businessName}` : ''}. Our team verifies vendor businesses before
                assignments or direct connections can be made. You will be notified once approved — usually within 1–2 business days.
              </p>
              {profile?.status === 'PENDING' && <Badge variant="outline" className="mt-4 bg-amber-50 text-amber-700 border-amber-200">PENDING</Badge>}
            </div>
          ) : (
            <div className="rounded-2xl border bg-white p-10 text-center">
              <XCircle className="h-12 w-12 text-red-400 mx-auto" />
              <h1 className="mt-4 text-xl font-bold">
                {profile.status === 'REJECTED' ? 'Application not approved' : 'Account suspended'}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                {profile.reviewNote || 'Please contact the platform team for details.'}
              </p>
            </div>
          )}
          {profile && profile.status === 'PENDING' && (
            <div className="mt-6">
              <ProfileEditor profile={profile} onSaved={() => setRefreshKey((k) => k + 1)} />
            </div>
          )}
        </main>
      </div>
    )
  }

  // ------- Approved vendor portal -------
  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <CompanyLogo name={profile.businessName || 'Vendor'} src={profile.logoUrl} className="h-9 w-9 rounded-xl" />
            {selectedRequestId ? (
              <Button variant="ghost" size="sm" className="gap-1 -ml-1" onClick={() => setSelectedRequestId(null)}>
                <ArrowLeft className="h-4 w-4" /> Engagements
              </Button>
            ) : (
              <div className="min-w-0">
                <p className="font-bold leading-tight">Vendor Portal</p>
                <p className="text-xs text-muted-foreground truncate">{profile.businessName} · <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">APPROVED</Badge></p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <NotificationsBell refreshKey={refreshKey} />
            <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Sign out"><LogOut className="h-4.5 w-4.5" /></Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full">
        {selectedRequestId ? (
          detail ? (
            <VendorProjectWorkspace request={detail} user={user} onChanged={() => setRefreshKey((k) => k + 1)} />
          ) : <Loading />
        ) : (
          <Tabs defaultValue="engagements">
            <div className="-mx-1 overflow-x-auto pb-1">
              <TabsList className="w-max max-w-none">
                <TabsTrigger value="engagements">Engagements ({activeEngagements.length})</TabsTrigger>
                <TabsTrigger value="projects">Assigned projects ({projects.length})</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
                <TabsTrigger value="history">History ({completed.length})</TabsTrigger>
                <TabsTrigger value="profile">Profile</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="engagements" className="mt-4">
              <HowProjectsStart />
              {activeEngagements.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-white p-12 text-center">
                  <Building2 className="h-12 w-12 text-stone-300 mx-auto" />
                  <h3 className="mt-4 font-semibold">No active engagements</h3>
                  <p className="text-sm text-muted-foreground mt-1">When the platform assigns you a managed project or authorizes a direct connection, it appears here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeEngagements.map((c) => (
                    <div key={c.id} className="rounded-2xl border bg-white p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-muted-foreground">{c.request?.requestCode}</span>
                            <Badge variant="outline" className="text-[10px]">{c.model === 'MANAGED' ? 'Managed project' : 'Direct connection'}</Badge>
                            <Badge variant="outline" className={`text-[10px] ${c.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-sky-50 text-sky-700 border-sky-200'}`}>{c.status}</Badge>
                          </div>
                          <h3 className="font-semibold">{c.request?.title}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5">Customer: {c.request?.customer?.company || c.request?.customer?.name} · authorized {c.authorizedAt ? formatDate(c.authorizedAt) : '—'}</p>
                          {c.model === 'DIRECT_CONNECTION' && (
                            <p className="text-xs text-stone-600 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 max-w-xl">
                              Direct connection: you contract directly with the customer. The platform&apos;s facilitation fee ({formatINR(c.connectionFee)}) is separate from your service price.
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1.5 max-w-xl">
                            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-600" /> {ENGAGEMENT_HINTS[c.status] || ''}
                          </p>
                        </div>
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setSelectedRequestId(c.requestId)}>
                          Open workspace
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="projects" className="mt-4">
              {projects.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">No assigned projects yet.</p>
              ) : (
                <div className="space-y-3">
                  {projects.map((r) => (
                    <button key={r.id} onClick={() => setSelectedRequestId(r.id)}
                      className="w-full text-left rounded-2xl border bg-white p-5 hover:border-emerald-300 transition-colors">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <span className="font-mono text-xs text-muted-foreground">{r.requestCode}</span>
                          <h3 className="font-semibold">{r.title}</h3>
                          <p className="text-xs text-muted-foreground">{EXECUTION_MODEL_LABELS[r.executionModel]}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline">{STATUS_LABELS[r.status]}</Badge>
                          <div className="mt-2 w-32"><ProgressBar value={r.progress} /></div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="payments" className="mt-4">
              <VendorPayments requestIds={payoutRequestIds} connections={connections} profile={profile} />
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              {completed.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">Completed engagements will appear here.</p>
              ) : (
                <div className="space-y-2">
                  {completed.map((c) => (
                    <div key={c.id} className="rounded-xl border bg-white px-5 py-3.5 flex items-center justify-between">
                      <div>
                        <span className="font-mono text-xs text-muted-foreground">{c.request?.requestCode}</span>
                        <p className="text-sm font-medium">{c.request?.title}</p>
                      </div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> completed {c.completedAt ? formatDate(c.completedAt) : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="profile" className="mt-4">
              <ProfileEditor profile={profile} onSaved={() => setRefreshKey((k) => k + 1)} />
            </TabsContent>
          </Tabs>
        )}
      </main>
      <AiAssistantWidget />
    </div>
  )
}

// ---------------- Project workspace (vendor view) ----------------
function VendorProjectWorkspace({ request: r, user, onChanged }: { request: ApiRequest; user: ApiUser; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const project = r.project
  // /api/requests/[id] returns all project tasks; the vendor acts on their own only
  const assignedTasks = (r.project?.tasks || []).filter((t) => t.assigneeId === user.id)

  async function submitForReview() {
    setBusy(true)
    try {
      await api(`/api/projects/${r.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'submit_for_review' }) })
      toast({ title: 'Work submitted for review' })
      onChanged()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Action failed' })
    } finally {
      setBusy(false)
    }
  }

  async function markMilestoneDone(milestoneId: string) {
    setBusy(true)
    try {
      await api(`/api/projects/${r.id}/milestones`, { method: 'PATCH', body: JSON.stringify({ id: milestoneId, status: 'DONE' }) })
      toast({ title: 'Milestone marked complete — pending platform verification' })
      onChanged()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Action failed' })
    } finally {
      setBusy(false)
    }
  }

  async function uploadFile(file: File, name: string) {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('name', name || file.name)
    fd.append('category', 'TECHNICAL')
    try {
      await api(`/api/requests/${r.id}/documents`, { method: 'POST', body: fd })
      toast({ title: 'File uploaded to the platform' })
      onChanged()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Upload failed' })
    }
  }

  return (
    <div>
      <div className="rounded-2xl border bg-white p-5 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="font-mono text-xs text-muted-foreground">{r.requestCode}</span>
            <h1 className="text-xl font-bold">{r.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{EXECUTION_MODEL_LABELS[r.executionModel]} · Customer: {r.customer?.company || r.customer?.name}</p>
          </div>
          <div className="text-right">
            <Badge variant="outline">{STATUS_LABELS[r.status]}</Badge>
            <div className="mt-2 w-40"><ProgressBar value={r.progress} /></div>
            <p className="text-[11px] text-muted-foreground mt-1">{r.progress}%</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-stone-700 whitespace-pre-wrap rounded-xl bg-stone-50 border p-4">{r.description}</p>
      </div>

      <Tabs defaultValue="requirements">
        <div className="-mx-1 overflow-x-auto pb-1">
          <TabsList className="w-max max-w-none">
            <TabsTrigger value="requirements">Requirements</TabsTrigger>
            <TabsTrigger value="milestones">Milestones</TabsTrigger>
            <TabsTrigger value="tasks">My tasks{assignedTasks.length ? ` (${assignedTasks.length})` : ''}</TabsTrigger>
            <TabsTrigger value="deliver">Submit work</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="requirements" className="space-y-4">
          <div className="rounded-2xl border bg-white p-5 space-y-3">
            <h3 className="font-semibold flex items-center gap-2"><ClipboardList className="h-4 w-4 text-emerald-600" /> Work specification</h3>
            {r.service && (
              <p className="text-sm text-muted-foreground">
                Service: <span className="font-medium text-foreground">{r.service.name}</span>
                {r.service.category?.name ? ` · ${r.service.category.name}` : ''}
              </p>
            )}
            {!r.service && r.customCategory && <p className="text-sm text-muted-foreground">Custom requirement — {r.customCategory}</p>}
            <p className="text-sm text-stone-700 whitespace-pre-wrap leading-relaxed">{r.description}</p>
            <dl className="text-sm space-y-2 pt-1">
              {r.expectedDeliverables && (<div className="flex gap-2"><dt className="text-muted-foreground shrink-0 w-36">Expected deliverables</dt><dd>{r.expectedDeliverables}</dd></div>)}
              {r.preferredTimeline && (<div className="flex gap-2"><dt className="text-muted-foreground shrink-0 w-36">Timeline</dt><dd className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{r.preferredTimeline}</dd></div>)}
              {r.projectLocation && (<div className="flex gap-2"><dt className="text-muted-foreground shrink-0 w-36">Location</dt><dd className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{r.projectLocation}</dd></div>)}
            </dl>
          </div>
          <IntakeAnswers request={r} />
          {(r.documents || []).filter((d) => d.category === 'REFERENCE').length > 0 && (
            <div className="rounded-2xl border bg-white p-5">
              <h3 className="font-semibold mb-2">Customer reference files</h3>
              <ul className="divide-y border rounded-xl">
                {(r.documents || []).filter((d) => d.category === 'REFERENCE').map((d) => (
                  <li key={d.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 min-w-0"><PackageCheck className="h-4 w-4 text-stone-400 shrink-0" /><span className="truncate">{d.name}</span><span className="text-xs text-muted-foreground shrink-0">{formatBytes(d.size)}</span></span>
                    <a href={`/api/documents/${d.id}/download`} className="text-emerald-700 hover:underline shrink-0"><Download className="h-4 w-4" /></a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>

        <TabsContent value="milestones">
          {!project || project.milestones.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center rounded-2xl border bg-white">
              Milestones are defined by the project manager.
            </p>
          ) : (
            <ol className="space-y-2">
              {project.milestones.map((m) => (
                <li key={m.id} className="rounded-2xl border bg-white p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{m.title} <Badge variant="outline" className="ml-1 text-[10px]">{m.weight}%</Badge></p>
                    {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
                    {m.dueDate && <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Clock className="h-3 w-3" /> due {formatDate(m.dueDate)}</p>}
                    <MilestonePayoutLine milestone={m} executionModel={r.executionModel} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={
                      m.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      m.status === 'DONE' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                      m.status === 'IN_PROGRESS' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''
                    }>
                      {MILESTONE_STATUS_LABELS[m.status]}
                    </Badge>
                    {m.status === 'IN_PROGRESS' || m.status === 'PENDING' ? (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => markMilestoneDone(m.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark complete
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>

        <TabsContent value="tasks">
          <VendorTasks request={r} userId={user.id} onChanged={onChanged} />
        </TabsContent>

        <TabsContent value="deliver">
          <div className="rounded-2xl border bg-white p-5 space-y-4">
            <div>
              <h3 className="font-semibold mb-1">Share work files</h3>
              <p className="text-xs text-muted-foreground">Upload progress files or final deliverables. The platform team reviews and forwards approved outputs to the customer.</p>
              <FileDrop onFile={(f) => uploadFile(f, f.name)} />
            </div>
            {(r.status === 'IN_PROGRESS' || r.status === 'REVISION_REQUIRED') && (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                <p className="text-sm text-emerald-900">Work ready? Submit the engagement for platform review.</p>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={submitForReview}>
                  <Send className="h-3.5 w-3.5 mr-1" /> Submit for review
                </Button>
              </div>
            )}
            {(r.documents || []).filter((d) => !d.isDeliverable).length > 0 && (
              <ul className="divide-y border rounded-xl">
                {(r.documents || []).filter((d) => !d.isDeliverable).map((d) => (
                  <li key={d.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 min-w-0"><PackageCheck className="h-4 w-4 text-stone-400 shrink-0" /><span className="truncate">{d.name}</span><span className="text-xs text-muted-foreground shrink-0">{formatBytes(d.size)}</span></span>
                    <a href={`/api/documents/${d.id}/download`} className="text-emerald-700 hover:underline shrink-0"><Download className="h-4 w-4" /></a>
                  </li>
                ))}
              </ul>
            )}
            {(r.documents || []).filter((d) => d.isDeliverable).length > 0 && (
              <div>
                <h3 className="font-semibold mb-1 text-sm">Approved deliverables (shared with the customer)</h3>
                <ul className="divide-y border rounded-xl">
                  {(r.documents || []).filter((d) => d.isDeliverable).map((d) => (
                    <li key={d.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 min-w-0"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /><span className="truncate">{d.name}</span><span className="text-xs text-muted-foreground shrink-0">{formatBytes(d.size)}</span></span>
                      <a href={`/api/documents/${d.id}/download`} className="text-emerald-700 hover:underline shrink-0"><Download className="h-4 w-4" /></a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="chat">
          <div className="rounded-2xl border bg-white p-4">
            <ChatPanel request={{ id: r.id, requestCode: r.requestCode }} user={user} />
            <p className="text-[11px] text-muted-foreground mt-2">
              Direct connections: chat with your customer contact. Internal platform notes are never visible here.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="activity">
          <div className="rounded-2xl border bg-white p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><History className="h-4 w-4 text-emerald-600" /> Request activity</h3>
            {(r.statusHistory || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No status updates yet.</p>
            ) : (
              <ol className="space-y-3">
                {(r.statusHistory || []).map((h) => (
                  <li key={h.id} className="flex gap-3 text-sm">
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium">{STATUS_LABELS[h.status] || h.status}{h.progress !== undefined ? ` · ${h.progress}%` : ''}</p>
                      {h.note && <p className="text-xs text-stone-600 mt-0.5">{h.note}</p>}
                      <p className="text-[11px] text-muted-foreground mt-0.5">{formatDateTime(h.createdAt)}{h.createdBy?.name ? ` · ${h.createdBy.name}` : ''}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function FileDrop({ onFile }: { onFile: (f: File) => void }) {
  const [file, setFile] = useState<File | null>(null)
  return (
    <div className="mt-2 flex flex-col sm:flex-row gap-2">
      <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)}
        accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt" className="flex-1" aria-label="Choose file" />
      <Button size="sm" disabled={!file} onClick={() => { if (file) { onFile(file); setFile(null) } }}>
        <Upload className="h-4 w-4 mr-1" /> Upload
      </Button>
    </div>
  )
}

// ---------------- Tasks assigned to the vendor ----------------
const TASK_STATUS_OPTIONS = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'] as const

function VendorTasks({ request: r, userId, onChanged }: { request: ApiRequest; userId: string; onChanged: () => void }) {
  const tasks = (r.project?.tasks || []).filter((t) => t.assigneeId === userId)
  const [busy, setBusy] = useState(false)

  async function setTaskStatus(t: ApiProjectTask, status: string) {
    setBusy(true)
    try {
      await api(`/api/projects/${r.id}/tasks`, { method: 'PATCH', body: JSON.stringify({ id: t.id, status }) })
      toast({ title: `Task moved to ${status.replace('_', ' ').toLowerCase()}` })
      onChanged()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Update failed' })
    } finally {
      setBusy(false)
    }
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-white p-10 text-center">
        <ClipboardList className="h-10 w-10 text-stone-300 mx-auto" />
        <h3 className="mt-3 font-semibold">No tasks assigned to you yet</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">The project manager assigns execution tasks here — you will also get a notification each time one is added.</p>
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {tasks.map((t) => (
        <li key={t.id} className="rounded-2xl border bg-white p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={`text-sm font-medium ${t.status === 'DONE' ? 'line-through text-muted-foreground' : ''}`}>{t.title}</p>
            {t.detail && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{t.detail}</p>}
            {t.dueDate && <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Clock className="h-3 w-3" /> due {formatDate(t.dueDate)}</p>}
          </div>
          <select value={t.status} disabled={busy} onChange={(e) => setTaskStatus(t, e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs" aria-label={`Status for ${t.title}`}>
            {TASK_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </li>
      ))}
    </ul>
  )
}

// ---------------- Requirement intake answers (label + value) ----------------
function IntakeAnswers({ request: r }: { request: ApiRequest }) {
  const rows = useMemo(() => {
    let responses: import('@/lib/forms').FormResponses = {}
    try { responses = JSON.parse(r.formResponses || '{}') as import('@/lib/forms').FormResponses } catch { /* ignore */ }
    const entries = Object.entries(responses).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    const fields = r.service?.formConfig ? parseFormConfig(String(r.service.formConfig)).fields : []
    if (fields.length === 0) {
      return entries.map(([k, v]) => ({ label: k, value: Array.isArray(v) ? v.join(', ') : String(v) }))
    }
    return fields
      .filter((f) => isFieldVisible(f, responses))
      .map((f) => {
        const v = responses[f.id]
        if (v === undefined || v === null || String(v).trim() === '') return null
        return { label: f.label, value: Array.isArray(v) ? v.join(', ') : String(v) }
      })
      .filter((x): x is { label: string; value: string } => !!x)
  }, [r.formResponses, r.service?.formConfig])

  if (rows.length === 0) return null
  return (
    <div className="rounded-2xl border bg-white p-5">
      <h3 className="font-semibold mb-3">Intake answers</h3>
      <dl className="text-sm space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground min-w-40 shrink-0">{row.label}</dt>
            <dd className="text-stone-800 break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

// ---------------- Profile editor (company card + business details + payout details) ----------------
function ProfileEditor({ profile, onSaved }: { profile: NonNullable<ApiUser['vendorProfile']>; onSaved: () => void }) {
  const parse = (s?: string) => { try { return JSON.parse(s || '[]') as string[] } catch { return [] } }
  const [form, setForm] = useState({
    businessName: profile.businessName || '',
    contactPerson: profile.contactPerson || '',
    phone: profile.phone || '',
    website: profile.website || '',
    description: profile.description || '',
    expertise: parse(profile.expertise).join(', '),
    serviceLocations: parse(profile.serviceLocations).join(', '),
    gstin: profile.gstin || '',
    address: profile.address || '',
    city: profile.city || '',
    state: profile.state || '',
    logoUrl: profile.logoUrl || '',
    payoutMode: profile.payoutMode || '',
    payoutAccountName: profile.payoutAccountName || '',
    payoutAccountNumber: profile.payoutAccountNumber || '',
    payoutIfsc: profile.payoutIfsc || '',
    payoutUpiId: profile.payoutUpiId || '',
  })
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await api('/api/vendors', { method: 'PATCH', body: JSON.stringify(form) })
      toast({ title: 'Profile updated' })
      onSaved()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to save' })
    } finally {
      setBusy(false)
    }
  }

  const labelCls = 'text-xs font-medium text-muted-foreground'
  const inputCls = 'mt-1'

  return (
    <div className="space-y-4">
      {/* Company card — how your business appears across the platform */}
      <div className="rounded-2xl border bg-white p-5">
        <h3 className="font-semibold mb-4">Company profile</h3>
        <div className="flex flex-wrap items-start gap-4">
          <CompanyLogo name={profile.businessName || 'Vendor'} src={profile.logoUrl} className="h-16 w-16 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold text-lg leading-tight">{profile.businessName}</p>
              <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
                <BadgeCheck className="h-3 w-3" /> {profile.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {profile.contactPerson && <span>Contact: {profile.contactPerson}</span>}
              {profile.phone && <span>· {profile.phone}</span>}
              {profile.website && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{profile.website}</span>}
              {(profile.city || profile.state) && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{[profile.city, profile.state].filter(Boolean).join(', ')}</span>}
            </p>
            {profile.description && <p className="text-sm text-stone-600 mt-2 whitespace-pre-wrap">{profile.description}</p>}
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {parse(profile.expertise).map((x) => <Badge key={x} variant="outline" className="text-[10px]">{x}</Badge>)}
              {parse(profile.serviceLocations).map((x) => <Badge key={x} variant="outline" className="text-[10px] bg-stone-50">{x}</Badge>)}
            </div>
          </div>
          <div className="text-right shrink-0">
            {typeof profile.rating === 'number' && profile.rating > 0 && (
              <p className="text-sm flex items-center justify-end gap-1 text-amber-600"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {profile.rating}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">{profile.completedProjects ?? 0} projects completed</p>
            {profile.approvedAt && <p className="text-[11px] text-muted-foreground mt-0.5">Partner since {formatDate(profile.approvedAt)}</p>}
          </div>
        </div>
      </div>

      {/* Editable business details */}
      <div className="rounded-2xl border bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Business details</h3>
          <p className="text-[11px] text-muted-foreground">Shown to the platform team and on your vendor profile</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className={labelCls}>Business name</label>
            <Input className={inputCls} value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} /></div>
          <div><label className={labelCls}>Logo URL (image path or URL)</label>
            <Input className={inputCls} value={form.logoUrl} placeholder="/logos/companies/your-logo.png" onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} /></div>
          <div><label className={labelCls}>Contact person</label>
            <Input className={inputCls} value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} placeholder={profile.businessName ? undefined : 'Name'} /></div>
          <div><label className={labelCls}>Phone</label>
            <Input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className={labelCls}>Website</label>
            <Input className={inputCls} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
          <div><label className={labelCls}>GSTIN</label>
            <Input className={inputCls} value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} placeholder="22AAAAA0000A1Z5" /></div>
          <div className="sm:col-span-2"><label className={labelCls}>Registered business address</label>
            <Input className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street / area" /></div>
          <div><label className={labelCls}>City</label>
            <Input className={inputCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          <div><label className={labelCls}>State</label>
            <Input className={inputCls} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
          <div><label className={labelCls}>Expertise (comma-separated)</label>
            <Input className={inputCls} value={form.expertise} onChange={(e) => setForm({ ...form, expertise: e.target.value })} /></div>
          <div><label className={labelCls}>Service locations (comma-separated)</label>
            <Input className={inputCls} value={form.serviceLocations} onChange={(e) => setForm({ ...form, serviceLocations: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className={labelCls}>About your business</label>
            <Textarea className={inputCls} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
      </div>

      {/* Payout details — how the platform pays you */}
      <div className="rounded-2xl border bg-white p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold flex items-center gap-2"><Wallet className="h-4 w-4 text-emerald-600" /> Payout details</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Where the platform sends your milestone payouts. Used only by the platform team — never shared with customers.
          You will get a notification each time a payout is released.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={labelCls}>Payout mode</label>
            <div className="mt-1.5 flex gap-2">
              {[
                { v: '', label: 'Not set', icon: Info },
                { v: 'BANK', label: 'Bank transfer (NEFT/IMPS)', icon: Landmark },
                { v: 'UPI', label: 'UPI', icon: Smartphone },
              ].map(({ v, label, icon: Icon }) => (
                <button key={v || 'none'} type="button" onClick={() => setForm({ ...form, payoutMode: v })}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs transition-colors ${form.payoutMode === v ? 'border-emerald-600 bg-emerald-50 text-emerald-800 font-medium' : 'bg-white text-stone-600 hover:border-stone-300'}`}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>
          {form.payoutMode === 'BANK' && (
            <>
              <div><label className={labelCls}>Account holder name</label>
                <Input className={inputCls} value={form.payoutAccountName} onChange={(e) => setForm({ ...form, payoutAccountName: e.target.value })} /></div>
              <div><label className={labelCls}>Account number</label>
                <Input className={inputCls} value={form.payoutAccountNumber} onChange={(e) => setForm({ ...form, payoutAccountNumber: e.target.value.replace(/[^0-9]/g, '') })} placeholder="6-20 digits" /></div>
              <div><label className={labelCls}>IFSC code</label>
                <Input className={inputCls} value={form.payoutIfsc} onChange={(e) => setForm({ ...form, payoutIfsc: e.target.value.toUpperCase() })} placeholder="HDFC0001234" /></div>
            </>
          )}
          {form.payoutMode === 'UPI' && (
            <div><label className={labelCls}>UPI ID</label>
              <Input className={inputCls} value={form.payoutUpiId} onChange={(e) => setForm({ ...form, payoutUpiId: e.target.value })} placeholder="yourname@bank" /></div>
          )}
          {form.payoutMode === '' && (
            <p className="sm:col-span-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              No payout mode set yet — the platform team will ask for this before releasing your first payout.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={save}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />} Save all changes
        </Button>
        <p className="text-[11px] text-muted-foreground flex items-center gap-3">
          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {parse(profile.serviceLocations).join(', ') || 'No locations set'}</span>
          {profile.website && <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> {profile.website}</span>}
        </p>
      </div>
    </div>
  )
}

// ---------------- How projects start (engagement lifecycle explainer) ----------------
const ENGAGEMENT_HINTS: Record<string, string> = {
  PROPOSED: 'Proposed by the platform team — our coordinator will confirm scope and commercials with you before anything goes live.',
  AUTHORIZED: 'You are connected. The customer is finalizing the quotation — your workspace unlocks as soon as the project is created.',
  ACTIVE: 'Project running. Open the workspace to see the full requirement spec, milestones and your tasks.',
  COMPLETED: 'Work accepted by the platform. Check the Payments tab for the payout status of each milestone.',
  CANCELLED: 'This engagement was cancelled. Reach out to your platform contact if this looks wrong.',
}

function HowProjectsStart() {
  const steps = [
    { icon: BadgeCheck, title: 'Get approved', text: 'Your business is verified by the platform team (usually 1–2 business days).' },
    { icon: ClipboardList, title: 'Get matched', text: 'When a customer request fits your expertise, the platform assigns you — you get a notification and it appears under Engagements.' },
    { icon: IndianRupee, title: 'Project starts', text: 'The customer accepts the quotation, the project is created, and your workspace opens with the full requirement spec.' },
    { icon: Wallet, title: 'Deliver & get paid', text: 'Complete milestones, submit work, and receive your payout per verified milestone.' },
  ]
  return (
    <div className="rounded-2xl border bg-gradient-to-br from-emerald-50/60 to-teal-50/40 p-5 mb-4">
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Info className="h-4 w-4 text-emerald-600" /> How projects reach you</h3>
      <div className="grid sm:grid-cols-4 gap-3">
        {steps.map((s, i) => (
          <div key={s.title} className="rounded-xl bg-white/80 border p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <s.icon className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-[10px] font-bold text-emerald-700">STEP {i + 1}</span>
            </div>
            <p className="text-xs font-semibold">{s.title}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{s.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------- Milestone payout line (vendor workspace) ----------------
function MilestonePayoutLine({ milestone: m, executionModel }: { milestone: ApiMilestone; executionModel: string }) {
  if (executionModel === 'DIRECT_CONNECTION') {
    return m.amount ? (
      <p className="text-[11px] text-stone-600 mt-1.5 flex items-center gap-1">
        <IndianRupee className="h-3 w-3" /> Your billing: {formatINR(m.amount)} — collect directly from the customer
      </p>
    ) : null
  }
  return (
    <p className="text-[11px] mt-1.5 flex flex-wrap items-center gap-1.5">
      <Wallet className="h-3 w-3 text-emerald-600" />
      {m.vendorPayoutAmount != null ? (
        <>
          <span className="text-stone-700">Payout: <span className="font-semibold">{formatINR(m.vendorPayoutAmount)}</span></span>
          {m.payoutStatus === 'RELEASED' ? (
            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Released{m.payoutReleasedAt ? ` · ${formatDate(m.payoutReleasedAt)}` : ''}</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">{m.status === 'APPROVED' || m.status === 'DONE' ? 'Awaiting release' : 'On milestone approval'}</Badge>
          )}
        </>
      ) : (
        <span className="text-muted-foreground">Payout: to be confirmed by the platform team</span>
      )}
    </p>
  )
}

// ---------------- Vendor payments view (payouts per engagement) ----------------
interface PayoutDetail {
  id: string
  requestCode: string
  title: string
  executionModel: string
  status: string
  milestones: ApiMilestone[]
}

function VendorPayments({ requestIds, connections, profile }: {
  requestIds: string[]
  connections: ApiVendorConnection[]
  profile: NonNullable<ApiUser['vendorProfile']>
}) {
  const [details, setDetails] = useState<PayoutDetail[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const results = await Promise.all(requestIds.map((id) =>
          api<{ request: PayoutDetail & { project?: { milestones?: ApiMilestone[] } | null } }>(`/api/requests/${id}`)
            .then((d) => ({
              id: d.request.id,
              requestCode: d.request.requestCode,
              title: d.request.title,
              executionModel: d.request.executionModel,
              status: d.request.status,
              milestones: d.request.project?.milestones || [],
            }))
            .catch(() => null),
        ))
        if (!cancelled) setDetails(results.filter((x): x is PayoutDetail => !!x))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [requestIds.join('|')])

  const payoutModeLabel = profile.payoutMode === 'UPI'
    ? `UPI · ${profile.payoutUpiId || 'ID not set yet'}`
    : profile.payoutMode === 'BANK'
      ? `Bank · a/c ${profile.payoutAccountNumber ? '••••' + profile.payoutAccountNumber.slice(-4) : 'not set yet'}`
      : 'Not set yet — add it in Profile'

  return (
    <div className="space-y-4">
      {/* How vendor payments work */}
      <div className="rounded-2xl border bg-white p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Wallet className="h-4 w-4 text-emerald-600" /> How you get paid</h3>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border p-4">
            <p className="font-medium text-xs text-emerald-700 mb-1">MANAGED PROJECTS</p>
            <p className="text-xs text-stone-600 leading-relaxed">
              The platform collects payment from the customer. For every milestone you complete, the platform team verifies it,
              sets your payout, and releases it to your registered bank/UPI. You get a notification on every release.
            </p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="font-medium text-xs text-amber-700 mb-1">DIRECT CONNECTIONS</p>
            <p className="text-xs text-stone-600 leading-relaxed">
              You contract directly with the customer — you invoice and collect from them on the agreed milestones.
              The platform&apos;s one-time connection fee is separate and does not touch your service price.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Landmark className="h-3.5 w-3.5" /> Payout destination: <span className="font-medium text-stone-700">{payoutModeLabel}</span>
          <span className="text-stone-300">|</span>
          <span>Update anytime in Profile → Payout details</span>
        </div>
      </div>

      {/* Per-engagement payout tables */}
      {loading ? (
        <Loading />
      ) : details.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white p-12 text-center">
          <Wallet className="h-12 w-12 text-stone-300 mx-auto" />
          <h3 className="mt-4 font-semibold">No payouts yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Once you are engaged on a project, milestone payouts appear here.</p>
        </div>
      ) : (
        details.map((d) => {
          const managed = d.executionModel !== 'DIRECT_CONNECTION'
          const rows = d.milestones.map((m) => ({
            id: m.id,
            title: m.title,
            status: m.status,
            amount: managed ? m.vendorPayoutAmount : (m.amount ?? 0),
            payoutStatus: m.payoutStatus,
            releasedAt: m.payoutReleasedAt,
            note: m.payoutNote,
            tbc: managed && m.vendorPayoutAmount == null,
          }))
          const known = rows.filter((r) => !r.tbc)
          const total = known.reduce((s, r) => s + (r.amount || 0), 0)
          const released = known.filter((r) => r.payoutStatus === 'RELEASED').reduce((s, r) => s + (r.amount || 0), 0)
          const pending = total - released
          const tbcCount = rows.length - known.length
          const conn = connections.find((c) => c.requestId === d.id)

          return (
            <div key={d.id} className="rounded-2xl border bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-xs text-muted-foreground">{d.requestCode}</span>
                    <Badge variant="outline" className="text-[10px]">{managed ? 'Managed project' : 'Direct connection'}</Badge>
                  </div>
                  <h3 className="font-semibold">{d.title}</h3>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-lg bg-stone-50 border px-2.5 py-1">Total <b>{formatINR(total)}</b>{tbcCount > 0 ? ` + ${tbcCount} TBC` : ''}</span>
                  {managed ? (
                    <>
                      <span className="rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-emerald-700">Released <b>{formatINR(released)}</b></span>
                      <span className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1 text-amber-700">Pending <b>{formatINR(pending)}</b></span>
                    </>
                  ) : (
                    <span className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1 text-amber-700">Collect directly from customer</span>
                  )}
                </div>
              </div>
              {rows.length === 0 ? (
                <p className="text-xs text-muted-foreground">Milestones are defined by the project manager once the project starts.</p>
              ) : (
                <ul className="divide-y border rounded-xl text-sm">
                  {rows.map((r) => (
                    <li key={r.id} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{r.title}</p>
                        {r.note && r.payoutStatus === 'RELEASED' && <p className="text-[11px] text-muted-foreground">Ref: {r.note}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-[10px]">{MILESTONE_STATUS_LABELS[r.status]}</Badge>
                        <span className="font-semibold text-sm min-w-20 text-right">{r.tbc ? 'TBC' : formatINR(r.amount || 0)}</span>
                        {managed && !r.tbc && (
                          r.payoutStatus === 'RELEASED' ? (
                            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                              <CheckCircle2 className="h-3 w-3 mr-0.5" /> Released{r.releasedAt ? ` ${formatDate(r.releasedAt)}` : ''}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">Pending</Badge>
                          )
                        )}
                        {!managed && conn && (
                          <span className="text-[10px] text-muted-foreground">platform fee {formatINR(conn.connectionFee)} (separate)</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

function Loading() {
  return <div className="py-20 flex justify-center"><div className="h-8 w-8 rounded-full border-3 border-emerald-200 border-t-emerald-600 animate-spin" /></div>
}
