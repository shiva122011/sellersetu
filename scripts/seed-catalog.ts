// Universal catalog definition — 16 categories (A–P), shared by scripts/seed.ts
// and scripts/service-details/check.ts so coverage is validated from one source.
export interface CatDef {
  code: string
  name: string
  icon: string
  description: string
  exec: string
  featured?: string[]
  timeline: string
  services: string[]
}

export const CATALOG: CatDef[] = [
  { code: 'A', name: 'Website & Software Development', icon: 'code', timeline: '2–10 weeks', exec: 'IN_HOUSE',
    featured: ['Website Development', 'E-commerce Website Development', 'CRM Development', 'SaaS Application Development'],
    description: 'Websites, web portals, custom software, mobile apps, CRMs, ERPs and SaaS products engineered by our in-house development team.',
    services: ['Website Development', 'E-commerce Website Development', 'Web Portal Development', 'Custom Software Development', 'CRM Development', 'ERP Development', 'SAP Development / Integration', 'Mobile Application Development', 'API Development & Integration', 'POS Software Development', 'Inventory Management Software', 'HRMS Development', 'Custom Dashboard Development', 'SaaS Application Development'] },
  { code: 'B', name: 'Design Services', icon: 'palette', timeline: '3 days – 4 weeks', exec: 'IN_HOUSE',
    featured: ['Logo Design', 'Brand Identity Design', 'Website UI/UX Design'],
    description: 'UI/UX, branding, print and product design crafted by our design studio — from a single logo to a complete identity system.',
    services: ['Website UI/UX Design', 'Mobile Application Design', 'Logo Design', 'Brand Identity Design', 'Graphic Design', 'Product Packaging Design', 'Label Design', 'Brochure & Catalog Design', 'Social Media Creative Design', 'Product Mockup Design', '2D & 3D Design', 'CAD Design', 'Presentation Design'] },
  { code: 'C', name: 'Product Listing & Marketplace Services', icon: 'shopping-bag', timeline: '3 – 21 days', exec: 'IN_HOUSE',
    featured: ['Amazon Product Listing', 'Flipkart Product Listing', 'Meesho Product Listing', 'ONDC Seller Onboarding'],
    description: 'Listing creation, catalog optimization and account management across Amazon, Flipkart, Meesho, quick-commerce and ONDC.',
    services: ['Amazon Product Listing', 'Flipkart Product Listing', 'Blinkit Product Listing', 'Zepto Product Listing', 'Swiggy Instamart Listing', 'Meesho Product Listing', 'ONDC Seller Onboarding', 'Marketplace Catalog Creation', 'Listing Optimization', 'Marketplace Brand Registration Assistance', 'Product Content Preparation', 'Product Image Coordination', 'Marketplace Account Management'] },
  { code: 'D', name: 'Account Creation & Platform Onboarding', icon: 'user-plus', timeline: '3 – 15 days', exec: 'IN_HOUSE',
    featured: ['Marketplace Seller Account Creation', 'Payment Gateway Onboarding'],
    description: 'Seller accounts, business platform registrations, payment gateways, shipping aggregators and verification assistance.',
    services: ['Marketplace Seller Account Creation', 'Business Platform Registration', 'Online Portal Account Setup', 'Payment Gateway Onboarding', 'Shipping Aggregator Account Setup', 'Vendor Registration on Business Platforms', 'Government Portal Account Setup', 'Digital Service Account Creation', 'Platform Verification Assistance', 'Account Troubleshooting', 'Rejected Application Assistance', 'Platform Documentation Support'] },
  { code: 'E', name: 'AI & Automation Services', icon: 'bot', timeline: '1 – 8 weeks', exec: 'IN_HOUSE',
    featured: ['AI Chatbot Development', 'WhatsApp Automation', 'Business Workflow Automation'],
    description: 'Chatbots, AI agents, workflow automation and custom AI software that removes repetitive work from your business.',
    services: ['AI Chatbot Development', 'AI Agent Development', 'Business Workflow Automation', 'WhatsApp Automation', 'Customer Support Automation', 'AI Integration', 'Document Processing Automation', 'CRM Automation', 'API-Based Automation', 'Custom AI Software Solutions'] },
  { code: 'F', name: 'Software & Technology Services', icon: 'server', timeline: 'Ongoing / per scope', exec: 'IN_HOUSE',
    description: 'Implementation, customization, integration, maintenance, cloud setup and migration for the software you already run.',
    services: ['Software Implementation', 'Software Customization', 'System Integration', 'Database Management', 'Website Maintenance', 'Application Maintenance', 'Cloud Setup', 'Server Configuration', 'Technical Consulting', 'Software Migration'] },
  { code: 'G', name: 'E-commerce Services', icon: 'store', timeline: '1 – 4 weeks', exec: 'IN_HOUSE',
    description: 'Store setup, catalog management, order and inventory operations for sellers on marketplaces and their own websites.',
    services: ['Online Store Setup', 'Marketplace Store Management', 'Product Catalog Management', 'Order Management Integration', 'Inventory Synchronization', 'Payment Gateway Integration', 'Shipping Integration', 'E-commerce Automation', 'Marketplace Operations Support'] },
  { code: 'H', name: 'Business Registration & Compliance', icon: 'file-check', timeline: '1 – 6 weeks', exec: 'HYBRID',
    featured: ['Company Registration Assistance', 'GST Registration & Amendment Assistance', 'FSSAI Application Assistance'],
    description: 'Company setup, GST, FSSAI, trademark, MSME, IEC and other filings — coordinated with qualified professionals where required by law.',
    services: ['Company Registration Assistance', 'GST Registration & Amendment Assistance', 'FSSAI Application Assistance', 'Trademark Application Coordination', 'MSME Registration', 'IEC Registration', 'Business License Assistance', 'Regulatory Documentation', 'Compliance Filing Coordination', 'Government Application Assistance'] },
  { code: 'I', name: 'Business Consulting', icon: 'lightbulb', timeline: 'Per engagement', exec: 'IN_HOUSE',
    description: 'Setup, process, e-commerce, technology and expansion consulting from operators who run these playbooks daily.',
    services: ['Business Setup Consulting', 'Business Process Consulting', 'Startup Consulting', 'E-commerce Consulting', 'Technology Consulting', 'Business Expansion Planning', 'Operational Consulting', 'Vendor Selection Consulting'] },
  { code: 'J', name: 'Data & Research Services', icon: 'bar-chart-3', timeline: '3 days – 3 weeks', exec: 'IN_HOUSE',
    description: 'Market, competitor, product and supplier research plus business intelligence reporting built on solid data.',
    services: ['Market Research', 'Competitor Research', 'Product Research', 'Supplier Research', 'Business Data Collection', 'Data Analysis', 'Survey Management', 'Business Intelligence Reporting', 'Custom Research Projects'] },
  { code: 'K', name: 'Logistics & Supply Chain', icon: 'truck', timeline: 'Per requirement', exec: 'THIRD_PARTY_MANAGED',
    description: 'Logistics partner onboarding, warehousing coordination, freight and import/export assistance via our vetted partner network.',
    services: ['Logistics Provider Coordination', 'Shipping Partner Onboarding', 'Warehouse Service Coordination', 'Distribution Partner Search', 'Freight Coordination', 'Import / Export Assistance', 'Supply Chain Consulting', 'Fulfilment Setup Assistance'] },
  { code: 'L', name: 'Product Development & Manufacturing', icon: 'factory', timeline: '4 – 16 weeks', exec: 'THIRD_PARTY_MANAGED',
    description: 'From concept to shelf: prototyping, manufacturer identification, private label development and production coordination.',
    services: ['Product Concept Development', 'Prototype Development', 'Product Design', 'Manufacturer Identification', 'Manufacturing Coordination', 'Supplier Sourcing', 'Private Label Product Development', 'Product Packaging Coordination', 'Production Management Assistance'] },
  { code: 'M', name: 'Printing & Packaging', icon: 'package', timeline: '2 – 6 weeks', exec: 'THIRD_PARTY_MANAGED',
    featured: ['Product Box Manufacturing'],
    description: 'Packaging and print production managed end-to-end — boxes, labels, cartons, brochures and custom packaging sourced from vetted printers.',
    services: ['Packaging Manufacturing Coordination', 'Label Printing', 'Carton Printing', 'Brochure Printing', 'Product Box Manufacturing', 'Promotional Material Printing', 'Custom Packaging Sourcing'] },
  { code: 'N', name: 'Video & Content Creation', icon: 'video', timeline: '1 – 4 weeks', exec: 'DIRECT_CONNECTION',
    featured: ['Product Photography', 'Product Video Creation'],
    description: 'Videos, photography, animation and written content produced by specialist studios we connect and coordinate for you.',
    services: ['Promotional Video Creation', 'Product Video Creation', 'Corporate Video Production', 'Animation', 'Photography', 'Product Photography', 'Content Writing', 'Marketing Content Production'] },
  { code: 'O', name: 'Marketing & Lead Generation', icon: 'megaphone', timeline: 'Ongoing / per campaign', exec: 'HYBRID',
    featured: ['Digital Marketing', 'SEO'],
    description: 'SEO, performance marketing, social media, WhatsApp campaigns and lead generation executed by specialists under our management.',
    services: ['Digital Marketing', 'SEO', 'Performance Marketing', 'Social Media Management', 'Lead Generation', 'Email Marketing', 'WhatsApp Marketing', 'Marketing Automation', 'Campaign Management'] },
  { code: 'P', name: 'Other / Custom Services', icon: 'sparkles', timeline: 'Per requirement', exec: 'HYBRID',
    description: 'Anything not listed — describe your requirement and we will scope it, quote it and deliver it through the right execution model.',
    services: ['Custom / Not-Listed Service'] },
]
