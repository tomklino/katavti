import { mkdtemp, readFile, rm, symlink, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startServer } from '../../src/server.js'
import type { AppConfig } from '../../src/config/index.js'
import { MAX_ASSET_BYTES } from '../../src/data-modules/assets-data.js'

let directory: string, origin: string, cookie: string, id: string
let server: Server
const filename = '12345678-1234-4567-8123-123456789abc-payload.md'
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'katavti-assets-api-'))
  const config: AppConfig = {
    environmentType: 'dev', server: { host: '127.0.0.1', port: 0 },
    storage: { module: 'filesystem', dataDir: path.join(directory, 'notes') },
    sessions: { module: 'filesystem', lazy: true, cache: true, filesystem: { directory: path.join(directory, 'sessions') } },
    http: { cors: { origins: [], allowLoopbackInDevelopment: true }, identity: { headerName: 'x-user-id' } },
    api: { basePath: '/api/v1beta' },
    auth: { googleClientId: '', magicLinkBaseUrl: 'http://localhost', smtpUrl: '', mailFrom: 'test@katavti.local' },
    config: { files: [], secretFiles: [] },
  }
  const running = await startServer(config)
  server = running.server; origin = `http://127.0.0.1:${running.port}`
  cookie = await login('assets-api@example.com')
  const response = await fetch(`${origin}/api/v1beta/notes/daily?num=1&date=2001-01-01`, { method: 'PUT', headers: { cookie } })
  ;[id] = await response.json()
})
afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()))
  if (directory) await rm(directory, { recursive: true, force: true })
})
async function login(email: string) {
  const response = await fetch(`${origin}/api/v1beta/auth/fake-login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  return response.headers.get('set-cookie')!.split(';')[0]
}
const url = (name = filename, noteId = id) => `${origin}/api/v1beta/notes/${noteId}/assets/${encodeURIComponent(name)}`

describe('binary asset HTTP API (real isolated local filesystem)', () => {
  it('stores exact arbitrary bytes in the note month; retries cannot overwrite and md assets are not notes', async () => {
    const bytes = Buffer.from([0, 255, 128, 13, 10, 0, 65])
    const upload = () => fetch(url(), { method: 'PUT', headers: { cookie }, body: bytes })
    const uploaded = await upload()
    expect(uploaded.status).toBe(201)
    expect(await uploaded.json()).toEqual({ filename, path: `../assets/${filename}`, size: bytes.length })
    expect(await readFile(path.join(directory, 'notes/assets-api@example.com/2001/january.d/assets', filename))).toEqual(bytes)
    expect((await upload()).status).toBe(201)
    expect((await fetch(url(), { method: 'PUT', headers: { cookie }, body: 'different' })).status).toBe(409)
    const downloaded = await fetch(url(), { headers: { cookie } })
    expect(downloaded.status).toBe(200)
    expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(bytes)
    expect(downloaded.headers.get('content-type')).toBe('application/octet-stream')
    expect(downloaded.headers.get('content-disposition')).toBe('attachment; filename="payload.md"')
    expect(downloaded.headers.get('x-content-type-options')).toBe('nosniff')
    expect(downloaded.headers.get('content-security-policy')).toContain('sandbox')
    const listed = await fetch(`${origin}/api/v1beta/notes?days=100000`, { headers: { cookie } })
    expect(listed.status).toBe(200)
    expect(await listed.json()).toEqual([])
  })
  it('supports empty files and rejects over-limit bodies', async () => {
    const empty = filename.replace('payload.md', 'empty')
    expect((await fetch(url(empty), { method: 'PUT', headers: { cookie }, body: '' })).status).toBe(201)
    expect((await (await fetch(url(empty), { headers: { cookie } })).arrayBuffer()).byteLength).toBe(0)
    const tooLarge = await fetch(url(filename.replace('payload.md', 'large')), { method: 'PUT', headers: { cookie }, body: Buffer.alloc(MAX_ASSET_BYTES + 1) })
    expect(tooLarge.status).toBe(413)
  })
  it('requires a session, isolates users, validates both paths, and requires a source note for upload', async () => {
    expect((await fetch(url())).status).toBe(401)
    expect((await fetch(url(), { method: 'PUT', body: 'x' })).status).toBe(401)
    const bob = await login('other-assets@example.com')
    expect((await fetch(url(), { headers: { cookie: bob } })).status).toBe(404)
    expect((await fetch(url(), { method: 'PUT', headers: { cookie: bob }, body: 'x' })).status).toBe(404)
    expect((await fetch(url('../escape'), { headers: { cookie } })).status).toBe(400)
    expect((await fetch(url(filename, encodeURIComponent('../escape.md')), { headers: { cookie } })).status).toBe(400)
    const missing = encodeURIComponent('2001/january.d/workspaces-2001-01-01/workspace-99.md')
    expect((await fetch(url(filename, missing), { method: 'PUT', headers: { cookie }, body: 'x' })).status).toBe(404)
  })
  it('rejects a symlinked assets directory without reading or writing outside storage', async () => {
    const linkCookie = await login('symlink-assets@example.com')
    const created = await fetch(`${origin}/api/v1beta/notes/daily?num=1&date=2001-01-01`, { method: 'PUT', headers: { cookie: linkCookie } })
    const [linkId] = await created.json()
    const outside = path.join(directory, 'outside')
    await mkdir(outside)
    await symlink(outside, path.join(directory, 'notes/symlink-assets@example.com/2001/january.d/assets'))
    expect((await fetch(url(filename, linkId), { method: 'PUT', headers: { cookie: linkCookie }, body: 'x' })).status).toBe(400)
    expect((await fetch(url(filename, linkId), { headers: { cookie: linkCookie } })).status).toBe(400)
  })
})
