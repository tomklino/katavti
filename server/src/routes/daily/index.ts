import { Hono } from 'hono'
import type { NotesData } from '../../data-modules/notes-data.js'

export function dailyRoutes(service: NotesData) {
  return new Hono<{ Variables: { userId: string } }>().put('/', async c => {
    const ids = await service.createDaily(c.get('userId'), Number(c.req.query('num')), c.req.query('date'))
    return c.json(ids, 201)
  })
}
