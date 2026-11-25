import { NotesError, type NotePin, type PinRequest, type WeekStart } from './notes-data.js'

export const dailyNotePath = /^\d{4}\/[a-z]+\.d\/workspaces-\d{4}-\d{2}-\d{2}\/workspace-\d+\.md$/

export function calendarDate(value: string | undefined, fallback: () => Date) {
  if (value === undefined) return fallback()
  const date = new Date(`${value}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new NotesError('Invalid date', 400)
  }
  return date
}

export function pinRequest(body: unknown): PinRequest {
  const { period, date, weekStart } = (body ?? {}) as Partial<PinRequest>
  if (period !== 'week' && period !== 'month' && period !== 'year') throw new NotesError('Invalid pin period', 400)
  if (typeof date !== 'string') throw new NotesError('A pin date is required', 400)
  if (period === 'week' && weekStart !== 'sunday' && weekStart !== 'monday') throw new NotesError('Choose Sunday or Monday as the first day of the week', 400)
  calendarDate(date, () => new Date())
  return { period, date, weekStart }
}

function startOfWeek(date: Date, weekStart: WeekStart) {
  const start = new Date(date)
  const offset = (date.getUTCDay() - (weekStart === 'monday' ? 1 : 0) + 7) % 7
  start.setUTCDate(start.getUTCDate() - offset)
  start.setUTCHours(0, 0, 0, 0)
  return start
}

function weekDirectory(date: Date, weekStart: WeekStart) {
  const start = startOfWeek(date, weekStart)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  // Week 1 contains Jan 1. A week spanning two years keeps the same bucket
  // on both sides of New Year's Day, regardless of the chosen week start.
  const year = end.getUTCFullYear()
  const jan1 = new Date(end)
  jan1.setUTCMonth(0, 1)
  const week = 1 + Math.round((start.getTime() - startOfWeek(jan1, weekStart).getTime()) / 604_800_000)
  return `${year}/weekly/${week}`
}

type Bucket = { directory: string; prefix: string; period: NotePin['period'] }

function bucketFor(date: Date, period: NotePin['period'], weekStart?: WeekStart): Bucket {
  const year = date.getUTCFullYear()
  if (period === 'year') return { directory: `${year}/pinned`, prefix: '', period }
  if (period === 'month') {
    const month = date.toLocaleString('en', { month: 'long', timeZone: 'UTC' }).toLowerCase()
    return { directory: `${year}/${month}.d`, prefix: '', period }
  }
  if (weekStart !== 'sunday' && weekStart !== 'monday') throw new NotesError('Invalid week start', 400)
  return { directory: weekDirectory(date, weekStart), prefix: `${weekStart}-`, period }
}

export function pinStatePath(decodedId: string) { return `.pin-state/${encodeURIComponent(decodedId)}.json` }

export function pinStateRecord(id: string, date: string, period: NotePin['period'] | null, weekStart?: WeekStart) {
  return JSON.stringify({ id, date, period, weekStart })
}

function activePin(record: string | undefined, day: string) {
  if (!record) return undefined
  try {
    const { id, date } = JSON.parse(record)
    if (typeof id === 'string' && dailyNotePath.test(id) && typeof date === 'string' && date <= day) return id
  } catch { /* Ignore malformed pin files. */ }
}

export async function findPins(date: Date, list: (directory: string) => Promise<string[]>, read: (pin: string) => Promise<string | undefined>): Promise<NotePin[]> {
  const buckets = [bucketFor(date, 'week', 'sunday'), bucketFor(date, 'week', 'monday'), bucketFor(date, 'month'), bucketFor(date, 'year')]
  const day = date.toISOString().slice(0, 10)
  const directories = new Map<string, Promise<string[]>>()
  const groups = await Promise.all(buckets.map(async ({ directory, prefix, period }) => {
    if (!directories.has(directory)) directories.set(directory, list(directory))
    const names = await directories.get(directory)!
    const pattern = new RegExp(`^${prefix}\\d{4}-\\d{2}-\\d{2}-[a-z]+-workspace-\\d+\\.pin$`)
    const records = await Promise.all(names.filter(name => pattern.test(name)).sort().map(name => read(`${directory}/${name}`)))
    return [...new Set(records.map(record => activePin(record, day)))].flatMap(id => id ? [{ id: encodeURIComponent(id), period }] : [])
  }))
  // Older installations may have several calendar-bucket pins for a note.
  // A per-note state supersedes all of them, including after expiry or unpin.
  const pins = new Map(groups.flat().map(pin => [pin.id, pin]))
  const states = await list('.pin-state')
  for (const name of states.filter(name => name.endsWith('.json')).sort()) {
    const record = await read(`.pin-state/${name}`)
    if (!record) continue
    try {
      const { id, date: start, period, weekStart } = JSON.parse(record)
      if (typeof id !== 'string' || !dailyNotePath.test(id) || name !== `${encodeURIComponent(id)}.json`) continue
      if (typeof start !== 'string' || calendarDate(start, () => date).toISOString().slice(0, 10) > day) continue
      if (period !== null && period !== 'week' && period !== 'month' && period !== 'year') continue
      if (period === 'week' && weekStart !== 'sunday' && weekStart !== 'monday') continue
      const encoded = encodeURIComponent(id)
      pins.delete(encoded)
      if (period !== null) {
        const startBucket = bucketFor(calendarDate(start, () => date), period, weekStart)
        const currentBucket = bucketFor(date, period, weekStart)
        if (startBucket.directory === currentBucket.directory && startBucket.prefix === currentBucket.prefix) pins.set(encoded, { id: encoded, period })
      }
    } catch { /* Ignore malformed state records. */ }
  }
  return [...pins.values()]
}
