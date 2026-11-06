import {maxCanvasSize} from './canvasContract.ts'
import {z} from 'zod'
const id=z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/)
const ids=(limit:number)=>z.array(id).max(limit).refine(values=>new Set(values).size===values.length,'快照源对象不能重复')
const point=z.object({x:z.number().finite().min(0).max(maxCanvasSize),y:z.number().finite().min(0).max(maxCanvasSize)}).strict()
export const detailInsetRequestSchema=z.object({kind:z.literal('detail-inset'),objectIds:ids(24).min(1),parentId:id,scale:z.number().finite().min(1).max(4),caption:z.string().trim().min(1).max(60),guides:z.boolean().default(true),position:point.optional()}).strict()
export const nativeDetailSourceSchema=z.object({version:z.literal(1),sourceTitle:z.string().min(1).max(100),capturedAt:z.iso.datetime(),requestedIds:ids(24).min(1),objectIds:ids(261).min(1),omittedEdgeIds:ids(120),detachedEndpoints:z.array(z.object({nodeId:id,end:z.enum(['start','end'])}).strict()).max(480),scale:z.number().finite().min(1).max(4)}).strict().refine(record=>record.requestedIds.every(id=>record.objectIds.includes(id)),'快照选择必须包含在实际源对象中')
export type DetailInsetRequest=z.infer<typeof detailInsetRequestSchema>
