import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer as createViteServer, type ViteDevServer } from '../../../client/node_modules/vite/dist/node/index.js'
import { startServer } from '../../src/server.js'
import type { AppConfig } from '../../src/config/index.js'

let directory: string, origin: string, browser: Browser, api: Server, vite: ViteDevServer
const contexts: BrowserContext[] = []
const evidence = path.resolve('docs/reports/assets')
const logs: string[] = []
const bytes = Buffer.from([0, 255, 128, 13, 10, 65, 0])
const fixture = (name: string, buffer = bytes, mimeType = 'application/octet-stream') => ({ name, buffer, mimeType })

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'katavti-assets-browser-'))
  await mkdir(path.join(evidence, 'screenshots'), { recursive: true })
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
  api = running.server
  vite = await createViteServer({ root: path.resolve('client'), configFile: path.resolve('client/vite.config.ts'), cacheDir: path.join(directory, 'vite-cache'), server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: `http://127.0.0.1:${running.port}` } } } })
  await vite.listen()
  const address = vite.httpServer!.address()
  if (!address || typeof address === 'string') throw new Error('Missing Vite address')
  origin = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) })
  logs.push(`Headless Chromium; frontend ${origin}; API http://127.0.0.1:${running.port}; temporary filesystem only.`)
}, 60_000)
afterAll(async () => {
  await writeFile(path.join(evidence, 'browser.log'), logs.join('\n') + '\n')
  await Promise.all(contexts.map(context => context.close()))
  await browser?.close(); await vite?.close()
  if (api) await new Promise<void>(resolve => api.close(() => resolve()))
  if (directory) await rm(directory, { recursive: true, force: true })
})
async function device() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })
  contexts.push(context)
  // Reject external access: no cluster, SMTP, Google, Azure, or public Internet tests.
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.fulfill({ status: 200, body: '' })
  })
  const page = await context.newPage()
  await page.clock.setFixedTime(new Date('2001-01-01T12:00:00Z'))
  page.on('pageerror', error => logs.push(`PAGE ERROR: ${error.message}`))
  page.on('console', message => { if (message.type() === 'error') logs.push(`CONSOLE ERROR: ${message.text()}`) })
  page.on('response', response => { if (new URL(response.url()).pathname.startsWith('/api/')) logs.push(`${response.request().method()} ${new URL(response.url()).pathname} -> ${response.status()}`) })
  await page.goto(`${origin}/daily`)
  await editor(page).waitFor()
  return page
}
const editor = (page: Page) => page.locator('.note.active .cm-content')
const input = (page: Page) => page.locator('.note.active input[type=file]')
async function saved(page: Page) { await page.getByText('All changes saved', { exact: true }).waitFor() }
async function attach(page: Page, files: ReturnType<typeof fixture>[]) {
  await input(page).setInputFiles(files)
  await page.getByText(`${files.length} asset${files.length === 1 ? '' : 's'} attached. Click a link in Preview to download.`, { exact: true }).waitFor()
  await saved(page)
}
async function preview(page: Page) { await page.locator('.note.active .raw-toggle input').uncheck() }
async function download(page: Page, name: string, expected: Buffer) {
  const link = page.locator('.note.active .rendered').getByRole('link', { name, exact: true }).first()
  await link.waitFor()
  const [file] = await Promise.all([page.waitForEvent('download'), link.click()])
  expect(await readFile((await file.path())!)).toEqual(expected)
  logs.push(`Verified exact download bytes: ${name} (${expected.length} bytes)`)
}
async function localNote(page: Page) {
  return page.evaluate(() => Object.entries(JSON.parse(localStorage.getItem('katavti.notes.v1') || '{}')).find(([, note]: any) => note.content.includes('../assets/')) as [string, { content: string }])
}
async function storedAssets(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('katavti.assets.v1', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    try {
      const assets = await new Promise<any[]>((resolve, reject) => { const r = db.transaction('assets').objectStore('assets').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
      return Promise.all(assets.map(async a => ({ key: a.key, name: a.name, synced: a.synced, bytes: Array.from(new Uint8Array(await a.blob.arrayBuffer())) })))
    } finally { db.close() }
  })
}
async function login(page: Page, email: string) {
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill(email)
  const reloaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1beta/notes/daily' && response.request().method() === 'PUT')
  await page.getByRole('button', { name: 'Fake log in (dev only)', exact: true }).click()
  await page.getByRole('button', { name: 'Log out', exact: true }).waitFor()
  expect((await reloaded).status()).toBe(201)
  await page.locator('.note.active .note-body').waitFor()
}

describe('headless asset acceptance tests', () => {
  it('uploads any type, inserts at cursor, persists exact bytes, downloads after reload and offline, and stays usable on mobile', async () => {
    const page = await device()
    await editor(page).fill('# Asset notebook\nBefore\nAfter')
    await editor(page).press('ControlOrMeta+Home')
    await editor(page).press('ArrowDown')
    await attach(page, [fixture('binary [sample].bin'), fixture('binary [sample].bin'), fixture('README.md', Buffer.from('# Not a note\nLabel: ASSET'), 'text/markdown'), fixture('no-extension', Buffer.alloc(0)), fixture('unsafe.html', Buffer.from('<script>alert("never execute")</script>'), 'text/html')])
    const [id, note] = await localNote(page)
    expect(decodeURIComponent(id)).toContain('2001/january.d/workspaces-2001-01-01')
    expect(note.content.indexOf('../assets/')).toBeLessThan(note.content.indexOf('After'))
    expect((note.content.match(/\.\.\/assets\//g) || [])).toHaveLength(5)
    const assets = await storedAssets(page)
    expect(assets).toHaveLength(5)
    expect(new Set(assets.map(a => a.key)).size).toBe(5)
    expect(assets.every(a => a.key.includes('/2001/january.d/assets/'))).toBe(true)
    expect(assets[0].bytes).toBeDefined()
    await page.screenshot({ path: path.join(evidence, 'screenshots/01-anonymous-raw.png'), fullPage: true })
    await page.reload(); await editor(page).waitFor(); await preview(page)
    await download(page, 'binary [sample].bin', bytes)
    await download(page, 'no-extension', Buffer.alloc(0))
    await download(page, 'unsafe.html', Buffer.from('<script>alert("never execute")</script>'))
    await page.screenshot({ path: path.join(evidence, 'screenshots/02-anonymous-preview.png'), fullPage: true })
    await page.context().setOffline(true)
    await download(page, 'binary [sample].bin', bytes)
    await page.context().setOffline(false)
    await page.setViewportSize({ width: 320, height: 740 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: path.join(evidence, 'screenshots/03-mobile-preview.png'), fullPage: true })
    logs.push('PASS: anonymous multiple types, duplicate names, cursor insertion, browser persistence, reload, offline, 320px layout.')
  }, 45_000)

  it('backs up anonymous assets to a collision-free imported note in its historical month and caches downloads on another device', async () => {
    const page = await device()
    await editor(page).fill('# Historical assets\nLabel: ASSET-BROWSER')
    await attach(page, [fixture('archive.bin')])
    const [originalId, original] = await localNote(page)
    const email = 'assets-browser@example.com'
    // Existing server note occupies workspace-1; backup must rename without breaking relative asset links.
    const account = await device()
    await account.request.post(`${origin}/api/v1beta/auth/fake-login`, { data: { email } })
    await account.request.put(`${origin}/api/v1beta/notes/daily?num=1&date=2001-01-01`)
    await login(page, email)
    const listed = await page.request.get(`${origin}/api/v1beta/notes?bug=ASSET-BROWSER`)
    const [importedId] = await listed.json()
    expect(importedId).not.toBe(originalId)
    const note = await (await page.request.get(`${origin}/api/v1beta/notes/${importedId}`)).json()
    expect(note.content).toBe(original.content)
    const filename = note.content.match(/\.\.\/assets\/([^\s)]+)/)[1]
    expect(await readFile(path.join(directory, 'notes', email, '2001/january.d/assets', filename))).toEqual(bytes)
    const importedIndex = Number(decodeURIComponent(importedId).match(/workspace-(\d+)\.md$/)![1]) - 1
    await page.locator('.note').nth(importedIndex).locator('header').click()
    await preview(page)
    await download(page, 'archive.bin', bytes)
    await page.screenshot({ path: path.join(evidence, 'screenshots/04-authenticated-preview.png'), fullPage: true })
    const other = await device()
    await other.request.post(`${origin}/api/v1beta/auth/fake-login`, { data: { email } })
    await other.reload()
    const historicalHeader = other.locator('.note header').filter({ hasText: 'Historical assets' })
    await historicalHeader.waitFor()
    await historicalHeader.click()
    await preview(other)
    await download(other, 'archive.bin', bytes)
    expect((await storedAssets(other)).some(a => a.synced && Buffer.from(a.bytes).equals(bytes))).toBe(true)
    await other.context().setOffline(true)
    await download(other, 'archive.bin', bytes)
    await other.context().setOffline(false)
    await other.getByRole('link', { name: 'All notes', exact: true }).click()
    await other.getByLabel('Search label', { exact: true }).fill('ASSET-BROWSER')
    await other.getByRole('button', { name: 'Search', exact: true }).click()
    await download(other, 'archive.bin', bytes)
    await other.screenshot({ path: path.join(evidence, 'screenshots/07-all-notes-preview.png'), fullPage: true })
    await other.getByRole('button', { name: 'Dark theme', exact: true }).click()
    await expect.poll(() => other.locator('.note.active').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(28, 37, 42)')
    await other.screenshot({ path: path.join(evidence, 'screenshots/08-dark-preview.png'), fullPage: true })
    logs.push('PASS: historical-month filesystem path, collision-free note import with unchanged relative link, second-device fetch/cache/offline, All notes downloads, dark theme.')
    // Authenticated upload appends from Preview, goes to API and IndexedDB.
    await attach(page, [fixture('authenticated.data')])
    await download(page, 'authenticated.data', bytes)
    expect((await storedAssets(page)).some(a => a.name === 'authenticated.data' && a.synced)).toBe(true)
    logs.push('PASS: authenticated upload from Preview and exact downloaded bytes.')
  }, 45_000)

  it('shows storage and size failures without broken links, and keeps local downloads when server upload fails', async () => {
    const page = await device()
    await editor(page).fill('# Failure handling')
    await saved(page)
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.put
      ;(window as any).restorePut = () => { IDBObjectStore.prototype.put = original }
      IDBObjectStore.prototype.put = function () { throw new DOMException('Browser asset quota exceeded', 'QuotaExceededError') }
    })
    await input(page).setInputFiles(fixture('quota.bin'))
    await page.getByRole('alert').filter({ hasText: 'Browser asset quota exceeded' }).waitFor()
    expect(await editor(page).innerText()).not.toContain('../assets/')
    await page.screenshot({ path: path.join(evidence, 'screenshots/05-storage-error.png'), fullPage: true })
    await page.evaluate(() => (window as any).restorePut())
    const largeFile = path.join(directory, 'large.bin')
    await writeFile(largeFile, Buffer.alloc(50 * 1024 * 1024 + 1))
    await input(page).setInputFiles(largeFile)
    await page.getByRole('alert').filter({ hasText: '50 MiB' }).waitFor()
    expect(await editor(page).innerText()).not.toContain('../assets/')
    await page.request.post(`${origin}/api/v1beta/auth/fake-login`, { data: { email: 'assets-failure@example.com' } })
    await page.reload(); await editor(page).waitFor()
    await page.route('**/assets/*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Simulated local server outage' }) }))
    await input(page).setInputFiles(fixture('recoverable.bin'))
    await page.getByRole('alert').filter({ hasText: 'Asset saved in this browser only' }).waitFor()
    await saved(page)
    await preview(page)
    await download(page, 'recoverable.bin', bytes)
    await page.screenshot({ path: path.join(evidence, 'screenshots/06-server-backup-warning.png'), fullPage: true })
    await page.unroute('**/assets/*')
    await page.getByRole('button', { name: 'Log out', exact: true }).click()
    await login(page, 'assets-failure@example.com')
    expect((await storedAssets(page)).some(a => a.name === 'recoverable.bin' && a.synced)).toBe(true)
    logs.push('PASS: quota/size failures insert no broken links; server failure preserves browser bytes/link; next login retries successfully.')
    expect(logs.filter(line => line.startsWith('PAGE ERROR:'))).toEqual([])
  }, 60_000)
})
