'use client'

// Universal public website — shell, home page, and view routing.
// Every piece of copy except structural labels is CMS-driven (admin-editable).
// NO public pricing anywhere: commercial terms come from quotations only.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '@/hooks/use-toast'
import { api, ApiCategory, ApiCatalogService, requestServiceLabel } from '@/lib/client'
import { EXECUTION_MODELS, EXECUTION_MODEL_SHORT, EXECUTION_MODEL_COLORS } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import {
  Search, Menu, ArrowRight, ShieldCheck, Zap, Users, MessageSquare, FileText,
  ClipboardList, BadgeCheck, Star, Phone, Mail, MapPin, ChevronRight, Sparkles,
  Building2, Layers, Handshake, Rocket,
} from 'lucide-react'
import { AllServicesView, ServiceDetail, CustomRequestView, StaticPageView, FaqView, ContactView } from '@/components/public-views'
import { CompanyLogo } from '@/components/shared'
import RequirementDialog from '@/components/requirement-dialog'
import AiAssistantWidget from '@/components/ai-assistant'

export type PublicView =
  | { name: 'home' }
  | { name: 'services'; categoryId?: string }
  | { name: 'service'; slug: string }
  | { name: 'custom' }
  | { name: 'page'; slug: string }
  | { name: 'contact' }
  | { name: 'faq' }

export interface CatalogData {
  categories: ApiCategory[]
  services: ApiCatalogService[]
  settings: Record<string, string>
  faqs: { id: string; question: string; answer: string; category: string }[]
  testimonials: { id: string; name: string; role: string; logoUrl?: string; quote: string; rating: number }[]
  pages: { slug: string; title: string; content: string }[]
}

const ICONS: Record<string, typeof Layers> = {
  code: Building2, palette: Sparkles, 'shopping-bag': Layers, 'user-plus': Users,
  bot: Rocket, server: Layers, store: Building2, 'file-check': FileText,
  lightbulb: Sparkles, 'bar-chart-3': Layers, truck: Rocket, factory: Building2,
  package: Layers, video: Sparkles, megaphone: Rocket, sparkles: Sparkles,
  layers: Layers,
}

export function CategoryIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = ICONS[icon] || Layers
  return <Icon className={className} />
}

