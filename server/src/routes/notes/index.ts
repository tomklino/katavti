import { Hono } from 'hono'
import type { NotesService } from '../../services/notes-service.js'

type Variables = { userId: string }

export function noteRoutes(service: NotesService) {
  const routes = new Hono<{ Variables: Variables }>()
  routes.get('/', async c => {
    const rawDays = c.req.query('days')
    const days = rawDays === undefined ? undefined : Number(rawDays)
    if (days !== undefined && (!Number.isInteger(days) || days < 0)) return c.json({ error: 'days must be a non-negative integer' }, 400)
    return c.json(await service.list(c.get('userId'), { days, bug: c.req.query('bug') }))
  })
  routes.get('/:id', async c => c.json(await service.read(c.get('userId'), c.req.param('id'))))
  routes.post('/:id', async c => {
    let body: unknown
    try { body = await c.req.json() } catch { return c.json({ error: 'Expected a JSON body' }, 400) }
    if (!body || typeof (body as any).content !== 'string') return c.json({ error: 'content must be a string' }, 400)
    return c.json(await service.update(c.get('userId'), c.req.param('id'), (body as any).content))
  })
  return routes
}
