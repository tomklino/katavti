import path from 'node:path'
import { lstat, mkdir, open, readFile, readdir, writeFile, rename, rm, link } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { NotesError, type Note, type NotesData, type PinRequest } from './notes-data.js'
import { calendarDate, dailyNotePath, findPins, pinStatePath, pinStateRecord, pinRequest } from './note-pins.js'
import { checkRevision } from './note-conflicts.js'
import { validateAssetFilename, type AssetsData } from './assets-data.js'

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

export function createFileNotesData(options: { dataDir: string; now?: () => Date }): NotesData & AssetsData {
  const fs = nodeFs
  const now = options.now ?? (() => new Date())

  function userDirectory(userId: string) {
    if (!userId || userId === '.' || userId === '..' || /[\\/\0]/.test(userId)) throw new NotesError('Invalid user ID', 400)
    return path.join(path.resolve(options.dataDir), userId)
  }

  function notePath(userId: string, id: string) {
    let decoded: string
    try { decoded = decodeURIComponent(id) } catch { throw new NotesError('Invalid note ID', 400) }
    if (!dailyNotePath.test(decoded)) {
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
    const date = calendarDate(dateString, now)
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
    const candidates = names.filter(name => dailyNotePath.test(name))
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

  function assetPath(userId: string, noteId: string, filename: string) {
    const { decoded } = notePath(userId, noteId)
    return path.join(userDirectory(userId), ...decoded.split('/').slice(0, 2), 'assets', validateAssetFilename(filename))
  }

  async function uploadAsset(userId: string, noteId: string, filename: string, bytes: Uint8Array) {
    await read(userId, noteId)
    const file = assetPath(userId, noteId, filename)
    const root = userDirectory(userId)
    await rejectSymlinkPath(root, file)
    await mkdir(path.dirname(file), { recursive: true })
    await rejectSymlinkPath(root, file)
    const temporary = `${file}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, bytes, { flag: 'wx' })
      // Publish only complete files, atomically and without replacement.
      try { await link(temporary, file) }
      catch (error: any) {
        if (error?.code === 'EEXIST') {
          if (!(await readFile(file)).equals(Buffer.from(bytes))) throw new NotesError('Asset already exists with different content', 409)
        } else throw error
      }
    } finally { await rm(temporary, { force: true }) }
  }

  async function readAsset(userId: string, noteId: string, filename: string) {
    const file = assetPath(userId, noteId, filename)
    await rejectSymlinkPath(userDirectory(userId), file)
    try { return await readFile(file) }
    catch (error: any) {
      if (error?.code === 'ENOENT') throw new NotesError('Asset not found', 404)
      throw error
    }
  }

  async function pinNote(userId: string, id: string, request: PinRequest) {
    request = pinRequest(request)
    const { decoded } = notePath(userId, id)
    await read(userId, id)
    const root = userDirectory(userId)
    const weekStart = request.period === 'week' ? await rememberWeekStart(root, request.weekStart!) : undefined
    const file = path.join(root, pinStatePath(decoded))
    await withWriteLock(root, file, () => replaceFile(file, pinStateRecord(decoded, request.date, request.period, weekStart)))
    return { id: encodeURIComponent(decoded), period: request.period }
  }

  async function unpinNote(userId: string, id: string, date: string) {
    calendarDate(date, now)
    const { decoded } = notePath(userId, id)
    await read(userId, id)
    const root = userDirectory(userId)
    const file = path.join(root, pinStatePath(decoded))
    await withWriteLock(root, file, () => replaceFile(file, pinStateRecord(decoded, date, null)))
  }

  async function listPins(userId: string, date?: string) {
    const root = userDirectory(userId)
    return findPins(calendarDate(date, now), async directory => {
      const resolved = path.join(root, directory)
      await rejectSymlinkPath(root, resolved)
      try { return await fs.readdir(resolved) }
      catch (error: any) { if (error?.code === 'ENOENT') return []; throw error }
    }, async pin => {
      const resolved = path.join(root, pin)
      await rejectSymlinkPath(root, resolved)
      try { return await fs.readFile(resolved, 'utf8') }
      catch (error: any) { if (error?.code !== 'ENOENT') throw error }
    })
  }

  async function replaceFile(file: string, content: string) {
    const temporary = `${file}.${randomUUID()}.tmp`
    try {
      await fs.writeFile(temporary, content, 'utf8')
      await rename(temporary, file)
    } finally { await rm(temporary, { force: true }) }
  }

  async function getWeekStart(userId: string) {
    return readWeekStart(userDirectory(userId))
  }

  async function readWeekStart(root: string) {
    const file = path.join(root, '.week-start')
    await rejectSymlinkPath(root, file)
    try {
      const value = await fs.readFile(file, 'utf8')
      return value === 'sunday' || value === 'monday' ? value : null
    } catch (error: any) { if (error?.code === 'ENOENT') return null; throw error }
  }

  async function rememberWeekStart(root: string, start: 'sunday' | 'monday') {
    const file = path.join(root, '.week-start')
    return withWriteLock(root, file, async () => {
      const existing = await readWeekStart(root)
      if (existing) return existing
      await replaceFile(file, start)
      return start
    })
  }

  return { createDaily, read, update, list, importNote, uploadAsset, readAsset, pinNote, unpinNote, listPins, getWeekStart }
}
