import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backUpNoteAssets, noteAssetImageUrl, uploadNoteAsset, type StoredAsset } from '@/api/assets'

const records = new Map<string, StoredAsset>()
let storageError: Error | undefined
const requests: MockRequest[] = []
class MockRequest {
  upload: { onprogress?: (event: ProgressEvent) => void; onload?: (event: ProgressEvent) => void } = {}
  status = 0
  responseText = ''
  withCredentials = false
  onload?: () => void
  onerror?: () => void
  onabort?: () => void
  ontimeout?: () => void
  open = vi.fn()
  send = vi.fn()
  constructor() { requests.push(this) }
  respond(status: number, body = '') { this.status = status; this.responseText = body; this.onload?.() }
}

beforeEach(() => {
  records.clear(); requests.length = 0; storageError = undefined
  vi.stubGlobal('XMLHttpRequest', MockRequest)
  vi.stubGlobal('indexedDB', {
    open() {
      const request = {} as IDBOpenDBRequest
      Object.defineProperty(request, 'result', { value: {
        close: vi.fn(),
        transaction() {
          const transaction = {} as IDBTransaction
          const complete = () => queueMicrotask(() => transaction.oncomplete?.(new Event('complete')))
          transaction.objectStore = () => ({
            put(asset: StoredAsset) {
              if (storageError) throw storageError
              records.set(asset.key, asset)
              complete()
              return { result: asset.key }
            },
            get(key: string) { complete(); return { result: records.get(key) } },
          } as unknown as IDBObjectStore)
          return transaction
        },
      } as unknown as IDBDatabase })
      queueMicrotask(() => request.onsuccess?.(new Event('success')))
      return request
    },
  })
  vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:image') })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const noteId = '2026%2Fseptember.d%2Fnote.md'
const owner = 'alice@example.com'

describe('asset upload API', () => {
  it('reports browser storage immediately and completes locally without a network request', async () => {
    const progress = vi.fn()
    const file = new File(['bytes'], 'sample.bin')
    const pending = uploadNoteAsset(noteId, file, '', progress)
    expect(progress).toHaveBeenCalledWith({ stage: 'saving', percent: null })
    const result = await pending
    expect(result.markdown).toBe(`[sample.bin](../assets/${result.filename})`)
    expect(progress).toHaveBeenLastCalledWith({ stage: 'complete', percent: 100 })
    expect(requests).toHaveLength(0)
    expect([...records.values()][0]).toMatchObject({ blob: file, synced: false })
  })

  it('reports real XHR upload progress, waits for server confirmation, and marks bytes synced', async () => {
    const progress = vi.fn()
    const file = new File(['bytes'], 'sample.bin')
    const pending = uploadNoteAsset(noteId, file, owner, progress)
    await flushPromises()
    const request = requests[0]
    expect(request.open).toHaveBeenCalledWith('PUT', expect.stringContaining(`/api/v1beta/notes/${noteId}/assets/`))
    expect(request.withCredentials).toBe(true)
    expect(request.send).toHaveBeenCalledWith(file)
    expect(progress).toHaveBeenLastCalledWith({ stage: 'uploading', percent: 0 })
    request.upload.onprogress?.(new ProgressEvent('progress', { lengthComputable: true, loaded: 2, total: 5 }))
    expect(progress).toHaveBeenLastCalledWith({ stage: 'uploading', percent: 40 })
    request.upload.onload?.(new ProgressEvent('load'))
    expect(progress).toHaveBeenLastCalledWith({ stage: 'processing', percent: 100 })
    expect([...records.values()][0].synced).toBe(false)
    request.respond(201)
    expect((await pending).warning).toBe('')
    expect([...records.values()][0].synced).toBe(true)
    expect(progress).toHaveBeenLastCalledWith({ stage: 'complete', percent: 100 })
  })

  it('reports indeterminate network progress when the total is unknown', async () => {
    const progress = vi.fn()
    const pending = uploadNoteAsset(noteId, new File(['x'], 'sample.bin'), owner, progress)
    await flushPromises()
    requests[0].upload.onprogress?.(new ProgressEvent('progress', { loaded: 1 }))
    expect(progress).toHaveBeenLastCalledWith({ stage: 'uploading', percent: null })
    requests[0].respond(201)
    await pending
  })

  it.each(['http', 'network', 'abort', 'timeout'])('retains local bytes and warns on %s failure', async failure => {
    const pending = uploadNoteAsset(noteId, new File(['x'], 'sample.bin'), owner)
    await flushPromises()
    const request = requests[0]
    if (failure === 'http') request.respond(503, 'Not JSON')
    else if (failure === 'network') request.onerror?.()
    else if (failure === 'abort') request.onabort?.()
    else request.ontimeout?.()
    expect((await pending).warning).toContain('Asset saved in this browser only')
    expect([...records.values()][0].synced).toBe(false)
  })

  it('rejects quota failures before network upload or link creation', async () => {
    storageError = new Error('Quota exceeded')
    await expect(uploadNoteAsset(noteId, new File(['x'], 'sample.bin'), owner)).rejects.toThrow('Quota exceeded')
    expect(requests).toHaveLength(0)
  })

  it('rejects oversized files before storage', async () => {
    const file = new File(['x'], 'large.bin')
    Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 + 1 })
    await expect(uploadNoteAsset(noteId, file)).rejects.toThrow('50 MiB')
    expect(records.size).toBe(0)
  })

  it.each([
    ['picture.png', 'image/png', true],
    ['picture', 'image/jpeg', true],
    ['picture.JPG', '', true],
    ['drawing.svg', 'image/svg+xml', true],
    ['document.pdf', 'application/pdf', false],
    ['picture.png', 'text/plain', false],
  ])('formats %s (%s) correctly as image=%s', async (name, type, image) => {
    const result = await uploadNoteAsset(noteId, new File(['x'], name, { type }))
    expect(result.markdown.startsWith('![')).toBe(image)
  })

  it('escapes image labels without breaking Markdown', async () => {
    const result = await uploadNoteAsset(noteId, new File(['x'], 'photo [1]\\name.png', { type: 'image/png' }))
    expect(result.markdown).toContain('![photo \\[1\\]\\\\name.png]')
  })

  it('backs up image references with the same asset link scanner', async () => {
    const image = await uploadNoteAsset(noteId, new File(['x'], 'picture.png', { type: 'image/png' }))
    const pending = backUpNoteAssets(noteId, `${image.markdown}\n${image.markdown}`, owner)
    await flushPromises()
    expect(requests).toHaveLength(1)
    requests[0].respond(201)
    await pending
    expect(records.get(`${owner}/2026/september.d/assets/${image.filename}`)?.synced).toBe(true)
  })
})

