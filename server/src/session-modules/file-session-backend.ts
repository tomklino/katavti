import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SessionBackend } from '../services/session-manager.js'

function fileName(token: string) {
  return `${Buffer.from(token).toString('base64url')}.json`
}

function tokenFromFile(file: string) {
  return Buffer.from(file.slice(0, -5), 'base64url').toString()
}

export class FileSessionBackend<T> implements SessionBackend<T> {
  private readonly directory: string

  constructor(options: { directory: string }) {
    this.directory = options.directory
  }

  async load() {
    await mkdir(this.directory, { recursive: true })
    const sessions = new Map<string, T>()
    for (const file of await readdir(this.directory)) {
      if (!file.endsWith('.json')) continue
      sessions.set(tokenFromFile(file), JSON.parse(await readFile(path.join(this.directory, file), 'utf8')) as T)
    }
    return sessions
  }

  async get(token: string) {
    try {
      return JSON.parse(await readFile(path.join(this.directory, fileName(token)), 'utf8')) as T
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
  }

  async save(token: string, value: T) {
    await mkdir(this.directory, { recursive: true })
    const destination = path.join(this.directory, fileName(token))
    const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 })
    await rename(temporary, destination)
  }

  async delete(token: string) {
    await rm(path.join(this.directory, fileName(token)), { force: true })
  }
}
