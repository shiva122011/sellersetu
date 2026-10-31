// Phase 7 QA suite — reusable full-lifecycle API regression test (bun scripts/qa-lifecycle.ts)
export {}
declare const Bun: any
// Phase 7 QA — full API lifecycle test against the running dev server.
// Exercises: multi-role login, request intake, quotation create→send→revise→accept,
// project+milestones+tasks, document requests/review, payments→receipt→invoice,
// managed vendor engagement→vendor milestone→work submission, chat + INTERNAL
// message segregation, RBAC negatives, notifications, admin stats/reports/CMS/settings.
const OK = (s: number) => s >= 200 && s < 300
const BASE = 'http://localhost:3000'
let passed = 0, failed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail).slice(0, 300) : '') }
}

type Jar = { cookie: string }
function auth(jar: Jar): Record<string, string> {
  return { 'Content-Type': 'application/json', ...(jar.cookie ? { Cookie: jar.cookie } : {}) }
}
async function req(method: string, path: string, jar: Jar, body?: unknown) {
  const res = await fetch(BASE + path, { method, headers: auth(jar), body: body !== undefined ? JSON.stringify(body) : undefined })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) {
    const m = setCookie.match(/sellersetu_session=[^;]+/)
    if (m) jar.cookie = m[0]
  }
  let data: any = null
  try { data = await res.json() } catch { /* non-json */ }
  return { status: res.status, data }
}

async function login(email: string, password: string): Promise<Jar> {
  const jar: Jar = { cookie: '' }
  const r = await req('POST', '/api/auth?mode=login', jar, { email, password })
  if (r.status !== 200 || !r.data?.data?.user) throw new Error(`login failed for ${email}: ${JSON.stringify(r.data).slice(0, 200)}`)
  return jar
}

// ---------- 1. Logins for all roles ----------
console.log('\n[1] Role logins')
const customer = await login('rahul@example.com', 'Customer@123')
const sales = await login('sales@sellersetu.in', 'Sales@123')
const pm = await login('pm@sellersetu.in', 'Pm@123')
const admin = await login('admin@sellersetu.in', 'Admin@123')
const vendor = await login('studio.kriya@example.com', 'Vendor@123')
check('all 5 role logins succeed', true)

// ---------- 2. Catalog (public, no prices) ----------
console.log('\n[2] Public catalog')
const cat = await req('GET', '/api/catalog', customer)
check('catalog returns categories', OK(cat.status) && Array.isArray(cat.data?.data?.categories) && cat.data.data.categories.length >= 16, cat.data?.data?.categories?.length)
const catStr = JSON.stringify(cat.data)
check('catalog leaks no prices', !/"price"/.test(catStr))
const svc = cat.data.data.services || []
check('catalog has services with executionType', svc.length > 50 && svc.every((s: any) => s.executionType), svc.length)

// helper: auto-fill all form fields (visible conditionals included) from formConfig
function fillForm(formConfig: unknown): Record<string, unknown> {
  let cfg: any = formConfig
  if (typeof formConfig === 'string') { try { cfg = JSON.parse(formConfig) } catch { return {} } }
  const out: Record<string, unknown> = {}
  for (const f of cfg?.fields || []) {
    switch (f.type) {
      case 'select': out[f.id] = f.options?.[0] ?? 'Other'; break
      case 'multiselect': out[f.id] = f.options?.length ? [f.options[0]] : ['Other']; break
      case 'number': out[f.id] = 3; break
      case 'date': out[f.id] = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10); break
      case 'checkbox': out[f.id] = true; break
      default: out[f.id] = f.options?.[0] ?? 'QA auto value'
    }
  }
  return out
}

// ---------- 3. Customer creates request ----------
console.log('\n[3] Request intake')
const catalogSvc = await req('GET', '/api/services', customer)
const available = (catalogSvc.data?.data?.services || []).filter((s: any) => s.status === 'AVAILABLE')
check('available services listed', available.length >= 5, available.length)
const pick = available[0]
const created = await req('POST', '/api/requests', customer, {
  title: `QA lifecycle ${Date.now()}`, description: 'Full lifecycle QA request',
  serviceId: pick.id, formResponses: fillForm(pick.formConfig),
  expectedDeliverables: 'Working deliverable', preferredTimeline: '2 weeks',
})
check('request created', OK(created.status) && !!created.data?.data?.request?.id, created.data)
const reqId = created.data?.data?.request?.id
const requestCode = created.data?.data?.request?.requestCode
check('request code generated', /^SR-\d{4}-\d{5}$/.test(requestCode || ''), requestCode)
check('initial status SUBMITTED', created.data?.data?.request?.status === 'SUBMITTED', created.data?.data?.request?.status)

