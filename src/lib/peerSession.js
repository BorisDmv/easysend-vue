import { SecureChannel } from './secureChannel'

// 16 KB keeps every encrypted frame well under all browsers' data channel message limits.
export const CHUNK_BYTES = 16 * 1024
const HIGH_WATER = 1024 * 1024
const LOW_WATER = 256 * 1024
const CONNECT_TIMEOUT_MS = 20_000

/**
 * One direct WebRTC connection to another device in the room, with a
 * SecureChannel running over its data channel. Offer/answer/ICE go through
 * the signalling server; everything else goes peer-to-peer.
 */
export class PeerSession {
  constructor({ peer, initiator, selfId, roomCode, roomSecret, iceServers, signal, events }) {
    this.peer = peer
    this.initiator = initiator
    this.signal = signal
    this.events = events
    this.closed = false
    this.dc = null
    this.pendingIce = []

    this.channel = new SecureChannel({
      initiator,
      roomCode,
      selfId,
      peerId: peer.id,
      roomSecret,
      transport: {
        sendText: (s) => this.dc.send(s),
        sendBinary: (b) => this.dc.send(b),
      },
    })
    this.channel.onReady = (info) => {
      clearTimeout(this.timeout)
      events.onSecure(info)
    }
    this.channel.onMessage = (msg) => events.onMessage(msg)
    this.channel.onChunk = (id, bytes) => events.onChunk(id, bytes)
    this.channel.onError = (err) => this.#fail(err.message)

    this.pc = new RTCPeerConnection({ iceServers })
    this.pc.onicecandidate = (e) => {
      if (e.candidate) signal('ice', e.candidate.toJSON())
    }
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === 'failed') this.#fail('Direct connection failed')
    }
    if (initiator) this.#attach(this.pc.createDataChannel('magicbox', { ordered: true }))
    else this.pc.ondatachannel = (e) => this.#attach(e.channel)

    this.timeout = setTimeout(
      () => this.#fail('Could not connect directly — the networks may block peer-to-peer traffic'),
      CONNECT_TIMEOUT_MS,
    )
  }

  async start() {
    try {
      await this.pc.setLocalDescription(await this.pc.createOffer())
      this.signal('offer', this.pc.localDescription.toJSON())
    } catch (err) {
      this.#fail(`Could not start connection: ${err.message}`)
    }
  }

  async handleSignal(type, data) {
    if (this.closed) return
    try {
      if (type === 'offer' && !this.initiator) {
        await this.pc.setRemoteDescription(data)
        await this.#flushIce()
        await this.pc.setLocalDescription(await this.pc.createAnswer())
        this.signal('answer', this.pc.localDescription.toJSON())
      } else if (type === 'answer' && this.initiator) {
        await this.pc.setRemoteDescription(data)
        await this.#flushIce()
      } else if (type === 'ice') {
        if (this.pc.remoteDescription) await this.pc.addIceCandidate(data)
        else this.pendingIce.push(data)
      }
    } catch (err) {
      console.warn('[magicbox] signalling error', type, err)
    }
  }

  sendJSON(obj) {
    return this.channel.sendJSON(obj)
  }

  /** Streams a File in encrypted chunks, respecting data channel backpressure. */
  async sendFile(transferId, file, { onProgress, isCancelled }) {
    for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
      if (this.closed) throw new Error('Connection closed')
      if (isCancelled()) throw new Error('Cancelled')
      const bytes = new Uint8Array(await file.slice(offset, offset + CHUNK_BYTES).arrayBuffer())
      await this.channel.sendChunk(transferId, bytes)
      if (this.dc.bufferedAmount > HIGH_WATER) await this.#drain()
      onProgress(Math.min(offset + CHUNK_BYTES, file.size))
    }
  }

  close() {
    if (this.closed) return
    this.closed = true
    clearTimeout(this.timeout)
    this.channel.close()
    this.dc?.close()
    this.pc.close()
  }

  #attach(dc) {
    this.dc = dc
    dc.binaryType = 'arraybuffer'
    dc.bufferedAmountLowThreshold = LOW_WATER
    const onOpen = () => {
      this.events.onState('securing')
      this.channel.start()
    }
    // The answering side can receive a channel that is already open.
    if (dc.readyState === 'open') onOpen()
    else dc.onopen = onOpen
    dc.onmessage = (e) => this.channel.receive(e.data)
    dc.onclose = () => this.#fail('Connection closed')
  }

  #drain() {
    return new Promise((resolve) => {
      const done = () => {
        this.dc.removeEventListener('bufferedamountlow', done)
        this.dc.removeEventListener('close', done)
        resolve()
      }
      this.dc.addEventListener('bufferedamountlow', done)
      this.dc.addEventListener('close', done)
    })
  }

  async #flushIce() {
    for (const candidate of this.pendingIce.splice(0)) await this.pc.addIceCandidate(candidate)
  }

  #fail(reason) {
    if (this.closed) return
    this.close()
    this.events.onFailed(new Error(reason))
  }
}
