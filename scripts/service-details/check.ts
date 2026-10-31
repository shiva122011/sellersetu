// Sanity check: every catalog service name must have a SERVICE_DETAILS entry,
// and no orphan keys. Run: bun scripts/service-details/check.ts
import { CATALOG } from '../seed-catalog'

const { SERVICE_DETAILS, CATEGORY_FAQS } = await import('./index')

const names: string[] = []
for (const c of CATALOG) for (const s of c.services) names.push(s)

const missing = names.filter((n) => !SERVICE_DETAILS[n])
const orphans = Object.keys(SERVICE_DETAILS).filter((k) => !names.includes(k))

console.log(`catalog services: ${names.length}, detail entries: ${Object.keys(SERVICE_DETAILS).length}`)
console.log(`category FAQ sets: ${Object.keys(CATEGORY_FAQS).length}`)
if (missing.length) console.log('MISSING DETAILS:', missing)
if (orphans.length) console.log('ORPHAN ENTRIES:', orphans)
if (!missing.length && !orphans.length) console.log('✅ all service names covered, no orphans')

// CJK / non-latin check (catches stray CJK paste accidents)
let bad = 0
for (const [k, v] of Object.entries(SERVICE_DETAILS)) {
  const all = [v.description, ...v.scope, ...v.deliverables, ...v.process.map((p) => p.t + p.d)].join(' ')
  if (/[\u4e00-\u9fff\u3040-\u30ff]/.test(all)) { console.log('CJK FOUND IN:', k); bad++ }
}
if (!bad) console.log('✅ no stray CJK characters')
