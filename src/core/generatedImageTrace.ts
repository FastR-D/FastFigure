import {z} from 'zod'
export const generatedImageTraceSchema=z.object({runId:z.uuid(),sha256:z.string().regex(/^[a-f0-9]{64}$/),provider:z.literal('codex-imagegen'),illustrative:z.literal(true)}).strict()
export type GeneratedImageTrace=z.infer<typeof generatedImageTraceSchema>
