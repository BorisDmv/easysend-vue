import { computed, reactive, ref } from 'vue'
import { createRoom as apiCreateRoom, getRoom } from '../lib/api'
import { b64urlDecode, b64urlEncode, fromHex, randomBytes, toHex } from '../lib/crypto'
import { PeerSession } from '../lib/peerSession'
import { SignalingClient } from '../lib/signaling'
import { describeUrl, isUrl, uid } from '../utils/format'
import { useToast } from './useToast'

const MAX_FILE_BYTES = 512 * 1024 * 1024
// Text items travel as a single encrypted message; keep them under data channel limits.
const MAX_TEXT_CHARS = 16_000
const ROOM_STORAGE_KEY = 'magicbox:room'
const ICE_SERVERS = parseIceServers(import.meta.env.VITE_ICE_SERVERS)

const ADJECTIVES = ['Blue', 'Amber', 'Lunar', 'Neon', 'Velvet', 'Arctic', 'Crimson', 'Quiet', 'Cobalt', 'Solar']
const ANIMALS = ['Fox', 'Otter', 'Heron', 'Wolf', 'Orca', 'Raven', 'Panda', 'Koi', 'Moth', 'Stag']

function parseIceServers(raw) {
  if (!raw) return [{ urls: 'stun:stun.l.google.com:19302' }]
  try {
    return JSON.parse(raw)
  } catch {
    console.warn('[magicbox] VITE_ICE_SERVERS is not valid JSON; using no ICE servers')
    return []
  }
}

function detectPlatform() {
  const ua = navigator.userAgent
  const isIpad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  const os = isIpad
    ? 'iPadOS'
    : /iPhone/.test(ua)
      ? 'iOS'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Unknown OS'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser'
  return { os, browser }
}

function ephemeralName() {
  const key = 'magicbox:identity'
  const saved = sessionStorage.getItem(key)
  if (saved) return saved
  const pick = (list) => list[Math.floor(Math.random() * list.length)]
  const name = `${pick(ADJECTIVES)} ${pick(ANIMALS)}`
  sessionStorage.setItem(key, name)
  return name
}

function normalizeCode(raw) {
  const digits = String(raw ?? '').replace(/[\s-]/g, '')
  return /^\d{6}$/.test(digits) ? `${digits.slice(0, 3)}-${digits.slice(3)}` : null
}

function kindOf(deviceLabel = '') {
  if (/iPadOS/.test(deviceLabel)) return 'tablet'
  if (/Android|iOS/.test(deviceLabel)) return 'phone'
  return 'laptop'
}

function parseJoinHash(hash) {
  const m = /^#join=(\d{6})(?:\.([A-Za-z0-9_-]{16,64}))?$/.exec(hash)
  if (!m) return null
  try {
    return { code: normalizeCode(m[1]), secret: m[2] ? b64urlDecode(m[2]) : null }
  } catch {
    return null
  }
}

function loadSavedRoom() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ROOM_STORAGE_KEY))
    const code = normalizeCode(saved?.code)
    return code ? { code, secret: saved.secret ? b64urlDecode(saved.secret) : null } : null
  } catch {
    return null
  }
}

// Module-level singleton state so every component shares one box.
const { notify } = useToast()
const { os, browser } = detectPlatform()
const device = reactive({ name: ephemeralName(), os, browser })
const room = reactive({ code: '', secret: null, selfId: '', status: 'idle', error: '' })
const peers = ref([])
const items = ref([])
const incomingPulse = ref(false)
const now = ref(Date.now())

const sessions = new Map()
const incoming = new Map() // `${peerId}:${transferId}` -> in-progress download
let signaling = null
let generation = 0
let reconnectTimer = null
let reconnectAttempt = 0
let pulseTimer = null
let initialized = false

setInterval(() => (now.value = Date.now()), 15_000)

const securePeers = computed(() => peers.value.filter((p) => p.state === 'secure'))

