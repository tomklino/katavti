import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { assetDownloadName, MAX_ASSET_BYTES, validateAssetFilename, type AssetsData } from '../../data-modules/assets-data.js'

export function assetRoutes(service: Partial<AssetsData>) {
  const routes = new Hono<{ Variables: { userId: string } }>()
  routes.put('/:id/assets/:filename', bodyLimit({
    maxSize: MAX_ASSET_BYTES,
    onError: c => c.json({ error: 'Assets must be 50 MiB or smaller' }, 413),
  }), async c => {
    const filename = validateAssetFilename(c.req.param('filename'))
    if (!service.uploadAsset) return c.json({ error: 'Asset storage unavailable' }, 503)
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    await service.uploadAsset(c.get('userId'), c.req.param('id'), filename, bytes)
    return c.json({ filename, path: `../assets/${filename}`, size: bytes.byteLength }, 201)
  })
  routes.get('/:id/assets/:filename', async c => {
    const filename = validateAssetFilename(c.req.param('filename'))
    if (!service.readAsset) return c.json({ error: 'Asset storage unavailable' }, 503)
    const bytes = await service.readAsset(c.get('userId'), c.req.param('id'), filename)
    // Arbitrary uploads (including HTML/SVG/scripts) are downloads, never executable pages.
    return new Response(new Uint8Array(bytes), { headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${assetDownloadName(filename)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
      'Cache-Control': 'private, no-store',
    } })
  })
  return routes
}
