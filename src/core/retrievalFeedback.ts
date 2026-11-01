import {z} from 'zod'
import {componentAssetSchema} from './assets.ts'
import {componentSnapshotJson} from './componentRepository.ts'
import {reconstructionImageSchema} from './reconstructionContract.ts'
import {repositoryRecallSchema} from './repositoryRecall.ts'

const sha=z.string().regex(/^[a-f0-9]{64}$/),key=z.string().min(1).max(100)
export const feedbackRatingSchema=z.enum(['suitable','unsuitable','uncertain'])
export const feedbackRatingLabels={suitable:'适合',unsuitable:'不适合',uncertain:'不确定'} as const
export const feedbackInputSchema=z.object({id:z.uuid(),componentKey:key,rating:feedbackRatingSchema,note:z.string().trim().max(1000),previousId:z.uuid().nullable()}).strict()
export type FeedbackInput=z.infer<typeof feedbackInputSchema>
export const feedbackCapabilitiesSchema=z.object({kind:z.enum(['recipe','seed','asset']),fields:z.array(z.object({key:z.string().max(100),label:z.string().max(100),options:z.array(z.object({value:z.string().max(100),label:z.string().max(100)})).max(16)})).max(16),defaults:z.record(z.string().max(100),z.union([z.string().max(100),z.number()]))}).strict()
export type FeedbackCapabilities=z.infer<typeof feedbackCapabilitiesSchema>
export const feedbackContextSchema=z.object({format:z.literal('fastfigure.retrieval-context'),version:z.literal(1),runId:z.uuid(),sourceCreatedAt:z.iso.datetime(),componentKey:key,asset:componentAssetSchema,assetSha256:sha,capabilities:feedbackCapabilitiesSchema.optional(),report:repositoryRecallSchema,referenceImage:reconstructionImageSchema.extend({sha256:sha}).optional(),provider:z.enum(['codex','claude']),model:z.string().max(100).optional()}).strict().superRefine((context,ctx)=>{
  const image=context.referenceImage,query=context.report.visualQuery
  if(query&&!image||image&&!query)ctx.addIssue({code:'custom',message:'看图反馈必须保留当时实际裁片'})
  if(image&&query){const{dataUrl,sha256,...info}=image;void dataUrl;if(sha256!==query.imageSha256||feedbackCanonicalJson(info)!==feedbackCanonicalJson(query.image))ctx.addIssue({code:'custom',message:'反馈裁片与看图检索记录不符'})}
})
export type FeedbackContext=z.infer<typeof feedbackContextSchema>
export const feedbackRecordSchema=z.object({id:z.uuid(),caseId:sha,createdAt:z.iso.datetime(),rating:feedbackRatingSchema,note:z.string().max(1000),previousId:z.uuid().nullable()}).strict()
export const feedbackRevisionSchema=z.object({record:feedbackRecordSchema,sha256:sha})
export const feedbackReceiptSchema=feedbackRevisionSchema.extend({latestId:z.uuid(),duplicate:z.boolean()})
export const feedbackCaseSchema=z.object({format:z.literal('fastfigure.retrieval-feedback'),version:z.literal(1),id:sha,context:feedbackContextSchema,revisions:z.array(feedbackRevisionSchema).max(100)})
export type FeedbackCase=z.infer<typeof feedbackCaseSchema>
export const feedbackPageSchema=z.object({records:z.array(z.object({caseId:sha,runId:z.uuid(),componentKey:key,name:z.string().max(100),query:z.string().max(160),assetSha256:sha,latest:feedbackRecordSchema})).max(24),total:z.number().int().nonnegative(),offset:z.number().int().nonnegative(),limit:z.number().int().min(1).max(24)})
export function feedbackCanonicalJson(value:unknown){return JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0)):item)}
async function digest(text:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(byte=>byte.toString(16).padStart(2,'0')).join('')}
/** Content and revision identity, not independent human or scientific correctness. */
export async function verifyFeedbackCase(input:unknown){
  const value=feedbackCaseSchema.parse(input)
  if(await digest(feedbackCanonicalJson(value.context))!==value.id||await digest(componentSnapshotJson(value.context.asset))!==value.context.assetSha256)throw new Error('反馈素材或上下文指纹不符')
  if(value.context.referenceImage){const image=value.context.referenceImage,bytes=Uint8Array.from(atob(image.dataUrl.split(',')[1]!),char=>char.charCodeAt(0)),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');if(hash!==image.sha256)throw new Error('反馈原图裁片指纹不符')}
  let previous:string|null=null;const seen=new Set<string>()
  for(const revision of value.revisions){const row=revision.record;if(row.caseId!==value.id||row.previousId!==previous||seen.has(row.id)||await digest(feedbackCanonicalJson(row))!==revision.sha256)throw new Error('反馈改判记录与指纹不符');seen.add(row.id);previous=row.id}
  return value
}
