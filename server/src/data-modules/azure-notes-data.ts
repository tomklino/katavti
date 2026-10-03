import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob'
import { DefaultAzureCredential, ManagedIdentityCredential } from '@azure/identity'
import { NotesError, type Note, type NotesData } from './notes-data.js'

type AzureContainer = Pick<ContainerClient, 'createIfNotExists' | 'getBlockBlobClient' | 'listBlobsFlat'>

type AzureNotesOptions = {
  connectionString?: string
  accountName?: string
  containerName?: string
  clientId?: string
  container?: AzureContainer
  now?: () => Date
}

export function createAzureNotesData(options: AzureNotesOptions): NotesData {
  if (!options.container && (!options.containerName || (!options.connectionString && !options.accountName))) {
    throw new Error('Azure notes data requires containerName and either connectionString or accountName')
  }
  const service = options.connectionString
    ? BlobServiceClient.fromConnectionString(options.connectionString)
    : new BlobServiceClient(
      `https://${options.accountName}.blob.core.windows.net`,
      options.clientId ? new ManagedIdentityCredential(options.clientId) : new DefaultAzureCredential(),
    )
  const container = options.container ?? service.getContainerClient(options.containerName!)
  const now = options.now ?? (() => new Date())
  let initialized: Promise<unknown> | undefined
  const initialize = () => initialized ??= container.createIfNotExists()

  function validateUserId(userId: string) {
    if (!userId || userId === '.' || userId === '..' || /[\\/\0]/.test(userId)) throw new NotesError('Invalid user ID', 400)
  }

  function decodeNoteId(id: string) {
    let decoded: string
    try { decoded = decodeURIComponent(id) } catch { throw new NotesError('Invalid note ID', 400) }
    if (!/^\d{4}\/[a-z]+\.d\/workspaces-\d{4}-\d{2}-\d{2}\/workspace-\d+\.md$/.test(decoded)) {
      throw new NotesError('Invalid note ID', 400)
    }
    return decoded
  }

  function blobName(userId: string, id: string) {
    validateUserId(userId)
    return `${userId}/${decodeNoteId(id)}`
  }

  function dateFromId(id: string) {
    const match = id.match(/workspaces-(\d{4}-\d{2}-\d{2})/)
    if (!match) throw new NotesError('Invalid note ID', 400)
    return new Date(`${match[1]}T00:00:00.000Z`)
  }

  function directoryFor(date: Date) {
    const iso = date.toISOString().slice(0, 10)
    const month = date.toLocaleString('en', { month: 'long', timeZone: 'UTC' }).toLowerCase()
    return `${date.getUTCFullYear()}/${month}.d/workspaces-${iso}`
  }

  function isNotFound(error: unknown) {
    return (error as { statusCode?: number })?.statusCode === 404
  }

  async function createDaily(userId: string, count: number, dateString?: string) {
    validateUserId(userId)
    if (!Number.isInteger(count) || count < 1 || count > 100) throw new NotesError('num must be an integer from 1 to 100', 400)
    const date = dateString ? new Date(`${dateString}T00:00:00.000Z`) : now()
    if (Number.isNaN(date.getTime()) || (dateString && (!/^\d{4}-\d{2}-\d{2}$/.test(dateString) || date.toISOString().slice(0, 10) !== dateString))) throw new NotesError('Invalid date', 400)
    await initialize()
    const directory = directoryFor(date)
    const prefix = `${userId}/${directory}/`
    let highestExisting = 0
    for await (const blob of container.listBlobsFlat({ prefix })) {
      const match = blob.name.slice(prefix.length).match(/^workspace-(\d+)\.md$/)
      if (match) highestExisting = Math.max(highestExisting, Number(match[1]))
    }
    const total = Math.max(count, highestExisting)
    const ids: string[] = []
    for (let number = 1; number <= total; number++) {
      const id = `${directory}/workspace-${number}.md`
      try {
        await container.getBlockBlobClient(`${userId}/${id}`).upload('', 0, { conditions: { ifNoneMatch: '*' } })
      } catch (error: any) {
        if (error?.statusCode !== 409 && error?.code !== 'BlobAlreadyExists') throw error
      }
      ids.push(encodeURIComponent(id))
    }
    return ids
  }

  async function read(userId: string, id: string): Promise<Note> {
    const decoded = decodeNoteId(id)
    try {
      await initialize()
      const content = (await container.getBlockBlobClient(blobName(userId, id)).downloadToBuffer()).toString('utf8')
      return { content, ISODateString: dateFromId(decoded).toISOString(), tags: [] }
    } catch (error) {
      if (isNotFound(error)) throw new NotesError('Note not found', 404)
      throw error
    }
  }

  async function update(userId: string, id: string, content: string) {
    if (typeof content !== 'string') throw new NotesError('content must be a string', 400)
    const decoded = decodeNoteId(id)
    await initialize()
    await container.getBlockBlobClient(blobName(userId, id)).upload(content, Buffer.byteLength(content))
    return decoded
  }

  async function list(userId: string, query: { days?: number; bug?: string }) {
    validateUserId(userId)
    await initialize()
    const prefix = `${userId}/`
    const cutoff = new Date(now()); cutoff.setUTCDate(cutoff.getUTCDate() - (query.days ?? 5))
    const matched: string[] = []
    for await (const blob of container.listBlobsFlat({ prefix })) {
      const id = blob.name.slice(prefix.length)
      if (!/\.md$/.test(id)) continue
      let content: string
      try { content = (await container.getBlockBlobClient(blob.name).downloadToBuffer()).toString('utf8') } catch { continue }
      if (query.bug) {
        if (!content.split('\n').some(line => ['Bug', 'Label'].some(label => line.trim() === `${label}: ${query.bug}`))) continue
      } else if (!content.length || dateFromId(id) < cutoff) continue
      matched.push(id)
    }
    return matched.sort((a, b) => dateFromId(b).getTime() - dateFromId(a).getTime()).map(encodeURIComponent)
  }

  return { createDaily, read, update, list }
}
