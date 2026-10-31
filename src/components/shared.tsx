'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { CheckCircle2, Clock, Download, Printer, XCircle, FileUp } from 'lucide-react'
import { STATUS_LABELS, STATUS_COLORS, formatINR, formatDateTime, PAYMENT_TYPE_LABELS } from '@/lib/constants'
import { ApiPayment, ApiDocument } from '@/lib/client'

export function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={`${STATUS_COLORS[status] || 'bg-stone-100 text-stone-700 border-stone-200'} ${className}`}>
      {STATUS_LABELS[status] || status}
    </Badge>
  )
}

// Company logo with graceful initials fallback — used for vendor/company details.
export function CompanyLogo({ name, src, className = 'h-10 w-10 rounded-lg' }: { name: string; src?: string | null; className?: string }) {
  const initials = (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  if (!src) {
    return (
      <span aria-hidden className={`${className} shrink-0 inline-flex items-center justify-center bg-gradient-to-br from-emerald-600 to-teal-500 text-white font-bold`} style={{ fontSize: '40%' }}>
        {initials}
      </span>
    )
  }
  return (
     
    <img
      src={src}
      alt={`${name} logo`}
      className={`${className} shrink-0 rounded-lg border bg-white object-contain p-0.5`}
      onError={(e) => {
        const el = e.currentTarget
        if (el.dataset.fallback) return
        el.dataset.fallback = '1'
        el.style.display = 'none'
        el.insertAdjacentHTML('afterend',
          `<span class="${className} shrink-0 inline-flex items-center justify-center rounded-lg border bg-gradient-to-br from-emerald-600 to-teal-500 text-white font-bold" style="font-size:40%">${initials}</span>`)
      }}
    />
  )
}

export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`h-2.5 rounded-full bg-emerald-100 overflow-hidden ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

export function DocStatusIcon({ doc }: { doc: ApiDocument }) {
  if (doc.status === 'APPROVED')
    return <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium"><CheckCircle2 className="h-3.5 w-3.5" /> Approved</span>
  if (doc.status === 'REJECTED')
    return <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium"><XCircle className="h-3.5 w-3.5" /> Rejected</span>
  if (doc.status === 'SHARED')
    return <span className="inline-flex items-center gap-1 text-xs text-teal-700 font-medium"><FileUp className="h-3.5 w-3.5" /> Shared by team</span>
  return <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium"><Clock className="h-3.5 w-3.5" /> Under review</span>
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Printable invoice / receipt dialog
export function InvoiceDialog({
  payment, onClose,
}: {
  payment: ApiPayment | null
  onClose: () => void
}) {
  if (!payment) return null
  const paid = payment.status === 'PAID'
  const gst = Math.round(payment.amount * 0.18)

  return (
    <Dialog open={!!payment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" aria-label="Payment receipt">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className={paid ? 'text-emerald-700' : 'text-amber-700'}>
              {PAYMENT_TYPE_LABELS[payment.type] || payment.type} {paid ? 'Receipt' : 'Invoice'}
            </span>
            <Badge variant="outline" className={paid ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>
              {payment.status}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {payment.request?.requestCode} · {payment.request?.title}
          </DialogDescription>
        </DialogHeader>

        <div id="invoice-print-area" className="space-y-4 text-sm">
          <div className="flex items-start justify-between border-b pb-4">
            <div>
              <p className="font-bold text-emerald-900 text-base">SellerSetu</p>
              <p className="text-xs text-muted-foreground">Digital Seller Services</p>
              <p className="text-xs text-muted-foreground">support@sellersetu.in · +91 90000 12345</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                {paid ? 'Receipt' : 'Invoice'} No.
              </p>
              <p className="font-mono text-sm font-medium">{paid ? payment.receiptNo || '—' : `INV-${payment.id.slice(0, 8).toUpperCase()}`}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {paid ? 'Paid on' : 'Issued on'} {formatDateTime(payment.paidAt || payment.createdAt)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Billed to</p>
              <p className="font-medium">{payment.request?.customer?.name}</p>
              <p className="text-xs text-muted-foreground">{payment.request?.customer?.email}</p>
              <p className="text-xs text-muted-foreground">{payment.request?.title}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-1">Transaction</p>
              <p className="font-mono text-xs">{payment.transactionId || 'Pending'}</p>
              <p className="text-xs text-muted-foreground">{payment.method || '—'}</p>
            </div>
          </div>

          <div className="rounded-lg border">
            <div className="flex justify-between px-4 py-2.5 border-b bg-stone-50">
              <span className="font-medium">Service charges — {payment.label || PAYMENT_TYPE_LABELS[payment.type]}</span>
              <span className="font-medium">{formatINR(payment.amount - Math.round((payment.amount * 18) / 118))}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5 border-b text-muted-foreground">
              <span>GST @ 18% (inclusive)</span>
              <span>{formatINR(Math.round((payment.amount * 18) / 118))}</span>
            </div>
            <div className="flex justify-between px-4 py-3 bg-emerald-50/60">
              <span className="font-bold text-emerald-900">Total {paid ? 'paid' : 'due'}</span>
              <span className="font-bold text-emerald-900">{formatINR(payment.amount)}</span>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {paid
              ? 'Payment verified through the payment gateway before this receipt was generated. This is a computer-generated receipt and does not require a signature.'
              : 'This invoice is payable through your dashboard using UPI, card, or net banking.'}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()} className="flex-1 gap-2">
            <Printer className="h-4 w-4" /> Print receipt
          </Button>
          <Button onClick={() => window.print()} className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Download className="h-4 w-4" /> Save as PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
