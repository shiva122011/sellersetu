'use client'

import { Badge } from '@/components/ui/badge'
import { Truck } from 'lucide-react'
import { formatDateTime, formatINR } from '@/lib/constants'
import {
  ORDER_STATUS_LABELS, ORDER_STATUS_BADGE,
  DELIVERY_STATUS_LABELS, DELIVERY_STATUS_BADGE,
} from '@/lib/marketplace/types'

// Small shared presentational pieces for the Amazon SP-API dashboard.

export function StatusBadge({ status }: { status: string }) {
  const cls = ORDER_STATUS_BADGE[status] || 'bg-stone-100 text-stone-600 border-stone-200'
  return <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${cls}`}>{ORDER_STATUS_LABELS[status] || status}</Badge>
}

export function DeliveryBadge({ status }: { status: string }) {
  const cls = DELIVERY_STATUS_BADGE[status] || 'bg-stone-100 text-stone-600 border-stone-200'
  return <Badge variant="outline" className={`text-[10px] whitespace-nowrap gap-1 ${cls}`}><Truck className="h-3 w-3" />{DELIVERY_STATUS_LABELS[status] || status}</Badge>
}

export function FulfilmentBadge({ channel }: { channel?: string | null }) {
  if (!channel) return null
  return (
    <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${channel === 'AFN' ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-orange-200 bg-orange-50 text-orange-800'}`}>
      {channel === 'AFN' ? 'Fulfilled by Amazon (FBA)' : 'Merchant fulfilled (self-ship)'}
    </Badge>
  )
}

export function StatCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: string }) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-4 flex items-center gap-3">
      <div className="h-9 w-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className={`text-xl font-bold leading-none ${tone}`}>{value}</p>
        <p className="text-[11px] text-muted-foreground mt-1 truncate">{label}</p>
      </div>
    </div>
  )
}

export function money(amount?: number | null, currency?: string | null): string {
  if (amount === null || amount === undefined) return '—'
  if (currency && currency !== 'INR') return `${currency} ${amount.toFixed(2)}`
  return formatINR(amount)
}

export function dt(value?: string | null): string {
  return value ? formatDateTime(value) : '—'
}

export function StepDot({ n }: { n: number }) {
  return (
    <span className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
  )
}
