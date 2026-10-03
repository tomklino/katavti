import { describe, expect, it } from 'vitest'
import { createAzureNotesData } from '../../src/data-modules/azure-notes-data.js'

const now = new Date('2026-09-25T12:00:00.000Z')

type Blob = { content: string }

function fakeContainer(initial: Record<string, string> = {}) {
  const blobs = new Map<string, Blob>(Object.entries(initial).map(([name, content]) => [name, { content }]))
  return {
    blobs,
    async createIfNotExists() {},
    getBlockBlobClient(name: string) {
      return {
        async upload(content: string, length: number, options?: { conditions?: { ifNoneMatch?: string } }) {
          if (options?.conditions?.ifNoneMatch === '*' && blobs.has(name)) {
            throw Object.assign(new Error('exists'), { statusCode: 409, code: 'BlobAlreadyExists' })
          }
          blobs.set(name, { content: content.slice(0, length) })
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
    expect(await data.read('alice@example.com', id)).toEqual({
      content: '# changed', ISODateString: '2026-09-25T00:00:00.000Z', tags: [],
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

  it('translates missing blobs and rejects invalid identifiers', async () => {
    const { data } = createData()
    const id = encodeURIComponent('2026/september.d/workspaces-2026-09-25/workspace-1.md')

    await expect(data.read('alice@example.com', id)).rejects.toMatchObject({ status: 404 })
    await expect(data.read('alice', '../../secret.md')).rejects.toMatchObject({ status: 400 })
  })
})
