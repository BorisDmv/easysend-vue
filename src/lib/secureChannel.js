import { b64urlDecode, b64urlEncode, concatBytes, equalBytes, sha256 } from './crypto'

/*
 * End-to-end encrypted channel between two devices, layered on any ordered,
 * reliable transport (a WebRTC data channel in the app).
 *
 * Handshake (JSON text frames), initiator I and responder R:
 *   I -> R  commit   SHA-256(pubI)               I is bound to its key before seeing pubR
 *   R -> I  pub      pubR
 *   I -> R  reveal   pubI                        R checks it matches the commitment
 *   R -> I  confirm  HMAC(kConfirm, "responder")
 *   I -> R  confirm  HMAC(kConfirm, "initiator")
 *
 * Keys come from HKDF-SHA256 over the ECDH (P-256) shared secret. The HKDF info
 * is a hash of the transcript (room, peer ids, both public keys). When both
 * sides know the QR room secret it is used as the HKDF salt, so an attacker
 * without it (including the signalling server) cannot complete the handshake:
 * those peers are "verified". Otherwise the 4-emoji safety code, which an
 * attacker cannot steer thanks to the commitment, lets users compare by eye.
 *
 * After the handshake every frame is AES-256-GCM encrypted with a per-direction
 * key and a counter nonce. The receiver uses its own counter, so a dropped,
 * replayed, reordered or modified frame fails to decrypt and kills the channel.
 */

const PROTOCOL = 1
const KIND_JSON = 1
const KIND_CHUNK = 2
export const TRANSFER_ID_BYTES = 8

const enc = new TextEncoder()
const dec = new TextDecoder()

export const SAS_EMOJI = [
  '🐶', '🐱', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🦆', '🦉',
  '🐺', '🐴', '🦄', '🐝', '🦋', '🐌', '🐞', '🐢', '🐍', '🐙', '🦀', '🐠', '🐬', '🐳', '🦈', '🌵',
  '🌲', '🌴', '🍀', '🍁', '🍄', '🌻', '🌙', '⭐', '🔥', '🌈', '☀️', '❄️', '⚡', '🍎', '🍋', '🍉',
  '🍇', '🍓', '🍒', '🥑', '🌽', '🥕', '🍞', '🧀', '🍕', '🎂', '🍩', '⚽', '🎸', '🚀', '🔑', '🎈',
]

function sasFromBytes(b) {
  const n = (b[0] << 16) | (b[1] << 8) | b[2]
  return [18, 12, 6, 0].map((shift) => SAS_EMOJI[(n >> shift) & 63])
}

function nonce(counter) {
  const iv = new Uint8Array(12)
  new DataView(iv.buffer).setBigUint64(4, counter)
  return iv
}

export class SecureChannel {
  #keyPair = null
  #pub = null
  #peerPub = null
  #peerCommit = null
  #peerHasSecret = false
  #keys = null
  #sentConfirm = false
  #sendCounter = 0n
  #recvCounter = 0n
  #sendChain = Promise.resolve()
  #recvChain = Promise.resolve()

  /**
   * @param {object} opts
   * @param {boolean} opts.initiator
   * @param {string} opts.roomCode
   * @param {string} opts.selfId
   * @param {string} opts.peerId
   * @param {Uint8Array|null} opts.roomSecret  secret from the QR code, if this device has it
   * @param {{sendText(s: string): void, sendBinary(b: ArrayBuffer): void}} opts.transport
   */
  constructor({ initiator, roomCode, selfId, peerId, roomSecret = null, transport }) {
    this.initiator = initiator
    this.roomCode = roomCode
    this.selfId = selfId
    this.peerId = peerId
    this.roomSecret = roomSecret
    this.transport = transport
    this.state = 'new' // handshake | ready | failed | closed
    this.verified = false
    this.sas = []
    this.onReady = () => {}
    this.onMessage = () => {}
    this.onChunk = () => {}
    this.onError = () => {}
  }

  async start() {
    if (!this.initiator) return
    try {
      await this.#ensureKeys()
      this.state = 'handshake'
      this.#sendHandshake({ kx: 'commit', commit: b64urlEncode(await sha256(this.#pub)), secret: !!this.roomSecret })
    } catch (err) {
      this.#fail(err)
    }
  }

