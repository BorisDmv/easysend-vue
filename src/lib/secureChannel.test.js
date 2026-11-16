import { describe, expect, it } from 'vitest'
import { SecureChannel } from './secureChannel'
import { randomBytes } from './crypto'

const settle = () => new Promise((r) => setTimeout(r, 20))

function channel(initiator, selfId, peerId, roomSecret) {
  return new SecureChannel({ initiator, roomCode: '482-910', selfId, peerId, roomSecret })
}

// Wires two channels together; `onBinary` can intercept encrypted frames from a to b.
function link(a, b, onBinary = (d, deliver) => deliver(d)) {
  a.transport = { sendText: (d) => b.receive(d), sendBinary: (d) => onBinary(d, (x) => b.receive(x)) }
  b.transport = { sendText: (d) => a.receive(d), sendBinary: (d) => a.receive(d) }
}

function outcome(ch) {
  return new Promise((resolve, reject) => {
    ch.onReady = resolve
    ch.onError = reject
  })
}

async function handshake(a, b) {
  const results = Promise.all([outcome(a), outcome(b)])
  a.start()
  return results
}

describe('SecureChannel', () => {
  it('verifies automatically and exchanges encrypted data when both sides scanned the QR secret', async () => {
    const secret = randomBytes(16)
    const a = channel(true, 'a', 'b', secret)
    const b = channel(false, 'b', 'a', secret)
    link(a, b)
    const [ra, rb] = await handshake(a, b)

    expect(ra.verified).toBe(true)
    expect(rb.verified).toBe(true)
    expect(ra.sas).toHaveLength(4)
    expect(ra.sas).toEqual(rb.sas)

    const messages = []
    const chunks = []
    b.onMessage = (m) => messages.push(m)
    b.onChunk = (id, bytes) => chunks.push([Array.from(id), Array.from(bytes)])
    await a.sendJSON({ t: 'item', item: { type: 'text', content: 'héllo' } })
    await a.sendChunk(Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8), Uint8Array.of(9, 9, 9))
    await settle()

    expect(messages).toEqual([{ t: 'item', item: { type: 'text', content: 'héllo' } }])
    expect(chunks).toEqual([[[1, 2, 3, 4, 5, 6, 7, 8], [9, 9, 9]]])
  })

  it('falls back to an unverified safety code when only one side has the secret', async () => {
    const a = channel(true, 'a', 'b', randomBytes(16))
    const b = channel(false, 'b', 'a', null)
    link(a, b)
    const [ra, rb] = await handshake(a, b)

    expect(ra.verified).toBe(false)
    expect(rb.verified).toBe(false)
    expect(ra.sas).toEqual(rb.sas)
  })

  it('rejects an attacker who claims to know the QR secret but does not', async () => {
    const a = channel(true, 'a', 'b', randomBytes(16))
    const attacker = channel(false, 'b', 'a', randomBytes(16))
    link(a, attacker)
    const result = outcome(a)
    a.start()

    await expect(result).rejects.toThrow(/Key confirmation failed/)
  })

  it('gives each side a different safety code when a relay intercepts an unverified pairing', async () => {
    const a = channel(true, 'a', 'b', null)
    const toA = channel(false, 'b', 'a', null)
    const toB = channel(true, 'a', 'b', null)
    const b = channel(false, 'b', 'a', null)
    link(a, toA)
    link(toB, b)
    const ready = Promise.all([outcome(a), outcome(toA), outcome(toB), outcome(b)])
    a.start()
    toB.start()
    const [ra, , , rb] = await ready

    expect(ra.sas).not.toEqual(rb.sas)
  })

  it('fails on modified or replayed frames', async () => {
    for (const attack of ['tamper', 'replay']) {
      const secret = randomBytes(16)
      const a = channel(true, 'a', 'b', secret)
      const b = channel(false, 'b', 'a', secret)
      link(a, b, (frame, deliver) => {
        if (attack === 'tamper') {
          const bytes = new Uint8Array(frame.slice(0))
          bytes[0] ^= 1
          deliver(bytes.buffer)
        } else {
          deliver(frame)
          deliver(frame)
        }
      })
      await handshake(a, b)
      const error = new Promise((resolve) => (b.onError = resolve))
      const received = []
      b.onMessage = (m) => received.push(m)
      await a.sendJSON({ t: 'ping' })

      expect((await error).message).toMatch(/Decryption failed/)
      expect(received).toHaveLength(attack === 'replay' ? 1 : 0)
    }
  })
})
