import { NotesError } from './notes-data.js'

export function staleNoteError() {
  return new NotesError('Stale note conflict: this note changed on another device. Your draft was not saved.', 409)
}

export function checkRevision(expected: string | undefined, current: { content: string; revision: string } | undefined) {
  // Older clients may create a note or populate an empty slot, but cannot
  // overwrite existing content without proving which version they edited.
  if (expected === undefined ? Boolean(current?.content) : !current || expected !== current.revision) {
    throw staleNoteError()
  }
}
