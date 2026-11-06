import { parseAsset,type ComponentAsset } from './assets.ts'
import { clone,rootContainer } from './model.ts'
import { replaceDataChart } from './dataChart.ts'
import { chartOptionsSchema,chartToolUseSchema,type ChartOptions,type DataChartSpec,type ChartToolUse } from './dataChartSchema.ts'
import { chartAxesReport } from './chartAxes.ts'
import { boxplotReport } from './boxplotStats.ts'

const observations=(s:DataChartSpec)=>JSON.stringify({x:s.x.map(String),pointLabels:s.pointLabels,dataPreparation:s.dataPreparation,boxplot:s.boxplot,series:s.series,errorLabel:s.errorLabel,note:s.note,dataSource:s.dataSource,origin:s.origin})
/** The model requests presentation; the program reads all observations from the selected snapshot. */
export function configureChartAsset(input:ComponentAsset,rawOptions:unknown):{asset:ComponentAsset;use:ChartToolUse}{
  const asset=clone(parseAsset(input)),record=rootContainer(asset.figure).dataChart
  if(!record)throw new Error('该素材的根组合不是数据图表，请先将单个图表存为组件')
  const options=Object.fromEntries(Object.entries(chartOptionsSchema.parse(rawOptions)).filter(([,value])=>value!==undefined)) as ChartOptions,before=clone(record.spec),spec:DataChartSpec={...clone(before),...options,xMin:options.xMin===null?undefined:options.xMin??before.xMin,xMax:options.xMax===null?undefined:options.xMax??before.xMax,yMin:options.yMin===null?undefined:options.yMin??before.yMin,yMax:options.yMax===null?undefined:options.yMax??before.yMax,colorMin:options.colorMin===null?undefined:options.colorMin??before.colorMin,colorMax:options.colorMax===null?undefined:options.colorMax??before.colorMax,colorCenter:options.colorCenter===null?undefined:options.colorCenter??before.colorCenter}
  if((spec.kind==='boxplot')!==(before.kind==='boxplot'))throw new Error('箱线图的原始样本与分布含义不同，请使用数据选型或编辑器确认')
  if((spec.kind==='heatmap')!==(before.kind==='heatmap'))throw new Error('热图与点线 / 柱状图的行列含义不同，请使用数据选型或图表编辑器确认转换')
  if(spec.kind==='bar'){spec.xMode='category';spec.x=before.x.map(String)}
  const result=replaceDataChart(asset.figure,'stage',spec),next=rootContainer(result.document).dataChart!
  if(observations(before)!==observations(next.spec))throw new Error('图表重绘不能修改源数值、误差或数据声明')
  asset.figure=result.document
  const sources=[...asset.sources,...result.sources];asset.sources=[...new Map(sources.map(s=>[JSON.stringify(s),s])).values()]
  if(asset.sources.length>12)throw new Error('图表重绘后来源超过 12 条，请精简来源后重试')
  asset.description=`从已保存的${before.origin==='example'?'示例':'自填'}数据重绘${{line:'折线',bar:'分组柱状',scatter:'散点',heatmap:'热',boxplot:'箱线'}[spec.kind]}图；额外对象保留，数值、误差与数据声明不变。`
  return{asset:parseAsset(asset),use:chartToolUseSchema.parse({typography:{fontFamily:next.spec.fontFamily??'MiSans',fontSize:next.spec.fontSize??10},sourceChartRevision:record.revision,chartRevision:next.revision,sourceKind:before.kind,kind:next.spec.kind,seriesCount:next.spec.series.length,conditionCount:next.spec.x.length,origin:next.spec.origin,dataPreserved:true,generated:result.generated,preserved:result.preserved,options,preparation:next.spec.dataPreparation?.preparation,axes:chartAxesReport(next.spec),...(spec.kind==='boxplot'?{boxplot:boxplotReport(next.spec)}:{})})}
}
