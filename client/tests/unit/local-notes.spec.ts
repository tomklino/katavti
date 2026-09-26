import { describe, expect, it } from 'vitest'
import { backUpLocalNotes, createLocalNotesApi, createSyncedNotesApi } from '@/api/local-notes'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return { length: 0, clear: () => values.clear(), getItem: key => values.get(key) ?? null, key: () => null, removeItem: key => { values.delete(key) }, setItem: (key, value) => { values.set(key, value) } }
}

describe('local notes', () => {
  it('creates and saves date-structured notes in browser storage', async () => {
    const api = createLocalNotesApi(memoryStorage())
    const [id] = await api.createDaily(1, '2026-09-26')
    await api.update(id, '# Local note')
    expect(decodeURIComponent(id)).toBe('2026/september.d/workspaces-2026-09-26/workspace-1.md')
    expect((await api.read(id)).content).toBe('# Local note')
    expect(await api.list({ days: 5 })).toContain(id)
  })

  it('keeps additional notes visible when the daily view reloads its initial count', async () => {
    const api = createLocalNotesApi(memoryStorage())
    const firstLoad = await api.createDaily(5, '2026-09-26')
    await api.update(firstLoad[4], '# Fifth note')

    const reloaded = await api.createDaily(4, '2026-09-26')

    expect(reloaded).toHaveLength(5)
    expect((await api.read(reloaded[4])).content).toBe('# Fifth note')
  })

  it('backs up notes written before login without removing them locally', async () => {
    const storage = memoryStorage()
    const local = createLocalNotesApi(storage)
    const first = encodeURIComponent('2026/september.d/workspaces-2026-09-26/workspace-1.md')
    const second = encodeURIComponent('2026/september.d/workspaces-2026-09-26/workspace-2.md')
    await local.update(first, '# Before login one')
    await local.update(second, '# Before login two')
    const updates: unknown[][] = []
    const remote = { list: async () => [], read: async () => { throw new Error('missing') }, update: async (...args: [string, string]) => { updates.push(args); return args[0] }, createDaily: async () => [] }

    expect(await backUpLocalNotes(remote, storage)).toBe(2)
    expect(updates).toEqual([[first, '# Before login one'], [second, '# Before login two']])
    expect((await local.read(first)).content).toBe('# Before login one')
  })

  it('writes authenticated edits locally and remotely', async () => {
    const local = createLocalNotesApi(memoryStorage())
    const remoteUpdates: unknown[][] = []
    const remote = { list: async () => [], read: async () => { throw new Error('missing') }, update: async (...args: [string, string]) => { remoteUpdates.push(args); return args[0] }, createDaily: async () => [] }
    const api = createSyncedNotesApi(local, remote)
    const id = encodeURIComponent('2026/september.d/workspaces-2026-09-26/workspace-1.md')
    await api.update(id, '# Synced')
    expect((await local.read(id)).content).toBe('# Synced')
    expect(remoteUpdates).toEqual([[id, '# Synced']])
  })
})