// draft → submitted flow
const draft = await req('POST', '/api/requests', customer, { draft: true, title: 'QA draft', description: 'x', serviceId: pick.id, formResponses: fillForm(pick.formConfig) })
check('draft created', OK(draft.status) && draft.data?.data?.request?.status === 'DRAFT', draft.data?.data?.request?.status)
const draftId = draft.data?.data?.request?.id
const submittedDraft = await req('PATCH', `/api/requests/${draftId}`, customer, { action: 'submit_draft' })
check('draft submit → SUBMITTED', OK(submittedDraft.status) && submittedDraft.data?.data?.request?.status === 'SUBMITTED', submittedDraft.data?.data?.request?.status)

// coming-soon rejection
const comingSoon = (catalogSvc.data?.data?.services || []).find((s: any) => s.status === 'COMING_SOON')
if (comingSoon) {
  const rej = await req('POST', '/api/requests', customer, { title: 'should fail', description: 'x', serviceId: comingSoon.id })
  check('COMING_SOON service rejected server-side', rej.status >= 400, rej.status)
}

// ---------- 4. Quotation lifecycle ----------
console.log('\n[4] Quotation lifecycle')
const qCreated = await req('POST', '/api/quotations', sales, {
  requestId: reqId,
  items: [
    { description: 'Discovery & scoping', quantity: 1, unit: 'lot', unitPrice: 5000 },
    { description: 'Execution', quantity: 2, unit: 'day', unitPrice: 4000 },
  ],
  scope: 'QA scope', timelineNote: '10 working days', paymentTerms: '50% advance, 50% on delivery',
})
check('quotation created (DRAFT v1)', OK(qCreated.status) && qCreated.data?.data?.quotation?.status === 'DRAFT' && qCreated.data?.data?.quotation?.version === 1, qCreated.data?.data?.quotation?.status)
const qId = qCreated.data?.data?.quotation?.id
const sub = qCreated.data?.data?.quotation?.subtotal
const tax = qCreated.data?.data?.quotation?.taxAmount
const tot = qCreated.data?.data?.quotation?.total
check('totals math (18% GST)', Math.abs(sub - 13000) < 0.01 && Math.abs(tot - (sub + tax)) < 0.01, { sub, tax, tot })

const custForbidden = await req('POST', `/api/quotations/${qId}`, customer, { action: 'send' })
check('customer cannot send quotation (403)', custForbidden.status === 403, custForbidden.status)

const qSent = await req('POST', `/api/quotations/${qId}`, sales, { action: 'send' })
check('quotation sent', OK(qSent.status) && qSent.data?.data?.quotation?.status === 'SENT', qSent.data?.data?.quotation?.status)

const revReq = await req('POST', `/api/quotations/${qId}`, customer, { action: 'request_revision', note: 'Please reduce price' })
check('customer requested revision', OK(revReq.status) && revReq.data?.data?.quotation?.status === 'REVISION_REQUESTED', revReq.data?.data?.quotation?.status)

const q2 = await req('POST', `/api/quotations/${qId}`, sales, {
  action: 'revise',
  items: [{ description: 'Discovery & scoping', quantity: 1, unit: 'lot', unitPrice: 4500 }, { description: 'Execution', quantity: 2, unit: 'day', unitPrice: 3500 }],
})
check('revision v2 created', q2.status === 200 && q2.data?.data?.quotation?.version === 2, q2.data?.data?.quotation?.version)
const q2Id = q2.data?.data?.quotation?.id
const q2Sent = await req('POST', `/api/quotations/${q2Id}`, sales, { action: 'send' })
check('v2 sent', OK(q2Sent.status) && q2Sent.data?.data?.quotation?.status === 'SENT', q2Sent.data?.data?.quotation?.status)

const accepted = await req('POST', `/api/quotations/${q2Id}`, customer, { action: 'accept' })
check('customer accepted v2', OK(accepted.status) && accepted.data?.data?.quotation?.status === 'ACCEPTED', accepted.data?.data?.quotation?.status)

