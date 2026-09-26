import type { ListQuery, Note, NotesApi } from './notes'

const storageKey = 'katavti.notes.v1'
type StoredNotes = Record<string, Note>

function readStorage(storage: Storage): StoredNotes {
  try { return JSON.parse(storage.getItem(storageKey) || '{}') }
  catch { return {} }
}

function writeStorage(storage: Storage, notes: StoredNotes) {
  storage.setItem(storageKey, JSON.stringify(notes))
}

function dateFromId(id: string) {
  const match = decodeURIComponent(id).match(/workspaces-(\d{4}-\d{2}-\d{2})/)
  return match ? new Date(`${match[1]}T00:00:00.000Z`) : new Date(0)
}

export function createLocalNotesApi(storage: Storage = localStorage): NotesApi {
  return {
    async list(query: ListQuery) {
      const notes = readStorage(storage)
      const cutoff = new Date(); cutoff.setUTCDate(cutoff.getUTCDate() - (query.days ?? 5))
      return Object.keys(notes).filter(id => {
        const note = notes[id]
        if (query.bug) return note.content.split('\n').some(line => ['Bug', 'Label'].some(prefix => line.trim() === `${prefix}: ${query.bug}`))
        return note.content.length > 0 && dateFromId(id) >= cutoff
      }).sort((a, b) => dateFromId(b).getTime() - dateFromId(a).getTime())
    },
    async read(id: string) {
      const note = readStorage(storage)[id]
      if (!note) throw new Error('Note not found')
      return note
    },
    async update(id: string, content: string) {
      const notes = readStorage(storage)
      const previous = notes[id]
      notes[id] = { content, ISODateString: previous?.ISODateString || dateFromId(id).toISOString(), tags: previous?.tags || [] }
      writeStorage(storage, notes)
      return decodeURIComponent(id)
    },
    async createDaily(count: number, date: string) {
      const value = new Date(`${date}T00:00:00.000Z`)
      const month = value.toLocaleString('en', { month: 'long', timeZone: 'UTC' }).toLowerCase()
      const notes = readStorage(storage)
      const directory = `${value.getUTCFullYear()}/${month}.d/workspaces-${date}`
      const highestExisting = Object.keys(notes).reduce((highest, id) => {
        const match = decodeURIComponent(id).match(new RegExp(`^${directory}/workspace-(\\d+)\\.md$`))
        return match ? Math.max(highest, Number(match[1])) : highest
      }, 0)
      const total = Math.max(count, highestExisting)
      const ids = Array.from({ length: total }, (_, index) => encodeURIComponent(`${directory}/workspace-${index + 1}.md`))
      for (const id of ids) notes[id] ||= { content: '', ISODateString: value.toISOString(), tags: [] }
      writeStorage(storage, notes)
      return ids
    },
  }
}

export async function backUpLocalNotes(remote: NotesApi, storage: Storage = localStorage) {
  const entries = Object.entries(readStorage(storage))
  await Promise.all(entries.map(([id, note]) => remote.update(id, note.content)))
  return entries.length
}

export function createSyncedNotesApi(local: NotesApi, remote: NotesApi): NotesApi {
  return {
    async list(query) {
      const [localIds, remoteIds] = await Promise.all([local.list(query), remote.list(query)])
      return [...new Set([...localIds, ...remoteIds])]
    },
    async read(id) {
      try {
        const remoteNote = await remote.read(id)
        await local.update(id, remoteNote.content)
        return remoteNote
      } catch { return local.read(id) }
    },
    async update(id, content) { await local.update(id, content); return remote.update(id, content) },
    async createDaily(count, date) {
      const [localIds, remoteIds] = await Promise.all([local.createDaily(count, date), remote.createDaily(count, date)])
      return [...new Set([...localIds, ...remoteIds])]
    },
  }
}
