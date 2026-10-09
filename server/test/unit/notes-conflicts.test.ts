import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFileNotesData } from '../../src/data-modules/file-notes-data.js'

let dataDir: string
const user = 'alice@example.com'
beforeEach(async () => { dataDir = await mkdtemp(path.join(tmpdir(), 'katavti-conflicts-')) })
afterEach(async () => { await rm(dataDir, { recursive: true, force: true }) })
const data = () => createFileNotesData({ dataDir })

describe('filesystem optimistic concurrency and imports', () => {
  it('returns a revision on read and rejects a stale revision without changing content', async () => {
    const notes = data()
    const [id] = await notes.createDaily(user, 1, '2026-10-09')
    const original = await notes.read(user, id)
    expect(original.revision).toEqual(expect.any(String))
    const write = await notes.update(user, id, 'Mobile change', original.revision)
    expect(write.revision).not.toBe(original.revision)
    await expect(notes.update(user, id, 'Stale laptop change', original.revision)).rejects.toMatchObject({ status: 409 })
    expect((await notes.read(user, id)).content).toBe('Mobile change')
  })

  it('allows only one concurrent writer, including separate data-module instances', async () => {
    const notes = data()
    const [id] = await notes.createDaily(user, 1, '2026-10-09')
    const { revision } = await notes.read(user, id)
    const writes = await Promise.allSettled([
      notes.update(user, id, 'First', revision), data().update(user, id, 'Second', revision),
    ])
    expect(writes.filter(write => write.status === 'fulfilled')).toHaveLength(1)
    const rejected = writes.find(write => write.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toMatchObject({ status: 409 })
  })

  it('does not let unversioned writes bypass conflict checks on nonempty notes', async () => {
    const notes = data()
    const [id] = await notes.createDaily(user, 1, '2026-10-09')
    await notes.update(user, id, 'Existing content')
    await expect(notes.update(user, id, 'No revision')).rejects.toMatchObject({ status: 409 })
    expect((await notes.read(user, id)).content).toBe('Existing content')
  })

  it('rejects a versioned save when the note no longer exists', async () => {
    const notes = data()
    const [id] = await notes.createDaily(user, 1, '2026-10-09')
    const { revision } = await notes.read(user, id)
    await rm(path.join(dataDir, user, decodeURIComponent(id)))
    await expect(notes.update(user, id, 'Recreate stale note', revision)).rejects.toMatchObject({ status: 409 })
  })

  it('imports to unique IDs, preserves occupied empty slots, and keeps Markdown and date', async () => {
    const notes = data()
    const ids = await notes.createDaily(user, 2, '2026-09-18')
    await notes.update(user, ids[0], 'Account content')
    const imported = await Promise.all([
      notes.importNote(user, ids[0], '# Draft A\nLabel: import'),
      data().importNote(user, ids[0], '# Draft B\nLabel: import'),
    ])
    expect(new Set(imported.map(note => note.id)).size).toBe(2)
    for (const result of imported) {
      expect(ids).not.toContain(result.id)
      expect(result.note.ISODateString).toBe('2026-09-18T00:00:00.000Z')
      expect(result.note.content).toContain('Label: import')
      expect((await notes.read(user, result.id)).content).toBe(result.note.content)
    }
    expect((await notes.read(user, ids[0])).content).toBe('Account content')
    expect((await notes.read(user, ids[1])).content).toBe('')
    expect(await notes.list(user, { bug: 'import' })).toHaveLength(2)
  })

  it('validates import paths just like normal note paths', async () => {
    await expect(data().importNote(user, '../../escape.md', 'Draft')).rejects.toMatchObject({ status: 400 })
  })
})
