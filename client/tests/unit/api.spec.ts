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

  it('sends the read revision as a save precondition and retains HTTP conflict status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'Stale note conflict' }) })
    vi.stubGlobal('fetch', fetchMock)
    await expect(createNotesApi().update('note', 'Draft', 'r1')).rejects.toMatchObject({ status: 409, message: 'Stale note conflict' })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ content: 'Draft', revision: 'r1' })
  })

  it('uses a separate import endpoint instead of an overwrite', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'renamed', note: { content: 'Draft', revision: 'r2' } }) })
    vi.stubGlobal('fetch', fetchMock)
    expect(await createNotesApi().importNote('original', 'Draft')).toMatchObject({ id: 'renamed' })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1beta/notes/import')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ id: 'original', content: 'Draft' })
  })

  it('still permits an explicit API origin for standalone development', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    vi.stubGlobal('fetch', fetchMock)

    await createNotesApi('http://127.0.0.1:3030').list({ days: 5 })

    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:3030/api/v1beta/notes?days=5')
  })
})
