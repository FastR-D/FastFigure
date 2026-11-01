import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import { harnessKindSchema } from '../../src/core/harness.ts'
import { HarnessError, HarnessService } from './service.ts'
import {ComponentLibraryError} from '../componentLibrary/store.ts'

async function readJson(request: IncomingMessage,limit=2_000_000): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new HarnessError(415, '请使用 application/json 请求')
  if (Number(request.headers['content-length']) > limit) { request.resume(); throw new HarnessError(413, `请求不能超过 ${limit/1_000_000} MB`) }
  const chunks: Buffer[] = []; let size = 0
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk as Uint8Array); size += bytes.length
    if (size > limit) throw new HarnessError(413, `请求不能超过 ${limit/1_000_000} MB`)
    chunks.push(bytes)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new HarnessError(400, '请求 JSON 无效') }
}
function json(response: ServerResponse, value: unknown, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(value))
}
export function harnessHttp(service: HarnessService) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const host = request.headers.host ?? ''
      if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)) throw new HarnessError(403, 'Harness 仅供本机使用')
      const origin = request.headers.origin
      if (origin && origin !== `http://${host}`) throw new HarnessError(403, '不允许跨站访问本机 Harness')
      const url = new URL(request.url ?? '/', `http://${host}`), path = url.pathname.replace(/\/$/, '')
      if (request.method === 'GET' && path === '/api/harness/status') { json(response, await service.status()); return }
      if (path === '/api/harness/sessions') {
        if (request.method === 'GET') { json(response, service.listSessions()); return }
        if (request.method === 'POST') {
          const input = z.object({ kind: harnessKindSchema, title: z.string().max(100) }).safeParse(await readJson(request))
          if (!input.success) throw new HarnessError(400, '会话参数无效')
          json(response, service.createSession(input.data.kind, input.data.title), 201); return
        }
      }
      const sessionPath = /^\/api\/harness\/sessions\/([a-f0-9-]+)$/.exec(path)
      if (sessionPath && request.method === 'DELETE') { await readJson(request); await service.removeSession(sessionPath[1]!); json(response, { removed: true }); return }
      const historyPath = /^\/api\/harness\/sessions\/([a-f0-9-]+)\/history$/.exec(path)
      if (historyPath && request.method === 'GET') { json(response, service.history(historyPath[1]!)); return }
      if (request.method === 'POST' && path === '/api/harness/runs') {
        const run = service.start(await readJson(request)); json(response, { id: run.id, sessionId: run.sessionId,summary:service.summary(run.id) }, 202); return
      }
      if(request.method==='POST'&&path==='/api/harness/visual-audits'){const run=service.startAudit(await readJson(request));json(response,{id:run.id,sessionId:run.sessionId,summary:service.summary(run.id)},202);return}
      if(request.method==='POST'&&path==='/api/harness/repair-plans'){const plan=service.startPlan(await readJson(request,4_000_000));json(response,service.planSnapshot(plan.state.id),202);return}
      const planPath=/^\/api\/harness\/repair-plans\/([a-f0-9-]+)(?:\/(cancel))?$/.exec(path)
      if(planPath){
        if(request.method==='GET'&&!planPath[2]){json(response,service.planSnapshot(planPath[1]!));return}
        if(request.method==='POST'&&planPath[2]==='cancel'){const input=z.object({reason:z.enum(['cancelled','stale']).default('cancelled')}).safeParse(await readJson(request));if(!input.success)throw new HarnessError(400,'停止计划参数无效');service.cancelPlan(planPath[1]!,input.data.reason);json(response,service.planSnapshot(planPath[1]!));return}
      }
      const previewPath=/^\/api\/harness\/runs\/([a-f0-9-]+)\/selection-previews(?:\/([1-4]))?$/.exec(path)
      if(previewPath){
        if(request.method==='GET'&&previewPath[2]){const image=service.getSelectionPreviewImage(previewPath[1]!,Number(previewPath[2]));response.writeHead(200,{'Content-Type':image.contentType,'Content-Length':image.bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(image.bytes);return}
        if(request.method==='GET'){json(response,service.getSelectionPreviewRequest(previewPath[1]!));return}
        if(request.method==='POST'&&!previewPath[2]){json(response,await service.submitSelectionPreviews(previewPath[1]!,await readJson(request,3_500_000)));return}
      }
      const referencePath=/^\/api\/harness\/runs\/([a-f0-9-]+)\/references\/([1-3])$/.exec(path)
      if(referencePath&&request.method==='GET'){const image=service.referenceImage(referencePath[1]!,Number(referencePath[2]));response.writeHead(200,{'Content-Type':image.contentType,'Content-Length':image.bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(image.bytes);return}
      const runPath = /^\/api\/harness\/runs\/([a-f0-9-]+)(?:\/(events|cancel|review|input-image|candidate-image|catalogue-image|selection-evidence|image-query-evidence|component-search|retrieval-context|retrieval-feedback))?$/.exec(path)
      if (runPath) {
        if(request.method==='GET'&&runPath[2]==='retrieval-context'){const key=url.searchParams.get('key');if(!key||key.length>100)throw new HarnessError(400,'请选择本轮素材');json(response,await service.feedbackContext(runPath[1]!,key));return}
        if(request.method==='POST'&&runPath[2]==='retrieval-feedback'){const value=await service.recordFeedback(runPath[1]!,await readJson(request,10_000));json(response,value,value.duplicate?200:201);return}
        if(request.method==='GET'&&runPath[2]==='selection-evidence'){json(response,service.getSelectionEvidence(runPath[1]!));return}
        if(request.method==='GET'&&runPath[2]==='image-query-evidence'){json(response,service.getImageQueryEvidence(runPath[1]!));return}
        if(request.method==='GET'&&runPath[2]==='component-search'){json(response,service.getComponentSearch(runPath[1]!));return}
        if(request.method==='GET'&&runPath[2]==='input-image'){const image=service.getInputImage(runPath[1]!);response.writeHead(200,{'Content-Type':image.contentType,'Content-Length':image.bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(image.bytes);return}
        if(request.method==='GET'&&runPath[2]==='catalogue-image'){const image=service.getCatalogueImage(runPath[1]!);response.writeHead(200,{'Content-Type':image.contentType,'Content-Length':image.bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(image.bytes);return}
        if(request.method==='GET'&&runPath[2]==='candidate-image'){const image=service.getCandidateImage(runPath[1]!);response.writeHead(200,{'Content-Type':image.contentType,'Content-Length':image.bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(image.bytes);return}
        if (request.method === 'POST' && runPath[2] === 'review') {
          const input = z.object({ decision: z.enum(['applied', 'discarded']) }).safeParse(await readJson(request))
          if (!input.success) throw new HarnessError(400, '候选图处理参数无效')
          json(response, service.review(runPath[1]!, input.data.decision)); return
        }
        const run = service.getRun(runPath[1]!)
        if (request.method === 'GET' && !runPath[2]) { json(response, { id: run.id, sessionId: run.sessionId, status: run.status, events: run.events, baseFigure: run.baseFigure,canvasBaseline:run.canvasBaseline, content: run.content, summary: service.summary(run.id) }); return }
        if (request.method === 'POST' && runPath[2] === 'cancel') { await readJson(request); service.cancel(run.id); json(response, { cancelled: true }); return }
        if (request.method === 'GET' && runPath[2] === 'events') {
          const cursor = Number(request.headers['last-event-id'] ?? url.searchParams.get('after') ?? 0)
          if (!Number.isInteger(cursor) || cursor < 0 || cursor > run.events.length) throw new HarnessError(400, '事件游标无效')
          response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
          const write = (event: (typeof run.events)[number]) => {
            if (response.writableLength > 4_000_000) { response.destroy(); return }
            response.write(`id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`)
            if (['run.completed', 'run.failed', 'run.cancelled'].includes(event.type)) response.end()
          }
          const heartbeat = setInterval(() => { if (!response.writableEnded) response.write(': heartbeat\n\n') }, 15_000)
          heartbeat.unref()
          const cleanup = () => { clearInterval(heartbeat); run.listeners.delete(write) }
          response.once('close', cleanup)
          for (const event of run.events) if (event.sequence > cursor) write(event)
          if (run.status !== 'running') { response.end(); cleanup() }
          else run.listeners.add(write)
          return
        }
      }
      throw new HarnessError(404, 'Harness 接口不存在')
    } catch (error) {
      if (response.headersSent) { response.end(); return }
      const known=error instanceof HarnessError||error instanceof ComponentLibraryError
      json(response, { error: known ? error.message : 'Harness 请求未能完成' }, known ? error.status : 500)
    }
  }
}
