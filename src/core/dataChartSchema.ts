import { z } from 'zod'
import { boxplotRulesSchema,boxplotReportSchema } from './boxplotContract.ts'
import { chartPreparedSourceSchema,chartPreparationSchema } from './chartDatasetContract.ts'
import { checkPreparedChart } from './chartPivot.ts'
import { chartAxisScaleSchema,chartAxesReportSchema } from './chartAxisContract.ts'
import {chartTypographyFields,chartTypographyReportSchema} from './chartTypographyContract.ts'
import {chartPlotAreaSchema} from './chartPlotContract.ts'

const value=z.number().finite().min(-1e12).max(1e12),singleLine=z.string().trim().regex(/^[^\r\n\t]*$/,'图表文字须为单行'),label=singleLine.min(1).max(24)
export const dataChartSpecSchema=z.object({
  ...chartTypographyFields,
  plotArea:chartPlotAreaSchema.optional(),
  version:z.literal(1),dataPreparation:chartPreparedSourceSchema.optional(),kind:z.enum(['line','bar','scatter','heatmap','boxplot']),xMode:z.enum(['numeric','category']),
  title:singleLine.min(1).max(80),xLabel:singleLine.max(40),yLabel:singleLine.max(40),
  x:z.array(z.union([value,label])).min(2).max(80),
  pointLabels:z.array(singleLine.max(24)).min(2).max(80).optional(),
  series:z.array(z.object({name:label,values:z.array(value.nullable()).min(2).max(80),errors:z.array(value.min(0).nullable()).min(2).max(80).optional()}).strict()).min(1).max(12),
  yMin:value.optional(),yMax:value.optional(),showValues:z.boolean(),grid:z.boolean(),
  xMin:value.optional(),xMax:value.optional(),xScale:chartAxisScaleSchema.optional(),yScale:chartAxisScaleSchema.optional(),
  colorMin:value.optional(),colorMax:value.optional(),colorCenter:value.optional(),
  valueLabel:singleLine.max(40).optional(),
  boxplot:boxplotRulesSchema.optional(),showSamples:z.boolean().optional(),
  errorLabel:singleLine.max(80),note:singleLine.max(100),dataSource:z.string().trim().max(500),
  origin:z.enum(['example','user']),paletteId:z.string().min(1).max(120),
}).strict().superRefine((s,ctx)=>{
  const problem=(message:string)=>ctx.addIssue({code:'custom',message})
  if(s.plotArea){
    const width=s.plotArea.right-s.plotArea.left,height=s.plotArea.bottom-s.plotArea.top
    if(s.kind==='heatmap'){
      if(Math.abs(width/s.series.length-height/s.x.length)>1e-6*Math.max(width,height))problem('热图固定绘图区须保持正方形单元格，不能拉伸矩阵')
    }else if(width<240||height<140)problem('绘图区至少需要 240 × 140')
  }
  try{checkPreparedChart(s)}catch(error){problem((error as Error).message)}
  if(s.kind==='heatmap'&&(s.xScale!==undefined||s.yScale!==undefined||s.xMin!==undefined||s.xMax!==undefined))problem('热图使用数值色标，不接受坐标刻度或横轴范围')
  if(s.xMode==='category'&&(s.xScale==='log10'||s.xMin!==undefined||s.xMax!==undefined))problem('分类 / 样本标识轴不接受对数刻度或数值范围')
  if(s.kind==='bar'&&s.yScale==='log10')problem('柱状图保留零基线，不使用对数纵轴')
  if(s.xMin!==undefined&&s.xMax!==undefined&&s.xMin>=s.xMax)problem('横轴最小值必须小于最大值')
  if(s.kind==='heatmap'){
    if(s.xMode!=='category')problem('热图行标签使用分类模式')
    if(!s.valueLabel)problem('请填写热图色标标题或数值单位')
    if(s.pointLabels||s.series.some(row=>row.errors)||s.errorLabel||s.yMin!==undefined||s.yMax!==undefined)problem('热图不接受点标注、误差棒或纵轴范围；请确认数据含义后使用矩阵值与数值色标')
    if(s.colorMin!==undefined&&s.colorMax!==undefined&&s.colorMin>=s.colorMax)problem('色标最小值必须小于最大值')
  }else{
    if(s.series.length>(s.kind==='boxplot'?6:4))problem('箱线图最多 6 组；折线、柱状与散点最多 4 个系列')
    if(s.colorMin!==undefined||s.colorMax!==undefined||s.colorCenter!==undefined||s.valueLabel!==undefined)problem('数值色标仅用于热图')
  }
  if(s.kind==='boxplot'){
    if(!s.boxplot||s.showSamples===undefined||s.xMode!=='category')problem('箱线图须声明为原始观测、指定统计规则与原始点显示，并使用唯一的样本标识')
    if(s.pointLabels||s.errorLabel||s.series.some(row=>row.errors))problem('箱线图只接收原始样本，不接受误差列、已汇总结果或点标注')
    if(s.series.some(row=>row.values.filter(v=>v!==null).length<2))problem('每组至少需要 2 个有效原始样本')
  }else if(s.boxplot||s.showSamples!==undefined)problem('原始样本统计规则仅用于箱线图')
  if(s.kind==='bar'&&s.xMode!=='category')problem('柱状图使用分类横轴')
  if(s.kind==='scatter'&&s.xMode!=='numeric')problem('散点图使用数值横轴')
  if(!['scatter','boxplot'].includes(s.kind)&&s.x.length>20)problem('数值折线最多 20 个点，散点 / 箱线最多 80 行')
  if(s.kind!=='boxplot'&&s.xMode==='category'&&s.x.length>12)problem('分类横轴最多 12 项；数值折线最多 20 个点')
  if(s.xMode==='numeric'&&s.x.some(x=>typeof x!=='number'))problem('数值横轴必须全部为数值')
  if(s.pointLabels&&s.pointLabels.length!==s.x.length)problem('数据行标注须与横轴逐行对应')
  if(s.kind!=='scatter'&&new Set(s.x.map(String)).size!==s.x.length)problem('横轴值不能重复，请先明确区分实验条件')
  if(new Set(s.series.map(row=>row.name)).size!==s.series.length)problem('系列名称不能重复')
  for(const row of s.series){
    if(row.values.length!==s.x.length||row.errors&&row.errors.length!==s.x.length)problem('每个系列的数值与误差须和横轴逐行对应')
    if(s.kind!=='heatmap'&&row.values.every(v=>v===null))problem(`系列「${row.name}」至少需要一个有效数值`)
    if(row.errors?.some((e,i)=>e!==null&&row.values[i]===null))problem('缺失值不能单独填写误差')
    if(row.errors?.some(e=>e!==null)&&!s.errorLabel)problem('请填写误差棒含义，例如 mean ± SD；不会自动推断统计量')
  }
  if(s.kind==='heatmap'&&s.series.every(row=>row.values.every(v=>v===null)))problem('热图至少需要一个有效数值')
  if(s.yMin!==undefined&&s.yMax!==undefined&&s.yMin>=s.yMax)problem('纵轴最小值必须小于最大值')
  if(s.kind==='bar'&&(s.yMin!==undefined&&s.yMin>0||s.yMax!==undefined&&s.yMax<0))problem('柱状图纵轴范围必须包含零基线')
})
export type DataChartSpec=z.infer<typeof dataChartSpecSchema>
export const dataChartRecordSchema=z.object({spec:dataChartSpecSchema,revision:z.number().int().positive()}).strict()
/** Presentation-only overrides: no observations, error interpretation or provenance fields. */
export const chartOptionsSchema=z.object({
  ...chartTypographyFields,
  kind:z.enum(['line','bar','scatter','heatmap','boxplot']).optional(),title:singleLine.min(1).max(80).optional(),
  xLabel:singleLine.max(40).optional(),yLabel:singleLine.max(40).optional(),
  yMin:value.nullable().optional(),yMax:value.nullable().optional(),showValues:z.boolean().optional(),grid:z.boolean().optional(),
  xMin:value.nullable().optional(),xMax:value.nullable().optional(),xScale:chartAxisScaleSchema.optional(),yScale:chartAxisScaleSchema.optional(),
  colorMin:value.nullable().optional(),colorMax:value.nullable().optional(),colorCenter:value.nullable().optional(),
  valueLabel:singleLine.min(1).max(40).optional(),
  showSamples:z.boolean().optional(),
  paletteId:z.string().min(1).max(120).optional(),
}).strict()
export type ChartOptions=z.infer<typeof chartOptionsSchema>
export const chartToolUseSchema=z.object({typography:chartTypographyReportSchema.optional(),sourceChartRevision:z.number().int().positive(),chartRevision:z.number().int().positive(),sourceKind:z.enum(['line','bar','scatter','heatmap','boxplot']),kind:z.enum(['line','bar','scatter','heatmap','boxplot']),seriesCount:z.number().int().min(1).max(12),conditionCount:z.number().int().min(2).max(80),origin:z.enum(['example','user']),dataPreserved:z.literal(true),generated:z.number().int().nonnegative().max(240),preserved:z.number().int().nonnegative().max(261),options:chartOptionsSchema,preparation:chartPreparationSchema.optional(),axes:chartAxesReportSchema.optional(),boxplot:boxplotReportSchema.optional()}).strict()
export type ChartToolUse=z.infer<typeof chartToolUseSchema>
