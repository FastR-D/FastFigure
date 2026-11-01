import {z} from 'zod'
import {componentContentAlgorithm} from './componentContent.ts'
import {componentAssetSchema,parseAsset,type ComponentAsset} from './assets.ts'

export const snapshotIdSchema=z.string().regex(/^[a-f0-9]{64}$/)
export const repositoryScopeSchema=z.enum(['active','archived','all'])
export type RepositoryScope=z.infer<typeof repositoryScopeSchema>
export const snapshotStateInputSchema=z.object({archived:z.boolean()}).strict()
const thumbnailSchema=z.string().max(80_000).regex(/^data:image\/(png|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
export const publishComponentSchema=z.object({asset:componentAssetSchema,thumbnail:z.object({assetSha256:snapshotIdSchema,dataUrl:thumbnailSchema}).strict().optional()}).strict()
export const componentSnapshotSchema=z.object({
  id:snapshotIdSchema,assetId:z.string().min(1).max(80),name:z.string().min(1).max(100),description:z.string().max(300),tags:z.array(z.string().max(30)).max(12),
  savedAt:z.iso.datetime(),revision:z.iso.datetime(),bytes:z.number().int().positive().max(2_000_000),
  width:z.number().positive(),height:z.number().positive(),nodes:z.number().int().min(1).max(240),edges:z.number().int().min(0).max(120),
  sources:z.array(z.object({title:z.string().max(100),reference:z.string().max(500)})).max(12),thumbnail:thumbnailSchema.optional(),archivedAt:z.iso.datetime().optional(),
})
export type ComponentSnapshot=z.infer<typeof componentSnapshotSchema>
export const repositoryStatusSchema=z.object({directory:z.string(),count:z.number().int().nonnegative(),activeCount:z.number().int().nonnegative(),archivedCount:z.number().int().nonnegative(),bytes:z.number().int().nonnegative(),maxEntries:z.number().int(),maxBytes:z.number().int()}).refine(value=>value.count===value.activeCount+value.archivedCount,'素材状态数量不一致')
export const repositoryPageSchema=z.object({records:z.array(componentSnapshotSchema).max(24),total:z.number().int().nonnegative(),offset:z.number().int().nonnegative(),limit:z.number().int().min(1).max(24),scope:repositoryScopeSchema})
export const repositoryReadSchema=z.object({record:componentSnapshotSchema,asset:componentAssetSchema})
export const repositoryPublishSchema=z.object({record:componentSnapshotSchema,duplicate:z.boolean()})
export const repositoryStateSchema=z.object({record:componentSnapshotSchema})

/** Canonical normalized snapshots: exact content identity, not geometric or semantic deduplication. */
export function componentSnapshotJson(asset:ComponentAsset){
  return JSON.stringify(parseAsset(asset),(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0)):value)
}
export async function componentSnapshotHash(asset:ComponentAsset){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(componentSnapshotJson(asset)));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')}
/** Portable ancestry points to the immutable source hash; no machine-local path enters a figure. */
export function componentFromSnapshot(input:ComponentAsset,id:string){
  snapshotIdSchema.parse(id);const asset=parseAsset(input),assetId=`snapshot-${id}`
  if(!asset.lineage.some(row=>row.assetId===assetId)){
    if(asset.lineage.length>=16)throw new Error('组件来源链已满，不能再添加本机快照派生记录；仍可导出原快照')
    asset.lineage.push({assetId,name:asset.name,revision:asset.updatedAt,...(asset.recipe?{recipe:asset.recipe}:{})})
  }
  return parseAsset(asset)
}

export const contentMatchInputSchema=z.object({asset:componentAssetSchema}).strict()
export const contentMatchResultSchema=z.object({algorithm:z.literal(componentContentAlgorithm),checkedAt:z.iso.datetime(),assetSha256:snapshotIdSchema,contentSha256:snapshotIdSchema,records:z.array(componentSnapshotSchema).max(6),total:z.number().int().nonnegative(),index:z.object({total:z.number().int().nonnegative(),remaining:z.number().int().nonnegative(),unreadable:z.number().int().nonnegative()}).strict()}).strict().refine(value=>value.records.length<=value.total&&value.index.remaining+value.index.unreadable<=value.index.total,'图形核对数量不一致')
export type ContentMatchResult=z.infer<typeof contentMatchResultSchema>
