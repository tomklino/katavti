import { Hono } from 'hono'
import type { NotesData } from '../../data-modules/notes-data.js'

export function dailyRoutes(service: NotesData) {
  return new Hono<{ Variables: { userId: string } }>().put('/', async c => {
    const ids = await service.createDaily(c.get('userId'), Number(c.req.query('num')), c.req.query('date'))
    // Keep the existing array response for clients that do not request pins.
    if (c.req.query('includePins') !== 'true') return c.json(ids, 201)
    return c.json({ ids, pins: await service.listPins(c.get('userId'), c.req.query('date')) }, 201)
  })
}
