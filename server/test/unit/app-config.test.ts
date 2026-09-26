import { describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import type { AppConfig } from '../../src/config/index.js'

const config: AppConfig = {
  environmentType: 'dev',
  server: { host: '127.0.0.1', port: 3000 }, storage: { dataDir: '/tmp/notes' },
  http: { cors: { origins: ['https://client.test'], allowLoopbackInDevelopment: true }, identity: { headerName: 'x-person-id' } },
  api: { basePath: '/custom/v3' }, auth: { googleClientId: '', magicLinkBaseUrl: 'https://client.test', smtpUrl: '', mailFrom: 'test@katavti.local' }, config: { files: [], secretFiles: [] },
}

describe('application configuration', () => {
  it('uses the configured API path, identity header, and CORS origins', async () => {
    const service = { list: async () => [], read: async () => ({} as any), update: async () => '', createDaily: async () => [] }
    const app = createApp(config, service)

    expect((await app.request('/api/v1beta/health')).status).toBe(404)
    expect((await app.request('/custom/v3/health')).status).toBe(200)
    expect((await app.request('/custom/v3/notes')).status).toBe(401)
    expect((await app.request('/custom/v3/notes', { headers: { 'x-person-id': 'alice' } })).status).toBe(401)
    expect((await app.request('/custom/v3/health', { headers: { origin: 'https://client.test' } })).headers.get('access-control-allow-origin')).toBe('https://client.test')
    expect((await app.request('/custom/v3/health', { headers: { origin: 'https://blocked.test' } })).headers.get('access-control-allow-origin')).toBeNull()
  })

  it('allows loopback browser origins in development, including a different dev-server port', async () => {
    const service = { list: async () => [], read: async () => ({} as any), update: async () => '', createDaily: async () => [] }
    const app = createApp(config, service)
    const response = await app.request('/custom/v3/notes', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://127.0.0.1:8181',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'x-person-id',
      },
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:8181')
  })

  it('does not relax loopback CORS matching in production', async () => {
    const service = { list: async () => [], read: async () => ({} as any), update: async () => '', createDaily: async () => [] }
    const app = createApp({ ...config, environmentType: 'prod' }, service)
    const response = await app.request('/custom/v3/health', { headers: { origin: 'http://127.0.0.1:8181' } })

    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })
})
