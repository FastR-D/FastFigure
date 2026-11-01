import {sharedColorbarReportSchema} from './sharedColorbarContract.ts'
import {plotAlignmentReportSchema} from './chartPlotContract.ts'
import {sharedLegendReportSchema} from './sharedLegendContract.ts'
import { z } from 'zod'
import { referenceUseSchema } from './referenceInputs.ts'
import { chartPreparationSchema,chartPivotOperationSchema } from './chartDatasetContract.ts'
import { datasetInfoSchema } from './chartDataset.ts'
import { chartAxisScaleSchema,chartAxesReportSchema } from './chartAxisContract.ts'
import { boxplotReportSchema } from './boxplotContract.ts'
import {chartTypographyFields,chartTypographyReportSchema} from './chartTypographyContract.ts'
import {sharedYAxisReportSchema} from './sharedYAxisContract.ts'
const text=z.string().trim().min(1),column=z.string().regex(/^c(?:[0-9]|1[01])$/)
const explanation={reason:text.max(1200),alternatives:z.array(z.object({kind:text.max(40),reason:text.max(300)}).strict()).max(4),cautions:z.array(text.max(300)).max(8)}
export const chartReadyRecommendationSchema=z.object({...chartTypographyFields,status:z.literal('ready'),kind:z.enum(['line','bar','scatter','heatmap','boxplot']),xColumn:column,labelColumn:column.optional(),series:z.array(z.object({column,errorColumn:column.optional()}).strict()).min(1).max(12),title:text.max(80),xLabel:z.string().trim().max(40),yLabel:z.string().trim().max(40),paletteId:text.max(120),grid:z.boolean(),showValues:z.boolean(),xScale:chartAxisScaleSchema.optional(),yScale:chartAxisScaleSchema.optional(),xMin:z.number().finite().min(-1e12).max(1e12).optional(),xMax:z.number().finite().min(-1e12).max(1e12).optional(),yMin:z.number().finite().min(-1e12).max(1e12).optional(),yMax:z.number().finite().min(-1e12).max(1e12).optional(),showSamples:z.boolean().optional(),valueLabel:text.max(40).optional(),colorMin:z.number().finite().min(-1e12).max(1e12).optional(),colorMax:z.number().finite().min(-1e12).max(1e12).optional(),colorCenter:z.number().finite().min(-1e12).max(1e12).optional(),...explanation}).strict().superRefine((r,ctx)=>{
    if(r.kind==='heatmap'&&[r.xScale,r.yScale,r.xMin,r.xMax,r.yMin,r.yMax].some(v=>v!==undefined))ctx.addIssue({code:'custom',message:'热图使用独立色标，不接受数值坐标参数'})
    if(r.kind==='bar'&&r.yScale==='log10')ctx.addIssue({code:'custom',message:'柱状图保留零基线，不使用对数纵轴'})
    if(r.kind==='heatmap'){
      if(r.labelColumn||r.series.some(s=>s.errorColumn)||!r.valueLabel)ctx.addIssue({code:'custom',message:'热图需要数值色标标题，不接受点标注或误差列'})
    }else if(r.series.length>(r.kind==='boxplot'?6:4)||r.valueLabel!==undefined||r.colorMin!==undefined||r.colorMax!==undefined||r.colorCenter!==undefined)ctx.addIssue({code:'custom',message:'箱线最多 6 组，点线 / 柱状最多 4 个系列，不使用热图色标字段'})
    if(r.kind==='boxplot'){if(r.showSamples===undefined||r.labelColumn||r.series.some(s=>s.errorColumn))ctx.addIssue({code:'custom',message:'箱线图需指定原始点显示，不接受误差列或点标注'})}
    else if(r.showSamples!==undefined)ctx.addIssue({code:'custom',message:'原始样本点显示仅用于箱线图'})
  })
