'use client'

// Staff project panel — milestones CRUD (weighted), tasks, project status & vendor.
// Authorized: SUPER_ADMIN, ADMIN, OPS_MANAGER, PROJECT_MANAGER (+ employees for tasks).

import { useEffect, useState } from 'react'
import { toast } from '@/hooks/use-toast'
import { api, ApiRequest, ApiUser, ApiMilestone, ApiProjectTask } from '@/lib/client'
import { MILESTONE_STATUS_LABELS, ROLE_LABELS, formatINR, formatDate } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CompanyLogo } from '@/components/shared'
import { CheckCircle2, Plus, Trash2, Loader2, Wallet, RotateCcw } from 'lucide-react'

export default function StaffProjectPanel({ request: r, user, onChanged }: {
  request: ApiRequest
  user: ApiUser
  onChanged: () => void
}) {
  const project = r.project
  const [editorOpen, setEditorOpen] = useState(false)
  const [editMilestone, setEditMilestone] = useState<ApiMilestone | null>(null)
  const [payoutTarget, setPayoutTarget] = useState<ApiMilestone | null>(null)
  const [busy, setBusy] = useState(false)
  const isEmployee = user.role === 'EMPLOYEE'
  const hasVendor = !!(project?.vendorId || r.vendorId)

  async function setMilestoneStatus(m: ApiMilestone, status: string) {
    setBusy(true)
    try {
      await api(`/api/projects/${r.id}/milestones`, { method: 'PATCH', body: JSON.stringify({ id: m.id, status }) })
      toast({ title: `Milestone "${m.title}" → ${MILESTONE_STATUS_LABELS[status]}` })
      onChanged()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Update failed' })
    } finally {
      setBusy(false)
    }
  }

  async function deleteMilestone(m: ApiMilestone) {
    setBusy(true)
    try {
      await api(`/api/projects/${r.id}/milestones?id=${m.id}`, { method: 'DELETE' })
      toast({ title: 'Milestone removed' })
      onChanged()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Delete failed' })
    } finally {
      setBusy(false)
    }
  }

  if (!project) {
    return (
      <div className="rounded-2xl border border-dashed bg-white p-10 text-center">
        <p className="text-sm text-muted-foreground">
          No project workspace yet — it is created automatically when the customer accepts a quotation.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Milestones</h3>
            <Badge variant="outline">{project.milestones.length}</Badge>
            {project.vendor && <Badge variant="outline" className="bg-stone-50"><CompanyLogo name={project.vendor.vendorProfile?.businessName || project.vendor.name} src={project.vendor.vendorProfile?.logoUrl} className="h-3.5 w-3.5 rounded mr-1" />Vendor: {project.vendor.vendorProfile?.businessName || project.vendor.name}</Badge>}
          </div>
          {!isEmployee && (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1" onClick={() => { setEditMilestone(null); setEditorOpen(true) }}>
              <Plus className="h-3.5 w-3.5" /> Add milestone
            </Button>
          )}
        </div>
        <div className="mt-3 h-2.5 rounded-full bg-emerald-100 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all" style={{ width: `${project.progressPct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">{project.progressPct}% weighted completion</p>

        {project.milestones.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-4">No milestones yet. Add the delivery milestones from the accepted quotation&apos;s timeline.</p>
        ) : (
          <ol className="mt-4 divide-y border rounded-xl">
            {project.milestones.map((m, i) => (
              <li key={m.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
                <span className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${m.status === 'APPROVED' || m.status === 'DONE' ? 'bg-emerald-100 text-emerald-700' : m.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-500'}`}>
                  {m.status === 'APPROVED' || m.status === 'DONE' ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{m.title} <Badge variant="outline" className="ml-1 text-[10px]">{m.weight}%</Badge>{(m.amount ?? 0) > 0 && <Badge variant="outline" className="ml-1 text-[10px]">Billing {formatINR(m.amount!)}</Badge>}
                    {m.vendorPayoutAmount != null && (
                      <Badge variant="outline" className={`ml-1 text-[10px] ${m.payoutStatus === 'RELEASED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-sky-50 text-sky-700 border-sky-200'}`}>
                        <Wallet className="h-3 w-3 mr-0.5" /> Payout {formatINR(m.vendorPayoutAmount)}{m.payoutStatus === 'RELEASED' ? ' · released' : ''}
                      </Badge>
                    )}
                  </p>
                  {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {!isEmployee && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setPayoutTarget(m)}>
                      <Wallet className="h-3 w-3" /> {m.vendorPayoutAmount != null ? 'Payout' : 'Set payout'}
                    </Button>
                  )}
                  {!isEmployee && m.status === 'PENDING' && <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => setMilestoneStatus(m, 'IN_PROGRESS')}>Start</Button>}
                  {(m.status === 'IN_PROGRESS' || m.status === 'DONE') && !isEmployee && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={busy} onClick={() => setMilestoneStatus(m, 'APPROVED')}>
                      <CheckCircle2 className="h-3 w-3" /> Approve
                    </Button>
                  )}
                  {!isEmployee && (
                    <>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditMilestone(m); setEditorOpen(true) }}>Edit</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500 hover:text-red-600" disabled={busy} onClick={() => deleteMilestone(m)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                  <Badge variant="outline" className="text-[10px]">{MILESTONE_STATUS_LABELS[m.status]}</Badge>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Tasks */}
      <ProjectTasks request={r} user={user} onChanged={onChanged} />

      {editorOpen && (
        <MilestoneEditor
          requestId={r.id}
          existing={editMilestone}
          onClose={() => { setEditorOpen(false); setEditMilestone(null) }}
          onSaved={() => { setEditorOpen(false); setEditMilestone(null); onChanged() }}
        />
      )}
      {payoutTarget && (
        <PayoutEditor
          requestId={r.id}
          milestone={payoutTarget}
          hasVendor={hasVendor}
          onClose={() => setPayoutTarget(null)}
          onSaved={() => { setPayoutTarget(null); onChanged() }}
        />
      )}
    </div>
  )
}

