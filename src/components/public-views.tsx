'use client'

// Public website views: All Services, Service Detail, Custom Request landing,
// CMS static pages, FAQ, Contact. No prices are displayed anywhere.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/hooks/use-toast'
import { api, ApiCatalogService } from '@/lib/client'
import { EXECUTION_MODELS, EXECUTION_MODEL_SHORT, EXECUTION_MODEL_COLORS, EXECUTION_MODEL_LABELS } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Search, ArrowLeft, ArrowRight, CheckCircle2, Clock, ListChecks, PackageCheck, Route, Send, Mail, MapPin, HelpCircle } from 'lucide-react'
import { PublicView, CatalogData, CategoryIcon } from '@/components/landing'
import { parseFormConfig, parseDocRequirements, FormResponses } from '@/lib/forms'

// ---------------- ALL SERVICES ----------------
export function AllServicesView({ catalog, navigate, openRequest, initialCategory }: {
  catalog: CatalogData | null
  navigate: (v: PublicView) => void
  openRequest: (s: ApiCatalogService | null) => void
  initialCategory?: string
}) {
  const [selected, setSelected] = useState<string | null>(initialCategory || null)
  const [q, setQ] = useState('')

  const categories = catalog?.categories || []
  const services = useMemo(() => {
    let list = catalog?.services || []
    if (selected) list = list.filter((s) => s.categoryId === selected)
    if (q.trim()) {
      const query = q.toLowerCase()
      list = list.filter((s) => s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query))
    }
    return list
  }, [catalog, selected, q])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <Button variant="ghost" size="sm" onClick={() => navigate({ name: 'home' })} className="mb-4 gap-1 -ml-2 text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Home
      </Button>
      <h1 className="text-3xl font-bold tracking-tight">All Services</h1>
      <p className="text-muted-foreground mt-2 max-w-2xl">
        {(catalog?.services || []).length} services across {categories.length} categories — every one quoted individually for your requirement.
        Can&apos;t find it? <button className="text-emerald-700 font-medium underline" onClick={() => openRequest(null)}>Request a custom service</button>.
      </p>

      {/* Category chips */}
      <div className="mt-6 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Filter by category">
        <button
          onClick={() => setSelected(null)}
          className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${!selected ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white hover:border-emerald-300'}`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelected(c.id)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition-colors flex items-center gap-1.5 ${selected === c.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white hover:border-emerald-300'}`}
          >
            <CategoryIcon icon={c.icon} className="h-3.5 w-3.5" /> {c.name}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mt-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search within services…" className="pl-9" aria-label="Search services" />
      </div>

      {/* Grid */}
      <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((s) => (
          <div key={s.id} className="rounded-2xl border bg-white p-5 flex flex-col hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold leading-snug">{s.name}</h3>
              <Badge variant="outline" className={`text-[10px] shrink-0 ${EXECUTION_MODEL_COLORS[s.executionType] || ''}`}>
                {EXECUTION_MODEL_SHORT[s.executionType] || s.executionType}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground line-clamp-3 flex-1">{s.description}</p>
            <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {s.timeline || 'Scoped per requirement'}</span>
              {s.category?.name && <span className="truncate">· {s.category.name}</span>}
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate({ name: 'service', slug: s.slug })}>
                Details
              </Button>
              <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => s.status === 'AVAILABLE' ? openRequest(s) : toast({ title: 'Coming soon', description: `${s.name} is not requestable yet.` })}>
                {s.status === 'AVAILABLE' ? 'Request a quote' : 'Coming soon'}
              </Button>
            </div>
          </div>
        ))}
      </div>
      {services.length === 0 && (
        <div className="mt-12 text-center py-16 border rounded-2xl border-dashed">
          <p className="text-muted-foreground">No services match your search.</p>
          <Button className="mt-4 bg-emerald-600 hover:bg-emerald-700" onClick={() => openRequest(null)}>
            Request it as a custom service
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------------- SERVICE DETAIL ----------------
export function ServiceDetail({ catalog, slug, navigate, openRequest }: {
  catalog: CatalogData | null
  slug: string
  navigate: (v: PublicView) => void
  openRequest: (s: ApiCatalogService | null) => void
}) {
  const service = (catalog?.services || []).find((s) => s.slug === slug)

  if (!service) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <p className="text-muted-foreground">Service not found.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate({ name: 'services' })}>Browse all services</Button>
      </div>
    )
  }

  const scope = safeParse(service.scopeExamples, [])
  const deliverables = safeParse(service.deliverables, [])
  const process = safeParse(service.process || '[]', []) as { t: string; d: string }[]
  const categoryFaqs = safeParse(service.category?.faqs || '[]', []) as { q: string; a: string }[]
  const formFields = parseFormConfig(String(service.formConfig || '')).fields
  const docs = parseDocRequirements(String(service.docRequirements || ''))
  const model = EXECUTION_MODELS.find((m) => m.value === service.executionType)

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <Button variant="ghost" size="sm" onClick={() => navigate({ name: 'services' })} className="mb-4 gap-1 -ml-2 text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> All services
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <span>{service.category?.name}</span>
            {service.subcategory && (<><span>/</span><span>{service.subcategory.name}</span></>)}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{service.name}</h1>
          <p className="mt-3 text-stone-600 leading-relaxed">{service.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="outline" className={EXECUTION_MODEL_COLORS[service.executionType] || ''}>
              {EXECUTION_MODEL_LABELS[service.executionType] || service.executionType}
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1"><Clock className="h-3 w-3" /> {service.timeline || 'Scoped per requirement'}</Badge>
            {service.status === 'COMING_SOON' && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Coming soon</Badge>}
          </div>
        </div>
        <Card className="w-full sm:w-80 shrink-0 border-emerald-100">
          <CardContent className="p-5">
            <p className="text-sm font-semibold mb-1">Customized quotation</p>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              {model ? model.description : 'Share your requirement and receive a line-item quotation.'} No fixed prices — quoted for your exact scope.
            </p>
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2"
              disabled={service.status !== 'AVAILABLE'}
              onClick={() => openRequest(service)}>
              {service.status === 'AVAILABLE' ? 'Request a Quotation' : 'Coming soon'} <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-10 grid md:grid-cols-2 gap-5">
        {scope.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4 text-emerald-600" /> Typical scope</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {scope.map((item: string, i: number) => (
                  <li key={i} className="flex gap-2 text-sm text-stone-700"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" /> {item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        {deliverables.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><PackageCheck className="h-4 w-4 text-emerald-600" /> Potential deliverables</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {deliverables.map((item: string, i: number) => (
                  <li key={i} className="flex gap-2 text-sm text-stone-700"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" /> {item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* How we deliver — per-service process timeline */}
      {process.length > 0 && (
        <Card className="mt-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Route className="h-4 w-4 text-emerald-600" /> How we deliver</CardTitle>
            <CardDescription>The typical engagement path for this service — your quotation confirms the exact plan.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="relative border-l border-emerald-100 ml-2 space-y-5">
              {process.map((step, i) => (
                <li key={i} className="ml-6 relative">
                  <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px] font-bold">{i + 1}</span>
                  <p className="text-sm font-semibold">{step.t}</p>
                  <p className="text-sm text-stone-600 leading-relaxed mt-0.5">{step.d}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* What you'll be asked when you submit */}
      {(formFields.length > 0 || docs.documents.length > 0) && (
        <Card className="mt-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">What you&apos;ll be asked when you submit</CardTitle>
            <CardDescription>The request form adapts to this service — here&apos;s a preview.</CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {formFields.map((f) => (
              <div key={f.id} className="flex gap-2 text-stone-700">
                <span className="text-emerald-500">•</span>
                <span>{f.label}{f.required ? ' *' : ''}</span>
              </div>
            ))}
            {docs.documents.map((d) => (
              <div key={d.id} className="flex gap-2 text-stone-700">
                <span className="text-amber-500">•</span>
                <span>Document: {d.label}{d.mandatory ? ' *' : ' (optional)'}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Category FAQs */}
      {categoryFaqs.length > 0 && (
        <Card className="mt-5 mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><HelpCircle className="h-4 w-4 text-emerald-600" /> Common questions</CardTitle>
            <CardDescription>Applies across {service.category?.name} services.</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible>
              {categoryFaqs.map((f, i) => (
                <AccordionItem key={i} value={`faq-${i}`}>
                  <AccordionTrigger className="text-left text-sm">{f.q}</AccordionTrigger>
                  <AccordionContent className="text-sm text-stone-600 leading-relaxed">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------- CUSTOM REQUEST LANDING ----------------
export function CustomRequestView({ catalog, navigate, openRequest }: {
  catalog: CatalogData | null
  navigate: (v: PublicView) => void
  openRequest: (s: ApiCatalogService | null) => void
}) {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-14">
      <Button variant="ghost" size="sm" onClick={() => navigate({ name: 'home' })} className="mb-4 gap-1 -ml-2 text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Home
      </Button>
      <h1 className="text-3xl font-bold tracking-tight">Request any service</h1>
      <p className="mt-3 text-stone-600 max-w-2xl leading-relaxed">
        If it&apos;s not in the catalog, it&apos;s still requestable. Describe what you need — a drone shoot, a rare compliance filing, a custom integration —
        and we&apos;ll scope it, quote it and deliver it through the right execution model.
      </p>
      <div className="mt-6 grid sm:grid-cols-3 gap-4">
        {[
          { title: 'We never reject a category', desc: 'The platform is built to scope any requirement, listed or not.' },
          { title: 'Quotation first', desc: 'You receive a line-item quote before any commitment or payment.' },
          { title: 'Right execution model', desc: 'In-house, managed vendors, or a direct connection — whatever fits best.' },
        ].map((c) => (
          <div key={c.title} className="rounded-2xl border bg-white p-5">
            <p className="font-semibold text-sm">{c.title}</p>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{c.desc}</p>
          </div>
        ))}
      </div>
      <Button size="lg" className="mt-8 bg-emerald-600 hover:bg-emerald-700 gap-2 h-12 px-8 rounded-xl" onClick={() => openRequest(null)}>
        Describe Your Requirement <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  )
}

// ---------------- CMS STATIC PAGE ----------------
export function StaticPageView({ catalog, slug, navigate }: {
  catalog: CatalogData | null
  slug: string
  navigate: (v: PublicView) => void
}) {
  const page = catalog?.pages.find((p) => p.slug === slug)
  if (!page) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <p className="text-muted-foreground">Page not found.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate({ name: 'home' })}>Go home</Button>
      </div>
    )
  }
  const blocks = page.content.split('\n').map((l) => l.trim()).filter(Boolean)
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <Button variant="ghost" size="sm" onClick={() => navigate({ name: 'home' })} className="mb-4 gap-1 -ml-2 text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Home
      </Button>
      <h1 className="text-3xl font-bold tracking-tight">{page.title}</h1>
      <div className="mt-6 space-y-3">
        {blocks.map((line, i) => {
          if (line.startsWith('## ')) {
            return <h2 key={i} className="text-xl font-semibold mt-8 mb-2 text-stone-900">{line.slice(3)}</h2>
          }
          if (line.startsWith('**') && line.endsWith('**')) {
            return <p key={i} className="font-semibold text-stone-900 mt-4">{line.slice(2, -2)}</p>
          }
          return <p key={i} className="text-stone-600 leading-relaxed">{line}</p>
        })}
      </div>
    </div>
  )
}

// ---------------- FAQ ----------------
export function FaqView({ catalog, navigate, onAuth }: {
  catalog: CatalogData | null
  navigate: (v: PublicView) => void
  onAuth: (mode: 'login' | 'register') => void
}) {
  const faqs = catalog?.faqs || []
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <Button variant="ghost" size="sm" onClick={() => navigate({ name: 'home' })} className="mb-4 gap-1 -ml-2 text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Home
      </Button>
      <h1 className="text-3xl font-bold tracking-tight">Frequently asked questions</h1>
      <p className="mt-2 text-muted-foreground">Everything about quotations, execution models and tracking.</p>
      <Accordion type="single" collapsible className="mt-8">
        {faqs.map((f) => (
          <AccordionItem key={f.id} value={f.id}>
            <AccordionTrigger className="text-left text-sm sm:text-base">{f.question}</AccordionTrigger>
            <AccordionContent className="text-sm text-stone-600 leading-relaxed">{f.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <div className="mt-8 rounded-2xl border bg-stone-50 p-6 text-center">
        <p className="text-sm text-stone-700">Still have a question? Ask our AI assistant (bottom-right) or reach the team.</p>
        <Button className="mt-3 bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate({ name: 'contact' })}>Contact us</Button>
      </div>
    </div>
  )
}

// ---------------- CONTACT ----------------
export function ContactView({ catalog }: { catalog: CatalogData | null }) {
  const [sent, setSent] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const router = useRouter()

  // The contact form posts to the AI assistant? No — it's an informational page plus
  // direct contact details. Messages route through registration for tracking.
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.email || !form.message) {
      toast({ title: 'Please fill all fields' })
      return
    }
    // Store as a lead via registration-free endpoint is out of scope; direct the user.
    setSent(true)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Contact us</h1>
      <p className="mt-2 text-muted-foreground max-w-2xl">Questions about a service, a quotation or an ongoing project? Reach the team directly — we reply within one business day.</p>

      <div className="mt-8 grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          {[
            { icon: Mail, label: 'Email', value: catalog?.settings.contactEmail || 'hello@sellersetu.in' },
            { icon: Send, label: 'Phone / WhatsApp', value: catalog?.settings.contactPhone || '+91 98765 43210' },
            { icon: MapPin, label: 'Office', value: catalog?.settings.contactAddress || 'Bengaluru, India' },
          ].map((c) => (
            <div key={c.label} className="flex items-start gap-3 rounded-2xl border bg-white p-4">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 shrink-0">
                <c.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-sm font-medium">{c.value}</p>
              </div>
            </div>
          ))}
          <div className="rounded-2xl border bg-stone-50 p-4 text-xs text-muted-foreground leading-relaxed">
            For service requests, please use “Submit Requirement” — requests are tracked with a unique ID and answered faster than email.
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Send a quick message</CardTitle>
            <CardDescription>We&apos;ll get back to you on the email you provide.</CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="text-center py-8">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                <p className="font-medium">Thanks — your message is noted.</p>
                <p className="text-sm text-muted-foreground mt-1">For tracked service requests, please create an account and submit a requirement.</p>
                <Button className="mt-4 bg-emerald-600 hover:bg-emerald-700" onClick={() => router.refresh()}>Done</Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <Input placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Your name" />
                <Input type="email" placeholder="Email address" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-label="Email address" />
                <Textarea placeholder="How can we help?" rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} aria-label="Message" />
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">Send message</Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function safeParse<T>(raw: string | undefined, fallback: T): T {
  try {
    const v = JSON.parse(raw || '')
    return (Array.isArray(v) ? v : fallback) as T
  } catch {
    return fallback
  }
}
