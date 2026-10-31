'use client'

import { useState } from 'react'
import { toast } from '@/hooks/use-toast'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  IndianRupee, Loader2, ShieldCheck, Smartphone, CreditCard, Landmark,
  CheckCircle2, XCircle, ArrowLeft, Info,
} from 'lucide-react'
import { api, ApiPayment } from '@/lib/client'
import { formatINR, formatDateTime } from '@/lib/constants'

interface Props {
  open: boolean
  onClose: () => void
  payment: ApiPayment | null        // PENDING payment to be paid
  requestLabel: string              // e.g. SR-2026-00018 · Amazon Seller Registration
  onPaid: () => void                // refresh dashboards after success
}

type Method = 'UPI' | 'CARD' | 'NETBANKING'
type Stage = 'select' | 'details' | 'processing' | 'success' | 'failed'

const BANKS = ['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Mahindra', 'Punjab National Bank']

// Simulated Indian payment gateway checkout.
// Production note: replace this dialog with the gateway SDK (e.g. Razorpay Checkout)
// and keep server-side signature verification as the only way to mark payments PAID.
export default function PaymentGatewayDialog({ open, onClose, payment, requestLabel, onPaid }: Props) {
  const [stage, setStage] = useState<Stage>('select')
  const [method, setMethod] = useState<Method>('UPI')
  const [vpa, setVpa] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [bank, setBank] = useState('')
  const [message, setMessage] = useState('')

  if (!payment) return null

  function reset() {
    setStage('select')
    setVpa(''); setCardNumber(''); setExpiry(''); setCvv(''); setBank(''); setMessage('')
  }

  function handleClose() {
    if (stage === 'processing') return // don't close while processing
    reset()
    onClose()
  }

  async function pay() {
    if (!payment) return
    setStage('processing')
    try {
      const d = await api<{ status: string; message?: string; payment?: ApiPayment; newStatusLabel?: string }>(
        `/api/payments/${payment.id}/process`,
        {
          method: 'POST',
          body: JSON.stringify(
            method === 'UPI'
              ? { method, vpa }
              : method === 'CARD'
                ? { method, cardNumber, expiry, cvv }
                : { method, bank }
          ),
        }
      )
      if (d.status === 'PAID') {
        setStage('success')
        toast({ title: 'Payment successful 🎉', description: `${formatINR(payment.amount)} paid — receipt ${d.payment?.receiptNo}` })
        onPaid()
      } else {
        setMessage(d.message || 'Payment failed at the gateway.')
        setStage('failed')
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Payment failed')
      setStage('failed')
    }
  }

  const canPay =
    method === 'UPI' ? /^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(vpa)
    : method === 'CARD' ? /^\d{12,19}$/.test(cardNumber.replace(/\s/g, '')) && /^\d{2}\/\d{2}$/.test(expiry) && /^\d{3,4}$/.test(cvv)
    : !!bank

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden" onEscapeKeyDown={(e) => stage === 'processing' && e.preventDefault()}>
        <DialogHeader className="px-6 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-emerald-950">
              {stage === 'select' || stage === 'details' ? (
                <><IndianRupee className="h-5 w-5 text-emerald-600" /> Secure Checkout</>
              ) : stage === 'success' ? (
                <><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Payment Successful</>
              ) : stage === 'failed' ? (
                <><XCircle className="h-5 w-5 text-red-500" /> Payment Failed</>
              ) : (
                'Processing Payment'
              )}
            </DialogTitle>
          </div>
          <DialogDescription>
            {requestLabel} · {payment.type === 'ADVANCE' ? 'Advance payment (50%)' : 'Final payment (50%)'}
          </DialogDescription>
        </DialogHeader>

        {/* Amount banner */}
        <div className="mx-6 mb-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] opacity-80">Amount payable</p>
            <p className="text-xl font-bold">{formatINR(payment.amount)}</p>
          </div>
          <ShieldCheck className="h-8 w-8 opacity-80" />
        </div>

        {stage === 'select' && (
          <div className="px-6 pb-6 space-y-2">
            {([
              { id: 'UPI' as Method, icon: Smartphone, label: 'UPI', desc: 'GPay, PhonePe, Paytm & more' },
              { id: 'CARD' as Method, icon: CreditCard, label: 'Card', desc: 'Debit or credit card' },
              { id: 'NETBANKING' as Method, icon: Landmark, label: 'Net Banking', desc: 'All major Indian banks' },
            ]).map((m) => (
              <button
                key={m.id}
                onClick={() => { setMethod(m.id); setStage('details') }}
                className="w-full flex items-center gap-3 rounded-xl border p-3.5 text-left hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors"
              >
                <m.icon className="h-5 w-5 text-emerald-600" />
                <div className="flex-1">
                  <p className="font-medium text-sm">{m.label}</p>
                  <p className="text-xs text-muted-foreground">{m.desc}</p>
                </div>
                <Badge variant="outline" className="text-[10px] border-emerald-200 text-emerald-700">Secure</Badge>
              </button>
            ))}
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground pt-2">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>Demo gateway for evaluation. Transactions are verified server-side before any status changes — ready to swap with Razorpay/Cashfree production credentials.</span>
            </div>
          </div>
        )}

        {stage === 'details' && (
          <div className="px-6 pb-6 space-y-4">
            <button onClick={() => setStage('select')} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Change method
            </button>
            <div className="text-sm font-medium flex items-center gap-2">
              {method === 'UPI' ? <Smartphone className="h-4 w-4 text-emerald-600" /> : method === 'CARD' ? <CreditCard className="h-4 w-4 text-emerald-600" /> : <Landmark className="h-4 w-4 text-emerald-600" />}
              {method === 'UPI' ? 'Pay via UPI' : method === 'CARD' ? 'Card details' : 'Net banking'}
            </div>

            {method === 'UPI' && (
              <div className="space-y-1.5">
                <Label htmlFor="upi-id">UPI ID</Label>
                <Input id="upi-id" value={vpa} onChange={(e) => setVpa(e.target.value)} placeholder="yourname@okhdfcbank" />
                <p className="text-[11px] text-muted-foreground">You will receive a collect request in your UPI app.</p>
              </div>
            )}
            {method === 'CARD' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="card-num">Card number</Label>
                  <Input id="card-num" value={cardNumber} inputMode="numeric"
                    onChange={(e) => setCardNumber(e.target.value.replace(/[^\d ]/g, '').replace(/(\d{4})(?=\d)/g, '$1 '))}
                    placeholder="4111 1111 1111 1111" maxLength={23} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="card-exp">Expiry (MM/YY)</Label>
                    <Input id="card-exp" value={expiry} inputMode="numeric"
                      onChange={(e) => {
                        let v = e.target.value.replace(/[^\d]/g, '').slice(0, 4)
                        if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2)
                        setExpiry(v)
                      }}
                      placeholder="09/29" maxLength={5} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="card-cvv">CVV</Label>
                    <Input id="card-cvv" type="password" value={cvv} inputMode="numeric"
                      onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="•••" maxLength={4} />
                  </div>
                </div>
              </div>
            )}
            {method === 'NETBANKING' && (
              <div className="space-y-1.5">
                <Label htmlFor="bank">Select bank</Label>
                <select
                  id="bank"
                  value={bank}
                  onChange={(e) => setBank(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <option value="">Choose your bank…</option>
                  {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            )}

            <Button onClick={pay} disabled={!canPay} className="w-full bg-emerald-600 hover:bg-emerald-700 h-11">
              Pay {formatINR(payment.amount)}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" /> 256-bit encrypted · PCI-DSS compliant
            </p>
          </div>
        )}

        {stage === 'processing' && (
          <div className="px-6 pb-10 pt-2 text-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-emerald-600 mx-auto" />
            <div>
              <p className="font-medium">Contacting {method === 'UPI' ? 'UPI network' : method === 'CARD' ? 'card network' : 'your bank'}…</p>
              <p className="text-sm text-muted-foreground mt-1">Do not close this window. Verifying with the payment gateway.</p>
            </div>
          </div>
        )}

        {stage === 'success' && (
          <div className="px-6 pb-6 space-y-4">
            <Separator />
            <div className="space-y-2 text-sm">
              {[
                ['Amount paid', formatINR(payment.amount)],
                ['Receipt no.', payment.type === 'ADVANCE' ? 'Auto-generated' : 'Auto-generated'],
                ['Paid at', formatDateTime(new Date())],
                ['Status', 'Verified by gateway ✓'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </div>
            <Button onClick={handleClose} className="w-full bg-emerald-600 hover:bg-emerald-700">
              Done — view updated dashboard
            </Button>
          </div>
        )}

        {stage === 'failed' && (
          <div className="px-6 pb-6 space-y-4">
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{message}</div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">Close</Button>
              <Button onClick={() => { reset(); setStage('select') }} className="flex-1 bg-emerald-600 hover:bg-emerald-700">Try again</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
