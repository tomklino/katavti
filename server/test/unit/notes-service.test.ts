import { describe, expect, it, vi } from 'vitest'
import { createNotesService, type FileSystem } from '../../src/services/notes-service.js'

const now = new Date('2026-09-25T12:00:00.000Z')

function mockFs(files: Record<string, string> = {}): FileSystem {
  return {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(async (path) => {
      const value = files[path]
      if (value === undefined) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      return value
    }),
    writeFile: vi.fn(async (path, content) => { files[path] = content }),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn(async (path) => ({ size: files[path]?.length ?? 0 })),
    lstat: vi.fn(async (path) => {
      if (files[path] === undefined) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      return { isSymbolicLink: () => false }
    }),
    touch: vi.fn(async (path) => { files[path] ??= '' }),
  }
}

describe('notes service', () => {
  it('creates the requested daily IDs without truncating notes', async () => {
    const fs = mockFs()
    const service = createNotesService({ dataDir: '/notes', fs, now: () => now })

    const ids = await service.createDaily('alice@example.com', 2, '2026-09-25')

    expect(ids).toEqual([
      encodeURIComponent('2026/september.d/workspaces-2026-09-25/workspace-1.md'),
      encodeURIComponent('2026/september.d/workspaces-2026-09-25/workspace-2.md'),
    ])
    expect(fs.touch).toHaveBeenCalledTimes(2)
  })

  it('returns all existing notes for the day when the initial count is smaller', async () => {
    const fs = mockFs()
    ;(fs.readdir as any).mockResolvedValue(['workspace-1.md', 'workspace-2.md', 'workspace-3.md', 'workspace-4.md', 'workspace-5.md'])
    const service = createNotesService({ dataDir: '/notes', fs, now: () => now })

    const ids = await service.createDaily('alice@example.com', 4, '2026-09-25')

    expect(ids).toHaveLength(5)
    expect(decodeURIComponent(ids[4])).toMatch(/workspace-5\.md$/)
  })

  it('rejects note IDs that escape the user directory', async () => {
    const service = createNotesService({ dataDir: '/notes', fs: mockFs(), now: () => now })
    await expect(service.read('alice', '../../secret.md')).rejects.toMatchObject({ status: 400 })
  })

  it('rejects symlinks within a note path', async () => {
    const fs = mockFs({ '/notes/alice': '' })
    ;(fs.lstat as any).mockImplementation(async (candidate: string) => ({
      isSymbolicLink: () => candidate === '/notes/alice/2026',
    }))
    const service = createNotesService({ dataDir: '/notes', fs, now: () => now })
    const id = '2026/september.d/workspaces-2026-09-25/workspace-1.md'

    await expect(service.read('alice', id)).rejects.toMatchObject({ status: 400 })
    await expect(service.update('alice', id, 'changed')).rejects.toMatchObject({ status: 400 })
  })

  it('updates note content through the filesystem boundary', async () => {
    const fs = mockFs()
    const service = createNotesService({ dataDir: '/notes', fs, now: () => now })
    const id = '2026/september.d/workspaces-2026-09-25/workspace-1.md'

    await service.update('alice', id, '# changed')

    expect(fs.mkdir).toHaveBeenCalledWith('/notes/alice/2026/september.d/workspaces-2026-09-25', { recursive: true })
    expect(fs.writeFile).toHaveBeenCalledWith('/notes/alice/2026/september.d/workspaces-2026-09-25/workspace-1.md', '# changed', 'utf8')
  })
})
