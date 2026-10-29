const MAX_ASSET_BYTES = 50 * 1024 * 1024
export const assetLinkPattern = /\.\.\/assets\/([0-9a-f-]{36}-[a-zA-Z0-9._-]{1,120})/g
export type StoredAsset = { key: string; month: string; filename: string; name: string; blob: Blob; synced: boolean }

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

async function uploadRemote(noteId: string, asset: StoredAsset, owner: string) {
  const response = await fetch(assetUrl(noteId, asset.filename), { method: 'PUT', credentials: 'include', body: asset.blob })
  if (!response.ok) {
    const body = await response.json()
    throw new Error(body.error || `Asset upload failed (${response.status})`)
  }
  await putAsset({ ...asset, key: keyFor(noteId, asset.filename, owner), synced: true })
}

export async function uploadNoteAsset(noteId: string, file: File, owner = '') {
  if (file.size > MAX_ASSET_BYTES) throw new Error('Assets must be 50 MiB or smaller.')
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'file'
  const filename = `${crypto.randomUUID()}-${safeName}`
  const asset: StoredAsset = { key: keyFor(noteId, filename, owner), month: monthFor(noteId), filename, name: file.name, blob: file, synced: false }
  // Persist bytes before inserting a link. A quota error must not create a broken link.
  await putAsset(asset)
  let warning = ''
  if (owner) {
    try { await uploadRemote(noteId, asset, owner) }
    catch { warning = 'Asset saved in this browser only. Server backup failed; log in again to retry.' }
  }
  const label = file.name.replace(/[\\\[\]]/g, '\\$&').replace(/[\r\n]/g, ' ')
  return { markdown: `[${label}](../assets/${filename})`, filename, warning }
}

export async function backUpNoteAssets(noteId: string, content: string, owner = '', sourceId = noteId) {
  const filenames = [...new Set(Array.from(content.matchAll(assetLinkPattern), match => match[1]))]
  for (const filename of filenames) {
    const asset = await getAsset(sourceId, filename, owner)
    if (asset && (!asset.synced || asset.key !== keyFor(noteId, filename, owner))) await uploadRemote(noteId, asset, owner)
  }
}

export async function downloadNoteAsset(noteId: string, filename: string, owner = '') {
  let asset = await getAsset(noteId, filename, owner)
  if (!asset) {
    if (!owner) throw new Error('This asset is not available in this browser.')
    const response = await fetch(assetUrl(noteId, filename), { credentials: 'include' })
    if (!response.ok) throw new Error(`Unable to download asset (${response.status}).`)
    const blob = await response.blob()
    asset = { key: keyFor(noteId, filename, owner), month: monthFor(noteId), filename, name: filename.slice(37), blob, synced: true }
    await putAsset(asset)
  }
  const url = URL.createObjectURL(asset.blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = asset.name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