function ProjectTasks({ request: r, user, onChanged }: { request: ApiRequest; user: ApiUser; onChanged: () => void }) {
  const tasks = r.project?.tasks || []
  const [busy, setBusy] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  async function updateTask(t: ApiProjectTask, patch: Record<string, unknown>) {
    setBusy(true)
    try {
      await api(`/api/projects/${r.id}/tasks`, { method: 'PATCH', body: JSON.stringify({ id: t.id, ...patch }) })
      onChanged()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Update failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Internal tasks</h3>
        <Button size="sm" variant="outline" className="gap-1" onClick={() => setAddOpen(true)}><Plus className="h-3.5 w-3.5" /> Add task</Button>
      </div>
      {tasks.length === 0 ? <p className="text-sm text-muted-foreground">No tasks yet.</p> : (
        <ul className="divide-y border rounded-xl">
          {tasks.map((t) => (
            <li key={t.id} className="px-4 py-2.5 flex flex-wrap items-center gap-2">
              <select value={t.status} disabled={busy} onChange={(e) => updateTask(t, { status: e.target.value })}
                className="h-7 rounded-md border border-input bg-background px-1.5 text-xs" aria-label={`Status for ${t.title}`}>
                {['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
              <span className={`text-sm min-w-0 flex-1 truncate ${t.status === 'DONE' ? 'line-through text-muted-foreground' : ''}`}>{t.title}</span>
              <span className="text-xs text-muted-foreground shrink-0">{t.assignee?.name || 'Unassigned'}{t.dueDate ? ` · due ${formatDate(t.dueDate)}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
      {addOpen && (
        <TaskEditor requestId={r.id} request={r} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); onChanged() }} />
      )}
    </div>
  )
}

function TaskEditor({ requestId, request, onClose, onSaved }: { requestId: string; request: ApiRequest; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ title: '', assigneeId: '', dueDate: '' })
  const [busy, setBusy] = useState(false)
  const vendorOption = request.project?.vendor || request.vendor || null

  async function save() {
    if (!form.title.trim()) return
    setBusy(true)
    try {
      await api(`/api/projects/${requestId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ title: form.title.trim(), assigneeId: form.assigneeId || undefined, dueDate: form.dueDate || undefined }),
      })
      toast({ title: 'Task added' })
      onSaved()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to add task' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add task</DialogTitle>
          <DialogDescription>Assign execution work to a staff member or to the connected vendor.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input className="mt-1.5" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><Label>Assignee</Label><div className="mt-1.5">
            <TaskAssigneeSelect value={form.assigneeId} onChange={(v) => setForm({ ...form, assigneeId: v === 'none' ? '' : v })} vendorOption={vendorOption} />
          </div></div>
          <div><Label>Due date</Label><Input type="date" className="mt-1.5" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy || !form.title.trim()} onClick={save}>Add task</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Staff list + the connected vendor as an assignable option
function TaskAssigneeSelect({ value, onChange, vendorOption }: {
  value: string
  onChange: (v: string) => void
  vendorOption: { id: string; name: string; vendorProfile?: { businessName?: string; logoUrl?: string } | null } | null
}) {
  const [staff, setStaff] = useState<{ id: string; name: string; role: string }[]>([])
  useEffect(() => {
    api<{ team: { id: string; name: string; role: string }[] }>('/api/admin/team')
      .then((d) => setStaff(d.team))
      .catch(() => {})
  }, [])
  return (
    <Select value={value || 'none'} onValueChange={onChange}>
      <SelectTrigger aria-label="Assign task to"><SelectValue placeholder="Unassigned" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Unassigned</SelectItem>
        {vendorOption && (
          <SelectItem value={vendorOption.id}>
            <span className="flex items-center gap-2">
              <CompanyLogo name={vendorOption.vendorProfile?.businessName || vendorOption.name} src={vendorOption.vendorProfile?.logoUrl} className="h-4 w-4 rounded" />
              Vendor — {vendorOption.vendorProfile?.businessName || vendorOption.name}
            </span>
          </SelectItem>
        )}
        {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} — {ROLE_LABELS[s.role] || s.role}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function MilestoneEditor({ requestId, existing, onClose, onSaved }: {
  requestId: string
  existing: ApiMilestone | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    title: existing?.title || '',
    description: existing?.description || '',
    weight: existing?.weight ?? 20,
    amount: existing?.amount ?? 0,
    vendorPayoutAmount: existing?.vendorPayoutAmount ?? '',
    dueDate: existing?.dueDate ? new Date(existing.dueDate).toISOString().slice(0, 10) : '',
  })
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!form.title.trim()) return
    setBusy(true)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description,
        weight: form.weight,
        amount: form.amount,
        dueDate: form.dueDate || null,
        // ''/null clears the payout (back to "to be confirmed")
        vendorPayoutAmount: form.vendorPayoutAmount === '' ? null : Number(form.vendorPayoutAmount),
      }
      if (existing) {
        await api(`/api/projects/${requestId}/milestones`, { method: 'PATCH', body: JSON.stringify({ id: existing.id, ...payload }) })
        toast({ title: 'Milestone updated' })
      } else {
        await api(`/api/projects/${requestId}/milestones`, { method: 'POST', body: JSON.stringify(payload) })
        toast({ title: 'Milestone added' })
      }
      onSaved()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to save milestone' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit milestone' : 'Add milestone'}</DialogTitle>
          <DialogDescription>Weights drive the overall progress percentage. Aim for all milestones to total ~100%.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input className="mt-1.5" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Design approval" /></div>
          <div><Label>Description</Label><Input className="mt-1.5" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Weight %</Label><Input type="number" min="0" max="100" className="mt-1.5" value={form.weight} onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })} /></div>
            <div><Label>Billing amount</Label><Input type="number" min="0" className="mt-1.5" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
            <div><Label>Due date</Label><Input type="date" className="mt-1.5" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
          </div>
          <div>
            <Label>Vendor payout amount (optional)</Label>
            <Input type="number" min="0" className="mt-1.5" value={form.vendorPayoutAmount === null ? '' : form.vendorPayoutAmount}
              onChange={(e) => setForm({ ...form, vendorPayoutAmount: e.target.value === '' ? '' : Number(e.target.value) })}
              placeholder="What the vendor earns on this milestone (managed projects)" />
            <p className="text-[11px] text-muted-foreground mt-1">Shown to the vendor as their payout; customers never see this. Leave empty to confirm later via the Payout button.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy || !form.title.trim()} onClick={save}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Vendor payout dialog — set/adjust the payout amount and release or revert it.
// The vendor is notified on every release/revert.
function PayoutEditor({ requestId, milestone, hasVendor, onClose, onSaved }: {
  requestId: string
  milestone: ApiMilestone
  hasVendor: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [amount, setAmount] = useState<string>(milestone.vendorPayoutAmount != null ? String(milestone.vendorPayoutAmount) : '')
  const [note, setNote] = useState(milestone.payoutNote || '')
  const [busy, setBusy] = useState(false)

  async function patch(body: Record<string, unknown>, msg: string) {
    setBusy(true)
    try {
      await api(`/api/projects/${requestId}/milestones`, { method: 'PATCH', body: JSON.stringify({ id: milestone.id, ...body }) })
      toast({ title: msg })
      onSaved()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Update failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wallet className="h-4 w-4 text-emerald-600" /> Vendor payout — {milestone.title}</DialogTitle>
          <DialogDescription>
            {hasVendor ? 'Set what the vendor earns on this milestone and release it once the work is verified. The vendor is notified automatically.' : 'No vendor is connected to this project yet — payouts apply to vendor-executed work.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Payout amount (₹)</Label>
            <Input type="number" min="0" className="mt-1.5" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 12000" />
          </div>
          <div>
            <Label>Payment reference / note</Label>
            <Textarea rows={2} className="mt-1.5" value={note} onChange={(e) => setNote(e.target.value)} placeholder="NEFT UTR, UPI reference, or an internal remark" />
          </div>
          {milestone.payoutStatus === 'RELEASED' && (
            <p className="text-xs rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2">
              Released{milestone.payoutReleasedAt ? ` on ${formatDate(milestone.payoutReleasedAt)}` : ''}{milestone.payoutNote ? ` · Ref: ${milestone.payoutNote}` : ''}
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {milestone.payoutStatus === 'RELEASED' && (
            <Button variant="outline" className="text-amber-700 border-amber-300" disabled={busy}
              onClick={() => patch({ payoutStatus: 'PENDING', payoutNote: note }, 'Payout reverted to pending — vendor notified')}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Revert to pending
            </Button>
          )}
          <Button variant="outline" disabled={busy} onClick={() => patch({ vendorPayoutAmount: amount === '' ? null : Number(amount), payoutNote: note }, 'Payout amount saved')}>
            Save amount
          </Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy || amount === ''}
            onClick={() => patch({ vendorPayoutAmount: Number(amount), payoutNote: note, payoutStatus: 'RELEASED' }, 'Payout released — vendor notified')}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Release payout
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
