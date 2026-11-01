import type {IncomingMessage,ServerResponse} from 'node:http'
import {ComponentLibraryError,ComponentLibraryStore} from './store.ts'

const json=(res:ServerResponse,value:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value))}
async function body(req:IncomingMessage){
  if(!req.headers['content-type']?.startsWith('application/json'))throw new ComponentLibraryError(415,'请使用 application/json 请求')
  if(Number(req.headers['content-length'])>2_200_000){req.resume();throw new ComponentLibraryError(413,'素材请求不能超过 2.2 MB')}
  const chunks:Buffer[]=[];let size=0
  for await(const part of req){const chunk=Buffer.from(part as Uint8Array);size+=chunk.length;if(size>2_200_000)throw new ComponentLibraryError(413,'素材请求不能超过 2.2 MB');chunks.push(chunk)}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown}catch{throw new ComponentLibraryError(400,'素材请求 JSON 无效')}
}
export function componentLibraryHttp(store:ComponentLibraryStore){return async(req:IncomingMessage,res:ServerResponse)=>{
  try{
    const host=req.headers.host??'';if(!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)||req.headers.origin&&req.headers.origin!==`http://${host}`)throw new ComponentLibraryError(403,'本机素材库仅允许本机同源访问')
    const url=new URL(req.url??'/',`http://${host}`),path=url.pathname.replace(/\/$/,'')
    if(req.method==='POST'&&path==='/api/component-library/content-matches'){json(res,store.contentMatches(await body(req)));return}
    if(req.method==='GET'&&path==='/api/component-library/status'){json(res,store.status());return}
    if(req.method==='GET'&&path==='/api/component-library/feedback'){json(res,store.listFeedback(Object.fromEntries(url.searchParams)));return}
    if(req.method==='GET'&&path==='/api/component-library/feedback/export'){
      const snapshot=store.feedbackExport(Object.fromEntries(url.searchParams))
      res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Content-Disposition':'attachment; filename="fastfigure-retrieval-feedback.jsonl"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
      const line=async(value:unknown)=>{if(!res.write(JSON.stringify(value)+'\n'))await new Promise<void>((resolve,reject)=>{const cleanup=()=>{res.off('drain',drain);res.off('close',close)},drain=()=>{cleanup();resolve()},close=()=>{cleanup();reject(new Error('Export closed'))};res.once('drain',drain);res.once('close',close)})}
      await line({format:'fastfigure.feedback-export-start',version:1,cases:snapshot.ids.length,sequence:snapshot.sequence})
      for(const id of snapshot.ids)await line(store.readFeedbackCase(id,snapshot.sequence))
      await line({format:'fastfigure.feedback-export-end',version:1,cases:snapshot.ids.length,sequence:snapshot.sequence});res.end();return
    }
    const feedback=/^\/api\/component-library\/feedback\/([a-f0-9]{64})$/.exec(path)
    if(feedback&&req.method==='GET'){json(res,store.readFeedbackCase(feedback[1]!));return}
    if(path==='/api/component-library/snapshots'){
      if(req.method==='GET'){json(res,store.list(Object.fromEntries(url.searchParams)));return}
      if(req.method==='POST'){const result=store.publish(await body(req));json(res,result,result.duplicate?200:201);return}
    }
    const match=/^\/api\/component-library\/snapshots\/([a-f0-9]{64})$/.exec(path)
    if(match&&req.method==='GET'){json(res,store.read(match[1]!));return}
    const state=/^\/api\/component-library\/snapshots\/([a-f0-9]{64})\/state$/.exec(path)
    if(state&&req.method==='POST'){json(res,store.setState(state[1]!,await body(req)));return}
    throw new ComponentLibraryError(404,'本机素材接口不存在')
  }catch(error){if(res.headersSent){res.destroy();return}json(res,{error:error instanceof ComponentLibraryError?error.message:'本机素材库暂不可用，请检查目录权限、剩余空间和素材库备份'},error instanceof ComponentLibraryError?error.status:503)}
}}
