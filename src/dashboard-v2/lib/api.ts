const TOKEN_KEY = 'gc_token'
const TIMEOUT_MS = 30_000

function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? ''
}

function buildUrl(path: string): string {
  const token = getToken()
  const sep = path.includes('?') ? '&' : '?'
  return token ? `${path}${sep}token=${token}` : path
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(buildUrl(path), { ...init, signal: controller.signal })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return res.json() as Promise<T>
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

/** Called once at app boot. Reads ?token= from URL, saves to localStorage, strips from URL. */
export function bootstrapAuth(): void {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
    params.delete('token')
    const newSearch = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${newSearch ? '?' + newSearch : ''}`)
  }
}
