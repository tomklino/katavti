const MAX_ASSET_BYTES = 50 * 1024 * 1024
export const assetLinkPattern = /\.\.\/assets\/([0-9a-f-]{36}-[a-zA-Z0-9._-]{1,120})/g
export type StoredAsset = { key: string; month: string; filename: string; name: string; blob: Blob; synced: boolean }
export type AssetUploadProgress = { stage: 'saving' | 'uploading' | 'processing' | 'complete'; percent: number | null }
export type AssetProgressHandler = (progress: AssetUploadProgress) => void

function monthFor(noteId: string) { return decodeURIComponent(noteId).split('/').slice(0, 2).join('/') }
function keyFor(noteId: string, filename: string, owner: string) { return `${owner}/${monthFor(noteId)}/assets/${filename}` }

async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('katavti.assets.v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('assets', { keyPath: 'key' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function stored<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await database()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction('assets', mode)
      const request = operation(transaction.objectStore('assets'))
      transaction.oncomplete = () => resolve(request.result as T)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error || new Error('Browser asset storage failed'))
    })
  } finally { db.close() }
}

async function getAsset(noteId: string, filename: string, owner: string) {
  const asset = await stored<StoredAsset | undefined>('readonly', store => store.get(keyFor(noteId, filename, owner)))
  return asset || (owner ? stored<StoredAsset | undefined>('readonly', store => store.get(keyFor(noteId, filename, ''))) : undefined)
}
const putAsset = (asset: StoredAsset) => stored('readwrite', store => store.put(asset))
const assetUrl = (noteId: string, filename: string) => `${import.meta.env.VITE_API_URL || ''}/api/v1beta/notes/${noteId}/assets/${filename}`

async function uploadRemote(noteId: string, asset: StoredAsset, owner: string, onProgress?: AssetProgressHandler) {
  // Fetch has no upload-progress events. XHR reports bytes sent while the
  // response still tells us when server-side storage has actually finished.
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.upload.onprogress = event => onProgress?.({
      stage: 'uploading', percent: event.lengthComputable ? Math.round(event.loaded / event.total * 100) : null,
    })
    request.upload.onload = () => onProgress?.({ stage: 'processing', percent: 100 })
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) { resolve(); return }
      let message = `Asset upload failed (${request.status})`
      try { message = JSON.parse(request.responseText).error || message } catch { /* Non-JSON server error. */ }
      reject(new Error(message))
    }
    request.onerror = () => reject(new Error('Asset upload failed: network error'))
    request.onabort = () => reject(new Error('Asset upload cancelled'))
    request.ontimeout = () => reject(new Error('Asset upload timed out'))
    request.open('PUT', assetUrl(noteId, asset.filename))
    request.withCredentials = true
    onProgress?.({ stage: 'uploading', percent: 0 })
    request.send(asset.blob)
  })
  await putAsset({ ...asset, key: keyFor(noteId, asset.filename, owner), synced: true })
}

export async function uploadNoteAsset(noteId: string, file: File, owner = '', onProgress?: AssetProgressHandler) {
  const startedAt = Date.now()
  const configuredMinimum = import.meta.env.DEV ? Number(import.meta.env.VITE_DEV_ASSET_MIN_DURATION_MS) : 0
  const minimumDuration = Number.isFinite(configuredMinimum) ? Math.max(0, configuredMinimum) : 0
  if (file.size > MAX_ASSET_BYTES) throw new Error('Assets must be 50 MiB or smaller.')
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'file'
  const filename = `${crypto.randomUUID()}-${safeName}`
  const asset: StoredAsset = { key: keyFor(noteId, filename, owner), month: monthFor(noteId), filename, name: file.name, blob: file, synced: false }
  // Persist bytes before inserting a link. A quota error must not create a broken link.
  onProgress?.({ stage: 'saving', percent: null })
  await putAsset(asset)
  let warning = ''
  if (owner) {
    try { await uploadRemote(noteId, asset, owner, onProgress) }
    catch { warning = 'Asset saved in this browser only. Server backup failed; log in again to retry.' }
  }
  // Opt-in development simulation: keep both local and authenticated uploads
  // pending long enough to test editing, without faking network byte progress.
  const remaining = minimumDuration - (Date.now() - startedAt)
  if (remaining > 0) {
    onProgress?.({ stage: 'processing', percent: 100 })
    await new Promise(resolve => window.setTimeout(resolve, remaining))
  }
  onProgress?.({ stage: 'complete', percent: 100 })
  const label = file.name.replace(/[\\\[\]]/g, '\\$&').replace(/[\r\n]/g, ' ')
  const image = file.type.startsWith('image/') || (!file.type && /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico)$/i.test(file.name))
  return { markdown: `${image ? '!' : ''}[${label}](../assets/${filename})`, filename, warning }
}

export async function backUpNoteAssets(noteId: string, content: string, owner = '', sourceId = noteId) {
  const filenames = [...new Set(Array.from(content.matchAll(assetLinkPattern), match => match[1]))]
  for (const filename of filenames) {
    const asset = await getAsset(sourceId, filename, owner)
    if (asset && (!asset.synced || asset.key !== keyFor(noteId, filename, owner))) await uploadRemote(noteId, asset, owner)
  }
}

async function loadNoteAsset(noteId: string, filename: string, owner: string) {
  let asset = await getAsset(noteId, filename, owner)
  if (!asset) {
    if (!owner) throw new Error('This asset is not available in this browser.')
    const response = await fetch(assetUrl(noteId, filename), { credentials: 'include' })
    if (!response.ok) throw new Error(`Unable to download asset (${response.status}).`)
    const blob = await response.blob()
    asset = { key: keyFor(noteId, filename, owner), month: monthFor(noteId), filename, name: filename.slice(37), blob, synced: true }
    await putAsset(asset)
  }
  return asset
}

export async function noteAssetImageUrl(noteId: string, filename: string, owner = '') {
  const asset = await loadNoteAsset(noteId, filename, owner)
  // Remote downloads intentionally use application/octet-stream. Only allow
  // recognized image formats into an <img>, never an executable document.
  const types: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon' }
  const type = asset.blob.type.startsWith('image/') ? asset.blob.type : types[asset.name.split('.').pop()?.toLowerCase() || '']
  if (!type) throw new Error('Unsupported image attachment format.')
  return URL.createObjectURL(new Blob([asset.blob], { type }))
}

export async function downloadNoteAsset(noteId: string, filename: string, owner = '') {
  const asset = await loadNoteAsset(noteId, filename, owner)
  const url = URL.createObjectURL(asset.blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = asset.name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
