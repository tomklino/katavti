import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSessionManager } from '../../src/session-modules/index.js'

describe('session module factory', () => {
  it('initializes the configured module without exposing its backend to callers', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'katavti-session-factory-'))
    try {
      const first = await createSessionManager<{ email: string }>({ module: 'filesystem', lazy: true, cache: true, filesystem: { directory } })
      await first.set('token', { email: 'alice@example.com' })

      const restarted = await createSessionManager<{ email: string }>({ module: 'filesystem', lazy: true, cache: true, filesystem: { directory } })
      await expect(restarted.get('token')).resolves.toEqual({ email: 'alice@example.com' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
