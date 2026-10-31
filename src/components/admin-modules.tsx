'use client'

// Admin modules: Catalog (categories + services + no-code editors), Customers,
// Vendors, Employees, Payments & Invoices, Reports, CMS, Settings, Audit log.

import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/hooks/use-toast'
import { api, ApiRequest, ApiUser } from '@/lib/client'
import {
  EXECUTION_MODELS, ROLE_LABELS, PAYMENT_TYPE_LABELS, DOCUMENT_CATEGORIES, ROLES,
  formatINR, formatDate, formatDateTime, isAdminRole, canManageProjects,
} from '@/lib/constants'
import { parseFormConfig, stringifyFormConfig, parseDocRequirements, stringifyDocRequirements, FormField, FORM_FIELD_TYPES } from '@/lib/forms'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { StatusBadge, CompanyLogo } from '@/components/shared'
import { CenteredSpinner, VendorSelect } from '@/components/admin-dashboard'
import {
  Plus, Search, CheckCircle2, XCircle, Loader2, Download, Trash2, Pencil,
  Ban, ExternalLink, Layers, Wallet,
} from 'lucide-react'

interface Props {
  tab: string
  user: ApiUser
  onChanged: () => void
  onOpenRequest: (id: string) => void
}

export default function AdminModules({ tab, user, onChanged, onOpenRequest }: Props) {
  if (tab === 'catalog') return <CatalogTab user={user} onChanged={onChanged} />
  if (tab === 'customers') return <CustomersTab onOpenRequest={onOpenRequest} />
  if (tab === 'vendors') return <VendorsTab user={user} onChanged={onChanged} />
  if (tab === 'team') return <TeamTab user={user} onChanged={onChanged} />
  if (tab === 'payments') return <PaymentsTab />
  if (tab === 'reports') return <ReportsTab />
  if (tab === 'cms') return <CmsTab />
  if (tab === 'settings') return <SettingsTab />
  if (tab === 'activity') return <ActivityTab />
  if (tab === 'quotations') return <QuotationsTab onOpenRequest={onOpenRequest} />
  return <p className="text-muted-foreground">Unknown module.</p>
}

// ================= CATALOG =================
interface ApiCategoryRow { id: string; code: string; slug: string; name: string; description: string; icon: string; featured: boolean; active: boolean; _count?: { services: number } }

