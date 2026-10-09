import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createServer as createViteServer, type ViteDevServer } from '../../../client/node_modules/vite/dist/node/index.js'
import { startServer } from '../../src/server.js'
import type { AppConfig } from '../../src/config/index.js'

// Acceptance tests for conflict-safe saves and non-destructive anonymous imports.
// These intentionally fail until synchronization is fixed; no expected-failure markers.
// Real browser editors, independent cookies/localStorage, HTTP API, and filesystem.
// No request interception or mocked note/session storage. Only login skips email.
let directory: string
let api: Server
let vite: ViteDevServer
let browser: Browser
let origin: string
let config: AppConfig
const contexts: BrowserContext[] = []
const today = new Date('2026-10-09T12:00:00.000Z')

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'katavti-multi-device-'))
  config = {
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
  vite = await createViteServer({
    root: path.resolve('client'), configFile: path.resolve('client/vite.config.ts'),
    cacheDir: path.join(directory, 'vite-cache'),
    server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: `http://127.0.0.1:${running.port}` } } },
  })
  await vite.listen()
  const address = vite.httpServer!.address()
  if (!address || typeof address === 'string') throw new Error('Missing Vite address')
  origin = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) })
}, 60_000)

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(context => context.close()))
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
  if (api) await closeServer(api)
  if (directory) await rm(directory, { recursive: true, force: true })
})

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}

async function device(mobile = false) {
  const context = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 800 } })
  contexts.push(context)
  const page = await context.newPage()
  await page.clock.setFixedTime(today)
  return page
}

