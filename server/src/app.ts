import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AppConfig } from './config/index.js'
import { authRoutes, sessionUser } from './routes/auth/index.js'
import { dailyRoutes } from './routes/daily/index.js'
import { healthRoutes } from './routes/health/index.js'
import { noteRoutes } from './routes/notes/index.js'
import { createAuthService, type AuthService } from './services/auth-service.js'
import { createAzureNotesData } from './data-modules/azure-notes-data.js'
import { createFileNotesData } from './data-modules/file-notes-data.js'
import { NotesError, type NotesData } from './data-modules/notes-data.js'

export function createApp(config: AppConfig, injectedNotesData?: NotesData, injectedAuth?: AuthService) {
  const app = new Hono<{ Variables: { userId: string } }>()
  const notesData = injectedNotesData ?? (config.storage.module === 'azure'
    ? createAzureNotesData(config.storage.azure)
    : createFileNotesData({ dataDir: config.storage.dataDir }))
  const auth = injectedAuth ?? createAuthService({ ...config.auth, environmentType: config.environmentType })
  const apiPath = config.api.basePath
  app.use(`${apiPath}/*`, cors({
    origin: origin => {
      if (config.http.cors.origins.includes('*') || config.http.cors.origins.includes(origin)) return origin
      if (config.environmentType === 'dev' && config.http.cors.allowLoopbackInDevelopment) {
        try {
          const hostname = new URL(origin).hostname
          if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return origin
        } catch { /* Invalid origins remain disallowed. */ }
      }
      return null
    },
  }))
  app.route(`${apiPath}/health`, healthRoutes())
  app.route(`${apiPath}/auth`, authRoutes(auth, config.environmentType))
  app.use(`${apiPath}/notes/*`, async (c, next) => {
    const user = await sessionUser(auth, c.req.header('cookie'))
    if (!user) return c.json({ error: 'Unauthenticated' }, 401)
    c.set('userId', user.email)
    await next()
  })
  app.route(`${apiPath}/notes/daily`, dailyRoutes(notesData))
  app.route(`${apiPath}/notes`, noteRoutes(notesData))
  app.notFound(c => c.json({ error: 'Not found' }, 404))
  app.onError((error, c) => {
    if (error instanceof NotesError) return c.json({ error: error.message }, error.status as 400)
    console.error(error)
    return c.json({ error: 'Internal server error' }, 500)
  })
  return app
}
