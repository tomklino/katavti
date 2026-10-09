import { createStore as createVuexStore, type Store } from 'vuex'
import { authApi, type User } from '@/api/auth'
import { backUpLocalNotes, createLocalNotesApi, createSyncedNotesApi } from '@/api/local-notes'
import { notesApi, type ListQuery, type Note, type NotesApi } from '@/api/notes'

function browserDay(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export type State = {
  days: number; bug: string; noteIds: string[]; dailyIds: string[]; notes: Record<string, Note>
  unsavedNotes: Record<string, boolean>; saveErrors: Record<string, string | null>
  dailyDate: string; previousDayWarning: boolean
  loading: boolean; error: string | null; user: User | null; storageWarning: boolean; backupStatus: string
}

type SaveQueue = {
  running: boolean
  queued: string | null
  waiters: Array<{ resolve: () => void; reject: (error: unknown) => void }>
}

export function createStore(remoteApi: NotesApi = notesApi, localApi: NotesApi = createLocalNotesApi(), storage: Storage = localStorage): Store<State> {
  const selectedApi = (state: State) => state.user ? createSyncedNotesApi(localApi, remoteApi) : localApi
  const devSaveDelay = import.meta.env.DEV
    ? Math.max(0, Number(new URLSearchParams(location.search).get('devSaveDelay')) || 0)
    : 0
  const saveQueues = new Map<string, SaveQueue>()
  return createVuexStore<State>({
    state: { dailyDate: '', previousDayWarning: false, days: 5, bug: '', noteIds: [], dailyIds: [], notes: {}, unsavedNotes: {}, saveErrors: {}, loading: false, error: null, user: null, storageWarning: false, backupStatus: '' },
    mutations: {
      setFilter(state, query: ListQuery) { if (query.days !== undefined) state.days = query.days; state.bug = query.bug || '' },
      setIds(state, ids: string[]) { state.noteIds = ids }, setDailyIds(state, ids: string[]) { state.dailyIds = ids },
      setNote(state, { id, note }: { id: string; note: Note }) { state.notes[id] = note },
      setDailyDate(state, date: string) { state.dailyDate = date; state.previousDayWarning = false },
      setPreviousDayWarning(state, value: boolean) { state.previousDayWarning = value },
      setNoteContent(state, { id, content }: { id: string; content: string }) {
        if (state.dailyDate && state.dailyDate < browserDay() && state.dailyIds.includes(id)) state.previousDayWarning = true
        const previous = state.notes[id]
        state.notes[id] = { ...previous, content, ISODateString: previous?.ISODateString || new Date().toISOString(), tags: previous?.tags || [] }
      },
      setNoteUnsaved(state, { id, value }: { id: string; value: boolean }) { state.unsavedNotes[id] = value },
      setNoteRevision(state, { id, revision }: { id: string; revision: string }) { if (state.notes[id]) state.notes[id].revision = revision },
      setSaveError(state, { id, error }: { id: string; error: string | null }) { state.saveErrors[id] = error },
      setLoading(state, value: boolean) { state.loading = value }, setError(state, value: string | null) { state.error = value },
      setUser(state, user: User | null) { state.user = user }, setStorageWarning(state, value: boolean) { state.storageWarning = value },
      setBackupStatus(state, value: string) { state.backupStatus = value },
    },
    actions: {
      async completeLogin({ state, commit, dispatch }, user: User) {
        commit('setUser', user); commit('setStorageWarning', false); commit('setBackupStatus', 'Backing up local notes…')
        try {
          const count = await backUpLocalNotes(remoteApi, storage)
          commit('setBackupStatus', count ? `${count} local note${count === 1 ? '' : 's'} backed up.` : '')
          if (state.dailyIds.length) await dispatch('loadDaily', state.dailyIds.length)
          else await dispatch('loadNotes')
        } catch (error) {
          commit('setBackupStatus', 'Local notes are safe in this browser, but backup failed.')
          throw error
        }
      },
      async initializeAuth({ commit, dispatch }) {
        const token = new URLSearchParams(location.search).get('token')
        const result = token ? await authApi.verifyMagicLink(token) : await authApi.session()
        if (token && result.user) await dispatch('completeLogin', result.user)
        else commit('setUser', result.user)
        if (token) history.replaceState({}, '', location.pathname)
      },
      async googleLogin({ dispatch }, credential: string) { const { user } = await authApi.google(credential); await dispatch('completeLogin', user) },
      async fakeLogin({ dispatch }, email: string) { const { user } = await authApi.fakeLogin(email); await dispatch('completeLogin', user) },
      async logout({ commit }) { await authApi.logout(); commit('setUser', null) },
      dismissStorageWarning({ commit }) { sessionStorage.setItem('katavti.storage-warning-dismissed', '1'); commit('setStorageWarning', false) },
      async loadNotes({ state, commit }, query?: ListQuery) {
        const effective = query || (state.bug ? { bug: state.bug } : { days: state.days })
        commit('setLoading', true); commit('setError', null)
        try {
          commit('setFilter', effective)
          const api = selectedApi(state); const ids = await api.list(effective); commit('setIds', ids)
          await Promise.all(ids.map(async id => commit('setNote', { id, note: await api.read(id) })))
        } catch (error: any) { commit('setError', error.message); throw error }
        finally { commit('setLoading', false) }
      },
      async loadDaily({ state, commit }, count: number) {
        const api = selectedApi(state); const date = browserDay()
        const ids = await api.createDaily(count, date)
        await Promise.all(ids.map(async id => commit('setNote', { id, note: await api.read(id) })))
        commit('setDailyIds', ids); commit('setDailyDate', date)
      },
      async reloadNote({ state, commit }, id: string) {
        try {
          // Unlike normal offline-friendly reads, conflict recovery must fetch
          // the latest remote version, not silently return the local draft.
          const note = await (state.user ? remoteApi : localApi).read(id)
          if (state.user) await localApi.update(id, note.content, note.revision)
          commit('setNote', { id, note })
          commit('setNoteUnsaved', { id, value: false })
          commit('setSaveError', { id, error: null })
        } catch (error) {
          commit('setSaveError', { id, error: `Unable to reload this note: ${(error as Error).message || 'Please try again.'}` })
          throw error
        }
      },
      saveNote({ state, commit }, { id, content }: { id: string; content: string }) {
        commit('setNoteContent', { id, content })
        commit('setNoteUnsaved', { id, value: true })

        const existing = saveQueues.get(id)
        if (existing) {
          existing.queued = content
          return new Promise<void>((resolve, reject) => existing.waiters.push({ resolve, reject }))
        }

        const queue: SaveQueue = { running: true, queued: null, waiters: [] }
        saveQueues.set(id, queue)
        return (async () => {
          let next: string | null = content
          try {
            while (next !== null) {
              const saving = next
              queue.queued = null
              let attempts = 0
              while (true) {
                try {
                  const api = selectedApi(state)
                  const saved = state.user
                    ? await api.update(id, saving, state.notes[id]?.revision)
                    : await api.update(id, saving)
                  if (typeof saved !== 'string' && saved?.revision) commit('setNoteRevision', { id, revision: saved.revision })
                  commit('setSaveError', { id, error: null })
                  break
                } catch (error) {
                  attempts += 1
                  const status = (error as { status?: number })?.status
                  if (status === 409 || status === 412 || attempts >= 3) throw error
                  await new Promise(resolve => window.setTimeout(resolve, 500 * attempts))
                }
              }
              if (devSaveDelay) await new Promise(resolve => window.setTimeout(resolve, devSaveDelay))
              next = queue.queued
              if (next === null && state.notes[id]?.content === saving) {
                commit('setNoteUnsaved', { id, value: false })
              }
            }
            queue.waiters.forEach(waiter => waiter.resolve())
            if (!state.user && !sessionStorage.getItem('katavti.storage-warning-dismissed')) commit('setStorageWarning', true)
          } catch (error) {
            commit('setSaveError', { id, error: (error as Error).message || 'Unable to save this note. Your draft remains in this browser.' })
            queue.waiters.forEach(waiter => waiter.reject(error))
            throw error
          } finally {
            saveQueues.delete(id)
          }
        })()
      },
    },
  })
}

export default createStore()