export default function Landing({ onAuth }: { onAuth: (mode: 'login' | 'register') => void }) {
  const [view, setView] = useState<PublicView>({ name: 'home' })
  const [catalog, setCatalog] = useState<CatalogData | null>(null)
  const [query, setQuery] = useState('')
  const [reqService, setReqService] = useState<ApiCatalogService | null | undefined>(undefined) // undefined = closed
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    api<CatalogData>('/api/catalog')
      .then(setCatalog)
      .catch(() => toast({ title: 'Could not load catalog', description: 'Please refresh the page.' }))
  }, [])

  const navigate = useCallback((v: PublicView) => {
    setView(v)
    setNavOpen(false)
    window.scrollTo({ top: 0 })
  }, [])

  const openRequest = useCallback((service: ApiCatalogService | null) => {
    setReqService(service ?? null)
  }, [])

  const results = useMemo(() => {
    if (!catalog || !query.trim()) return []
    const q = query.toLowerCase()
    return catalog.services.filter((s) =>
      s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) ||
      (s.category?.name || '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [catalog, query])

  const siteName = catalog?.settings.siteName || 'SellerSetu'
  const tagline = catalog?.settings.tagline || 'One platform for every service your business needs'

  const navItems = [
    { label: 'All Services', view: { name: 'services' } as PublicView },
    { label: 'How It Works', view: { name: 'page', slug: 'how-it-works' } as PublicView },
    { label: 'About', view: { name: 'page', slug: 'about' } as PublicView },
    { label: 'FAQ', view: { name: 'faq' } as PublicView },
    { label: 'Contact', view: { name: 'contact' } as PublicView },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button className="flex items-center gap-2.5" onClick={() => navigate({ name: 'home' })}>
            { }
            <img src="/logos/sellersetu-mark.png" alt="SellerSetu logo" className="h-9 w-9 rounded-xl border object-cover" />
            <span className="font-bold text-lg tracking-tight">{siteName}</span>
          </button>

          <nav className="hidden lg:flex items-center gap-1" aria-label="Main navigation">
            {navItems.map((item) => (
              <button
                key={item.label}
                onClick={() => navigate(item.view)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-stone-100 ${JSON.stringify(view) === JSON.stringify(item.view) ? 'text-emerald-700 bg-emerald-50' : 'text-stone-600'}`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onAuth('login')} className="hidden sm:inline-flex">Log in</Button>
            <Button size="sm" onClick={() => navigate({ name: 'custom' })} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5">
              Submit Requirement <ArrowRight className="h-4 w-4" />
            </Button>
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <div className="mt-6 space-y-1">
                  {navItems.map((item) => (
                    <button key={item.label} onClick={() => navigate(item.view)}
                      className="block w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-stone-100">
                      {item.label}
                    </button>
                  ))}
                  <div className="border-t my-3" />
                  <button onClick={() => { setNavOpen(false); onAuth('login') }}
                    className="block w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-stone-100">
                    Log in
                  </button>
                  <button onClick={() => { setNavOpen(false); onAuth('register') }}
                    className="block w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-emerald-700 hover:bg-emerald-50">
                    Create account
                  </button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {view.name === 'home' && (
          <HomeView catalog={catalog} siteName={siteName} tagline={tagline}
            navigate={navigate} openRequest={openRequest} onAuth={onAuth} query={query} setQuery={setQuery} results={results} />
        )}
        {view.name === 'services' && (
          <AllServicesView catalog={catalog} navigate={navigate} openRequest={openRequest}
            initialCategory={view.categoryId} />
        )}
        {view.name === 'service' && (
          <ServiceDetail catalog={catalog} slug={view.slug} navigate={navigate} openRequest={openRequest} />
        )}
        {view.name === 'custom' && (
          <CustomRequestView catalog={catalog} navigate={navigate} openRequest={openRequest} />
        )}
        {view.name === 'page' && <StaticPageView catalog={catalog} slug={view.slug} navigate={navigate} />}
        {view.name === 'faq' && <FaqView catalog={catalog} navigate={navigate} onAuth={onAuth} />}
        {view.name === 'contact' && <ContactView catalog={catalog} />}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t bg-stone-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid gap-8 md:grid-cols-4 text-sm">
          <div>
            <div className="flex items-center gap-2 mb-3">
              { }
              <img src="/logos/sellersetu-mark.png" alt="SellerSetu logo" className="h-8 w-8 rounded-lg border object-cover" />
              <span className="font-bold">{siteName}</span>
            </div>
            <p className="text-muted-foreground text-xs leading-relaxed">{catalog?.settings.footerNote || 'Commercial terms are always customized per requirement via quotation — no fixed price lists.'}</p>
          </div>
          <div>
            <p className="font-semibold mb-3">Platform</p>
            <ul className="space-y-2 text-muted-foreground">
              <li><button className="hover:text-emerald-700" onClick={() => navigate({ name: 'services' })}>All Services</button></li>
              <li><button className="hover:text-emerald-700" onClick={() => navigate({ name: 'custom' })}>Request a Custom Service</button></li>
              <li><button className="hover:text-emerald-700" onClick={() => navigate({ name: 'page', slug: 'how-it-works' })}>How It Works</button></li>
              <li><button className="hover:text-emerald-700" onClick={() => navigate({ name: 'faq' })}>FAQ</button></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-3">Company</p>
            <ul className="space-y-2 text-muted-foreground">
              <li><button className="hover:text-emerald-700" onClick={() => navigate({ name: 'page', slug: 'about' })}>About Us</button></li>
              <li><button className="hover:text-emerald-700" onClick={() => navigate({ name: 'contact' })}>Contact Us</button></li>
              <li><button className="hover:text-emerald-700" onClick={() => navigate({ name: 'page', slug: 'privacy' })}>Privacy Policy</button></li>
              <li><button className="hover:text-emerald-700" onClick={() => navigate({ name: 'page', slug: 'terms' })}>Terms & Conditions</button></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-3">Get in touch</p>
            <ul className="space-y-2 text-muted-foreground text-xs">
              <li className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> {catalog?.settings.contactEmail || 'hello@sellersetu.in'}</li>
              <li className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {catalog?.settings.contactPhone || '+91 98765 43210'}</li>
              <li className="flex items-start gap-2"><MapPin className="h-3.5 w-3.5 mt-0.5" /> {catalog?.settings.contactAddress || 'Bengaluru, India'}</li>
            </ul>
          </div>
        </div>
        <div className="border-t py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} {catalog?.settings.legalName || siteName}. All rights reserved.
        </div>
      </footer>

      {reqService !== undefined && (
        <RequirementDialog
          service={reqService}
          onClose={() => setReqService(undefined)}
          onAuth={onAuth}
        />
      )}

      <AiAssistantWidget />
    </div>
  )
}

// ---------------- HOME ----------------
function HomeView({ catalog, siteName, tagline, navigate, openRequest, onAuth, query, setQuery, results }: {
  catalog: CatalogData | null
  siteName: string
  tagline: string
  navigate: (v: PublicView) => void
  openRequest: (s: ApiCatalogService | null) => void
  onAuth: (mode: 'login' | 'register') => void
  query: string
  setQuery: (q: string) => void
  results: ApiCatalogService[]
}) {
  const featuredServices = (catalog?.services || []).filter((s) => s.featured && s.status === 'AVAILABLE').slice(0, 8)
  const categories = catalog?.categories || []

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50/80 via-white to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-14 pb-16 text-center">
          <Badge variant="outline" className="mb-4 border-emerald-200 bg-emerald-50 text-emerald-700 gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> {tagline}
          </Badge>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-stone-900 max-w-4xl mx-auto leading-tight">
            {catalog?.settings.heroTitle || 'Any service. One platform. A quote built for you.'}
          </h1>
          <p className="mt-5 text-base sm:text-lg text-stone-600 max-w-3xl mx-auto leading-relaxed">
            {catalog?.settings.heroSubtitle || 'Tell us what you need, receive a customized quotation, negotiate, and track delivery in one workspace.'}
          </p>

          {/* Universal search */}
          <div className="mt-8 max-w-2xl mx-auto relative">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-stone-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search services — e.g. website, GST, packaging, photography…"
                className="h-14 pl-12 pr-32 text-base rounded-2xl border-stone-200 shadow-lg shadow-stone-200/50"
                aria-label="Search services"
              />
              <Button
                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700"
                onClick={() => navigate({ name: 'services' })}
              >
                Explore Services
              </Button>
            </div>
            {results.length > 0 && (
              <div className="absolute z-30 mt-2 w-full rounded-xl border bg-white shadow-xl overflow-hidden text-left">
                {results.map((s) => (
                  <button key={s.id} onClick={() => { setQuery(''); navigate({ name: 'service', slug: s.slug }) }}
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-stone-50 border-b last:border-0">
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-2">
                      {s.category?.name} <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" onClick={() => openRequest(null)} className="bg-emerald-600 hover:bg-emerald-700 h-12 px-6 gap-2 rounded-xl">
              Submit Your Requirement <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate({ name: 'page', slug: 'how-it-works' })} className="h-12 px-6 rounded-xl">
              How It Works
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">No fixed price lists — every service is quoted for your exact requirement.</p>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Explore service categories</h2>
            <p className="text-muted-foreground mt-2">{categories.length} categories · {(catalog?.services || []).length}+ services · and anything not listed</p>
          </div>
          <Button variant="ghost" onClick={() => navigate({ name: 'services' })} className="gap-1 text-emerald-700 hidden sm:inline-flex">
            View all <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {categories.map((c) => {
            const count = (catalog?.services || []).filter((s) => s.categoryId === c.id).length
            return (
              <button key={c.id} onClick={() => navigate({ name: 'services', categoryId: c.id })}
                className="group text-left rounded-2xl border bg-white p-4 sm:p-5 hover:border-emerald-300 hover:shadow-md transition-all">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 mb-3 group-hover:bg-emerald-100">
                  <CategoryIcon icon={c.icon} className="h-5 w-5" />
                </span>
                <p className="text-xs font-mono text-stone-400 mb-1">Category {c.code}</p>
                <h3 className="font-semibold text-sm sm:text-base leading-snug">{c.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{count} services</p>
              </button>
            )
          })}
        </div>
      </section>

      {/* Execution models */}
      <section className="bg-stone-50 border-y">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Three ways we get it done</h2>
            <p className="text-muted-foreground mt-2">Whichever model fits your requirement, you keep one workspace, one chat and one point of accountability.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { icon: Building2, title: 'In-House Execution', desc: 'Our own team plans, builds and delivers — software, design, listings, onboarding and automation.' },
              { icon: Handshake, title: 'Third-Party Managed', desc: 'A vetted vendor executes under our end-to-end project management. You track everything in one workspace.' },
              { icon: Zap, title: 'Direct Vendor Connection', desc: 'We match and connect you with a specialist for a facilitation fee — then you work with them directly.' },
            ].map((m) => (
              <div key={m.title} className="rounded-2xl border bg-white p-6">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 mb-4">
                  <m.icon className="h-5.5 w-5.5" />
                </span>
                <h3 className="font-semibold mb-2">{m.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">From requirement to delivery</h2>
          <p className="text-muted-foreground mt-2">A quotation-first process — you always know the scope and terms before committing.</p>
        </div>
        <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: ClipboardList, step: '1', title: 'Submit your requirement', desc: 'Pick a service or describe anything custom. Get a unique Request ID instantly.' },
            { icon: FileText, step: '2', title: 'Receive a quotation', desc: 'A line-item quote with scope, deliverables, timeline and payment terms — built for you.' },
            { icon: MessageSquare, step: '3', title: 'Negotiate & approve', desc: 'Accept, request changes or discuss in chat. The accepted quote is locked as the record.' },
            { icon: BadgeCheck, step: '4', title: 'Track to delivery', desc: 'Milestones, progress %, documents, payments and deliverables in your workspace.' },
          ].map((s) => (
            <li key={s.step} className="rounded-2xl border bg-white p-5 relative">
              <span className="absolute -top-3 left-5 h-7 w-7 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">{s.step}</span>
              <s.icon className="h-5 w-5 text-emerald-600 mb-3 mt-2" />
              <h3 className="font-semibold text-sm mb-1.5">{s.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Featured services */}
      {featuredServices.length > 0 && (
        <section className="bg-stone-50 border-y">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
            <div className="flex items-end justify-between mb-8">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Popular right now</h2>
                <p className="text-muted-foreground mt-2">Request any of these in minutes — or search for something else entirely.</p>
              </div>
              <Button variant="ghost" onClick={() => navigate({ name: 'services' })} className="gap-1 text-emerald-700 hidden sm:inline-flex">
                All services <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {featuredServices.map((s) => (
                <div key={s.id} className="rounded-2xl border bg-white p-5 flex flex-col">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-sm leading-snug">{s.name}</h3>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${EXECUTION_MODEL_COLORS[s.executionType] || ''}`}>
                      {EXECUTION_MODEL_SHORT[s.executionType] || s.executionType}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{s.description}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Typical: {s.timeline || 'scoped per requirement'}</span>
                  </div>
                  <Button size="sm" variant="outline" className="mt-3 w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => navigate({ name: 'service', slug: s.slug })}>
                    Request a quote
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Testimonials */}
      {(catalog?.testimonials || []).length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-10">Businesses that moved faster</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {catalog!.testimonials.slice(0, 4).map((t) => (
              <figure key={t.id} className="rounded-2xl border bg-white p-5 flex flex-col">
                <div className="flex items-center gap-3 mb-3">
                  <CompanyLogo name={t.role.split(',').pop()?.trim() || t.name} src={t.logoUrl} className="h-11 w-11 rounded-xl" />
                  <div className="flex gap-0.5" aria-label={`${t.rating} out of 5 stars`}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`h-4 w-4 ${i < t.rating ? 'fill-amber-400 text-amber-400' : 'text-stone-300'}`} />
                    ))}
                  </div>
                </div>
                <blockquote className="text-sm text-stone-700 leading-relaxed flex-1">“{t.quote}”</blockquote>
                <figcaption className="mt-4 text-xs">
                  <span className="font-semibold">{t.name}</span>
                  <span className="text-muted-foreground"> · {t.role}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* Final CTA */}
      <section className="bg-gradient-to-br from-emerald-700 to-teal-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center text-white">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Tell us what you need. We&apos;ll quote it.</h2>
          <p className="mt-4 text-emerald-50/90 max-w-2xl mx-auto">
            Software, design, compliance, manufacturing, marketing — or anything else your business needs. Free to request, quoted before any commitment.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={() => openRequest(null)} className="bg-white text-emerald-800 hover:bg-emerald-50 h-12 px-8 rounded-xl font-semibold">
              Request a Custom Quote
            </Button>
            <Button size="lg" variant="outline" onClick={() => onAuth('register')}
              className="border-white/40 text-white hover:bg-white/10 h-12 px-8 rounded-xl">
              Create free account
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-emerald-100/90">
            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Secure & role-based access</span>
            <span className="flex items-center gap-2"><Users className="h-4 w-4" /> Vetted vendor network</span>
            <span className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Real-time chat support</span>
          </div>
        </div>
      </section>
    </>
  )
}
