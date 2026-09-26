import path from 'node:path'
import { mkdir, open, readFile, readdir, stat, writeFile } from 'node:fs/promises'

export type FileSystem = {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>
  readFile(path: string, encoding: 'utf8'): Promise<string>
  writeFile(path: string, content: string, encoding?: 'utf8'): Promise<unknown>
  readdir(path: string, options?: { recursive?: boolean }): Promise<string[]>
  stat(path: string): Promise<{ size: number }>
  touch(path: string): Promise<unknown>
}

export class NotesError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

const nodeFs: FileSystem = {
  mkdir,
  readFile: (file, encoding) => readFile(file, encoding),
  writeFile,
  readdir: (dir, options) => readdir(dir, options) as Promise<string[]>,
  stat,
  async touch(file) { const handle = await open(file, 'a'); await handle.close() },
}

export type Note = { content: string; ISODateString: string; tags: Array<[string, string]> }
export type NotesService = ReturnType<typeof createNotesService>

export function createNotesService(options: { dataDir: string; fs?: FileSystem; now?: () => Date }) {
  const fs = options.fs ?? nodeFs
  const now = options.now ?? (() => new Date())

  function userDirectory(userId: string) {
    if (!userId || userId === '.' || userId === '..' || /[\\/\0]/.test(userId)) throw new NotesError('Invalid user ID', 400)
    return path.join(path.resolve(options.dataDir), userId)
  }

  function notePath(userId: string, id: string) {
    let decoded: string
    try { decoded = decodeURIComponent(id) } catch { throw new NotesError('Invalid note ID', 400) }
    const root = userDirectory(userId)
    const resolved = path.resolve(root, decoded)
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new NotesError('Invalid note ID', 400)
    return { decoded, resolved }
  }

  function dateFromId(id: string) {
    const match = id.match(/workspaces-(\d{4}-\d{2}-\d{2})/)
    if (!match) throw new NotesError('Invalid note ID', 400)
    return new Date(`${match[1]}T00:00:00.000Z`)
  }

  function directoryFor(date: Date) {
    const iso = date.toISOString().slice(0, 10)
    const month = date.toLocaleString('en', { month: 'long', timeZone: 'UTC' }).toLowerCase()
    return path.join(String(date.getUTCFullYear()), `${month}.d`, `workspaces-${iso}`)
  }

  async function createDaily(userId: string, count: number, dateString?: string) {
    if (!Number.isInteger(count) || count < 1 || count > 100) throw new NotesError('num must be an integer from 1 to 100', 400)
    const date = dateString ? new Date(`${dateString}T00:00:00.000Z`) : now()
    if (Number.isNaN(date.getTime()) || (dateString && (!/^\d{4}-\d{2}-\d{2}$/.test(dateString) || date.toISOString().slice(0, 10) !== dateString))) throw new NotesError('Invalid date', 400)
    const relativeDirectory = directoryFor(date)
    const directory = path.join(userDirectory(userId), relativeDirectory)
    await fs.mkdir(directory, { recursive: true })
    let existingNames: string[] = []
    try { existingNames = await fs.readdir(directory) } catch { /* A newly created directory is empty. */ }
    const highestExisting = existingNames.reduce((highest, name) => {
      const match = path.basename(name).match(/^workspace-(\d+)\.md$/)
      return match ? Math.max(highest, Number(match[1])) : highest
    }, 0)
    const total = Math.max(count, highestExisting)
    const ids: string[] = []
    for (let number = 1; number <= total; number++) {
      const relative = path.join(relativeDirectory, `workspace-${number}.md`)
      await fs.touch(path.join(userDirectory(userId), relative))
      ids.push(encodeURIComponent(relative))
    }
    return ids
  }

  async function read(userId: string, id: string): Promise<Note> {
    const { decoded, resolved } = notePath(userId, id)
    try {
      return { content: await fs.readFile(resolved, 'utf8'), ISODateString: dateFromId(decoded).toISOString(), tags: [] }
    } catch (error: any) {
      if (error?.code === 'ENOENT') throw new NotesError('Note not found', 404)
      throw error
    }
  }

  async function update(userId: string, id: string, content: string) {
    if (typeof content !== 'string') throw new NotesError('content must be a string', 400)
    const { decoded, resolved } = notePath(userId, id)
    try { await fs.mkdir(path.dirname(resolved), { recursive: true }); await fs.writeFile(resolved, content, 'utf8') }
    catch (error: any) {
      if (error?.code === 'ENOENT') throw new NotesError('Note not found', 404)
      throw error
    }
    return decoded
  }

  async function list(userId: string, query: { days?: number; bug?: string }) {
    const root = userDirectory(userId)
    let names: string[]
    try { names = await fs.readdir(root, { recursive: true }) }
    catch (error: any) { if (error?.code === 'ENOENT') return []; throw error }
    const candidates = names.filter((name) => /\.(md|txt)$/.test(name))
    const cutoff = new Date(now()); cutoff.setUTCDate(cutoff.getUTCDate() - (query.days ?? 5))
    const matched: string[] = []
    await Promise.all(candidates.map(async (id) => {
      let content: string
      try { content = await fs.readFile(path.join(root, id), 'utf8') } catch { return }
      if (query.bug) {
        if (!content.split('\n').some(line => ['Bug', 'Label'].some(prefix => line.trim() === `${prefix}: ${query.bug}`))) return
      } else {
        if (!content.length || dateFromId(id) < cutoff) return
      }
      matched.push(id)
    }))
    return matched.sort((a, b) => dateFromId(b).getTime() - dateFromId(a).getTime()).map(encodeURIComponent)
  }

  return { createDaily, read, update, list }
}
