'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/hooks/use-toast'
import Landing from '@/components/landing'
import AuthPanel from '@/components/auth-panel'
import CustomerDashboard from '@/components/customer-dashboard'
import AdminDashboard from '@/components/admin-dashboard'
import VendorPortal from '@/components/vendor-portal'
import { Loader2 } from 'lucide-react'
import { api, ApiUser } from '@/lib/client'
import { isStaffRole } from '@/lib/constants'

type AuthMode = 'login' | 'register'

export default function Home() {
  const [user, setUser] = useState<ApiUser | null>(null)
  const [booting, setBooting] = useState(true)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('login')

  // Restore session on load
  useEffect(() => {
    api<{ user: ApiUser }>('/api/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setBooting(false))
  }, [])

  const openAuth = useCallback((mode: AuthMode) => {
    setAuthMode(mode)
    setAuthOpen(true)
  }, [])

  const handleAuthSuccess = useCallback((u: ApiUser) => {
    setUser(u)
    setAuthOpen(false)
  }, [])

  const handleLogout = useCallback(async () => {
    await api('/api/auth/me', { method: 'DELETE' }).catch(() => {})
    setUser(null)
    toast({ title: 'Signed out', description: 'See you soon!' })
  }, [])

  if (booting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white gap-3">
        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-white animate-spin" />
        </div>
        <p className="text-sm text-muted-foreground">Loading SellerSetu…</p>
      </div>
    )
  }

  return (
    <>
      {user ? (
        user.role === 'CUSTOMER' ? (
          <CustomerDashboard user={user} onLogout={handleLogout} />
        ) : user.role === 'VENDOR' ? (
          <VendorPortal user={user} onLogout={handleLogout} />
        ) : isStaffRole(user.role) ? (
          <AdminDashboard user={user} onLogout={handleLogout} />
        ) : (
          <CustomerDashboard user={user} onLogout={handleLogout} />
        )
      ) : (
        <Landing onAuth={openAuth} />
      )}

      {authOpen && !user && (
        <AuthPanel
          mode={authMode}
          onModeChange={setAuthMode}
          onSuccess={handleAuthSuccess}
          onClose={() => setAuthOpen(false)}
        />
      )}
    </>
  )
}
