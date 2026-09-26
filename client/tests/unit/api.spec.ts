import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNotesApi } from '@/api/notes'

describe('notes API same-origin requests', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses a relative API path by default so ingress can share the client origin', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    vi.stubGlobal('fetch', fetchMock)

    await createNotesApi().list({ days: 5 })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1beta/notes?days=5',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('still permits an explicit API origin for standalone development', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    vi.stubGlobal('fetch', fetchMock)

    await createNotesApi('http://127.0.0.1:3030').list({ days: 5 })

    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:3030/api/v1beta/notes?days=5')
  })
})
