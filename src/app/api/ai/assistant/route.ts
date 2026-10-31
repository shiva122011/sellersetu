import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'
import ZAI from 'z-ai-web-dev-sdk'

// Simple in-memory rate limit: 20 requests per IP per rolling 5-minute window.
const RATE_WINDOW_MS = 5 * 60 * 1000
const RATE_MAX = 20
const hits = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS)
  list.push(now)
  hits.set(ip, list)
  if (hits.size > 500) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k)
    }
  }
  return list.length > RATE_MAX
}

interface ChatTurn { role: 'user' | 'assistant'; content: string }

// POST /api/ai/assistant — public, grounded Q&A about the universal service catalog,
// execution models, quotation flow and documents.
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  if (rateLimited(ip)) {
    return fail('Too many questions in a short time — please try again in a few minutes.', 429)
  }

  let message = ''
  let history: ChatTurn[] = []
  try {
    const body = await req.json()
    message = String(body.message || '').trim()
    history = Array.isArray(body.history)
      ? (body.history as ChatTurn[])
        .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
        .slice(-6)
      : []
  } catch {
    return fail('Invalid request body', 400)
  }
  if (!message) return fail('Please type a question first', 400)
  if (message.length > 1200) return fail('Question is too long — please shorten it', 400)

  try {
    const services = await db.service.findMany({
      where: { active: true },
      include: { category: { select: { name: true, code: true } } },
      orderBy: [{ status: 'asc' }, { displayOrder: 'asc' }],
    })

    const catalog = services.map((s) =>
      `- ${s.name} [${s.status === 'AVAILABLE' ? 'AVAILABLE' : 'COMING SOON'}] — category: ${s.category?.name || 'Custom'}; execution: ${s.executionType.replace(/_/g, ' ').toLowerCase()}; typical timeline: ${s.timeline || 'scoped per requirement'}`
    ).join('\n')

    const system = [
      'You are the SellerSetu AI assistant for a universal service marketplace in India. Customers can request almost any business service: software & websites, design, marketplace listings, account onboarding, AI & automation, compliance filings, consulting, research, logistics, manufacturing, printing, video/content, marketing — or anything custom.',
      '',
      'RULES:',
      '- Ground your answers in the live catalog below; never invent services or timelines not listed.',
      '- PRICING: there are NO fixed prices or packages. Every service is quoted individually after the team reviews the requirement. Never state, guess or imply any price. Explain: submit the requirement → team prepares a line-item quotation → customer can accept, negotiate or reject → work starts per agreed terms.',
      '- Execution models: In-house (our team), Third-party managed (vetted vendor under our management), Direct vendor connection (we introduce a vetted provider for a connection fee; the customer contracts with them directly). Mention the relevant model when useful.',
      '- Services marked COMING SOON cannot be requested yet — say so and suggest the closest AVAILABLE service.',
      '- Never promise approvals, rankings or sales. Authorities/platforms make final decisions.',
      '- Never ask for or accept passwords, OTPs or card details in this chat. Sensitive access goes through the secure vault after registration.',
      '- Flow: pick a service (or choose custom) → register free → submit the guided request form (unique Request ID) → team may ask questions in chat → quotation arrives in the dashboard → accept/negotiate → track milestones, documents, payments and delivery in the project workspace.',
      '- Be concise and helpful (under 130 words unless listing). Use simple language.',
      '',
      'LIVE CATALOG:',
      catalog,
    ].join('\n')

    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: system },
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: message },
      ],
      temperature: 0.4,
      max_tokens: 450,
    })

    const reply = completion.choices[0]?.message?.content?.trim()
    if (!reply) return fail('The assistant could not answer right now — please try again.', 502)
    return ok({ reply })
  } catch (e) {
    console.error('ai assistant failed', e)
    return fail('The assistant is unavailable right now. Please try again shortly.', 502)
  }
}
