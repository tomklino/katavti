import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startServer } from '../../src/server.js'
import type { AppConfig } from '../../src/config/index.js'

let dataDir: string
let server: Server
let origin: string
let headers: Record<string, string>

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'))
  dataDir = await mkdtemp(path.join(tmpdir(), 'katavti-'))
  const config: AppConfig = {
    environmentType: 'dev',
    server: { host: '127.0.0.1', port: 0 },
    storage: { dataDir },
    sessions: { module: 'filesystem', lazy: true, cache: true, filesystem: { directory: path.join(dataDir, 'sessions') } },
    http: { cors: { origins: ['http://client.test'], allowLoopbackInDevelopment: true }, identity: { headerName: 'x-user-id' } },
    api: { basePath: '/api/v1beta' },
    auth: { googleClientId: '', magicLinkBaseUrl: 'http://katavti.local', smtpUrl: '', mailFrom: 'test@katavti.local' },
    config: { files: [], secretFiles: [] },
  }
  const running = await startServer(config)
  server = running.server
  origin = `http://127.0.0.1:${running.port}`
  headers = await login('alice@example.com')
})

afterEach(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  await rm(dataDir, { recursive: true, force: true })
  vi.useRealTimers()
})

async function json(url: string, init?: RequestInit) {
  const response = await fetch(`${origin}${url}`, init)
  return { response, body: await response.json() }
}

async function login(email: string) {
  const requested = await json('/api/v1beta/auth/magic-link', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }),
  })
  const token = new URL(requested.body.developmentUrl).searchParams.get('token')!
  const verified = await fetch(`${origin}/api/v1beta/auth/magic-link/verify?token=${token}`)
  return { cookie: verified.headers.get('set-cookie')!.split(';')[0] }
}

describe('API end to end', () => {
  it('reports health', async () => {
    const { response, body } = await json('/api/v1beta/health')
    expect(response.status).toBe(200)
    expect(body).toEqual({ status: 'ok' })
  })

  it('creates daily notes, updates one, and finds it in the list', async () => {
    const created = await json('/api/v1beta/notes/daily?num=2&date=2026-09-25', { method: 'PUT', headers })
    expect(created.response.status).toBe(201)
    expect(created.body).toHaveLength(2)

    const id = created.body[0]
    const updated = await json(`/api/v1beta/notes/${id}`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ content: '# Sprint\nLabel: KAT-7' }),
    })
    expect(updated.response.status).toBe(200)

    const listed = await json('/api/v1beta/notes?days=5', { headers })
    expect(listed.body).toContain(id)

    const note = await json(`/api/v1beta/notes/${id}`, { headers })
    expect(note.body).toMatchObject({ content: '# Sprint\nLabel: KAT-7', ISODateString: '2026-09-25T00:00:00.000Z' })
    expect(await readFile(path.join(dataDir, 'alice@example.com', decodeURIComponent(id)), 'utf8')).toContain('KAT-7')

    const filtered = await json('/api/v1beta/notes?bug=KAT-7', { headers })
    expect(filtered.body).toEqual([id])
  })

  it('requires identity and isolates direct note references between users', async () => {
    const created = await json('/api/v1beta/notes/daily?num=1&date=2026-09-25', { method: 'PUT', headers })
    const id = created.body[0]
    await json(`/api/v1beta/notes/${id}`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ content: 'Alice secret' }),
    })

    expect((await json('/api/v1beta/notes')).response.status).toBe(401)
    expect((await json(`/api/v1beta/notes/${id}`)).response.status).toBe(401)

    const bobHeaders = await login('bob@example.com')
    expect((await json('/api/v1beta/notes?days=5', { headers: bobHeaders })).body).toEqual([])
    expect((await json(`/api/v1beta/notes/${id}`, { headers: bobHeaders })).response.status).toBe(404)
    await json(`/api/v1beta/notes/${id}`, {
      method: 'POST', headers: { ...bobHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ content: 'Bob content' }),
    })
    expect((await json(`/api/v1beta/notes/${id}`, { headers })).body.content).toBe('Alice secret')
  })

  it('validates daily input and blocks traversal', async () => {
    expect((await json('/api/v1beta/notes/daily?num=0', { method: 'PUT', headers })).response.status).toBe(400)
    expect((await json('/api/v1beta/notes/%2E%2E%2Fsecret.md', { headers })).response.status).toBe(400)
    expect((await json('/api/v1beta/notes/%252E%252E%252Fsecret.md', { headers })).response.status).toBe(400)
    expect((await json('/api/v1beta/notes/2026%2Fseptember.d%2Fworkspaces-2026-09-25%2F..%2F..%2Fbob@example.com%2Fsecret.md', { headers })).response.status).toBe(400)
  })
})
