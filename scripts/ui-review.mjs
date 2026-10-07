// Reproducible browser review against an already-running Vue dev server.
// Usage: node scripts/ui-review.mjs
// Optional: KATAVTI_UI_URL=http://localhost:8082 CHROME_PATH=/usr/bin/google-chrome
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const url = process.env.KATAVTI_UI_URL || 'http://localhost:8082'
const output = new URL('../.ui-review/', import.meta.url)
const notes = [
  '# A little room to think\n\nLabel: journal\n\nA place for the ideas that arrive between everything else. Today I want to slow down, write clearly, and leave a useful trail for tomorrow.\n\n## Three things for today\n- [x] Make space for a focused morning\n- [ ] Sketch the next version of Katavti\n- [ ] Take a walk before the afternoon\n\n> Keep the tools quiet. Let the thoughts be the interesting part.\n\n## An idea worth keeping\nA good notebook should make it easier to begin, not give you more things to manage.',
  '# Morning pages\n\nLabel: journal\n\nCoffee, an open window, and twenty minutes with no notifications.\n\n- What feels important: finishing one thing well.\n- What can wait: the inbox.\n- A small win: starting here instead of opening another tab.',
  '# Katavti · design notes\n\nLabel: design\n\n## Keep the familiar parts\nOne expanded note at a time. A daily workspace. Markdown that stays portable.\n\n## Make it feel considered\n- Stronger typographic hierarchy\n- Calmer surfaces and breathing room\n- A clear distinction between reading and writing\n\n> A notebook, not a dashboard.',
  '# Weekly planning\n\nLabel: planning\n\n## This week\n- [x] Review the note-taking flow\n- [ ] Compare three visual directions\n- [ ] Share screenshots and collect feedback\n\n## Not this week\nAdding more features just because there is space for them.',
  '# Reading · The Creative Act\n\nLabel: reading\n\nAttention is a practice. The material is already around us; the work is noticing it.\n\n**Question:** what changes when I collect observations instead of conclusions?',
  '# Garden observations\n\nLabel: journal\n\nThe rosemary is thriving, the basil less so. Move the pots toward the morning light.\n\n- [ ] Water the seedlings\n- [ ] Find a larger terracotta pot\n- [x] Photograph the new leaves',
  '# API · save queue investigation\n\nBug: 142\nLabel: engineering\n\nRapid edits should never let an older save overwrite the latest content.\n\n```ts\nconst next = queue.queued\nif (next === null) markSaved()\n```\n\n- [x] Reproduce with delayed requests\n- [ ] Add a regression test',
  '# Meeting · product review\n\nLabel: planning\n\nKeep daily-first writing and lightweight label search. No folders in this iteration.\n\n## Open questions\n1. How much metadata belongs on a collapsed note?\n2. Paper or text editor?\n3. Which direction is easiest to live with every day?',
  '# Weekend somewhere quiet\n\nLabel: personal\n\nA short train ride, a book, and no real itinerary.\n\n## Pack light\n- Notebook and a pen\n- Walking shoes\n- Camera',
  '# Recipe · lemon & olive oil cake\n\nLabel: personal\n\n## Ingredients\n- 3 eggs\n- 180g sugar\n- 120ml olive oil\n- Zest of two lemons\n- 200g flour\n\nWhisk, fold gently, and bake at **175°C** until golden.',
  '# Things I want to learn\n\nLabel: learning\n\n- A better cup of filter coffee\n- The names of the trees on our street\n- A little more about bookbinding\n- How to write less, but say more',
  '# End-of-day reflection\n\nLabel: journal\n\n## What moved forward\nA dozen small notes became a clearer picture of the week.\n\n## Tomorrow\nReturn to the sketches with fresh eyes. Keep the simplest parts.',
]

