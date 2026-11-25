import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'
import { chromium, type Browser, type Page, type Response } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createServer as createViteServer, type ViteDevServer } from '../../../client/node_modules/vite/dist/node/index.js'
import { startServer } from '../../src/server.js'

const evidence = process.env.KATAVTI_PIN_EVIDENCE
const exchangeLog: string[] = []
let temporary: string, notes: string, origin: string, api: Server, vite: ViteDevServer, browser: Browser

beforeAll(async () => {
  temporary = await mkdtemp(path.join(tmpdir(), 'katavti-browser-pins-'))
  notes = path.join(temporary, 'notes')
  await mkdir(notes)
  if (evidence) await mkdir(path.join(evidence, 'screenshots'), { recursive: true })
  const running = await startServer({
    environmentType: 'dev', server: { host: '127.0.0.1', port: 0 },
    storage: { module: 'filesystem', dataDir: notes },
    sessions: { module: 'filesystem', lazy: true, cache: true, filesystem: { directory: path.join(temporary, 'sessions') } },
    http: { cors: { origins: [], allowLoopbackInDevelopment: true }, identity: { headerName: 'x-user-id' } },
    api: { basePath: '/api/v1beta' },
    auth: { googleClientId: '', magicLinkBaseUrl: 'http://localhost', smtpUrl: '', mailFrom: 'test@katavti.local' },
    config: { files: [], secretFiles: [] },
  })
  api = running.server
  vite = await createViteServer({
    root: path.resolve('client'), configFile: path.resolve('client/vite.config.ts'), cacheDir: path.join(temporary, 'vite-cache'),
    server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: `http://127.0.0.1:${running.port}` } } },
  })
  await vite.listen()
  const address = vite.httpServer!.address()
  if (!address || typeof address === 'string') throw new Error('Missing Vite address')
  origin = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) })
}, 60_000)

async function tree(directory: string, indent = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const lines: string[] = []
  for (const [index, entry] of entries.sort((a, b) => a.name.localeCompare(b.name)).entries()) {
    const last = index === entries.length - 1
    lines.push(`${indent}${last ? '└── ' : '├── '}${entry.name}${entry.isDirectory() ? '/' : ''}`)
    if (entry.isDirectory()) lines.push(...await tree(path.join(directory, entry.name), `${indent}${last ? '    ' : '│   '}`))
  }
  return lines
}

afterAll(async () => {
  await browser?.close(); await vite?.close()
  if (api) await new Promise<void>(resolve => api.close(() => resolve()))
  if (evidence) {
    await writeFile(path.join(evidence, 'requests.log'), exchangeLog.join('\n') + '\n')
    await writeFile(path.join(evidence, 'notes-tree.txt'), ['<temporary data directory>/notes/', ...await tree(notes)].join('\n') + '\n')
  }
  if (temporary) await rm(temporary, { recursive: true, force: true })
})

async function log(response: Response) {
  const request = response.request()
  const url = new URL(request.url())
  exchangeLog.push(`>> ${request.method()} ${url.pathname}${url.search}${request.postData() ? ` ${request.postData()}` : ''}`,
    `<< ${response.status()} ${JSON.stringify(await response.json())}`)
}

async function device(email?: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: 'UTC' })
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())
  if (email) {
    const response = await context.request.post(`${origin}/api/v1beta/auth/fake-login`, { data: { email } })
    expect(response.ok()).toBe(true)
  }
  return context.newPage()
}

const pinned = (page: Page) => page.getByRole('region', { name: 'Pinned notes' })
const daily = (page: Page) => page.getByRole('region', { name: 'Daily notes' })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Pin note' })

