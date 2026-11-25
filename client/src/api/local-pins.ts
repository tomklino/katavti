import type { NotePin, PinRequest, WeekStart } from './notes'

const pinsKey = 'katavti.pins.v1'
const weekStartKey = 'katavti.week-start'
type LocalPin = NotePin & { date: string; end: string; weekStart?: WeekStart; backedUpTo?: Record<string, string> }

export function readLocalPins(storage: Storage): LocalPin[] {
  try { return JSON.parse(storage.getItem(pinsKey) || '[]') }
  catch { return [] }
}

export function writeLocalPins(storage: Storage, pins: LocalPin[]) {
  storage.setItem(pinsKey, JSON.stringify(pins))
}

export function localWeekStart(storage: Storage): WeekStart | null {
  const value = storage.getItem(weekStartKey)
  return value === 'sunday' || value === 'monday' ? value : null
}

export function pinLocally(storage: Storage, id: string, { period, date, weekStart }: PinRequest): NotePin {
  const end = new Date(`${date}T00:00:00Z`)
  if (period === 'week') {
    weekStart = localWeekStart(storage) ?? weekStart
    if (!weekStart) throw new Error('Choose Sunday or Monday as the first day of the week')
    const offset = (end.getUTCDay() - (weekStart === 'monday' ? 1 : 0) + 7) % 7
    end.setUTCDate(end.getUTCDate() + 7 - offset)
    storage.setItem(weekStartKey, weekStart)
  } else if (period === 'month') end.setUTCMonth(end.getUTCMonth() + 1, 1)
  else end.setUTCFullYear(end.getUTCFullYear() + 1, 0, 1)
  const expires = end.toISOString().slice(0, 10)
  const pins = readLocalPins(storage)
  if (!pins.some(pin => pin.id === id && pin.period === period && pin.end === expires)) {
    writeLocalPins(storage, [...pins, { id, period, date, end: expires, weekStart }])
  }
  return { id, period }
}
