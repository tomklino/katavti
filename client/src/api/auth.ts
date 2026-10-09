export type User = { email: string; name?: string; picture?: string }

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1beta/auth${url}`, {
    ...init,
    credentials: 'include',
    headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || `Authentication failed (${response.status})`)
  return body
}

export const authApi = {
  session: () => request<{ user: User | null }>('/session'),
  requestMagicLink: (email: string) => request<{ sent: true; developmentUrl?: string }>('/magic-link', { method: 'POST', body: JSON.stringify({ email }) }),
  verifyMagicLink: (token: string) => request<{ user: User }>('/magic-link/verify?token=' + encodeURIComponent(token)),
  google: (credential: string) => request<{ user: User }>('/google', { method: 'POST', body: JSON.stringify({ credential }) }),
  fakeLogin: (email: string) => request<{ user: User }>('/fake-login', { method: 'POST', body: JSON.stringify({ email }) }),
  logout: () => request<{ ok: true }>('/logout', { method: 'POST' }),
}
