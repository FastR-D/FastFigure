import {z} from 'zod'
import {fontFamilies} from '../data/materials.ts'
export const chartTypographyFields={fontFamily:z.enum(fontFamilies).optional(),fontSize:z.number().finite().min(8).max(36).optional()}
export const chartTypographyReportSchema=z.object({fontFamily:z.enum(fontFamilies),fontSize:z.number().finite().min(8).max(36)}).strict()
