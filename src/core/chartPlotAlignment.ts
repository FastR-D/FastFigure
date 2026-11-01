import {clone,parseDocument,type FigureDocument,type FigureNode} from './model.ts'
import {buildDataChart} from './dataChart.ts'
import {scaleComponent} from './assets.ts'
import {ancestors,translateGeometry} from './geometry.ts'
import {reflowDataChart,sameChartValue} from './chartReflow.ts'
import {plotAlignmentRequestSchema,plotAlignmentRequestsSchema,plotAlignmentReportSchema,type ChartPlotArea,type PlotAlignmentReport} from './chartPlotContract.ts'
import {heatmapPlotLayout} from './heatmap.ts'

/** Read actual generated axes, not the outer component's bounding box. */
export function chartPlotBounds(nodes:FigureNode[]):ChartPlotArea{
  const matrix=nodes.find(node=>node.chart?.key==='matrix-frame')
  if(matrix?.kind==='rectangle')return{left:matrix.x,right:matrix.x+matrix.width,top:matrix.y,bottom:matrix.y+matrix.height}
  const y=nodes.find(node=>node.chart?.key==='axis-y'),x=nodes.find(node=>node.chart?.key==='axis-x')
  if(!y?.path||!x?.path)throw new Error('图表缺少完整坐标轴，请先从数据恢复')
  const points=[x,y].flatMap(node=>node.path!.points.map(p=>({x:node.x+p.x*node.width,y:node.y+p.y*node.height})))
  return{left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))}
}
export function chartPlotTargets(figure:FigureDocument,selectedIds:string[]=[]){
  return figure.containers.filter(root=>root.dataChart).map(root=>{
    const source=root.dataChart!.spec,info={containerId:root.id,title:root.title,kind:source.kind,...(source.kind==='heatmap'?{matrix:{rows:source.x.length,columns:source.series.length}}:{}),selected:selectedIds.some(id=>id===root.id||ancestors(figure,id).includes(root.id))}
    try{
      if(root.parametric||root.reconstruction||root.structureOrigin)throw new Error('同一容器有其他受管理结构')
      const scale=root.metricScale??1
      if(Math.abs(root.width-760*scale)>1e-5||Math.abs(root.height-460*scale)>1e-5)throw new Error('图表外框已单独拉伸，请先恢复图表尺寸')
      const canonical=scaleComponent(buildDataChart(root.dataChart!.spec),scale).figure
      const current=figure.nodes.filter(node=>node.parentId===root.id&&node.chart?.key),byKey=new Map(current.map(node=>[node.chart!.key!,node]))
      if(figure.nodes.some(node=>node.chart&&node.parentId!==root.id&&ancestors(figure,node.id).includes(root.id)))throw new Error('生成图元已重新分组，请先整理')
      if(current.length!==canonical.nodes.length)throw new Error('生成图元已增删，请先从数据恢复，保留另加对象')
      for(const node of canonical.nodes){
        const old=byKey.get(node.chart!.key!)
        if(!old||old.kind!==node.kind)throw new Error('生成图元表示与源数据不同，请先整理')
        if(node.kind==='text')continue
        const expected=clone(node);translateGeometry(expected,root.x,root.y)
        if(!sameChartValue([old.x,old.y,old.width,old.height,old.path],[expected.x,expected.y,expected.width,expected.height,expected.path]))throw new Error('数据标记或坐标轴已手工移动 / 改形；请先确认数据重绘，避免覆盖手工几何')
      }
      const spec=clone(root.dataChart!.spec);delete spec.plotArea
      if(spec.kind==='heatmap'){
        const area=heatmapPlotLayout(spec).natural,natural={left:root.x+area.left*scale,right:root.x+area.right*scale,top:root.y+area.top*scale,bottom:root.y+area.bottom*scale}
        return{...info,bounds:chartPlotBounds(current),natural,error:''}
      }
      const naturalNodes=scaleComponent(buildDataChart(spec),scale).figure.nodes
      naturalNodes.forEach(node=>translateGeometry(node,root.x,root.y))
      return{...info,bounds:chartPlotBounds(current),natural:chartPlotBounds(naturalNodes),error:''}
    }catch(error){return{...info,bounds:undefined,natural:undefined,error:(error as Error).message}}
  })
}
/** Each row shares a height and each column a width. A heatmap couples those
 * dimensions by its matrix aspect ratio; solve each connected set at its
 * largest feasible scale instead of stretching cells or aligning only frames. */