await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  channel: process.env.CHROME_PATH ? undefined : 'chrome',
  executablePath: process.env.CHROME_PATH,
})
// A fresh context keeps real notes and sessions completely untouched.
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
const capture = async name => {
  await page.waitForTimeout(250) // Allow theme transitions to settle before capturing.
  await page.screenshot({ path: new URL(`${name}.png`, output).pathname })
}
const choose = async theme => {
  await page.getByRole('combobox', { name: 'Color theme', exact: true }).selectOption(theme)
  assert.equal(await page.locator('[data-theme]').getAttribute('data-theme'), theme)
}
const activateDaily = async index => {
  const note = page.locator('.note').filter({ has: page.locator('.note-number', { hasText: new RegExp(`^${String(index + 1).padStart(2, '0')}$`) }) })
  while (!await note.count()) await page.getByRole('button', { name: 'Next daily notes', exact: true }).click()
  await note.locator('header').click()
}
const fixedDaily = async () => {
  const sizes = await page.locator('.notes').evaluate(element => ({ height: element.clientHeight, scroll: element.scrollHeight, overflow: getComputedStyle(element).overflowY }))
  assert.equal(sizes.overflow, 'hidden')
  assert.ok(sizes.scroll <= sizes.height + 1, `Daily collection overflows: ${JSON.stringify(sizes)}`)
  assert.equal(await page.locator('.note.active').count(), 1)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), page.viewportSize().width)
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight), page.viewportSize().height)
}

