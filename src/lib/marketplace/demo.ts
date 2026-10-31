import type {
  MarketplaceProvider,
  ProviderCredentials,
  NormalizedOrder,
  NormalizedOrderItem,
  NormalizedSellerProfile,
} from './types'

// ---------------------------------------------------------------------------
// DEMO provider — realistic Amazon.in order data used until the platform's
// SP-API app passes Amazon's developer review. The dashboard clearly labels
// demo connections as "Demo data". When the admin saves real LWA app
// credentials, new connections go through the official OAuth flow instead.
// ---------------------------------------------------------------------------

const CITIES = [
  ['Mumbai', 'Maharashtra', '400001'], ['Delhi', 'Delhi', '110001'], ['Bengaluru', 'Karnataka', '560001'],
  ['Hyderabad', 'Telangana', '500001'], ['Chennai', 'Tamil Nadu', '600001'], ['Pune', 'Maharashtra', '411001'],
  ['Kolkata', 'West Bengal', '700001'], ['Ahmedabad', 'Gujarat', '380001'], ['Jaipur', 'Rajasthan', '302001'],
  ['Lucknow', 'Uttar Pradesh', '226001'], ['Indore', 'Madhya Pradesh', '452001'], ['Kochi', 'Kerala', '682001'],
]

const PRODUCTS: Array<[string, string, number]> = [
  // [title, sku prefix, typical price]
  ['Stainless Steel Water Bottle 1L — Set of 2', 'BOTTLE-SS-1L', 499],
  ['Organic Cold-Pressed Coconut Oil 500ml', 'OIL-COC-500', 349],
  ['Cotton Handloom Bedsheet (Queen, Jaipuri Print)', 'BED-JAI-Q', 899],
  ['Bamboo Cutting Board — Large', 'CUT-BAM-L', 549],
  ['Aroma Diffuser with 2 Essential Oils', 'DIFF-ARO-2', 1299],
  ['Stainless Steel Lunch Box 3-Tier Tiffin', 'TIFN-SS-3T', 649],
  ['Handcrafted Terracotta Planter Set of 3', 'PLNT-TER-3', 749],
  ['Copper Water Bottle Hammered 950ml', 'BOTTLE-CU-950', 999],
  ['Microfibre Cleaning Cloth Pack of 6', 'CLTH-MIC-6', 299],
  ['Jute Storage Basket — Round Medium', 'BSKT-JUT-M', 459],
  ['Ceramic Coffee Mug Set of 4 — Matte Finish', 'MUG-CER-4', 799],
  ['Neem Wood Comb — Anti Dandruff', 'COMB-NEM-1', 199],
]

const CARRIERS = ['Amazon Shipping', 'Delhivery', 'Blue Dart', 'Ekart', 'India Post']
const SERVICE_LEVELS = ['Standard', 'Standard', 'Standard', 'Expedited', 'Priority']

// Deterministic PRNG (mulberry32) so a connection's data is stable and evolves
// predictably between syncs.
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return h
}

interface DemoOrderSpec {
  seq: number
  daysAgo: number
}

