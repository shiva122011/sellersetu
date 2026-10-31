import { SD, ServiceDetailData } from './types'

// Category O — Marketing & Lead Generation (9) · Category P — Other / Custom Services (1)
export const DETAILS_O_P: Record<string, ServiceDetailData> = {

  // ---------- O: MARKETING & LEAD GENERATION ----------
  'Digital Marketing': SD(
    'Full-funnel digital marketing managed end-to-end — strategy, channels, creative coordination, execution and reporting — with budgets planned against your goals and every claim traceable to a dashboard, not a screenshot.',
    ['Goal & funnel strategy workshop', 'Channel plan with budget allocation', 'Creative & content coordination', 'Campaign execution across agreed channels', 'Monthly performance reporting & review'],
    ['Digital marketing strategy document', 'Live campaigns per channel plan', 'Monthly performance report (spend vs results)', 'Creative calendar', 'Quarterly strategy review'],
    [['Set the strategy', 'Goals, audience and funnel stages mapped; budget allocated to channels.'],
     ['Build assets', 'Creatives, landing pages and tracking set up before spend starts.'],
     ['Launch & optimize', 'Campaigns run with weekly optimization against agreed KPIs.'],
     ['Report honestly', 'Monthly reviews show spend, results, learnings and next moves.']],
  ),
  'SEO': SD(
    'Search visibility built on fundamentals — technical fixes, content depth, on-page optimization and authority development — with monthly reporting on rankings, traffic and the work done, no magic guarantees.',
    ['Technical SEO audit & fixes', 'Keyword mapping to pages/intent', 'On-page & content optimization', 'Content plan & publishing support', 'Authority-building (ethical, white-hat only)'],
    ['Technical audit with fix log', 'Keyword map & rank tracking', 'Optimized pages & new content', 'Monthly SEO report (ranks, traffic, actions)', 'Google Search Console insights summary'],
    [['Audit technically', 'Crawlability, speed, structure and indexing issues fixed first.'],
     ['Map keywords', 'Search terms mapped to pages by intent, not just volume.'],
     ['Improve content', 'Pages rewritten/expanded to genuinely answer searcher questions.'],
     ['Build authority & report', 'Ethical authority work plus monthly transparent reporting.']],
  ),
  'Performance Marketing': SD(
    'Paid campaigns managed for return, not reach — Google Ads, Meta and marketplace ads with conversion tracking done correctly, audiences tested systematically and budgets reallocated weekly to what works.',
    ['Tracking & conversion setup (GA4, pixels, CAPI as needed)', 'Campaign structure & audience plan', 'Ad creative & copy coordination', 'Daily/weekly bid & budget optimization', 'ROAS/CPA reporting'],
    ['Live campaigns across selected platforms', 'Conversion tracking verified', 'Weekly optimization log', 'Monthly performance report (spend, CPA/ROAS)', 'Scaling & testing roadmap'],
    [['Fix tracking first', 'Conversions measured reliably before a rupee is spent.'],
     ['Structure campaigns', 'Clean account structure with systematic audience and creative tests.'],
     ['Optimize weekly', 'Budgets shifted to winners; losers killed without sentiment.'],
     ['Scale carefully', 'Winners scaled in steps without wrecking efficiency.']],
  ),
  'Social Media Management': SD(
    'Social presence run professionally — content calendars, creation coordination, posting, community responses and monthly analytics — consistent enough to build a brand, responsive enough to keep it human.',
    ['Platform strategy & content pillars', 'Monthly content calendar', 'Creation & posting management', 'Community responses within agreed hours', 'Monthly growth & engagement report'],
    ['Monthly content calendar (in advance)', 'Published posts per calendar', 'Community response log', 'Monthly analytics report', 'Quarterly strategy tune-up'],
    [['Set the pillars', 'Content themes and platform mix agreed to match audience behaviour.'],
     ['Calendar & create', 'A month of content planned ahead and produced to brief.'],
     ['Publish & engage', 'Posts go live on schedule; comments and DMs answered in time.'],
     ['Measure & tune', 'Growth and engagement reviewed monthly; the plan adjusts.']],
  ),
  'Lead Generation': SD(
    'Qualified leads delivered through defined channels — outbound lists and outreach, paid lead campaigns, and landing-page funnels — with quality filters and CRM-ready handoffs, not raw scraped spreadsheets.',
    ['ICP definition & qualification criteria', 'Channel & offer strategy (outbound/paid/organic)', 'List building & verification (as applicable)', 'Campaign/sequence execution', 'Lead handoff & quality reporting'],
    ['Leads in agreed format/CRM handoff', 'Source & campaign attribution sheet', 'Weekly lead-quality report', 'Funnel conversion summary', 'Optimization recommendations'],
    [['Define qualified', 'What a good lead is, agreed in writing before generating any.'],
     ['Build the engine', 'Lists verified, creative and sequences prepared, tracking in place.'],
     ['Generate & filter', 'Campaigns run with qualification filters applied early.'],
     ['Hand off & measure', 'Leads delivered CRM-ready with quality reviewed weekly.']],
  ),
  'Email Marketing': SD(
    'Email that customers actually open — list hygiene, template design, campaign automation (welcome, nurture, winback) and deliverability management, with reporting on opens, clicks and revenue.',
    ['List audit, segmentation & hygiene', 'Template design (brand-consistent, responsive)', 'Campaign/automation setup (welcome, nurture, promotional)', 'Deliverability management (SPF/DKIM/DMARC guidance)', 'Monthly performance reporting'],
    ['Email template library', 'Live automations & campaigns', 'Segmentation framework', 'Deliverability checklist applied', 'Monthly report (opens, clicks, conversions)'],
    [['Clean the list', 'Dead addresses and unengaged contacts pruned to protect deliverability.'],
     ['Design & automate', 'Templates built; core automations set up first.'],
     ['Send strategically', 'Campaigns scheduled by segment with clear purposes.'],
     ['Report & improve', 'Metrics reviewed monthly; subject lines and timing iterated.']],
  ),
  'WhatsApp Marketing': SD(
    'WhatsApp marketing run compliantly on the Business Platform — approved templates, segmented broadcasts, catalog messages and click-to-WhatsApp ads — protecting your number quality while driving conversations.',
    ['WABA compliance & template strategy', 'Audience segmentation & opt-in management', 'Broadcast campaigns with approved templates', 'Click-to-WhatsApp ad coordination (as scoped)', 'Delivery/read/response reporting'],
    ['Approved template library', 'Executed broadcast campaigns', 'Segment & opt-in records', 'Monthly performance report', 'Quality-rating protection playbook'],
    [['Stay compliant', 'Templates approved and opt-ins verified — quality rating is everything.'],
     ['Segment & schedule', 'Audiences segmented; sends timed to response behaviour.'],
     ['Execute & engage', 'Broadcasts run with reply handling per agreed SLA.'],
     ['Measure', 'Delivery, reads and responses reported against spend.']],
  ),
  'Marketing Automation': SD(
    'Marketing that runs on rails — lead capture to nurture to handoff automated across email, WhatsApp and CRM — with journeys mapped to your funnel and every step measurable.',
    ['Funnel & journey mapping', 'Tool selection & setup (email/WhatsApp/CRM)', 'Journey & trigger implementation', 'Lead scoring & handoff rules', 'Dashboards & documentation'],
    ['Live automated journeys', 'Journey map documentation', 'Lead scoring & routing rules', 'Performance dashboard', 'Team training & handover'],
    [['Map journeys', 'Every path from stranger to sales-ready lead drawn out.'],
     ['Connect tools', 'Email, WhatsApp and CRM wired into one flow.'],
     ['Automate triggers', 'Behaviour-based sends and tasks implemented.'],
     ['Measure handoffs', 'Dashboards show what converts and where leads stall.']],
  ),
  'Campaign Management': SD(
    'Time-boxed campaigns managed end-to-end — product launches, festive sales, exhibitions and seasonal pushes — coordinated across channels with a single calendar, owner and post-campaign review.',
    ['Campaign brief, offer & audience definition', 'Cross-channel plan & calendar', 'Asset production coordination', 'Launch execution & monitoring', 'Post-campaign review & learnings'],
    ['Campaign plan & calendar', 'Live campaign across agreed channels', 'Daily monitoring during flight', 'Results report vs targets', 'Learnings document for next time'],
    [['Brief it', 'Offer, audience, budget and success metrics agreed in one page.'],
     ['Plan channels', 'Every touchpoint calendared with owners and dependencies.'],
     ['Launch & watch', 'Execution monitored daily with budget/response adjustments.'],
     ['Review honestly', 'Results vs targets reviewed; learnings written down.']],
  ),

  // ---------- P: OTHER / CUSTOM SERVICES ----------
  'Custom / Not-Listed Service': SD(
    'Anything not in the catalog — unusual compliance work, niche manufacturing, one-off technical projects, multi-service bundles — scoped by our team, quoted line-by-line and delivered through the right execution model for the job.',
    ['Requirement discovery & feasibility discussion', 'Scope written and confirmed', 'Execution model recommendation (in-house/managed/connection)', 'Milestone-based delivery plan', 'Regular progress reviews'],
    ['Written scope document', 'Line-item quotation (after scoping)', 'Agreed deliverables per milestone', 'Single point of accountability in workspace', 'Delivery & handover documentation'],
    [['Tell us the need', 'Describe the requirement in the form — detail helps us scope faster.'],
     ['Clarify together', 'Questions resolved in chat or a call; ambiguities surfaced early.'],
     ['Receive the quote', 'A line-item quotation with scope and terms, revisable through negotiation.'],
     ['Track delivery', 'Work runs as a tracked project with milestones and progress you can see.']],
  ),
}
