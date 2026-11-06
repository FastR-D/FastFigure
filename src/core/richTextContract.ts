import {fontFamilySchema} from './fontFamily.ts'
import {z} from 'zod'
export const textRunSchema=z.object({text:z.string().max(240),family:fontFamilySchema.optional(),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),bold:z.boolean().optional(),italic:z.boolean().optional(),script:z.enum(['normal','super','sub']).optional()}).strict()
export const textRunsSchema=z.array(textRunSchema).min(1).max(24).refine(runs=>runs.map(r=>r.text).join('').length<=240,'混合文字最多 240 字')
export type TextRun=z.infer<typeof textRunSchema>
