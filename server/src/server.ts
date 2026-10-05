import { serve } from '@hono/node-server'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { ConfigError, loadConfig, type AppConfig } from './config/index.js'
import { createSessionManager } from './session-modules/index.js'
import { createAuthService, type AuthUser } from './services/auth-service.js'

export async function startServer(config: AppConfig) {
  const sessions = await createSessionManager<AuthUser>(config.sessions)
  const auth = createAuthService({ ...config.auth, sessions })
  const server = serve({
    fetch: createApp(config, undefined, auth).fetch,
    hostname: config.server.host,
    port: config.server.port,
  })
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not determine server address')
  return { server, host: address.address, port: address.port }
}

async function main() {
  const sourceDirectory = path.dirname(fileURLToPath(import.meta.url))
  const defaultsFile = path.resolve(sourceDirectory, '../../config-defaults.yaml')
  const config = await loadConfig({ defaultsFile })
  const { host, port } = await startServer(config)
  console.log(`Katavti API listening on http://${host}:${port}${config.api.basePath}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => {
    if (error instanceof ConfigError) console.error(error.message)
    else console.error('Server startup failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
