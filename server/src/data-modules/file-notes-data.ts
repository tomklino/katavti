import path from 'node:path'
import { lstat, mkdir, open, readFile, readdir, writeFile, rename, rm, link } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { NotesError, type Note, type NotesData } from './notes-data.js'
import { checkRevision } from './note-conflicts.js'

type FileSystem = {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>
  readFile(path: string, encoding: 'utf8'): Promise<string>
  writeFile(path: string, content: string, encoding?: 'utf8'): Promise<unknown>
  readdir(path: string, options?: { recursive?: boolean }): Promise<string[]>
  lstat(path: string): Promise<{ isSymbolicLink(): boolean }>
  touch(path: string): Promise<unknown>
}

const nodeFs: FileSystem = {
  mkdir,
  readFile: (file, encoding) => readFile(file, encoding),
  writeFile,
  readdir: (dir, options) => readdir(dir, options) as Promise<string[]>,
  lstat,
  async touch(file) { const handle = await open(file, 'a'); await handle.close() },
}

export function createFileNotesData(options: { dataDir: string; now?: () => Date }): NotesData {
  const fs = nodeFs
  const now = options.now ?? (() => new Date())

  function userDirectory(userId: string) {
    if (!userId || userId === '.' || userId === '..' || /[\\/\0]/.test(userId)) throw new NotesError('Invalid user ID', 400)
    return path.join(path.resolve(options.dataDir), userId)
  }

  function notePath(userId: string, id: string) {
    let decoded: string
    try { decoded = decodeURIComponent(id) } catch { throw new NotesError('Invalid note ID', 400) }
    if (!/^\d{4}\/[a-z]+\.d\/workspaces-\d{4}-\d{2}-\d{2}\/workspace-\d+\.md$/.test(decoded)) {
      throw new NotesError('Invalid note ID', 400)
    }
    const root = userDirectory(userId)
    const resolved = path.resolve(root, decoded)
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new NotesError('Invalid note ID', 400)
    return { decoded, resolved }
  }

  async function rejectSymlinkPath(root: string, resolved: string) {
    const relative = path.relative(root, resolved)
    const paths = [root]
    let current = root
    for (const component of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, component)
      paths.push(current)
    }
    for (const candidate of paths) {
      try {
        if ((await fs.lstat(candidate)).isSymbolicLink()) throw new NotesError('Invalid note path', 400)
      } catch (error: any) {
        if (error instanceof NotesError) throw error
        if (error?.code !== 'ENOENT') throw error
      }
    }
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
    const root = userDirectory(userId)
    const directory = path.join(root, relativeDirectory)
    await rejectSymlinkPath(root, directory)
    await fs.mkdir(directory, { recursive: true })
    await rejectSymlinkPath(root, directory)
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
      const file = path.join(root, relative)
      await rejectSymlinkPath(root, file)
      await fs.touch(file)
      ids.push(encodeURIComponent(relative))
    }
    return ids
  }

  async function readVersion(file: string) {
    const handle = await open(file, 'r')
    try {
      const content = await handle.readFile('utf8')
      const stat = await handle.stat({ bigint: true })
      const revision = createHash('sha256').update(`${stat.ino}:${stat.mtimeNs}:${content}`).digest('hex')
      return { content, revision }
    } finally { await handle.close() }
  }

  // A filesystem lock serializes compare-and-write even across API processes.
  // Never remove another writer's lock on timeout: fail closed instead.
  async function withWriteLock<T>(root: string, file: string, work: () => Promise<T>): Promise<T> {
    await rejectSymlinkPath(root, file)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await rejectSymlinkPath(root, file)
    const lock = `${file}.lock`
    const deadline = Date.now() + 5_000
    while (true) {
      try { await mkdir(lock); break }
      catch (error: any) {
        if (error?.code !== 'EEXIST') throw error
        if (Date.now() >= deadline) throw new NotesError('Note is busy; please try again', 503)
        await new Promise(resolve => setTimeout(resolve, 10))
      }
    }
    try { return await work() } finally { await rm(lock, { recursive: true, force: true }) }
  }

  async function read(userId: string, id: string): Promise<Note> {
    const { decoded, resolved } = notePath(userId, id)
    await rejectSymlinkPath(userDirectory(userId), resolved)
    try {
      return { ...await readVersion(resolved), ISODateString: dateFromId(decoded).toISOString(), tags: [] }
    } catch (error: any) {
      if (error?.code === 'ENOENT') throw new NotesError('Note not found', 404)
      throw error
    }
  }

  async function update(userId: string, id: string, content: string, revision?: string) {
    if (typeof content !== 'string') throw new NotesError('content must be a string', 400)
    const { decoded, resolved } = notePath(userId, id)
    return withWriteLock(userDirectory(userId), resolved, async () => {
      await rejectSymlinkPath(userDirectory(userId), resolved)
      let current: Awaited<ReturnType<typeof readVersion>> | undefined
      try { current = await readVersion(resolved) }
      catch (error: any) { if (error?.code !== 'ENOENT') throw error }
      checkRevision(revision, current)
      const temporary = `${resolved}.${randomUUID()}.tmp`
      try {
        await fs.writeFile(temporary, content, 'utf8')
        await rename(temporary, resolved)
      } finally { await rm(temporary, { force: true }) }
      const saved = await readVersion(resolved)
      return revision === undefined ? decoded : { id: decoded, revision: saved.revision }
    })
  }

  async function importNote(userId: string, id: string, content: string) {
    if (typeof content !== 'string') throw new NotesError('content must be a string', 400)
    const { decoded, resolved } = notePath(userId, id)
    const root = userDirectory(userId)
    await rejectSymlinkPath(root, resolved)
    const directory = path.dirname(resolved)
    await fs.mkdir(directory, { recursive: true })
    await rejectSymlinkPath(root, directory)
    const names = await fs.readdir(directory)
    let number = names.reduce((highest, name) => {
      const match = name.match(/^workspace-(\d+)\.md$/)
      return match ? Math.max(highest, Number(match[1])) : highest
    }, 0) + 1
    const temporary = path.join(directory, `${randomUUID()}.tmp`)
    try {
      await fs.writeFile(temporary, content, 'utf8')
      while (true) {
        const imported = `${path.dirname(decoded)}/workspace-${number++}.md`
        const destination = path.join(root, imported)
        try {
          // Atomic create-only publication: concurrent imports cannot collide.
          await link(temporary, destination)
          const importedId = encodeURIComponent(imported)
          return { id: importedId, note: await read(userId, importedId) }
        } catch (error: any) { if (error?.code !== 'EEXIST') throw error }
      }
    } finally { await rm(temporary, { force: true }) }
  }

  async function list(userId: string, query: { days?: number; bug?: string }) {
    const root = userDirectory(userId)
    let names: string[]
    try { names = await fs.readdir(root, { recursive: true }) }
    catch (error: any) { if (error?.code === 'ENOENT') return []; throw error }
    const candidates = names.filter(name => /\.(md|txt)$/.test(name))
    const cutoff = new Date(now()); cutoff.setUTCDate(cutoff.getUTCDate() - (query.days ?? 5))
    const matched: string[] = []
    await Promise.all(candidates.map(async id => {
      let content: string
      const resolved = path.resolve(root, id)
      if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) return
      try {
        await rejectSymlinkPath(root, resolved)
        content = await fs.readFile(resolved, 'utf8')
      } catch { return }
      if (query.bug) {
        if (!content.split('\n').some(line => ['Bug', 'Label'].some(prefix => line.trim() === `${prefix}: ${query.bug}`))) return
      } else if (!content.length || dateFromId(id) < cutoff) return
      matched.push(id)
    }))
    return matched.sort((a, b) => dateFromId(b).getTime() - dateFromId(a).getTime()).map(encodeURIComponent)
  }

  return { createDaily, read, update, list, importNote }
}
