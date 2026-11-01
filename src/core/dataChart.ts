import {resolveChartPlotArea} from './chartPlotContract.ts'
import { clone,createBlank,parseDocument,rootContainer,type FigureDocument,type FigureNode } from './model.ts'
import { parseAsset,scaleComponent,type ComponentAsset } from './assets.ts'
import { descendants } from './geometry.ts'
import { setPathPoints,type PathPoint } from './paths.ts'
import { dataChartSpecSchema,type DataChartSpec } from './dataChartSchema.ts'
import { paletteById } from '../data/materials.ts'
import { buildHeatmap } from './heatmap.ts'
import { chartTypography,formatChartValue as format } from './chartText.ts'
import { chartDomains,chartAxisTitle } from './chartAxes.ts'
import { buildBoxplot } from './boxplot.ts'

const W=760,H=460,ink='#253447',gridColor='#e4e9ef'
export { chartDomain } from './chartDomain.ts'
/** Compile declared values into ordinary editable marks. No statistical estimation is performed. */
export function buildDataChart(input:DataChartSpec):ComponentAsset{
  const spec=dataChartSpecSchema.parse(input)
  if(spec.kind==='heatmap')return buildHeatmap(spec)
  if(spec.kind==='boxplot')return buildBoxplot(spec)
  const palette=paletteById.get(spec.paletteId)
  if(!palette)throw new Error('请选择有效配色')
  const {y:yDomain,x:xDomain}=chartDomains(spec),xTitle=chartAxisTitle(spec.xLabel,spec.xScale),yTitle=chartAxisTitle(spec.yLabel,spec.yScale)
  const figure=createBlank(),root=rootContainer(figure);Object.assign(root,{x:0,y:0,width:W,height:H,role:'component',title:spec.title,visual:{fill:'none',stroke:'none'},dataChart:{spec:clone(spec),revision:1}})
  figure.title=spec.title;figure.style={...figure.style,preset:'precise',roughness:0,paletteId:spec.paletteId}
  const add=(key:string,node:Omit<FigureNode,'id'|'parentId'>,role:NonNullable<FigureNode['chart']>['role'],series?:number,channels:NonNullable<FigureNode['chart']>['channels']=[])=>{
    const full:FigureNode={...node,id:key,parentId:'stage',chart:{key,role,channels,...(series!==undefined?{series}:{})}};figure.nodes.push(full);return full
  }
  const typography=chartTypography(spec,add),{label,width:textWidth,size}=typography
  function path(key:string,points:PathPoint[],role:NonNullable<FigureNode['chart']>['role'],series?:number,dash?:number[]){
    if(points.length<2||!points.some((p,i)=>i>0&&!p.move))return
    const n=add(key,{kind:'path',label:'',x:0,y:0,width:1,height:1,path:{points:[{x:0,y:0},{x:1,y:1}],arrow:'none'},visual:{fill:'none',stroke:series===undefined?role==='grid'?gridColor:ink:palette!.colors[series%palette!.colors.length]!,strokeWidth:role==='grid'?.7:series===undefined?1:1.7,handDrawn:false,lineCap:'round',lineJoin:'round',...(dash?{dash}:{})}},role,series,series===undefined?[]:['stroke']);setPathPoints(n,points);return n
  }
  const tickWidths=yDomain.ticks.map(v=>textWidth(format(v),10)),naturalLeft=Math.max(76,Math.max(...tickWidths)+(yTitle?size(12)*1.3+20:20))
  if(naturalLeft>W*.4)throw new Error('纵轴刻度文字过长或字号过大，请调整字号或数据单位')
  if(textWidth(spec.title,17)>W-32)throw new Error('标题过长，请缩短文字')
  const catWidths=spec.x.map(x=>textWidth(String(x),11)),angled=spec.xMode==='category'&&Math.max(...catWidths)>(W-naturalLeft-40)/spec.x.length-8,angle=angled?Math.PI/4:0,labelDepth=angled?Math.max(...catWidths)*Math.SQRT1_2+typography.tickOffset+size(11)*.3*Math.SQRT1_2+4:typography.tickOffset+size(11)*.3+4.7
  const naturalRight=W-(spec.xMode==='category'?(angled?Math.max(...catWidths)*Math.SQRT1_2+Math.max(24,size(11)*Math.SQRT1_2+8):Math.max(...catWidths)/2+20):Math.max(32,...xDomain!.ticks.map(value=>textWidth(format(value),11)/2+8)))
  const legendY=typography.titleY+size(11)+13,legendStep=Math.max(20,size(11)*1.5)
  let legendX=naturalLeft,legendRow=0;const legends=spec.series.map(row=>{const w=textWidth(row.name,11)+36;if(w>W-naturalLeft-16)throw new Error('图例文字过长或字号过大，请调整字号或图例名称');if(legendX+w>W-16){legendRow++;legendX=naturalLeft}const item={x:legendX,y:legendY+legendRow*legendStep};legendX+=w+12;return item})
  const hasErrors=spec.series.some(s=>s.errors?.some(e=>e!==null)),naturalTop=legendY+legendRow*legendStep+Math.max(21,size(11)*.6+12),footer=typography.footer([hasErrors?spec.errorLabel:'',...(spec.origin==='example'?['Illustrative data']:[]),spec.note].filter(Boolean),W-32),naturalBottom=H-(footer.length*typography.lineStep+12)-(xTitle?size(12)*1.3+12:8)-labelDepth
  const {left,right,top,bottom}=resolveChartPlotArea({left:naturalLeft,right:naturalRight,top:naturalTop,bottom:naturalBottom},spec.plotArea)
  if(right-left<240||bottom-top<140)throw new Error('标签过密或过长，请缩短标签、减少分类或说明')
  if(yDomain.ticks.some((value,i)=>i>0&&Math.abs(yDomain.position(value)-yDomain.position(yDomain.ticks[i-1]!))*(bottom-top)<size(10)*1.3+2))throw new Error('纵轴刻度与字号过密，请减小字号或将图表分开绘制；不会缩字或隐藏刻度')
  if(angled&&(right-left)/spec.x.length*Math.SQRT1_2<size(11)*1.3+2)throw new Error('分类刻度与字号过密，请调整字号或拆分图表')
  if(yTitle&&!typography.axisFits(yTitle,(top+bottom)/2,footer.length,H))throw new Error('纵轴标题过长或字号过大，请调整字号或文字')
  if(xTitle&&textWidth(xTitle,12)>right-left)throw new Error('横轴标题过长，请缩短文字')
  const y=(v:number)=>bottom-yDomain.position(v)*(bottom-top)
  const order=spec.x.map((_,i)=>i).sort((a,b)=>spec.xMode==='numeric'?Number(spec.x[a])-Number(spec.x[b]):a-b)
  const x=(i:number)=>xDomain?left+xDomain.position(Number(spec.x[i]))*(right-left):left+(i+.5)/spec.x.length*(right-left)
  for(const [i,v] of yDomain.ticks.entries()){
    const yy=y(v);if(spec.grid)path(`grid-${i}`,[{x:left,y:yy},{x:right,y:yy}],'grid')
    path(`tick-y-${i}`,[{x:left-4,y:yy},{x:left,y:yy}],'axis');label(`label-y-${i}`,format(v),left-9,yy+size(10)*.35,10,'right')
  }
  path('axis-y',[{x:left,y:top},{x:left,y:bottom}],'axis');path('axis-x',[{x:left,y:bottom},{x:right,y:bottom}],'axis')
  if(yDomain.min<0&&yDomain.max>0)path('zero-baseline',[{x:left,y:y(0)},{x:right,y:y(0)}],'axis')
  const xTicks=xDomain?xDomain.ticks.map((value,i)=>({key:i,value,x:left+xDomain.position(value)*(right-left)})):spec.x.map((value,i)=>({key:i,value,x:x(i)}))
  if(xDomain&&xTicks.some((tick,i)=>i>0&&tick.x-xTicks[i-1]!.x<(textWidth(format(Number(tick.value)),11)+textWidth(format(Number(xTicks[i-1]!.value)),11))/2+6))throw new Error('横轴刻度与字号过密，请调整字号或范围；不会省略刻度')
  for(const tick of xTicks){path(`tick-x-${tick.key}`,[{x:tick.x,y:bottom},{x:tick.x,y:bottom+4}],'axis');label(`label-x-${tick.key}`,typeof tick.value==='number'?format(tick.value):tick.value,tick.x,bottom+typography.tickOffset,11,angled?'left':'center','axis',angle)}
  label('title',spec.title,16,typography.titleY,17,'left','annotation');label('label-axis-x',xTitle,(left+right)/2,bottom+labelDepth+size(12)+8,12,'center');label('label-axis-y',yTitle,typography.axisX,(top+bottom)/2,12,'center','axis',-Math.PI/2)
  const dash=[undefined,[6,3],[2,3],[8,3,2,3]],group=(right-left)/spec.x.length,barWidth=group*.72/spec.series.length
  if(spec.kind==='bar'&&spec.showValues&&barWidth<30)throw new Error('柱形过密，请关闭数值标签或减少分类 / 系列')
  spec.series.forEach((series,j)=>{
    const color=palette.colors[j%palette.colors.length]!,points:PathPoint[]=[],errors:PathPoint[]=[];let previous=false
    const marksStart=figure.nodes.length
    const lastValueIndex=[...order].reverse().find(k=>series.values[k]!==null)
    for(const i of order){
      const value=series.values[i];if(value===null||value===undefined){previous=false;continue}
      const xx=spec.kind==='bar'?x(i)-group*.36+barWidth*(j+.5):x(i),yy=y(value),key=`series-${j}-point-${i}`
      if(spec.kind!=='bar'){
        if(spec.kind==='line'){points.push({x:xx,y:yy,...(!previous&&points.length?{move:true}:{})});previous=true}
        add(key,{kind:j===1?'rectangle':j===2?'diamond':'ellipse',label:'',name:`${series.name} · ${spec.x[i]}: ${value}`,x:xx-3,y:yy-3,width:6,height:6,visual:{fill:j===3?'#ffffff':color,stroke:color,strokeWidth:1.3,radius:0,handDrawn:false}},'series',j,j===3?['stroke']:['fill','stroke'])
      }else if(Math.abs(yy-y(0))<1)path(key,[{x:xx-barWidth*.42,y:yy},{x:xx+barWidth*.42,y:yy}],'series',j)
      else add(key,{kind:'rectangle',label:'',name:`${series.name} · ${spec.x[i]}: ${value}`,x:xx-barWidth*.42,y:Math.min(yy,y(0)),width:barWidth*.84,height:Math.abs(yy-y(0)),visual:{fill:color,stroke:color,fillOpacity:.85,strokeWidth:.8,radius:0,handDrawn:false}},'series',j,['fill','stroke'])
      const error=series.errors?.[i]
      if(error!==undefined&&error!==null&&error>0){const upper=y(value+error),lower=y(value-error);errors.push({x:xx-3,y:upper,move:true},{x:xx+3,y:upper},{x:xx,y:upper,move:true},{x:xx,y:lower},{x:xx-3,y:lower,move:true},{x:xx+3,y:lower})}
      if(spec.showValues&&(spec.kind!=='line'||i===lastValueIndex))label(`series-${j}-value-${i}`,format(value),xx,Math.max(top+size(10)+2,Math.min(bottom-size(10)*.3-1,y(value+(error??0))-8)),10,'center','series',0,j)
      if(spec.pointLabels?.[i]){const text=spec.pointLabels[i]!,half=textWidth(text,10)/2,upper=y(value+(error??0));if(half*2>right-left)throw new Error('点标注文字与字号过宽，请调整字号或标注');label(`series-${j}-label-${i}`,text,Math.max(left+half,Math.min(right-half,xx)),Math.max(top+size(10)+2,Math.min(bottom-size(10)*.3-1,upper-10<top+size(10)+2?y(value-(error??0))+size(10)+5:upper-10)),10,'center','annotation')}
    }
    const pathsStart=figure.nodes.length
    path(`series-${j}-line`,points,'series',j,dash[j]);for(let at=0;at<errors.length;at+=120)path(`series-${j}-errors${at?`-${at/120}`:''}`,errors.slice(at,at+120),'series',j)
    if(spec.kind==='line'){const lines=figure.nodes.splice(pathsStart);figure.nodes.splice(marksStart,0,...lines)}
    const legend=legends[j]!
    if(spec.kind==='line')path(`series-${j}-legend`,[{x:legend.x,y:legend.y-4},{x:legend.x+19,y:legend.y-4}],'series',j,dash[j])
    else add(`series-${j}-legend`,{kind:spec.kind==='scatter'?j===1?'rectangle':j===2?'diamond':'ellipse':'rectangle',label:'',x:legend.x,y:legend.y-11,width:spec.kind==='scatter'?8:17,height:spec.kind==='scatter'?8:10,visual:{fill:j===3&&spec.kind==='scatter'?'#ffffff':color,stroke:spec.kind==='scatter'?color:'none',strokeWidth:1.3,handDrawn:false}},'series',j,j===3&&spec.kind==='scatter'?['stroke']:spec.kind==='scatter'?['fill','stroke']:['fill'])
    label(`series-${j}-name`,series.name,legend.x+26,legend.y,11,'left','series',0,j)
  })
  footer.forEach((row,i)=>label(row.key,row.text,16,H-Math.max(10,size(10)*.3+4)-(footer.length-1-i)*typography.lineStep,10,'left','annotation'))
  if(figure.nodes.length>240)throw new Error('生成后超过 240 个图元，请减少数据或标签')
  const sources=[{title:`配色：${palette.title}`,reference:`${palette.sourceUrl} · ${palette.source} · ${palette.license}`},...(spec.dataSource?[{title:'数据来源（用户填写）',reference:spec.dataSource}]:[])]
  const kindLabel={line:'折线',bar:'分组柱状',scatter:'散点'}[spec.kind]
  return parseAsset({format:'fastfigure.component',version:1,id:`data-chart-${spec.kind}`,name:spec.title,description:`${spec.origin==='example'?'示例':'自填'}数据的${kindLabel}图。数值与误差由输入提供；图元可独立编辑，也可从数据重绘。`,tags:['图表',kindLabel,'实验',spec.origin==='example'?'示例数据':'自填数据'],createdAt:'2026-10-29T00:00:00.000Z',updatedAt:'2026-10-29T00:00:00.000Z',sources,lineage:[],figure})
}

