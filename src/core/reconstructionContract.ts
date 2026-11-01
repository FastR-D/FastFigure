import { z } from 'zod'
import {componentAttachmentSchema} from './componentAttachmentContract.ts'
const id=z.string().min(1).max(160).regex(/^[a-zA-Z0-9_-]+$/)
const value=z.number().finite().min(-10000).max(10000),positive=z.number().positive().max(4800)
const color=z.string().regex(/^(#[a-fA-F\d]{6}|none)$/)
export const reconstructionRegionSchema=z.object({id:id.max(80),title:z.string().max(100).default(''),kind:z.enum(['panel','chart','table','legend','diagram','caption','connectors']).default('panel'),parentId:id.max(80).optional(),x:value,y:value,w:positive,h:positive}).strict()
export type ReconstructionRegion=z.infer<typeof reconstructionRegionSchema>
const common={id,owner:id.optional(),version:z.number().int().min(0).max(1_000_000).default(0),name:z.string().max(100).optional(),fill:color.optional(),stroke:color.optional(),strokeWidth:z.number().min(0).max(256).optional(),opacity:z.number().min(0).max(1).optional(),fillOpacity:z.number().min(0).max(1).optional(),strokeOpacity:z.number().min(0).max(1).optional(),dash:z.array(z.number().min(0).max(2400)).max(16).optional()}
const box={x:value,y:value,w:positive,h:positive}
export const reconstructionNodeSchema=z.discriminatedUnion('type',[
  z.object({...common,type:z.literal('rect'),...box,rx:z.number().min(0).max(1200).optional(),rotation:z.number().min(-360).max(360).optional()}).strict(),
  z.object({...common,type:z.literal('ellipse'),...box,rotation:z.number().min(-360).max(360).optional()}).strict(),
  z.object({...common,type:z.literal('text'),...box,text:z.string().trim().min(1).max(240).refine(s=>!/[\r\n]/.test(s),'每行文字使用独立对象'),fontSize:z.number().min(.01).max(1000),fontWeight:z.number().int().min(1).max(1000).optional(),letterSpacing:z.number().min(-1000).max(1000).optional(),fontFamily:z.string().max(80).regex(/^[\p{L}\p{N} _.-]+$/u).optional(),bold:z.boolean().optional(),italic:z.boolean().optional(),align:z.enum(['left','center','right']).optional(),rotation:z.number().min(-360).max(360).optional(),anchor:z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1)}).optional(),matrix:z.tuple([value,value,value,value]).optional()}).strict(),
  z.object({...common,type:z.literal('line'),x:value,y:value,x2:value,y2:value,arrow:z.boolean().optional()}).strict(),
  z.object({...common,type:z.literal('path'),d:z.string().min(1).max(20_000),arrow:z.boolean().optional(),fillRule:z.enum(['nonzero','evenodd']).optional()}).strict(),
  z.object({...common,type:z.literal('polyline'),points:z.string().min(3).max(10000),arrow:z.boolean().optional()}).strict(),
])
export type ReconstructionNode=z.infer<typeof reconstructionNodeSchema>
export const reconstructionSceneSchema=z.object({canvas:z.object({width:z.number().int().min(1).max(2400),height:z.number().int().min(1).max(2400)}).strict(),revision:z.number().int().min(0).max(1_000_000).default(0),regions:z.array(reconstructionRegionSchema).max(24).default([]),nodes:z.array(reconstructionNodeSchema).max(240)}).strict().superRefine((scene,ctx)=>{
  if(new Set(scene.nodes.map(n=>n.id)).size!==scene.nodes.length)ctx.addIssue({code:'custom',message:'重建对象 ID 重复'})
  if(new Set(scene.regions.map(r=>r.id)).size!==scene.regions.length)ctx.addIssue({code:'custom',message:'重建分区 ID 重复'})
  const ids=new Set(scene.regions.map(r=>r.id))
  for(const node of scene.nodes)if(node.owner&&!ids.has(node.owner)&&node.owner!=='ff-protected')ctx.addIssue({code:'custom',message:'重建对象所属分区不存在'})
  for(const r of scene.regions){if(r.id==='ff-protected'||r.id==='whole_content'||r.id.startsWith('uncovered_'))ctx.addIssue({code:'custom',message:'分区 ID 使用了保留标识'});if(r.x<0||r.y<0||r.x+r.w>scene.canvas.width+.001||r.y+r.h>scene.canvas.height+.001)ctx.addIssue({code:'custom',message:'分区超出参考图'});const visited=new Set([r.id]);let p=r.parentId;while(p){if(!ids.has(p)||visited.has(p)){ctx.addIssue({code:'custom',message:'分区父级不存在或成环'});break}visited.add(p);p=scene.regions.find(r=>r.id===p)?.parentId}}
})
export type ReconstructionScene=z.infer<typeof reconstructionSceneSchema>
export const reconstructionTraceSchema=z.object({objectId:id,owner:id.optional(),version:z.number().int().min(0).max(1_000_000)})
const region=z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),width:z.number().positive().max(1),height:z.number().positive().max(1)}).refine(r=>r.x+r.width<=1.000001&&r.y+r.height<=1.000001,'重建区域超出图片')
export const reconstructionRecordSchema=z.object({referenceSha256:z.string().regex(/^[a-f\d]{64}$/),sourceWidth:z.number().int().min(1).max(2400),sourceHeight:z.number().int().min(1).max(2400),region,origin:z.object({x:value,y:value}),scale:z.number().min(.005).max(32),revision:z.number().int().min(0).max(1_000_000),regions:z.array(reconstructionRegionSchema).max(24),warnings:z.array(z.string().max(300)).max(16).default([])}).superRefine((record,ctx)=>{
  const valid=reconstructionSceneSchema.safeParse({canvas:{width:record.sourceWidth,height:record.sourceHeight},regions:record.regions,nodes:[]})
  if(!valid.success)ctx.addIssue({code:'custom',message:'重建记录的分区层级或尺寸无效'})
  const {region:r,sourceWidth:w,sourceHeight:h}=record
  if(record.regions.some(a=>a.x<r.x*w-.001||a.y<r.y*h-.001||a.x+a.w>(r.x+r.width)*w+.001||a.y+a.h>(r.y+r.height)*h+.001))ctx.addIssue({code:'custom',message:'重建记录的分区超出原图选区'})
})
export type ReconstructionRecord=z.infer<typeof reconstructionRecordSchema>
export const reconstructionTaskSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('reconstruct'),referenceId:z.string().max(80),region,destination:z.enum(['new','current']),parentId:z.string().max(80)}).strict(),
  z.object({kind:z.literal('repair'),containerId:z.string().max(80),regionId:id}).strict(),
])
export type ReconstructionTask=z.infer<typeof reconstructionTaskSchema>
export const reconstructionImageInfoSchema=z.object({referenceSha256:z.string().regex(/^[a-f\d]{64}$/),width:z.number().int().min(3).max(2000),height:z.number().int().min(3).max(2000),sourceRect:z.object({x:z.number().nonnegative().max(2400),y:z.number().nonnegative().max(2400),w:z.number().positive().max(2400),h:z.number().positive().max(2400)}).strict(),quality:z.enum(['original','preview']),originalWidth:z.number().int().positive().max(24000000),originalHeight:z.number().int().positive().max(24000000)}).strict()
export const reconstructionImageSchema=reconstructionImageInfoSchema.extend({dataUrl:z.string().max(600_000).regex(/^data:image\/(png|webp);base64,[A-Za-z0-9+/]+={0,2}$/)}).strict()
export type ReconstructionImage=z.infer<typeof reconstructionImageSchema>
export type ReconstructionImageInfo=z.infer<typeof reconstructionImageInfoSchema>
const replacement=reconstructionNodeSchema
const version=z.number().int().min(0).max(1_000_000).optional()
export const reconstructionPatchSchema=z.object({operations:z.array(z.discriminatedUnion('op',[
  z.object({op:z.literal('add'),node:replacement}).strict(),
  z.object({op:z.literal('update'),id,version,node:replacement}).strict(),
  z.object({op:z.literal('delete'),id,version}).strict(),
  z.object({op:z.literal('split'),id,version,nodes:z.array(replacement).min(2).max(24)}).strict(),
  z.object({op:z.literal('merge'),ids:z.array(id).min(2).max(24),nodes:z.array(replacement).length(1)}).strict(),
])).max(120)}).strict()
export type ReconstructionPatch=z.infer<typeof reconstructionPatchSchema>
export const reconstructionReuseSchema=z.object({id:z.string().min(1).max(30).regex(/^[a-zA-Z0-9_-]+$/),componentKey:z.string().min(1).max(100),...box,parameters:z.record(z.string().max(40),z.union([z.string().max(100),z.number().finite()])).refine(p=>Object.keys(p).length<=20).optional(),labels:z.record(id,z.string().trim().max(100)).optional(),reason:z.string().trim().min(1).max(500),differences:z.array(z.string().trim().min(1).max(300)).min(1).max(8)}).strict()
export type ReconstructionReuse=z.infer<typeof reconstructionReuseSchema>
export const reconstructionReuseRecordSchema=z.object({version:z.literal(1),cataloguePreview:z.object({snapshotSha256:z.string().regex(/^[a-f0-9]{64}$/),sha256:z.string().regex(/^[a-f0-9]{64}$/),tile:z.number().int().min(1).max(6)}).strict().optional(),componentKey:z.string().min(1).max(100),assetId:id,assetName:z.string().min(1).max(100),revision:z.iso.datetime(),referenceSha256:z.string().regex(/^[a-f\d]{64}$/),region,reason:z.string().trim().min(1).max(500),differences:z.array(z.string().trim().min(1).max(300)).min(1).max(8)}).strict()
export type ReconstructionReuseRecord=z.infer<typeof reconstructionReuseRecordSchema>
export const reconstructionResponseSchema=z.object({message:z.string().min(1).max(5000),warnings:z.array(z.string().max(300)).max(16).default([]),scene:reconstructionSceneSchema.nullable(),reuse:z.array(reconstructionReuseSchema).max(6).default([]),attachments:z.array(componentAttachmentSchema).max(12).default([])}).strict()
export const repairResponseSchema=z.object({message:z.string().min(1).max(5000),patch:reconstructionPatchSchema}).strict()
