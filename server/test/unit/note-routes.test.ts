import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { noteRoutes } from '../../src/routes/notes/index.js'
import { NotesError, type NotesData } from '../../src/data-modules/notes-data.js'

function setup() {
  const service: NotesData = { createDaily: vi.fn(), list: vi.fn(), read: vi.fn(), update: vi.fn(), importNote: vi.fn() }
  const app = new Hono<{ Variables: { userId: string } }>()
  app.use('*', async (c, next) => { c.set('userId', 'alice'); await next() })
  app.route('/notes', noteRoutes(service))
  app.onError((error, c) => c.json({ error: error.message }, error instanceof NotesError ? error.status as 400 : 500))
  const post = (url: string, body: unknown) => app.request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { service, post }
}

describe('note save and import HTTP contracts', () => {
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
