'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
  Package, MapPin, Truck, Undo2, XCircle, Loader2, Lock, User, ShieldAlert,
  Ship, RefreshCw, History, CheckCircle2, XCircle as XCircleIcon, UserRound,
} from 'lucide-react'
import { api } from '@/lib/client'
import { formatDateTime, formatINR } from '@/lib/constants'
import { StatusBadge, DeliveryBadge, FulfilmentBadge, money, dt } from './shared'
import type { ApiOrder, ApiOrderItem, MfnService } from './types'
import { DELIVERY_STATUS_LABELS } from '@/lib/marketplace/types'

// Full order detail + real shipment workflow:
//  - PII (buyer / full address) via Amazon Restricted Data Tokens, cached encrypted
//  - MFN shipment preparation: real rate quotes (Merchant Fulfillment API)
//  - Real shipment confirmation (Orders API) — Amazon's own result is shown

interface DetailData {
  order: ApiOrder
  pii: {
    address: Record<string, string> | null
    buyer: Record<string, string> | null
    error: string | null
    note: string | null
  }
}

export function OrderDetailDialog({
  order,
  onClose,
  onChanged,
}: {
  order: ApiOrder | null
  onClose: () => void
  onChanged: () => void
}) {
  const [detail, setDetail] = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(false)
  const [piiRequested, setPiiRequested] = useState(false)

  // shipment workflow state
  const [carrier, setCarrier] = useState('')
  const [tracking, setTracking] = useState('')
  const [pkgWeight, setPkgWeight] = useState('500')
  const [pkgDims, setPkgDims] = useState({ length: '30', width: '20', height: '10' })
  const [services, setServices] = useState<MfnService[] | null>(null)
  const [servicesLoading, setServicesLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async (withPii: boolean) => {
    if (!order) return
    setLoading(true)
    try {
      const d = await api<DetailData>(`/api/marketplace/orders/${order.id}${withPii ? '?pii=1' : ''}`)
      setDetail(d)
    } catch (e) {
      toast({ title: 'Could not load order details', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [order])

  useEffect(() => {
    setDetail(null)
    setPiiRequested(false)
    setServices(null)
    setCarrier('')
    setTracking('')
    if (order) load(false)
  }, [order, load])

  async function fetchPii() {
    setPiiRequested(true)
    await load(true)
  }

  const o = detail?.order || order
  if (!o) return null
  const totalUnits = o.items.reduce((s, it) => s + it.quantityOrdered, 0)
  const shippedUnits = o.items.reduce((s, it) => s + it.quantityShipped, 0)
  const canShip =
    o.fulfillmentChannel === 'MFN' &&
    ['UNSHIPPED', 'PARTIALLY_SHIPPED'].includes(o.orderStatus) &&
    !o.shipmentRecords?.some((r) => r.status === 'SUCCEEDED')

  const address = detail?.pii.address
  const buyer = detail?.pii.buyer

  async function fetchServices() {
    if (!o) return
    setServicesLoading(true)
    try {
      const d = await api<{ services: MfnService[] }>(`/api/marketplace/orders/${o.id}/shipping-services`, {
        method: 'POST',
        body: JSON.stringify({
          packageDimensions: {
            length: Number(pkgDims.length) || 30,
            width: Number(pkgDims.width) || 20,
            height: Number(pkgDims.height) || 10,
            unit: 'centimeters',
          },
          weight: { value: Number(pkgWeight) || 500, unit: 'g' },
        }),
      })
      setServices(d.services)
      if (d.services.length === 0) toast({ title: 'No shipping services available', description: 'Amazon returned no eligible services for this package/profile.' })
    } catch (e) {
      toast({ title: 'Shipping services unavailable', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' })
    } finally {
      setServicesLoading(false)
    }
  }

  async function confirmShipment() {
    if (!o) return
    if (!carrier.trim()) {
      toast({ title: 'Carrier is required', description: 'Amazon requires the carrier code to confirm a shipment.', variant: 'destructive' })
      return
    }
    setConfirming(true)
    try {
      const d = await api<{ message: string }>(`/api/marketplace/orders/${o.id}/ship`, {
        method: 'POST',
        body: JSON.stringify({ carrier: carrier.trim(), trackingNumber: tracking.trim() || undefined }),
      })
      toast({ title: 'Shipment confirmed on Amazon', description: d.message })
      setConfirming(false)
      setServices(null)
      await load(piiRequested)
      onChanged()
    } catch (e) {
      toast({ title: 'Amazon rejected the confirmation', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' })
    } finally {
      setConfirming(false)
    }
  }

  return (
    <Dialog open={!!order} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="font-mono text-emerald-950">{o.amazonOrderId}</DialogTitle>
            <StatusBadge status={o.orderStatus} />
            {o.deliveryStatus && <DeliveryBadge status={o.deliveryStatus} />}
            <FulfilmentBadge channel={o.fulfillmentChannel} />
            {o.isReturned && <Badge variant="outline" className="text-[10px] border-violet-200 text-violet-700">Returned</Badge>}
          </div>
          <DialogDescription>
            Placed {formatDateTime(o.purchaseDate)} · {o.salesChannel || 'Amazon.in'}
            {o.lastUpdateDate ? ` · updated ${formatDateTime(o.lastUpdateDate)}` : ''}
          </DialogDescription>
        </DialogHeader>

        {loading && !detail && (
          <div className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading order data…
          </div>
        )}

        {o.orderStatus === 'CANCELED' && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800 flex items-start gap-2">
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p><b>Order cancelled.</b> Reason{o.canceledReason ? `: ${o.canceledReason.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}` : ' not specified by Amazon.'}</p>
          </div>
        )}

        {/* Items */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-emerald-900 flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5" /> Products ({o.items.length} line item{o.items.length !== 1 ? 's' : ''} · {totalUnits} unit{totalUnits !== 1 ? 's' : ''}{shippedUnits > 0 ? `, ${shippedUnits} shipped` : ''})
          </p>
          <div className="rounded-lg border border-stone-200 divide-y divide-stone-100 max-h-64 overflow-y-auto">
            {o.items.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">
                Item details are not available yet — Amazon does not expose items for PENDING orders. Sync shortly or reopen this order to fetch them live.
              </p>
            )}
            {o.items.map((it) => (
              <div key={it.id} className="p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-stone-800">{it.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    SKU {it.sellerSku || '—'}{it.asin ? ` · ASIN ${it.asin}` : ''}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Qty {it.quantityOrdered}{it.quantityShipped ? ` · shipped ${it.quantityShipped}` : ''}
                  </p>
                </div>
                <p className="text-xs font-semibold text-emerald-900 whitespace-nowrap">{money(it.itemPrice, it.currency)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Shipping + buyer + tracking */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-stone-200 p-3.5 space-y-1.5">
            <p className="text-xs font-semibold text-emerald-900 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Shipping address</p>
            {address ? (
              <div className="text-xs text-stone-600 space-y-0.5">
                <p className="font-medium text-stone-700">{address.Name}</p>
                <p>{address.AddressLine1}{address.AddressLine2 ? `, ${address.AddressLine2}` : ''}</p>
                <p>{address.City}{address.StateOrRegion ? `, ${address.StateOrRegion}` : ''} — {address.PostalCode}</p>
                <p>{address.CountryCode}</p>
                {address.Phone && <p className="text-[10px] text-muted-foreground">Phone: {address.Phone}</p>}
              </div>
            ) : o.shipCity ? (
              <p className="text-xs text-stone-600">
                {o.shipCity}, {o.shipState}{o.shipCountry ? `, ${o.shipCountry}` : ''}{o.shipPostalCode ? ` — ${o.shipPostalCode}` : ''}
                <span className="block text-[10px] text-muted-foreground mt-1">Partial address (city-level) — what Amazon shares without PII access.</span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Address not shared by the API for this order.</p>
            )}
            {!address && (
              piiRequested ? (
                detail?.pii.error ? (
                  <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-900 space-y-1">
                    <p className="flex items-center gap-1 font-semibold"><ShieldAlert className="h-3 w-3" /> Amazon restricted this data</p>
                    <p>{detail.pii.error}</p>
                  </div>
                ) : loading ? (
                  <p className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Fetching via Amazon…</p>
                ) : null
              ) : (
                <Button variant="outline" size="sm" className="mt-2 h-7 text-[11px] gap-1.5" onClick={fetchPii}>
                  <UserRound className="h-3 w-3" /> Fetch full address & buyer
                </Button>
              )
            )}
            {buyer && (
              <div className="mt-2 pt-2 border-t border-stone-100 text-xs text-stone-600 space-y-0.5">
                <p className="flex items-center gap-1 font-medium text-stone-700"><User className="h-3 w-3" /> {buyer.BuyerName || 'Buyer'}</p>
                {buyer.BuyerEmail && <p className="text-[10px]">{buyer.BuyerEmail}</p>}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-stone-200 p-3.5 space-y-1.5">
            <p className="text-xs font-semibold text-emerald-900 flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> Shipment & tracking</p>
            {o.carrier || o.trackingNumber ? (
              <>
                <p className="text-xs text-stone-600">Carrier: {o.carrier}</p>
                <p className="text-xs font-mono text-stone-600">Tracking: {o.trackingNumber || '—'}</p>
                {o.deliveryStatus && <p className="text-[10px] text-muted-foreground">Delivery: {DELIVERY_STATUS_LABELS[o.deliveryStatus] || o.deliveryStatus}</p>}
              </>
            ) : o.orderStatus === 'CANCELED' ? (
              <p className="text-xs text-muted-foreground">No shipment — order was cancelled.</p>
            ) : o.fulfillmentChannel === 'AFN' ? (
              <p className="text-xs text-muted-foreground">Amazon fulfills this order (FBA) — tracking appears in Amazon&apos;s own systems and delivery updates arrive via notifications.</p>
            ) : (
              <p className="text-xs text-muted-foreground">Tracking will appear once the order is confirmed shipped.</p>
            )}
            {o.latestShipDate && !['SHIPPED', 'CANCELED'].includes(o.orderStatus) && (
              <p className="text-[10px] text-muted-foreground">Ship by {dt(o.latestShipDate)}</p>
            )}
            {o.latestDeliveryDate && o.orderStatus !== 'CANCELED' && (
              <p className="text-[10px] text-muted-foreground">Expected delivery {dt(o.latestDeliveryDate)}</p>
            )}
            {o.paymentMethod && <p className="text-[10px] text-muted-foreground">Payment: {o.paymentMethod}</p>}
          </div>
        </div>

        {/* Returns */}
        {o.isReturned && o.returnInfo && <ReturnInfoCard returnInfoJson={o.returnInfo} />}
        {o.returnRecords && o.returnRecords.length > 0 && (
          <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-violet-900 flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Amazon returns report ({o.returnRecords.length} row{o.returnRecords.length !== 1 ? 's' : ''})</p>
            {o.returnRecords.slice(0, 5).map((r) => (
              <p key={r.id} className="text-[10px] text-violet-900/85">
                {r.sku || r.productName || 'Item'} × {r.quantity} · {r.reason || 'reason not stated'} · {r.status || 'status pending'}{r.returnDate ? ` · ${dt(r.returnDate)}` : ''}
              </p>
            ))}
          </div>
        )}

        <Separator />

        {/* Real shipment workflow for merchant-fulfilled orders */}
        {canShip && (
          <div className="rounded-xl border-2 border-teal-200 bg-teal-50/50 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-teal-900 flex items-center gap-1.5"><Ship className="h-4 w-4" /> Prepare shipment</p>
              <Badge variant="outline" className="text-[10px] border-teal-300 text-teal-800">Real Amazon action</Badge>
            </div>
            <p className="text-[11px] text-teal-900/80">
              Confirming calls Amazon&apos;s official <b>Shipment Confirmation API</b> and marks this order as shipped on your real Seller Central account. Nothing is simulated.
            </p>
            <div className="grid sm:grid-cols-3 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[11px]">Package weight (g)</Label>
                <Input value={pkgWeight} onChange={(e) => setPkgWeight(e.target.value)} type="number" min={1} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">L×W×H (cm)</Label>
                <div className="flex gap-1.5">
                  {(['length', 'width', 'height'] as const).map((k) => (
                    <Input key={k} value={pkgDims[k]} onChange={(e) => setPkgDims({ ...pkgDims, [k]: e.target.value })} type="number" min={1} className="px-2" />
                  ))}
                </div>
              </div>
              <div className="flex items-end">
                <Button variant="outline" size="sm" onClick={fetchServices} disabled={servicesLoading} className="w-full gap-2 border-teal-300 text-teal-800">
                  {servicesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Get shipping options
                </Button>
              </div>
            </div>

            {services && services.length > 0 && (
              <div className="rounded-lg border border-teal-200 bg-white divide-y divide-teal-100 max-h-44 overflow-y-auto">
                {services.map((s, i) => (
                  <button
                    key={s.shippingServiceId || i}
                    className="w-full p-2.5 text-left hover:bg-teal-50/60 flex items-center justify-between gap-2"
                    onClick={() => setCarrier(s.carrierName || s.serviceName || carrier)}
                  >
                    <div>
                      <p className="text-xs font-medium text-stone-800">{s.serviceName || 'Shipping service'}</p>
                      <p className="text-[10px] text-muted-foreground">{s.carrierName || 'Carrier'} · {s.deliveryExperience || 'Delivery'}</p>
                    </div>
                    <p className="text-xs font-semibold text-emerald-900 whitespace-nowrap">{money(s.rateAmount, s.rateCurrency)}</p>
                  </button>
                ))}
                <p className="p-2 text-[10px] text-muted-foreground">Click a service to copy its carrier into the confirmation form (real rates from Amazon&apos;s Merchant Fulfillment API).</p>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[11px]">Carrier code *</Label>
                <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="e.g. India Post, Delhivery, Blue Dart" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Tracking number</Label>
                <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="AWB / consignment no." />
              </div>
            </div>
            <Button onClick={confirmShipment} disabled={confirming} className="w-full bg-teal-600 hover:bg-teal-700 gap-2">
              {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirm shipment on Amazon
            </Button>
          </div>
        )}

        {/* Shipment history */}
        {o.shipmentRecords && o.shipmentRecords.length > 0 && (
          <div className="rounded-lg border border-stone-200 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-emerald-900 flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Shipment actions on Amazon</p>
            {o.shipmentRecords.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-2 text-[11px]">
                <span className="flex items-center gap-1.5">
                  {r.status === 'SUCCEEDED' ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <XCircleIcon className="h-3 w-3 text-red-500" />}
                  <b>{r.status === 'SUCCEEDED' ? 'Confirmed' : 'Failed'}</b> · {r.carrier || '—'}{r.trackingNumber ? ` · ${r.trackingNumber}` : ''}
                </span>
                <span className="text-muted-foreground whitespace-nowrap">{formatDateTime(r.createdAt)}</span>
                {r.error && <p className="basis-full text-[10px] text-red-600">{r.error}</p>}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3">
          <p className="text-xs text-emerald-900">Order total ({o.numberOfItems || totalUnits} units)</p>
          <p className="font-bold text-emerald-950">{money(o.orderTotal, o.currency)}</p>
        </div>
        <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
          <Lock className="h-3 w-3" /> Fetched from Amazon via the official Selling Partner API and stored encrypted. Only you and your assigned team can view this data.
        </p>
      </DialogContent>
    </Dialog>
  )
}

function ReturnInfoCard({ returnInfoJson }: { returnInfoJson: string }) {
  let info: { reason?: string; status?: string; returnDate?: string; refundAmount?: number; quantity?: number } = {}
  try { info = JSON.parse(returnInfoJson) } catch { /* ignore */ }
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3.5 space-y-1.5">
      <p className="text-xs font-semibold text-violet-900 flex items-center gap-1.5"><Undo2 className="h-3.5 w-3.5" /> Return information</p>
      {info.reason && <p className="text-xs text-violet-900/85"><b>Reason:</b> {info.reason.replace(/_/g, ' ')}</p>}
      {info.status && <p className="text-xs text-violet-900/85"><b>Unit status:</b> {info.status.replace(/_/g, ' ')}</p>}
      {info.returnDate && <p className="text-xs text-violet-900/85"><b>Returned on:</b> {formatDateTime(info.returnDate)}</p>}
      {typeof info.quantity === 'number' && <p className="text-xs text-violet-900/85"><b>Units:</b> {info.quantity}</p>}
      {typeof info.refundAmount === 'number' && <p className="text-xs text-violet-900/85"><b>Refund amount:</b> {formatINR(info.refundAmount)}</p>}
    </div>
  )
}
