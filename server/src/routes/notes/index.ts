import { Hono } from 'hono'
import type { NotesData } from '../../data-modules/notes-data.js'

type Variables = { userId: string }

export function noteRoutes(service: NotesData) {
  const routes = new Hono<{ Variables: Variables }>()
  routes.get('/', async c => {
    const rawDays = c.req.query('days')
    const days = rawDays === undefined ? undefined : Number(rawDays)
    if (days !== undefined && (!Number.isInteger(days) || days < 0)) return c.json({ error: 'days must be a non-negative integer' }, 400)
    return c.json(await service.list(c.get('userId'), { days, bug: c.req.query('bug') }))
  })
  routes.post('/import', async c => {
    let body: any
    try { body = await c.req.json() } catch { return c.json({ error: 'Expected a JSON body' }, 400) }
    if (!body || typeof body.id !== 'string' || typeof body.content !== 'string') return c.json({ error: 'id and content must be strings' }, 400)
    return c.json(await service.importNote(c.get('userId'), body.id, body.content), 201)
  })
  routes.get('/:id', async c => c.json(await service.read(c.get('userId'), c.req.param('id'))))
  routes.post('/:id', async c => {
    let body: unknown
    try { body = await c.req.json() } catch { return c.json({ error: 'Expected a JSON body' }, 400) }
    if (!body || typeof (body as any).content !== 'string') return c.json({ error: 'content must be a string' }, 400)
    const { content, revision } = body as { content: string; revision?: unknown }
    if (revision !== undefined && (typeof revision !== 'string' || !revision)) return c.json({ error: 'revision must be a nonempty string' }, 400)
    return c.json(await service.update(c.get('userId'), c.req.param('id'), content, revision))
  })
  return routes
}
