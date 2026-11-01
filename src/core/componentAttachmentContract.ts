import {z} from 'zod'
export const componentAttachmentSchema=z.object({pathId:z.string().min(1).max(160).regex(/^[a-zA-Z0-9_-]+$/),end:z.enum(['start','end']),instanceId:z.string().min(1).max(30).regex(/^[a-zA-Z0-9_-]+$/),nodeId:z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),anchorIndex:z.number().int().min(0).max(127),reason:z.string().trim().min(1).max(240)}).strict()
export type ComponentAttachment=z.infer<typeof componentAttachmentSchema>
