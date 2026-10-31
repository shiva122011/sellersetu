'use client'

// Admin service editor: create/edit services with dynamic pricing packages,
// custom per-service forms (with conditional questions) and document requirements.
// Everything is persisted via the API — no code changes needed for new services.

import { useEffect, useState } from 'react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Plus, Trash2, ArrowUp, ArrowDown, Loader2, Package, ClipboardList,
  FileQuestion, Settings2, GripVertical,
} from 'lucide-react'
import { api, ApiService, ApiPackage } from '@/lib/client'
import {
  PRICING_MODELS, WORKFLOW_TYPES, PACKAGE_DURATION_PRESETS, DOCUMENT_CATEGORIES,
  SERVICE_CATEGORIES, LAUNCH_PRIORITIES,
  durationLabel,
} from '@/lib/constants'
import { FormField, FormFieldType, DocRequirement, FORM_FIELD_TYPES, parseFormConfig, parseDocRequirements } from '@/lib/forms'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  service: ApiService | null // null = create new
}

interface PkgRow {
  id?: string
  name: string
  durationMonths: number
  price: string
  active: boolean
}

interface FieldRow {
  id: string
  type: FormFieldType
  label: string
  required: boolean
  options: string
  helpText: string
  showIfField: string
  showIfValues: string[]
}

interface DocRow {
  id: string
  label: string
  category: string
  mandatory: boolean
  description: string
  showIfField: string
  showIfValues: string[]
}

const uid = () => 'f' + Math.random().toString(36).slice(2, 9)

