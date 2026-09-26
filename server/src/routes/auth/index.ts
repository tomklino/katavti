import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AuthService } from '../../services/auth-service.js'

const sessionCookie = 'katavti_session'

export function authRoutes(auth: AuthService, secureCookies: boolean) {
  const routes = new Hono()
  const setSession = (c: any, session: string) => setCookie(c, sessionCookie, session, {
    httpOnly: true, sameSite: 'Lax', secure: secureCookies, path: '/', maxAge: 60 * 60 * 24 * 30,
  })

  routes.get('/session', c => c.json({ user: auth.userForSession(getCookie(c, sessionCookie)) ?? null }))
  routes.post('/magic-link', async c => {
    try {
      const body = await c.req.json()
      return c.json({ sent: true, ...await auth.requestMagicLink(body.email) })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Unable to send magic link' }, 400) }
  })
  routes.get('/magic-link/verify', c => {
    try {
      const { session, user } = auth.consumeMagicLink(c.req.query('token') || '')
      setSession(c, session)
      return c.json({ user })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Unable to sign in' }, 401) }
  })
  routes.post('/google', async c => {
    try {
      const body = await c.req.json()
      const { session, user } = await auth.signInWithGoogle(body.credential)
      setSession(c, session)
      return c.json({ user })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Unable to sign in' }, 401) }
  })
  routes.post('/logout', c => {
    auth.signOut(getCookie(c, sessionCookie))
    deleteCookie(c, sessionCookie, { path: '/' })
    return c.json({ ok: true })
  })
  return routes
}

export function sessionUser(auth: AuthService, cookieHeader?: string) {
  const match = cookieHeader?.match(/(?:^|;\s*)katavti_session=([^;]+)/)
  return auth.userForSession(match?.[1])
}