function CatalogTab({ user, onChanged }: { user: ApiUser; onChanged: () => void }) {
  const [categories, setCategories] = useState<ApiCategoryRow[]>([])
  const [services, setServices] = useState<{ id: string; name: string; slug: string; executionType: string; status: string; active: boolean; featured: boolean; timeline: string; categoryId: string; categoryName?: string; _count?: { requests: number } }[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<{ id?: string } | null>(null)
  const [catEditor, setCatEditor] = useState(false)
  const admin = isAdminRole(user.role)

  const load = useCallback(async () => {
    try {
      const [svc, cat] = await Promise.all([
        api<{ services: typeof services }>('/api/services'),
        api<{ categories: ApiCategoryRow[] }>('/api/admin/catalog/categories'),
      ])
      setServices(svc.services)
      setCategories(cat.categories)
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to load catalog' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const catName = (id: string) => categories.find((c) => c.id === id)?.name || '—'
  const filtered = services.filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()))

  async function toggleService(id: string, active: boolean) {
    try {
      await api(`/api/services/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) })
      load(); onChanged()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Update failed' })
    }
  }

  if (loading) return <CenteredSpinner />

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-lg font-semibold">Service catalog</h1>
        {admin && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setCatEditor(true)}><Layers className="h-4 w-4" /> Categories</Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1" onClick={() => setEditor({})}><Plus className="h-4 w-4" /> New service</Button>
          </div>
        )}
      </div>

      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search services…" className="pl-8" aria-label="Search catalog" />
      </div>

      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-stone-50/70 text-xs text-muted-foreground">
          {categories.length} categories · {services.length} services — all editable without code changes
        </div>
        <ul className="divide-y">
          {filtered.map((s) => (
            <li key={s.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-sm">{s.name}</p>
                  <Badge variant="outline" className="text-[10px]">{s.executionType.replace(/_/g, ' ')}</Badge>
                  {s.status === 'COMING_SOON' && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">Coming soon</Badge>}
                  {s.featured && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Featured</Badge>}
                  {!s.active && <Badge variant="outline" className="text-[10px] bg-red-50 text-red-600 border-red-200">Inactive</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{catName(s.categoryId)} · {s.timeline || 'scoped per requirement'}{s._count?.requests ? ` · ${s._count.requests} requests` : ''}</p>
              </div>
              {admin && (
                <div className="flex items-center gap-2">
                  <Switch checked={s.active} onCheckedChange={(v) => toggleService(s.id, v)} aria-label={`Toggle ${s.name}`} />
                  <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => setEditor({ id: s.id })}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {editor && <ServiceEditor id={editor.id} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load(); onChanged() }} />}
      {catEditor && <CategoryEditor onClose={() => setCatEditor(false)} onSaved={() => { setCatEditor(false); load() }} />}
    </div>
  )
}

function CategoryEditor({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [categories, setCategories] = useState<(ApiCategoryRow & { faqs?: string })[]>([])
  const [editing, setEditing] = useState<{ id: string; name: string; description: string; icon: string; faqs: { q: string; a: string }[] } | null>(null)
  const [form, setForm] = useState({ code: '', name: '', description: '', icon: 'layers' })
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const d = await api<{ categories: (ApiCategoryRow & { faqs?: string })[] }>('/api/admin/catalog/categories')
      setCategories(d.categories)
    } catch { /* non-admin viewer */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  // Note: category create/update is performed via a lightweight dedicated endpoint
  // (admin-only) — added here inline to keep catalog fully admin-manageable.
  async function save() {
    if (!form.name.trim() || !form.code.trim()) return
    setBusy(true)
    try {
      await api('/api/admin/catalog/categories', {
        method: 'POST',
        body: JSON.stringify({ ...form, code: form.code.toUpperCase().slice(0, 2) }),
      })
      toast({ title: 'Category added' })
      setForm({ code: '', name: '', description: '', icon: 'layers' })
      onSaved(); load()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to add category — this endpoint may need the API route deployed' })
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit() {
    if (!editing) return
    setBusy(true)
    try {
      await api('/api/admin/catalog/categories', {
        method: 'PATCH',
        body: JSON.stringify({ id: editing.id, name: editing.name, description: editing.description, icon: editing.icon, faqs: editing.faqs.filter((f) => f.q.trim() || f.a.trim()) }),
      })
      toast({ title: 'Category updated' })
      setEditing(null); onSaved(); load()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to update category' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Categories</DialogTitle>
          <DialogDescription>Edit descriptions, icons and the FAQ set shown on service detail pages — or add a new category. Changes appear on the website instantly.</DialogDescription>
        </DialogHeader>

        {!loading && (
          <div className="space-y-2">
            {categories.map((c) => (
              <div key={c.id} className="rounded-xl border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{c.code} — {c.name} <span className="text-xs text-muted-foreground">({c._count?.services ?? 0} services)</span></p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{c.description || 'No description'}</p>
                    {!editing && <p className="text-[11px] text-muted-foreground mt-1">{safeQa(c.faqs || '[]').length ? `${safeQa(c.faqs || '[]').length} FAQs` : 'No FAQs'} · icon: {c.icon}</p>}
                  </div>
                  <Button size="sm" variant="outline" className="gap-1 shrink-0"
                    onClick={() => setEditing(editing?.id === c.id ? null : { id: c.id, name: c.name, description: c.description, icon: c.icon, faqs: safeQa(c.faqs || '[]') })}>
                    <Pencil className="h-3.5 w-3.5" /> {editing?.id === c.id ? 'Close' : 'Edit'}
                  </Button>
                </div>
                {editing?.id === c.id && (
                  <div className="mt-3 space-y-3 border-t pt-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div><Label className="text-xs">Name</Label><Input className="mt-1 h-8 text-xs" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
                      <div><Label className="text-xs">Icon (lucide)</Label><Input className="mt-1 h-8 text-xs" value={editing.icon} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} /></div>
                      <div><Label className="text-xs">Description</Label><Input className="mt-1 h-8 text-xs" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Category FAQs (shown on service detail pages)</Label>
                        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setEditing({ ...editing, faqs: [...editing.faqs, { q: '', a: '' }] })}>
                          <Plus className="h-3 w-3" /> Add FAQ
                        </Button>
                      </div>
                      <div className="mt-1.5 space-y-2">
                        {editing.faqs.map((f, i) => (
                          <div key={i} className="rounded-lg bg-stone-50 p-2 space-y-1.5">
                            <div className="flex gap-2">
                              <Input className="h-8 text-xs" placeholder="Question" value={f.q}
                                onChange={(e) => setEditing({ ...editing, faqs: editing.faqs.map((x, j) => j === i ? { ...x, q: e.target.value } : x) })} />
                              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-stone-400 hover:text-red-500"
                                onClick={() => setEditing({ ...editing, faqs: editing.faqs.filter((_, j) => j !== i) })} aria-label="Remove FAQ">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <Textarea className="text-xs min-h-[32px]" rows={2} placeholder="Answer" value={f.a}
                              onChange={(e) => setEditing({ ...editing, faqs: editing.faqs.map((x, j) => j === i ? { ...x, a: e.target.value } : x) })} />
                          </div>
                        ))}
                        {editing.faqs.length === 0 && <p className="text-xs text-muted-foreground">No FAQs yet for this category.</p>}
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={saveEdit}>
                        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />} Save category
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="border-t pt-4">
          <p className="text-sm font-medium mb-2">Add category</p>
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              <div><Label>Code</Label><Input className="mt-1.5" maxLength={2} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Q" /></div>
              <div className="col-span-3"><Label>Name</Label><Input className="mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            </div>
            <div><Label>Description</Label><Textarea className="mt-1.5" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>Icon (lucide name)</Label><Input className="mt-1.5" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} /></div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={save}>Add category</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface ApiServiceFull {
  id?: string; name: string; slug?: string; description: string; categoryId: string; subcategoryId?: string | null;
  executionType: string; status: string; featured: boolean; timeline: string; icon: string; active: boolean;
  scopeExamples: string; deliverables: string; process: string; formConfig: string; docRequirements: string;
}

function ServiceEditor({ id, onClose, onSaved }: { id?: string; onClose: () => void; onSaved: () => void }) {
  const [categories, setCategories] = useState<ApiCategoryRow[]>([])
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<ApiServiceFull>({
    name: '', description: '', categoryId: '', subcategoryId: null, executionType: 'IN_HOUSE',
    status: 'AVAILABLE', featured: false, timeline: 'Scoped per requirement', icon: 'briefcase', active: true,
    scopeExamples: '[]', deliverables: '[]', process: '[]', formConfig: '{"fields":[]}', docRequirements: '{"documents":[]}',
  })
  const [scopeList, setScopeList] = useState<string[]>([])
  const [delivList, setDelivList] = useState<string[]>([])
  const [processList, setProcessList] = useState<{ t: string; d: string }[]>([])
  const [fields, setFields] = useState<FormField[]>([])
  const [docs, setDocs] = useState<{ id: string; label: string; category: string; mandatory: boolean; description?: string }[]>([])

  useEffect(() => {
    api<{ categories: ApiCategoryRow[] }>('/api/catalog').then((d) => {
      setCategories(d.categories)
      if (!id) setForm((f) => ({ ...f, categoryId: d.categories[0]?.id || '' }))
    }).catch(() => {})
    if (id) {
      api<{ services: ApiServiceFull[] }>('/api/services').then((d) => {
        const s = d.services.find((x) => x.id === id)
        if (s) {
          setForm(s)
          setScopeList(safeArr(s.scopeExamples)); setDelivList(safeArr(s.deliverables))
          setProcessList(safeSteps(s.process))
          setFields(parseFormConfig(s.formConfig).fields)
          setDocs(parseDocRequirements(s.docRequirements).documents.map((d) => ({ id: d.id, label: d.label, category: d.category, mandatory: d.mandatory, description: d.description })))
        }
      }).catch(() => {})
    }
  }, [id])

  async function save() {
    if (!form.name.trim() || !form.categoryId) {
      toast({ title: 'Name and category are required' })
      return
    }
    setBusy(true)
    const payload = {
      ...form,
      scopeExamples: scopeList.filter(Boolean),
      deliverables: delivList.filter(Boolean),
      process: processList.filter((p) => p.t.trim() || p.d.trim()),
      formConfig: stringifyFormConfig({ fields }),
      docRequirements: stringifyDocRequirements({ documents: docs }),
    }
    try {
      if (id) await api(`/api/services/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      else await api('/api/services', { method: 'POST', body: JSON.stringify(payload) })
      toast({ title: id ? 'Service updated' : 'Service created' })
      onSaved()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to save' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{id ? 'Edit service' : 'New service'}</DialogTitle>
          <DialogDescription>No pricing here — every service is quoted per requirement. Everything below is live-configurable.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="grid sm:grid-cols-2 gap-3">
            <div><Label>Name *</Label><Input className="mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div>
              <Label>Category *</Label>
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value, subcategoryId: null })}
                className="mt-1.5 w-full h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Category">
                {categories.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            </div>
          </div>
          <div><Label>Description</Label><Textarea className="mt-1.5" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid sm:grid-cols-4 gap-3">
            <div>
              <Label>Execution type</Label>
              <select value={form.executionType} onChange={(e) => setForm({ ...form, executionType: e.target.value })}
                className="mt-1.5 w-full h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Execution type">
                {EXECUTION_MODELS.map((m) => <option key={m.value} value={m.value}>{m.short}</option>)}
              </select>
            </div>
            <div>
              <Label>Status</Label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="mt-1.5 w-full h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Status">
                <option value="AVAILABLE">Available</option>
                <option value="COMING_SOON">Coming soon</option>
              </select>
            </div>
            <div><Label>Typical timeline</Label><Input className="mt-1.5" value={form.timeline} onChange={(e) => setForm({ ...form, timeline: e.target.value })} /></div>
            <div><Label>Icon</Label><Input className="mt-1.5" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} /></div>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.featured} onCheckedChange={(v) => setForm({ ...form, featured: v })} /> Featured on homepage</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /> Active</label>
          </div>

          <StringListEditor label="Scope examples" list={scopeList} onChange={setScopeList} />
          <StringListEditor label="Potential deliverables" list={delivList} onChange={setDelivList} />
          <ProcessEditor list={processList} onChange={setProcessList} />
          <FormBuilder fields={fields} onChange={setFields} />
          <DocBuilder docs={docs} onChange={setDocs} />
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={save}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} {id ? 'Save changes' : 'Create service'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function StringListEditor({ label, list, onChange }: { label: string; list: string[]; onChange: (l: string[]) => void }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm font-medium mb-2">{label}</p>
      <div className="space-y-2">
        {list.map((item, i) => (
          <div key={i} className="flex gap-2">
            <Input value={item} onChange={(e) => onChange(list.map((x, j) => j === i ? e.target.value : x))} />
            <Button size="icon" variant="ghost" className="text-stone-400 hover:text-red-500 shrink-0" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="Remove">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button size="sm" variant="ghost" className="mt-2 gap-1" onClick={() => onChange([...list, ''])}><Plus className="h-3.5 w-3.5" /> Add</Button>
    </div>
  )
}

function FormBuilder({ fields, onChange }: { fields: FormField[]; onChange: (f: FormField[]) => void }) {
  function update(i: number, patch: Partial<FormField>) {
    onChange(fields.map((f, j) => j === i ? { ...f, ...patch } : f))
  }
  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium">Dynamic request form (conditional supported)</p>
        <Button size="sm" variant="ghost" className="gap-1"
          onClick={() => onChange([...fields, { id: `f${Date.now()}`, type: 'text', label: '', required: false }])}>
          <Plus className="h-3.5 w-3.5" /> Add field
        </Button>
      </div>
      {fields.length === 0 && <p className="text-xs text-muted-foreground">No extra fields — the universal form covers the basics.</p>}
      <div className="space-y-2">
        {fields.map((f, i) => (
          <div key={f.id} className="grid grid-cols-12 gap-1.5 items-center rounded-lg bg-stone-50 p-2">
            <select value={f.type} onChange={(e) => update(i, { type: e.target.value as FormField['type'] })}
              className="col-span-3 h-8 rounded-md border border-input bg-background px-1 text-xs" aria-label="Field type">
              {FORM_FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <Input className="col-span-4 h-8 text-xs" placeholder="Label" value={f.label} onChange={(e) => update(i, { label: e.target.value })} />
            <Input className="col-span-2 h-8 text-xs" placeholder="Options (comma)" value={(f.options || []).join(', ')}
              onChange={(e) => update(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
            <label className="col-span-1 flex items-center justify-center text-[10px] text-muted-foreground" title="Required">
              <input type="checkbox" checked={f.required} onChange={(e) => update(i, { required: e.target.checked })} />
            </label>
            <Button size="icon" variant="ghost" className="col-span-1 h-8 w-8 text-stone-400 hover:text-red-500" onClick={() => onChange(fields.filter((_, j) => j !== i))} aria-label="Remove field">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <select value={f.showIf?.fieldId || ''} onChange={(e) => {
              const fid = e.target.value
              update(i, { showIf: fid ? { fieldId: fid, values: f.showIf?.values || [] } : undefined })
            }} className="col-span-6 h-7 rounded-md border border-input bg-background px-1 text-[10px]" aria-label="Show condition">
              <option value="">Always visible</option>
              {fields.filter((_, j) => j !== i).map((other) => <option key={other.id} value={other.id}>Show only if: {other.label || other.id}</option>)}
            </select>
            {f.showIf && (
              <Input className="col-span-6 h-7 text-[10px]" placeholder="Visible when value = (comma separated)" value={(f.showIf.values || []).join(', ')}
                onChange={(e) => update(i, { showIf: { fieldId: f.showIf!.fieldId, values: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } })} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function DocBuilder({ docs, onChange }: { docs: { id: string; label: string; category: string; mandatory: boolean; description?: string }[]; onChange: (d: typeof docs) => void }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium">Document checklist template</p>
        <Button size="sm" variant="ghost" className="gap-1"
          onClick={() => onChange([...docs, { id: `d${Date.now()}`, label: '', category: 'OTHER', mandatory: true }])}>
          <Plus className="h-3.5 w-3.5" /> Add document
        </Button>
      </div>
      {docs.length === 0 && <p className="text-xs text-muted-foreground">No template documents. Staff can always request documents per-request.</p>}
      <div className="space-y-2">
        {docs.map((d, i) => (
          <div key={d.id} className="grid grid-cols-12 gap-1.5 items-center rounded-lg bg-stone-50 p-2">
            <Input className="col-span-5 h-8 text-xs" placeholder="Document label" value={d.label}
              onChange={(e) => onChange(docs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
            <select value={d.category} onChange={(e) => onChange(docs.map((x, j) => j === i ? { ...x, category: e.target.value } : x))}
              className="col-span-3 h-8 rounded-md border border-input bg-background px-1 text-xs" aria-label="Category">
              {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="col-span-2 flex items-center gap-1 text-[10px] text-muted-foreground justify-center">
              <input type="checkbox" checked={d.mandatory} onChange={(e) => onChange(docs.map((x, j) => j === i ? { ...x, mandatory: e.target.checked } : x))} /> Required
            </label>
            <Button size="icon" variant="ghost" className="col-span-2 h-8 w-8 text-stone-400 hover:text-red-500 justify-self-end" onClick={() => onChange(docs.filter((_, j) => j !== i))} aria-label="Remove">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

function safeArr(raw: string): string[] {
  try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}

function safeSteps(raw: string): { t: string; d: string }[] {
  try {
    const v = JSON.parse(raw || '[]')
    if (!Array.isArray(v)) return []
    return v.map((s: { t?: unknown; d?: unknown }) => ({ t: String(s?.t ?? ''), d: String(s?.d ?? '') }))
  } catch { return [] }
}

function safeQa(raw: string): { q: string; a: string }[] {
  try {
    const v = JSON.parse(raw || '[]')
    if (!Array.isArray(v)) return []
    return v.map((s: { q?: unknown; a?: unknown }) => ({ q: String(s?.q ?? ''), a: String(s?.a ?? '') }))
  } catch { return [] }
}

// Delivery-process editor — ordered steps shown on the public service detail page.
function ProcessEditor({ list, onChange }: { list: { t: string; d: string }[]; onChange: (l: { t: string; d: string }[]) => void }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm font-medium">Delivery process (shown on the public detail page)</p>
          <p className="text-xs text-muted-foreground">Ordered steps — customers see “How we deliver”.</p>
        </div>
        <Button size="sm" variant="ghost" className="gap-1" onClick={() => onChange([...list, { t: '', d: '' }])}>
          <Plus className="h-3.5 w-3.5" /> Add step
        </Button>
      </div>
      {list.length === 0 && <p className="text-xs text-muted-foreground">No steps — the detail page will show scope and deliverables only.</p>}
      <div className="space-y-2">
        {list.map((p, i) => (
          <div key={i} className="rounded-lg bg-stone-50 p-2 space-y-1.5">
            <div className="flex gap-2 items-center">
              <span className="h-6 w-6 shrink-0 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
              <Input className="h-8 text-xs" placeholder="Step title (e.g. Discovery & scoping)" value={p.t}
                onChange={(e) => onChange(list.map((x, j) => j === i ? { ...x, t: e.target.value } : x))} />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-stone-400 hover:text-red-500 shrink-0" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="Remove step">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Textarea className="text-xs min-h-[36px]" rows={2} placeholder="What happens in this step" value={p.d}
              onChange={(e) => onChange(list.map((x, j) => j === i ? { ...x, d: e.target.value } : x))} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ================= CUSTOMERS =================
function CustomersTab({ onOpenRequest }: { onOpenRequest: (id: string) => void }) {
  const [customers, setCustomers] = useState<{ id: string; name: string; email: string; phone?: string | null; company?: string | null; createdAt: string; requestCount: number; activeCount: number; lifetimeValue: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [requests, setRequests] = useState<ApiRequest[]>([])

  useEffect(() => {
    api<{ customers: typeof customers }>('/api/admin/customers').then((d) => setCustomers(d.customers)).finally(() => setLoading(false)).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (selected) api<{ requests: ApiRequest[] }>(`/api/requests?status=ALL`).then((d) => setRequests(d.requests.filter((r) => r.customer?.id === selected))).catch(() => {})
  }, [selected])

  const filtered = customers.filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase()))
  const cust = customers.find((c) => c.id === selected)

  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">Customers</h1>
      {selected && cust ? (
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-3" onClick={() => setSelected(null)}>← All customers</Button>
          <div className="rounded-2xl border bg-white p-5 mb-4">
            <h2 className="font-semibold">{cust.name}{cust.company ? ` · ${cust.company}` : ''}</h2>
            <p className="text-sm text-muted-foreground">{cust.email} · {cust.phone || 'No phone'} · joined {formatDate(cust.createdAt)}</p>
            <p className="text-sm mt-2">Lifetime value: <span className="font-bold text-emerald-700">{formatINR(cust.lifetimeValue)}</span></p>
          </div>
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id}>
                <button onClick={() => onOpenRequest(r.id)} className="w-full text-left rounded-xl border bg-white px-4 py-3 hover:border-emerald-300 flex items-center justify-between gap-3">
                  <div><span className="font-mono text-xs text-muted-foreground">{r.requestCode}</span><p className="text-sm font-medium">{r.title}</p></div>
                  <StatusBadge status={r.status} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : loading ? <CenteredSpinner /> : (
        <>
          <div className="relative max-w-sm mb-4">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customers…" className="pl-8" aria-label="Search customers" />
          </div>
          <div className="rounded-2xl border bg-white overflow-hidden">
            <ul className="divide-y">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button onClick={() => setSelected(c.id)} className="w-full text-left px-4 py-3 hover:bg-stone-50 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{c.name}{c.company ? ` · ${c.company}` : ''}</p>
                      <p className="text-xs text-muted-foreground">{c.email} · {c.requestCount} requests ({c.activeCount} active)</p>
                    </div>
                    <span className="text-sm font-semibold text-emerald-700">{formatINR(c.lifetimeValue)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}

// ================= VENDORS =================
function VendorsTab({ user, onChanged }: { user: ApiUser; onChanged: () => void }) {
  const [vendors, setVendors] = useState<{ id: string; businessName: string; logoUrl?: string; status: string; rating: number; completedProjects: number; expertise: string; serviceLocations: string; description: string; website?: string; contactPerson?: string; phone?: string; gstin?: string; address?: string; city?: string; state?: string; payoutMode?: string; payoutAccountName?: string; payoutAccountNumber?: string; payoutIfsc?: string; payoutUpiId?: string; reviewNote?: string | null; user: { id: string; name: string; email: string; phone?: string | null }; createdAt: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [busy, setBusy] = useState(false)
  const [editTarget, setEditTarget] = useState<typeof vendors[number] | null>(null)
  const admin = isAdminRole(user.role)

  const load = useCallback(async () => {
    try {
      const d = await api<{ vendors: typeof vendors }>('/api/vendors')
      setVendors(d.vendors)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function setStatus(id: string, status: string, note?: string) {
    setBusy(true)
    try {
      await api(`/api/admin/vendors/${id}`, { method: 'PATCH', body: JSON.stringify({ status, reviewNote: note }) })
      toast({ title: `Vendor ${status.toLowerCase()}` })
      load(); onChanged()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Update failed' })
    } finally {
      setBusy(false)
    }
  }

  const parse = (s?: string) => { try { return JSON.parse(s || '[]') as string[] } catch { return [] } }
  const filtered = vendors.filter((v) => statusFilter === 'ALL' || v.status === statusFilter)

  if (loading) return <CenteredSpinner />

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-lg font-semibold">Vendors</h1>
        <div className="flex gap-1.5">
          {['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${statusFilter === s ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white'}`}>{s}</button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? <p className="text-muted-foreground py-10 text-center">No vendors in this view.</p> : (
        <div className="space-y-3">
          {filtered.map((v) => (
            <div key={v.id} className="rounded-2xl border bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex gap-3">
                  <CompanyLogo name={v.businessName} src={v.logoUrl} className="h-12 w-12 rounded-xl" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{v.businessName}</h3>
                      <Badge variant="outline" className={
                        v.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        v.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        v.status === 'SUSPENDED' ? 'bg-red-50 text-red-600 border-red-200' : ''
                      }>{v.status}</Badge>
                      {v.rating > 0 && <span className="text-xs text-amber-600">★ {v.rating} · {v.completedProjects} projects</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{v.user.name} · {v.user.email} · {v.user.phone || 'No phone'}</p>
                    {v.description && <p className="text-sm text-stone-600 mt-2 max-w-2xl">{v.description}</p>}
                    <p className="text-xs text-muted-foreground mt-2">Expertise: {parse(v.expertise).join(', ') || '—'} · Locations: {parse(v.serviceLocations).join(', ') || '—'}</p>
                  </div>
                </div>
                {admin && (
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditTarget(v)}><Pencil className="h-3.5 w-3.5" /> Edit details</Button>
                    {v.status !== 'APPROVED' && (
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1" disabled={busy} onClick={() => setStatus(v.id, 'APPROVED')}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                      </Button>
                    )}
                    {v.status === 'PENDING' && (
                      <Button size="sm" variant="outline" className="gap-1 text-red-600" disabled={busy} onClick={() => {
                        const note = window.prompt('Rejection note (shared with the vendor):')
                        if (note !== null) setStatus(v.id, 'REJECTED', note || undefined)
                      }}>
                        <XCircle className="h-3.5 w-3.5" /> Reject
                      </Button>
                    )}
                    {v.status === 'APPROVED' && (
                      <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => setStatus(v.id, 'SUSPENDED')}>
                        <Ban className="h-3.5 w-3.5" /> Suspend
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editTarget && (
        <VendorDetailsEditor
          vendor={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load(); onChanged() }}
        />
      )}
    </div>
  )
}

// Admin editor for vendor company details (logo, profile copy, expertise, locations,
// address, payout channel, reputation).
function VendorDetailsEditor({ vendor, onClose, onSaved }: {
  vendor: { id: string; businessName: string; logoUrl?: string; description: string; website?: string; expertise: string; serviceLocations: string; contactPerson?: string; phone?: string; gstin?: string; address?: string; city?: string; state?: string; payoutMode?: string; payoutAccountName?: string; payoutAccountNumber?: string; payoutIfsc?: string; payoutUpiId?: string; rating: number; completedProjects: number }
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    logoUrl: vendor.logoUrl || '',
    website: vendor.website || '',
    description: vendor.description || '',
    expertise: parseComma(vendor.expertise),
    serviceLocations: parseComma(vendor.serviceLocations),
    contactPerson: vendor.contactPerson || '',
    phone: vendor.phone || '',
    gstin: vendor.gstin || '',
    address: vendor.address || '',
    city: vendor.city || '',
    state: vendor.state || '',
    payoutMode: vendor.payoutMode || '',
    payoutAccountName: vendor.payoutAccountName || '',
    payoutAccountNumber: vendor.payoutAccountNumber || '',
    payoutIfsc: vendor.payoutIfsc || '',
    payoutUpiId: vendor.payoutUpiId || '',
    rating: String(vendor.rating || 0),
    completedProjects: String(vendor.completedProjects || 0),
  })
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await api(`/api/admin/vendors/${vendor.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          logoUrl: form.logoUrl,
          website: form.website,
          description: form.description,
          expertise: form.expertise,
          serviceLocations: form.serviceLocations,
          contactPerson: form.contactPerson,
          phone: form.phone,
          gstin: form.gstin,
          address: form.address,
          city: form.city,
          state: form.state,
          payoutMode: form.payoutMode,
          payoutAccountName: form.payoutAccountName,
          payoutAccountNumber: form.payoutAccountNumber,
          payoutIfsc: form.payoutIfsc,
          payoutUpiId: form.payoutUpiId,
          rating: Number(form.rating) || 0,
          completedProjects: Number(form.completedProjects) || 0,
        }),
      })
      toast({ title: 'Company details updated' })
      onSaved()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Update failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Company details — {vendor.businessName}</DialogTitle>
          <DialogDescription>Logo, profile copy, expertise, address and payout channel. Payout details are staff-only and never shown to customers.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <CompanyLogo name={vendor.businessName} src={form.logoUrl} className="h-14 w-14 rounded-xl" />
            <div className="flex-1">
              <Label>Logo URL (image path or URL)</Label>
              <Input className="mt-1.5" value={form.logoUrl} placeholder="/logos/companies/kriya-studio.png"
                onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} />
            </div>
          </div>
          <div><Label>Website</Label><Input className="mt-1.5" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
          <div><Label>Description</Label><Textarea className="mt-1.5" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Contact person</Label><Input className="mt-1.5" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></div>
            <div><Label>Phone</Label><Input className="mt-1.5" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Expertise (comma separated)</Label><Input className="mt-1.5" value={form.expertise} onChange={(e) => setForm({ ...form, expertise: e.target.value })} /></div>
            <div><Label>Service locations (comma separated)</Label><Input className="mt-1.5" value={form.serviceLocations} onChange={(e) => setForm({ ...form, serviceLocations: e.target.value })} /></div>
          </div>
          <div><Label>GSTIN</Label><Input className="mt-1.5" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} /></div>
          <div><Label>Registered business address</Label><Input className="mt-1.5" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>City</Label><Input className="mt-1.5" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <div><Label>State</Label><Input className="mt-1.5" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
          </div>

          <div className="rounded-xl border bg-stone-50 p-3 space-y-3">
            <p className="text-xs font-semibold text-stone-700 flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5 text-emerald-600" /> Payout details (staff-only)</p>
            <div>
              <Label>Payout mode</Label>
              <select value={form.payoutMode} onChange={(e) => setForm({ ...form, payoutMode: e.target.value })}
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" aria-label="Payout mode">
                <option value="">Not set</option>
                <option value="BANK">Bank transfer (NEFT/IMPS)</option>
                <option value="UPI">UPI</option>
              </select>
            </div>
            {form.payoutMode === 'BANK' && (
              <>
                <div><Label>Account holder name</Label><Input className="mt-1.5" value={form.payoutAccountName} onChange={(e) => setForm({ ...form, payoutAccountName: e.target.value })} /></div>
                <div><Label>Account number</Label><Input className="mt-1.5" value={form.payoutAccountNumber} onChange={(e) => setForm({ ...form, payoutAccountNumber: e.target.value.replace(/[^0-9]/g, '') })} /></div>
                <div><Label>IFSC code</Label><Input className="mt-1.5" value={form.payoutIfsc} onChange={(e) => setForm({ ...form, payoutIfsc: e.target.value.toUpperCase() })} placeholder="HDFC0001234" /></div>
              </>
            )}
            {form.payoutMode === 'UPI' && (
              <div><Label>UPI ID</Label><Input className="mt-1.5" value={form.payoutUpiId} onChange={(e) => setForm({ ...form, payoutUpiId: e.target.value })} placeholder="name@bank" /></div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><Label>Rating (0-5)</Label><Input className="mt-1.5" type="number" min={0} max={5} step={0.1} value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} /></div>
            <div><Label>Completed projects</Label><Input className="mt-1.5" type="number" min={0} value={form.completedProjects} onChange={(e) => setForm({ ...form, completedProjects: e.target.value })} /></div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={save}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function parseComma(raw: string): string {
  try { return (JSON.parse(raw || '[]') as unknown[]).map(String).join(', ') } catch { return '' }
}

// ================= TEAM / EMPLOYEES =================
function TeamTab({ user, onChanged }: { user: ApiUser; onChanged: () => void }) {
  const [team, setTeam] = useState<{ id: string; name: string; email: string; role: string; activeAssignments: number; createdAt: string }[]>([])
  const [roles, setRoles] = useState<{ value: string; label: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const admin = isAdminRole(user.role)

  const load = useCallback(async () => {
    try {
      const d = await api<{ team: typeof team; assignableRoles: { value: string; label: string }[] }>('/api/admin/team')
      setTeam(d.team); setRoles(d.assignableRoles)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function changeRole(id: string, role: string) {
    try {
      await api('/api/admin/team', { method: 'PATCH', body: JSON.stringify({ id, role }) })
      toast({ title: 'Role updated' })
      load(); onChanged()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Update failed' })
    }
  }

  if (loading) return <CenteredSpinner />

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Employees & roles</h1>
        {admin && <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add employee</Button>}
      </div>
      <div className="rounded-2xl border bg-white overflow-hidden">
        <ul className="divide-y">
          {team.map((t) => (
            <li key={t.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{t.name} <span className="text-xs text-muted-foreground">· {t.activeAssignments} active</span></p>
                <p className="text-xs text-muted-foreground">{t.email} · joined {formatDate(t.createdAt)}</p>
              </div>
              {admin ? (
                <select value={t.role} onChange={(e) => changeRole(t.id, e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs" aria-label={`Role for ${t.name}`}>
                  {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              ) : (
                <Badge variant="outline">{ROLE_LABELS[t.role] || t.role}</Badge>
              )}
            </li>
          ))}
        </ul>
      </div>
      {addOpen && <AddEmployee roles={roles} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load() }} />}
    </div>
  )
}

function AddEmployee({ roles, onClose, onSaved }: { roles: { value: string; label: string }[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'EMPLOYEE', password: '' })
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await api('/api/admin/team', { method: 'POST', body: JSON.stringify(form) })
      toast({ title: 'Employee added' })
      onSaved()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to add' })
    } finally { setBusy(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add employee</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Full name</Label><Input className="mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Email</Label><Input type="email" className="mt-1.5" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Phone</Label><Input className="mt-1.5" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Role</Label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="mt-1.5 w-full h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Role">
                {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div><Label>Temp password</Label><Input type="password" className="mt-1.5" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="min 8 chars" /></div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={save}>Add</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ================= PAYMENTS =================
function PaymentsTab() {
  const [payments, setPayments] = useState<{ id: string; type: string; label?: string | null; amount: number; status: string; method?: string | null; receiptNo?: string | null; paidAt?: string | null; createdAt: string; request?: { requestCode: string; title: string; customer?: { name: string; email: string } } }[]>([])
  const [invoices, setInvoices] = useState<{ id: string; invoiceNo: string; totalAmount: number; status: string; issuedAt: string; request?: { requestCode: string } }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api<{ payments: typeof payments }>('/api/admin/payments'),
      api<{ invoices: typeof invoices }>('/api/invoices'),
    ]).then(([p, i]) => { setPayments(p.payments); setInvoices(i.invoices) }).finally(() => setLoading(false)).catch(() => setLoading(false))
  }, [])

  if (loading) return <CenteredSpinner />
  const collected = payments.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.amount, 0)
  const pending = payments.filter((p) => p.status === 'PENDING').reduce((s, p) => s + p.amount, 0)

  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">Payments & invoices</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-muted-foreground">Collected</p><p className="text-xl font-bold text-emerald-700">{formatINR(collected)}</p></div>
        <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-muted-foreground">Pending</p><p className="text-xl font-bold text-amber-600">{formatINR(pending)}</p></div>
        <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-muted-foreground">Transactions</p><p className="text-xl font-bold">{payments.length}</p></div>
        <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-muted-foreground">Invoices issued</p><p className="text-xl font-bold">{invoices.length}</p></div>
      </div>

      <div className="rounded-2xl border bg-white overflow-hidden mb-5">
        <div className="px-4 py-2.5 border-b bg-stone-50/70 font-semibold text-sm">All transactions</div>
        <ul className="divide-y">
          {payments.map((p) => (
            <li key={p.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{p.label || PAYMENT_TYPE_LABELS[p.type] || p.type} · {p.request?.requestCode}</p>
                <p className="text-xs text-muted-foreground">{p.request?.customer?.name} · {p.status === 'PAID' ? `${p.method} · ${p.receiptNo} · ${formatDateTime(p.paidAt || p.createdAt)}` : formatDate(p.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{formatINR(p.amount)}</span>
                <Badge variant="outline" className={p.status === 'PAID' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : p.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}>{p.status}</Badge>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-stone-50/70 font-semibold text-sm">Invoices</div>
        {invoices.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">No invoices issued yet — issue them from a request workspace.</p> : (
          <ul className="divide-y">
            {invoices.map((inv) => (
              <li key={inv.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs">{inv.invoiceNo} · {inv.request?.requestCode}</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{formatINR(inv.totalAmount)}</span>
                  <Badge variant="outline" className="text-[10px]">{inv.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ================= REPORTS =================
function ReportsTab() {
  const [report, setReport] = useState<{ summary: Record<string, number | null>; byCategory: Record<string, { count: number }>; byExecutionModel: Record<string, number>; revenueByCategory: Record<string, number>; revenueByModel: Record<string, number>; employeeWorkload: { id: string; name: string; active: number; completed: number }[]; vendorPerformance: { id: string; businessName: string; status: string; rating: number; completedProjects: number }[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (from) qs.set('from', from)
      if (to) qs.set('to', to)
      const d = await api<{ report: typeof report }>(`/api/admin/reports?${qs}`)
      setReport(d.report)
    } finally { setLoading(false) }
  }, [from, to])

  useEffect(() => { load() }, [load])

  if (loading && !report) return <CenteredSpinner />

  const s = report?.summary || {}
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-lg font-semibold">Reports & analytics</h1>
        <div className="flex flex-wrap gap-2 items-center">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" aria-label="From date" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" aria-label="To date" />
          <Button size="sm" variant="outline" onClick={load}>Apply</Button>
          <a href={`/api/admin/reports?format=csv${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`}>
            <Button size="sm" variant="outline" className="gap-1"><Download className="h-3.5 w-3.5" /> CSV</Button>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-muted-foreground">Requests</p><p className="text-xl font-bold">{s.totalRequests ?? 0}</p></div>
        <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-muted-foreground">Revenue</p><p className="text-xl font-bold text-emerald-700">{formatINR(Number(s.totalRevenue) || 0)}</p></div>
        <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-muted-foreground">Quote acceptance</p><p className="text-xl font-bold">{s.quotationAcceptanceRate ?? 0}%</p></div>
        <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-muted-foreground">Avg completion</p><p className="text-xl font-bold">{s.avgCompletionDays != null ? `${s.avgCompletionDays} d` : '—'}</p></div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartList title="Requests by category" data={Object.entries(report?.byCategory || {}).map(([k, v]) => ({ label: k, value: v.count }))} />
        <ChartList title="Revenue by execution model" data={Object.entries(report?.revenueByModel || {}).map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: v, money: true }))} />
        <ChartList title="Revenue by category" data={Object.entries(report?.revenueByCategory || {}).map(([k, v]) => ({ label: k, value: v, money: true }))} />
        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b bg-stone-50/70 font-semibold text-sm">Employee workload</div>
          <ul className="divide-y text-sm">
            {(report?.employeeWorkload || []).map((e) => (
              <li key={e.id} className="px-4 py-2.5 flex justify-between"><span>{e.name}</span><span>{e.active} active · {e.completed} completed</span></li>
            ))}
            {(report?.employeeWorkload || []).length === 0 && <li className="px-4 py-4 text-muted-foreground">No assignments yet.</li>}
          </ul>
        </div>
        <div className="rounded-2xl border bg-white overflow-hidden lg:col-span-2">
          <div className="px-4 py-3 border-b bg-stone-50/70 font-semibold text-sm">Vendor performance</div>
          <ul className="divide-y text-sm">
            {(report?.vendorPerformance || []).map((v) => (
              <li key={v.id} className="px-4 py-2.5 flex flex-wrap justify-between gap-2">
                <span className="font-medium">{v.businessName}</span>
                <span className="text-muted-foreground">{v.status} · ★ {v.rating || '—'} · {v.completedProjects} projects</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function ChartList({ title, data }: { title: string; data: { label: string; value: number; money?: boolean }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="rounded-2xl border bg-white overflow-hidden">
      <div className="px-4 py-3 border-b bg-stone-50/70 font-semibold text-sm">{title}</div>
      <ul className="p-4 space-y-2">
        {data.length === 0 && <li className="text-sm text-muted-foreground">No data in range.</li>}
        {data.map((d) => (
          <li key={d.label}>
            <div className="flex justify-between text-xs mb-1"><span className="truncate">{d.label}</span><span className="font-medium">{d.money ? formatINR(d.value) : d.value}</span></div>
            <div className="h-2 rounded-full bg-stone-100 overflow-hidden"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.max(3, d.value / max * 100)}%` }} /></div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ================= CMS =================
function CmsTab() {
  const [data, setData] = useState<{ settings: { key: string; value: string; category: string; label?: string | null }[]; pages: { slug: string; title: string; content: string }[]; faqs: { id: string; question: string; answer: string; category: string; sortOrder: number }[]; testimonials: { id: string; name: string; role: string; quote: string; rating: number }[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [faqs, setFaqs] = useState<{ id: string; question: string; answer: string; category: string; sortOrder: number }[]>([])
  const [testimonials, setTestimonials] = useState<{ id: string; name: string; role: string; quote: string; rating: number }[]>([])

  useEffect(() => {
    api<NonNullable<typeof data>>('/api/admin/cms').then((d) => {
      setData(d); setFaqs(d.faqs); setTestimonials(d.testimonials)
    }).finally(() => setLoading(false)).catch(() => setLoading(false))
  }, [])

  async function save(extra: Record<string, unknown> = {}) {
    if (!data) return
    setSaving(true)
    try {
      await api('/api/admin/cms', { method: 'PUT', body: JSON.stringify({ settings: data.settings, pages: data.pages, faqs, testimonials, ...extra }) })
      toast({ title: 'Website content updated — changes are live immediately' })
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to save' })
    } finally { setSaving(false) }
  }

  if (loading || !data) return <CenteredSpinner />
  const setSetting = (key: string, value: string) =>
    setData({ ...data, settings: data.settings.map((s) => s.key === key ? { ...s, value } : s) })
  const setPage = (slug: string, patch: { title?: string; content?: string }) =>
    setData({ ...data, pages: data.pages.map((p) => p.slug === slug ? { ...p, ...patch } : p) })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Website CMS</h1>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1" disabled={saving} onClick={() => save()}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save all
        </Button>
      </div>

      <div className="rounded-2xl border bg-white p-5">
        <h2 className="font-semibold mb-3">Homepage & branding</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {data.settings.filter((s) => s.category === 'CMS' || ['siteName', 'tagline', 'footerNote'].includes(s.key)).map((s) => (
            <div key={s.key}>
              <Label>{s.label || s.key}</Label>
              <Input className="mt-1.5" value={s.value} onChange={(e) => setSetting(s.key, e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5">
        <h2 className="font-semibold mb-3">Content pages</h2>
        <div className="space-y-4">
          {data.pages.map((p) => (
            <div key={p.slug} className="rounded-xl border p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <Badge variant="outline" className="font-mono text-[10px]">/{p.slug}</Badge>
              </div>
              <Input value={p.title} onChange={(e) => setPage(p.slug, { title: e.target.value })} className="mb-2 font-medium" aria-label={`${p.slug} title`} />
              <Textarea rows={6} value={p.content} onChange={(e) => setPage(p.slug, { content: e.target.value })} className="font-mono text-xs" aria-label={`${p.slug} content`} />
              <p className="text-[10px] text-muted-foreground mt-1">Markdown-ish: lines starting with ## are headings, **bold** lines are subheads.</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">FAQs</h2>
          <Button size="sm" variant="ghost" className="gap-1" onClick={() => setFaqs([...faqs, { id: '', question: '', answer: '', category: 'General', sortOrder: faqs.length }])}>
            <Plus className="h-3.5 w-3.5" /> Add FAQ
          </Button>
        </div>
        <div className="space-y-2">
          {faqs.map((f, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2">
              <div className="flex gap-2">
                <Input value={f.question} onChange={(e) => setFaqs(faqs.map((x, j) => j === i ? { ...x, question: e.target.value } : x))} placeholder="Question" />
                <Button size="icon" variant="ghost" className="text-stone-400 hover:text-red-500 shrink-0" onClick={() => setFaqs(faqs.filter((_, j) => j !== i))} aria-label="Remove FAQ"><Trash2 className="h-4 w-4" /></Button>
              </div>
              <Textarea rows={2} value={f.answer} onChange={(e) => setFaqs(faqs.map((x, j) => j === i ? { ...x, answer: e.target.value } : x))} placeholder="Answer" />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Testimonials</h2>
          <Button size="sm" variant="ghost" className="gap-1" onClick={() => setTestimonials([...testimonials, { id: '', name: '', role: '', quote: '', rating: 5 }])}>
            <Plus className="h-3.5 w-3.5" /> Add testimonial
          </Button>
        </div>
        <div className="space-y-2">
          {testimonials.map((t, i) => (
            <div key={i} className="rounded-lg border p-3 grid sm:grid-cols-2 gap-2">
              <Input value={t.name} onChange={(e) => setTestimonials(testimonials.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Name" />
              <Input value={t.role} onChange={(e) => setTestimonials(testimonials.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} placeholder="Role / company" />
              <Textarea rows={2} className="sm:col-span-2" value={t.quote} onChange={(e) => setTestimonials(testimonials.map((x, j) => j === i ? { ...x, quote: e.target.value } : x))} placeholder="Quote" />
              <Button size="icon" variant="ghost" className="text-stone-400 hover:text-red-500 sm:col-span-2 justify-self-end" onClick={() => setTestimonials(testimonials.filter((_, j) => j !== i))} aria-label="Remove testimonial"><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ================= SETTINGS =================
function SettingsTab() {
  const [settings, setSettings] = useState<{ key: string; value: string; category: string; label?: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api<{ settings: typeof settings }>('/api/admin/settings').then((d) => setSettings(d.settings)).finally(() => setLoading(false)).catch(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true)
    try {
      await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ settings }) })
      toast({ title: 'Settings saved' })
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to save' })
    } finally { setSaving(false) }
  }

  if (loading) return <CenteredSpinner />
  const groups = ['GENERAL', 'FINANCE']
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">System settings</h1>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={save}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />} Save
        </Button>
      </div>
      {groups.map((g) => (
        <div key={g} className="rounded-2xl border bg-white p-5">
          <h2 className="font-semibold mb-3">{g === 'GENERAL' ? 'General & contact' : 'Finance & tax'}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {settings.filter((s) => s.category === g).map((s) => (
              <div key={s.key}>
                <Label>{s.label || s.key}</Label>
                <Input className="mt-1.5" value={s.value} onChange={(e) => setSettings(settings.map((x) => x.key === s.key ? { ...x, value: e.target.value } : x))} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ================= ACTIVITY =================
function ActivityTab() {
  const [logs, setLogs] = useState<{ id: string; action: string; details?: string | null; createdAt: string; user?: { name: string; role: string } | null }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<{ logs: typeof logs }>('/api/admin/activity?limit=120').then((d) => setLogs(d.logs)).finally(() => setLoading(false)).catch(() => setLoading(false))
  }, [])

  if (loading) return <CenteredSpinner />
  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">Audit log</h1>
      <div className="rounded-2xl border bg-white overflow-hidden">
        <ul className="divide-y text-sm">
          {logs.map((l) => (
            <li key={l.id} className="px-4 py-2.5 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[10px] font-mono shrink-0">{l.action}</Badge>
              <span className="min-w-0 flex-1 truncate text-stone-700">{l.details}</span>
              <span className="text-xs text-muted-foreground shrink-0">{l.user?.name || 'System'} · {formatDateTime(l.createdAt)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ================= QUOTATIONS (all) =================
function QuotationsTab({ onOpenRequest }: { onOpenRequest: (id: string) => void }) {
  const [quotations, setQuotations] = useState<{ id: string; quotationNo: string; version: number; status: string; total: number; requestId: string; request?: { requestCode: string; title: string; customer?: { name: string; company?: string | null } }; createdAt: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('ALL')

  useEffect(() => {
    api<{ quotations: typeof quotations }>('/api/quotations').then((d) => setQuotations(d.quotations)).finally(() => setLoading(false)).catch(() => setLoading(false))
  }, [])

  if (loading) return <CenteredSpinner />
  const filtered = quotations.filter((q) => statusFilter === 'ALL' || q.status === statusFilter)
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-lg font-semibold">Quotations</h1>
        <div className="flex flex-wrap gap-1.5">
          {['ALL', 'DRAFT', 'SENT', 'NEGOTIATION', 'REVISION_REQUESTED', 'ACCEPTED', 'REJECTED'].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${statusFilter === s ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white'}`}>{s}</button>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border bg-white overflow-hidden">
        <ul className="divide-y">
          {filtered.map((q) => (
            <li key={q.id}>
              <button onClick={() => onOpenRequest(q.requestId)} className="w-full text-left px-4 py-3 hover:bg-stone-50 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium"><span className="font-mono text-xs text-muted-foreground mr-2">{q.quotationNo}</span>{q.request?.title}</p>
                  <p className="text-xs text-muted-foreground">{q.request?.customer?.company || q.request?.customer?.name} · v{q.version} · {formatDate(q.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{formatINR(q.total)}</span>
                  <StatusBadge status={q.status} />
                </div>
              </button>
            </li>
          ))}
        </ul>
        {filtered.length === 0 && <p className="px-4 py-8 text-sm text-muted-foreground text-center">No quotations in this view.</p>}
      </div>
    </div>
  )
}
