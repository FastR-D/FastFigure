import {z} from 'zod'
import {catalogueEntrySchema,catalogueKey,type CatalogueEntry} from './catalogue.ts'
import {cataloguePreviewSchema,cataloguePreviewInfoSchema,type CataloguePreviewInfo} from './cataloguePreviewContract.ts'
import {validateCataloguePreviewLayout} from './cataloguePreview.ts'
const sha=z.string().regex(/^[a-f0-9]{64}$/)
export const selectionPreviewEntriesSchema=z.array(catalogueEntrySchema).min(1).max(24).refine(entries=>new Set(entries.map(catalogueKey)).size===entries.length,'筛选素材不能重复')
export const selectionPreviewReportSchema=z.object({requestId:z.uuid(),evidenceRunId:z.uuid(),poolSha256:sha,candidateCount:z.number().int().min(1).max(24),status:z.enum(['pending','ready','failed','cancelled']),sheets:z.array(cataloguePreviewInfoSchema).max(4),elapsedMs:z.number().int().nonnegative().optional(),error:z.string().max(1500).optional()}).strict().superRefine((value,ctx)=>{
  if(value.status==='ready'&&(value.sheets.length!==Math.ceil(value.candidateCount/6)||value.sheets.reduce((n,sheet)=>n+sheet.tiles.length,0)!==value.candidateCount))ctx.addIssue({code:'custom',message:'筛选图谱未覆盖完整候选池'})
})
export type SelectionPreviewReport=z.infer<typeof selectionPreviewReportSchema>
export const selectionPreviewRequestSchema=z.object({runId:z.uuid(),sessionId:z.uuid(),requestId:z.uuid(),poolSha256:sha,entries:selectionPreviewEntriesSchema,status:z.enum(['pending','ready'])}).strict()
export type SelectionPreviewRequest=z.infer<typeof selectionPreviewRequestSchema>
export const selectionPreviewSubmissionSchema=z.object({sessionId:z.uuid(),requestId:z.uuid(),previews:z.array(cataloguePreviewSchema).min(1).max(4).optional(),error:z.string().trim().min(1).max(1500).optional()}).strict().refine(value=>!!value.previews!==!!value.error,'提交图谱或渲染失败原因，不能同时提交')
export function selectionPreviewGroups(entries:CatalogueEntry[]){
  const valid=selectionPreviewEntriesSchema.parse(entries)
  return Array.from({length:Math.ceil(valid.length/6)},(_,index)=>valid.slice(index*6,index*6+6))
}
export function validateSelectionPreviewPages(entries:CatalogueEntry[],pages:CataloguePreviewInfo[]){
  const groups=selectionPreviewGroups(entries)
  if(pages.length!==groups.length)throw new Error('筛选图谱页数与完整候选池不符')
  groups.forEach((group,index)=>validateCataloguePreviewLayout(group,pages[index]!))
}