/** Replace generated marks atomically, preserving manual additions and stable surviving references. */
export function replaceDataChart(input:FigureDocument,containerId:string,spec:DataChartSpec){
  const doc=clone(input),root=doc.containers.find(c=>c.id===containerId)
  if(!root?.dataChart)throw new Error('请选择保留数据配置的图表组合')
  const all=descendants(doc,containerId)
  if(all.some(n=>'kind' in n&&n.chart?.key&&n.parentId!==containerId))throw new Error('生成图元已重新分组，请先解组，或将新图另行插入')
  const old=doc.nodes.filter(n=>n.parentId===containerId&&n.chart?.key),keys=old.map(n=>n.chart!.key!)
  if(new Set(keys).size!==keys.length)throw new Error('图表生成标识重复，请另行插入新图')
  const identity=(key:string,s:DataChartSpec)=>{
    if(s.kind==='heatmap'){const row=/^row-(\d+)$/.exec(key),col=/^column-(\d+)$/.exec(key);if(row)return JSON.stringify(['heat-row',String(s.x[Number(row[1])])]);if(col)return JSON.stringify(['heat-column',s.series[Number(col[1])]?.name])}
    const point=/^series-(\d+)-(point|value|label|missing|sample)-(\d+)$/.exec(key),series=/^series-(\d+)-(line|errors(?:-\d+)?|legend|name|box|median|median-value|whiskers|n)$/.exec(key)
    if(point){const j=Number(point[1]),i=Number(point[3]),row=s.series[j],name=s.pointLabels?.[i];if(s.kind==='boxplot')return JSON.stringify([point[2],row?.name,String(s.x[i])]);if(s.kind==='scatter'&&name)return JSON.stringify([point[2],row?.name,'row-label',name,s.pointLabels!.slice(0,i).filter(v=>v===name).length]);return JSON.stringify([point[2],row?.name,String(s.x[i]),...(s.kind==='scatter'?[row?.values[i],row?.errors?.[i]??null,s.x.slice(0,i).filter((x,k)=>String(x)===String(s.x[i])&&row?.values[k]===row?.values[i]&&(row?.errors?.[k]??null)===(row?.errors?.[i]??null)).length]:[])])}
    if(series)return JSON.stringify([series[2],s.series[Number(series[1])]?.name])
    return key
  }
  const asset=scaleComponent(buildDataChart(spec),root.metricScale??1),existing=new Map(old.map(n=>[identity(n.chart!.key!,root.dataChart!.spec),n.id])),newNodes=asset.figure.nodes.map(n=>({...clone(n),id:existing.get(identity(n.chart!.key!,spec))??`chart-${crypto.randomUUID()}`,parentId:containerId,x:n.x+root.x,y:n.y+root.y}))
  const oldIds=new Set(old.map(n=>n.id)),nextIds=new Set(newNodes.map(n=>n.id)),removed=new Set([...oldIds].filter(id=>!nextIds.has(id)))
  if(doc.edges.some(e=>removed.has(e.source)||removed.has(e.target))||doc.nodes.some(n=>[n.path?.start,n.path?.end].some(b=>b&&removed.has(b.nodeId))))throw new Error('新数据会移除仍有外部连接的图元，请先解除连接')
  if(doc.edges.some(e=>newNodes.some(n=>n.kind==='path'&&(n.id===e.source||n.id===e.target))))throw new Error('重绘将已连接的图元变为路径，请先解除连接')
  doc.nodes=[...doc.nodes.filter(n=>!oldIds.has(n.id)),...newNodes];root.dataChart={spec:clone(spec),revision:root.dataChart.revision+1};root.title=spec.title
  if(spec.kind!=='heatmap'){
    if(root.parentId===null)doc.style.paletteId=spec.paletteId
    else root.appearance={preset:root.appearance?.preset??'inherit',accent:root.appearance?.accent??'inherit',...root.appearance,paletteId:spec.paletteId}
  }
  if(root.component)root.component.sources=clone(asset.sources)
  try{return{document:parseDocument(doc),generated:newNodes.length,preserved:all.length-old.length,sources:asset.sources}}catch(error){throw new Error('更新后的图表超出组合范围或工程容量，请扩大组合，或将图表另行插入',{cause:error})}
}
