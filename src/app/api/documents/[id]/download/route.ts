import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

const UPLOAD_DIR = path.join(process.cwd(), 'uploads')

// GET /api/documents/[id]/download — authenticated, access-controlled file download
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return new Response('Not authenticated', { status: 401 })
  const { id } = await ctx.params

  const doc = await db.document.findUnique({ where: { id }, include: { request: true } })
  if (!doc) return new Response('Not found', { status: 404 })

  // Access control: customer only sees own request files; staff see all
  if (user.role === 'CUSTOMER' && doc.request.customerId !== user.id) {
    return new Response('Access denied', { status: 403 })
  }

  try {
    const filePath = path.join(UPLOAD_DIR, path.basename(doc.fileName)) // basename prevents path traversal
    const data = await readFile(filePath)
    const safeName = doc.name.replace(/[^\w.\- ]/g, '_')
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': doc.mimeType,
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Content-Length': String(data.length),
      },
    })
  } catch {
    return new Response('File missing on server', { status: 404 })
  }
}