async function expectAnchoredPin(page: Page, trigger: ReturnType<Page['locator']>, side: 'above' | 'below') {
  await expect.poll(async () => {
    const anchor = await trigger.boundingBox()
    const box = await dialog(page).boundingBox()
    if (!anchor || !box) return false
    const { width, height } = page.viewportSize()!
    const gap = side === 'above' ? anchor.y - (box.y + box.height) : box.y - (anchor.y + anchor.height)
    return gap >= 5 && gap <= 7 && box.x >= 7 && box.y >= 7
      && box.x + box.width <= width - 7 && box.y + box.height <= height - 7
      && box.x <= anchor.x + anchor.width && box.x + box.width >= anchor.x
  }).toBe(true)
}

async function openDay(page: Page, date: string, email?: string) {
  await page.clock.setFixedTime(new Date(`${date}T12:00:00Z`))
  const loading = email ? page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).searchParams.get('includePins') === 'true') : undefined
  await page.goto(`${origin}/daily`)
  if (loading) {
    const response = await loading
    expect(response.status()).toBe(201)
    exchangeLog.push(`\n[${email} opens ${date}]`)
    await log(response)
  }
  await daily(page).locator('.note.active .cm-content').waitFor()
}

async function screenshot(page: Page, name: string) {
  if (evidence) await page.screenshot({ path: path.join(evidence, 'screenshots', `${name}.png`), animations: 'disabled' })
}

async function openPin(page: Page, index: number, title: string) {
  const card = daily(page).locator('.note').nth(index)
  await card.locator('header').click()
  await card.locator('.cm-content').fill(`# ${title}\n\nThis note stays in its original workspace.`)
  await card.getByRole('button', { name: `Pin ${title}`, exact: true }).click()
}

async function pin(page: Page, button: string, period: string, remote = true) {
  const saving = remote ? page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/pin')) : undefined
  await dialog(page).getByRole('button', { name: button, exact: true }).click()
  if (saving) {
    const response = await saving
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ period })
    await log(response)
  }
  await dialog(page).waitFor({ state: 'hidden' })
  await page.getByText(`Pinned for the rest of this ${period}.`).waitFor()
}

async function visiblePins(page: Page, titles: string[]) {
  await expect.poll(async () => pinned(page).locator('.note-heading strong').allTextContents()).toEqual(titles)
  if (!titles.length) expect(await pinned(page).count()).toBe(0)
}

