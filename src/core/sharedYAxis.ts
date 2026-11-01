import {reflowDataChart} from './chartReflow.ts'
import {clone,parseDocument,type FigureDocument} from './model.ts'
import {chartAxisTitle,chartDomains} from './chartAxes.ts'
import {sharedYAxisRequestsSchema,sharedYAxisReportSchema,type SharedYAxisReport} from './sharedYAxisContract.ts'
import {ancestors} from './geometry.ts'

export function chartYAxisTargets(figure:FigureDocument,selectedIds:string[]=[]){
  return figure.containers.filter(container=>container.dataChart).map(container=>{
    const spec=container.dataChart!.spec,base={containerId:container.id,title:container.title,kind:spec.kind,yLabel:spec.yLabel,scale:spec.yScale??'linear',selected:selectedIds.some(id=>id===container.id||ancestors(figure,id).includes(container.id))}
    try{
      if(spec.kind==='heatmap')throw new Error('热图使用独立色标')
      if(!spec.yLabel.trim())throw new Error('请先填写纵轴标题与单位')
      if(container.parametric||container.reconstruction||container.structureOrigin)throw new Error('同一容器有其他受管理结构')
      const title=figure.nodes.find(node=>node.parentId===container.id&&node.chart?.key==='label-axis-y')
      if(!title||title.label!==chartAxisTitle(spec.yLabel,spec.yScale))throw new Error('纵轴标题与数据配置不一致，请先在图表编辑器同步')
      const range=chartDomains(spec).y
      return{...base,range:{min:range.min,max:range.max},error:''}
    }catch(error){return{...base,range:undefined,error:(error as Error).message}}
  })
}
type Target=ReturnType<typeof chartYAxisTargets>[number]
export function shareChartYAxis(input:FigureDocument,containerIds:string[],reason=''):{document:FigureDocument;report:SharedYAxisReport}{
  sharedYAxisRequestsSchema.parse([{containerIds,reason:reason||'统一已有图表纵轴范围'}])
  let doc=parseDocument(clone(input))
  const inventory=new Map(chartYAxisTargets(doc).map(target=>[target.containerId,target])),targets:Target[]=containerIds.map(id=>{const target=inventory.get(id);if(!target)throw new Error('只能选择当前图件中的原生数据图表');if(target.error||!target.range)throw new Error(`「${target.title}」：${target.error}`);return target})
  const first=targets[0]!
  if(targets.some(target=>target.yLabel!==first.yLabel))throw new Error('共享纵轴需要相同且非空的纵轴标题与单位；不会猜测或换算单位')
  if(targets.some(target=>target.scale!==first.scale))throw new Error('共享纵轴需要相同刻度类型，请先统一线性 / log10 设置')
  const min=Math.min(...targets.map(target=>target.range!.min)),max=Math.max(...targets.map(target=>target.range!.max)),charts:SharedYAxisReport['charts']=[]
  for(const target of targets){
    const root=doc.containers.find(container=>container.id===target.containerId)!,record=root.dataChart!,changed=record.spec.yMin!==min||record.spec.yMax!==max
    let generated=0,preserved=0,formatted=0
    if(changed){
      try{
        const result=reflowDataChart(doc,root.id,{...record.spec,yMin:min,yMax:max},true)
        doc=result.document;generated=result.generated;preserved=result.preserved;formatted=result.formatted
      }catch(error){throw new Error(`「${target.title}」无法统一坐标并保留手工样式：${error instanceof Error&&!('issues'in error)?error.message:'范围或排版超出限制'}。整次操作未应用`,{cause:error})}
    }
    charts.push({containerId:target.containerId,title:target.title,beforeMin:target.range!.min,beforeMax:target.range!.max,beforeRevision:record.revision,afterRevision:doc.containers.find(container=>container.id===target.containerId)!.dataChart!.revision,changed,generated,preserved,formatted})
  }
  return{document:doc,report:sharedYAxisReportSchema.parse({yLabel:first.yLabel,scale:first.scale,min,max,reason,changed:charts.some(chart=>chart.changed),charts})}
}
export function applySharedYAxes(input:FigureDocument,raw:unknown){
  const requests=sharedYAxisRequestsSchema.parse(raw),ids=requests.flatMap(request=>request.containerIds)
  if(new Set(ids).size!==ids.length)throw new Error('每张图表每轮只能参与一组共享纵轴')
  let figure=clone(input);const reports:SharedYAxisReport[]=[]
  for(const request of requests){const result=shareChartYAxis(figure,request.containerIds,request.reason);figure=result.document;reports.push(result.report)}
  return{figure,reports}
}
