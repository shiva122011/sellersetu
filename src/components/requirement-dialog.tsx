'use client'

// Universal service requirement dialog — works for catalog services (with their
// dynamic form) and custom "not listed" requirements. Requires an authenticated
// customer; offers registration otherwise. Supports saving as draft.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/hooks/use-toast'
import { api, ApiCatalogService } from '@/lib/client'
import { parseFormConfig, validateFormResponses, FormResponses } from '@/lib/forms'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DynamicForm } from '@/components/form-renderer'
import { EXECUTION_MODEL_SHORT, EXECUTION_MODEL_COLORS } from '@/lib/constants'
import { Loader2, Paperclip, Save, Send, X, CheckCircle2, LogIn, FileUp } from 'lucide-react'

interface Props {
  service: ApiCatalogService | null // null = custom request
  onClose: () => void
  onAuth: (mode: 'login' | 'register') => void
}

export default function RequirementDialog({ service, onClose, onAuth }: Props) {
  const router = useRouter()
  const [me, setMe] = useState<{ id: string; role: string } | null>(null)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{ requestCode: string; draft: boolean } | null>(null)

  const [form, setForm] = useState({
    title: '', description: '', expectedDeliverables: '',
    preferredTimeline: '', projectLocation: '', additionalNotes: '',
    customCategory: '',
  })
  const [responses, setResponses] = useState<FormResponses>({})
  const [files, setFiles] = useState<File[]>([])

  // Resolve session
  useEffect(() => {
    api<{ user: { id: string; role: string } | null }>('/api/auth/me')
      .then((d) => setMe(d.user))
      .catch(() => setMe(null))
      .finally(() => setChecking(false))
  }, [])

  const isCustom = !service
  const formConfig = service ? String(service.formConfig || '') : ''
  const hasFields = service ? parseFormConfig(formConfig).fields.length > 0 : false

  function validate(): string | null {
    if (!me) return 'auth'
    if (isCustom && !form.customCategory.trim()) return 'Please tell us what kind of service this is (e.g. Media Production)'
    if (!form.title.trim()) return 'Please add a short project title'
    if (form.description.trim().length < 20) return 'Please describe your requirement in at least 20 characters'
    if (service && hasFields) {
      const err = validateFormResponses(parseFormConfig(formConfig), responses)
      if (err) return err
    }
    return null
  }

  async function submit(asDraft: boolean) {
    const err = validate()
    if (err === 'auth') {
      onAuth('login')
      return
    }
    if (err) {
      toast({ title: err })
      return
    }
    setBusy(true)
    try {
      const body: Record<string, unknown> = {
        ...form,
        draft: asDraft,
        serviceId: service?.id || null,
        formResponses: responses,
        executionModel: isCustom ? responses.approach === 'Just connect me with a provider' ? 'DIRECT_CONNECTION' : 'HYBRID' : undefined,
      }
      const { request } = await api<{ request: { id: string; requestCode: string; draft: boolean } }>('/api/requests', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      // Upload attachments, if any
      if (files.length > 0 && !asDraft) {
        for (const file of files) {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('name', file.name)
          fd.append('category', 'REFERENCE')
          await api(`/api/requests/${request.id}/documents`, { method: 'POST', body: fd }).catch(() => {})
        }
      }
      setCreated({ requestCode: request.requestCode, draft: asDraft })
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to submit request' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] p-0 gap-0" aria-label="Submit service requirement">
        <DialogTitle className="sr-only">Submit service requirement</DialogTitle>
        {created ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
            <h2 className="mt-4 text-xl font-bold">
              {created.draft ? 'Draft saved' : 'Requirement submitted'}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {created.draft
                ? 'Find it under Drafts in your dashboard and submit whenever ready.'
                : 'Our team has been notified. You will receive a customized quotation in your dashboard — typically within one business day.'}
            </p>
            <p className="mt-4 font-mono text-lg font-bold text-emerald-700">{created.requestCode}</p>
            <div className="mt-6 flex gap-2 justify-center">
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => router.refresh()}>
                Open my dashboard
              </Button>
              <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
          </div>
        ) : checking ? (
          <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
        ) : !me ? (
          <div className="p-8 text-center">
            <LogIn className="h-10 w-10 text-emerald-600 mx-auto" />
            <h2 className="mt-3 text-lg font-bold">Sign in to submit your requirement</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
              Requests are tracked with a unique ID, quoted individually, and managed in your personal dashboard.
            </p>
            <div className="mt-6 flex gap-2 justify-center">
              <Button onClick={() => onAuth('login')} variant="outline">Log in</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => onAuth('register')}>Create free account</Button>
            </div>
          </div>
        ) : me.role !== 'CUSTOMER' ? (
          <div className="p-8 text-center">
            <p className="font-medium">You are signed in as a {me.role.toLowerCase()}.</p>
            <p className="mt-2 text-sm text-muted-foreground">Only customer accounts can submit service requests.</p>
            <Button variant="outline" className="mt-4" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <>
            <DialogHeader className="px-6 pt-6 pb-0">
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                {service ? service.name : 'Custom service request'}
                {service && (
                  <Badge variant="outline" className={`text-[10px] ${EXECUTION_MODEL_COLORS[service.executionType] || ''}`}>
                    {EXECUTION_MODEL_SHORT[service.executionType]}
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                {service
                  ? 'Fill in your requirement — you will receive a customized, line-item quotation. No payment is requested now.'
                  : 'Describe anything not in the catalog. We will scope it and quote it.'}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[62vh] px-6 pb-2">
              <div className="space-y-4 py-4">
                {isCustom && (
                  <div>
                    <Label htmlFor="rq-category">What kind of service is this? *</Label>
                    <Input id="rq-category" className="mt-1.5" placeholder="e.g. Drone videography, Import consulting, Store audit…"
                      value={form.customCategory} onChange={(e) => setForm({ ...form, customCategory: e.target.value })} />
                  </div>
                )}
                <div>
                  <Label htmlFor="rq-title">Project title *</Label>
                  <Input id="rq-title" className="mt-1.5" placeholder="e.g. Corporate website with CMS"
                    value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="rq-desc">Detailed requirement *</Label>
                  <Textarea id="rq-desc" className="mt-1.5 min-h-28" rows={4}
                    placeholder="Describe the work, goals, current situation and anything else relevant…"
                    value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                {service && hasFields && (
                  <div className="rounded-xl border bg-stone-50/60 p-4">
                    <p className="text-sm font-medium mb-3">Service-specific questions</p>
                    <DynamicForm config={formConfig} responses={responses} onChange={setResponses}
                      files={{}} onFileChange={() => {}} />
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="rq-deliverables">Expected deliverables</Label>
                    <Input id="rq-deliverables" className="mt-1.5" placeholder="e.g. Live website, source files…"
                      value={form.expectedDeliverables} onChange={(e) => setForm({ ...form, expectedDeliverables: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="rq-timeline">Preferred timeline</Label>
                    <Input id="rq-timeline" className="mt-1.5" placeholder="e.g. 4–6 weeks"
                      value={form.preferredTimeline} onChange={(e) => setForm({ ...form, preferredTimeline: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="rq-location">Project location (if applicable)</Label>
                    <Input id="rq-location" className="mt-1.5" placeholder="e.g. Pune"
                      value={form.projectLocation} onChange={(e) => setForm({ ...form, projectLocation: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="rq-notes">Additional notes</Label>
                    <Input id="rq-notes" className="mt-1.5" placeholder="Anything else we should know"
                      value={form.additionalNotes} onChange={(e) => setForm({ ...form, additionalNotes: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Supporting documents / references (optional)</Label>
                  <label className="mt-1.5 flex items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground cursor-pointer hover:border-emerald-300 hover:text-emerald-700">
                    <FileUp className="h-4 w-4" />
                    Attach files (PDF, images, docs — max 10 MB each)
                    <input type="file" multiple className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt"
                      onChange={(e) => {
                        const list = Array.from(e.target.files || [])
                        const okFiles = list.filter((f) => f.size <= 10 * 1024 * 1024)
                        if (okFiles.length < list.length) toast({ title: 'Some files were skipped (over 10 MB)' })
                        setFiles((prev) => [...prev, ...okFiles].slice(0, 5))
                      }} />
                  </label>
                  {files.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {files.map((f, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2 text-xs">
                          <span className="flex items-center gap-1.5 min-w-0"><Paperclip className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{f.name}</span></span>
                          <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                            <X className="h-3.5 w-3.5 text-stone-400 hover:text-red-500" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </ScrollArea>
            <div className="border-t px-6 py-4 flex flex-col sm:flex-row gap-2 justify-end">
              <Button variant="outline" disabled={busy} onClick={() => submit(true)} className="gap-1.5 sm:order-1">
                <Save className="h-4 w-4" /> Save draft
              </Button>
              <Button disabled={busy} onClick={() => submit(false)} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 sm:order-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit requirement
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
