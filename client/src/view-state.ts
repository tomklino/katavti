import type { EditorSelection, Text } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import type { Store } from 'vuex'
import type { State } from '@/store'

export type EditorPosition = {
  doc: Text
  selection: EditorSelection
  scroll: ReturnType<EditorView['scrollSnapshot']>
}

type NotePosition = {
  raw: boolean
  editor?: EditorPosition
  rawScroll: number
  previewScroll: number
}

type ViewState = {
  daily: { date: string; activeId?: string; notes: Map<string, NotePosition> }
  home: { scrollTop: number; notes: Map<string, NotePosition> }
}

// Navigation state belongs to this app instance, not to persisted note data.
const viewStates = new WeakMap<Store<State>, ViewState>()

export function getViewState(store: Store<State>): ViewState {
  let state = viewStates.get(store)
  if (!state) {
    state = { daily: { date: '', notes: new Map() }, home: { scrollTop: 0, notes: new Map() } }
    viewStates.set(store, state)
  }
  return state
}
