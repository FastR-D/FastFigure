import { z } from 'zod'
import { buildIndex, prepareQuery, rank, type Index } from '../vendor/topconf/retrieval.mjs'
import { readReferenceImage } from './references.ts'
import type { Rect } from './geometry.ts'
export const topconfCommit='77a7d84570a6a9f3e63c22bb31b9fb59757e3dab'
export const topconfUrl='https://qwdwqfwq.github.io/topconf-paper-figure-gallery/'
export const patternNames:Record<string,string>={conceptual:'概念说明',framework:'框架总览',pipeline:'流程',architecture:'模型结构',taxonomy:'分类综述',teaser:'论文概览',comparison:'对比',results:'结果'}
export const paperFigureSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_.-]+$/).max(300),venue:z.enum(['iclr','icml','neurips','cvpr','acl','aaai']),year:z.number().int().min(2023).max(2030),title:z.string().min(1).max(250),authors:z.array(z.string().max(300)).max(120),pattern:z.enum(['conceptual','framework','pipeline','architecture','taxonomy','teaser','comparison','results']),image:z.string().regex(/^images\/[a-z]+\/final\/[a-zA-Z0-9_.-]+\.jpg$/),paper:z.url().refine(v=>v.startsWith('https://')),pdf_source:z.url().optional(),w:z.number().positive(),h:z.number().positive(),tier:z.enum(['oral','spotlight']).optional(),award:z.string().optional()})
export const paperGallerySchema=z.object({version:z.literal(1),commit:z.literal(topconfCommit),figures:z.array(paperFigureSchema).min(1).max(6000)}).refine(v=>new Set(v.figures.map(f=>f.id)).size===v.figures.length,'图件 ID 重复')
export type PaperFigure=z.infer<typeof paperFigureSchema>
export interface GalleryFilters {venue:string;year:string;pattern:string;tier:string}
export const defaultGalleryFilters:GalleryFilters={venue:'all',year:'all',pattern:'all',tier:'all'}
export interface PaperGallery {figures:PaperFigure[];index:Index;zeros:Float32Array}
export function createPaperGallery(raw:unknown):PaperGallery {
  const {figures}=paperGallerySchema.parse(raw),ids=figures.map(f=>f.id)
  const index=buildIndex({figs:figures,ids,bm:{docs:figures.map(f=>[f.title,...f.authors,f.pattern,f.venue,String(f.year)])}})
  return {figures,index,zeros:new Float32Array(figures.length)}
}
export function searchPaperGallery(gallery:PaperGallery,text:string,filters:GalleryFilters=defaultGalleryFilters) {
  const candidates=gallery.figures.flatMap((f,i)=>(filters.venue==='all'||f.venue===filters.venue)&&(filters.year==='all'||String(f.year)===filters.year)&&(filters.pattern==='all'||f.pattern===filters.pattern)&&(filters.tier==='all'||f.tier===filters.tier)?[i]:[])
  if(!text.trim())return candidates.sort((a,b)=>gallery.figures[b]!.year-gallery.figures[a]!.year||Number(gallery.figures[b]!.tier==='oral')-Number(gallery.figures[a]!.tier==='oral')||a-b).map(i=>({figure:gallery.figures[i]!,hits:[] as string[],score:0}))
  const query=prepareQuery(text,gallery.index.idf)
  return rank(gallery.index,query,candidates,gallery.zeros,gallery.zeros).filter(row=>row.lexical>0).map(row=>({figure:gallery.figures[row.i]!,hits:row.hits,score:row.score}))
}
export function paperImageUrl(figure:PaperFigure){return `https://raw.githubusercontent.com/qwdwqfwq/topconf-paper-figure-gallery/${topconfCommit}/${paperFigureSchema.shape.image.parse(figure.image)}`}
export function paperCitation(figure:PaperFigure){return `${figure.title} · ${figure.authors.join(', ')} · ${figure.venue.toUpperCase()} ${figure.year} · Figure 1 / Teaser · ${figure.paper} · 图库 ${figure.id}`}
export function paperReferencePrompt(figure:PaperFigure){return `参考这张已附加的论文图绘制可编辑科研插图。先分析它的布局、信息层级、标志性结构、简洁注释和语义配色，再结合当前方法重新组织，不照搬论文里的结论、实验数值或专有图示。先列出还缺少的方法信息；信息充分时再给出候选图。\n来源：${paperCitation(figure)}\n请保留已有来源记录，并在可用组件中选择合适结构。`}
export async function importPaperReference(figure:PaperFigure,area:Rect,signal?:AbortSignal) {
  const timed=AbortSignal.any([AbortSignal.timeout(20_000),...(signal?[signal]:[])])
  let response:Response
  try{response=await fetch(paperImageUrl(figure),{signal:timed,credentials:'omit',referrerPolicy:'no-referrer'})}
  catch(error){if(timed.aborted&&!signal?.aborted)throw new Error('参考图读取超时，请重试或打开原论文',{cause:error});throw error}
  if(!response.ok)throw new Error(`参考图获取失败（${response.status}），可打开来源页查看`)
  if(Number(response.headers.get('content-length')??0)>12_000_000)throw new Error('参考图超过 12 MB')
  const reader=response.body?.getReader();if(!reader)throw new Error('浏览器无法读取图片响应')
  const chunks:Uint8Array<ArrayBuffer>[]=[];let length=0
  try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>12_000_000)throw new Error('参考图超过 12 MB');chunks.push(value)}}catch(error){await reader.cancel();throw error}finally{reader.releaseLock()}
  const image=await readReferenceImage(new File(chunks,`${figure.id}.jpg`,{type:'image/jpeg'}),area)
  if(signal?.aborted)throw new DOMException('已取消','AbortError')
  image.title=figure.title.slice(0,100)
  // Keep the paper URL even for papers with very long author lists.
  const suffix=` · ${figure.venue.toUpperCase()} ${figure.year} · Figure 1 / Teaser · ${figure.paper} · Top-Conf ${figure.id}`
  image.citation=`${figure.title} · ${figure.authors.join(', ')}`.slice(0,500-suffix.length)+suffix
  return image
}
