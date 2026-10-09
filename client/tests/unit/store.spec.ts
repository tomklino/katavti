import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from '@/store'

const api = {
  list: vi.fn(),
  read: vi.fn(),
  update: vi.fn(),
  createDaily: vi.fn(),
  importNote: vi.fn(),
}

beforeEach(() => {
  api.list.mockResolvedValue(['note-1'])
  api.read.mockResolvedValue({ content: '# Note', ISODateString: '2026-09-25T00:00:00.000Z', tags: [] })
  api.update.mockResolvedValue('note-1')
  api.createDaily.mockResolvedValue(['note-1'])
  vi.clearAllMocks()
})

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return { length: 0, clear: () => values.clear(), getItem: key => values.get(key) ?? null, key: () => null, removeItem: key => { values.delete(key) }, setItem: (key, value) => { values.set(key, value) } }
}

describe('notes Vuex store', () => {
  it('loads IDs and note entities using the mocked API', async () => {
    const store = createStore(api, api)
    await store.dispatch('loadNotes')
    expect(api.list).toHaveBeenCalledWith({ days: 5 })
    expect(store.state.noteIds).toEqual(['note-1'])
    expect(store.state.notes['note-1'].content).toBe('# Note')
  })

  it('saves an edited note through the mocked API', async () => {
    const store = createStore(api, api)
    await store.dispatch('saveNote', { id: 'note-1', content: 'changed' })
    expect(api.update).toHaveBeenCalledWith('note-1', 'changed')
  })

  it('keeps one save in flight and replaces the single queued save with the latest edit', async () => {
    let finishFirst!: () => void
    api.update
      .mockImplementationOnce(() => new Promise<string>(resolve => { finishFirst = () => resolve('note-1') }))
      .mockResolvedValue('note-1')
    const store = createStore(api, api)
    store.commit('setNote', { id: 'note-1', note: { content: 'initial', ISODateString: '', tags: [] } })

    const first = store.dispatch('saveNote', { id: 'note-1', content: 'first' })
    await Promise.resolve()
    const replaced = store.dispatch('saveNote', { id: 'note-1', content: 'second' })
    const latest = store.dispatch('saveNote', { id: 'note-1', content: 'latest' })

    expect(api.update).toHaveBeenCalledTimes(1)
    expect(store.state.notes['note-1'].content).toBe('latest')
    expect(store.state.unsavedNotes['note-1']).toBe(true)

    finishFirst()
    await Promise.all([first, replaced, latest])

    expect(api.update.mock.calls).toEqual([
      ['note-1', 'first'],
      ['note-1', 'latest'],
    ])
    expect(store.state.notes['note-1'].content).toBe('latest')
    expect(store.state.unsavedNotes['note-1']).toBe(false)
  })

  it('retries a failed save', async () => {
    vi.useFakeTimers()
    api.update
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValue('note-1')
    const store = createStore(api, api)
    store.commit('setNote', { id: 'note-1', note: { content: 'initial', ISODateString: '', tags: [] } })

    const save = store.dispatch('saveNote', { id: 'note-1', content: 'latest' })
    await vi.runAllTimersAsync()
    await save

    expect(api.update.mock.calls).toEqual([
      ['note-1', 'latest'],
      ['note-1', 'latest'],
    ])
    expect(store.state.unsavedNotes['note-1']).toBe(false)
    vi.useRealTimers()
  })

  it('preserves the base revision through typing and advances it between queued saves', async () => {
    const remote = {
      ...api,
      read: vi.fn().mockResolvedValue({ content: 'Original', ISODateString: '', tags: [], revision: 'r1' }),
      update: vi.fn().mockResolvedValueOnce({ id: 'note-1', revision: 'r2' }).mockResolvedValueOnce({ id: 'note-1', revision: 'r3' }),
    }
    const store = createStore(remote, api)
    store.commit('setUser', { email: 'alice@example.com' })
    await store.dispatch('loadNotes')
    store.commit('setNoteContent', { id: 'note-1', content: 'First' })
    expect(store.state.notes['note-1'].revision).toBe('r1')
    await store.dispatch('saveNote', { id: 'note-1', content: 'First' })
    await store.dispatch('saveNote', { id: 'note-1', content: 'Second' })
    expect(remote.update.mock.calls).toEqual([['note-1', 'First', 'r1'], ['note-1', 'Second', 'r2']])
    expect(store.state.notes['note-1'].revision).toBe('r3')
  })

  it('reports conflicts immediately, keeps the draft unsaved, and never retries stale writes', async () => {
    vi.useFakeTimers()
    try {
      const conflict = Object.assign(new Error('This note changed on another device. Your draft is not saved.'), { status: 409 })
      const remote = { ...api, update: vi.fn().mockRejectedValue(conflict) }
      const local = { ...api, update: vi.fn().mockResolvedValue({ id: 'note-1' }) }
      const store = createStore(remote, local)
      store.commit('setUser', { email: 'alice@example.com' })
      store.commit('setNote', { id: 'note-1', note: { content: 'Original', ISODateString: '', tags: [], revision: 'old' } })
      const save = store.dispatch('saveNote', { id: 'note-1', content: 'Laptop draft' })
      const rejected = expect(save).rejects.toThrow(conflict.message)
      await vi.runAllTimersAsync()
      await rejected
      expect(remote.update).toHaveBeenCalledTimes(1)
      expect(store.state.notes['note-1'].content).toBe('Laptop draft')
      expect(store.state.notes['note-1'].revision).toBe('old')
      expect(store.state.unsavedNotes['note-1']).toBe(true)
      expect(store.state.saveErrors['note-1']).toMatch(/changed.*device/i)
    } finally { vi.useRealTimers() }
  })

  it('backs up pre-login notes and keeps them visible after login', async () => {
    const storage = memoryStorage()
    const localApi = {
      list: vi.fn().mockResolvedValue(['local-note']),
      read: vi.fn().mockResolvedValue({ content: '# Before login', ISODateString: '2026-09-25T00:00:00.000Z', tags: [] }),
      update: vi.fn(), createDaily: vi.fn(),
    }
    storage.setItem('katavti.notes.v1', JSON.stringify({
      'local-note': { content: '# Before login', ISODateString: '2026-09-25T00:00:00.000Z', tags: [] },
    }))
    api.list.mockResolvedValue([])
    api.read.mockRejectedValue(new Error('missing'))
    api.importNote.mockResolvedValue({ id: 'imported-note', note: { content: '# Before login', ISODateString: '', tags: [], revision: 'r1' } })
    const store = createStore(api, localApi as any, storage)

    await store.dispatch('completeLogin', { email: 'alice@example.com' })

    expect(api.importNote).toHaveBeenCalledWith('local-note', '# Before login')
    expect(store.state.noteIds).toEqual(['local-note'])
    expect(store.state.notes['local-note'].content).toBe('# Before login')
    expect(store.state.backupStatus).toBe('1 local note backed up.')
  })
})
