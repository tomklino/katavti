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

export function pinPath(decodedId: string, request: PinRequest) {
  const bucket = bucketFor(calendarDate(request.date, () => new Date()), request.period, request.weekStart)
  const [, month, day, file] = decodedId.split('/')
  return `${bucket.directory}/${bucket.prefix}${day.slice('workspaces-'.length)}-${month.slice(0, -2)}-${file.slice(0, -3)}.pin`
}

export function pinRecord(id: string, date: string) { return JSON.stringify({ id, date }) }

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
  const seen = new Set<string>()
  return groups.flat().filter(({ id, period }) => {
    const key = `${period}:${id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
