import { Hono } from 'hono'

export function healthRoutes() {
  return new Hono().get('/', c => c.json({ status: 'ok' }))
}
