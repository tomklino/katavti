import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStore } from '@/store'

const api = {
  list: vi.fn().mockResolvedValue([]),
  createDaily: vi.fn(async (count: number, date: string) => Array.from({ length: count }, (_, i) => `${date}-${i}`)),
  read: vi.fn().mockResolvedValue({ content: '', ISODateString: '2026-01-01T00:00:00.000Z', tags: [] }),
  update: vi.fn().mockResolvedValue('saved'),
  importNote: vi.fn(),
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks() })

describe('browser-local daily rollover', () => {
  it('warns immediately when typing in an expired daily set, but not just because midnight passed', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 23, 59))
    const store = createStore(api, api)
    await store.dispatch('loadDaily', 4)
    const id = store.state.dailyIds[0]
    store.commit('setNoteContent', { id, content: 'Before midnight' })
    expect(store.state.previousDayWarning).toBe(false)
    vi.setSystemTime(new Date(2026, 0, 2, 0, 1))
    expect(store.state.previousDayWarning).toBe(false)
    store.commit('setNoteContent', { id, content: 'After midnight' })
    expect(store.state.previousDayWarning).toBe(true)
    expect(store.state.dailyIds[0]).toBe(id)
    expect(store.state.notes[id].content).toBe('After midnight')
  })

  it('requests the browser calendar day, not the UTC day, on both sides of midnight', async () => {
    vi.useFakeTimers()
    const store = createStore(api, api)
    // Simulate the calendar getters of a browser in Los Angeles, independently
    // of the timezone of the machine running the tests. UTC is January 2.
    vi.setSystemTime(new Date('2026-01-02T07:59:00Z'))
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026)
    vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(0)
    const day = vi.spyOn(Date.prototype, 'getDate').mockReturnValue(1)
    await store.dispatch('loadDaily', 4)
    expect(api.createDaily).toHaveBeenLastCalledWith(4, '2026-01-01')
    vi.setSystemTime(new Date('2026-01-02T08:01:00Z'))
    day.mockReturnValue(2)
    await store.dispatch('loadDaily', 4)
    expect(api.createDaily).toHaveBeenLastCalledWith(4, '2026-01-02')
  })
})
