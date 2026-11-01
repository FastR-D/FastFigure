import {z} from 'zod'
const id=z.string().min(1).max(80),finite=z.number().finite()
export const sharedYAxisRequestsSchema=z.array(z.object({containerIds:z.array(id).min(2).max(8).refine(ids=>new Set(ids).size===ids.length,'同组图表不能重复'),reason:z.string().trim().min(1).max(500)}).strict()).max(4)
export const sharedYAxisReportSchema=z.object({
  yLabel:z.string().min(1).max(40),scale:z.enum(['linear','log10']),min:finite,max:finite,reason:z.string().max(500),changed:z.boolean(),
  charts:z.array(z.object({containerId:id,title:z.string().max(100),beforeMin:finite,beforeMax:finite,beforeRevision:z.number().int().positive(),afterRevision:z.number().int().positive(),changed:z.boolean(),generated:z.number().int().nonnegative(),preserved:z.number().int().nonnegative(),formatted:z.number().int().nonnegative()}).strict()).min(2).max(8),
}).strict().refine(report=>report.max>report.min&&report.changed===report.charts.some(chart=>chart.changed),'共享纵轴报告不一致')
export type SharedYAxisReport=z.infer<typeof sharedYAxisReportSchema>
