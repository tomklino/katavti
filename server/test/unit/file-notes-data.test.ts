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
