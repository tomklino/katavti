import { mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFileNotesData } from '../../src/data-modules/file-notes-data.js'

const now = new Date('2026-09-25T12:00:00.000Z')
let dataDir: string

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'katavti-notes-'))
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
})

function createData() {
  return createFileNotesData({ dataDir, now: () => now })
}

describe('filesystem notes data', () => {
  it('stores pins separately, keeps the source live, and respects both year and week boundaries', async () => {
    const data = createData()
    const [id] = await data.createDaily('alice', 1, '2026-07-01')
    expect(await data.getWeekStart('alice')).toBeNull()
    await data.pinNote('alice', id, { period: 'week', date: '2026-12-31', weekStart: 'monday' })
    await data.pinNote('alice', id, { period: 'month', date: '2026-12-31' })
    await data.pinNote('alice', id, { period: 'year', date: '2026-12-31' })
    expect(await data.getWeekStart('alice')).toBe('monday')
    expect(await data.getWeekStart('bob')).toBeNull()
    expect(await data.listPins('bob', '2026-12-31')).toEqual([])
    expect(await data.listPins('alice', '2026-12-30')).toEqual([])
    expect(await data.listPins('alice', '2026-12-31')).toEqual(['week', 'month', 'year'].map(period => ({ id, period })))
    expect(await data.listPins('alice', '2027-01-03')).toEqual([{ id, period: 'week' }])
    expect(await data.listPins('alice', '2027-01-04')).toEqual([])
    expect(JSON.parse(await readFile(path.join(dataDir, 'alice/2027/weekly/1/monday-2026-07-01-july-workspace-1.pin'), 'utf8'))).toEqual({ id: decodeURIComponent(id), date: '2026-12-31' })
    await data.update('alice', id, '# Updated after pinning')
    expect((await data.read('alice', (await data.listPins('alice', '2026-12-31'))[0].id)).content).toBe('# Updated after pinning')
    await expect(data.pinNote('bob', id, { period: 'year', date: '2026-12-31' })).rejects.toMatchObject({ status: 404 })
  })

  it('supports week 53 instead of expiring early at the end of the year', async () => {
    const data = createData()
    const [id] = await data.createDaily('alice', 1, '2028-12-31')
    await data.pinNote('alice', id, { period: 'week', date: '2028-12-31', weekStart: 'monday' })
    expect(await readdir(path.join(dataDir, 'alice/2028/weekly/53'))).toHaveLength(1)
    expect(await data.listPins('alice', '2028-12-31')).toEqual([{ id, period: 'week' }])
    expect(await data.listPins('alice', '2029-01-01')).toEqual([])
  })
  it('creates the requested daily notes', async () => {
    const data = createData()

    const ids = await data.createDaily('alice@example.com', 2, '2026-09-25')

    expect(ids).toEqual([
      encodeURIComponent('2026/september.d/workspaces-2026-09-25/workspace-1.md'),
      encodeURIComponent('2026/september.d/workspaces-2026-09-25/workspace-2.md'),
    ])
    expect(await readdir(path.join(dataDir, 'alice@example.com/2026/september.d/workspaces-2026-09-25')))
      .toEqual(['workspace-1.md', 'workspace-2.md'])
  })

  it('updates a note', async () => {
    const data = createData()
    const [id] = await data.createDaily('alice@example.com', 1, '2026-09-25')

    expect(await data.update('alice@example.com', id, '# changed')).toBe(decodeURIComponent(id))
    expect(await readFile(path.join(dataDir, 'alice@example.com', decodeURIComponent(id)), 'utf8')).toBe('# changed')
  })

  it('reads a note', async () => {
    const data = createData()
    const [id] = await data.createDaily('alice@example.com', 1, '2026-09-25')
    await data.update('alice@example.com', id, '# note')

    expect(await data.read('alice@example.com', id)).toEqual({
      content: '# note',
      revision: expect.any(String),
      ISODateString: '2026-09-25T00:00:00.000Z',
      tags: [],
    })
  })

  it('lists recent non-empty notes and filters by bug label', async () => {
    const data = createData()
    const [recent] = await data.createDaily('alice@example.com', 1, '2026-09-25')
    const [old] = await data.createDaily('alice@example.com', 1, '2026-09-01')
    await data.update('alice@example.com', recent, 'Label: KAT-7')
    await data.update('alice@example.com', old, 'Label: OLD-1')

    expect(await data.list('alice@example.com', { days: 5 })).toEqual([recent])
    expect(await data.list('alice@example.com', { bug: 'KAT-7' })).toEqual([recent])
  })

  it('does not truncate existing daily notes', async () => {
    const data = createData()
    const ids = await data.createDaily('alice@example.com', 2, '2026-09-25')
    await data.update('alice@example.com', ids[1], 'keep me')

    const recreated = await data.createDaily('alice@example.com', 1, '2026-09-25')

    expect(recreated).toEqual(ids)
    expect((await data.read('alice@example.com', ids[1])).content).toBe('keep me')
  })

  it('rejects invalid identifiers', async () => {
    const data = createData()

    await expect(data.read('alice', '../../secret.md')).rejects.toMatchObject({ status: 400 })
    await expect(data.createDaily('../alice', 1)).rejects.toMatchObject({ status: 400 })
  })

  it('rejects symlinks in a note path', async () => {
    const data = createData()
    const userDir = path.join(dataDir, 'alice')
    await symlink(tmpdir(), userDir, 'dir')

    await expect(data.createDaily('alice', 1, '2026-09-25')).rejects.toMatchObject({ status: 400 })
  })
})
