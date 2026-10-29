import { NotesError } from './notes-data.js'

export const MAX_ASSET_BYTES = 50 * 1024 * 1024
export type AssetsData = {
  uploadAsset(userId: string, noteId: string, filename: string, bytes: Uint8Array): Promise<void>
  readAsset(userId: string, noteId: string, filename: string): Promise<Uint8Array>
}

// A generated UUID prevents same-name uploads from replacing each other.
export function validateAssetFilename(filename: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[a-zA-Z0-9._-]{1,120}$/.test(filename)) {
    throw new NotesError('Invalid asset filename', 400)
  }
  return filename
}

export function assetDownloadName(filename: string) { return validateAssetFilename(filename).slice(37) }
