import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FileSessionBackend } from '../../src/session-modules/file-session-backend.js'
import { SessionManager } from '../../src/services/session-manager.js'

type User = { email: string; name?: string }
const directories: string[] = []

async function tempDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'katavti-sessions-'))
  directories.push(directory)
  return directory
}

afterEach(async () => Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))))

describe('file session backend', () => {
  it('persists sessions so a new manager loads them after restart', async () => {
    const directory = await tempDirectory()
    const first = await SessionManager.initialize<User>(new FileSessionBackend({ directory }))
    await first.set('secret/token', { email: 'alice@example.com', name: 'Alice' })

    const restarted = await SessionManager.initialize<User>(new FileSessionBackend({ directory }))

    await expect(restarted.get('secret/token')).resolves.toEqual({ email: 'alice@example.com', name: 'Alice' })
  })

  it('removes deleted sessions from persistent storage', async () => {
    const directory = await tempDirectory()
    const first = await SessionManager.initialize<User>(new FileSessionBackend({ directory }))
    await first.set('token', { email: 'alice@example.com' })
    await first.delete('token')

    const restarted = await SessionManager.initialize<User>(new FileSessionBackend({ directory }))

    await expect(restarted.get('token')).resolves.toBeUndefined()
  })
})