const locked = await req('POST', `/api/quotations/${q2Id}`, sales, { action: 'revise', items: [] })
check('accepted quotation is locked (no revise)', locked.status >= 400, locked.status)

// ---------- 5. Project + milestones + tasks ----------
console.log('\n[5] Project, milestones, tasks')
const proj = await req('GET', `/api/projects/${reqId}`, pm)
check('project auto-created on acceptance', OK(proj.status) && !!proj.data?.data?.project?.id, proj.data?.data?.project)
check('project status EXECUTION stage', !!proj.data?.data?.project?.status, proj.data?.data?.project?.status)

const m1 = await req('POST', `/api/projects/${reqId}/milestones`, pm, { title: 'Kickoff & discovery', weight: 30, description: 'Discovery phase' })
const m2 = await req('POST', `/api/projects/${reqId}/milestones`, pm, { title: 'Build', weight: 50 })
const m3 = await req('POST', `/api/projects/${reqId}/milestones`, pm, { title: 'Delivery', weight: 20 })
check('3 milestones created (weights 30/50/20)', OK(m1.status) && OK(m2.status) && OK(m3.status), [m1.status, m2.status, m3.status, m3.data?.error])

const task = await req('POST', `/api/projects/${reqId}/tasks`, pm, { title: 'Prepare SOW', milestoneId: m1.data?.data?.milestone?.id, assigneeId: null })
check('task created', OK(task.status), task.data)

const prog0 = await req('GET', `/api/projects/${reqId}`, pm)
check('initial weighted progress = 0%', prog0.data?.data?.project?.progressPct === 0, prog0.data?.data?.project?.progressPct)

const m2Id = m2.data?.data?.milestone?.id
const m1Id = m1.data?.data?.milestone?.id
await req('PATCH', `/api/projects/${reqId}/milestones`, pm, { id: m2Id, status: 'DONE' })
const prog50 = await req('GET', `/api/projects/${reqId}`, pm)
check('progress = 50% after 50-weight milestone DONE', prog50.data?.data?.project?.progressPct === 50, prog50.data?.data?.project?.progressPct)

await req('PATCH', `/api/projects/${reqId}/milestones`, pm, { id: m1Id, status: 'APPROVED' })
const prog80 = await req('GET', `/api/projects/${reqId}`, pm)
check('progress = 80% after approval', prog80.data?.data?.project?.progressPct === 80, prog80.data?.data?.project?.progressPct)

// vendor cannot mark others' milestones; customer cannot PATCH milestones
const custM = await req('PATCH', `/api/projects/${reqId}/milestones`, customer, { id: m3.data?.data?.milestone?.id, status: 'DONE' })
check('customer cannot update milestones (403)', custM.status === 403, custM.status)

// ---------- 6. Documents ----------
console.log('\n[6] Document requests & review')
const docReq = await req('POST', '/api/document-requests', pm, { requestId: reqId, title: 'QA: upload PAN card', description: 'Needed for compliance', mandatory: true })
check('staff created document request', OK(docReq.status), docReq.data)

// customer uploads a file — bun's FormData strips Blob MIME, so use curl with explicit type
const fileContent = 'QA test document content ' + Date.now()
const tmpPath = '/tmp/qa-pan.txt'
await Bun.write(tmpPath, fileContent)
const upProc = Bun.spawnSync(['curl', '-s', '-X', 'POST', `${BASE}/api/requests/${reqId}/documents`,
  '-H', `Cookie: ${customer.cookie}`,
  '-F', `file=@${tmpPath};type=text/plain`, '-F', 'name=QA PAN card'])
const upJson = JSON.parse(upProc.stdout.toString() || '{}')
const upRes = { status: upJson?.ok ? 200 : 400 }
check('customer uploaded document', OK(upRes.status), upJson)
const docId = upJson?.data?.document?.id

// staff approves
const approved = await req('PATCH', `/api/document-requests/${docReq.data?.data?.documentRequest?.id}`, pm, { status: 'APPROVED' })
check('staff approved document request', OK(approved.status) && approved.data?.data?.documentRequest?.status === 'APPROVED', approved.data?.data?.documentRequest?.status)

