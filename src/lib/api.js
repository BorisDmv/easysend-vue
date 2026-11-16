async function request(path, options) {
  const res = await fetch(path, options)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body.error || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return body
}

export function createRoom() {
  return request('/api/rooms', { method: 'POST' })
}

/** Returns the room info, or null if the room does not exist (or expired). */
export async function getRoom(code) {
  try {
    return await request(`/api/rooms/${code.replace('-', '')}`)
  } catch (err) {
    if (err.status === 404) return null
    throw err
  }
}
