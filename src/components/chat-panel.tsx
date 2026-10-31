'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SendHorizonal, MessageSquare, Loader2, StickyNote } from 'lucide-react'
import { api, ApiMessage, ApiUser } from '@/lib/client'
import { formatDateTime } from '@/lib/constants'

interface Props {
  request: { id: string; requestCode: string }
  user: ApiUser
  allowInternal?: boolean
  onCountChange?: (count: number) => void
}

type SocketClient = ReturnType<typeof io>

// 1-to-1 chat per request. Persistence via REST; real-time via socket.io relay
// (mini-service on port 3003) with automatic polling fallback.
export default function ChatPanel({ request, user, allowInternal, onCountChange }: Props) {
  const [messages, setMessages] = useState<ApiMessage[]>([])
  const [input, setInput] = useState('')
  const [internal, setInternal] = useState(false)
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [typingUser, setTypingUser] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  const socketRef = useRef<SocketClient | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    })
  }, [])

  const loadMessages = useCallback(async () => {
    try {
      const d = await api<{ messages: ApiMessage[] }>(`/api/requests/${request.id}/messages`)
      setMessages(d.messages)
      onCountChange?.(d.messages.length)
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [request.id, onCountChange])

  // initial load + polling fallback every 6s (works even if socket is down)
  useEffect(() => {
    loadMessages()
    const t = setInterval(loadMessages, 6000)
    return () => clearInterval(t)
  }, [loadMessages])

  // single socket connection: fetch short-lived token first, then connect,
  // attach listeners, authenticate and join the request room (re-joins on reconnect)
  useEffect(() => {
    let cancelled = false

    async function connect() {
      try {
        const d = await api<{ token: string }>('/api/socket-token')
        if (cancelled) return
        const socket = io('/?XTransformPort=3003', {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 2000,
          timeout: 8000,
        })
        socketRef.current = socket

        const authAndJoin = () => {
          socket.emit('auth', { token: d.token }, (res: { ok: boolean }) => {
            if (res?.ok) socket.emit('join-request', { requestId: request.id })
          })
        }

        socket.on('connect', () => {
          setLive(true)
          authAndJoin()
        })
        socket.on('disconnect', () => setLive(false))
        socket.on('chat-message', (data: { requestId: string; message: ApiMessage }) => {
          if (data.requestId !== request.id) return
          setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]))
        })
        socket.on('typing', (data: { requestId: string; userName: string }) => {
          if (data.requestId !== request.id) return
          setTypingUser(data.userName)
          setTimeout(() => setTypingUser(null), 2500)
        })
        if (socket.connected) authAndJoin() // already connected before listeners attached
      } catch { /* polling fallback still works */ }
    }

    connect()

    return () => {
      cancelled = true
      socketRef.current?.disconnect()
      socketRef.current = null
    }
  }, [request.id])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  async function send(e?: React.FormEvent) {
    e?.preventDefault()
    const content = input.trim()
    if (!content || sending) return
    setSending(true)
    setInput('')
    try {
      const d = await api<{ message: ApiMessage }>(`/api/requests/${request.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content, isInternal: allowInternal && internal }),
      })
      setMessages((prev) => (prev.some((m) => m.id === d.message.id) ? prev : [...prev, d.message]))
      socketRef.current?.emit('chat-message', { requestId: request.id, message: d.message })
    } catch (err) {
      setInput(content)
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  function onInputChange(v: string) {
    setInput(v)
    if (typingTimer.current) clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => {
      socketRef.current?.emit('typing', { requestId: request.id, userName: user.name })
    }, 300)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="h-4 w-4 text-emerald-600" />
          <span>Dedicated channel for {request.requestCode}</span>
        </div>
        <span className={`text-[11px] flex items-center gap-1.5 ${live ? 'text-emerald-600' : 'text-amber-600'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
          {live ? 'Live' : 'Polling'}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 max-h-[420px] overflow-y-auto rounded-xl border bg-stone-50/60 p-4 space-y-3">
        {loading ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm py-12">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading conversation…
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm py-12 gap-2">
            <MessageSquare className="h-8 w-8 text-emerald-200" />
            <p>No messages yet. Say hello to your service team!</p>
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === user.id
            const staff = m.sender.role === 'ADMIN' || m.sender.role === 'TEAM'
            const note = m.isInternal === true
            return (
              <div key={m.id} className={`flex ${mine && !note ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                  note ? 'bg-amber-50 border border-amber-300 rounded-bl-md' : mine ? 'bg-emerald-600 text-white rounded-br-md' : 'bg-white border rounded-bl-md'
                }`}>
                  {(note || !mine) && (
                    <p className={`text-[11px] font-semibold mb-0.5 ${note ? 'text-amber-700 flex items-center gap-1' : staff ? 'text-teal-700' : 'text-muted-foreground'}`}>
                      {note && <StickyNote className="h-3 w-3" />}
                      {note ? `Internal note · ${m.sender.name}` : m.sender.name}{staff && !note ? ' · Team' : ''}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words leading-relaxed">{m.content}</p>
                  <p className={`text-[10px] mt-1 text-right ${mine && !note ? 'text-emerald-100/80' : note ? 'text-amber-600/70' : 'text-muted-foreground/70'}`}>
                    {formatDateTime(m.createdAt)}{note ? ' · not visible to customer' : ''}
                  </p>
                </div>
              </div>
            )
          })
        )}
        {typingUser && <div className="text-xs text-muted-foreground italic pl-1">{typingUser} is typing…</div>}
      </div>

      <form onSubmit={send} className="pt-3 space-y-2">
        {allowInternal && (
          <label className="flex items-center gap-2 text-xs text-amber-700 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={internal}
              onChange={(e) => setInternal(e.target.checked)}
              className="h-3.5 w-3.5 accent-amber-500"
            />
            <StickyNote className="h-3.5 w-3.5" />
            Post as internal note (hidden from customer)
          </label>
        )}
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder={internal ? 'Write an internal note for the team…' : 'Type your message…'}
            maxLength={2000}
            className={`flex-1 ${internal ? 'border-amber-300 focus-visible:ring-amber-400' : ''}`}
            aria-label="Message"
          />
          <Button type="submit" disabled={!input.trim() || sending} className={`px-4 ${internal ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
          </Button>
        </div>
      </form>
    </div>
  )
}
