import { describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import type { AppConfig } from '../../src/config/index.js'
import { createAuthService } from '../../src/services/auth-service.js'

const config: AppConfig = {
  environmentType: 'dev', server: { host: '127.0.0.1', port: 3030 },
  storage: { dataDir: '/unused' },
  sessions: { module: 'filesystem', lazy: true, cache: true, filesystem: { directory: '/unused' } },
  http: { cors: { origins: [], allowLoopbackInDevelopment: true }, identity: { headerName: 'x-user-id' } },
  api: { basePath: '/api/v1beta' },
  auth: { googleClientId: '', magicLinkBaseUrl: 'http://katavti.local', smtpUrl: '', mailFrom: 'test@katavti.local' },
  config: { files: [], secretFiles: [] },
}
const notes = { list: async () => [], read: async () => ({ content: '', ISODateString: '', tags: [] }), update: async () => '', createDaily: async () => [] }
const request = (email: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })

describe('development fake login', () => {
  it('creates independent real sessions for the same normalized email', async () => {
    const app = createApp(config, notes)
    const first = await app.request('/api/v1beta/auth/fake-login', request(' Alice@Example.com '))
    const second = await app.request('/api/v1beta/auth/fake-login', request('alice@example.com'))
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(await first.json()).toEqual({ user: { email: 'alice@example.com' } })
    const cookie = first.headers.get('set-cookie')!
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).not.toBe(second.headers.get('set-cookie'))
    const session = await app.request('/api/v1beta/auth/session', { headers: { cookie: cookie.split(';')[0] } })
    expect(await session.json()).toEqual({ user: { email: 'alice@example.com' } })
  })

  it.each(['invalid', '', null, 123])('rejects invalid email %s without issuing a cookie', async email => {
    const response = await createApp(config, notes).request('/api/v1beta/auth/fake-login', request(email))
    expect(response.status).toBe(400)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('does not register the route in prod even when NODE_ENV is test', async () => {
    const response = await createApp({ ...config, environmentType: 'prod' }, notes)
      .request('/api/v1beta/auth/fake-login', request('alice@example.com'))
    expect(response.status).toBe(404)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it.each([undefined, 'prod'] as const)('fails closed in the service when environmentType is %s', async environmentType => {
    const auth = createAuthService({ ...config.auth, environmentType })
    await expect(auth.fakeLogin('alice@example.com')).rejects.toThrow(/only available in development/)
  })
})