const shareUrl = computed(() => {
  if (!room.code) return ''
  const secret = room.secret ? `.${b64urlEncode(room.secret)}` : ''
  return `${location.origin}${location.pathname}#join=${room.code.replace('-', '')}${secret}`
})

const status = computed(() => {
  const secure = securePeers.value
  if (room.status === 'error') return { tone: 'rose', label: 'Offline', detail: 'Server unreachable', short: 'Offline' }
  if (room.status !== 'online') {
    const label = room.status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'
    return { tone: 'amber', label, detail: room.code ? `Room ${room.code}` : '', short: label }
  }
  if (!secure.length) {
    const pending = peers.value.some((p) => p.state === 'connecting' || p.state === 'securing')
    return pending
      ? { tone: 'amber', label: 'Securing connection…', detail: `Room ${room.code}`, short: 'Securing…' }
      : { tone: 'zinc', label: 'Waiting for devices', detail: `Room ${room.code}`, short: `Room ${room.code}` }
  }
  const extra = secure.length > 1 ? ` + ${secure.length - 1}` : ''
  return {
    tone: 'emerald',
    label: 'E2E Encrypted',
    detail: `${secure.length + 1} Devices Connected`,
    short: `Connected to ${secure[0].name}${extra}`,
  }
})

// ---------- room lifecycle ----------

async function init() {
  if (initialized) return
  initialized = true
  const fromHash = parseJoinHash(location.hash)
  if (location.hash.startsWith('#join=')) history.replaceState(null, '', location.pathname + location.search)
  const target = fromHash ?? loadSavedRoom()
  if (target && (await joinRoom(target.code, target.secret, { quiet: !fromHash }))) return
  await createRoom()
}

async function createRoom() {
  teardown()
  room.status = 'creating'
  room.error = ''
  try {
    const info = await apiCreateRoom()
    await connect(info.code, randomBytes(16))
    return true
  } catch {
    room.status = 'error'
    room.error = "Can't reach the Magic Box server. Is the backend running?"
    return false
  }
}

async function joinRoom(rawCode, secret = null, { quiet = false } = {}) {
  const code = normalizeCode(rawCode)
  if (!code) {
    notify('Room codes have 6 digits', 'rose')
    return false
  }
  if (code === room.code && room.status === 'online' && !secret) {
    notify('You are already in this room', 'zinc')
    return true
  }
  try {
    if (!(await getRoom(code))) {
      if (!quiet) notify(`Room ${code} doesn't exist or has expired`, 'rose')
      return false
    }
  } catch {
    room.status = 'error'
    room.error = "Can't reach the Magic Box server. Is the backend running?"
    return false
  }
  await connect(code, secret)
  return true
}

async function connect(code, secret) {
  teardown()
  const gen = ++generation
  Object.assign(room, {
    code,
    secret,
    selfId: '',
    error: '',
    status: room.status === 'reconnecting' ? 'reconnecting' : 'connecting',
  })
  sessionStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify({ code, secret: secret ? b64urlEncode(secret) : null }))

  signaling = new SignalingClient({
    code,
    name: device.name,
    device: `${device.os} · ${device.browser}`,
    onMessage: (msg) => gen === generation && onSignal(msg),
    onClose: () => gen === generation && handleDisconnect(),
  })
  try {
    await signaling.connect()
  } catch {
    // onClose schedules the reconnect.
  }
}

function teardown() {
  clearTimeout(reconnectTimer)
  signaling?.close()
  signaling = null
  closeAllPeers()
}

function handleDisconnect() {
  signaling = null
  closeAllPeers()
  room.status = 'reconnecting'
  room.selfId = ''
  const delay = Math.min(1000 * 2 ** reconnectAttempt++, 15_000)
  clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(async () => {
    const { code, secret } = room
    try {
      if (await getRoom(code)) return connect(code, secret)
    } catch {
      return handleDisconnect()
    }
    notify('The room expired — started a new one', 'zinc')
    createRoom()
  }, delay)
}

