'use client'

// SellerSetu AI assistant — floating chat widget (landing + dashboards).
// Grounded Q&A over the live service catalogue via /api/ai/assistant.

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Bot, X, SendHorizontal, Loader2, Sparkles } from 'lucide-react'

interface Msg { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'I need a website for my business — how does it work?',
  'How is pricing decided?',
  'What is a direct vendor connection?',
  'Which services are available right now?',
]

export default function AiAssistant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      content: 'Hi! I\'m the SellerSetu AI assistant. Ask me which service fits your goal, what documents you\'ll need, or how payments and tracking work.',
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open])

  async function send(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || busy) return
    setInput('')
    const history = messages.filter((m) => m !== messages[0]).slice(-6)
    setMessages((prev) => [...prev, { role: 'user', content: msg }])
    setBusy(true)
    try {
      const d = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history }),
      }).then((r) => r.json())
      const reply = d?.ok ? d.data.reply : (d?.error || 'Sorry — please try that again in a moment.')
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Network hiccup — please try again.' }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* Floating launcher */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
        className={`fixed bottom-5 right-5 z-50 h-13 w-13 rounded-full shadow-lg shadow-emerald-900/20 flex items-center justify-center transition-all hover:scale-105 ${open ? 'bg-stone-700 hover:bg-stone-800' : 'bg-gradient-to-br from-emerald-600 to-teal-500 hover:from-emerald-700'}`}
        style={{ height: 52, width: 52 }}
      >
        {open ? <X className="h-5 w-5 text-white" /> : <Bot className="h-6 w-6 text-white" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-[calc(100vw-2.5rem)] max-w-sm rounded-2xl border border-emerald-100 bg-white shadow-2xl shadow-emerald-900/10 overflow-hidden flex flex-col" style={{ maxHeight: 'min(560px, calc(100vh - 7rem))' }}>
          <div className="bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-3 text-white flex items-center gap-2.5 shrink-0">
            <div className="h-8 w-8 rounded-full bg-white/15 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">SellerSetu AI assistant</p>
              <p className="text-[11px] opacity-80">Service guidance · documents · process</p>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-2.5 bg-stone-50/60">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${m.role === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-md'
                    : 'bg-white border border-stone-200 text-stone-800 rounded-bl-md'}`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="bg-white border border-stone-200 rounded-2xl rounded-bl-md px-3.5 py-2.5">
                  <Loader2 className="h-4 w-4 text-emerald-600 animate-spin" />
                </div>
              </div>
            )}
            {messages.length <= 1 && !busy && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-[11px] rounded-full border border-emerald-200 bg-white px-2.5 py-1.5 text-emerald-800 hover:bg-emerald-50 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); send() }}
            className="p-2.5 border-t bg-white flex items-center gap-2 shrink-0"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about services, documents, payments…"
              className="flex-1 h-10 rounded-xl border border-stone-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              maxLength={1200}
              aria-label="Message the AI assistant"
            />
            <Button type="submit" size="icon" disabled={busy || !input.trim()} className="h-10 w-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 shrink-0" aria-label="Send">
              <SendHorizontal className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  )
}
