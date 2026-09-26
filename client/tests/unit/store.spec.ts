import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from '@/store'

const api = {
  list: vi.fn(),
  read: vi.fn(),
  update: vi.fn(),
  createDaily: vi.fn(),
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
    const store = createStore(api, localApi as any, storage)

    await store.dispatch('completeLogin', { email: 'alice@example.com' })

    expect(api.update).toHaveBeenCalledWith('local-note', '# Before login')
    expect(store.state.noteIds).toEqual(['local-note'])
    expect(store.state.notes['local-note'].content).toBe('# Before login')
    expect(store.state.backupStatus).toBe('1 local note backed up.')
  })
})
