import {z} from 'zod'
import {generatedImageTraceSchema} from './generatedImageTrace.ts'
import {paletteById} from '../data/materials.ts'
import {styleAssetSchema} from './styleAssetContract.ts'
import {referenceInputInfoSchema,referencePurposeSchema,type ReferenceInputInfo} from './referenceInputs.ts'
import {compositionRecordSchema,type CompositionRecord} from './compositionPlanContract.ts'
const text=(max:number)=>z.string().trim().min(1).max(max)
const style=styleAssetSchema.shape
export const draftStyleSchema=z.object({id:style.id,name:style.name,updatedAt:style.updatedAt,preset:style.preset,paletteId:style.paletteId,fontFamily:style.fontFamily,surface:style.surface,colorIndex:style.colorIndex,colorMap:style.colorMap,sketchStyle:style.sketchStyle,roughness:style.roughness,lineStyle:style.lineStyle,guide:style.guide}).strict().superRefine((value,ctx)=>{if(value.colorIndex!==undefined&&value.colorIndex>=(paletteById.get(value.paletteId)?.colors.length??0))ctx.addIssue({code:'custom',message:'风格默认色槽越界'})})
export const imageDraftCompositionSchema=compositionRecordSchema.superRefine((record,ctx)=>{
  if(record.plan.status!=='ready'||record.plan.sections.some(s=>!s.design))ctx.addIssue({code:'custom',message:'图像草稿需要已明确分区和主次的可采用方案，请先补充或重新规划'})
})
function compositionIssues(record:CompositionRecord,content:string,style:z.infer<typeof draftStyleSchema>,references:Pick<ReferenceInputInfo,'id'|'sha256'|'purpose'|'width'|'height'>[]){
  const plan=record.plan,expected=record.references.filter(r=>r.decision==='use').sort((a,b)=>a.index-b.index),issues:string[]=[]
  if(content!==plan.goal)issues.push('方案内容规格已变化，请清除方案后重新填写，或重新规划')
  if(expected.length!==references.length||expected.some((r,i)=>{const actual=references[i];return !actual||(['id','sha256','purpose','width','height'] as const).some(k=>actual[k]!==r[k])}))issues.push('方案参考图已变化或顺序不符，请恢复原图后重试')
  if(style.guide!==plan.style.usage||(['preset','paletteId','fontFamily','surface','colorIndex','colorMap','sketchStyle','roughness'] as const).some(k=>JSON.stringify(style[k])!==JSON.stringify(plan.style[k]))||JSON.stringify(style.lineStyle)!==JSON.stringify(record.styleReference?.lineStyle))issues.push('草稿风格须沿用方案，请清除方案后另选风格')
  return issues
}
export const imageDraftInputSchema=z.object({requestId:z.uuid(),title:text(100),content:text(6000),visual:z.string().trim().max(2000),aspect:z.enum(['landscape','square','portrait']),model:z.string().trim().max(100).optional(),timeoutSeconds:z.number().int().min(30).max(600),style:draftStyleSchema,
  composition:imageDraftCompositionSchema.optional(),
  references:z.array(z.object({id:text(80),title:text(100),citation:z.string().max(500),fileName:text(200),sha256:z.string().regex(/^[a-f0-9]{64}$/),width:z.number().int().positive().max(2400),height:z.number().int().positive().max(2400),purpose:referencePurposeSchema,generated:generatedImageTraceSchema.optional(),dataUrl:z.string().max(600_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/)}).strict()).max(3),
}).strict().superRefine((value,ctx)=>{if(new Set(value.references.map(r=>r.id)).size!==value.references.length||new Set(value.references.map(r=>r.sha256)).size!==value.references.length)ctx.addIssue({code:'custom',message:'参考图片不能重复'});if(value.references.reduce((n,r)=>n+r.dataUrl.length,0)>1_200_000)ctx.addIssue({code:'custom',message:'参考图总容量超过限制'})
  if(value.composition)for(const message of compositionIssues(value.composition,value.content,value.style,value.references))ctx.addIssue({code:'custom',message})
})
export type ImageDraftInput=z.infer<typeof imageDraftInputSchema>
export const imageDraftOriginSchema=z.object({version:z.literal(1),runId:z.uuid(),provider:z.literal('codex-imagegen'),illustrative:z.literal(true),title:text(100),content:text(6000),visual:z.string().max(2000),aspect:z.enum(['landscape','square','portrait']),model:z.string().max(100).optional(),imageModel:z.string().max(100).optional(),style:draftStyleSchema,composition:imageDraftCompositionSchema.optional(),submittedPrompt:text(24000),revisedPrompt:z.string().max(24000).optional(),revisedPromptTruncated:z.boolean().optional(),createdAt:z.iso.datetime(),finishedAt:z.iso.datetime(),sha256:z.string().regex(/^[a-f0-9]{64}$/),width:z.number().int().positive().max(8192),height:z.number().int().positive().max(8192),referenceInputs:z.array(referenceInputInfoSchema).max(3),inputVerification:z.enum(['verified','partial','unreported']),observedReferenceIndices:z.array(z.number().int().min(1).max(3)).max(3),cliVersion:z.string().max(150).optional(),timeoutSeconds:z.number().int().min(30).max(600)}).strict().superRefine((value,ctx)=>{
  if(value.composition){
    for(const message of compositionIssues(value.composition,value.content,value.style,value.referenceInputs))ctx.addIssue({code:'custom',message})
    const expected=value.composition.references.filter(r=>r.decision==='use').sort((a,b)=>a.index-b.index)
    if(value.referenceInputs.some((ref,i)=>ref.index!==i+1||expected[i]?.inputSha256&&expected[i]!.inputSha256!==ref.inputSha256))ctx.addIssue({code:'custom',message:'生成来源中的方案图片序号或实际字节指纹不符'})
  }
})
export type ImageDraftOrigin=z.infer<typeof imageDraftOriginSchema>
export const imageDraftBundleSchema=z.object({format:z.literal('fastfigure.image-draft'),version:z.literal(1),origin:imageDraftOriginSchema,image:z.object({mime:z.enum(['image/png','image/jpeg','image/webp']),base64:z.string().max(16_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/)}).strict()}).strict()
export const imageDraftRunSchema=z.object({id:z.uuid(),requestId:z.uuid(),title:text(100),status:z.enum(['running','completed','failed','cancelled']),createdAt:z.iso.datetime(),finishedAt:z.iso.datetime().optional(),content:text(6000),visual:z.string().max(2000),aspect:z.enum(['landscape','square','portrait']),timeoutSeconds:z.number().int(),model:z.string().optional(),style:draftStyleSchema,composition:imageDraftCompositionSchema.optional(),referenceInputs:z.array(referenceInputInfoSchema).max(3),activities:z.array(z.string().max(500)).max(40),error:z.string(),review:z.enum(['pending','imported','discarded']),available:z.boolean(),origin:imageDraftOriginSchema.optional()}).strict()
export type ImageDraftRun=z.infer<typeof imageDraftRunSchema>
export function mergeImageDrafts(previous:ImageDraftOrigin[]|undefined,additions:ImageDraftOrigin[]){
  for(const row of additions){const old=previous?.find(d=>d.runId===row.runId);if(old&&JSON.stringify(old)!==JSON.stringify(row))throw new Error('同一 AI 草稿的完整来源不能改写')}
  const result=[...new Map([...(previous??[]),...additions].map(row=>[row.runId,row])).values()]
  if(result.length>8)throw new Error('AI 草稿来源最多 8 份，请先在属性栏精简完整记录')
  return result.length?result:undefined
}