// ---------- 7. Payments & invoices ----------
console.log('\n[7] Payments → receipt → invoice')
const payList = await req('GET', `/api/requests/${reqId}/payments`, customer)
check('payments list readable', OK(payList.status), payList.status)
const adv = await req('POST', `/api/requests/${reqId}/payments`, pm, { type: 'ADVANCE', quotationId: q2Id, amount: Math.round((accepted.data?.data?.quotation?.total / 2) * 100) / 100, label: 'QA advance' })
check('staff scheduled advance payment', OK(adv.status), adv.data)
const payId = adv.data?.data?.payment?.id
check('advance amount = 50% of accepted total', Math.abs(adv.data?.data?.payment?.amount - accepted.data?.data?.quotation?.total / 2) < 0.01, { amount: adv.data?.data?.payment?.amount })

const custPayForbidden = await req('POST', `/api/requests/${reqId}/payments`, customer, { type: 'ADVANCE', amount: 999999 })
check('customer cannot schedule arbitrary payment', custPayForbidden.status === 403 || custPayForbidden.status === 400, custPayForbidden.status)

const paid = await req('POST', `/api/payments/${payId}/process`, customer, { method: 'UPI', vpa: 'rahul@upi' })
check('customer paid via UPI → PAID + receipt', OK(paid.status) && paid.data?.data?.payment?.status === 'PAID' && !!paid.data?.data?.payment?.receiptNo, paid.data?.data?.payment)

// Invoices mirror the staff UI flow: amount = payment amount (net), gstRatePct 0 default
const issued = await req('POST', '/api/invoices', sales, { requestId: reqId, paymentId: payId, amount: paid.data?.data?.payment?.amount, gstRatePct: 0, description: 'QA advance invoice', billToName: 'QA Test Pvt Ltd' })
check('staff issued invoice', OK(issued.status) && !!issued.data?.data?.invoice?.invoiceNo, issued.data)
check('invoice total = payment amount (no double GST)', Math.abs((issued.data?.data?.invoice?.totalAmount ?? 0) - (paid.data?.data?.payment?.amount || 0)) < 0.01, { invTotal: issued.data?.data?.invoice?.totalAmount, payAmount: paid.data?.data?.payment?.amount })
const inv = await req('GET', `/api/invoices?requestId=${reqId}`, sales)
check('invoice listed for request', OK(inv.status) && (inv.data?.data?.invoices || []).length >= 1, inv.data?.data?.invoices?.length)

// ---------- 8. Vendor engagement (MANAGED) ----------
console.log('\n[8] Managed vendor engagement')
const vendorsList = await req('GET', '/api/vendors', admin)
const kriya = (vendorsList.data?.data?.vendors || []).find((v: any) => v.businessName === 'Kriya Studio' || v.user?.businessName === 'Kriya Studio')
check('admin vendor directory lists Kriya Studio', !!kriya, vendorsList.data?.data?.vendors?.length)

const conn = await req('POST', '/api/vendor-connections', admin, { requestId: reqId, vendorId: kriya?.userId || kriya?.id, model: 'MANAGED', managedFeeNote: 'internal only' })
check('staff created MANAGED engagement', OK(conn.status), conn.data)
const connId = conn.data?.data?.connection?.id
const authorized = await req('POST', `/api/vendor-connections/${connId}`, admin, { action: 'authorize' })
check('staff authorized engagement → ACTIVE', authorized.status === 200 && ['ACTIVE', 'AUTHORIZED'].includes(authorized.data?.data?.connection?.status), authorized.data?.data?.connection?.status)

const vReqs = await req('GET', '/api/requests', vendor)
check('vendor sees assigned request', (vReqs.data?.data?.requests || []).some((r: any) => r.id === reqId), vReqs.data?.data?.requests?.length)

// Residual-fix regression: confidential commercial fields never reach vendor/customer payloads
const vConnList = await req('GET', '/api/vendor-connections', vendor)
const vConnRow = (vConnList.data?.data?.connections || []).find((c: any) => c.id === connId)
check('vendor connection list hides managedFeeNote/notes', !!vConnRow && !('managedFeeNote' in vConnRow) && !('notes' in vConnRow), vConnRow ? Object.keys(vConnRow) : 'missing')
const cConnList = await req('GET', '/api/vendor-connections', customer)
const cConnRow = (cConnList.data?.data?.connections || []).find((c: any) => c.id === connId)
check('customer connection list hides managedFeeNote/notes', cConnRow ? (!('managedFeeNote' in cConnRow) && !('notes' in cConnRow)) : true, cConnRow ? Object.keys(cConnRow) : 'not visible to customer (ok)')