// Builds the full expected order list for a demo seller at a given "sync epoch".
// On later syncs we bump the seed so a few orders progress status and a couple
// of new orders appear — mirroring how live data changes.
function generateOrders(seed: number, now = new Date()): NormalizedOrder[] {
  const rand = rng(seed)
  const orders: NormalizedOrder[] = []
  const COUNT = 52

  for (let i = 0; i < COUNT; i++) {
    const daysAgo = Math.floor(rand() * 74) // spread over ~10 weeks
    const purchase = new Date(now.getTime() - daysAgo * 24 * 3600 * 1000 - Math.floor(rand() * 20) * 3600 * 1000)
    const seq = 403 + i
    const amazonOrderId = `40${(2 + (seed % 7))}-` + String(seq).padStart(7, '0') + '-' + String(Math.floor(rand() * 9000000) + 1000000)

    // Status depends on age: older orders are shipped/delivered/cancelled;
    // recent ones pending/unshipped.
    let orderStatus: string
    let deliveryStatus: string | null = null
    let canceledReason: string | null = null
    let isReturned = false
    let returnInfo: string | null = null
    let carrier: string | null = null
    let trackingNumber: string | null = null

    const ageRoll = rand()
    if (daysAgo <= 1) {
      orderStatus = ageRoll < 0.45 ? 'PENDING' : 'UNSHIPPED'
    } else if (daysAgo <= 3) {
      orderStatus = ageRoll < 0.25 ? 'UNSHIPPED' : ageRoll < 0.35 ? 'PARTIALLY_SHIPPED' : 'SHIPPED'
    } else {
      if (ageRoll < 0.09) {
        orderStatus = 'CANCELED'
        canceledReason = ageRoll < 0.04 ? 'BuyerCanceled' : 'NoInventory'
      } else if (ageRoll < 0.14) {
        orderStatus = 'UNFULFILLABLE'
        canceledReason = 'InvalidAddress'
      } else {
        orderStatus = 'SHIPPED'
      }
    }

    const fulfillmentChannel = rand() < 0.35 ? 'AFN' : 'MFN'
    const cityIdx = Math.floor(rand() * CITIES.length)
    const [city, state, pin] = CITIES[cityIdx]
    const serviceLevel = SERVICE_LEVELS[Math.floor(rand() * SERVICE_LEVELS.length)]

    // Items 1-4
    const itemCount = 1 + Math.floor(rand() * 4)
    const items: NormalizedOrderItem[] = []
    let total = 0
    const usedTitles = new Set<number>()
    for (let j = 0; j < itemCount; j++) {
      let pi = Math.floor(rand() * PRODUCTS.length)
      let guard = 0
      while (usedTitles.has(pi) && guard++ < 8) pi = Math.floor(rand() * PRODUCTS.length)
      usedTitles.add(pi)
      const [title, sku, price] = PRODUCTS[pi]
      const qty = 1 + Math.floor(rand() * 3)
      const itemTotal = price * qty
      total += itemTotal
      const shipped = orderStatus === 'SHIPPED' ? qty : orderStatus === 'PARTIALLY_SHIPPED' ? Math.max(1, qty - 1) : 0
      items.push({
        asin: 'B0' + String(Math.floor(rand() * 90000000) + 10000000),
        sellerSku: sku,
        title,
        quantityOrdered: qty,
        quantityShipped: shipped,
        itemPrice: itemTotal,
        currency: 'INR',
        condition: 'New',
      })
    }

    // Shipping / tracking / delivery for shipped orders
    if (orderStatus === 'SHIPPED') {
      carrier = CARRIERS[Math.floor(rand() * CARRIERS.length)]
      trackingNumber = fulfillmentChannel === 'AFN'
        ? 'LP' + String(Math.floor(rand() * 900000000) + 100000000)
        : 'AWB' + String(Math.floor(rand() * 9000000000) + 1000000000)
      if (daysAgo > 7) deliveryStatus = rand() < 0.82 ? 'DELIVERED' : 'IN_TRANSIT'
      else if (daysAgo > 3) deliveryStatus = rand() < 0.5 ? 'IN_TRANSIT' : 'OUT_FOR_DELIVERY'
      else deliveryStatus = 'IN_TRANSIT'
    }

    // Returns: occasional return on delivered orders
    if (orderStatus === 'SHIPPED' && deliveryStatus === 'DELIVERED' && rand() < 0.12) {
      isReturned = true
      const reasons = ['Item defective or does not work', 'Wrong item sent', 'Size issue', 'Changed mind', 'Damaged in transit']
      const reason = reasons[Math.floor(rand() * reasons.length)]
      const returnDate = new Date(purchase.getTime() + (5 + Math.floor(rand() * 10)) * 24 * 3600 * 1000)
      returnInfo = JSON.stringify({
        reason,
        status: rand() < 0.6 ? 'Refund issued' : 'Return received — inspecting',
        returnDate: returnDate.toISOString(),
        refundAmount: Math.round(total * (0.8 + rand() * 0.2)),
      })
    }

    const latestShip = new Date(purchase.getTime() + (1 + rand() * 2) * 24 * 3600 * 1000)
    const latestDelivery = new Date(purchase.getTime() + (3 + rand() * 6) * 24 * 3600 * 1000)

    orders.push({
      amazonOrderId,
      purchaseDate: purchase,
      lastUpdateDate: new Date(purchase.getTime() + (1 + rand() * 4) * 24 * 3600 * 1000),
      orderStatus,
      fulfillmentChannel,
      salesChannel: 'Amazon.in',
      shipServiceLevel: serviceLevel,
      orderTotal: Math.round(total * 100) / 100,
      currency: 'INR',
      numberOfItems: items.reduce((s, it) => s + it.quantityOrdered, 0),
      shipCity: city,
      shipState: state,
      shipCountry: 'IN',
      shipPostalCode: …72931 tokens truncated…="pb-2">
   208→   208→                <div className="flex items-center justify-between">
   209→   209→                  <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-emerald-600" /> Latest requests</CardTitle>
   210→   210→                  <Button variant="ghost" size="sm" onClick={() => setTab('requests')} className="text-emerald-700">View all</Button>
   211→   211→                </div>
   212→   212→              </CardHeader>
   213→   213→              <CardContent>
   214→   214→                <div className="space-y-2">
   215→   215→                  {recent.map((r) => (
   216→   216→                    <button key={r.id} onClick={() => setSelectedId(r.id)} className="w-full flex flex-wrap items-center gap-3 rounded-xl border p-3 text-left hover:border-emerald-300 hover:bg-emerald-50/40 transition-colors">
   217→   217→                      <div className="flex-1 min-w-40">
   218→   218→                        <p className="text-sm font-semibold text-emerald-950">{r.requestCode} · {r.service?.name}</p>
   219→   219→                        <p className="text-xs text-muted-foreground">{r.customer?.name} · {r.businessName} · {formatDateTime(r.createdAt)}</p>
   220→   220→                      </div>
   221→   221→                      <span className="text-sm font-semibold text-emerald-800">{formatINR(r.totalFee)}</span>
   222→   222→                      <StatusBadge status={r.status} />
   223→   223→                    </button>
   224→   224→                  ))}
   225→   225→                  {recent.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No requests yet.</p>}
   226→   226→                </div>
   227→   227→              </CardContent>
   228→   228→            </Card>
   229→   229→          </TabsContent>
   230→   230→
   231→   231→          {/* ---------------- Requests ---------------- */}
   232→   232→          <TabsContent value="requests" className="space-y-4">
   233→   233→            <div className="flex flex-wrap gap-2">
   234→   234→              <div className="relative flex-1 min-w-52">
   235→   235→                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
   236→   236→                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by ID, business, customer…" className="pl-9 bg-white" />
   237→   237→              </div>
   238→   238→              <select
   239→   239→                value={statusFilter}
   240→   240→                onChange={(e) => setStatusFilter(e.target.value)}
   241→   241→                className="flex h-10 rounded-md border border-input bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
   242→   242→                aria-label="Filter by status"
   243→   243→              >
   244→   244→                <option value="">All statuses</option>
   245→   245→                {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
   246→   246→              </select>
   247→   247→            </div>
   248→   248→
   249→   249→            <Card className="border-emerald-100">
   250→   250→              <CardContent className="p-0">
   251→   251→                <div className="overflow-x-auto">
   252→   252→                  <table className="w-full text-sm">
   253→   253→                    <thead className="bg-stone-50 text-muted-foreground">
   254→   254→                      <tr>
   255→   255→                        <th className="text-left px-4 py-3 font-medium">Request</th>
   256→   256→                        <th className="text-left px-4 py-3 font-medium">Customer</th>
   257→   257→                        <th className="text-left px-4 py-3 font-medium">Service</th>
   258→   258→                        <th className="text-left px-4 py-3 font-medium">Fee</th>
   259→   259→                        <th className="text-left px-4 py-3 font-medium">Progress</th>
   260→   260→                        <th className="text-left px-4 py-3 font-medium">Status</th>
   261→   261→                        <th className="text-left px-4 py-3 font-medium">Assigned</th>
   262→   262→                      </tr>
   263→   263→                    </thead>
   264→   264→                    <tbody className="divide-y">
   265→   265→                      {filteredRequests.map((r) => (
   266→   266→                        <tr key={r.id} onClick={() => setSelectedId(r.id)} className="hover:bg-emerald-50/40 cursor-pointer transition-colors">
   267→   267→                          <td className="px-4 py-3">
   268→   268→                            <p className="font-semibold text-emerald-900">{r.requestCode}</p>
   269→   269→                            <p className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</p>
   270→   270→                          </td>
   271→   271→                          <td className="px-4 py-3">
   272→   272→                            <p className="font-medium">{r.customer?.name}</p>
   273→   273→                            <p className="text-xs text-muted-foreground">{r.customer?.email}</p>
   274→   274→                          </td>
   275→   275→                          <td className="px-4 py-3">{r.service?.name}</td>
   276→   276→                          <td className="px-4 py-3 font-semibold text-emerald-800">{formatINR(r.totalFee)}</td>
   277→   277→                          <td className="px-4 py-3 min-w-32">
   278→   278→                            <ProgressBar value={r.progress} />
   279→   279→                            <p className="text-[11px] text-muted-foreground mt-1">{r.progress}%</p>
   280→   280→                          </td>
   281→   281→                          <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
   282→   282→                          <td className="px-4 py-3">{r.assignedTo?.name || <Badge variant="outline" className="border-amber-200 text-amber-700">Unassigned</Badge>}</td>
   283→   283→                        </tr>
   284→   284→                      ))}
   285→   285→                      {filteredRequests.length === 0 && (
   286→   286→                        <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No requests match your filters.</td></tr>
   287→   287→                      )}
   288→   288→                    </tbody>
   289→   289→                  </table>
   290→   290→                </div>
   291→   291→              </CardContent>
   292→   292→            </Card>
   293→   293→          </TabsContent>
   294→   294→
   295→   295→          {/* ---------------- Customers ---------------- */}
   296→   296→          <TabsContent value="customers">
   297→   297→            <Card className="border-emerald-100">
   298→   298→              <CardContent className="p-0">
   299→   299→                <div className="overflow-x-auto">
   300→   300→                  <table className="w-full text-sm">
   301→   301→                    <thead className="bg-stone-50 text-muted-foreground">
   302→   302→                      <tr>
   303→   303→                        <th className="text-left px-4 py-3 font-medium">Customer</th>
   304→   304→                        <th className="text-left px-4 py-3 font-medium">Contact</th>
   305→   305→                        <th className="text-left px-4 py-3 font-medium">Business</th>
   306→   306→                        <th className="text-left px-4 py-3 font-medium">Requests</th>
   307→   307→                        <th className="text-left px-4 py-3 font-medium">Lifetime value</th>
   308→   308→                        <th className="text-left px-4 py-3 font-medium">Joined</th>
   309→   309→                      </tr>
   310→   310→                    </thead>
   311→   311→                    <tbody className="divide-y">
   312→   312→                      {(customers as Array<{ id: string; name: string; email: string; phone?: string | null; company?: string | null; requestCount: number; activeCount: number; lifetimeValue: number; createdAt: string }>).map((c) => (
   313→   313→                        <tr key={c.id} className="hover:bg-stone-50">
   314→   314→                          <td className="px-4 py-3 font-medium text-emerald-950">{c.name}</td>
   315→   315→                          <td className="px-4 py-3">
   316→   316→                            <p>{c.email}</p>
   317→   317→                            <p className="text-xs text-muted-foreground">{c.phone || '—'}</p>
   318→   318→                          </td>
   319→   319→                          <td className="px-4 py-3">{c.company || '—'}</td>
   320→   320→                          <td className="px-4 py-3">{c.requestCount} total · <span className="text-emerald-700 font-medium">{c.activeCount} active</span></td>
   321→   321→                          <td className="px-4 py-3 font-semibold text-emerald-800">{formatINR(c.lifetimeValue)}</td>
   322→   322→                          <td className="px-4 py-3 text-xs">{formatDate(c.createdAt)}</td>
   323→   323→                        </tr>
   324→   324→                      ))}
   325→   325→                      {customers.length === 0 && (
   326→   326→                        <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No customers registered yet.</td></tr>
   327→   327→                      )}
   328→   328→                    </tbody>
   329→   329→                  </table>
   330→   330→                </div>
   331→   331→              </CardContent>
   332→   332→            </Card>
   333→   333→          </TabsContent>
   334→   334→
   335→   335→          {/* ---------------- Payments ---------------- */}
   336→   336→          <TabsContent value="payments">
   337→   337→            <Card className="border-emerald-100">
   338→   338→              <CardHeader className="pb-2">
   339→   339→                <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" /> All transactions</CardTitle>
   340→   340→              </CardHeader>
   341→   341→              <CardContent className="p-0">
   342→   342→                <div className="overflow-x-auto">
   343→   343→                  <table className="w-full text-sm">
   344→   344→                    <thead className="bg-stone-50 text-muted-foreground">
   345→   345→                      <tr>
   346→   346→                        <th className="text-left px-4 py-3 font-medium">Request</th>
   347→   347→                        <th className="text-left px-4 py-3 font-medium">Customer</th>
   348→   348→                        <th className="text-left px-4 py-3 font-medium">Stage</th>
   349→   349→                        <th className="text-left px-4 py-3 font-medium">Amount</th>
   350→   350→                        <th className="text-left px-4 py-3 font-medium">Method</th>
   351→   351→                        <th className="text-left px-4 py-3 font-medium">Txn ID</th>
   352→   352→                        <th className="text-left px-4 py-3 font-medium">Date</th>
   353→   353→                        <th className="text-left px-4 py-3 font-medium">Status</th>
   354→   354→                        <th className="px-4 py-3" />
   355→   355→                      </tr>
   356→   356→                    </thead>
   357→   357→                    <tbody className="divide-y">
   358→   358→                      {payments.map((p) => (
   359→   359→                        <tr key={p.id} className="hover:bg-stone-50">
   360→   360→                          <td className="px-4 py-3 font-medium text-emerald-900">{p.request?.requestCode}</td>
   361→   361→                          <td className="px-4 py-3">
   362→   362→                            <p>{p.request?.customer?.name}</p>
   363→   363→                            <p className="text-xs text-muted-foreground">{p.request?.businessName}</p>
   364→   364→                          </td>
   365→   365→                          <td className="px-4 py-3">{p.type === 'ADVANCE' ? 'Advance (50%)' : 'Final (50%)'}</td>
   366→   366→                          <td className="px-4 py-3 font-semibold text-emerald-800">{formatINR(p.amount)}</td>
   367→   367→                          <td className="px-4 py-3">{p.method || '—'}</td>
   368→   368→                          <td className="px-4 py-3 font-mono text-xs">{p.transactionId || '—'}</td>
   369→   369→                          <td className="px-4 py-3 text-xs">{formatDateTime(p.paidAt || p.createdAt)}</td>
   370→   370→                          <td className="px-4 py-3">
   371→   371→                            <Badge variant="outline" className={p.status === 'PAID' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : p.status === 'PENDING' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-red-200 bg-red-50 text-red-600'}>{p.status}</Badge>
   372→   372→                          </td>
   373→   373→                          <td className="px-4 py-3 text-right">
   374→   374→                            {p.status === 'PAID' && (
   375→   375→                              <Button variant="ghost" size="sm" onClick={() => setInvoice(p)} className="gap-1.5 text-emerald-700">
   376→   376→                                <ReceiptText className="h-3.5 w-3.5" /> Receipt
   377→   377→                              </Button>
   378→   378→                            )}
   379→   379→                          </td>
   380→   380→                        </tr>
   381→   381→                      ))}
   382→   382→                      {payments.length === 0 && (
   383→   383→                        <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No transactions yet.</td></tr>
   384→   384→                      )}
   385→   385→                    </tbody>
   386→   386→                  </table>
   387→   387→                </div>
   388→   388→              </CardContent>
   389→   389→            </Card>
   390→   390→          </TabsContent>
   391→   391→
   392→   392→          {/* ---------------- Team ---------------- */}
   393→   393→          <TabsContent value="team" className="space-y-4">
   394→   394→            {user.role === 'ADMIN' && (
   395→   395→              <div className="flex justify-end">
   396→   396→                <Button onClick={() => setAddTeamOpen(true)} className="bg-emerald-700 hover:bg-emerald-800 gap-2">
   397→   397→                  <UserPlus className="h-4 w-4" /> Add team member
   398→   398→                </Button>
   399→   399→              </div>
   400→   400→            )}
   401→   401→            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
   402→   402→              {team.map((m) => (
   403→   403→                <Card key={m.id} className="border-emerald-100">
   404→   404→                  <CardContent className="p-5 flex items-start gap-3">
   405→   405→                    <div className="h-11 w-11 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold shrink-0">
   406→   406→                      {m.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
   407→   407→                    </div>
   408→   408→                    <div className="flex-1 min-w-0">
   409→   409→                      <div className="flex items-center gap-2">
   410→   410→                        <p className="font-semibold text-emerald-950 truncate">{m.name}</p>
   411→   411→                        <Badge variant="outline" className={m.role === 'ADMIN' ? 'border-emerald-300 text-emerald-800 bg-emerald-50' : 'border-stone-300 text-stone-600'}>{m.role}</Badge>
   412→   412→                      </div>
   413→   413→                      <p className="text-xs text-muted-foreground truncate">{m.email}</p>
   414→   414→                      <p className="text-[11px] text-muted-foreground mt-1">{(m as unknown as { activeAssignments?: number }).activeAssignments || 0} active assignments</p>
   415→   415→                    </div>
   416→   416→                  </CardContent>
   417→   417→                </Card>
   418→   418→              ))}
   419→   419→            </div>
   420→   420→          </TabsContent>
   421→   421→
   422→   422→          {/* ---------------- Activity ---------------- */}
   423→   423→          <TabsContent value="activity">
   424→   424→            <Card className="border-emerald-100">
   425→   425→              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4 text-emerald-600" /> Audit log</CardTitle></CardHeader>
   426→   426→              <CardContent className="max-h-[600px] overflow-y-auto">
   427→   427→                <div className="space-y-2">
   428→   428→                  {activity.map((l) => (
   429→   429→                    <div key={l.id} className="flex items-start gap-3 rounded-lg border p-3">
   430→   430→                      <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
   431→   431→                        <History className="h-4 w-4 text-emerald-600" />
   432→   432→                      </div>
   433→   433→                      <div className="flex-1 min-w-0">
   434→   434→                        <p className="text-sm"><span className="font-semibold text-emerald-950">{l.action}</span> {l.details ? <span className="text-muted-foreground">— {l.details}</span> : null}</p>
   435→   435→                        <p className="text-[11px] text-muted-foreground mt-0.5">{l.user ? `${l.user.name} (${l.user.role})` : 'System'} · {formatDateTime(l.createdAt)}</p>
   436→   436→                      </div>
   437→   437→                    </div>
   438→   438→                  ))}
   439→   439→                  {activity.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No activity recorded yet.</p>}
   440→   440→                </div>
   441→   441→              </CardContent>
   442→   442→            </Card>
   443→   443→          </TabsContent>
   444→   444→        </Tabs>
   445→   445→      </main>
   446→   446→
   447→   447→      {/* Add team member dialog */}
   448→   448→      <Dialog open={addTeamOpen} onOpenChange={setAddTeamOpen}>
   449→   449→        <DialogContent className="sm:max-w-md">
   450→   450→          <DialogHeader>
   451→   451→            <DialogTitle className="text-emerald-950">Add team member</DialogTitle>
   452→   452→            <DialogDescription>They will get a TEAM login and can be assigned requests.</DialogDescription>
   453→   453→          </DialogHeader>
   454→   454→          <form
   455→   455→            className="space-y-3"
   456→   456→            onSubmit={async (e) => {
   457→   457→              e.preventDefault()
   458→   458→              try {
   459→   459→                await api('/api/admin/team', { method: 'POST', body: JSON.stringify(newMember) })
   460→   460→                toast({ title: 'Team member added', description: `${newMember.name} can now sign in.` })
   461→   461→                setAddTeamOpen(false)
   462→   462→                setNewMember({ name: '', email: '', phone: '', password: '' })
   463→   463→                loadTabData('team')
   464→   464→              } catch (err) {
   465→   465→                toast({ title: 'Could not add member', description: err instanceof Error ? err.message : 'Try again', variant: 'destructive' })
   466→   466→              }
   467→   467→            }}
   468→   468→          >
   469→   469→            <div className="space-y-1.5">
   470→   470→              <Label htmlFor="tm-name">Full name *</Label>
   471→   471→              <Input id="tm-name" value={newMember.name} onChange={(e) => setNewMember((m) => ({ ...m, name: e.target.value }))} required />
   472→   472→            </div>
   473→   473→            <div className="grid grid-cols-2 gap-3">
   474→   474→              <div className="space-y-1.5">
   475→   475→                <Label htmlFor="tm-email">Email *</Label>
   476→   476→                <Input id="tm-email" type="email" value={newMember.email} onChange={(e) => setNewMember((m) => ({ ...m, email: e.target.value }))} required />
   477→   477→              </div>
   478→   478→              <div className="space-y-1.5">
   479→   479→                <Label htmlFor="tm-phone">Phone</Label>
   480→   480→                <Input id="tm-phone" value={newMember.phone} onChange={(e) => setNewMember((m) => ({ ...m, phone: e.target.value }))} />
   481→   481→              </div>
   482→   482→            </div>
   483→   483→            <div className="space-y-1.5">
   484→   484→              <Label htmlFor="tm-pass">Temporary password *</Label>
   485→   485→              <Input id="tm-pass" type="text" value={newMember.password} onChange={(e) => setNewMember((m) => ({ ...m, password: e.target.value }))} placeholder="Min 8 characters" required minLength={8} />
   486→   486→              <p className="text-[11px] text-muted-foreground">Stored as a bcrypt hash — never in plain text.</p>
   487→   487→            </div>
   488→   488→            <Button type="submit" className="w-full bg-emerald-700 hover:bg-emerald-800">Create team member</Button>
   489→   489→          </form>
   490→   490→        </DialogContent>
   491→   491→      </Dialog>
   492→   492→
   493→   493→      <InvoiceDialog payment={invoice} onClose={() => setInvoice(null)} />
   494→   494→
   495→   495→      <footer className="mt-auto border-t bg-white">
   496→   496→        <div className="mx-auto max-w-7xl px-4 py-4 text-xs text-muted-foreground">
   497→   497→          © {new Date().getFullYear()} SellerSetu Admin · All workflow changes are recorded in the audit log.
   498→   498→        </div>
   499→   499→      </footer>
   500→   500→    </div>
   501→
   502→[showing lines 1-500 of 935; use offset=501 with limit to continue reading]