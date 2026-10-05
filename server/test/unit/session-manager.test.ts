import { describe, expect, it, vi } from 'vitest'
import { SessionManager, type SessionBackend } from '../../src/services/session-manager.js'

type User = { email: string }

describe('session manager', () => {
  it('defaults to lazy loading and caches a session after its first lookup', async () => {
    const backend: SessionBackend<User> = {
      load: vi.fn().mockResolvedValue(new Map()),
      get: vi.fn().mockResolvedValue({ email: 'alice@example.com' }),
      save: vi.fn(),
      delete: vi.fn(),
    }

    const sessions = await SessionManager.initialize(backend)

    expect(backend.load).not.toHaveBeenCalled()
    await expect(sessions.get('persisted-token')).resolves.toEqual({ email: 'alice@example.com' })
    await expect(sessions.get('persisted-token')).resolves.toEqual({ email: 'alice@example.com' })
    expect(backend.get).toHaveBeenCalledOnce()
  })

  it('can eagerly load all sessions during initialization', async () => {
    const backend: SessionBackend<User> = {
      load: vi.fn().mockResolvedValue(new Map([['persisted-token', { email: 'alice@example.com' }]])),
      get: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    }

    const sessions = await SessionManager.initialize(backend, { lazy: false, cache: true })

    expect(backend.load).toHaveBeenCalledOnce()
    await expect(sessions.get('persisted-token')).resolves.toEqual({ email: 'alice@example.com' })
    expect(backend.get).not.toHaveBeenCalled()
  })

  it('loads from the backend on every lookup when caching is disabled', async () => {
    const backend: SessionBackend<User> = {
      load: vi.fn().mockResolvedValue(new Map()),
      get: vi.fn().mockResolvedValue({ email: 'alice@example.com' }),
      save: vi.fn(),
      delete: vi.fn(),
    }
    const sessions = await SessionManager.initialize(backend, { lazy: true, cache: false })

    await sessions.get('token')
    await sessions.get('token')

    expect(backend.get).toHaveBeenCalledTimes(2)
  })

  it('updates the backend when sessions are created and deleted', async () => {
    const backend: SessionBackend<User> = {
      load: vi.fn().mockResolvedValue(new Map()),
      get: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }
    const sessions = await SessionManager.initialize(backend)

    await sessions.set('new-token', { email: 'bob@example.com' })
    await expect(sessions.get('new-token')).resolves.toEqual({ email: 'bob@example.com' })
    expect(backend.save).toHaveBeenCalledWith('new-token', { email: 'bob@example.com' })

    await sessions.delete('new-token')
    await expect(sessions.get('new-token')).resolves.toBeUndefined()
    expect(backend.delete).toHaveBeenCalledWith('new-token')
  })
})
