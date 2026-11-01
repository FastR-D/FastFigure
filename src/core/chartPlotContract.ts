import {z} from 'zod'
const finite=z.number().finite()
export const chartPlotAreaSchema=z.object({left:finite.min(0).max(760),right:finite.min(0).max(760),top:finite.min(0).max(460),bottom:finite.min(0).max(460)}).strict().refine(area=>area.right>area.left&&area.bottom>area.top,'绘图区宽高须为正数')
export type ChartPlotArea=z.infer<typeof chartPlotAreaSchema>
const id=z.string().min(1).max(80)
export const plotAlignmentRequestSchema=z.object({containerIds:z.array(id).min(2).max(8).refine(ids=>new Set(ids).size===ids.length,'图表不能重复'),columns:z.number().int().min(1).max(4),reason:z.string().trim().min(1).max(500)}).strict().refine(request=>request.columns<=request.containerIds.length,'列数不能超过图表数')
export const plotAlignmentRequestsSchema=z.array(plotAlignmentRequestSchema).max(1)
const worldArea=z.object({left:finite,right:finite,top:finite,bottom:finite}).strict()
export const plotAlignmentReportSchema=z.object({columns:z.number().int().min(1).max(4),rows:z.number().int().min(1).max(8),reason:z.string().max(500),changed:z.boolean(),charts:z.array(z.object({containerId:id,title:z.string().max(100),row:z.number().int().min(1).max(8),column:z.number().int().min(1).max(4),before:worldArea,after:worldArea,changed:z.boolean(),beforeRevision:z.number().int().positive(),afterRevision:z.number().int().positive(),generated:z.number().int().nonnegative(),preserved:z.number().int().nonnegative(),formatted:z.number().int().nonnegative()}).strict()).min(2).max(8)}).strict().refine(report=>report.changed===report.charts.some(chart=>chart.changed),'绘图区报告不一致')
export type PlotAlignmentReport=z.infer<typeof plotAlignmentReportSchema>
/** Insets may reserve more room, but never consume space required by labels. */
export function resolveChartPlotArea(natural:ChartPlotArea,requested?:ChartPlotArea):ChartPlotArea{
  if(!requested)return natural
  const area=chartPlotAreaSchema.parse(requested),epsilon=1e-6
  if(area.left<natural.left-epsilon||area.right>natural.right+epsilon||area.top<natural.top-epsilon||area.bottom>natural.bottom+epsilon)throw new Error('固定绘图区侵占标签留白；请先恢复自动绘图区，再调整字号、文字或重新对齐')
  return area
}
