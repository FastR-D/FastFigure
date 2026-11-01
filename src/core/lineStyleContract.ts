import {z} from 'zod'

export const edgeAppearanceSchema=z.object({stroke:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),strokeWidth:z.number().finite().min(.01).max(64).optional(),dash:z.array(z.number().finite().min(0).max(2000)).max(16).refine(v=>!v.length||v.some(n=>n>0),'虚线间隔不能全为零').optional(),arrow:z.enum(['none','open','filled']).optional(),startArrow:z.enum(['none','open','filled']).optional(),arrowSize:z.number().finite().min(.1).max(256).optional()}).strict()
export const lineStylePatchSchema=edgeAppearanceSchema.extend({stroke:edgeAppearanceSchema.shape.stroke.unwrap().nullable().optional(),strokeWidth:edgeAppearanceSchema.shape.strokeWidth.unwrap().nullable().optional(),dash:edgeAppearanceSchema.shape.dash.unwrap().nullable().optional(),arrowSize:edgeAppearanceSchema.shape.arrowSize.unwrap().nullable().optional()}).strict().refine(v=>Object.values(v).some(value=>value!==undefined),'请至少选择一项连线样式')
export type LineStylePatch=z.infer<typeof lineStylePatchSchema>
export const linePresetSchema=z.object({scope:z.enum(['edges','all-lines']),style:lineStylePatchSchema}).strict()
export type LinePreset=z.infer<typeof linePresetSchema>
export const lineStyleUseSchema=z.object({total:z.number().int().min(0).max(360),changed:z.number().int().min(0).max(360),skipped:z.number().int().min(0).max(360)}).strict().refine(v=>v.changed<=v.total,'连线调整数不能超过可处理数')
