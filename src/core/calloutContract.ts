import {z} from 'zod'
import {fontFamilies} from '../data/materials.ts'
const id=z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),finite=z.number().finite()
export const calloutSides=['auto','right','left','top','bottom'] as const
export const calloutRequestSchema=z.object({targetId:id.optional(),instanceId:id.max(30).optional(),nodeId:id.optional(),parentId:id.optional(),text:z.string().trim().min(1).max(160),fontFamily:z.enum(fontFamilies).optional(),fontSize:z.number().min(8).max(32).default(12),maxWidth:z.number().min(40).max(300).default(180),side:z.enum(calloutSides).default('auto'),reason:z.string().trim().min(1).max(240)}).strict().refine(r=>r.targetId!==undefined?r.instanceId===undefined&&r.nodeId===undefined:r.instanceId!==undefined&&r.nodeId!==undefined,'注释须选择已有 targetId，或本轮素材 instanceId / nodeId')
export const calloutRequestsSchema=z.array(calloutRequestSchema).max(8)
export type CalloutRequest=z.infer<typeof calloutRequestSchema>
export const calloutReportSchema=z.object({targetId:id,labelId:id,leaderId:id,parentId:id,text:z.string().min(1).max(160),fontFamily:z.enum(fontFamilies),fontSize:finite.min(8).max(32),side:z.enum(['right','left','top','bottom']),box:z.object({x:finite,y:finite,width:finite.positive(),height:finite.positive()}).strict(),lines:z.number().int().min(1).max(160),points:z.array(z.object({x:finite,y:finite}).strict()).min(2).max(128),reason:z.string().max(240),instanceId:id.max(30).optional(),nodeId:id.optional()}).strict()
export type CalloutReport=z.infer<typeof calloutReportSchema>
