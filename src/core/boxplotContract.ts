import { z } from 'zod'

export const boxplotRules={sampleMeaning:'raw-observations',quartiles:'linear-type7',whiskers:'1.5-iqr'} as const
export const boxplotRulesSchema=z.object({sampleMeaning:z.literal('raw-observations'),quartiles:z.literal('linear-type7'),whiskers:z.literal('1.5-iqr')}).strict()
export const boxplotReportSchema=z.object({rules:boxplotRulesSchema,rawPointsShown:z.boolean(),outliersShown:z.literal(true),groups:z.array(z.object({name:z.string().min(1).max(24),n:z.number().int().min(2).max(80),missing:z.number().int().min(0).max(80),min:z.number().finite(),q1:z.number().finite(),median:z.number().finite(),q3:z.number().finite(),max:z.number().finite(),whiskerLow:z.number().finite(),whiskerHigh:z.number().finite(),outliers:z.number().int().min(0).max(80)}).strict()).min(1).max(6)}).strict()
export type BoxplotReport=z.infer<typeof boxplotReportSchema>