function onSignal(msg) {
  switch (msg.type) {
    case 'welcome':
      room.selfId = msg.data.peerId
      room.status = 'online'
      reconnectAttempt = 0
      for (const p of msg.data.peers ?? []) addPeer(p, true)
      break
    case 'peer-joined':
      addPeer(msg.data, false)
      break
    case 'peer-left':
      removePeer(msg.data?.peerId)
      break
    case 'offer':
    case 'answer':
    case 'ice':
      sessions.get(msg.from)?.handleSignal(msg.type, msg.data)
      break
    case 'error':
      console.warn('[magicbox] server error:', msg.data?.message)
      break
  }
}

// ---------- peers ----------

function patchPeer(id, patch) {
  const peer = peers.value.find((p) => p.id === id)
  if (peer) Object.assign(peer, patch)
}

function addPeer(info, initiator) {
  if (!info?.id || sessions.has(info.id)) return
  peers.value.push({
    id: info.id,
    name: info.name,
    device: info.device,
    kind: kindOf(info.device),
    state: 'connecting',
    verified: false,
    sas: [],
    error: '',
  })

  const session = new PeerSession({
    peer: info,
    initiator,
    selfId: room.selfId,
    roomCode: room.code,
    roomSecret: room.secret,
    iceServers: ICE_SERVERS,
    signal: (type, data) => signaling?.send({ type, to: info.id, data }),
    events: {
      onState: (state) => patchPeer(info.id, { state }),
      onSecure: ({ verified, sas }) => {
        patchPeer(info.id, { state: 'secure', verified, sas, error: '' })
        notify(`${verified ? 'Verified' : 'Encrypted'} connection with ${info.name}`, 'emerald')
      },
      onFailed: (err) => {
        patchPeer(info.id, { state: 'failed', error: err.message })
        failTransfersFrom(info.id)
      },
      onMessage: (msg) => handlePeerMessage(info.id, msg),
      onChunk: (id, bytes) => handleChunk(info.id, id, bytes),
    },
  })
  sessions.set(info.id, session)
  if (initiator) session.start()
}

function removePeer(id) {
  const peer = peers.value.find((p) => p.id === id)
  sessions.get(id)?.close()
  sessions.delete(id)
  failTransfersFrom(id)
  peers.value = peers.value.filter((p) => p.id !== id)
  if (peer) notify(`${peer.name} left the room`, 'zinc')
}

function closeAllPeers() {
  for (const [id, session] of sessions) {
    session.close()
    failTransfersFrom(id)
  }
  sessions.clear()
  peers.value = []
}

function secureSessions() {
  return securePeers.value.map((p) => sessions.get(p.id)).filter(Boolean)
}

// ---------- receiving ----------

function senderOf(peer) {
  return { name: peer.name, device: peer.device, tone: 'cyan' }
}

function findItem(id) {
  return items.value.find((i) => i.id === id)
}

function pulse() {
  incomingPulse.value = false
  clearTimeout(pulseTimer)
  requestAnimationFrame(() => {
    incomingPulse.value = true
    pulseTimer = setTimeout(() => (incomingPulse.value = false), 1400)
  })
}

function receiveItem(item) {
  items.value.unshift({ id: uid(), createdAt: Date.now(), incoming: true, ...item })
  pulse()
}

// Peers are authenticated, but their payloads are still treated as untrusted input.
function sanitizeItem(raw) {
  if (raw?.type === 'text' && typeof raw.content === 'string' && raw.content.trim()) {
    return { type: 'text', content: raw.content.slice(0, MAX_TEXT_CHARS) }
  }
  if (raw?.type === 'link' && typeof raw.url === 'string' && isUrl(raw.url)) {
    const url = raw.url.trim()
    return { type: 'link', url, ...describeUrl(url) }
  }
  return null
}