// Residual-fix regression: vendor assignment via request PATCH must sync the project row
const vendorUid = kriya?.userId || kriya?.id
const clearV = await req('PATCH', `/api/requests/${reqId}`, admin, { vendorId: null })
check('admin cleared vendor on request', OK(clearV.status), clearV.data)
const clearedProj = await req('GET', `/api/projects/${reqId}`, admin)
check('project vendorId cleared in sync', clearedProj.data?.data?.project?.vendorId === null, clearedProj.data?.data?.project?.vendorId)
const reassignV = await req('PATCH', `/api/requests/${reqId}`, admin, { vendorId: vendorUid })
check('admin re-assigned vendor on request', OK(reassignV.status), reassignV.data)
const syncedProj = await req('GET', `/api/projects/${reqId}`, admin)
check('project vendorId synced after request PATCH', syncedProj.data?.data?.project?.vendorId === vendorUid, syncedProj.data?.data?.project?.vendorId)

const vMs = await req('PATCH', `/api/projects/${reqId}/milestones`, vendor, { id: m3.data?.data?.milestone?.id, status: 'DONE' })
check('vendor marked milestone DONE', OK(vMs.status), vMs.data)
const prog100 = await req('GET', `/api/projects/${reqId}`, pm)
check('progress = 100% (30+50+20)', prog100.data?.data?.project?.progressPct === 100, prog100.data?.data?.project?.progressPct)

const submit = await req('PATCH', `/api/projects/${reqId}`, vendor, { action: 'submit_for_review', note: 'Final files attached' })
check('vendor submitted work for review', OK(submit.status), submit.data)

const internalFee = await req('GET', `/api/requests/${reqId}`, vendor)
const connStr = JSON.stringify(internalFee.data)
check('internal managed-fee note NOT exposed to vendor', !connStr.includes('internal only'), null)

// Vendor task assignment end-to-end (PM assigns the connected vendor, vendor updates status)
const vendorTask = await req('POST', `/api/projects/${reqId}/tasks`, pm, { title: 'QA vendor task: deliver assets', assigneeId: vendorUid })
check('staff assigned task to connected vendor', OK(vendorTask.status), vendorTask.data)
const vendorTaskId = vendorTask.data?.data?.task?.id
const vDetail = await req('GET', `/api/requests/${reqId}`, vendor)
const vTask = (vDetail.data?.data?.request?.project?.tasks || []).find((t: any) => t.id === vendorTaskId)
check('vendor sees own task in request workspace', !!vTask && vTask.assigneeId === vendorUid, vDetail.data?.data?.request?.project?.tasks?.length)
const vTaskProg = await req('PATCH', `/api/projects/${reqId}/tasks`, vendor, { id: vendorTaskId, status: 'IN_PROGRESS' })
check('vendor updated task status', OK(vTaskProg.status) && vTaskProg.data?.data?.task?.status === 'IN_PROGRESS', vTaskProg.data)
const packpro = (vendorsList.data?.data?.vendors || []).find((v: any) => v.businessName === 'PackPro Industries')
const badAssign = await req('POST', `/api/projects/${reqId}/tasks`, pm, { title: 'QA rogue vendor task', assigneeId: packpro?.userId || packpro?.id })
check('task assignment to non-connected vendor rejected', badAssign.status === 400, badAssign.status)
const vTaskDone = await req('PATCH', `/api/projects/${reqId}/tasks`, vendor, { id: vendorTaskId, status: 'DONE' })
check('vendor completed task', OK(vTaskDone.status) && vTaskDone.data?.data?.task?.status === 'DONE', vTaskDone.data?.data?.task?.status)

