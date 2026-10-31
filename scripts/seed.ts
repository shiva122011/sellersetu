/**
 * Universal Service Management Platform — master seed.
 * Wipes all tables and rebuilds: 16 universal categories (A–P) each with its own
 * FAQ set, ~150 services with per-service detailed descriptions, scope,
 * deliverables and delivery-process steps (scripts/service-details/), users
 * across all 8 roles, vendor profiles with company logos, demo requests spanning
 * every workflow stage, quotations, projects, milestones, vendor connections,
 * payments, invoices, CMS content and system settings.
 *
 * Run: bun scripts/seed.ts
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { CATALOG, CatDef } from './seed-catalog'
import { SERVICE_DETAILS, CATEGORY_FAQS } from './service-details'

const db = new PrismaClient()

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70)

// ---------- dynamic form presets per category ----------
const FIELD = (id: string, type: string, label: string, required: boolean, extra: Record<string, unknown> = {}) =>
  ({ id, type, label, required, ...extra })

const FORM_PRESETS: Record<string, { fields: unknown[] }> = {
  A: { fields: [
    FIELD('websiteType', 'select', 'Website type', true, { options: ['Corporate website', 'E-commerce store', 'Web portal', 'SaaS product', 'Landing pages', 'Other'] }),
    FIELD('numPages', 'number', 'Approximate number of pages / screens', false),
    FIELD('features', 'multiselect', 'Key features needed', false, { options: ['Payment gateway', 'Login / user accounts', 'Blog / CMS', 'Admin dashboard', 'Multi-language', 'Booking / appointments', 'Live chat', 'API integrations'] }),
    FIELD('references', 'text', 'Reference websites you like', false),
    FIELD('domainHosting', 'select', 'Domain & hosting status', false, { options: ['I already have both', 'I have a domain only', 'Need help with both'] }),
  ] },
  B: { fields: [
    FIELD('designBrief', 'textarea', 'Describe what needs to be designed', true),
    FIELD('formats', 'multiselect', 'Required file formats', false, { options: ['Figma', 'AI / PSD', 'PDF (print ready)', 'PNG / JPG', 'SVG', '3D / CAD'] }),
    FIELD('brandAssets', 'select', 'Brand assets (logo, colors, fonts)', false, { options: ['Ready to share', 'Need to be created first'] }),
    FIELD('references', 'text', 'Design references / mood', false),
  ] },
  C: { fields: [
    FIELD('marketplace', 'select', 'Marketplace', true, { options: ['Amazon', 'Flipkart', 'Meesho', 'Blinkit', 'Zepto', 'Swiggy Instamart', 'ONDC', 'Multiple'] }),
    FIELD('productCategory', 'text', 'Product category', true),
    FIELD('numProducts', 'number', 'Number of products / SKUs', true),
    FIELD('accountStatus', 'select', 'Seller account status', false, { options: ['Active seller account', 'Account pending approval', 'Need account setup too'] }),
    FIELD('contentReady', 'select', 'Product content & images ready?', false, { options: ['Yes, all ready', 'Partially', 'Need content preparation'] }),
  ] },
  D: { fields: [
    FIELD('platform', 'text', 'Platform / portal name', true),
    FIELD('businessStage', 'select', 'Business readiness', false, { options: ['All registrations done', 'Some registrations pending', 'Starting from scratch'] }),
    FIELD('docsReady', 'select', 'Documentation availability', false, { options: ['All documents ready', 'Some missing', 'Need guidance'] }),
  ] },
  E: { fields: [
    FIELD('useCase', 'textarea', 'Describe the automation / AI use case', true),
    FIELD('channels', 'multiselect', 'Channels involved', false, { options: ['Website', 'WhatsApp', 'Instagram / Facebook', 'Mobile app', 'Email', 'Internal tools'] }),
    FIELD('systems', 'text', 'Existing systems to integrate (CRM, ERP, sheets…)', false),
  ] },
  F: { fields: [
    FIELD('environment', 'textarea', 'Current software / systems involved', true),
    FIELD('scope', 'multiselect', 'Scope', false, { options: ['Setup / implementation', 'Customization', 'Migration', 'Maintenance', 'Support'] }),
    FIELD('urgency', 'select', 'Urgency', false, { options: ['Immediate', 'Within a month', 'Planning ahead'] }),
  ] },
  G: { fields: [
    FIELD('platform', 'select', 'Store platform', true, { options: ['Amazon', 'Flipkart', 'Meesho', 'Own website', 'Multiple'] }),
    FIELD('catalogSize', 'number', 'Approximate catalog size (SKUs)', false),
    FIELD('integrations', 'multiselect', 'Integrations needed', false, { options: ['Payment gateway', 'Shipping / logistics', 'Inventory sync', 'Order management', 'Accounting'] }),
  ] },
  H: { fields: [
    FIELD('entityType', 'select', 'Business entity type', true, { options: ['Private Limited', 'LLP', 'Partnership', 'Proprietorship', 'Individual', 'Not decided — need advice'] }),
    FIELD('state', 'text', 'State of operation', true),
    FIELD('turnoverBand', 'select', 'Annual turnover band', false, { options: ['Under ₹20 lakh', '₹20 lakh – ₹1.5 crore', '₹1.5 crore – ₹5 crore', 'Above ₹5 crore'] }),
  ] },
  I: { fields: [
    FIELD('focusArea', 'multiselect', 'Consulting focus areas', false, { options: ['Business setup', 'E-commerce growth', 'Operations', 'Technology', 'Expansion / fundraising'] }),
    FIELD('businessStage', 'select', 'Business stage', false, { options: ['Idea stage', 'Early revenue', 'Growing', 'Established'] }),
  ] },
  J: { fields: [
    FIELD('researchGoal', 'textarea', 'What do you want to find out?', true),
    FIELD('outputFormat', 'select', 'Preferred output', false, { options: ['Written report', 'Spreadsheet / data', 'Presentation', 'Ongoing dashboard'] }),
  ] },
  K: { fields: [
    FIELD('lane', 'text', 'Origin → destination', true),
    FIELD('mode', 'multiselect', 'Transport modes', false, { options: ['Road', 'Rail', 'Air', 'Sea', 'Multi-modal'] }),
    FIELD('volumeBand', 'select', 'Monthly shipment volume', false, { options: ['Occasional', '1–50 shipments', '50–500 shipments', '500+ shipments'] }),
  ] },
  L: { fields: [
    FIELD('productType', 'text', 'Product type', true),
    FIELD('quantity', 'number', 'Target quantity (units)', true),
    FIELD('specifications', 'textarea', 'Specifications / samples / references', false),
    FIELD('material', 'text', 'Material requirements', false),
    FIELD('deliveryLocation', 'text', 'Delivery location', false),
  ] },
  M: { fields: [
    FIELD('packagingType', 'select', 'Type', true, { options: ['Product boxes / cartons', 'Labels & stickers', 'Pouches / flexible packs', 'Brochures / catalogs', 'Promotional material', 'Other'] }),
    FIELD('quantity', 'number', 'Quantity', true),
    FIELD('material', 'text', 'Material / paper / GSM preference', false),
    FIELD('artworkReady', 'select', 'Print artwork status', false, { options: ['Print-ready files available', 'Needs design work', 'Need help with both'] }),
  ] },
  N: { fields: [
    FIELD('contentType', 'select', 'Content type', true, { options: ['Product video', 'Promotional / brand film', 'Corporate video', 'Animation', 'Photography', 'Product photography', 'Content writing', 'Mixed'] }),
    FIELD('duration', 'text', 'Duration / volume', false),
    FIELD('location', 'text', 'Shoot location (if applicable)', false),
    FIELD('usage', 'select', 'Usage', false, { options: ['Social media', 'Marketplace listings', 'Website', 'TV / print', 'Multiple'] }),
  ] },
  O: { fields: [
    FIELD('channels', 'multiselect', 'Channels of interest', false, { options: ['SEO', 'Google Ads', 'Meta (FB/IG) Ads', 'Email marketing', 'WhatsApp marketing', 'Influencer marketing', 'Marketplace ads'] }),
    FIELD('goal', 'select', 'Primary goal', false, { options: ['Sales / orders', 'Leads', 'Brand awareness', 'App installs', 'Local visibility'] }),
    FIELD('spendBand', 'select', 'Comfortable monthly ad spend band', false, { options: ['Under ₹25k', '₹25k – ₹1 lakh', '₹1 lakh – ₹5 lakh', 'Above ₹5 lakh', 'Not sure yet'] }),
  ] },
  P: { fields: [
    FIELD('requirementDetails', 'textarea', 'Describe your requirement in detail', true),
    FIELD('approach', 'select', 'Preferred approach', false, { options: ['In-house team', 'Managed through vendors', 'Just connect me with a provider', 'Open to suggestions'] }),
  ] },
}

const DOC_PRESETS: Record<string, { documents: unknown[] }> = {
  C: { documents: [
    { id: 'gst-cert', label: 'GST certificate', category: 'GST', mandatory: true },
    { id: 'brand-auth', label: 'Brand authorization letter (if reselling)', category: 'BRAND', mandatory: false },
    { id: 'product-images', label: 'Product images / catalog', category: 'PRODUCT', mandatory: true },
  ] },
  D: { documents: [
    { id: 'pan', label: 'PAN card', category: 'PAN', mandatory: true },
    { id: 'aadhaar', label: 'Aadhaar card', category: 'AADHAAR', mandatory: true },
    { id: 'bank', label: 'Bank proof (cancelled cheque / statement)', category: 'BANK', mandatory: true },
  ] },
  H: { documents: [
    { id: 'pan', label: 'PAN card', category: 'PAN', mandatory: true },
    { id: 'address', label: 'Address proof of business', category: 'ADDRESS', mandatory: true },
    { id: 'bank', label: 'Bank statement / proof', category: 'BANK', mandatory: true },
  ] },
  M: { documents: [
    { id: 'artwork', label: 'Print-ready artwork / dieline', category: 'TECHNICAL', mandatory: true },
    { id: 'brand-guide', label: 'Brand guidelines', category: 'BRAND', mandatory: false },
  ] },
  N: { documents: [
    { id: 'product-list', label: 'Product list / shot list', category: 'REFERENCE', mandatory: false },
  ] },
}

const GENERIC_DOC = { documents: [] }

// ---------- universal catalog (A–P): defined in scripts/seed-catalog.ts ----------
// Subcategories for the two largest catalogs (demonstrates the hierarchy; admin can add more)
const SUBCATS: Record<string, { name: string; match: string[] }[]> = {
  A: [
    { name: 'Websites & Portals', match: ['Website Development', 'E-commerce Website Development', 'Web Portal Development'] },
    { name: 'Business Software', match: ['CRM', 'ERP', 'SAP', 'POS', 'Inventory', 'HRMS', 'Dashboard', 'Custom Software', 'SaaS'] },
    { name: 'Apps & APIs', match: ['Mobile Application', 'API Development'] },
  ],
  C: [
    { name: 'Marketplace Listings', match: ['Listing', 'Catalog', 'Content', 'Image'] },
    { name: 'Accounts & Optimization', match: ['ONDC', 'Brand Registration', 'Optimization', 'Account Management'] },
  ],
}

const FEATURED_FALLBACK_TIMELINE = 'Scoped per requirement'

async function main() {
  console.log('🌱 Seeding Universal Service Management Platform…')
  const pwd = async (p: string) => bcrypt.hash(p, 10)

  // ---------- wipe ----------
  await db.$transaction([
    db.activityLog.deleteMany(), db.notification.deleteMany(), db.message.deleteMany(),
    db.pendingTask.deleteMany(), db.projectTask.deleteMany(), db.milestone.deleteMany(),
    db.project.deleteMany(), db.invoice.deleteMany(), db.payment.deleteMany(),
    db.refund.deleteMany(), db.credentialShare.deleteMany(), db.quotationItem.deleteMany(),
    db.quotation.deleteMany(), db.documentRequest.deleteMany(), db.document.deleteMany(),
    db.vendorConnection.deleteMany(), db.vendorProfile.deleteMany(),
    db.requestStatusHistory.deleteMany(), db.serviceRequest.deleteMany(),
    db.service.deleteMany(), db.serviceSubcategory.deleteMany(), db.serviceCategory.deleteMany(),
    db.faq.deleteMany(), db.testimonial.deleteMany(), db.cmsPage.deleteMany(),
    db.systemSetting.deleteMany(), db.user.deleteMany(),
  ])

  // ---------- settings ----------
  const S = (key: string, value: string, category = 'GENERAL', label?: string) => ({ key, value, category, label })
  await db.systemSetting.createMany({ data: [
    S('siteName', 'SellerSetu', 'GENERAL', 'Platform name shown across the site'),
    S('tagline', 'One platform for every service your business needs', 'GENERAL', 'Homepage tagline'),
    S('heroTitle', 'Any service. One platform. A quote built for you.', 'CMS', 'Homepage hero headline'),
    S('heroSubtitle', 'From websites and branding to compliance, manufacturing and marketing — tell us what you need, receive a customized quotation, negotiate, and track delivery in one workspace.', 'CMS', 'Homepage hero subheading'),
    S('contactEmail', 'hello@sellersetu.in', 'GENERAL', 'Contact email'),
    S('contactPhone', '+91 98765 43210', 'GENERAL', 'Contact phone'),
    S('whatsapp', '+91 98765 43210', 'GENERAL', 'WhatsApp number'),
    S('contactAddress', '4th Floor, Trade Tower, MG Road, Bengaluru, Karnataka 560001', 'GENERAL', 'Office address'),
    S('legalName', 'SellerSetu Services Pvt. Ltd.', 'FINANCE', 'Registered entity name'),
    S('gstin', '29ABCDE1234F1Z5', 'FINANCE', 'Company GSTIN (printed on invoices)'),
    S('defaultGstRatePct', '18', 'FINANCE', 'Default GST % applied to new quotations'),
    S('footerNote', 'Commercial terms are always customized per requirement via quotation — no fixed price lists.', 'CMS', 'Footer note'),
  ] })

  // ---------- CMS pages ----------
  await db.cmsPage.createMany({ data: [
    { slug: 'how-it-works', title: 'How It Works', content: [
      '## 1. Tell us what you need',
      'Browse the catalog or describe any requirement — even one that is not listed. Submit details, references and documents in a guided form. You get a unique Request ID instantly.',
      '## 2. Receive a customized quotation',
      'Our team reviews your requirement, asks clarifying questions in the built-in chat, and prepares a line-item quotation with scope, deliverables, timeline and payment terms. No fixed price lists — every quote is built for your requirement.',
      '## 3. Negotiate and approve',
      'Accept the quotation, request changes, or discuss it with our team. Every revision is versioned, and the version you accept is locked as the commercial record for the engagement.',
      '## 4. Track execution in your workspace',
      'Each approved engagement gets a project workspace: milestones with weights, live progress %, documents, deliverables, payments and a chat with the team.',
      '## How your service is executed',
      '**In-house execution** — our own team does the work (software, design, listings, onboarding, AI).',
      '**Third-party managed service** — we manage the project end-to-end; a vetted vendor partner executes under our coordination. Vendor identities and internal margins stay internal.',
      '**Direct vendor connection** — for specialist needs (video production, manufacturing capacity), we connect you directly with a vetted provider for a facilitation fee. After introduction you contract with them directly; we stay available if you want managed add-ons.',
    ].join('\n\n') },
    { slug: 'about', title: 'About Us', content: [
      'SellerSetu is a universal service operations platform built for Indian businesses. We started as a marketplace-seller services desk and grew into a full service marketplace: software, design, compliance, manufacturing, logistics, marketing and anything else a business needs to move faster.',
      'Our model is simple — a single place to request any service, a quotation-first commercial process with no hidden price lists, and execution through our internal team or our vetted partner network under clear accountability.',
      'We operate on three execution models: in-house delivery, managed vendor execution, and direct vendor connections. Whichever model fits your requirement, you keep one workspace, one chat and one point of accountability.',
    ].join('\n\n') },
    { slug: 'privacy', title: 'Privacy Policy', content: [
      'Last updated: October 2026',
      '## What we collect',
      'Account details (name, email, phone, company), service requirements you submit, documents you upload, and communication inside the platform.',
      '## How we use it',
      'To deliver requested services, prepare quotations, coordinate execution (including sharing relevant details with vendors assigned to your project), issue invoices, and provide support. Internal team discussions about your project are kept separate from your chat view.',
      '## Documents & security',
      'Uploaded documents are stored securely with access restricted to project members. Passwords are hashed; access is role-based and audit-logged. Sensitive credentials shared through the vault feature are encrypted at rest.',
      '## Sharing',
      'We share information with vendors only for projects they are engaged on, and only what is needed for execution. We do not sell your data. Service providers requiring licensed professionals (e.g., certain compliance filings) are engaged accordingly.',
      '## Your rights',
      'You may request access, correction or deletion of your data by contacting us. We retain commercial records (quotations, invoices) as required by law.',
    ].join('\n\n') },
    { slug: 'terms', title: 'Terms & Conditions', content: [
      'Last updated: October 2026',
      '## Service scope',
      'All engagements are governed by the quotation you accept. The accepted quotation (including scope, deliverables, timeline and payment terms) is the locked commercial record for that engagement. Any change requires a revised quotation or written change request.',
      '## Quotations',
      'Quotations are valid for the period stated on them. Prices are exclusive of taxes unless stated. Revisions are versioned and supersede earlier versions.',
      '## Execution models',
      'Services are delivered in-house, through managed vendor partners, or via direct vendor connections. For direct connections, our fee covers facilitation only; the commercial contract for the underlying service is between you and the provider, and we are not liable for their performance unless a separate managed-service agreement is accepted.',
      '## Payments & refunds',
      'Payments become due as per the accepted quotation (advance, milestone-based or on delivery). Access to deliverables may be linked to cleared payments. Refunds, where applicable, follow the refund and adjustment policy recorded on the engagement.',
      '## Regulated services',
      'Services requiring licensed or authorized professionals (legal, tax, regulatory filings) are coordinated with appropriately qualified providers. We assist with documentation and coordination; approvals remain at the discretion of the relevant authorities.',
      '## Use of platform',
      'Do not upload unlawful content or share credentials outside the designated vault feature. Accounts may be suspended for misuse.',
    ].join('\n\n') },
  ] })

  // ---------- FAQ + testimonials ----------
  await db.faq.createMany({ data: [
    { question: 'How is pricing decided?', answer: 'There are no fixed price lists or packages. Every service is quoted after we understand your requirement. You receive a line-item quotation you can accept, reject or negotiate before any payment.', category: 'Pricing', sortOrder: 1 },
    { question: 'Can I request a service that is not listed?', answer: 'Yes. Choose "Other / Custom Services" (or select Custom while submitting) and describe what you need. The platform never rejects a request just because the category is missing.', category: 'Requests', sortOrder: 2 },
    { question: 'What are the execution models?', answer: 'In-house (our team executes), Third-party managed (a vetted vendor executes under our project management), and Direct vendor connection (we introduce you to a vetted provider for a facilitation fee and you work with them directly).', category: 'How it works', sortOrder: 3 },
    { question: 'What does the connection fee cover?', answer: 'For direct vendor connections, our one-time fee covers vetting, matching and facilitating the connection. The actual service price is negotiated directly between you and the provider.', category: 'Pricing', sortOrder: 4 },
    { question: 'Can I negotiate a quotation?', answer: 'Absolutely. Request revisions or discuss it in the chat. Each revision is a new version, and the accepted version is locked as the commercial record.', category: 'Quotations', sortOrder: 5 },
    { question: 'How do I track my work?', answer: 'Every request gets a dedicated workspace with milestones, a live progress percentage, documents, deliverables, payments and chat.', category: 'Tracking', sortOrder: 6 },
    { question: 'What documents will I need to provide?', answer: 'It depends on the service — the request form shows mandatory and optional documents, and the team can request additional ones during execution. You can also upload files anytime.', category: 'Documents', sortOrder: 7 },
    { question: 'Is my data safe?', answer: 'Role-based access control, hashed passwords, audit logs and restricted document access are built in. Internal team notes stay internal and are never visible to you or vendors.', category: 'Security', sortOrder: 8 },
  ] })

  await db.testimonial.createMany({ data: [
    { name: 'Rohit Malhotra', role: 'Founder, Urban Nest Interiors', logoUrl: '/logos/companies/urban-nest-interiors.png', quote: 'Got our website and catalog work quoted, negotiated in chat, and tracked milestones to delivery — all in one place. The quotation-first flow is refreshingly transparent.', rating: 5, sortOrder: 1 },
    { name: 'Sneha Kulkarni', role: 'Director, Nature Basket Foods', logoUrl: '/logos/companies/nature-basket-foods.png', quote: 'Packaging manufacturing was coordinated end-to-end — vendor, proofs, dispatch — while we watched progress from the dashboard.', rating: 5, sortOrder: 2 },
    { name: 'Imran Sheikh', role: 'Proprietor, Sheikh Traders', logoUrl: '/logos/companies/sheikh-traders.png', quote: 'They set up our marketplace accounts and listings in days. Clear document checklist, no surprises on billing.', rating: 4, sortOrder: 3 },
    { name: 'Ananya Rao', role: 'CEO, Craftly Brands', logoUrl: '/logos/companies/craftly-brands.png', quote: 'The direct-connection model found us a studio for product videos in 48 hours. We contracted directly; the fee was fair and upfront.', rating: 5, sortOrder: 4 },
  ] })

  // ---------- catalog ----------
  const catIdByCode: Record<string, string> = {}
  for (const c of CATALOG) {
    const row = await db.serviceCategory.create({ data: {
      code: c.code, slug: slugify(c.name), name: c.name, description: c.description,
      icon: c.icon, featured: !!c.featured?.length || ['P'].includes(c.code) === false && ['A','C','H','O'].includes(c.code),
      faqs: JSON.stringify(CATEGORY_FAQS[c.code] || []),
      sortOrder: c.code.charCodeAt(0) - 64,
    } })
    catIdByCode[c.code] = row.id
  }

  // subcategories
  for (const [code, subs] of Object.entries(SUBCATS)) {
    for (let i = 0; i < subs.length; i++) {
      const s = subs[i]
      await db.serviceSubcategory.create({ data: {
        categoryId: catIdByCode[code], slug: slugify(s.name), name: s.name, sortOrder: i,
      } })
    }
  }
  const subRows = await db.serviceSubcategory.findMany()

  const SCOPE_BY_CAT: Record<string, string[]> = {
    A: ['Requirement scoping & feature list', 'Design & development sprints', 'Testing, deployment & handover'],
    B: ['Concept directions', 'Revision rounds as agreed', 'Final source files'],
    C: ['Catalog audit & keyword research', 'Listing creation / optimization', 'Quality check & go-live'],
    D: ['Documentation preparation', 'Application submission & follow-up', 'Successful account activation'],
    E: ['Workflow mapping', 'Build & integration', 'Monitoring & handover'],
    H: ['Document checklist & preparation', 'Application coordination with professionals', 'Status tracking until disposal'],
    K: ['Partner identification & vetting', 'Rate & route coordination', 'Onboarding support'],
    L: ['Supplier shortlisting & sampling', 'Production coordination', 'QC & dispatch'],
    M: ['Specification & dieline validation', 'Vendor production management', 'Dispatch & delivery'],
    N: ['Brief & creative planning', 'Production scheduling', 'Final asset delivery'],
    O: ['Channel audit & strategy', 'Campaign build & launch', 'Reporting & optimization'],
  }
  const DELIVERABLES_BY_CAT: Record<string, string[]> = {
    A: ['Live website / application', 'Source code & credentials', 'Deployment & documentation'],
    B: ['Final design files (source formats)', 'Export-ready assets', 'Usage guidelines'],
    C: ['Published listings', 'Optimized content sheet', 'Live catalog audit report'],
    D: ['Activated account / registration', 'Credentials handover (via secure vault)', 'Compliance summary'],
    E: ['Working automation / bot', 'Integration documentation', 'Usage & monitoring guide'],
    H: ['Filed application acknowledgment', 'Registration certificate', 'Compliance file'],
    K: ['Vendor proposal comparison', 'Signed onboarding', 'Operating playbook'],
    L: ['Approved samples', 'Production schedule', 'QC & dispatch report'],
    M: ['Proof / dieline approvals', 'Manufactured goods at your warehouse', 'Production report'],
    N: ['Final edited assets', 'Usage licenses', 'Raw files (as agreed)'],
    O: ['Live campaigns', 'Monthly performance report', 'Optimization roadmap'],
  }

  let serviceCount = 0
  for (const c of CATALOG) {
    for (let i = 0; i < c.services.length; i++) {
      const name = c.services[i]
      const sub = (SUBCATS[c.code] || []).find((s) => s.match.some((m) => name.includes(m)))
      const detail = SERVICE_DETAILS[name]
      await db.service.create({ data: {
        categoryId: catIdByCode[c.code],
        subcategoryId: sub ? subRows.find((r) => r.name === sub.name && r.categoryId === catIdByCode[c.code])?.id ?? null : null,
        name, slug: slugify(name),
        description: detail?.description || `${name} delivered end-to-end under our ${c.exec === 'IN_HOUSE' ? 'in-house execution model' : c.exec === 'THIRD_PARTY_MANAGED' ? 'managed vendor model' : c.exec === 'DIRECT_CONNECTION' ? 'direct vendor connection model' : 'hybrid model'} — share your requirement and receive a customized, line-item quotation before any commitment.`,
        scopeExamples: JSON.stringify(detail?.scope || SCOPE_BY_CAT[c.code] || ['Requirement scoping', 'Execution & reviews', 'Final delivery']),
        deliverables: JSON.stringify(detail?.deliverables || DELIVERABLES_BY_CAT[c.code] || ['Agreed deliverables', 'Handover documentation']),
        process: JSON.stringify(detail?.process || []),
        executionType: c.exec,
        status: 'AVAILABLE',
        featured: !!(c.featured?.includes(name)),
        timeline: c.timeline || FEATURED_FALLBACK_TIMELINE,
        formConfig: JSON.stringify(FORM_PRESETS[c.code] || { fields: [] }),
        docRequirements: JSON.stringify(DOC_PRESETS[c.code] || GENERIC_DOC),
        icon: c.icon,
        displayOrder: i,
      } })
      serviceCount++
    }
  }
  console.log(`   catalog: ${Object.keys(catIdByCode).length} categories, ${serviceCount} services`)

  // ---------- users ----------
  const mkUser = async (email: string, name: string, role: string, password: string, extra: { phone?: string; company?: string } = {}) =>
    db.user.create({ data: { email, name, role, passwordHash: await pwd(password), phone: extra.phone, company: extra.company } })

  const admin = await mkUser('admin@sellersetu.in', 'Aarav Mehta', 'SUPER_ADMIN', 'Admin@123', { phone: '+91 98000 00001' })
  const ops = await mkUser('ops@sellersetu.in', 'Nisha Kapoor', 'OPS_MANAGER', 'Ops@123')
  const sales = await mkUser('sales@sellersetu.in', 'Vikram Rao', 'SALES_EXEC', 'Sales@123')
  const pm = await mkUser('pm@sellersetu.in', 'Kavya Iyer', 'PROJECT_MANAGER', 'Pm@123')
  const meera = await mkUser('meera@sellersetu.in', 'Meera Sharma', 'EMPLOYEE', 'Team@123')
  const arjun = await mkUser('arjun@sellersetu.in', 'Arjun Patel', 'EMPLOYEE', 'Team@123')
  const rahul = await mkUser('rahul@example.com', 'Rahul Verma', 'CUSTOMER', 'Customer@123', { company: 'Verma Interiors', phone: '+91 98000 00002' })
  const priya = await mkUser('priya@example.com', 'Priya Nair', 'CUSTOMER', 'Customer@123', { company: 'Nature Basket Foods', phone: '+91 98000 00003' })
  const vKriya = await mkUser('studio.kriya@example.com', 'Aditi Desai', 'VENDOR', 'Vendor@123', { company: 'Kriya Studio' })
  const vPack = await mkUser('sales.packpro@example.com', 'Suresh Gupta', 'VENDOR', 'Vendor@123', { company: 'PackPro Industries' })
  const vPrint = await mkUser('hello.printbazaar@example.com', 'Manish Jain', 'VENDOR', 'Vendor@123', { company: 'PrintBazaar' })

  await db.vendorProfile.createMany({ data: [
    { userId: vKriya.id, businessName: 'Kriya Studio', logoUrl: '/logos/companies/kriya-studio.png', contactPerson: 'Aditi Desai', phone: '+91 98000 00011', website: 'https://kriyastudio.example.com', description: 'Product & commercial photography, promo videos, corporate films. Studio in Bengaluru + on-location teams.', expertise: JSON.stringify(['Product Photography', 'Product Video Creation', 'Corporate Video Production', 'Animation']), serviceLocations: JSON.stringify(['Bengaluru', 'Mumbai', 'Hyderabad', 'On-location pan-India']), gstin: '29AAAPL1234C1ZV', address: 'No. 42, 2nd Floor, Indiranagar 100ft Road', city: 'Bengaluru', state: 'Karnataka', payoutMode: 'UPI', payoutAccountName: 'Kriya Studio Creative LLP', payoutUpiId: 'kriyastudio@okhdfcbank', status: 'APPROVED', rating: 4.8, completedProjects: 34, approvedById: admin.id, approvedAt: new Date(Date.now() - 220 * 864e5) },
    { userId: vPack.id, businessName: 'PackPro Industries', logoUrl: '/logos/companies/packpro-industries.png', contactPerson: 'Suresh Gupta', phone: '+91 98000 00012', website: 'https://packpro.example.com', description: 'Mono cartons, corrugated boxes, labels & flexible pouches. MOQ-friendly lines for D2C brands.', expertise: JSON.stringify(['Product Box Manufacturing', 'Label Printing', 'Carton Printing', 'Custom Packaging Sourcing']), serviceLocations: JSON.stringify(['Ahmedabad', 'Delhi NCR', 'Pune']), gstin: '24AAACP5678D1ZW', address: 'Plot 18, GIDC Phase II, Vatva', city: 'Ahmedabad', state: 'Gujarat', payoutMode: 'BANK', payoutAccountName: 'PackPro Industries Pvt Ltd', payoutAccountNumber: '50120439876501', payoutIfsc: 'HDFC0001523', status: 'APPROVED', rating: 4.6, completedProjects: 21, approvedById: admin.id, approvedAt: new Date(Date.now() - 180 * 864e5) },
    { userId: vPrint.id, businessName: 'PrintBazaar', logoUrl: '/logos/companies/printbazaar.png', contactPerson: 'Manish Jain', phone: '+91 98000 00013', description: 'Offset & digital printing: brochures, catalogs, promotional material.', expertise: JSON.stringify(['Brochure Printing', 'Promotional Material Printing']), serviceLocations: JSON.stringify(['Jaipur', 'Delhi NCR']), gstin: '08AAJCP9012F1ZQ', address: 'Shop 7, Sitapura Industrial Area', city: 'Jaipur', state: 'Rajasthan', status: 'PENDING' },
  ] })
  console.log('   users: 11 accounts across all roles, 3 vendor profiles')

  // ---------- demo data ----------
  const svc = async (name: string) => db.service.findUnique({ where: { slug: slugify(name) } })!

  // R1 — negotiation stage (rahul, website, IN_HOUSE)
  const web = await svc('Website Development')
  const r1 = await db.serviceRequest.create({ data: {
    requestCode: 'SR-2026-00001', customerId: rahul.id, title: 'Corporate website with CMS for Verma Interiors',
    description: 'Need a modern corporate website for our interior design studio with a projects gallery, services pages and an easy CMS so our team can update content. Should be mobile-first and fast.',
    expectedDeliverables: 'Live website, admin CMS, hosting setup, 30 days support',
    preferredTimeline: '6 weeks', projectLocation: 'Pune', serviceId: web!.id,
    formResponses: JSON.stringify({ websiteType: 'Corporate website', numPages: '12', features: ['Blog / CMS', 'Admin dashboard', 'Live chat'], references: 'https://studio.example.com', domainHosting: 'I have a domain only' }),
    stage: 'QUOTATION', status: 'NEGOTIATION', progress: 28, executionModel: 'IN_HOUSE',
    assignedToId: meera.id, pendingAction: 'Review the revised quotation and respond',
  } })
  const q1 = await db.quotation.create({ data: {
    quotationNo: 'QT-2026-00001', requestId: r1.id, version: 1, status: 'SENT', sentAt: new Date(),
    scope: 'Design & development of a 12-page corporate website with CMS, projects gallery and contact flows. Includes responsive build, basic SEO setup and deployment on customer hosting.',
    deliverablesNote: 'Live website, CMS access, deployment, 30 days post-launch support',
    timelineNote: '6 weeks from kickoff (2 weeks design, 3 weeks build, 1 week QA & launch)',
    paymentTerms: '40% advance on acceptance, 40% on design approval, 20% on launch',
    notes: 'Design directions: 2 concepts included. Content entry for up to 12 pages included.',
    subtotal: 62000, taxLabel: 'GST', taxRatePct: 18, taxAmount: 11160, total: 73160,
    validUntil: new Date(Date.now() + 14 * 864e5), createdById: sales.id,
  } })
  await db.quotationItem.createMany({ data: [
    { quotationId: q1.id, description: 'UI/UX design — desktop & mobile', detail: '2 concepts, 2 revision rounds', quantity: 1, unit: 'lot', unitPrice: 18000, amount: 18000, sortOrder: 1 },
    { quotationId: q1.id, description: 'Website development (React/Next.js + CMS)', detail: '12 pages, gallery, blog', quantity: 1, unit: 'lot', unitPrice: 35000, amount: 35000, sortOrder: 2 },
    { quotationId: q1.id, description: 'Deployment & 30-day support', detail: 'Hosting setup, SSL, monitoring', quantity: 1, unit: 'lot', unitPrice: 9000, amount: 9000, sortOrder: 3 },
  ] })
  await db.serviceRequest.update({ where: { id: r1.id }, data: {
    messages: { create: [
      { senderId: rahul.id, content: 'Hi — shared the references in the form. We would like the gallery to look like the one on our reference site.', isRead: true },
      { senderId: meera.id, content: 'Noted! The quotation is ready — please check the Quotation tab. Happy to walk through the line items.', isRead: true },
      { senderId: rahul.id, content: 'Can we bring the development line down a bit? Also can support be 45 days?', isRead: false },
    ] },
    statusHistory: { create: [
      { status: 'SUBMITTED', stage: 'REQUEST', progress: 5, createdById: rahul.id },
      { status: 'UNDER_REVIEW', stage: 'REQUEST', progress: 10, createdById: meera.id, note: 'Requirement clear; preparing quotation' },
      { status: 'QUOTATION_SENT', stage: 'QUOTATION', progress: 25, createdById: sales.id, note: 'Quotation v1 sent' },
      { status: 'NEGOTIATION', stage: 'QUOTATION', progress: 28, createdById: rahul.id, note: 'Customer asked for price adjustment on development line' },
    ] },
    tasks: { create: { title: 'Respond to customer negotiation on QT-2026-00001', owner: 'TEAM' } },
  } })
  await db.notification.createMany({ data: [
    { userId: meera.id, title: 'Negotiation on SR-2026-00001', body: 'Rahul asked to revisit the development line and extend support to 45 days.', requestId: r1.id, type: 'QUOTATION' },
    { userId: sales.id, title: 'Negotiation on SR-2026-00001', body: 'Customer requested a revised quotation for the website project.', requestId: r1.id, type: 'QUOTATION' },
  ] })

  // R2 — execution stage (priya, packaging, MANAGED vendor)
  const pack = await svc('Product Box Manufacturing')
  const r2 = await db.serviceRequest.create({ data: {
    requestCode: 'SR-2026-00002', customerId: priya.id, title: 'Packaging manufacturing — organic food line (5 SKUs)',
    description: 'Mono cartons for our organic food range: 5 SKUs, food-grade, premium matte finish with spot UV logo. Need structural design + printing + delivery to our Bengaluru warehouse.',
    expectedDeliverables: '15,000 boxes across 5 SKUs, delivered in 3 batches',
    preferredTimeline: '5 weeks', projectLocation: 'Bengaluru', serviceId: pack!.id,
    formResponses: JSON.stringify({ packagingType: 'Product boxes / cartons', quantity: '15000', material: '350 GSM SBS board, matte lamination', artworkReady: 'Needs design work' }),
    stage: 'EXECUTION', status: 'IN_PROGRESS', progress: 55, executionModel: 'THIRD_PARTY_MANAGED',
    assignedToId: pm.id, vendorId: vPack.id, pendingAction: 'Approve the final artwork proof',
  } })
  const q2 = await db.quotation.create({ data: {
    quotationNo: 'QT-2026-00002', requestId: r2.id, version: 1, status: 'ACCEPTED', sentAt: new Date(Date.now() - 20 * 864e5), acceptedAt: new Date(Date.now() - 18 * 864e5), lockedAt: new Date(Date.now() - 18 * 864e5),
    scope: 'Structural + graphic design of mono cartons for 5 SKUs, printing 15,000 boxes (food-grade, matte lamination, spot UV), quality check and batched delivery to Bengaluru warehouse. Managed service: vendor production coordinated by SellerSetu.',
    deliverablesNote: '15,000 finished boxes in 3 batches + production & QC report',
    timelineNote: '5 weeks: design 1.5 wks → plates & sampling 1 wk → production 2 wks → QC & dispatch',
    paymentTerms: '40% advance, 30% on design approval, 30% on final delivery',
    notes: 'Food-grade inks confirmed. Batch schedule to be aligned with your stock cycles.',
    subtotal: 186000, taxLabel: 'GST', taxRatePct: 18, taxAmount: 33480, total: 219480,
    createdById: sales.id,
  } })
  await db.quotationItem.createMany({ data: [
    { quotationId: q2.id, description: 'Structural & graphic design — 5 SKUs', detail: 'Dielines, proofs, 2 revision rounds', quantity: 5, unit: 'job', unitPrice: 6000, amount: 30000, sortOrder: 1 },
    { quotationId: q2.id, description: 'Printing & finishing — mono cartons', detail: '350 GSM SBS, matte lamination, spot UV', quantity: 15000, unit: 'pcs', unitPrice: 10.4, amount: 156000, sortOrder: 2 },
  ] })
  const p2 = await db.project.create({ data: {
    requestId: r2.id, status: 'IN_PROGRESS', executionModel: 'THIRD_PARTY_MANAGED', vendorId: vPack.id,
    startedAt: new Date(Date.now() - 17 * 864e5), expectedEndDate: new Date(Date.now() + 18 * 864e5), progressPct: 55,
  } })
  await db.milestone.createMany({ data: [
    { projectId: p2.id, title: 'Requirement finalization', description: 'SKU list, dielines, material spec confirmed', weight: 10, status: 'DONE', completedAt: new Date(Date.now() - 16 * 864e5), sortOrder: 1, vendorPayoutAmount: 25000, payoutStatus: 'RELEASED', payoutReleasedAt: new Date(Date.now() - 15 * 864e5), payoutNote: 'NEFT UTR HDFC0001523-421190033' },
    { projectId: p2.id, title: 'Design approval', description: 'Artwork proofs approved for all 5 SKUs', weight: 25, status: 'APPROVED', completedAt: new Date(Date.now() - 9 * 864e5), sortOrder: 2, vendorPayoutAmount: 95000, payoutStatus: 'RELEASED', payoutReleasedAt: new Date(Date.now() - 7 * 864e5), payoutNote: 'NEFT UTR HDFC0001523-421198776' },
    { projectId: p2.id, title: 'Manufacturing & printing', description: 'Production batches at vendor facility', weight: 45, status: 'IN_PROGRESS', dueDate: new Date(Date.now() + 12 * 864e5), sortOrder: 3, vendorPayoutAmount: 195000 },
    { projectId: p2.id, title: 'Quality check & dispatch', description: 'Batch QC, packing and delivery to Bengaluru warehouse', weight: 20, status: 'PENDING', sortOrder: 4, vendorPayoutAmount: 42000 },
  ] })
  await db.projectTask.createMany({ data: [
    { projectId: p2.id, title: 'Collect batch-1 samples from vendor', assigneeId: arjun.id, status: 'IN_PROGRESS', dueDate: new Date(Date.now() + 2 * 864e5) },
    { projectId: p2.id, title: 'Schedule batch-2 production slot', assigneeId: arjun.id, status: 'TODO', dueDate: new Date(Date.now() + 5 * 864e5) },
    { projectId: p2.id, title: 'Update dispatch plan with warehouse', assigneeId: pm.id, status: 'TODO' },
  ] })
  const advPay = await db.payment.create({ data: {
    requestId: r2.id, quotationId: q2.id, type: 'ADVANCE', label: 'Advance (40%)', amount: 74400, status: 'PAID', method: 'BANK_TRANSFER', transactionId: 'TXNDEMO24001', receiptNo: 'SR-2026-RCPT-A1001', paidAt: new Date(Date.now() - 17 * 864e5),
  } })
  const desPay = await db.payment.create({ data: {
    requestId: r2.id, quotationId: q2.id, type: 'MILESTONE', label: 'Design approval milestone (30%)', amount: 55800, status: 'PAID', method: 'BANK_TRANSFER', transactionId: 'TXNDEMO24002', receiptNo: 'SR-2026-RCPT-M2002', paidAt: new Date(Date.now() - 9 * 864e5),
  } })
  await db.invoice.createMany({ data: [
    { invoiceNo: 'INV-2026-00001', requestId: r2.id, paymentId: advPay.id, quotationId: q2.id, type: 'TAX_INVOICE', description: 'Advance payment — packaging manufacturing (40%)', amount: 74400, gstRatePct: 0, gstAmount: 0, totalAmount: 74400, billToName: 'Nature Basket Foods', billToGstin: '29AAAPN9999K1Z4', status: 'PAID', issuedById: admin.id },
    { invoiceNo: 'INV-2026-00002', requestId: r2.id, paymentId: desPay.id, quotationId: q2.id, type: 'TAX_INVOICE', description: 'Milestone payment — design approval (30%)', amount: 55800, gstRatePct: 0, gstAmount: 0, totalAmount: 55800, billToName: 'Nature Basket Foods', billToGstin: '29AAAPN9999K1Z4', status: 'PAID', issuedById: admin.id },
  ] })
  await db.vendorConnection.create({ data: {
    requestId: r2.id, vendorId: vPack.id, model: 'MANAGED', status: 'ACTIVE', managedFeeNote: 'Managed margin 18% on production line (internal)', authorizedAt: new Date(Date.now() - 17 * 864e5), notes: 'Batch production; samples before each batch dispatch.',
  } })
  await db.serviceRequest.update({ where: { id: r2.id }, data: {
    documentRequests: { create: [
      { title: 'FSSAI license copy', description: 'Required for food-grade packaging compliance records', category: 'LEGAL', source: 'STAFF', status: 'PENDING', dueDate: new Date(Date.now() + 3 * 864e5), requestedById: pm.id },
      { title: 'Brand logo pack (vector)', description: 'CDR/AI files for spot UV plate', category: 'BRAND', source: 'TEMPLATE', status: 'SUBMITTED', requestedById: pm.id },
      { title: 'Approved artwork proofs (5 SKUs)', description: 'Signed-off proof PDFs', category: 'TECHNICAL', source: 'TEMPLATE', status: 'APPROVED', requestedById: pm.id },
    ] },
    messages: { create: [
      { senderId: vPack.id, content: 'Batch-1 (3,000 boxes) is on the line. Sharing sheet photos tomorrow.', isRead: true },
      { senderId: pm.id, content: 'Thanks Suresh. Priya, batch-1 samples will reach you for sign-off before the full run.', isRead: true },
      { senderId: priya.id, content: 'Great — please make sure the spot UV registration is checked on the samples.', isRead: false },
    ] },
    statusHistory: { create: [
      { status: 'SUBMITTED', stage: 'REQUEST', progress: 5, createdById: priya.id },
      { status: 'QUOTATION_SENT', stage: 'QUOTATION', progress: 25, createdById: sales.id },
      { status: 'QUOTATION_ACCEPTED', stage: 'QUOTATION', progress: 35, createdById: priya.id, note: 'Accepted QT-2026-00002' },
      { status: 'IN_PROGRESS', stage: 'EXECUTION', progress: 55, createdById: pm.id, note: 'Design approved; manufacturing started' },
    ] },
    tasks: { create: { title: 'Approve final artwork proof (batch 2 SKUs)', owner: 'CUSTOMER' } },
    internalNotes: 'Vendor MOQ honored; margin note on connection. Batch-1 dispatch ETA Friday.',
  } })
  await db.notification.createMany({ data: [
    { userId: priya.id, title: 'Action needed on SR-2026-00002', body: 'Please approve the final artwork proof to keep batch-2 on schedule.', requestId: r2.id, type: 'PROJECT' },
    { userId: vPack.id, title: 'Payout released — SR-2026-00002', body: 'Payout for "Design approval" (₹95,000) has been released. Reference: NEFT UTR HDFC0001523-421198776. It should reach your registered bank account in 1-2 business days.', requestId: r2.id, type: 'PAYMENT' },
    { userId: vPack.id, title: 'New message on SR-2026-00002', body: 'Priya asked to check spot UV registration on samples.', requestId: r2.id, type: 'MESSAGE' },
  ] })

  // R3 — quotation sent for direct connection fee (rahul, photography)
  const photo = await svc('Product Photography')
  const r3 = await db.serviceRequest.create({ data: {
    requestCode: 'SR-2026-00003', customerId: rahul.id, title: 'Product photography — 20 SKUs for catalog',
    description: 'White-background + 2 lifestyle shots per SKU for our furniture catalog. Studio preferred in Pune or Bangalore.',
    expectedDeliverables: '60+ edited images, web & print resolutions',
    preferredTimeline: '2 weeks', serviceId: photo!.id,
    formResponses: JSON.stringify({ contentType: 'Product photography', duration: '20 SKUs', usage: 'Marketplace listings' }),
    stage: 'QUOTATION', status: 'QUOTATION_SENT', progress: 25, executionModel: 'DIRECT_CONNECTION', vendorId: vKriya.id,
    pendingAction: 'Pay the connection fee to unlock direct contact with Kriya Studio',
  } })
  const q3 = await db.quotation.create({ data: {
    quotationNo: 'QT-2026-00003', requestId: r3.id, version: 1, status: 'SENT', sentAt: new Date(),
    scope: 'Facilitation of a direct connection with Kriya Studio (vetted product-photography partner). Once the connection fee is settled, we introduce you directly and you negotiate the shoot scope & price with them.',
    deliverablesNote: 'Direct introduction & facilitated handover (service billed by the provider separately)',
    timelineNote: 'Introduction within 2 business days of fee settlement',
    paymentTerms: '100% on acceptance — this quotation covers the SellerSetu connection fee only',
    notes: 'Kriya Studio typical product-photography day rate is negotiated directly with you.',
    subtotal: 4999, taxLabel: 'GST', taxRatePct: 18, taxAmount: 899.82, total: 5898.82,
    createdById: sales.id,
  } })
  await db.quotationItem.createMany({ data: [
    { quotationId: q3.id, description: 'Direct vendor connection — product photography', detail: 'Vetting, matching & facilitated introduction', quantity: 1, unit: 'lot', unitPrice: 4999, amount: 4999, sortOrder: 1 },
  ] })
  await db.vendorConnection.create({ data: {
    requestId: r3.id, vendorId: vKriya.id, model: 'DIRECT_CONNECTION', status: 'PROPOSED', connectionFee: 4999, notes: 'Customer wants studio in Pune/Bangalore.',
  } })
  await db.serviceRequest.update({ where: { id: r3.id }, data: {
    statusHistory: { create: [
      { status: 'SUBMITTED', stage: 'REQUEST', progress: 5, createdById: rahul.id },
      { status: 'QUOTATION_SENT', stage: 'QUOTATION', progress: 25, createdById: sales.id, note: 'Connection-fee quotation sent' },
    ] },
  } })

  // R4 — draft custom request (rahul)
  await db.serviceRequest.create({ data: {
    requestCode: 'SR-2026-00004', customerId: rahul.id, title: 'Drone shoot for real estate project (draft)',
    description: 'Aerial footage for our upcoming township project — 4K, half-day shoot. (Draft — will finish requirements soon.)',
    stage: 'REQUEST', status: 'DRAFT', draft: true, executionModel: 'DIRECT_CONNECTION', customCategory: 'Media Production',
  } })

  // R5 — completed engagement (priya, compliance, HYBRID)
  const fssai = await svc('FSSAI Application Assistance')
  const r5 = await db.serviceRequest.create({ data: {
    requestCode: 'SR-2026-00005', customerId: priya.id, title: 'FSSAI registration for Nature Basket Foods',
    description: 'State FSSAI registration for our food processing unit, including documentation readiness and filing coordination.',
    stage: 'COMPLETION', status: 'COMPLETED', progress: 100, executionModel: 'HYBRID', assignedToId: arjun.id,
    createdAt: new Date(Date.now() - 60 * 864e5),
  } })
  const q5 = await db.quotation.create({ data: {
    quotationNo: 'QT-2026-00004', requestId: r5.id, version: 1, status: 'ACCEPTED', sentAt: new Date(Date.now() - 55 * 864e5), acceptedAt: new Date(Date.now() - 54 * 864e5), lockedAt: new Date(Date.now() - 54 * 864e5),
    scope: 'Documentation readiness, application preparation and filing coordination for State FSSAI registration. Professional/government fees billed at actuals with receipts.',
    paymentTerms: '100% advance (professional coordination fee)',
    subtotal: 3499, taxLabel: 'GST', taxRatePct: 18, taxAmount: 629.82, total: 4128.82, createdById: sales.id,
  } })
  await db.quotationItem.create({ data: { quotationId: q5.id, description: 'FSSAI registration — documentation & filing coordination', quantity: 1, unit: 'job', unitPrice: 3499, amount: 3499, sortOrder: 1 } })
  const p5 = await db.project.create({ data: { requestId: r5.id, status: 'COMPLETED', executionModel: 'HYBRID', startedAt: new Date(Date.now() - 53 * 864e5), completedAt: new Date(Date.now() - 20 * 864e5), progressPct: 100 } })
  await db.milestone.createMany({ data: [
    { projectId: p5.id, title: 'Documentation checklist cleared', weight: 40, status: 'APPROVED', completedAt: new Date(Date.now() - 40 * 864e5), sortOrder: 1 },
    { projectId: p5.id, title: 'Filing & follow-up', weight: 40, status: 'APPROVED', completedAt: new Date(Date.now() - 25 * 864e5), sortOrder: 2 },
    { projectId: p5.id, title: 'Certificate delivered', weight: 20, status: 'APPROVED', completedAt: new Date(Date.now() - 20 * 864e5), sortOrder: 3 },
  ] })
  const fPay = await db.payment.create({ data: { requestId: r5.id, quotationId: q5.id, type: 'ADVANCE', label: 'Full advance (100%)', amount: 4128.82, status: 'PAID', method: 'UPI', transactionId: 'TXNDEMO10005', receiptNo: 'SR-2026-RCPT-A3003', paidAt: new Date(Date.now() - 54 * 864e5) } })
  await db.invoice.create({ data: { invoiceNo: 'INV-2026-00003', requestId: r5.id, paymentId: fPay.id, quotationId: q5.id, type: 'TAX_INVOICE', description: 'FSSAI registration — coordination fee', amount: 4128.82, gstRatePct: 0, gstAmount: 0, totalAmount: 4128.82, billToName: 'Nature Basket Foods', billToGstin: '29AAAPN9999K1Z4', status: 'PAID', issuedById: admin.id } })
  await db.serviceRequest.update({ where: { id: r5.id }, data: {
    statusHistory: { create: [
      { status: 'SUBMITTED', stage: 'REQUEST', progress: 5, createdById: priya.id, createdAt: new Date(Date.now() - 60 * 864e5) },
      { status: 'QUOTATION_ACCEPTED', stage: 'QUOTATION', progress: 35, createdById: priya.id, createdAt: new Date(Date.now() - 54 * 864e5) },
      { status: 'IN_PROGRESS', stage: 'EXECUTION', progress: 60, createdById: arjun.id, createdAt: new Date(Date.now() - 45 * 864e5) },
      { status: 'COMPLETED', stage: 'COMPLETION', progress: 100, createdById: arjun.id, note: 'Registration certificate delivered', createdAt: new Date(Date.now() - 20 * 864e5) },
    ] },
  } })

  // R6 — fresh request under review (rahul, AI automation)
  const wapp = await svc('WhatsApp Automation')
  const r6 = await db.serviceRequest.create({ data: {
    requestCode: 'SR-2026-00006', customerId: rahul.id, title: 'WhatsApp automation for lead follow-up',
    description: 'When someone fills our website form, send an instant WhatsApp greeting and follow up over 3 days automatically. Leads land in a Google Sheet.',
    expectedDeliverables: 'Working automation + handover docs', preferredTimeline: '2 weeks',
    serviceId: wapp!.id, formResponses: JSON.stringify({ useCase: 'Auto follow-up on website leads', channels: ['WhatsApp', 'Website'], systems: 'Google Sheets' }),
    stage: 'REQUEST', status: 'UNDER_REVIEW', progress: 10, executionModel: 'IN_HOUSE', assignedToId: arjun.id,
  } })
  await db.serviceRequest.update({ where: { id: r6.id }, data: {
    statusHistory: { create: [
      { status: 'SUBMITTED', stage: 'REQUEST', progress: 5, createdById: rahul.id },
      { status: 'UNDER_REVIEW', stage: 'REQUEST', progress: 10, createdById: arjun.id, note: 'Checking WhatsApp Business API prerequisites' },
    ] },
  } })
  await db.notification.createMany({ data: [
    { userId: arjun.id, title: 'New request assigned — SR-2026-00006', body: 'WhatsApp automation for lead follow-up. Review requirement and prepare a quotation.', requestId: r6.id, type: 'STATUS' },
  ] })

  console.log('   demo data: 6 requests, 4 quotations, 2 projects, 7 milestones, connections, payments & invoices')

  // ---------- audit ----------
  await db.activityLog.createMany({ data: [
    { userId: admin.id, action: 'SEED', details: 'Universal platform seed applied: 16 categories, services, users, demo engagements' },
  ] })

  console.log('✅ Seed complete.')
  console.log('   Logins: admin@sellersetu.in/Admin@123 · ops@sellersetu.in/Ops@123 · sales@sellersetu.in/Sales@123 · pm@sellersetu.in/Pm@123 · meera@sellersetu.in/Team@123 · rahul@example.com/Customer@123 · priya@example.com/Customer@123 · studio.kriya@example.com/Vendor@123')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
