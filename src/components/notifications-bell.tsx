'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Bell, BellRing, CheckCheck } from 'lucide-react'
import { api, ApiNotification } from '@/lib/client'
import { formatDateTime } from '@/lib/constants'

const TYPE_ICON: Record<string, string> = {
  STATUS: '📈',
  PAYMENT: '💳',
  DOCUMENT: '📄',
  MESSAGE: '💬',
  INFO: 'ℹ️',
}

export default function NotificationsBell({ refreshKey }: { refreshKey?: number }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ApiNotification[]>([])
  const [unread, setUnread] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const d = await api<{ notifications: ApiNotification[]; unread: number }>('/api/notifications')
      setItems(d.notifications)
      setUnread(d.unread)
    } catch { /* silent */ }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time data fetch, setState runs after await
  useEffect(() => { load() }, [load, refreshKey])

  // Poll for new notifications every 15s
  useEffect(() => {
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  async function markAll() {
    await api('/api/notifications/read', { method: 'POST', body: JSON.stringify({}) }).catch(() => {})
    load()
  }

  async function markOne(n: ApiNotification) {
    if (n.isRead) return
    await api('/api/notifications/read', { method: 'POST', body: JSON.stringify({ id: n.id }) }).catch(() => {})
    load()
  }

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        className="relative text-emerald-900 hover:bg-emerald-50"
        aria-label={`Notifications (${unread} unread)`}
      >
        {unread > 0 ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-5 min-w-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 md:w-96 rounded-xl border bg-white shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-emerald-50/50">
            <span className="font-semibold text-sm text-emerald-900">Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-emerald-700 hover:underline flex items-center gap-1">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto divide-y">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">No notifications yet</div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markOne(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-stone-50 transition-colors ${!n.isRead ? 'bg-emerald-50/40' : ''}`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-base leading-5 mt-0.5">{TYPE_ICON[n.type] || 'ℹ️'}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${!n.isRead ? 'font-semibold text-emerald-900' : 'font-medium text-foreground/80'}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">{formatDateTime(n.createdAt)}</p>
                    </div>
                    {!n.isRead && <span className="h-2 w-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