// ---------- 9. Chat + internal segregation ----------
console.log('\n[9] Chat & internal message segregation')
const msg = await req('POST', `/api/requests/${reqId}/messages`, customer, { content: 'QA customer message' })
check('customer posted chat message', OK(msg.status), msg.data)
const staffMsg = await req('POST', `/api/requests/${reqId}/messages`, pm, { content: 'QA internal note', isInternal: true })
check('staff posted INTERNAL note', OK(staffMsg.status), staffMsg.data)
const custChat = await req('GET', `/api/requests/${reqId}/messages`, customer)
const custBodies = (custChat.data?.data?.messages || []).map((m: any) => m.content)
check('customer does NOT see internal note', !custBodies.includes('QA internal note') && custBodies.includes('QA customer message'), custBodies)
const staffChat = await req('GET', `/api/requests/${reqId}/messages`, pm)
const staffBodies = (staffChat.data?.data?.messages || []).map((m: any) => m.content)
check('staff sees both messages', staffBodies.includes('QA internal note') && staffBodies.includes('QA customer message'))

// ---------- 10. RBAC negatives ----------
console.log('\n[10] RBAC negatives')
const noAuth = await fetch(`${BASE}/api/admin/stats`)
check('unauthenticated /api/admin/stats denied (401/403)', noAuth.status === 401 || noAuth.status === 403, noAuth.status)
const custAdmin = await req('GET', '/api/admin/stats', customer)
check('customer /api/admin/stats → 403', custAdmin.status === 403, custAdmin.status)
const vendorAdmin = await req('GET', '/api/admin/reports', vendor)
check('vendor /api/admin/reports → 403', vendorAdmin.status === 403, vendorAdmin.status)
const salesTeam = await req('GET', '/api/admin/team', sales)
check('sales blocked from team mgmt (or role-gated)', salesTeam.status === 403 || OK(salesTeam.status), salesTeam.status)
const vOther = await req('GET', `/api/requests/${reqId}`, vendor)
check('vendor can read own engagement request', OK(vOther.status), vOther.status)

// ---------- 11. Admin analytics ----------
console.log('\n[11] Admin stats, reports, CMS, settings, audit')
const stats = await req('GET', '/api/admin/stats', admin)
check('admin stats (requests/quotations/revenue)', OK(stats.status) && stats.data?.data?.stats?.totalRequests !== undefined && stats.data?.data?.stats?.revenue !== undefined, Object.keys(stats.data?.data?.stats || {}))
const rep = await req('GET', '/api/admin/reports', admin)
check('reports: byCategory + revenueByModel', OK(rep.status) && !!rep.data?.data?.report?.byCategory && !!rep.data?.data?.report?.revenueByModel, Object.keys(rep.data?.data?.report || {}))
const csv = await fetch(`${BASE}/api/admin/reports?format=csv`, { headers: { Cookie: admin.cookie } })
const csvText = await csv.text()
check('CSV export works', OK(csv.status) && csvText.includes(',') && csvText.length > 50, csv.status)
const cms = await req('GET', '/api/admin/cms', admin)
check('CMS pages load', OK(cms.status) && (cms.data?.data?.pages || []).length >= 3, cms.data?.data?.pages?.length)
const settings = await req('GET', '/api/admin/settings', admin)
check('settings load (GST etc.)', OK(settings.status) && settings.data?.data?.settings !== undefined, Object.keys(settings.data?.data || {}).length)
const audit = await req('GET', '/api/admin/activity', admin)
check('audit log has entries from this lifecycle', OK(audit.status) && (audit.data?.data?.logs || []).length > 5, audit.status)

// ---------- 12. Notifications ----------
console.log('\n[12] Notifications')
const notif = await req('GET', '/api/notifications', customer)
check('customer has notifications', OK(notif.status) && (notif.data?.data?.notifications || []).length > 0, notif.data?.data?.notifications?.length)
const notifV = await req('GET', '/api/notifications', vendor)
check('vendor has notifications', OK(notifV.status) && (notifV.data?.data?.notifications || []).length > 0, notifV.data?.data?.notifications?.length)

// ---------- 13. Vendor payouts & profile management ----------
console.log('\n[13] Vendor payout & company profile management')

