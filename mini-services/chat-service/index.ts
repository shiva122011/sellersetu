import { createServer } from 'http'
import { Server, Socket } from 'socket.io'
import { jwtVerify } from 'jose'

// Real-time relay service for 1-to-1 request chat.
// REST API (Next.js) is the source of truth for persistence; this service
// only broadcasts events to participants inside a request room. If the
// socket is unavailable, clients fall back to polling the REST API.

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'sellersetu-dev-secret-change-in-production'
)

const httpServer = createServer()
const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

interface SessionUser {
  userId: string
  email: string
  role: string
}

// room -> set of userIds
const roomMembers = new Map<string, Set<string>>()
// socketId -> role (used to keep internal team notes off customer sockets)
const socketRoles = new Map<string, string>()

async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    if (!payload.userId) return null
    return { userId: payload.userId as string, email: payload.email as string, role: payload.role as string }
  } catch {
    return null
  }
}

io.on('connection', (socket: Socket) => {
  console.log(`connected: ${socket.id}`)
  let authed: SessionUser | null = null
  let joinedRooms: string[] = []

  socket.on('auth', async (data: { token: string }, ack?: (res: { ok: boolean; user?: SessionUser }) => void) => {
    authed = await verifyToken(String(data?.token || ''))
    if (authed) socketRoles.set(socket.id, authed.role)
    else socketRoles.delete(socket.id)
    if (ack) ack({ ok: !!authed, user: authed || undefined })
    if (!authed) socket.disconnect(true)
  })

  socket.on('join-request', (data: { requestId: string }, ack?: (res: { ok: boolean }) => void) => {
    if (!authed) {
      if (ack) ack({ ok: false })
      return
    }
    const room = `req:${data.requestId}`
    if (!joinedRooms.includes(room)) {
      socket.join(room)
      joinedRooms.push(room)
      if (!roomMembers.has(room)) roomMembers.set(room, new Set())
      roomMembers.get(room)!.add(authed.userId)
      socket.to(room).emit('presence', { userId: authed.userId, event: 'joined' })
    }
    if (ack) ack({ ok: true })
  })

  // Client relays a persisted message (saved via REST) to the other participant(s).
  // Internal team notes are only relayed to ADMIN/TEAM sockets — never to customers.
  socket.on(
    'chat-message',
    (data: { requestId: string; message: { isInternal?: boolean } | unknown }) => {
      if (!authed || !data?.requestId || !data?.message) return
      const room = `req:${data.requestId}`
      if (!joinedRooms.includes(room)) return
      const msg = data.message as { isInternal?: boolean }
      if (msg.isInternal === true) {
        for (const [sid] of io.sockets.sockets) {
          const role = socketRoles.get(sid)
          if (role === 'ADMIN' || role === 'TEAM') {
            io.sockets.sockets.get(sid)?.emit('chat-message', { requestId: data.requestId, message: data.message })
          }
        }
      } else {
        socket.to(room).emit('chat-message', { requestId: data.requestId, message: data.message })
      }
    }
  )

  socket.on('typing', (data: { requestId: string; userName: string }) => {
    if (!authed || !data?.requestId) return
    const room = `req:${data.requestId}`
    if (!joinedRooms.includes(room)) return
    socket.to(room).emit('typing', { requestId: data.requestId, userName: data.userName })
  })

  // Live dashboard refresh ping (e.g. after status change)
  socket.on('request-updated', (data: { requestId: string }) => {
    if (!authed || !data?.requestId) return
    const room = `req:${data.requestId}`
    if (!joinedRooms.includes(room)) return
    socket.to(room).emit('request-updated', { requestId: data.requestId })
  })

  socket.on('disconnect', () => {
    socketRoles.delete(socket.id)
    for (const room of joinedRooms) {
      const members = roomMembers.get(room)
      if (members) {
        members.delete(authed?.userId || socket.id)
        if (members.size === 0) roomMembers.delete(room)
      }
      socket.to(room).emit('presence', { userId: authed?.userId, event: 'left' })
    }
    console.log(`disconnected: ${socket.id}`)
  })

  socket.on('error', (err) => console.error(`socket error (${socket.id}):`, err))
})

const PORT = 3003
httpServer.listen(PORT, () => console.log(`Chat service running on port ${PORT}`))

process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  httpServer.close(() => process.exit(0))
})