function handlePeerMessage(peerId, msg) {
  const peer = peers.value.find((p) => p.id === peerId)
  if (!peer || !msg || typeof msg !== 'object') return
  switch (msg.t) {
    case 'item': {
      const item = sanitizeItem(msg.item)
      if (!item) return
      receiveItem({ ...item, sender: senderOf(peer) })
      notify(`New ${item.type === 'link' ? 'link' : 'snippet'} from ${peer.name}`, 'cyan')
      break
    }
    case 'file-start':
      startIncoming(peer, msg)
      break
    case 'file-end':
      finishIncoming(peerId, msg.id)
      break
    case 'file-abort':
      abortIncoming(`${peerId}:${msg.id}`, `${peer.name} cancelled the transfer`)
      break
  }
}

function startIncoming(peer, msg) {
  const { id, name, size, mime, kind } = msg
  if (typeof id !== 'string' || !/^[0-9a-f]{16}$/.test(id)) return
  if (typeof name !== 'string' || !Number.isSafeInteger(size) || size < 0 || size > MAX_FILE_BYTES) return
  const key = `${peer.id}:${id}`
  if (incoming.has(key)) return

  const safeMime = typeof mime === 'string' && mime.length < 100 ? mime : 'application/octet-stream'
  const itemId = uid()
  receiveItem({
    id: itemId,
    type: kind === 'image' && safeMime.startsWith('image/') ? 'image' : 'file',
    name: name.slice(0, 200) || 'untitled',
    size,
    mime: safeMime,
    status: 'receiving',
    progress: 0,
    sender: senderOf(peer),
  })
  incoming.set(key, { itemId, chunks: [], received: 0, size, mime: safeMime })
}

function handleChunk(peerId, idBytes, bytes) {
  const key = `${peerId}:${toHex(idBytes)}`
  const transfer = incoming.get(key)
  if (!transfer) return
  transfer.received += bytes.byteLength
  if (transfer.received > transfer.size) return abortIncoming(key, 'Received more data than announced')
  transfer.chunks.push(bytes)
  const item = findItem(transfer.itemId)
  if (item) item.progress = transfer.size ? transfer.received / transfer.size : 1
}

function finishIncoming(peerId, id) {
  const key = `${peerId}:${id}`
  const transfer = incoming.get(key)
  if (!transfer) return
  incoming.delete(key)
  if (transfer.received !== transfer.size) return markFailed(transfer.itemId, 'Transfer incomplete')
  const item = findItem(transfer.itemId)
  if (!item) return
  const url = URL.createObjectURL(new Blob(transfer.chunks, { type: transfer.mime }))
  Object.assign(item, item.type === 'image' ? { src: url, local: true } : { url }, { status: 'done', progress: 1 })
  notify(`Received ${item.name}`, 'emerald')
  pulse()
}

function abortIncoming(key, reason) {
  const transfer = incoming.get(key)
  if (!transfer) return
  incoming.delete(key)
  markFailed(transfer.itemId, reason)
}

function failTransfersFrom(peerId) {
  for (const key of [...incoming.keys()]) {
    if (key.startsWith(`${peerId}:`)) abortIncoming(key, 'Connection lost')
  }
}

function markFailed(itemId, reason) {
  const item = findItem(itemId)
  if (item) Object.assign(item, { status: 'failed', error: reason })
}

// ---------- sending ----------

function selfSender() {
  return { name: 'You', device: `${device.os} ${device.browser}`, tone: 'violet' }
}

function pushLocal(item) {
  items.value.unshift({ id: uid(), createdAt: Date.now(), sender: selfSender(), ...item })
  return items.value[0]
}

function describeTargets(targets) {
  return targets.length === 1 ? targets[0].peer.name : `${targets.length} devices`
}

