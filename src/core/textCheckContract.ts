import {z} from 'zod'
export const textCheckReasonSchema=z.enum(['line-limit','width','height'])
export type TextCheckReason=z.infer<typeof textCheckReasonSchema>
export const textCheckReasonLabels={'line-limit':'文字超出可用行数',width:'估算宽度不足',height:'估算高度不足'} as const
export const textCheckIssueSchema=z.object({nodeId:z.string().min(1).max(80),nodeLabel:z.string().max(240),field:z.string().regex(/^(label|description|structure:\d{1,2})$/),source:z.string().max(240),shown:z.string().max(1200),reasons:z.array(textCheckReasonSchema).min(1).max(3),requiredLines:z.number().int().min(1).max(4096),lineLimit:z.number().int().min(1).max(20000),fontSize:z.number().finite().positive().max(1000000),availableWidth:z.number().finite().min(-1000000).max(1000000),availableHeight:z.number().finite().min(-1000000).max(1000000)}).strict()
export type TextCheckIssue=z.infer<typeof textCheckIssueSchema>
export const textCheckReportSchema=z.object({version:z.literal(1),engine:z.literal('native-wrap-v1'),checkedNodes:z.number().int().nonnegative().max(240),checkedFields:z.number().int().nonnegative().max(4096),positionedNodes:z.number().int().nonnegative().max(240),invisibleNodes:z.number().int().nonnegative().max(240),hiddenStructureLabels:z.number().int().nonnegative().max(4096),total:z.number().int().nonnegative().max(4096),omitted:z.number().int().nonnegative().max(4096),issues:z.array(textCheckIssueSchema).max(80)}).strict().refine(r=>r.total===r.issues.length+r.omitted,'文字检查总数不一致')
export type TextCheckReport=z.infer<typeof textCheckReportSchema>
export const textCheckFieldLabel=(field:string)=>field==='label'?'标签':field==='description'?'注释':`结构标签 ${Number(field.split(':')[1])+1}`
