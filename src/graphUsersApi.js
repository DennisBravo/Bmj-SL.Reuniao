const GRAPH_USERS_API_URL = import.meta.env.VITE_GRAPH_USERS_API_URL || '/api/graph-users'

const MAX_Q = 80

/**
 * @param {string} q
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ displayName: string, email: string }[]>}
 */
export async function fetchGraphUsers(q, signal) {
  const t = String(q ?? '')
    .trim()
    .slice(0, MAX_Q)
  if (t.length < 2) return []
  const url = `${GRAPH_USERS_API_URL.replace(/\/+$/, '')}?${new URLSearchParams({ q: t })}`
  const res = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const err = await res.json()
      detail = err.detail || err.error || detail
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  const data = await res.json()
  if (!data || !Array.isArray(data.users)) return []
  return data.users
    .filter((u) => u && typeof u.email === 'string' && u.email.trim())
    .map((u) => ({
      displayName: String(u.displayName || u.email || '').trim() || u.email.trim(),
      email: String(u.email).trim(),
    }))
}