function addText(raw) {
  const text = raw.replace(/\s+$/, '')
  if (!text.trim()) return false
  const targets = secureSessions()

  let payload
  if (isUrl(text)) {
    const url = text.trim()
    payload = { type: 'link', url }
    pushLocal({ type: 'link', url, ...describeUrl(url) })
  } else {
    payload = { type: 'text', content: text }
    pushLocal({ type: 'text', content: text })
  }

  if (!targets.length) {
    notify('Added to your box — no devices connected yet', 'zinc')
  } else if (payload.type === 'text' && text.length > MAX_TEXT_CHARS) {
    notify(`Too long to beam (max ${MAX_TEXT_CHARS.toLocaleString()} characters) — kept on this device`, 'rose', 3200)
  } else {
    for (const s of targets) {
      s.sendJSON({ t: 'item', item: payload }).catch(() => notify(`Couldn't send to ${s.peer.name}`, 'rose'))
    }
    notify(`Beamed to ${describeTargets(targets)}`, payload.type === 'link' ? 'cyan' : 'violet')
  }
  return true
}

function addFiles(fileList) {
  const files = Array.from(fileList || [])
  if (!files.length) return
  const targets = secureSessions()
  for (const file of files) {
    const url = URL.createObjectURL(file)
    const base = { name: file.name || 'untitled', size: file.size, mime: file.type || 'application/octet-stream' }
    const item = pushLocal(
      file.type.startsWith('image/') ? { type: 'image', ...base, src: url, local: true } : { type: 'file', ...base, url },
    )
    if (!targets.length) continue
    if (file.size > MAX_FILE_BYTES) {
      notify(`${base.name} is over 512 MB — kept on this device`, 'rose', 3200)
      continue
    }
    sendFile(item, file, targets)
  }
  if (!targets.length) {
    notify(`${files.length} item${files.length > 1 ? 's' : ''} added — no devices connected yet`, 'zinc')
  }
}

async function sendFile(item, file, targets) {
  Object.assign(item, { status: 'sending', progress: 0 })
  const id = toHex(randomBytes(8))
  const sent = new Map()
  const total = file.size * targets.length || 1
  const update = () => (item.progress = [...sent.values()].reduce((a, b) => a + b, 0) / total)

  const results = await Promise.allSettled(
    targets.map(async (s) => {
      try {
        await s.sendJSON({ t: 'file-start', id, name: item.name, size: file.size, mime: item.mime, kind: item.type })
        await s.sendFile(fromHex(id), file, {
          onProgress: (bytes) => {
            sent.set(s, bytes)
            update()
          },
          isCancelled: () => item.cancelled,
        })
        await s.sendJSON({ t: 'file-end', id })
      } catch (err) {
        s.sendJSON({ t: 'file-abort', id }).catch(() => {})
        throw err
      }
    }),
  )
  if (item.cancelled) return

  const failed = results.filter((r) => r.status === 'rejected').length
  Object.assign(item, { status: failed === targets.length ? 'failed' : 'done', progress: 1 })
  if (failed) {
    item.error = `Failed for ${failed} of ${targets.length} device${targets.length > 1 ? 's' : ''}`
    notify(`${item.name}: ${item.error.toLowerCase()}`, 'rose')
  } else {
    notify(`Sent ${item.name} to ${describeTargets(targets)}`, 'emerald')
  }
}

// ---------- local box management ----------

function discard(item) {
  item.cancelled = true
  if (item.local && item.src?.startsWith('blob:')) URL.revokeObjectURL(item.src)
  if (item.url?.startsWith('blob:')) URL.revokeObjectURL(item.url)
  for (const [key, transfer] of incoming) {
    if (transfer.itemId === item.id) incoming.delete(key)
  }
}

function removeItem(id) {
  const item = findItem(id)
  if (item) discard(item)
  items.value = items.value.filter((i) => i.id !== id)
}

function clearBox() {
  if (!items.value.length) return notify('The box is already empty', 'zinc')
  items.value.forEach(discard)
  items.value = []
  notify('Box cleared on this device', 'zinc')
}

export function useMagicBox() {
  return {
    device,
    room,
    peers,
    items,
    now,
    incomingPulse,
    securePeers,
    shareUrl,
    status,
    init,
    createRoom,
    joinRoom,
    addText,
    addFiles,
    removeItem,
    clearBox,
  }
}
