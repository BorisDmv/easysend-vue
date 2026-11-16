/** WebSocket connection to the backend room relay. */
export class SignalingClient {
  constructor({ code, name, device, onMessage, onClose }) {
    this.code = code
    this.name = name
    this.device = device
    this.onMessage = onMessage
    this.onClose = onClose
    this.ws = null
    this.closedByUs = false
  }

  connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const query = new URLSearchParams({ name: this.name, device: this.device })
      const ws = new WebSocket(`${proto}://${location.host}/ws/rooms/${this.code.replace('-', '')}?${query}`)
      this.ws = ws
      let opened = false
      ws.onopen = () => {
        opened = true
        resolve()
      }
      ws.onmessage = (e) => {
        let msg
        try {
          msg = JSON.parse(e.data)
        } catch {
          return
        }
        this.onMessage(msg)
      }
      ws.onclose = () => {
        if (!opened) reject(new Error('Could not connect to the room'))
        if (!this.closedByUs) this.onClose()
      }
    })
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  close() {
    this.closedByUs = true
    this.ws?.close(1000)
  }
}
