import { z } from 'zod'
import { clone, type FigureDocument } from './model.ts'
import { diffFigures } from './figureDiff.ts'
import { reconstructionImageSchema } from './reconstructionContract.ts'

const regionId=z.string().min(1).max(160).regex(/^[a-zA-Z0-9_-]+$/)
export const repairPlanInputSchema=z.object({
  sessionId:z.uuid(),parentRunId:z.uuid(),content:z.string().trim().min(1).max(12000),model:z.string().trim().max(100).optional(),
  totalSeconds:z.number().int().min(60).max(1200),perRunSeconds:z.number().int().min(30).max(600),
  regions:z.array(z.object({regionId,image:reconstructionImageSchema}).strict()).min(1).max(6),
}).strict().refine(p=>new Set(p.regions.map(r=>r.regionId)).size===p.regions.length,'核对分区不能重复')
export type RepairPlanInput=z.infer<typeof repairPlanInputSchema>
export const repairPlanSchema=z.object({
  id:z.uuid(),sessionId:z.uuid(),parentRunId:z.uuid(),latestCandidateRunId:z.uuid(),activeRunId:z.uuid().optional(),containerId:z.string(),
  createdAt:z.string(),deadlineAt:z.string(),finishedAt:z.string().optional(),totalSeconds:z.number(),perRunSeconds:z.number(),remainingSeconds:z.number().nonnegative(),
  status:z.enum(['running','completed','stopped','failed']),stopping:z.boolean(),reason:z.enum(['completed','unchanged','cancelled','stale','budget','failed']).optional(),message:z.string(),
  steps:z.array(z.object({regionId,title:z.string(),runId:z.uuid().optional(),status:z.enum(['pending','running','changed','unchanged','failed','cancelled','skipped'])})).min(1).max(6),
})
export type RepairPlan=z.infer<typeof repairPlanSchema>
/** Version bumps alone do not count as drawing progress. Order is checked separately. */
export function repairContentChanged(before:FigureDocument,after:FigureDocument){
  const clean=(doc:FigureDocument)=>{const copy=clone(doc);for(const n of copy.nodes)if(n.reconstruction)n.reconstruction.version=0;for(const c of copy.containers)if(c.reconstruction)c.reconstruction.revision=0;return copy}
  return before.nodes.map(n=>n.id).join('\0')!==after.nodes.map(n=>n.id).join('\0')||before.containers.map(c=>c.id).join('\0')!==after.containers.map(c=>c.id).join('\0')||diffFigures(clean(before),clean(after)).changes.length>0
}
