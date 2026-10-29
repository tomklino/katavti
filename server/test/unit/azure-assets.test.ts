import { describe, expect, it } from 'vitest'
import { createAzureNotesData } from '../../src/data-modules/azure-notes-data.js'

// Local-only fake Azure boundary; never uses credentials or an Azure account.
function fakeContainer() {
  const blobs = new Map<string, Buffer>()
  return {
    blobs,
    async createIfNotExists() {},
    getBlockBlobClient(name: string) {
      return {
        async upload(content: string, _length: number, options: any) {
          if (blobs.has(name) && options.conditions?.ifNoneMatch) throw { statusCode: 412 }
          blobs.set(name, Buffer.from(content)); return { etag: 'version' }
        },
        async uploadData(bytes: Uint8Array, options: any) {
          if (blobs.has(name) && options.conditions?.ifNoneMatch) throw { statusCode: 412 }
          blobs.set(name, Buffer.from(bytes)); return { etag: 'version' }
        },
        async download() {
          const bytes = blobs.get(name)
          if (!bytes) throw { statusCode: 404 }
          return { etag: 'version', readableStreamBody: (async function* () { yield bytes })() }
        },
        async downloadToBuffer() {
          if (!blobs.has(name)) throw { statusCode: 404 }
          return blobs.get(name)!
        },
      }
    },
    async *listBlobsFlat({ prefix }: { prefix: string }) {
      for (const name of blobs.keys()) if (name.startsWith(prefix)) yield { name }
    },
  }
}

describe('Azure assets (mock boundary only)', () => {
  it('writes binary bytes to the note month prefix, permits identical retries, rejects overwrites, and excludes md assets from lists', async () => {
    const container = fakeContainer()
    const data = createAzureNotesData({ container })
    const [id] = await data.createDaily('alice', 1, '2001-01-01')
    const filename = '12345678-1234-4567-8123-123456789abc-asset.md'
    const bytes = Buffer.from([0, 255, 128, 0])
    await data.uploadAsset('alice', id, filename, bytes)
    expect(container.blobs.get(`alice/2001/january.d/assets/${filename}`)).toEqual(bytes)
    expect(await data.readAsset('alice', id, filename)).toEqual(bytes)
    await data.uploadAsset('alice', id, filename, bytes)
    await expect(data.uploadAsset('alice', id, filename, Buffer.from('changed'))).rejects.toMatchObject({ status: 409 })
    expect(await data.list('alice', { days: 100000 })).toEqual([])
    await expect(data.readAsset('bob', id, filename)).rejects.toMatchObject({ status: 404 })
    await expect(data.readAsset('alice', id, '../secret')).rejects.toMatchObject({ status: 400 })
    await expect(data.uploadAsset('bob', id, filename, bytes)).rejects.toMatchObject({ status: 404 })
  })
})
