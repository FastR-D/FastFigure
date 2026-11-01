import {linePresetSchema,lineStyleUseSchema} from './lineStyleContract.ts'
import {sketchStyleIds} from './sketchStyle.ts'
import {z} from 'zod'
import {colorMapSchema} from './colorMappingContract.ts'
import {fontFamilies,paletteById} from '../data/materials.ts'
import {styleIds} from './styleIds.ts'
import {containerSurfaces} from './containerSurface.ts'
import {referenceUseSchema} from './referenceInputs.ts'
const id=z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/)
export const styleAssetSchema=z.object({format:z.literal('fastfigure.style'),version:z.literal(1),id,name:z.string().trim().min(1).max(100),description:z.string().trim().max(500),tags:z.array(z.string().trim().min(1).max(30)).max(10).transform(tags=>[...new Set(tags)]),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime(),sketchStyle:z.enum(sketchStyleIds).optional(),roughness:z.number().min(0).max(2).optional(),preset:z.enum(styleIds),paletteId:z.string().max(120).refine(value=>paletteById.has(value),'未知风格配色'),fontFamily:z.enum(fontFamilies),surface:z.enum(containerSurfaces).optional(),colorIndex:z.number().int().min(0).max(11).optional(),colorMap:colorMapSchema.optional(),lineStyle:linePresetSchema.optional(),guide:z.string().trim().max(1200),references:z.array(referenceUseSchema.refine(r=>r.purpose==='style'&&r.decision==='use','风格素材只记录采用的样式来源')).max(12),origin:z.object({kind:z.enum(['canvas','plan','manual']),title:z.string().min(1).max(100),runId:z.uuid().optional()}).strict()}).strict().superRefine((asset,ctx)=>{
  if(asset.colorIndex!==undefined&&asset.colorIndex>=(paletteById.get(asset.paletteId)?.colors.length??0))ctx.addIssue({code:'custom',message:'主题色色槽不在风格配色中'})
  if(new Set(asset.references.map(r=>r.sha256)).size!==asset.references.length)ctx.addIssue({code:'custom',message:'风格参考来源不能重复'})
  if(new TextEncoder().encode(JSON.stringify(asset)).length>60_000)ctx.addIssue({code:'custom',message:'风格素材最多 60 KB，请精简说明或参考来源'})
})
export type StyleAsset=z.infer<typeof styleAssetSchema>
export const styleUseSchema=z.object({asset:styleAssetSchema,application:z.enum(['manual','harness']),target:z.object({id,title:z.string().min(1).max(100)}).strict(),appliedAt:z.iso.datetime(),typography:z.enum(['applied','preferred','unchanged']),textNodes:z.number().int().min(0).max(240),skippedTextNodes:z.number().int().min(0).max(240),lines:lineStyleUseSchema.optional()}).strict()
export type StyleUse=z.infer<typeof styleUseSchema>
