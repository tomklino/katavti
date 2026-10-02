import { describe, expect, it, vi } from 'vitest'
import { createAuthService } from '../../src/services/auth-service.js'

describe('auth service magic links', () => {
  it('sends a one-use link and creates a session for its email', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined)
    const auth = createAuthService({ magicLinkBaseUrl: 'http://katavti.local', mailFrom: 'test@katavti.local', sendMail, now: () => 1000 })
    await auth.requestMagicLink('Alice@Example.com')
    const url = new URL(sendMail.mock.calls[0][0].text.split(': ').at(-1))
    const result = auth.consumeMagicLink(url.searchParams.get('token')!)
    expect(result.user.email).toBe('alice@example.com')
    expect(auth.userForSession(result.session)).toEqual(result.user)
    expect(() => auth.consumeMagicLink(url.searchParams.get('token')!)).toThrow(/invalid or expired/)
  })

  it('configures Gmail SMTP with OAuth2 credentials', async () => {
    const createTransport = vi.spyOn((await import('nodemailer')).default, 'createTransport').mockReturnValue({ sendMail: vi.fn() } as never)
    createAuthService({
      magicLinkBaseUrl: 'https://katavti.test',
      mailFrom: 'katavti@klino.me',
      smtpOAuth: {
        user: 'katavti@klino.me',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        refreshToken: 'refresh-token',
      },
    })
    expect(createTransport).toHaveBeenCalledWith({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: 'katavti@klino.me',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        refreshToken: 'refresh-token',
      },
    })
    createTransport.mockRestore()
  })

  it('rejects email sign-in when SMTP is not configured in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const auth = createAuthService({ magicLinkBaseUrl: 'https://katavti.test', mailFrom: 'test@katavti.test' })
    await expect(auth.requestMagicLink('alice@example.com')).rejects.toThrow(/Email sign-in is not configured/)
    vi.unstubAllEnvs()
  })

  it('rejects an expired link', async () => {
    let now = 1000
    const auth = createAuthService({ magicLinkBaseUrl: 'http://katavti.local', mailFrom: 'test@katavti.local', now: () => now })
    const result = await auth.requestMagicLink('alice@example.com')
    now += 16 * 60_000
    const token = new URL(result.developmentUrl!).searchParams.get('token')!
    expect(() => auth.consumeMagicLink(token)).toThrow(/invalid or expired/)
  })
})