  /** Feed a frame from the transport: strings are handshake, binary is encrypted. */
  receive(data) {
    this.#recvChain = this.#recvChain
      .then(() => (this.state === 'failed' || this.state === 'closed' ? undefined : this.#handle(data)))
      .catch((err) => this.#fail(err))
    return this.#recvChain
  }

  sendJSON(obj) {
    return this.#sendFrame(Uint8Array.of(KIND_JSON), enc.encode(JSON.stringify(obj)))
  }

  sendChunk(transferId, bytes) {
    if (transferId.length !== TRANSFER_ID_BYTES) throw new Error('Invalid transfer id')
    return this.#sendFrame(concatBytes(Uint8Array.of(KIND_CHUNK), transferId), bytes)
  }

  close() {
    this.state = 'closed'
  }

  async #handle(data) {
    if (typeof data === 'string') return this.#handleHandshake(JSON.parse(data))
    if (this.state !== 'ready') throw new Error('Encrypted frame before handshake completed')

    let plain
    try {
      const iv = nonce(this.#recvCounter++)
      plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, this.#keys.recv, data))
    } catch {
      throw new Error('Decryption failed — data was modified, replayed or reordered')
    }
    if (plain[0] === KIND_JSON) this.onMessage(JSON.parse(dec.decode(plain.subarray(1))))
    else if (plain[0] === KIND_CHUNK) this.onChunk(plain.subarray(1, 1 + TRANSFER_ID_BYTES), plain.subarray(1 + TRANSFER_ID_BYTES))
    else throw new Error('Unknown frame type')
  }

  async #handleHandshake(msg) {
    if (msg?.v !== PROTOCOL) throw new Error('Unsupported protocol version')
    const unexpected = () => new Error(`Unexpected handshake message "${msg.kx}"`)

    switch (msg.kx) {
      case 'commit': {
        if (this.initiator || this.#peerCommit) throw unexpected()
        this.#peerCommit = b64urlDecode(msg.commit)
        this.#peerHasSecret = msg.secret === true
        await this.#ensureKeys()
        this.state = 'handshake'
        this.#sendHandshake({ kx: 'pub', pub: b64urlEncode(this.#pub), secret: !!this.roomSecret })
        return
      }
      case 'pub': {
        if (!this.initiator || this.#peerPub) throw unexpected()
        this.#peerPub = b64urlDecode(msg.pub)
        this.#peerHasSecret = msg.secret === true
        this.#sendHandshake({ kx: 'reveal', pub: b64urlEncode(this.#pub) })
        await this.#deriveKeys()
        return
      }
      case 'reveal': {
        if (this.initiator || !this.#peerCommit || this.#peerPub) throw unexpected()
        const pub = b64urlDecode(msg.pub)
        if (!equalBytes(await sha256(pub), this.#peerCommit)) throw new Error('Public key does not match its commitment')
        this.#peerPub = pub
        await this.#deriveKeys()
        this.#sendHandshake({ kx: 'confirm', mac: b64urlEncode(await this.#mac('responder')) })
        this.#sentConfirm = true
        return
      }
      case 'confirm': {
        if (!this.#keys || this.state === 'ready' || (!this.initiator && !this.#sentConfirm)) throw unexpected()
        const expected = this.initiator ? 'responder' : 'initiator'
        const ok = await crypto.subtle.verify('HMAC', this.#keys.confirm, b64urlDecode(msg.mac), enc.encode(expected))
        if (!ok) throw new Error('Key confirmation failed — the devices did not agree on a key')
        if (this.initiator) this.#sendHandshake({ kx: 'confirm', mac: b64urlEncode(await this.#mac('initiator')) })
        this.state = 'ready'
        this.onReady({ verified: this.verified, sas: this.sas })
        return
      }
      default:
        throw unexpected()
    }
  }

  async #ensureKeys() {
    if (this.#keyPair) return
    this.#keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
    this.#pub = new Uint8Array(await crypto.subtle.exportKey('raw', this.#keyPair.publicKey))
  }

  async #deriveKeys() {
    const peerKey = await crypto.subtle.importKey('raw', this.#peerPub, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
    const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: peerKey }, this.#keyPair.privateKey, 256)

    const useSecret = !!this.roomSecret && this.#peerHasSecret
    const [pubI, pubR] = this.initiator ? [this.#pub, this.#peerPub] : [this.#peerPub, this.#pub]
    const [idI, idR] = this.initiator ? [this.selfId, this.peerId] : [this.peerId, this.selfId]
    const transcript = await sha256(
      enc.encode(['magicbox-v1', this.roomCode, idI, idR, b64urlEncode(pubI), b64urlEncode(pubR), useSecret ? 'qr' : 'sas'].join('|')),
    )

    const ikm = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey', 'deriveBits'])
    const params = (label) => ({
      name: 'HKDF',
      hash: 'SHA-256',
      salt: useSecret ? this.roomSecret : new Uint8Array(32),
      info: concatBytes(transcript, enc.encode(label)),
    })
    const aesKey = (label, usage) => crypto.subtle.deriveKey(params(label), ikm, { name: 'AES-GCM', length: 256 }, false, [usage])
    const [sendLabel, recvLabel] = this.initiator ? ['i2r', 'r2i'] : ['r2i', 'i2r']

    this.#keys = {
      send: await aesKey(sendLabel, 'encrypt'),
      recv: await aesKey(recvLabel, 'decrypt'),
      confirm: await crypto.subtle.deriveKey(params('confirm'), ikm, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify']),
    }
    this.sas = sasFromBytes(new Uint8Array(await crypto.subtle.deriveBits(params('sas'), ikm, 32)))
    this.verified = useSecret
  }

  async #mac(label) {
    return new Uint8Array(await crypto.subtle.sign('HMAC', this.#keys.confirm, enc.encode(label)))
  }

  #sendHandshake(msg) {
    this.transport.sendText(JSON.stringify({ v: PROTOCOL, ...msg }))
  }

  #sendFrame(header, body) {
    const run = async () => {
      if (this.state !== 'ready') throw new Error('Secure channel is not ready')
      const iv = nonce(this.#sendCounter++)
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.#keys.send, concatBytes(header, body))
      this.transport.sendBinary(ciphertext)
    }
    const result = this.#sendChain.then(run)
    this.#sendChain = result.catch(() => {})
    return result
  }

  #fail(err) {
    if (this.state === 'failed' || this.state === 'closed') return
    this.state = 'failed'
    this.onError(err instanceof Error ? err : new Error(String(err)))
  }
}