try {
  await page.goto(`${url}/daily`)
  await page.locator('.note').first().waitFor()
  for (let index = 0; index < notes.length; index++) {
    if (index >= 4) await page.getByRole('button', { name: 'Add note', exact: true }).click()
    await activateDaily(index)
    await page.locator('.note.active .cm-content').fill(notes[index])
  }
  await page.waitForTimeout(2300)
  await page.reload()
  await page.locator('.note').first().waitFor()
  assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('katavti.notes.v1'))).length), 12)
  assert.equal(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('katavti.notes.v1')))[0].content), notes[0])
  await page.evaluate(() => sessionStorage.setItem('katavti.storage-warning-dismissed', '1'))
  if (await page.getByRole('button', { name: 'Dismiss message' }).count()) await page.getByRole('button', { name: 'Dismiss message' }).click()

  for (const theme of ['light', 'dark']) {
    const design = `final-${theme}`
    await choose(theme)
    await page.reload()
    await page.locator('.note').first().waitFor()
    assert.equal(await page.locator('[data-theme]').getAttribute('data-theme'), theme)
    await page.getByRole('link', { name: /^All notes/ }).click()
    await page.waitForTimeout(150)
    assert.equal(await page.locator('.note').count(), 12)
    assert.equal(await page.locator('.note.active.browsing').count(), 12)
    assert.equal(await page.locator('.note-body[aria-hidden="false"]').count(), 12)
    assert.ok(await page.locator('.notes').evaluate(element => element.scrollHeight > element.clientHeight))
    assert.ok(await page.locator('.note-body').evaluateAll(elements => elements.every(element => element.scrollHeight <= element.clientHeight + 1)))
    await capture(`${design}-history`)
    await page.locator('.notes').evaluate(element => { element.scrollTop = element.scrollHeight })
    await capture(`${design}-history-bottom`)
    await page.locator('.notes').evaluate(element => { element.scrollTop = 0 })
    await page.getByRole('textbox', { name: 'Search label', exact: true }).fill('planning')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await page.waitForTimeout(150)
    assert.equal(await page.locator('.note').count(), 2)
    await capture(`${design}-label-search`)
    await page.getByRole('textbox', { name: 'Search label', exact: true }).fill('not-a-label')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await page.getByRole('heading', { name: 'No thoughts with that label.' }).waitFor()
    await capture(`${design}-empty-search`)
    await page.getByRole('button', { name: 'Clear label filter', exact: true }).click()
    await page.getByRole('link', { name: /^Daily/ }).click()
    await page.locator('.note.active .cm-content').waitFor()
    await fixedDaily()
    await capture(`${design}-daily-raw`)
    await page.locator('.raw-toggle input').uncheck()
    await capture(`${design}-daily-preview`)
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
    await capture(`${design}-login`)
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(150)
    await fixedDaily()
    await capture(`${design}-mobile`)
    while (await page.getByRole('button', { name: 'Next daily notes', exact: true }).count() && await page.getByRole('button', { name: 'Next daily notes', exact: true }).isEnabled()) {
      await page.getByRole('button', { name: 'Next daily notes', exact: true }).click()
      await fixedDaily()
    }
    await page.getByRole('link', { name: /^All notes/ }).click()
    await page.locator('.note.browsing').first().waitFor()
    assert.equal(await page.locator('.note.active.browsing').count(), 12)
    await capture(`${design}-mobile-history`)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390)
    await page.setViewportSize({ width: 1440, height: 1080 })
  }
  // Raw historical notes also grow naturally instead of adding nested scroll areas.
  await page.locator('.raw-toggle input').first().check()
  assert.ok(await page.locator('.note-body').first().evaluate(element => element.scrollHeight <= element.clientHeight + 1))
  await page.locator('.raw-toggle input').first().uncheck()

  // A long draft survives a theme switch and only the editor text scrolls.
  await page.getByRole('link', { name: /^Daily/ }).click()
  await page.locator('.note.active .cm-content').waitFor()
  const longDraft = `${notes[0]}\n\n${'A long draft stays inside the writing area.\n'.repeat(100)}`
  await page.locator('.note.active .cm-content').fill(longDraft)
  const draftText = await page.locator('.note.active .cm-content').innerText()
  await choose('light')
  assert.equal(await page.locator('.note.active .cm-content').innerText(), draftText)
  assert.ok(await page.locator('.note.active .cm-scroller').evaluate(element => element.scrollHeight > element.clientHeight))
  await fixedDaily()
  await page.waitForTimeout(2300)
  assert.equal(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('katavti.notes.v1')))[0].content), longDraft)
  await page.locator('.note.active .cm-content').fill(notes[0])
  await page.waitForTimeout(2300)
  await page.getByRole('combobox', { name: 'Color theme', exact: true }).selectOption('system')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForFunction(() => document.querySelector('#app').dataset.theme === 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await page.waitForFunction(() => document.querySelector('#app').dataset.theme === 'light')
  assert.equal(await page.locator('.design-toggle').count(), 0)
  assert.equal(await page.locator('.workspace-heading').count(), 0)
  assert.deepEqual(errors, [])
  await writeFile(new URL('mock-notes.json', output), await page.evaluate(() => localStorage.getItem('katavti.notes.v1')))
  const views = ['history', 'history-bottom', 'daily-raw', 'daily-preview', 'label-search', 'empty-search', 'login', 'mobile', 'mobile-history']
  const gallery = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Katavti · Design review</title>
<style>body{background:#f3f4ef;color:#30372e;font:15px/1.6 system-ui;margin:40px}h1{font-size:36px;letter-spacing:-.04em}nav{display:flex;gap:16px;flex-wrap:wrap;margin:24px 0}a{color:#476642}section{margin:40px 0}h2{font-weight:500}div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}figure{margin:0}img{width:100%;border:1px solid #d4dace;border-radius:8px;background:white}figcaption{margin-bottom:10px;font-size:13px}@media(max-width:800px){body{margin:20px}div{grid-template-columns:1fr}}</style>
<h1>A quieter notebook.</h1><p>Ink layout. Studio light colors. Original Ink dark colors.<br>Daily fills the viewport; All Notes expands into a scrolling reading feed.<br>12 mock notes created through the UI. Desktop: 1440 × 1080. Mobile: 390 × 844.</p>
<nav>${views.map(view => `<a href="#${view}">${view.replaceAll('-', ' ')}</a>`).join('')}<a href="before-history.png">Before</a></nav>
${views.map(view => `<section id="${view}"><h2>${view.replaceAll('-', ' ')}</h2><div>${['final-light', 'final-dark'].map(design => `<figure><figcaption>${design.toUpperCase()}</figcaption><a href="${design}-${view}.png"><img loading="lazy" src="${design}-${view}.png" alt="${design} — ${view}"></a></figure>`).join('')}</div></section>`).join('')}
</html>`
  await writeFile(new URL('index.html', output), gallery)
  console.log('PASS: 12 notes created through the UI, saves and themes survive reload, expanded All Notes, fixed-height Daily with page access, label/empty results, mobile overflow, and 18 light/dark screenshots. No page errors. Gallery: .ui-review/index.html')
} finally {
  await browser.close()
}
