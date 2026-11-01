import type { Plugin } from 'vite'
import { HarnessService } from './service.ts'
import { harnessHttp } from './http.ts'
import {ImageDraftService} from '../imageDrafts/service.ts'
import {imageDraftHttp} from '../imageDrafts/http.ts'
import {ComponentLibraryStore} from '../componentLibrary/store.ts'
import {componentLibraryHttp} from '../componentLibrary/http.ts'

export function harnessPlugin(): Plugin {
  const disposers = new Set<() => Promise<void>>()
  function register() {
    const library=new ComponentLibraryStore(),service = new HarnessService(undefined,180_000,library), drafts=new ImageDraftService(),harness=harnessHttp(service),images=imageDraftHttp(drafts),components=componentLibraryHttp(library)
    const handle=(request:Parameters<typeof harness>[0],response:Parameters<typeof harness>[1])=>request.url?.startsWith('/api/component-library/')?components(request,response):request.url?.startsWith('/api/image-drafts/')?images(request,response):harness(request,response)
    let disposal: Promise<void> | undefined
    const dispose = () => disposal ??= Promise.all([service.dispose(),drafts.dispose()]).then(()=>library.close())
    disposers.add(dispose)
    return { handle, dispose }
  }
  return { name: 'fastfigure-local-harness',
    async closeBundle() { await Promise.allSettled([...disposers].map(dispose => dispose())); disposers.clear() },
    configureServer(server) {
      const { handle, dispose } = register()
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith('/api/harness/')&&!request.url?.startsWith('/api/image-drafts/')&&!request.url?.startsWith('/api/component-library/')) { next(); return }
        void handle(request, response)
      })
      server.httpServer?.once('close', () => { void dispose() })
    },
    configurePreviewServer(server) {
      const { handle, dispose } = register()
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith('/api/harness/')&&!request.url?.startsWith('/api/image-drafts/')&&!request.url?.startsWith('/api/component-library/')) { next(); return }
        void handle(request, response)
      })
      server.httpServer.once('close', () => { void dispose() })
    },
  }
}