function gridAreas(targets:{natural:ChartPlotArea;matrix?:{rows:number;columns:number}}[],columns:number){
  const rows=Math.ceil(targets.length/columns),ranges=Array.from({length:rows+columns},(_,vertex)=>{
    const row=vertex<rows,items=targets.filter((_,i)=>row?Math.floor(i/columns)===vertex:i%columns===vertex-rows),lower=Math.max(...items.map(t=>row?t.natural.top:t.natural.left)),upper=Math.min(...items.map(t=>row?t.natural.bottom:t.natural.right))
    if(!(upper>lower))throw new Error('同行 / 同列没有足够的共同绘图区，请核对图表顺序、外框位置和字号。整次操作未应用')
    return{lower,upper,capacity:upper-lower}
  }),graph=Array.from({length:ranges.length},()=>[] as {to:number;ratio:number}[])
  targets.forEach((target,i)=>{if(!target.matrix)return;const row=Math.floor(i/columns),column=rows+i%columns,ratio=target.matrix.columns/target.matrix.rows;graph[row]!.push({to:column,ratio});graph[column]!.push({to:row,ratio:1/ratio})})
  const dimensions=ranges.map(range=>range.capacity),visited=new Set<number>()
  for(let start=0;start<graph.length;start++){
    if(visited.has(start))continue
    const factors=new Map([[start,1]]),queue=[start];visited.add(start)
    for(let at=0;at<queue.length;at++){
      const vertex=queue[at]!,factor=factors.get(vertex)!
      for(const edge of graph[vertex]!){const next=factor*edge.ratio,previous=factors.get(edge.to)
        if(previous!==undefined){if(Math.abs(previous-next)>1e-8*Math.max(previous,next))throw new Error('热图矩阵宽高比例与当前行列网格不相容，无法同时对齐并保持正方形单元格；请调整图表顺序或列数。整次操作未应用')}
        else{factors.set(edge.to,next);visited.add(edge.to);queue.push(edge.to)}
      }
    }
    const unit=Math.min(...[...factors].map(([vertex,factor])=>ranges[vertex]!.capacity/factor))
    for(const[vertex,factor]of factors)dimensions[vertex]=unit*factor
  }
  return targets.map((_,i)=>{const row=Math.floor(i/columns),column=rows+i%columns,h=dimensions[row]!,w=dimensions[column]!,left=ranges[column]!.lower+(ranges[column]!.capacity-w)/2,top=ranges[row]!.lower+(ranges[row]!.capacity-h)/2;return{left,right:left+w,top,bottom:top+h}})
}
/** Explicit row-major slots; intersect available space within each row / column.
 * Scientific values and domains stay fixed; only the mapping to physical positions changes. */
export function alignChartPlots(input:FigureDocument,raw:unknown):{document:FigureDocument;report:PlotAlignmentReport}{
  const request=plotAlignmentRequestSchema.parse(raw),doc=parseDocument(clone(input)),inventory=new Map(chartPlotTargets(doc).map(target=>[target.containerId,target]))
  const targets=request.containerIds.map(id=>{const target=inventory.get(id);if(!target?.natural||!target.bounds||target.error)throw new Error(`「${target?.title??id}」：${target?.error||'请选择原生数据图表'}`);return target})
  const columns=request.columns,rows=Math.ceil(targets.length/columns),areas=gridAreas(targets.map(target=>({natural:target.natural!,matrix:target.matrix})),columns),charts:PlotAlignmentReport['charts']=[]
  let result=doc
  for(const [index,target] of targets.entries()){
    const row=Math.floor(index/columns),column=index%columns
    const after=areas[index]!
    const root=doc.containers.find(c=>c.id===target.containerId)!,scale=root.metricScale??1,record=root.dataChart!
    const plotArea={left:(after.left-root.x)/scale,right:(after.right-root.x)/scale,top:(after.top-root.y)/scale,bottom:(after.bottom-root.y)/scale}
    const changed=!sameChartValue(record.spec.plotArea,plotArea)
    let generated=0,preserved=0,formatted=0
    if(changed){try{const reflow=reflowDataChart(result,root.id,{...record.spec,plotArea});result=reflow.document;generated=reflow.generated;preserved=reflow.preserved;formatted=reflow.formatted}catch(error){throw new Error(`「${root.title}」绘图区无法对齐：${error instanceof Error&&!('issues'in error)?error.message:'同行 / 同列没有足够的共同绘图区，请核对图表顺序、字号和间距'}。整次操作未应用`,{cause:error})}}
    charts.push({containerId:root.id,title:root.title,row:row+1,column:column+1,before:target.bounds!,after,changed,beforeRevision:record.revision,afterRevision:result.containers.find(c=>c.id===root.id)!.dataChart!.revision,generated,preserved,formatted})
  }
  const report=plotAlignmentReportSchema.parse({columns,rows,reason:request.reason,changed:charts.some(chart=>chart.changed),charts})
  return{document:report.changed?result:clone(input),report}
}
export function applyPlotAlignments(input:FigureDocument,raw:unknown){
  const requests=plotAlignmentRequestsSchema.parse(raw),reports:PlotAlignmentReport[]=[];let figure=clone(input)
  for(const request of requests){const result=alignChartPlots(figure,request);figure=result.document;reports.push(result.report)}
  return{figure,reports}
}
