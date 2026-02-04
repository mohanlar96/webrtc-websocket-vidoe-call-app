import http from 'http'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { WebSocketServer } from 'ws'

const PORT = process.env.PORT ? Number(process.env.PORT) : 9001
const MAX_PARTICIPANTS = 6

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distDir = path.resolve(__dirname, '..', 'dist')
const indexHtmlPath = path.join(distDir, 'index.html')

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

const sendText = (res, statusCode, text) => {
  res.writeHead(statusCode, { 'content-type': 'text/plain; charset=utf-8' })
  res.end(text)
}

const tryServeStatic = (req, res) => {
  // Serve production build if present. Otherwise fall back to plain text below.
  if (!fs.existsSync(indexHtmlPath)) return false

  const method = req.method || 'GET'
  if (method !== 'GET' && method !== 'HEAD') {
    sendText(res, 405, 'Method Not Allowed\n')
    return true
  }

  let pathname = '/'
  try {
    pathname = new URL(req.url || '/', 'http://local').pathname
  } catch {
    pathname = '/'
  }

  let filePath = path.join(distDir, pathname)

  // Prevent path traversal.
  if (!filePath.startsWith(distDir)) {
    sendText(res, 403, 'Forbidden\n')
    return true
  }

  // If it's a directory, try index.html in that dir (rare for Vite builds).
  try {
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null
    if (stat && stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html')
    }
  } catch {
    // ignore
  }

  // Serve file if it exists, otherwise serve SPA index.html.
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    filePath = indexHtmlPath
  }

  const ext = path.extname(filePath).toLowerCase()
  const contentType = mimeTypes[ext] || 'application/octet-stream'
  res.writeHead(200, { 'content-type': contentType })

  if (method === 'HEAD') {
    res.end()
    return true
  }

  fs.createReadStream(filePath).pipe(res)
  return true
}

const server = http.createServer((req, res) => {
  if (tryServeStatic(req, res)) return
  sendText(res, 200, 'WebRTC signaling server is running.\n')
})

const wss = new WebSocketServer({ server })

/** @type {Map<string, Set<any>>} */
const rooms = new Map()

const jsonSend = (ws, msg) => {
  try {
    ws.send(JSON.stringify(msg))
  } catch {
    // ignore
  }
}

const broadcast = (roomId, msg, exceptWs = null) => {
  const room = rooms.get(roomId)
  if (!room) return
  for (const client of room) {
    if (exceptWs && client === exceptWs) continue
    if (client.readyState === 1) {
      jsonSend(client, msg)
    }
  }
}

const findClientInRoom = (roomId, clientId) => {
  const room = rooms.get(roomId)
  if (!room) return null
  for (const client of room) {
    if (client.id === clientId) return client
  }
  return null
}

const leaveRoom = (ws) => {
  const roomId = ws.roomId
  if (!roomId) return
  const room = rooms.get(roomId)
  if (!room) return

  room.delete(ws)
  ws.roomId = null

  broadcast(roomId, { type: 'peer-left', id: ws.id })

  if (room.size === 0) {
    rooms.delete(roomId)
  }
}

wss.on('connection', (ws) => {
  ws.id = crypto.randomUUID()
  ws.roomId = null

  jsonSend(ws, { type: 'welcome', id: ws.id })

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (!msg || typeof msg.type !== 'string') return

    if (msg.type === 'join') {
      const roomId = typeof msg.roomId === 'string' ? msg.roomId.trim() : ''
      if (!roomId) return

      // If already in a room, leave it first.
      leaveRoom(ws)

      const room = rooms.get(roomId) || new Set()
      if (!rooms.has(roomId)) rooms.set(roomId, room)

      if (room.size >= MAX_PARTICIPANTS) {
        jsonSend(ws, { type: 'room-full', maxParticipants: MAX_PARTICIPANTS, size: room.size })
        return
      }

      ws.roomId = roomId
      room.add(ws)

      const peers = Array.from(room)
        .filter((c) => c !== ws)
        .map((c) => c.id)

      jsonSend(ws, {
        type: 'room-info',
        roomId,
        peers,
        maxParticipants: MAX_PARTICIPANTS
      })

      broadcast(roomId, { type: 'peer-joined', id: ws.id }, ws)
      return
    }

    if (msg.type === 'leave') {
      leaveRoom(ws)
      return
    }

    // Forward signaling messages (offer/answer/candidate)
    const roomId = ws.roomId
    if (!roomId) return

    if (msg.type === 'offer' || msg.type === 'answer' || msg.type === 'candidate') {
      const to = typeof msg.to === 'string' ? msg.to : ''
      if (!to) return
      const target = findClientInRoom(roomId, to)
      if (!target) return

      jsonSend(target, {
        type: msg.type,
        from: ws.id,
        sdp: msg.sdp,
        candidate: msg.candidate
      })
    }
  })

  ws.on('close', () => {
    leaveRoom(ws)
  })
})

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Signaling server listening on http://localhost:${PORT}`)
})