it('pins for calendar periods, remembers Sunday or Monday per account, and expires pins on a new device', async () => {
  const sunday = 'sunday@example.com'
  const page = await device(sunday)
  await openDay(page, '2026-07-18', sunday)
  const bottomPin = daily(page).locator('.note').last().getByRole('button', { name: 'Pin Untitled note', exact: true })
  await bottomPin.click()
  await page.setViewportSize({ width: 320, height: 600 })
  await expectAnchoredPin(page, bottomPin, 'above')
  await screenshot(page, '14-mobile-pin-menu')
  await page.keyboard.press('Escape')
  await dialog(page).waitFor({ state: 'hidden' })
  expect(await bottomPin.evaluate(button => button === document.activeElement)).toBe(true)
  await page.setViewportSize({ width: 1280, height: 800 })
  await openPin(page, 0, 'Weekly planning')
  const weeklyPin = daily(page).getByRole('button', { name: 'Pin Weekly planning', exact: true })
  await expectAnchoredPin(page, weeklyPin, 'below')
  await screenshot(page, '01-pin-options')
  const preference = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/pin-preference'))
  await dialog(page).getByRole('button', { name: 'This week' }).click()
  await page.getByRole('heading', { name: 'When does your week start?' }).waitFor()
  await log(await preference)
  await expectAnchoredPin(page, weeklyPin, 'below')
  await screenshot(page, '02-first-week-preference')
  await pin(page, 'Sunday', 'week')
  await openPin(page, 1, 'July checklist')
  await pin(page, 'This month', 'month')
  await openPin(page, 2, '2026 goals')
  await pin(page, 'This year', 'year')
  await visiblePins(page, ['Weekly planning', 'July checklist', '2026 goals'])
  expect(await pinned(page).evaluate(section => section.previousElementSibling?.getAttribute('aria-label'))).toBe('Daily notes')
  await pinned(page).getByRole('button', { name: /2026 goals/ }).click()
  await pinned(page).locator('.note.active').getByText('This note stays in its original workspace.').waitFor()
  await screenshot(page, '03-all-periods-expanded')
  await page.setViewportSize({ width: 390, height: 740 })
  await screenshot(page, '04-mobile-pins')
  await page.context().close()

  const another = await device(sunday)
  await openDay(another, '2026-07-18', sunday)
  await visiblePins(another, ['Weekly planning', 'July checklist', '2026 goals'])
  await openPin(another, 3, 'Another weekly note')
  const remembered = another.waitForResponse(response => new URL(response.url()).pathname.endsWith('/pin-preference'))
  const repeatPin = pin(another, 'This week', 'week')
  await log(await remembered)
  await repeatPin
  await screenshot(another, '05-week-preference-reused')
  await openDay(another, '2026-07-19', sunday)
  await visiblePins(another, ['July checklist', '2026 goals'])
  await screenshot(another, '06-sunday-week-expired')
  await openDay(another, '2026-08-01', sunday)
  await visiblePins(another, ['2026 goals'])
  await screenshot(another, '07-month-expired')
  await openDay(another, '2027-01-01', sunday)
  await visiblePins(another, [])
  await screenshot(another, '08-year-expired')
  await another.context().close()

  const monday = 'monday@example.com'
  const other = await device(monday)
  await openDay(other, '2026-07-18', monday)
  await openPin(other, 0, 'Monday-start week')
  await dialog(other).getByRole('button', { name: 'This week' }).click()
  await pin(other, 'Monday', 'week')
  await openDay(other, '2026-07-19', monday)
  await visiblePins(other, ['Monday-start week'])
  await screenshot(other, '09-monday-week-active-on-sunday')
  await openDay(other, '2026-07-20', monday)
  await visiblePins(other, [])
  await screenshot(other, '10-monday-week-expired')
  await other.context().close()
}, 75_000)

it('keeps an anonymous pin across reload and backs it up on sign-in', async () => {
  const email = 'browser-backup@example.com'
  const page = await device()
  await openDay(page, '2026-07-18')
  await openPin(page, 0, 'Browser-only July note')
  await pin(page, 'This month', 'month', false)
  await page.reload()
  await visiblePins(page, ['Browser-only July note'])
  await screenshot(page, '11-anonymous-pin-reloaded')

  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill(email)
  const backup = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/pin'))
  await page.getByRole('button', { name: 'Fake log in (dev only)' }).click()
  await log(await backup)
  await visiblePins(page, ['Browser-only July note'])
  const another = await device(email)
  await openDay(another, '2026-07-19', email)
  await visiblePins(another, ['Browser-only July note'])
  await screenshot(another, '12-anonymous-pin-backed-up')
  await page.context().close(); await another.context().close()
}, 45_000)

it('pins an older note from All notes without moving its source', async () => {
  const email = 'history@example.com'
  const page = await device(email)
  const today = new Date()
  const recent = new Date(today.getTime() - 86_400_000).toISOString().slice(0, 10)
  const created = await page.request.put(`${origin}/api/v1beta/notes/daily?num=1&date=${recent}`)
  const [id] = await created.json()
  const saved = await page.request.post(`${origin}/api/v1beta/notes/${id}`, { data: { content: '# A note from history' } })
  expect(saved.ok()).toBe(true)
  await page.clock.setFixedTime(today)
  await page.goto(`${origin}/`)
  await page.getByRole('button', { name: 'Pin A note from history' }).click()
  const saving = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/pin'))
  await dialog(page).getByRole('button', { name: 'This year' }).click()
  await log(await saving)
  const confirmation = page.getByText('Pinned for the rest of this year.')
  await confirmation.waitFor()
  await screenshot(page, '13-pin-from-history')
  await page.getByRole('link', { name: 'Open Daily' }).click()
  await visiblePins(page, ['A note from history'])
  await page.context().close()
}, 30_000)