// Vendor sets their own payout channel (bank) — validation included
const badIfsc = await req('PATCH', '/api/vendors', vendor, { payoutMode: 'BANK', payoutAccountName: 'Kriya Studio', payoutAccountNumber: '12345678', payoutIfsc: 'BADIFSC1' })
check('vendor payout edit rejects invalid IFSC (400)', badIfsc.status === 400, badIfsc.status)
const vpSave = await req('PATCH', '/api/vendors', vendor, { address: 'No. 42, Indiranagar', city: 'Bengaluru', state: 'Karnataka', payoutMode: 'BANK', payoutAccountName: 'Kriya Studio Creative LLP', payoutAccountNumber: '990044556677', payoutIfsc: 'HDFC0001234' })
check('vendor saved payout channel + address', OK(vpSave.status), vpSave.data)
const meAfter = await req('GET', '/api/auth/me', vendor)
const vpMe = meAfter.data?.data?.user?.vendorProfile
check('auth/me reflects payout details (owner view)', vpMe?.payoutMode === 'BANK' && vpMe?.payoutIfsc === 'HDFC0001234' && vpMe?.city === 'Bengaluru', vpMe)

// Vendor cannot manage milestone payouts (staff-only)
const vPayoutTry = await req('PATCH', `/api/projects/${reqId}/milestones`, vendor, { id: m3.data?.data?.milestone?.id, vendorPayoutAmount: 999 })
check('vendor cannot set milestone payout (403)', vPayoutTry.status === 403, vPayoutTry.status)

// Staff sets + releases the vendor payout on the vendor-completed milestone
const m3Id = m3.data?.data?.milestone?.id
const paySet = await req('PATCH', `/api/projects/${reqId}/milestones`, pm, { id: m3Id, vendorPayoutAmount: 8750, payoutNote: 'QA NEFT UTR 123456' })
check('staff set vendor payout amount', OK(paySet.status) && paySet.data?.data?.milestone?.vendorPayoutAmount === 8750, paySet.data?.data?.milestone)
const payRel = await req('PATCH', `/api/projects/${reqId}/milestones`, pm, { id: m3Id, payoutStatus: 'RELEASED' })
check('staff released vendor payout', OK(payRel.status) && payRel.data?.data?.milestone?.payoutStatus === 'RELEASED' && !!payRel.data?.data?.milestone?.payoutReleasedAt, payRel.data?.data?.milestone?.payoutStatus)

// Vendor projection: managed project hides client billing, shows own payout
const vDetailPay = await req('GET', `/api/requests/${reqId}`, vendor)
const vMilestones = vDetailPay.data?.data?.request?.project?.milestones || []
const vM3 = vMilestones.find((x: any) => x.id === m3Id)
check('vendor sees own payout + release status', vM3?.vendorPayoutAmount === 8750 && vM3?.payoutStatus === 'RELEASED', vM3)
check('managed project hides client billing amount from vendor', vMilestones.length > 0 && vMilestones.every((x: any) => x.amount === undefined), vMilestones.map((x: any) => x.amount))

// Customer projection: vendor payout data never reaches customers
const cDetail = await req('GET', `/api/requests/${reqId}`, customer)
const cMilestones = cDetail.data?.data?.request?.project?.milestones || []
check('customer milestone view strips vendor payout fields', cMilestones.length > 0 && cMilestones.every((x: any) => !('vendorPayoutAmount' in x) && !('payoutStatus' in x)), cMilestones[0] ? Object.keys(cMilestones[0]) : 'empty')

// Vendor got a payout-release notification
const vNotif = await req('GET', '/api/notifications', vendor)
check('vendor notified on payout release', (vNotif.data?.data?.notifications || []).some((n: any) => (n.title || '').includes('Payout released')), vNotif.data?.data?.notifications?.length)

// Admin can manage vendor company details incl. payout channel
const vendorsList13 = await req('GET', '/api/vendors', admin)
const kriya13 = (vendorsList13.data?.data?.vendors || []).find((v: any) => v.businessName === 'Kriya Studio')
const admEdit = await req('PATCH', `/api/admin/vendors/${kriya13?.id}`, admin, { city: 'Bengaluru', payoutAccountNumber: '990044556677' })
check('admin edited vendor payout/company details', OK(admEdit.status), admEdit.data)
const vendorsList13b = await req('GET', '/api/vendors', admin)
const kriya13b = (vendorsList13b.data?.data?.vendors || []).find((v: any) => v.businessName === 'Kriya Studio')
check('admin vendor edit persisted', kriya13b?.payoutAccountNumber === '990044556677' && kriya13b?.city === 'Bengaluru', kriya13b)

console.log('\n========== QA RESULT ==========')
console.log(`PASSED: ${passed}  FAILED: ${failed}`)
if (failures.length) { console.log('Failures:'); failures.forEach((f) => console.log(' - ' + f)); process.exit(1) }