async function fakeLogin(page: Page, email: string) {
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill(email)
  const completed = page.waitForResponse(response => response.url().endsWith('/auth/fake-login') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Fake log in (dev only)', exact: true }).click()
  expect((await completed).status()).toBe(200)
  await page.getByRole('button', { name: 'Log out', exact: true }).waitFor()
}

const editor = (page: Page) => page.locator('.note.active .cm-content')
async function openDaily(page: Page) {
  await page.goto(`${origin}/daily`)
  await editor(page).waitFor()
}
async function saved(page: Page) {
  await page.getByText('All changes saved', { exact: true }).waitFor()
}
async function editAuthenticated(page: Page, content: string) {
  const completed = page.waitForResponse(response => response.url().includes('/api/v1beta/notes/') && response.request().method() === 'POST')
  await editor(page).fill(content)
  const response = await completed
  expect(response.status()).toBe(200)
  await saved(page)
  return response.url()
}
async function readNote(page: Page, url: string) {
  const response = await page.request.get(url)
  expect(response.status()).toBe(200)
  return (await response.json()).content as string
}

// Check the backend rejection and the UI warning independently: a failed HTTP
// assertion must not prevent the missing-warning assertion from being exercised.
const conflictMessage = /stale|out[ -]of[ -]date|conflict|changed.*(?:device|elsewhere)|newer.*(?:version|note)|updated.*elsewhere/i
async function editStaleLaptop(email: string) {
  const laptop = await device()
  const mobile = await device(true)
  const original = '# Shared note\nOriginal text'
  const mobileContent = `${original}\nMobile-only addition`
  const laptopContent = `${original}\nLaptop-only addition`
  await laptop.goto(origin)
  await fakeLogin(laptop, email)
  await openDaily(laptop)
  const url = await editAuthenticated(laptop, original)
  await mobile.goto(origin)
  await fakeLogin(mobile, email)
  await openDaily(mobile)
  expect(await editor(mobile).innerText()).toBe(original)
  const laptopCookie = (await laptop.context().cookies()).find(cookie => cookie.name === 'katavti_session')!
  const mobileCookie = (await mobile.context().cookies()).find(cookie => cookie.name === 'katavti_session')!
  expect(laptopCookie.value).not.toBe(mobileCookie.value)

  await editAuthenticated(mobile, mobileContent)
  expect(await readNote(mobile, url)).toBe(mobileContent)
  await laptop.bringToFront()
  // No reload, navigation, or injected save: append to the genuinely stale editor.
  expect(await editor(laptop).innerText()).toBe(original)
  const completed = laptop.waitForResponse(response => response.url() === url && response.request().method() === 'POST')
  await editor(laptop).press('ControlOrMeta+End')
  await editor(laptop).press('Enter')
  await editor(laptop).pressSequentially('Laptop-only addition')
  const response = await completed
  return { laptop, mobile, url, response, mobileContent, laptopContent }
}

describe('multi-device conflict safety', () => {
  it('rejects a stale laptop save with a conflict error and preserves the mobile note', async () => {
    const { mobile, url, response, mobileContent } = await editStaleLaptop('stale-server@example.com')
    // Accept either standard optimistic-concurrency error; a 401/500 is not a fix.
    expect.soft([409, 412], 'stale writes must return a conflict/precondition error, not success').toContain(response.status())
    const body = await response.json()
    expect.soft(body.error, 'response must explain that this is a stale-note conflict').toEqual(expect.stringMatching(conflictMessage))
    expect.soft(await readNote(mobile, url), 'rejected stale write must leave the latest server content intact').toBe(mobileContent)
  }, 45_000)

  it('visibly warns when editing a stale note, keeps the draft, and does not claim it was saved', async () => {
    const { laptop, laptopContent } = await editStaleLaptop('stale-warning@example.com')
    // Assert a visible, accessible warning without prescribing exact copy or CSS.
    // This uses the real response, not an intercepted/mock conflict response.
    const warning = laptop.locator('[role="alert"]:visible, [role="status"]:visible').filter({ hasText: conflictMessage })
    await expect.poll(() => warning.count(), {
      timeout: 5_000, message: 'client must show a visible stale-note/conflict warning after the save attempt',
    }).toBeGreaterThan(0)
    expect.soft(await editor(laptop).innerText(), 'the rejected local draft must remain recoverable').toBe(laptopContent)
    expect.soft(await laptop.getByText('All changes saved', { exact: true }).isVisible(), 'stale changes must not be reported as saved').toBe(false)
  }, 45_000)

  it('renames anonymous backups across weeks without overwriting existing notes or erasing them with empty slots', async () => {
    const account = await device()
    const anonymous = await device()
    const email = 'anonymous-backup@example.com'
    await account.goto(origin)
    await fakeLogin(account, email)
    const cases: Array<{ daysAgo: number; ids: string[]; remote: string; local: string; secondRemote: string }> = []
    const label = 'MULTI-DEVICE-BACKUP'
    for (const daysAgo of [21, 7, 0]) {
      const when = new Date(today)
      when.setUTCDate(when.getUTCDate() - daysAgo)
      // Seed through the real editor so future revision/precondition handling is
      // exercised normally, rather than guessing a new save API in test setup.
      await account.clock.setFixedTime(when)
      await openDaily(account)
      const remote = `# Account note ${daysAgo}\nImportant existing server content\nLabel: ${label}`
      const secondRemote = `# Second account note ${daysAgo}\nDo not erase\nLabel: ${label}`
      const firstUrl = await editAuthenticated(account, remote)
      await account.locator('.note').nth(1).locator('header').click()
      const secondUrl = await editAuthenticated(account, secondRemote)
      const ids = [firstUrl, secondUrl].map(url => new URL(url).pathname.split('/notes/')[1])
      // Simulate actual anonymous editor use across three dates, not injected localStorage.
      await anonymous.clock.setFixedTime(when)
      await openDaily(anonymous)
      const local = `# Anonymous note ${daysAgo}\nBrowser-only draft\nLabel: ${label}`
      await editor(anonymous).fill(local)
      await saved(anonymous)
      expect(await anonymous.getByRole('button', { name: 'Log in', exact: true }).count()).toBe(1)
      cases.push({ daysAgo, ids, remote, local, secondRemote })
    }
    await anonymous.clock.setFixedTime(today)
    await anonymous.goto(origin)
    const stored = await anonymous.evaluate(() => JSON.parse(localStorage.getItem('katavti.notes.v1') || '{}'))
    expect(Object.keys(stored)).toHaveLength(12)
    expect((await anonymous.context().cookies()).some(cookie => cookie.name === 'katavti_session')).toBe(false)
    const session = await anonymous.request.get(`${origin}/api/v1beta/auth/session`)
    expect(await session.json()).toEqual({ user: null })
    for (const item of cases) {
      expect(stored[item.ids[0]].content).toBe(item.local)
      expect(stored[item.ids[1]].content).toBe('')
      expect(await readNote(account, `${origin}/api/v1beta/notes/${item.ids[0]}`)).toBe(item.remote)
      expect(await readNote(account, `${origin}/api/v1beta/notes/${item.ids[1]}`)).toBe(item.secondRemote)
    }
    const listUrl = `${origin}/api/v1beta/notes?bug=${label}`
    const before = await account.request.get(listUrl)
    expect(before.status()).toBe(200)
    const existingIds: string[] = await before.json()
    expect(existingIds).toHaveLength(6)
    // Login reloads the account list after backup finishes. Do not couple this
    // contract to a particular upload endpoint, request count, or success copy.
    const reloaded = anonymous.waitForResponse(response =>
      response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/v1beta/notes')
    await fakeLogin(anonymous, email)
    expect((await reloaded).status()).toBe(200)

    const listed = await account.request.get(listUrl)
    expect(listed.status()).toBe(200)
    const ids: string[] = await listed.json()
    const notes = await Promise.all(ids.map(async id => ({ id, content: await readNote(account, `${origin}/api/v1beta/notes/${id}`) })))
    for (const item of cases) {
      expect.soft(await readNote(account, `${origin}/api/v1beta/notes/${item.ids[0]}`), `existing note from ${item.daysAgo} days ago must be preserved`).toBe(item.remote)
      expect.soft(await readNote(account, `${origin}/api/v1beta/notes/${item.ids[1]}`), `empty local slot from ${item.daysAgo} days ago must not erase a server note`).toBe(item.secondRemote)
      const imported = notes.filter(note => note.content === item.local)
      expect.soft(imported, `draft from ${item.daysAgo} days ago must also be backed up, not discarded`).toHaveLength(1)
      for (const note of imported) {
        // Any collision-free rename is valid; do not prescribe a suffix scheme.
        expect.soft(existingIds, `draft from ${item.daysAgo} days ago must have a new ID, not replace an existing note`).not.toContain(note.id)
      }
    }
  }, 45_000)

  it('production HTTP server has no fake-login endpoint and issues no session', async () => {
    const running = await startServer({ ...config, environmentType: 'prod' })
    try {
      const response = await fetch(`http://127.0.0.1:${running.port}/api/v1beta/auth/fake-login`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bypass@example.com' }),
      })
      expect(response.status).toBe(404)
      expect(response.headers.get('set-cookie')).toBeNull()
    } finally { await closeServer(running.server) }
  })
})