export default function ServiceEditor({ open, onClose, onSaved, service }: Props) {
  const [tab, setTab] = useState('basics')
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [pricingModel, setPricingModel] = useState<'ONE_TIME' | 'SUBSCRIPTION'>('ONE_TIME')
  const [workflowType, setWorkflowType] = useState<'STANDARD' | 'ACCOUNT_MANAGEMENT'>('STANDARD')
  const [duration, setDuration] = useState('')
  const [features, setFeatures] = useState('')
  const [icon, setIcon] = useState('store')
  const [active, setActive] = useState(true)
  const [category, setCategory] = useState('E_COMMERCE')
  const [launchPriority, setLaunchPriority] = useState('P2')
  const [status, setStatus] = useState<'AVAILABLE' | 'COMING_SOON'>('AVAILABLE')
  const [eligibility, setEligibility] = useState('')
  const [packages, setPackages] = useState<PkgRow[]>([])
  const [fields, setFields] = useState<FieldRow[]>([])
  const [docs, setDocs] = useState<DocRow[]>([])

  useEffect(() => {
    if (!open) return
    setTab('basics')
    if (service) {
      setName(service.name)
      setDescription(service.description)
      setPricingModel(service.pricingModel)
      setWorkflowType(service.workflowType)
      setDuration(service.duration)
      try {
        const f = JSON.parse(service.features || '[]')
        setFeatures(Array.isArray(f) ? f.join('\n') : '')
      } catch { setFeatures('') }
      setIcon(service.icon)
      setActive(service.active)
      setCategory(service.category || 'E_COMMERCE')
      setLaunchPriority(service.launchPriority || 'P2')
      setStatus(service.status === 'COMING_SOON' ? 'COMING_SOON' : 'AVAILABLE')
      setEligibility(service.eligibility || '')
      setPackages((service.packages || []).map((p: ApiPackage) => ({
        id: p.id, name: p.name, durationMonths: p.durationMonths, price: String(p.price), active: p.active,
      })))
      const cfg = parseFormConfig(service.formConfig)
      setFields(cfg.fields.map((f: FormField) => ({
        id: f.id, type: f.type, label: f.label, required: f.required,
        options: (f.options || []).join(' | '), helpText: f.helpText || '',
        showIfField: f.showIf?.fieldId || '', showIfValues: f.showIf?.values || [],
      })))
      const dr = parseDocRequirements(service.docRequirements)
      setDocs(dr.documents.map((d: DocRequirement) => ({
        id: d.id, label: d.label, category: d.category || 'OTHER', mandatory: d.mandatory,
        description: d.description || '', showIfField: d.showIf?.fieldId || '', showIfValues: d.showIf?.values || [],
      })))
    } else {
      setName(''); setDescription(''); setPricingModel('ONE_TIME'); setWorkflowType('STANDARD')
      setDuration(''); setFeatures(''); setIcon('store'); setActive(true)
      setCategory('E_COMMERCE'); setLaunchPriority('P2'); setStatus('AVAILABLE'); setEligibility('')
      setPackages([{ name: 'One-time', durationMonths: 0, price: '', active: true }])
      setFields([]); setDocs([])
    }
  }, [open, service])

  function addPackage() {
    const presets = pricingModel === 'SUBSCRIPTION'
      ? PACKAGE_DURATION_PRESETS.filter((p) => p.months > 0)
      : PACKAGE_DURATION_PRESETS.filter((p) => p.months === 0)
    const used = new Set(packages.map((p) => p.name))
    const free = presets.find((p) => !used.has(p.label)) || presets[0]
    setPackages((rows) => [...rows, { name: free.label, durationMonths: free.months, price: '', active: true }])
  }

  function addField() {
    setFields((rows) => [...rows, { id: uid(), type: 'text', label: '', required: false, options: '', helpText: '', showIfField: '', showIfValues: [] }])
  }

  function addDoc() {
    setDocs((rows) => [...rows, { id: uid(), label: '', category: 'OTHER', mandatory: true, description: '', showIfField: '', showIfValues: [] }])
  }

  function move<T>(arr: T[], index: number, dir: -1 | 1): T[] {
    const next = [...arr]
    const target = index + dir
    if (target < 0 || target >= next.length) return arr
    ;[next[index], next[target]] = [next[target], next[index]]
    return next
  }

  async function save() {
    if (!name.trim()) { toast({ title: 'Service name is required', variant: 'destructive' }); setTab('basics'); return }
    if (status === 'AVAILABLE' && (packages.length === 0 || packages.some((p) => !p.price || Number(p.price) <= 0))) {
      toast({ title: 'Every package needs a price', description: 'Coming-soon services may skip pricing.', variant: 'destructive' }); setTab('packages'); return
    }
    if (fields.some((f) => !f.label.trim())) {
      toast({ title: 'Every form question needs a label', variant: 'destructive' }); setTab('form'); return
    }
    if (docs.some((d) => !d.label.trim())) {
      toast({ title: 'Every document requirement needs a name', variant: 'destructive' }); setTab('docs'); return
    }

    setSaving(true)
    try {
      const body = {
        name,
        description,
        pricingModel,
        workflowType,
        duration: duration || (pricingModel === 'SUBSCRIPTION' ? 'Ongoing subscription' : '7-10 business days'),
        features: features.split('\n').map((s) => s.trim()).filter(Boolean),
        icon,
        active,
        category,
        launchPriority,
        status,
        eligibility,
        packages: packages.map((p) => ({
          id: p.id, name: p.name, durationMonths: p.durationMonths, price: Number(p.price), active: p.active,
        })),
        formConfig: {
          fields: fields.map((f) => ({
            id: f.id, type: f.type, label: f.label.trim(), required: f.required,
            options: ['select', 'multiselect', 'radio'].includes(f.type)
              ? f.options.split('|').map((s) => s.trim()).filter(Boolean)
              : undefined,
            helpText: f.helpText.trim() || undefined,
            placeholder: f.type === 'checkbox' ? 'Yes' : undefined,
            showIf: f.showIfField && f.showIfValues.length ? { fieldId: f.showIfField, values: f.showIfValues } : undefined,
          })),
        },
        docRequirements: {
          documents: docs.map((d) => ({
            id: d.id, label: d.label.trim(), category: d.category, mandatory: d.mandatory,
            description: d.description.trim() || undefined,
            showIf: d.showIfField && d.showIfValues.length ? { fieldId: d.showIfField, values: d.showIfValues } : undefined,
          })),
        },
      }
      if (service) {
        await api(`/api/services/${service.id}`, { method: 'PATCH', body: JSON.stringify(body) })
        toast({ title: 'Service updated', description: 'New requests will use the updated configuration.' })
      } else {
        await api('/api/services', { method: 'POST', body: JSON.stringify(body) })
        toast({ title: 'Service created', description: 'It is now available for customers to select.' })
      }
      onSaved()
      onClose()
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Try again', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const conditionalSources = fields.filter((f) => f.label.trim() && ['select', 'radio', 'multiselect'].includes(f.type))

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-emerald-950">{service ? `Edit service — ${service.name}` : 'Create a new service'}</DialogTitle>
          <DialogDescription>
            Everything configured here — prices, packages, questions and document rules — applies to new requests instantly. No code changes needed.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="bg-white border h-auto min-h-10 p-1 flex-wrap">
            <TabsTrigger value="basics" className="gap-1.5 data-[state=active]:bg-emerald-700 data-[state=active]:text-white"><Settings2 className="h-4 w-4" /> Basics</TabsTrigger>
            <TabsTrigger value="packages" className="gap-1.5 data-[state=active]:bg-emerald-700 data-[state=active]:text-white"><Package className="h-4 w-4" /> Pricing</TabsTrigger>
            <TabsTrigger value="form" className="gap-1.5 data-[state=active]:bg-emerald-700 data-[state=active]:text-white"><FileQuestion className="h-4 w-4" /> Form</TabsTrigger>
            <TabsTrigger value="docs" className="gap-1.5 data-[state=active]:bg-emerald-700 data-[state=active]:text-white"><ClipboardList className="h-4 w-4" /> Documents</TabsTrigger>
          </TabsList>

          {/* ---------------- Basics ---------------- */}
          <TabsContent value="basics" className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="se-name">Service name *</Label>
              <Input id="se-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Account Creation" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="se-desc">Description</Label>
              <textarea
                id="se-desc" value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this service include?"
                className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Pricing model *</Label>
                <div className="space-y-2">
                  {PRICING_MODELS.map((m) => (
                    <label key={m.value} className={`flex items-center gap-2.5 rounded-xl border p-2.5 cursor-pointer text-sm ${pricingModel === m.value ? 'border-emerald-500 bg-emerald-50' : 'hover:border-emerald-300'}`}>
                      <input type="radio" name="pricing" className="h-4 w-4 accent-emerald-600" checked={pricingModel === m.value} onChange={() => setPricingModel(m.value)} />
                      <span>{m.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Workflow type *</Label>
                <div className="space-y-2">
                  {WORKFLOW_TYPES.map((m) => (
                    <label key={m.value} className={`flex items-start gap-2.5 rounded-xl border p-2.5 cursor-pointer text-sm ${workflowType === m.value ? 'border-emerald-500 bg-emerald-50' : 'hover:border-emerald-300'}`}>
                      <input type="radio" name="workflow" className="mt-0.5 h-4 w-4 accent-emerald-600" checked={workflowType === m.value} onChange={() => setWorkflowType(m.value)} />
                      <div>
                        <p>{m.label}</p>
                        {m.value === 'ACCOUNT_MANAGEMENT' && (
                          <p className="text-[11px] text-muted-foreground">Skips the document checklist — customers hand over access via the encrypted vault.</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="se-category">Directory category</Label>
                <select
                  id="se-category" value={category} onChange={(e) => setCategory(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  {SERVICE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.short}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="se-priority">Launch priority</Label>
                <select
                  id="se-priority" value={launchPriority} onChange={(e) => setLaunchPriority(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  {LAUNCH_PRIORITIES.map((p) => <option key={p} value={p}>{p} — {p === 'P1' ? 'launch first' : p === 'P2' ? 'expand next' : 'later'}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="se-status">Directory status</Label>
                <select
                  id="se-status" value={status} onChange={(e) => setStatus(e.target.value as 'AVAILABLE' | 'COMING_SOON')}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <option value="AVAILABLE">Available — bookable now</option>
                  <option value="COMING_SOON">Coming soon — display only</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="se-eligibility">Eligibility & scope note (shown in the directory)</Label>
              <textarea
                id="se-eligibility" value={eligibility} onChange={(e) => setEligibility(e.target.value)}
                placeholder="e.g. Requires GSTIN and PAN. We prepare and support — the platform makes the final approval decision."
                className="flex min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              />
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="se-duration">Duration label</Label>
                <Input id="se-duration" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="7-10 business days" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="se-icon">Icon (lucide name)</Label>
                <Input id="se-icon" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="store" />
              </div>
              <div className="space-y-1.5">
                <Label>Visibility</Label>
                <div className="flex items-center gap-2 h-10">
                  <Switch checked={active} onCheckedChange={setActive} id="se-active" />
                  <Label htmlFor="se-active" className="font-normal">{active ? 'Active — bookable' : 'Deactivated — hidden'}</Label>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="se-features">Feature highlights (one per line)</Label>
              <textarea
                id="se-features" value={features} onChange={(e) => setFeatures(e.target.value)}
                placeholder={'GST + brand registry guidance\nShipping & tax settings'}
                className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              />
            </div>
          </TabsContent>

          {/* ---------------- Packages ---------------- */}
          <TabsContent value="packages" className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {pricingModel === 'ONE_TIME'
                ? 'One-time charge model — add one or more flat-fee packages (e.g. tiers by volume).'
                : 'Subscription model — offer Monthly, Quarterly, Half-Yearly and Annual packages.'}
            </p>
            {packages.map((p, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl border p-3 bg-white">
                <div className="flex flex-col gap-1">
                  <button type="button" aria-label="Move up" onClick={() => setPackages((rows) => move(rows, i, -1))} className="text-stone-400 hover:text-emerald-700 disabled:opacity-30" disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label="Move down" onClick={() => setPackages((rows) => move(rows, i, 1))} className="text-stone-400 hover:text-emerald-700 disabled:opacity-30" disabled={i === packages.length - 1}><ArrowDown className="h-3.5 w-3.5" /></button>
                </div>
                <div className="space-y-1 w-40">
                  <Label className="text-xs">Package name</Label>
                  <Input value={p.name} onChange={(e) => setPackages((rows) => rows.map((r, j) => j === i ? { ...r, name: e.target.value } : r))} placeholder="Monthly" />
                </div>
                <div className="space-y-1 w-32">
                  <Label className="text-xs">Duration (months)</Label>
                  <select
                    value={p.durationMonths}
                    onChange={(e) => setPackages((rows) => rows.map((r, j) => j === i ? { ...r, durationMonths: Number(e.target.value) } : r))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                    aria-label="Package duration"
                  >
                    {PACKAGE_DURATION_PRESETS.map((preset) => (
                      <option key={preset.months} value={preset.months}>{durationLabel(preset.months)}</option>
                    ))}
                    {!PACKAGE_DURATION_PRESETS.some((preset) => preset.months === p.durationMonths) && (
                      <option value={p.durationMonths}>{durationLabel(p.durationMonths)}</option>
                    )}
                  </select>
                </div>
                <div className="space-y-1 w-32">
                  <Label className="text-xs">Price (₹)</Label>
                  <Input type="number" min={0} value={p.price} onChange={(e) => setPackages((rows) => rows.map((r, j) => j === i ? { ...r, price: e.target.value } : r))} placeholder="4999" />
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Switch checked={p.active} onCheckedChange={(v) => setPackages((rows) => rows.map((r, j) => j === i ? { ...r, active: v } : r))} aria-label="Package active" />
                  <span className="text-xs text-muted-foreground w-14">{p.active ? 'Active' : 'Hidden'}</span>
                </div>
                <Button type="button" variant="outline" size="icon" className="border-red-200 text-red-600 hover:bg-red-50 mb-0.5" aria-label="Remove package" onClick={() => setPackages((rows) => rows.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={addPackage} className="gap-2 border-emerald-200 text-emerald-700">
              <Plus className="h-4 w-4" /> Add package
            </Button>
          </TabsContent>

          {/* ---------------- Form builder ---------------- */}
          <TabsContent value="form" className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Build the customer questionnaire for this service. Add conditional questions that appear based on earlier answers — e.g. &quot;fresh registration or continuing an existing process?&quot;
            </p>
            {fields.map((f, i) => {
              const needsOptions = ['select', 'multiselect', 'radio'].includes(f.type)
              const canBeCondition = ['select', 'radio', 'multiselect'].includes(f.type)
              return (
                <div key={i} className="rounded-xl border p-3.5 space-y-3 bg-white">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-stone-300" />
                    <Badge variant="outline" className="text-[10px]">{f.type}</Badge>
                    {f.required && <Badge variant="outline" className="text-[10px] border-red-200 text-red-600">required</Badge>}
                    {f.showIfField && <Badge variant="outline" className="text-[10px] border-violet-200 text-violet-700">conditional</Badge>}
                    <div className="flex-1" />
                    <button type="button" aria-label="Move up" onClick={() => setFields((rows) => move(rows, i, -1))} className="text-stone-400 hover:text-emerald-700 disabled:opacity-30" disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" aria-label="Move down" onClick={() => setFields((rows) => move(rows, i, 1))} className="text-stone-400 hover:text-emerald-700 disabled:opacity-30" disabled={i === fields.length - 1}><ArrowDown className="h-3.5 w-3.5" /></button>
                    <button type="button" aria-label="Remove field" onClick={() => setFields((rows) => rows.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="grid sm:grid-cols-4 gap-2">
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">Question label *</Label>
                      <Input value={f.label} onChange={(e) => setFields((rows) => rows.map((r, j) => j === i ? { ...r, label: e.target.value } : r))} placeholder="e.g. Are you starting a fresh registration?" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Field type</Label>
                      <select
                        value={f.type}
                        onChange={(e) => setFields((rows) => rows.map((r, j) => j === i ? { ...r, type: e.target.value as FormFieldType } : r))}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                        aria-label="Field type"
                      >
                        {FORM_FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div className="flex items-end gap-2 pb-1">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="checkbox" checked={f.required} onChange={(e) => setFields((rows) => rows.map((r, j) => j === i ? { ...r, required: e.target.checked } : r))} className="h-4 w-4 accent-emerald-600" />
                        Required
                      </label>
                    </div>
                  </div>
                  {needsOptions && (
                    <div className="space-y-1">
                      <Label className="text-xs">Options (separate with |)</Label>
                      <Input value={f.options} onChange={(e) => setFields((rows) => rows.map((r, j) => j === i ? { ...r, options: e.target.value } : r))} placeholder="Starting fresh registration | Continuing an existing / pending process" />
                    </div>
                  )}
                  {(f.type === 'text' || f.type === 'textarea' || f.type === 'select' || f.type === 'checkbox') && (
                    <div className="space-y-1">
                      <Label className="text-xs">Help text / placeholder</Label>
                      <Input value={f.helpText} onChange={(e) => setFields((rows) => rows.map((r, j) => j === i ? { ...r, helpText: e.target.value } : r))} placeholder="Shown under the field" />
                    </div>
                  )}
                  {canBeCondition && f.options.trim() && (
                    <ConditionalEditor
                      sourceFields={fields.filter((other, j) => j !== i && other.label.trim() && ['select', 'radio', 'multiselect'].includes(other.type))}
                      showIfField={f.showIfField}
                      showIfValues={f.showIfValues}
                      onChange={(fieldId, values) => setFields((rows) => rows.map((r, j) => j === i ? { ...r, showIfField: fieldId, showIfValues: values } : r))}
                    />
                  )}
                </div>
              )
            })}
            <Button type="button" variant="outline" onClick={addField} className="gap-2 border-emerald-200 text-emerald-700">
              <Plus className="h-4 w-4" /> Add question
            </Button>
            {conditionalSources.length === 0 && fields.length > 0 && (
              <p className="text-[11px] text-muted-foreground">Tip: add a dropdown or radio question first — other questions can then be shown conditionally based on its answer.</p>
            )}
          </TabsContent>

          {/* ---------------- Document requirements ---------------- */}
          <TabsContent value="docs" className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Configure the document checklist shown to customers. Mark items mandatory or optional, and make them conditional on form answers.
              {workflowType === 'ACCOUNT_MANAGEMENT' && ' Account-management services normally keep this empty — access is collected via the encrypted credential vault instead.'}
            </p>
            {docs.map((d, i) => (
              <div key={i} className="rounded-xl border p-3.5 space-y-3 bg-white">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{d.category}</Badge>
                  <Badge variant="outline" className={`text-[10px] ${d.mandatory ? 'border-red-200 text-red-600' : 'border-stone-200 text-stone-500'}`}>{d.mandatory ? 'mandatory' : 'optional'}</Badge>
                  {d.showIfField && <Badge variant="outline" className="text-[10px] border-violet-200 text-violet-700">conditional</Badge>}
                  <div className="flex-1" />
                  <button type="button" aria-label="Move up" onClick={() => setDocs((rows) => move(rows, i, -1))} className="text-stone-400 hover:text-emerald-700 disabled:opacity-30" disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label="Move down" onClick={() => setDocs((rows) => move(rows, i, 1))} className="text-stone-400 hover:text-emerald-700 disabled:opacity-30" disabled={i === docs.length - 1}><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label="Remove requirement" onClick={() => setDocs((rows) => rows.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="grid sm:grid-cols-4 gap-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">Document name *</Label>
                    <Input value={d.label} onChange={(e) => setDocs((rows) => rows.map((r, j) => j === i ? { ...r, label: e.target.value } : r))} placeholder="e.g. PAN Card" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Category</Label>
                    <select
                      value={d.category}
                      onChange={(e) => setDocs((rows) => rows.map((r, j) => j === i ? { ...r, category: e.target.value } : r))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                      aria-label="Document category"
                    >
                      {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end gap-2 pb-1">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="checkbox" checked={d.mandatory} onChange={(e) => setDocs((rows) => rows.map((r, j) => j === i ? { ...r, mandatory: e.target.checked } : r))} className="h-4 w-4 accent-emerald-600" />
                      Mandatory
                    </label>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Instructions for the customer</Label>
                  <Input value={d.description} onChange={(e) => setDocs((rows) => rows.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} placeholder="e.g. Clear scan of the PAN issued in the business owner's name" />
                </div>
                {conditionalSources.length > 0 && (
                  <ConditionalEditor
                    sourceFields={conditionalSources}
                    showIfField={d.showIfField}
                    showIfValues={d.showIfValues}
                    onChange={(fieldId, values) => setDocs((rows) => rows.map((r, j) => j === i ? { ...r, showIfField: fieldId, showIfValues: values } : r))}
                  />
                )}
              </div>
            ))}
            <Button type="button" variant="outline" onClick={addDoc} className="gap-2 border-emerald-200 text-emerald-700">
              <Plus className="h-4 w-4" /> Add document requirement
            </Button>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {service ? 'Save changes' : 'Create service'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Conditional display editor shared by form fields and doc requirements
function ConditionalEditor({
  sourceFields, showIfField, showIfValues, onChange,
}: {
  sourceFields: { id: string; label: string; options?: string }[]
  showIfField: string
  showIfValues: string[]
  onChange: (fieldId: string, values: string[]) => void
}) {
  const source = sourceFields.find((f) => f.id === showIfField) || null
  const sourceOptions = source
    ? parseFormConfig(JSON.stringify({ fields: [{ id: source.id, type: 'select', label: source.label, required: false, options: (source.options || '').split('|').map((s) => s.trim()).filter(Boolean) }] })).fields[0]?.options || []
    : []

  return (
    <div className="rounded-lg bg-violet-50/60 border border-violet-100 p-2.5 space-y-2">
      <p className="text-[11px] font-semibold text-violet-800">Show only when</p>
      <div className="grid sm:grid-cols-2 gap-2">
        <select
          value={showIfField}
          onChange={(e) => onChange(e.target.value, [])}
          className="flex h-9 w-full rounded-md border border-input bg-white px-2 py-1 text-xs"
          aria-label="Conditional question"
        >
          <option value="">— Always show —</option>
          {sourceFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        {showIfField && source && (
          <div className="flex flex-wrap gap-1.5">
            {sourceOptions.map((opt) => {
              const checked = showIfValues.includes(opt)
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onChange(showIfField, checked ? showIfValues.filter((v) => v !== opt) : [...showIfValues, opt])}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${checked ? 'border-violet-500 bg-violet-100 text-violet-800 font-medium' : 'border-violet-200 bg-white text-violet-700'}`}
                >
                  {opt}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
