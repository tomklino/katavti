import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AuthService } from '../../services/auth-service.js'

const sessionCookie = 'katavti_session'

export function authRoutes(auth: AuthService, environmentType: 'dev' | 'prod') {
  const routes = new Hono()
  const secureCookies = environmentType === 'prod'
  const setSession = (c: any, session: string) => setCookie(c, sessionCookie, session, {
    httpOnly: true, sameSite: 'Lax', secure: secureCookies, path: '/', maxAge: 60 * 60 * 24 * 30,
  })

  routes.get('/session', async c => c.json({ user: await auth.userForSession(getCookie(c, sessionCookie)) ?? null }))
  // Never register the authentication bypass on a production server.
  if (environmentType === 'dev') {
    routes.post('/fake-login', async c => {
      try {
        const body = await c.req.json()
        if (typeof body.email !== 'string') throw new Error('Enter a valid email address')
        const { session, user } = await auth.fakeLogin(body.email)
        setSession(c, session)
        return c.json({ user })
      } catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Unable to sign in' }, 400) }
    })
  }
  routes.post('/magic-link', async c => {
    try {
      const body = await c.req.json()
      return c.json({ sent: true, ...await auth.requestMagicLink(body.email) })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Unable to send magic link' }, 400) }
  })
  routes.get('/magic-link/verify', async c => {
    try {
      const { session, user } = await auth.consumeMagicLink(c.req.query('token') || '')
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
  routes.post('/logout', async c => {
    await auth.signOut(getCookie(c, sessionCookie))
    deleteCookie(c, sessionCookie, { path: '/' })
    return c.json({ ok: true })
  })
  return routes
}

export async function sessionUser(auth: AuthService, cookieHeader?: string) {
  const match = cookieHeader?.match(/(?:^|;\s*)katavti_session=([^;]+)/)
  return await auth.userForSession(match?.[1])
}
