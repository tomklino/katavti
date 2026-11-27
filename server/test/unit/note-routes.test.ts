import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { noteRoutes } from '../../src/routes/notes/index.js'
import { NotesError, type NotesData } from '../../src/data-modules/notes-data.js'

function setup() {
  const service: NotesData = { createDaily: vi.fn(), list: vi.fn(), read: vi.fn(), update: vi.fn(), importNote: vi.fn(), listPins: vi.fn(), pinNote: vi.fn(), unpinNote: vi.fn(), getWeekStart: vi.fn() }
  const app = new Hono<{ Variables: { userId: string } }>()
  app.use('*', async (c, next) => { c.set('userId', 'alice'); await next() })
  app.route('/notes', noteRoutes(service))
  app.onError((error, c) => c.json({ error: error.message }, error instanceof NotesError ? error.status as 400 : 500))
  const post = (url: string, body: unknown) => app.request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const pin = (body: unknown) => app.request('/notes/note-id/pin', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { service, post, pin, app }
}

describe('note save and import HTTP contracts', () => {
  it('validates and forwards label pair queries', async () => {
    const { app, service } = setup()
    vi.mocked(service.list).mockResolvedValue([])
    expect((await app.request('/notes?label=2p%3A%20Tom')).status).toBe(200)
    expect(service.list).toHaveBeenCalledWith('alice', { days: undefined, bug: undefined, label: '2p: Tom' })
    for (const label of ['something else: base', '#Title: something', 'tag:  issue', 'tag: issue\n', '']) {
      expect((await app.request(`/notes?label=${encodeURIComponent(label)}`)).status).toBe(400)
    }
    expect(service.list).toHaveBeenCalledTimes(1)
  })

  it('passes the base revision to storage and returns a meaningful conflict', async () => {
    const { service, post } = setup()
    vi.mocked(service.update).mockRejectedValue(new NotesError('Stale note conflict', 409))
    const response = await post('/notes/id', { content: 'Draft', revision: 'old' })
    expect(service.update).toHaveBeenCalledWith('alice', 'id', 'Draft', 'old')
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Stale note conflict' })
  })

  it('rejects malformed revisions without writing', async () => {
    const { service, post } = setup()
    for (const revision of [null, 123, {}, '']) {
      expect((await post('/notes/id', { content: 'Draft', revision })).status).toBe(400)
    }
    expect(service.update).not.toHaveBeenCalled()
  })

  it('rejects unknown periods, impossible dates, and missing or invalid week starts', async () => {
    const { service, pin } = setup()
    for (const body of [{ period: 'day', date: '2026-07-18' }, { period: 'month', date: '2026-02-30' },
      { period: 'week', date: '2026-07-18' }, { period: 'week', date: '2026-07-18', weekStart: 'saturday' }]) {
      expect((await pin(body)).status).toBe(400)
    }
    expect(service.pinNote).not.toHaveBeenCalled()
  })

  it('lists and unpins using a valid browser date', async () => {
    const { service, app } = setup()
    vi.mocked(service.listPins).mockResolvedValue([{ id: 'note-id', period: 'year' }])
    const listed = await app.request('/notes/pins?date=2026-07-18')
    expect(await listed.json()).toEqual([{ id: 'note-id', period: 'year' }])
    expect(service.listPins).toHaveBeenCalledWith('alice', '2026-07-18')
    expect((await app.request('/notes/note-id/pin?date=2026-02-30', { method: 'DELETE' })).status).toBe(400)
    expect((await app.request('/notes/note-id/pin', { method: 'DELETE' })).status).toBe(400)
    expect(service.unpinNote).not.toHaveBeenCalled()
    expect((await app.request('/notes/note-id/pin?date=2026-07-18', { method: 'DELETE' })).status).toBe(200)
    expect(service.unpinNote).toHaveBeenCalledWith('alice', 'note-id', '2026-07-18')
  })

  it('imports via a separate create-only operation', async () => {
    const { service, post } = setup()
    vi.mocked(service.importNote).mockResolvedValue({ id: 'renamed', note: { content: 'Draft', ISODateString: '', tags: [], revision: 'r1' } })
    const response = await post('/notes/import', { id: 'original', content: 'Draft' })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ id: 'renamed' })
    expect(service.importNote).toHaveBeenCalledWith('alice', 'original', 'Draft')
    expect(service.update).not.toHaveBeenCalled()
  })
})
