import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('application viewport layout', () => {
  it('uses the bordered k· brand mark as a theme-aware SVG favicon', () => {
    const html = readFileSync('index.html', 'utf8')
    const favicon = readFileSync('public/favicon.svg', 'utf8')
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg">')
    expect(favicon).toContain('>k·</text>')
    expect(favicon).toContain('font-style="italic"')
    expect(favicon).toContain('prefers-color-scheme: dark')
  })

  it('lets message bars, header, and notes share exactly one viewport', () => {
    const app = readFileSync('src/App.vue', 'utf8')
    const home = readFileSync('src/views/HomeView.vue', 'utf8')
    const daily = readFileSync('src/views/DailyView.vue', 'utf8')

    expect(app).toContain('html, body, #app { height: 100%; }')
    expect(app).toContain('#app { display: flex; flex-direction: column; min-height: 0; }')
    expect(app).toContain('#app > main { box-sizing: border-box; flex: 1 1 auto;')
    expect(home).not.toContain('100vh')
    expect(daily).not.toContain('100vh')
    expect(app).not.toContain('workspace-heading')
    expect(app).not.toContain('DevDesignPanel')
    expect(app).toContain('<ThemeToggle v-model="theme" />')
    expect(daily).toContain('overflow: hidden')
    expect(daily).not.toContain('overflow-y: auto')
    expect(home).toContain('overflow-y: auto')
  })
})