describe('development upload minimum duration', () => {
  function enableDelay() {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_DEV_ASSET_MIN_DURATION_MS', '5000')
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  }

  it('holds local uploads for five seconds before reporting completion', async () => {
    enableDelay()
    const progress = vi.fn()
    const completed = vi.fn()
    const pending = uploadNoteAsset(noteId, new File(['x'], 'sample.bin'), '', progress).then(completed)
    await flushPromises()
    expect(progress).toHaveBeenLastCalledWith({ stage: 'processing', percent: 100 })
    await vi.advanceTimersByTimeAsync(4999)
    expect(completed).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(completed).toHaveBeenCalledOnce()
    expect(progress).toHaveBeenLastCalledWith({ stage: 'complete', percent: 100 })
  })

  it('waits only the remaining duration after an authenticated upload', async () => {
    enableDelay()
    const completed = vi.fn()
    const pending = uploadNoteAsset(noteId, new File(['x'], 'sample.bin'), owner).then(completed)
    await flushPromises()
    await vi.advanceTimersByTimeAsync(3000)
    requests[0].respond(201)
    await flushPromises()
    await vi.advanceTimersByTimeAsync(1999)
    expect(completed).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(completed).toHaveBeenCalledOnce()
  })

  it('adds no extra delay when the real upload takes longer than five seconds', async () => {
    enableDelay()
    const pending = uploadNoteAsset(noteId, new File(['x'], 'sample.bin'), owner)
    await flushPromises()
    await vi.advanceTimersByTimeAsync(6000)
    requests[0].respond(201)
    await pending
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores the option in production', async () => {
    enableDelay()
    vi.stubEnv('DEV', false)
    await uploadNoteAsset(noteId, new File(['x'], 'sample.bin'))
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['invalid', '-1', 'Infinity'])('ignores invalid duration %s', async duration => {
    enableDelay()
    vi.stubEnv('VITE_DEV_ASSET_MIN_DURATION_MS', duration)
    await uploadNoteAsset(noteId, new File(['x'], 'sample.bin'))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports storage failures immediately even with the option enabled', async () => {
    enableDelay()
    storageError = new Error('Quota exceeded')
    await expect(uploadNoteAsset(noteId, new File(['x'], 'sample.bin'))).rejects.toThrow('Quota exceeded')
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('image attachment URLs', () => {
  it('uses cached images without network access', async () => {
    const image = await uploadNoteAsset(noteId, new File(['x'], 'picture.png', { type: 'image/png' }))
    expect(await noteAssetImageUrl(noteId, image.filename)).toBe('blob:image')
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/png' }))
  })

  it('fetches authenticated image bytes and assigns the image MIME type while retaining the cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x'], { type: 'application/octet-stream' }) })
    vi.stubGlobal('fetch', fetchMock)
    const filename = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa-photo.png'
    expect(await noteAssetImageUrl(noteId, filename, owner)).toBe('blob:image')
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(filename), { credentials: 'include' })
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/png' }))
    await noteAssetImageUrl(noteId, filename, owner)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects arbitrary documents as images', async () => {
    const asset = await uploadNoteAsset(noteId, new File(['<script>'], 'unsafe.html', { type: 'text/html' }))
    await expect(noteAssetImageUrl(noteId, asset.filename)).rejects.toThrow('Unsupported image')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})
