export type Note = { content: string; ISODateString: string; tags: Array<[string, string]>; revision?: string; backedUpContent?: string }
export type SaveResult = string | { id: string; revision?: string }
export type ImportResult = { id: string; note: Note }
export type ListQuery = { days?: number; bug?: string }
export type NotesApi = ReturnType<typeof createNotesApi>

export function createNotesApi(baseUrl = import.meta.env.VITE_API_URL || '') {
  async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${baseUrl}/api/v1beta${url}`, { ...init, credentials: 'include' })
    const body = await response.json()
    if (!response.ok) throw Object.assign(new Error(body.error || `Request failed (${response.status})`), { status: response.status })
    return body
  }
  return {
    list(query: ListQuery) {
      const params = new URLSearchParams()
      if (query.bug) params.set('bug', query.bug)
      else if (query.days !== undefined) params.set('days', String(query.days))
      return request<string[]>(`/notes?${params}`)
    },
    read: (id: string) => request<Note>(`/notes/${id}`),
    update: (id: string, content: string, revision?: string) => request<SaveResult>(`/notes/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content, revision }) }),
    importNote: (id: string, content: string) => request<ImportResult>('/notes/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, content }) }),
    createDaily: (count: number, date: string) => request<string[]>(`/notes/daily?num=${count}&date=${date}`, { method: 'PUT' }),
  }
}

export const notesApi = createNotesApi()
