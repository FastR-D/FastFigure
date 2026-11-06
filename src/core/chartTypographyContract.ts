import {fontFamilySchema} from './fontFamily.ts'
import {z} from 'zod'
export const chartTypographyFields={fontFamily:fontFamilySchema.optional(),fontSize:z.number().finite().min(8).max(36).optional()}
export const chartTypographyReportSchema=z.object({fontFamily:fontFamilySchema,fontSize:z.number().finite().min(8).max(36)}).strict()