export type ChartReadyRecommendation=z.infer<typeof chartReadyRecommendationSchema>
export const chartRecommendationSchema=z.discriminatedUnion('status',[
  chartReadyRecommendationSchema,
  z.object({status:z.literal('multi-view'),sharedColorbar:z.boolean().optional(),alignPlots:z.boolean().optional(),sharedLegend:z.boolean().optional(),sharedY:z.boolean().optional(),title:text.max(80),columns:z.union([z.literal(1),z.literal(2)]),gap:z.number().int().min(16).max(64),views:z.array(z.object({caption:z.string().trim().max(70).regex(/^[^\r\n]*$/),chart:chartReadyRecommendationSchema}).strict()).min(2).max(4),...explanation}).strict(),
  z.object({status:z.literal('prepare'),operation:chartPivotOperationSchema,...explanation}).strict(),
  z.object({status:z.literal('needs-input'),suggestedKind:text.max(40),questions:z.array(text.max(300)).min(1).max(5),...explanation}).strict(),
])
export type ChartRecommendation=z.infer<typeof chartRecommendationSchema>
const mappingSchema=z.object({x:z.string(),labels:z.string().optional(),series:z.array(z.object({name:z.string(),error:z.string().optional()})),unusedColumns:z.array(z.string())})
const scaleSchema=z.object({title:z.string(),mode:z.enum(['sequential','diverging']),min:z.number().finite(),max:z.number().finite(),center:z.number().finite().optional(),valueLabel:z.string()}).strict()
export const compiledChartViewSchema=z.object({
  typography:chartTypographyReportSchema,
  mapping:mappingSchema,errorLabel:z.string().max(80),scale:scaleSchema.optional(),boxplot:boxplotReportSchema.optional(),axes:chartAxesReportSchema.optional(),
}).strict()
export type CompiledChartView=z.infer<typeof compiledChartViewSchema>
export const chartRecommendationReportSchema=z.object({
  typography:chartTypographyReportSchema.optional(),
  dataset:datasetInfoSchema,preparation:chartPreparationSchema.optional(),recommendation:chartRecommendationSchema,
  referenceUse:z.array(referenceUseSchema).max(3).optional(),declaredErrorLabel:z.string().max(80).optional(),
  mapping:mappingSchema.optional(),errorLabel:z.string().max(80).optional(),scale:scaleSchema.optional(),boxplot:boxplotReportSchema.optional(),axes:chartAxesReportSchema.optional(),
  views:z.array(compiledChartViewSchema.extend({containerId:text.max(80),panelId:text.max(80)})).min(2).max(4).optional(),
  panelLayout:z.object({columns:z.number().int().min(1).max(2),rows:z.number().int().min(1).max(4),factor:z.number().min(.1).max(1),minimumLabelSize:z.number().positive().nullable(),plotAlignment:plotAlignmentReportSchema.optional(),sharedColorbar:sharedColorbarReportSchema.optional(),sharedLegend:sharedLegendReportSchema.optional(),sharedY:sharedYAxisReportSchema.optional()}).strict().optional(),
  compiled:z.boolean(),
}).strict().superRefine((report,ctx)=>{
  if(report.recommendation.status==='multi-view'){
    if(!!report.recommendation.sharedColorbar!==!!report.panelLayout?.sharedColorbar)ctx.addIssue({code:'custom',message:'共享色标选项与实际编译报告不一致'})
    if(!!report.recommendation.alignPlots!==!!report.panelLayout?.plotAlignment)ctx.addIssue({code:'custom',message:'绘图区对齐选项与实际编译报告不一致'})
    if(!!report.recommendation.sharedLegend!==!!report.panelLayout?.sharedLegend)ctx.addIssue({code:'custom',message:'共享图例选项与实际编译报告不一致'})
    if(!!report.recommendation.sharedY!==!!report.panelLayout?.sharedY)ctx.addIssue({code:'custom',message:'共享纵轴选项与实际编译报告不一致'})
    if(!report.compiled||!report.panelLayout||report.views?.length!==report.recommendation.views.length)ctx.addIssue({code:'custom',message:'多视图报告必须对应完整的已编译视图与面板布局'})
    if(report.views&&(new Set(report.views.map(view=>view.containerId)).size!==report.views.length||new Set(report.views.map(view=>view.panelId)).size!==report.views.length))ctx.addIssue({code:'custom',message:'多视图图件与面板标识不能重复'})
    if(report.typography||report.mapping||report.axes||report.boxplot||report.scale||report.errorLabel!==undefined)ctx.addIssue({code:'custom',message:'多视图的映射、坐标与误差报告应分别归属各视图'})
  }else if(report.views||report.panelLayout)ctx.addIssue({code:'custom',message:'单图或待确认分析不能附带多视图报告'})
})
export type ChartRecommendationReport=z.infer<typeof chartRecommendationReportSchema>
