import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('application viewport layout', () => {
  it('lets message bars, header, and notes share exactly one viewport', () => {
    const app = readFileSync('src/App.vue', 'utf8')
    const home = readFileSync('src/views/HomeView.vue', 'utf8')
    const daily = readFileSync('src/views/DailyView.vue', 'utf8')

    expect(app).toContain('html, body, #app { height: 100%; }')
    expect(app).toContain('#app { display: flex; flex-direction: column; min-height: 0; }')
    expect(app).toContain('#app > main { box-sizing: border-box; flex: 1 1 auto;')
    expect(home).not.toContain('100vh')
    expect(daily).not.toContain('100vh')
  })
})
