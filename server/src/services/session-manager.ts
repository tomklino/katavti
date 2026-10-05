export interface SessionBackend<T> {
  load(): Promise<Map<string, T>>
  get(token: string): Promise<T | undefined>
  save(token: string, value: T): Promise<void>
  delete(token: string): Promise<void>
}

export interface SessionManagerOptions {
  lazy?: boolean
  cache?: boolean
}

export class SessionManager<T> {
  private constructor(
    private readonly backend: SessionBackend<T>,
    private readonly sessions: Map<string, T>,
    private readonly options: Required<SessionManagerOptions>,
  ) {}

  static async initialize<T>(backend: SessionBackend<T>, options: SessionManagerOptions = {}) {
    const resolved = { lazy: options.lazy ?? true, cache: options.cache ?? true }
    const sessions = resolved.lazy ? new Map<string, T>() : await backend.load()
    return new SessionManager(backend, sessions, resolved)
  }

  async get(token?: string) {
    if (!token) return undefined
    if (this.options.cache && this.sessions.has(token)) return this.sessions.get(token)
    const value = await this.backend.get(token)
    if (value !== undefined && this.options.cache) this.sessions.set(token, value)
    return value
  }

  async set(token: string, value: T) {
    await this.backend.save(token, value)
    if (this.options.cache) this.sessions.set(token, value)
  }

  async delete(token?: string) {
    if (!token) return
    await this.backend.delete(token)
    this.sessions.delete(token)
  }
}
