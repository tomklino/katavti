export type Note = { content: string; ISODateString: string; tags: Array<[string, string]> }

export class NotesError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

export type NotesData = {
  createDaily(userId: string, count: number, date?: string): Promise<string[]>
  read(userId: string, id: string): Promise<Note>
  update(userId: string, id: string, content: string): Promise<string>
  list(userId: string, query: { days?: number; bug?: string }): Promise<string[]>
}
