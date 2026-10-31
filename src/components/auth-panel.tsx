'use client'

import { useState } from 'react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff, Loader2, Store, Handshake, User, ShieldCheck } from 'lucide-react'
import { api, ApiUser } from '@/lib/client'

interface Props {
  mode: 'login' | 'register'
  onModeChange: (m: 'login' | 'register') => void
  onSuccess: (user: ApiUser) => void
  onClose: () => void
}

export default function AuthPanel({ mode, onModeChange, onSuccess, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [accountType, setAccountType] = useState<'CUSTOMER' | 'VENDOR'>('CUSTOMER')
  const [loginType, setLoginType] = useState<'CUSTOMER' | 'VENDOR' | 'STAFF'>('CUSTOMER')
  const [form, setForm] = useState({
    name: '', email: '', phone: '', company: '', password: '',
    businessName: '', expertise: '', serviceLocations: '', website: '', description: '',
  })
  const [error, setError] = useState<string | null>(null)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const qs = mode === 'register' ? '?mode=register' : '?mode=login'
      const payload =
        mode === 'register'
          ? accountType === 'VENDOR'
            ? {
                accountType, name: form.name, email: form.email, phone: form.phone, password: form.password,
                businessName: form.businessName, expertise: form.expertise, serviceLocations: form.serviceLocations,
                website: form.website, description: form.description,
              }
            : { accountType, name: form.name, email: form.email, phone: form.phone, company: form.company || undefined, password: form.password }
          : { email: form.email, password: form.password }
      const d = await api<{ user: ApiUser }>(`/api/auth${qs}`, { method: 'POST', body: JSON.stringify(payload) })
      toast({
        title: mode === 'register' ? (accountType === 'VENDOR' ? 'Vendor application received' : 'Welcome!') : 'Signed in',
        description: accountType === 'VENDOR' && mode === 'register'
          ? 'Your vendor account is pending admin approval.'
          : `Hello ${d.user.name}`,
      })
      onSuccess(d.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-emerald-950/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'login' ? 'Sign in' : 'Create account'}
      >
        <div className={
          mode === 'login' && loginType === 'STAFF'
            ? 'bg-gradient-to-r from-slate-900 to-slate-700 px-6 py-5 text-white'
            : 'bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-5 text-white'
        }>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center">
              {mode === 'login' && loginType === 'STAFF' ? <ShieldCheck className="h-5 w-5" /> : <Store className="h-5 w-5" />}
            </div>
            <span className="font-bold">SellerSetu</span>
            {mode === 'login' && loginType === 'STAFF' && (
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider bg-white/15 rounded-full px-2.5 py-1">Admin · Staff</span>
            )}
          </div>
          <h2 className="text-lg font-semibold">
            {mode === 'login'
              ? loginType === 'STAFF'
                ? 'Staff & admin sign in'
                : 'Sign in to your dashboard'
              : accountType === 'VENDOR' ? 'Register as a vendor partner' : 'Create your customer account'}
          </h2>
          <p className="text-xs text-emerald-50/80 mt-0.5">
            {mode === 'login'
              ? loginType === 'STAFF'
                ? 'Operations console — super admin, admin, ops, sales, project managers & employees.'
                : loginType === 'VENDOR'
                  ? 'Vendor partners — manage engagements, milestones, submissions and chat.'
                  : 'Track requests, quotations, documents, payments and chat in one place.'
              : accountType === 'VENDOR'
                ? 'Apply to execute projects or receive direct-connection referrals.'
                : 'Free to create — request any service and receive a customized quotation.'}
          </p>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          {mode === 'login' && (
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Sign in as">
              {([
                { value: 'CUSTOMER', label: 'Customer', icon: User },
                { value: 'VENDOR', label: 'Vendor', icon: Handshake },
                { value: 'STAFF', label: 'Admin / Staff', icon: ShieldCheck },
              ] as const).map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={loginType === t.value}
                  onClick={() => setLoginType(t.value)}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors ${
                    loginType === t.value
                      ? t.value === 'STAFF'
                        ? 'border-slate-800 bg-slate-100 text-slate-900'
                        : 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : 'hover:border-stone-300 text-stone-600'
                  }`}
                >
                  <t.icon className="h-4 w-4" /> {t.label}
                </button>
              ))}
            </div>
          )}

          {mode === 'register' && (
            <>
              {/* Account type switch */}
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account type">
                {([
                  { value: 'CUSTOMER', label: 'I need services', icon: User },
                  { value: 'VENDOR', label: 'I provide services', icon: Handshake },
                ] as const).map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={accountType === t.value}
                    onClick={() => setAccountType(t.value)}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
                      accountType === t.value ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'hover:border-stone-300 text-stone-600'
                    }`}
                  >
                    <t.icon className="h-4 w-4" /> {t.label}
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="auth-name">{accountType === 'VENDOR' ? 'Contact person name *' : 'Full name *'}</Label>
                <Input id="auth-name" value={form.name} onChange={set('name')} placeholder="Rahul Sharma" required minLength={2} />
              </div>
              {accountType === 'VENDOR' ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="auth-business">Business name *</Label>
                    <Input id="auth-business" value={form.businessName} onChange={set('businessName')} placeholder="Kriya Studio" required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="auth-expertise">Service expertise</Label>
                      <Input id="auth-expertise" value={form.expertise} onChange={set('expertise')} placeholder="Photography, Video, Packaging" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="auth-locations">Service locations</Label>
                      <Input id="auth-locations" value={form.serviceLocations} onChange={set('serviceLocations')} placeholder="Mumbai, Pune" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="auth-website">Website / portfolio (optional)</Label>
                    <Input id="auth-website" value={form.website} onChange={set('website')} placeholder="https://…" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="auth-desc">About your business</Label>
                    <textarea id="auth-desc" value={form.description} onChange={set('description')} rows={2}
                      placeholder="What you do, capacity, notable clients…"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="auth-phone">Phone *</Label>
                    <Input id="auth-phone" value={form.phone} onChange={set('phone')} placeholder="9876543210" required minLength={10} maxLength={15} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="auth-company">Business (optional)</Label>
                    <Input id="auth-company" value={form.company} onChange={set('company')} placeholder="Sharma Traders" />
                  </div>
                </div>
              )}
              {accountType === 'VENDOR' && (
                <div className="space-y-1.5">
                  <Label htmlFor="auth-phone-v">Phone *</Label>
                  <Input id="auth-phone-v" value={form.phone} onChange={set('phone')} placeholder="9876543210" required minLength={10} maxLength={15} />
                </div>
              )}
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="auth-email">Email</Label>
            <Input id="auth-email" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required autoComplete="email" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="auth-password">Password</Label>
            <div className="relative">
              <Input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                placeholder={mode === 'register' ? 'Minimum 8 characters' : 'Your password'}
                required
                minLength={mode === 'register' ? 8 : 1}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {mode === 'register' && (
              <p className="text-[11px] text-muted-foreground">
                {accountType === 'VENDOR'
                  ? 'Vendor accounts are activated after admin verification.'
                  : 'Stored securely with bcrypt hashing — never in plain text.'}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={loading}
            className={
              mode === 'login' && loginType === 'STAFF'
                ? 'w-full bg-slate-900 hover:bg-slate-800 h-11'
                : 'w-full bg-emerald-600 hover:bg-emerald-700 h-11'
            }
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === 'login'
              ? loginType === 'STAFF' ? 'Sign in to operations console' : 'Sign in'
              : accountType === 'VENDOR' ? 'Apply as vendor' : 'Create account'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {mode === 'login' ? (
              <>New to SellerSetu?{' '}
                <button type="button" onClick={() => onModeChange('register')} className="text-emerald-700 font-medium hover:underline">
                  Create an account
                </button>
              </>
            ) : (
              <>Already have an account?{' '}
                <button type="button" onClick={() => onModeChange('login')} className="text-emerald-700 font-medium hover:underline">
                  Sign in
                </button>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  )
}
