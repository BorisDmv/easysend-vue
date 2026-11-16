export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** i
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}

export function timeAgo(timestamp, now = Date.now()) {
  const s = Math.max(0, Math.round((now - timestamp) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(timestamp).toLocaleDateString()
}

export function isUrl(text) {
  return /^https?:\/\/\S+$/i.test(text.trim())
}

export function fileExtension(name = '') {
  const idx = name.lastIndexOf('.')
  return idx > 0 ? name.slice(idx + 1).toUpperCase().slice(0, 4) : 'FILE'
}

export function describeUrl(raw) {
  try {
    const url = new URL(raw.trim())
    const host = url.hostname.replace(/^www\./, '')
    const path = url.pathname.split('/').filter(Boolean).slice(0, 2).join(' / ')
    return { host, title: path ? `${host} · ${decodeURIComponent(path)}` : host }
  } catch {
    return { host: raw, title: raw }
  }
}
