import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { OAuth2Client } from 'google-auth-library'
import nodemailer from 'nodemailer'
import { SessionManager, type SessionBackend } from './session-manager.js'

export type AuthUser = { email: string; name?: string; picture?: string }
type PendingLink = { email: string; expiresAt: number }
type SmtpOAuth = { user: string; clientId: string; clientSecret: string; refreshToken: string }

function normalizedEmail(value: string) {
  const email = value.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address')
  return email
}

function tokenHash(token: string) { return createHash('sha256').update(token).digest() }

export function createAuthService(options: {
  environmentType?: 'dev' | 'prod'
  googleClientId?: string
  magicLinkBaseUrl: string
  smtpUrl?: string
  smtpOAuth?: SmtpOAuth
  mailFrom: string
  now?: () => number
  sendMail?: (message: { to: string; from: string; subject: string; text: string; html: string }) => Promise<unknown>
  sessions?: SessionManager<AuthUser>
}) {
  const google = options.googleClientId ? new OAuth2Client(options.googleClientId) : undefined
  const pending = new Map<string, PendingLink>()
  const memoryBackend: SessionBackend<AuthUser> = {
    load: async () => new Map(), get: async () => undefined, save: async () => {}, delete: async () => {},
  }
  let sessions = options.sessions
  const sessionsReady = sessions ? Promise.resolve(sessions) : SessionManager.initialize(memoryBackend).then(value => (sessions = value))
  const now = options.now ?? Date.now
  const transport = options.smtpOAuth
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: { type: 'OAuth2', ...options.smtpOAuth },
      })
    : options.smtpUrl ? nodemailer.createTransport(options.smtpUrl) : undefined
  const sendMail = options.sendMail ?? (transport ? (message => transport.sendMail(message)) : undefined)

  async function requestMagicLink(rawEmail: string) {
    if (!sendMail && process.env.NODE_ENV === 'production') {
      throw new Error('Email sign-in is not configured')
    }
    const email = normalizedEmail(rawEmail)
    const token = randomBytes(32).toString('base64url')
    pending.set(token, { email, expiresAt: now() + 15 * 60_000 })
    // Return to the editor so pre-login notes stay visible while they are backed up.
    const url = new URL('/daily', options.magicLinkBaseUrl)
    url.searchParams.set('token', token)
    const message = {
      to: email,
      from: options.mailFrom,
      subject: 'Sign in to Katavti',
      text: `Sign in to Katavti: ${url}`,
      html: `<p>Sign in to Katavti:</p><p><a href="${url}">Continue to Katavti</a></p><p>This link expires in 15 minutes.</p>`,
    }
    if (sendMail) await sendMail(message)
    else if (process.env.NODE_ENV !== 'test') console.log(`Katavti development magic link for ${email}: ${url}`)
    return { ...(sendMail ? {} : { developmentUrl: url.toString() }) }
  }

  function consumeMagicLink(token: string) {
    let match: [string, PendingLink] | undefined
    const supplied = tokenHash(token)
    for (const entry of pending) {
      if (timingSafeEqual(supplied, tokenHash(entry[0]))) { match = entry; break }
    }
    if (!match || match[1].expiresAt < now()) throw new Error('Magic link is invalid or expired')
    pending.delete(match[0])
    const user = { email: match[1].email }
    return createSession(user)
  }

  async function createSession(user: AuthUser) {
    const session = randomBytes(32).toString('base64url')
    await (await sessionsReady).set(session, user)
    return { session, user }
  }

  async function signInWithGoogle(credential: string) {
    if (!google || !options.googleClientId) throw new Error('Google login is not configured')
    const ticket = await google.verifyIdToken({ idToken: credential, audience: options.googleClientId })
    const payload = ticket.getPayload()
    if (!payload?.email || !payload.email_verified) throw new Error('Google account email is not verified')
    return createSession({ email: normalizedEmail(payload.email), name: payload.name, picture: payload.picture })
  }

  async function fakeLogin(email: string) {
    if (options.environmentType !== 'dev') throw new Error('Fake login is only available in development')
    return createSession({ email: normalizedEmail(email) })
  }

  async function userForSession(session?: string) { return sessions ? sessions.get(session) : undefined }
  async function signOut(session?: string) { await (await sessionsReady).delete(session) }

  return { requestMagicLink, consumeMagicLink, signInWithGoogle, fakeLogin, userForSession, signOut }
}

export type AuthService = ReturnType<typeof createAuthService>
