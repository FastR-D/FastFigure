import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HarnessService } from './harness/service.ts'
import { harnessHttp } from './harness/http.ts'
import { ImageDraftService } from './imageDrafts/service.ts'
import { imageDraftHttp } from './imageDrafts/http.ts'
import { ComponentLibraryStore } from './componentLibrary/store.ts'
import { componentLibraryHttp } from './componentLibrary/http.ts'

// Agent APIs intentionally retain their loopback host and same-origin checks.
const host = process.env.HOST ?? '127.0.0.1'
if (host !== '127.0.0.1') throw new Error('FastFigure must bind to loopback')
const port = Number(process.env.PORT ?? 5178)
const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '../dist'))
const library = new ComponentLibraryStore()
const service = new HarnessService(undefined, library)
const drafts = new ImageDraftService()
const harness = harnessHttp(service)
const images = imageDraftHttp(drafts)
const components = componentLibraryHttp(library)
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webp': 'image/webp',
}
const server = createServer((request, response) => {
  void (async () => {
    const path = new URL(request.url ?? '/', `http://${host}:${port}`).pathname
    if (path === '/api/health' && request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.end('{"ok":true}')
      return
    }
    if (path.startsWith('/api/component-library/')) { await components(request, response); return }
    if (path.startsWith('/api/image-drafts/')) { await images(request, response); return }
    if (path.startsWith('/api/harness/')) { await harness(request, response); return }
    if (path.startsWith('/api/')) { response.writeHead(404); response.end(); return }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return
    }
    let relative: string
    try { relative = decodeURIComponent(path) } catch { response.writeHead(400); response.end(); return }
    const parts = relative.split('/')
    if (parts.some(part => part.startsWith('.')) || relative.includes('\\')) {
      response.writeHead(404); response.end(); return
    }
    let candidate = resolve(root, '.' + relative)
    if (candidate !== root && !candidate.startsWith(root + sep)) {
      response.writeHead(404); response.end(); return
    }
    try {
      const info = await stat(candidate)
      if (info.isDirectory()) candidate = resolve(candidate, 'index.html')
      candidate = await realpath(candidate)
    } catch {
      if (extname(relative)) { response.writeHead(404); response.end(); return }
      candidate = resolve(root, 'index.html')
    }
    if (!candidate.startsWith(root + sep)) { response.writeHead(404); response.end(); return }
    const info = await stat(candidate)
    response.writeHead(200, {
      'Content-Type': types[extname(candidate)] ?? 'application/octet-stream',
      'Content-Length': info.size, 'X-Content-Type-Options': 'nosniff',
      'Cache-Control': candidate.endsWith('.html') ? 'no-cache' : 'public, max-age=3600',
    })
    if (request.method === 'HEAD') response.end()
    else createReadStream(candidate).on('error', () => response.destroy()).pipe(response)
  })().catch(() => {
    if (!response.headersSent) response.writeHead(500)
    response.end()
  })
})
let closing = false
function shutdown() {
  if (closing) return
  closing = true
  server.close(() => {
    void Promise.allSettled([service.dispose(), drafts.dispose()]).then(() => {
      library.close(); process.exit(0)
    })
  })
  server.closeIdleConnections()
  setTimeout(() => process.exit(1), 15_000).unref()
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
server.listen(port, host, () => console.log(`FastFigure http://${host}:${port}`))
