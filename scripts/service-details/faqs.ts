import { FAQ } from './types'

// Category-level FAQs shown on every service detail page of that category.
// Admin-editable via the catalog backend (ServiceCategory.faqs).
export const CATEGORY_FAQS: Record<string, { q: string; a: string }[]> = {
  A: [
    FAQ('Who owns the code you build?', 'You do. On final delivery you receive the complete source code, and the accepted quotation governs ownership of all work product.'),
    FAQ('Can you work with our existing hosting and tools?', 'Yes — we deploy on your hosting/cloud and integrate with tools you already use. If you need hosting or setup help, that is scoped into the quotation.'),
    FAQ('How are revisions handled during development?', 'Design and build milestones include structured revision rounds defined in the quotation. Changes beyond that scope are quoted as a change request.'),
    FAQ('Do you provide support after launch?', 'Every build includes a documented post-launch support window. Ongoing maintenance is available as a separate quoted engagement.'),
  ],
  B: [
    FAQ('What if I do not like the initial concepts?', 'You receive distinct concept directions, not variations of one idea, and structured revision rounds to refine the chosen direction. The process is built to converge on something you approve.'),
    FAQ('Do I get the source files?', 'Yes — final files include editable source formats (Figma/AI/InDesign as applicable), not just exports.'),
    FAQ('Who owns the final design?', 'You receive full rights to the approved final design, as set out in the accepted quotation.'),
    FAQ('Can you follow our existing brand guidelines?', 'Absolutely. Share your guidelines in the request form and every deliverable will be produced within them.'),
  ],
  C: [
    FAQ('Which marketplaces do you support?', 'Amazon, Flipkart, Meesho, Blinkit, Zepto, Swiggy Instamart and ONDC — plus your own store catalog where needed.'),
    FAQ('Do I need a registered trademark for listings?', 'Not for regular listings. Brand registry and A+ content require trademark-backed brand registration, which we can assist with separately.'),
    FAQ('Can you fix suppressed or blocked listings?', 'Yes — listing audits and correction cycles are part of our listing and optimization services; account-level issues are handled under account management.'),
    FAQ('What do you need from me to start?', 'Basic product information, images and seller account access. The request form lists everything, and our team follows up on gaps.'),
  ],
  D: [
    FAQ('How long does account approval take?', 'It depends on the platform — typically 3 to 15 working days after clean submission. Document readiness is the biggest factor, which is exactly what we prepare first.'),
    FAQ('What if my application was rejected earlier?', 'Choose "Rejected Application Assistance" — we analyze the rejection reason, correct the documentation and resubmit with the issue properly addressed.'),
    FAQ('Are my documents safe with you?', 'Documents are uploaded through the platform with role-based access limited to the team working on your request, and credentials are shared only through the encrypted vault.'),
    FAQ('Do you guarantee approval?', 'No ethical provider can guarantee a third party\u2019s decision. We guarantee correct preparation, prompt query handling and persistent follow-up until a clear outcome.'),
  ],
  E: [
    FAQ('Will the AI make things up about my business?', 'We build assistants grounded in your content with guardrails and human-handover rules — the design goal is dependable answers, not impressive demos.'),
    FAQ('What systems can you integrate with?', 'Common tools (CRMs, Google Sheets, WhatsApp Business, helpdesks, ERPs) plus any system exposing an API. We confirm feasibility during scoping.'),
    FAQ('How is ongoing tuning handled?', 'Deployment includes a tuning window, and ongoing improvement is available as a monthly engagement with conversation/usage analytics.'),
    FAQ('Do I need technical staff to run this?', 'No — day-to-day operation is designed for your business users, with documentation and training provided at handover.'),
  ],
  F: [
    FAQ('Do you work on software we bought elsewhere?', 'Yes — implementation, customization, integration and maintenance of third-party software is a large part of this category.'),
    FAQ('Can you take over maintenance from our previous team?', 'Yes. We start with a health assessment and knowledge-transfer review, then agree an SLA for response times.'),
    FAQ('How do you charge for ongoing work?', 'Maintenance is quoted per scope (hours or a monthly cadence) after assessing the application — no generic packages.'),
    FAQ('Can you migrate us to the cloud?', 'Yes — cloud setup and migration are handled with parity checklists, staging rehearsals and rollback plans.'),
  ],
  G: [
    FAQ('Which platforms does this cover?', 'Your own website/store plus marketplaces — Amazon, Flipkart, Meesho and others — with orders and inventory kept in sync.'),
    FAQ('Can you integrate with our ERP or accounting tool?', 'In most cases yes. The request form asks what systems you run; we confirm feasibility and approach before quoting.'),
    FAQ('Will this stop overselling?', 'Inventory synchronization with channel buffers is designed exactly for that — it keeps one stock truth across channels.'),
    FAQ('Is this a one-time setup or ongoing?', 'Both exist. Setup/integration is one-time; operations and catalog management run on a cadence you choose.'),
  ],
  H: [
    FAQ('Are you the ones who file my registration?', 'Services requiring licensed professionals are coordinated with qualified CAs/CSs/trademark attorneys. We manage documentation, coordination and tracking end-to-end.'),
    FAQ('What are government/professional fees?', 'Statutory fees are billed at actuals with receipts — our quotation covers professional coordination, clearly separated.'),
    FAQ('How long do registrations take?', 'It varies by application type — GST can be days, incorporations take a few weeks. Your quotation states indicative timelines per filing.'),
    FAQ('Do you handle objections or queries from the department?', 'Yes — responding to officer/department queries within deadlines is part of the coordination we manage until disposal.'),
  ],
  I: [
    FAQ('Who delivers the consulting?', 'Consultants and operators with hands-on experience in the relevant domain — matched to your industry and stage during scoping.'),
    FAQ('Is this advice-only or do you implement?', 'Your choice. Engagements can be advisory, or advisory plus implementation through our services and vendor network.'),
    FAQ('How is the engagement structured?', 'Usually a fixed-scope diagnostic followed by an implementation roadmap — both quoted line-by-line before you commit.'),
    FAQ('Will I get documents I can act on?', 'Yes — every engagement produces written deliverables: reports, roadmaps, SOPs or models you can execute from.'),
  ],
  J: [
    FAQ('Where does your data come from?', 'A stated mix of public sources, trade data, platform data and (where scoped) primary research — every report includes a source bibliography.'),
    FAQ('How do you ensure data quality?', 'Collection follows a field specification with sampling QA, de-duplication and validation steps, documented in the deliverable.'),
    FAQ('Can research be refreshed later?', 'Yes — most research formats are designed to be refreshed (monthly or quarterly) as a repeat engagement.'),
    FAQ('What format do I receive?', 'Your choice from the request form: written report, spreadsheet, presentation or a recurring dashboard.'),
  ],
  K: [
    FAQ('Do you own trucks or warehouses?', 'No — we coordinate a vetted network of logistics providers and warehouses, and manage the engagement so you have one accountable point of contact.'),
    FAQ('Who is responsible for damage in transit?', 'Provider liability applies as per their terms, with insurance arranged where scoped. Claims handling is part of our coordination.'),
    FAQ('Can you handle COD remittance?', 'Yes — COD cycles and reconciliation are configured during partner onboarding and tracked in reporting.'),
    FAQ('What do you need to quote freight?', 'Lanes, typical weights/volumes and frequency. The request form captures these so quotes are comparable.'),
  ],
  L: [
    FAQ('Do you own factories?', 'No — we identify, verify and coordinate manufacturers, managing sampling, QC and dispatch on your behalf under the managed model.'),
    FAQ('Can you sign an NDA before sharing designs?', 'Yes — NDAs are standard practice before drawings or specifications go to any manufacturer.'),
    FAQ('What is the minimum order quantity?', 'It depends on product and material — MOQs are negotiated and stated clearly in quotations before you commit.'),
    FAQ('How is quality controlled?', 'Through staged checkpoints: pre-production samples, first-article approval, in-process checks and pre-dispatch QC, with reports you receive.'),
  ],
  M: [
    FAQ('Can you print from my existing artwork?', 'Yes — send your files in the request form. We pre-flight them, flag print issues and only proceed on approved proofs.'),
    FAQ('What if I need design help too?', 'Packaging/label design is available as a separate design service; both can be combined into one engagement.'),
    FAQ('What are typical minimum orders?', 'Digital printing runs low MOQs; offset and manufacturing runs have quantity minimums — quotations state them upfront so you can plan.'),
    FAQ('Do you check quality before dispatch?', 'Yes — batch QC against approved samples/proofs is part of managed production, and reports are shared with you.'),
  ],
  N: [
    FAQ('Who shoots the content?', 'Specialist photographers and studios from our vetted network, matched to your brief — coordinated by us end-to-end.'),
    FAQ('Do we get usage rights?', 'Yes — usage licensing is documented in the quotation (platforms, duration, territory) so there are no surprises later.'),
    FAQ('Can you shoot at our location?', 'Yes — on-location shoots are common; logistics and permissions are coordinated during planning.'),
    FAQ('How many revisions do we get?', 'Structured revision rounds are stated in the quotation per deliverable — enough to converge without endless loops.'),
  ],
  O: [
    FAQ('Do you guarantee results or rankings?', 'No ethical agency guarantees rankings or ROAS. We commit to transparent reporting, defined KPIs and systematic optimization — and we show you the dashboards.'),
    FAQ('Who controls the ad budget?', 'You do. Budgets are set by you and spent against the agreed plan; accounts and data remain yours.'),
    FAQ('What is the minimum engagement?', 'Campaigns have natural minimums (platform learning phases, content production) — your quotation states the practical floor for your goals.'),
    FAQ('Do I keep the accounts and data?', 'Always. Ad accounts, pixels, pages and audiences are set up under your ownership — we operate, you own.'),
  ],
  P: [
    FAQ('Is there really no limit on what I can request?', 'If it is a legitimate business service, we will scope it — the platform was built for requirements that do not fit categories.'),
    FAQ('How long does scoping take?', 'Usually 1-3 business days depending on complexity; we ask clarifying questions in chat rather than guessing.'),
    FAQ('Who executes custom work?', 'Whichever model fits: our in-house team, a managed vendor, or a direct connection — recommended and explained in the quotation.'),
    FAQ('What does it cost?', 'Nothing until you accept a quotation. Scoping and quoting are free; the accepted quotation defines all commercial terms.'),
  ],
}
