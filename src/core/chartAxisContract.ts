import { z } from 'zod'

export const chartAxisScaleSchema=z.enum(['linear','log10'])
export type ChartAxisScale=z.infer<typeof chartAxisScaleSchema>
const numericAxis=z.object({scale:chartAxisScaleSchema,min:z.number().finite(),max:z.number().finite()}).strict().superRefine((a,ctx)=>{
  if(a.min>=a.max||a.scale==='log10'&&a.min<=0)ctx.addIssue({code:'custom',message:'数值坐标范围无效'})
})
export const chartAxesReportSchema=z.object({x:z.union([z.object({scale:z.literal('category')}).strict(),numericAxis]),y:numericAxis}).strict()
export type ChartAxesReport=z.infer<typeof chartAxesReportSchema>
