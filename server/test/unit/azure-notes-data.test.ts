import { describe, expect, it } from 'vitest'
import { createAzureNotesData } from '../../src/data-modules/azure-notes-data.js'

const now = new Date('2026-09-25T12:00:00.000Z')

type Blob = { content: string; etag: string }

function fakeContainer(initial: Record<string, string> = {}) {
  let version = 0
  const blobs = new Map<string, Blob>(Object.entries(initial).map(([name, content]) => [name, { content, etag: `"${++version}"` }]))
  return {
    blobs,
    async createIfNotExists() {},
    getBlockBlobClient(name: string) {
      return {
        async upload(content: string, length: number, options?: { conditions?: { ifNoneMatch?: string; ifMatch?: string } }) {
          if (options?.conditions?.ifNoneMatch === '*' && blobs.has(name)) {
            throw Object.assign(new Error('exists'), { statusCode: 412, code: 'ConditionNotMet' })
          }
          if (options?.conditions?.ifMatch && blobs.get(name)?.etag !== options.conditions.ifMatch) {
            throw Object.assign(new Error('changed'), { statusCode: 412, code: 'ConditionNotMet' })
          }
          const etag = `"${++version}"`
          blobs.set(name, { content: content.slice(0, length), etag })
          return { etag }
        },
        async download() {
          const blob = blobs.get(name)
          if (!blob) throw Object.assign(new Error('missing'), { statusCode: 404 })
          return { etag: blob.etag, readableStreamBody: (async function* () { yield Buffer.from(blob.content) })() }
        },
        async downloadToBuffer() {
          const blob = blobs.get(name)
          if (!blob) throw Object.assign(new Error('missing'), { statusCode: 404 })
          return Buffer.from(blob.content)
        },
      }
    },
    async *listBlobsFlat(options?: { prefix?: string }) {
      for (const name of [...blobs.keys()].sort()) {
        if (!options?.prefix || name.startsWith(options.prefix)) yield { name }
      }
    },
  }
}

function createData(container = fakeContainer()) {
  return { data: createAzureNotesData({ container, now: () => now }), container }
}

describe('Azure notes data', () => {
  it('creates the requested daily notes', async () => {
    const { data, container } = createData()

    const ids = await data.createDaily('alice@example.com', 2, '2026-09-25')

    expect(ids).toEqual([
      encodeURIComponent('2026/september.d/workspaces-2026-09-25/workspace-1.md'),
      encodeURIComponent('2026/september.d/workspaces-2026-09-25/workspace-2.md'),
    ])
    expect([...container.blobs.keys()]).toEqual([
      'alice@example.com/2026/september.d/workspaces-2026-09-25/workspace-1.md',
      'alice@example.com/2026/september.d/workspaces-2026-09-25/workspace-2.md',
    ])
  })

  it('updates and reads a note', async () => {
    const { data, container } = createData()
    const [id] = await data.createDaily('alice@example.com', 1, '2026-09-25')

    expect(await data.update('alice@example.com', id, '# changed')).toBe(decodeURIComponent(id))
    expect(container.blobs.get(`alice@example.com/${decodeURIComponent(id)}`)?.content).toBe('# changed')
    expect(await data.read('alice@example.com', id)).toMatchObject({
      content: '# changed', ISODateString: '2026-09-25T00:00:00.000Z', tags: [], revision: expect.any(String),
    })
  })

  it('lists recent notes and filters by bug label', async () => {
    const { data } = createData()
    const [recent] = await data.createDaily('alice@example.com', 1, '2026-09-25')
    const [old] = await data.createDaily('alice@example.com', 1, '2026-09-01')
    await data.update('alice@example.com', recent, 'Bug: KAT-7')
    await data.update('alice@example.com', old, 'Bug: OLD-1')

    expect(await data.list('alice@example.com', { days: 5 })).toEqual([recent])
    expect(await data.list('alice@example.com', { bug: 'KAT-7' })).toEqual([recent])
  })

  it('does not overwrite existing notes when creating daily notes', async () => {
    const { data } = createData()
    const ids = await data.createDaily('alice@example.com', 2, '2026-09-25')
    await data.update('alice@example.com', ids[1], 'keep me')

    expect(await data.createDaily('alice@example.com', 1, '2026-09-25')).toEqual(ids)
    expect((await data.read('alice@example.com', ids[1])).content).toBe('keep me')
  })

  it('atomically rejects stale and unversioned overwrites using blob conditions', async () => {
    const { data } = createData()
    const [id] = await data.createDaily('alice', 1, '2026-09-25')
    const { revision } = await data.read('alice', id)
    const writes = await Promise.allSettled([
      data.update('alice', id, 'Mobile', revision), data.update('alice', id, 'Laptop', revision),
    ])
    expect(writes.filter(write => write.status === 'fulfilled')).toHaveLength(1)
    expect((writes.find(write => write.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ status: 409 })
    await expect(data.update('alice', id, 'No revision')).rejects.toMatchObject({ status: 409 })
    await expect(data.update('alice', id, 'Stale', revision)).rejects.toMatchObject({ status: 409 })
  })

  it('renames concurrent imports with create-only conditions, preserving originals and dates', async () => {
    const { data, container } = createData()
    const ids = await data.createDaily('alice', 2, '2026-09-01')
    await data.update('alice', ids[0], 'Account note')
    const other = createAzureNotesData({ container, now: () => now })
    const imported = await Promise.all([data.importNote('alice', ids[0], 'Draft A'), other.importNote('alice', ids[0], 'Draft B')])
    expect(new Set(imported.map(note => note.id)).size).toBe(2)
    for (const result of imported) {
      expect(ids).not.toContain(result.id)
      expect(result.note.ISODateString).toBe('2026-09-01T00:00:00.000Z')
    }
    expect((await data.read('alice', ids[0])).content).toBe('Account note')
    expect((await data.read('alice', ids[1])).content).toBe('')
  })

  it('translates missing blobs and rejects invalid identifiers', async () => {
    const { data } = createData()
    const id = encodeURIComponent('2026/september.d/workspaces-2026-09-25/workspace-1.md')

    await expect(data.read('alice@example.com', id)).rejects.toMatchObject({ status: 404 })
    await expect(data.read('alice', '../../secret.md')).rejects.toMatchObject({ status: 400 })
  })
})
