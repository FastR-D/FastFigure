import {clone,parseDocument,type FigureDocument,type FigureNode,type FigureContainer} from './model.ts'
import {buildDataChart} from './dataChart.ts'
import {heatmapScale} from './heatmap.ts'
import {scaleComponent} from './assets.ts'
import {ancestors,childrenOf,contentBounds,resolveStyle,translateGeometry,descendants} from './geometry.ts'
import {reflowDataChart,sameChartValue} from './chartReflow.ts'
import {chartText,textWidth,formatChartValue,type ChartAdd} from './chartText.ts'
import {sharedColorbarCreateRequestSchema,sharedColorbarUpdateRequestSchema,sharedColorbarReportSchema,type SharedColorbarCreateRequest,type SharedColorbarRequest,type SharedColorbarReport} from './sharedColorbarContract.ts'
import {heatmapPaletteById} from '../data/heatmapPalettes.ts'
import {nodeTextStyle} from './typography.ts'
import {layoutColorbarParts} from './sharedColorbarLayout.ts'

const localBar=(node:FigureNode)=>node.chart?.key?.startsWith('colorbar-')
// Container opacity composites descendants; visual.opacity only fades its frame.
const opacity=(figure:FigureDocument,id:string)=>[id,...ancestors(figure,id)].every(id=>(figure.containers.find(c=>c.id===id)?.opacity??1)===1)
function inventory(figure:FigureDocument,id:string){
  const root=figure.containers.find(c=>c.id===id)
  if(!root?.dataChart||root.dataChart.spec.kind!=='heatmap')throw new Error('请选择保留源数据的原生热图')
  if(root.reconstruction||root.parametric||root.structureOrigin)throw new Error('同一容器有其他受管理结构')
  if(!opacity(figure,id))throw new Error('热图容器有透明度变化，不能保证相同颜色表示相同数值')
  const spec=root.dataChart.spec,scale=heatmapScale(spec),canonical=scaleComponent(buildDataChart(spec),root.metricScale??1).figure
  if(Math.abs(root.width-canonical.containers[0]!.width)>1e-6||Math.abs(root.height-canonical.containers[0]!.height)>1e-6)throw new Error('热图外框已单独拉伸，请先恢复图表尺寸')
  const nodes=figure.nodes.filter(n=>n.parentId===id&&n.chart),byKey=new Map(nodes.map(n=>[n.chart!.key,n]))
  if(nodes.length!==canonical.nodes.length||figure.nodes.some(n=>n.chart&&n.parentId!==id&&ancestors(figure,n.id).includes(id)))throw new Error('生成图元已增删或重分组，请先整理数据图')
  for(const node of canonical.nodes){
    const old=byKey.get(node.chart!.key)
    if(!old||old.kind!==node.kind)throw new Error('热图生成图元表示与配置不一致')
    const key=node.chart!.key!,color=!!localBar(node)||/^series-\d+-point-\d+$/.test(key)
    if(node.kind!=='text'){
      const expected=clone(node);translateGeometry(expected,root.x,root.y)
      if(!sameChartValue([old.x,old.y,old.width,old.height,old.path],[expected.x,expected.y,expected.width,expected.height,expected.path]))throw new Error('热图数据格或色标已手工改形 / 移动，请先确认从数据重绘')
      if(color&&(node.visual?.fillGradient||node.visual?.strokeGradient||!sameChartValue([old.visual?.fill,old.visual?.stroke,old.visual?.strokeWidth??1.3,old.visual?.strokeOpacity??1],[node.visual?.fill,node.visual?.stroke,node.visual?.strokeWidth??1.3,node.visual?.strokeOpacity??1])||(old.visual?.opacity??1)!==1||(old.visual?.fillOpacity??1)!==1))throw new Error('数据格或色标有手工改色 / 透明度，与数值色阶不一致')
    }else if((color||/^series-\d+-value-\d+$/.test(key))&&(old.label!==node.label||(old.visual?.opacity??1)!==1||(old.visual?.fillOpacity??1)!==1))throw new Error('色标文字或格内数值已手工改写 / 隐藏，请先同步数据配置')
  }
  const bar=nodes.filter(localBar),ids=new Set(bar.map(n=>n.id))
  if(figure.edges.some(e=>ids.has(e.source)||ids.has(e.target))||figure.nodes.some(n=>[n.path?.start,n.path?.end].some(b=>b&&ids.has(b.nodeId))))throw new Error('源色标有外部连接或路径绑定，不能隐藏其锚点')
  return{root,spec,scale,bar}
}
export function chartColorbarTargets(figure:FigureDocument,selectedIds:string[]=[]){
  return figure.containers.filter(c=>c.dataChart).map(root=>{
    const info={containerId:root.id,title:root.title,kind:root.dataChart!.spec.kind,valueLabel:root.dataChart!.spec.valueLabel??'',paletteId:root.dataChart!.spec.paletteId,selected:selectedIds.some(id=>id===root.id||ancestors(figure,id).includes(root.id))}
    try{const {scale}=inventory(figure,root.id);return{...info,min:scale.min,max:scale.max,center:scale.center,error:''}}catch(error){return{...info,min:undefined,max:undefined,center:undefined,error:(error as Error).message}}
  })
}
const round=(value:number)=>Number(value.toFixed(6))
/** Fonts may change; band geometry, tick anchors, values and opacity carry meaning. */
function signature(node:FigureNode,group:FigureContainer){
  const scale=group.metricScale??1,relative=(x:number,y:number)=>[round((x-group.x)/scale),round((y-group.y)/scale)]
  return JSON.stringify({kind:node.kind,...(node.kind==='text'?{label:node.label,anchor:relative(node.x+node.width*(node.textLayout?.x??0),node.y+node.height*(node.textLayout?.y??0)),matrix:node.textLayout?.matrix,baseline:node.textLayout?.baseline,align:node.textStyle?.align}:{position:relative(node.x,node.y),size:[round(node.width/scale),round(node.height/scale)],fill:node.visual?.fill,stroke:node.visual?.stroke??'none'}),opacity:node.visual?.opacity??1,fillOpacity:node.visual?.fillOpacity??1})
}
function partsInventory(figure:FigureDocument,group:FigureContainer){
  const record=group.sharedColorbar!
  if(!opacity(figure,group.id))throw new Error('共享色标组件被隐藏或改变透明度')
  const scale=heatmapScale({paletteId:record.paletteId,series:[{name:'Scale',values:[record.min,record.max]}],colorMin:record.min,colorMax:record.max,colorCenter:record.center}),values=[record.valueLabel,...[record.min,record.center??record.min+(record.max-record.min)/2,record.max].map(formatChartValue)]
  if(new Set(values.slice(1)).size!==3)throw new Error('色标刻度文字无法区分，请先调整数据单位')
  return record.parts.map((part,i)=>{
    const node=figure.nodes.find(n=>n.id===part.nodeId)
    if(!node||node.parentId!==group.id||signature(node,group)!==part.signature)throw new Error('共享色标的颜色、数值或刻度位置已改变')
    if(node.visual?.fillGradient||node.visual?.strokeGradient||(node.visual?.opacity??1)!==1||(node.visual?.fillOpacity??1)!==1)throw new Error('共享色标有独立透明度变化，不能保证颜色含义')
    if(i<32?(node.kind!=='rectangle'||node.visual?.fill!==scale.color(record.min+(record.max-record.min)*i/31)||node.visual?.stroke!=='none'||(node.visual?.radius??0)!==0):node.kind!=='text'||node.label!==values[i-32])throw new Error('共享色标图元与记录的数值编码不一致')
    return node
  })
}
function presentation(figure:FigureDocument,group:FigureContainer){
  const record=group.sharedColorbar!
  return{paletteId:record.paletteId,valueLabel:record.valueLabel,min:record.min,max:record.max,...(record.center===undefined?{}:{center:record.center}),box:{x:group.x,y:group.y,width:group.width,height:group.height},labels:record.parts.slice(32).flatMap(part=>{const node=figure.nodes.find(node=>node.id===part.nodeId);if(!node)return[];const style=nodeTextStyle(node,false,resolveStyle(figure,node.parentId));return[{id:node.id,label:node.label,fontFamily:style.family,fontSize:style.size}]})}
}
export function sharedColorbarStates(figure:FigureDocument){
  const groups=figure.containers.filter(c=>c.sharedColorbar),counts=new Map<string,number>()
  for(const group of groups)for(const id of group.sharedColorbar!.chartIds)counts.set(id,(counts.get(id)??0)+1)
  return groups.map(group=>{
    const record=group.sharedColorbar!,sharedIds=record.parts.map(p=>p.nodeId)
    try{
      if(record.chartIds.some(id=>counts.get(id)!>1))throw new Error('同一热图关联了多份共享色标')
      partsInventory(figure,group)
      const charts=record.chartIds.map(id=>inventory(figure,id))
      for(const chart of charts)if(chart.spec.paletteId!==record.paletteId||chart.spec.valueLabel!==record.valueLabel||chart.scale.min!==record.min||chart.scale.max!==record.max||chart.scale.center!==record.center)throw new Error('源热图色阶、范围、中心或单位已变化')
      return{containerId:group.id,title:group.title,chartIds:record.chartIds,active:true,error:'',localIds:charts.flatMap(c=>c.bar.map(n=>n.id)),sharedIds}
    }catch(error){return{containerId:group.id,title:group.title,chartIds:record.chartIds,active:false,error:(error as Error).message,localIds:[],sharedIds}}
  })
}
export function sharedColorbarVisibility(figure:FigureDocument){const states=sharedColorbarStates(figure);return{hidden:new Set(states.flatMap(s=>s.active?s.localIds:s.sharedIds)),warnings:states.filter(s=>!s.active)}}
export function createSharedColorbar(input:FigureDocument,raw:Omit<SharedColorbarCreateRequest,'reason'|'placement'|'fontSize'>&Partial<Pick<SharedColorbarCreateRequest,'reason'|'placement'|'fontSize'>>){
  const request=sharedColorbarCreateRequestSchema.parse({reason:'统一数值色阶并共享色标',...raw}),original=parseDocument(clone(input)),charts=request.containerIds.map(id=>inventory(original,id)),first=charts[0]!
  if(original.containers.some(c=>c.sharedColorbar?.chartIds.some(id=>request.containerIds.includes(id))))throw new Error('热图已关联共享色标，请先删除或解除原关系')
  if(charts.some(c=>c.spec.valueLabel!==first.spec.valueLabel))throw new Error('共享色标需要完全相同的非空标题与单位；不会猜测或换算单位')
  if(charts.some(c=>c.spec.paletteId!==first.spec.paletteId||c.scale.center!==first.scale.center))throw new Error('共享色标需要相同色阶和发散中心；请先确认一致的数值含义')
  const min=Math.min(...charts.map(c=>c.scale.min)),max=Math.max(...charts.map(c=>c.scale.max)),center=first.scale.center,reports:SharedColorbarReport['charts']=[]
  let doc=clone(original)
  for(const chart of charts){
    const record=chart.root.dataChart!,changed=record.spec.colorMin!==min||record.spec.colorMax!==max
    let generated=0,preserved=0,formatted=0
    if(changed){try{const result=reflowDataChart(doc,chart.root.id,{...record.spec,colorMin:min,colorMax:max});doc=result.document;generated=result.generated;preserved=result.preserved;formatted=result.formatted}catch(error){throw new Error(`「${chart.root.title}」无法统一色阶并保留手工内容，整次未应用：${error instanceof Error&&!('issues'in error)?error.message:'色标文字或布局超出限制'}`,{cause:error})}}
    reports.push({containerId:chart.root.id,title:chart.root.title,beforePaletteId:record.spec.paletteId,beforeMin:chart.scale.min,beforeMax:chart.scale.max,beforeRevision:record.revision,afterRevision:doc.containers.find(c=>c.id===chart.root.id)!.dataChart!.revision,changed,generated,preserved,formatted})
  }
  const common=ancestors(doc,first.root.id).find(id=>request.containerIds.every(chart=>ancestors(doc,chart).includes(id))),parentId=request.parentId??common,parent=doc.containers.find(c=>c.id===parentId)
  if(!parent||parent.dataChart||parent.sharedLegend||parent.sharedColorbar||request.containerIds.some(id=>!ancestors(doc,id).includes(parent.id)))throw new Error('请选择所有热图的共同外层容器')
  const area=contentBounds(parent),family=request.fontFamily??resolveStyle(doc,parent.id).fontFamily??'Inter',size=request.fontSize,padding=8,barHeight=12
  const values=[min,center??min+(max-min)/2,max],labels=values.map(formatChartValue),half=Math.max(...labels.map(t=>textWidth(t,size,family)))/2+2
  if(new Set(labels).size!==3)throw new Error('色标刻度文字无法区分，请先调整数据单位')
  const width=Math.max(320+half*2+padding*2,textWidth(first.spec.valueLabel!,size,family)+padding*2),barWidth=width-half*2-padding*2,barX=padding+half,barY=padding+size*1.3+8,tickY=barY+barHeight+size+8,height=tickY+size*.3+padding
  const positions=values.map(v=>barX+(v-min)/(max-min)*barWidth)
  if(positions.some((x,i)=>i>0&&x-positions[i-1]!<(textWidth(labels[i]!,size,family)+textWidth(labels[i-1]!,size,family))/2+8))throw new Error('发散中心靠近端点，色标刻度文字会重叠，请先调整布局或字号')
  const box={x:area.x+(area.width-width)/2,y:request.placement==='top'?area.y:area.y+area.height-height,width,height}
  if(width>area.width||height>area.height)throw new Error('共享色标放不进共同容器，请调整字号或布局')
  if(childrenOf(doc,parent.id).filter(o=>!('kind'in o&&o.kind==='port')).some(o=>box.x<o.x+o.width-1e-6&&box.x+width>o.x+1e-6&&box.y<o.y+o.height-1e-6&&box.y+height>o.y+1e-6))throw new Error('共享色标与现有对象重叠，请在面板编排预留底部 100 空间，或选择另一侧')
  if(doc.nodes.length+36>240||doc.containers.length>=21)throw new Error('共享色标会超过 240 个图元或 21 个容器，请先减少图件密度')
  const id=`colorbar-${crypto.randomUUID()}`,parts:NonNullable<FigureContainer['sharedColorbar']>['parts']=[],group:FigureContainer={id,parentId:parent.id,role:'component',title:'共享数值色标',...box,visual:{fill:'none',stroke:'none',handDrawn:false},evidence:clone(first.scale.palette.source)}
  const add:ChartAdd=(key,node)=>{const full:FigureNode={...node,id:`${id}-${key}`,parentId:id};doc.nodes.push(full);parts.push({nodeId:full.id,signature:signature(full,group)});return full},text=chartText(add,family),scale=heatmapScale({...first.spec,colorMin:min,colorMax:max})
  for(let i=0;i<32;i++)add(`band-${i}`,{kind:'rectangle',label:'',x:box.x+barX+barWidth*i/32,y:box.y+barY,width:barWidth/32+.01,height:barHeight,visual:{fill:scale.color(min+(max-min)*i/31),stroke:'none',radius:0,handDrawn:false}},'heat')
  text('title',first.spec.valueLabel!,box.x+width/2,box.y+padding+size,size,'center','heat')
  labels.forEach((label,i)=>text(`tick-${i}`,label,box.x+positions[i]!,box.y+tickY,size,'center','heat'))
  group.sharedColorbar={version:1,chartIds:request.containerIds,paletteId:first.spec.paletteId,valueLabel:first.spec.valueLabel!,min,max,...(center===undefined?{}:{center}),parts};doc.containers.push(group)
  const figure=parseDocument(doc),state=sharedColorbarStates(figure).find(s=>s.containerId===id)!
  if(!state.active)throw new Error(`共享色标未通过核对：${state.error}`)
  return{document:figure,report:sharedColorbarReportSchema.parse({operation:'create',changed:true,containerId:id,parentId:parent.id,chartIds:request.containerIds,paletteId:first.spec.paletteId,valueLabel:first.spec.valueLabel!,min,max,...(center===undefined?{}:{center}),fontFamily:family,fontSize:size,after:presentation(figure,figure.containers.find(c=>c.id===id)!),updatedNodes:36+reports.reduce((sum,report)=>sum+report.generated,0),reason:request.reason,hiddenLocalNodes:state.localIds.length,charts:reports})}
}
function updateInventory(figure:FigureDocument,id:string){
  const group=figure.containers.find(group=>group.id===id)
  if(!group?.sharedColorbar)throw new Error('请选择仍保留关联的已有共享色标')
  const parts=partsInventory(figure,group),record=group.sharedColorbar,parent=figure.containers.find(c=>c.id===group.parentId)
  if(!parent||[parent,group].some(c=>c.dataChart||c.sharedLegend||c.parametric||c.reconstruction||c.structureOrigin)||parent.sharedColorbar)throw new Error('共享色标处于其他受管理结构中，不能自动更新')
  if(figure.containers.some(c=>c.id!==id&&c.sharedColorbar?.chartIds.some(chart=>record.chartIds.includes(chart))))throw new Error('同一热图关联了多份共享色标，请先解除重复关系')
  const charts=record.chartIds.map(id=>inventory(figure,id)),first=charts[0]!
  if(charts.some(chart=>chart.spec.valueLabel!==first.spec.valueLabel))throw new Error('关联热图标题 / 单位不一致，请先确认相同物理量；不会猜测或换算单位')
  if(record.chartIds.some(id=>!ancestors(figure,id).includes(parent.id)))throw new Error('源热图已移出共享色标所属容器')
  return{group,parts,record,parent,charts}
}
export function sharedColorbarEditTargets(figure:FigureDocument,selectedIds:string[]=[]){
  return sharedColorbarStates(figure).map(state=>{
    const group=figure.containers.find(group=>group.id===state.containerId)!,info={...state,...presentation(figure,group),selected:selectedIds.some(id=>id===group.id||ancestors(figure,id).includes(group.id))}
    try{const {charts}=updateInventory(figure,group.id);return{...info,editable:true,updateError:'',charts:charts.map(chart=>({containerId:chart.root.id,title:chart.root.title,paletteId:chart.spec.paletteId,valueLabel:chart.spec.valueLabel,min:chart.scale.min,max:chart.scale.max,center:chart.scale.center}))}}catch(error){return{...info,editable:false,updateError:(error as Error).message,charts:[]}}
  })
}
export function updateSharedColorbar(input:FigureDocument,raw:unknown){
  const request=sharedColorbarUpdateRequestSchema.parse(raw),original=parseDocument(clone(input)),context=updateInventory(original,request.containerId),{record,parent,charts}=context,before=presentation(original,context.group),paletteId=request.paletteId??record.paletteId,palette=heatmapPaletteById.get(paletteId)
  if(!palette)throw new Error('请选择已有的热图数值色阶')
  const center=request.center===null?undefined:request.center??record.center
  if(palette.mode==='sequential'&&center!==undefined)throw new Error('顺序色阶不使用发散中心，请明确清空中心')
  const natural=charts.map(chart=>heatmapScale({...chart.spec,paletteId,colorCenter:center,colorMin:undefined,colorMax:undefined})),min=request.range==='fixed'?request.min!:Math.min(...(request.range==='data'?natural:charts.map(chart=>chart.scale)).map(scale=>scale.min)),max=request.range==='fixed'?request.max!:Math.max(...(request.range==='data'?natural:charts.map(chart=>chart.scale)).map(scale=>scale.max)),scale=heatmapScale({...charts[0]!.spec,paletteId,colorCenter:center,colorMin:min,colorMax:max,series:charts.flatMap(chart=>chart.spec.series)}),reports:SharedColorbarReport['charts']=[]
  let doc=clone(original)
  for(const chart of charts){
    const old=chart.root.dataChart!,changed=old.spec.paletteId!==paletteId||old.spec.colorMin!==min||old.spec.colorMax!==max||chart.scale.center!==scale.center
    let generated=0,preserved=0,formatted=0
    if(changed){const result=reflowDataChart(doc,chart.root.id,{...old.spec,paletteId,colorMin:min,colorMax:max,colorCenter:scale.center});doc=result.document;generated=result.generated;preserved=result.preserved;formatted=result.formatted}
    reports.push({containerId:chart.root.id,title:chart.root.title,beforePaletteId:old.spec.paletteId,beforeMin:chart.scale.min,beforeMax:chart.scale.max,beforeRevision:old.revision,afterRevision:doc.containers.find(c=>c.id===chart.root.id)!.dataChart!.revision,changed,generated,preserved,formatted})
  }
  const group=doc.containers.find(group=>group.id===request.containerId)!,parts=record.parts.map(part=>doc.nodes.find(node=>node.id===part.nodeId)!),valueLabel=charts[0]!.spec.valueLabel!,sameScale=record.paletteId===paletteId&&record.min===min&&record.max===max&&record.center===scale.center&&record.valueLabel===valueLabel,sameText=before.labels.every(label=>(request.fontFamily===undefined||request.fontFamily===label.fontFamily)&&(request.fontSize===undefined||request.fontSize===label.fontSize))
  if(!sameScale||!sameText||request.placement!=='preserve'){
    const layout=layoutColorbarParts(doc,group,parts,scale,valueLabel,request),area=contentBounds(parent),managed=new Set(parts.map(part=>part.id)),extras=descendants(doc,group.id).filter(object=>!managed.has(object.id)),solidExtras=extras.filter(object=>!('kind'in object&&object.kind==='port')),units=group.metricScale??1,box={x:group.x,y:group.y,width:Math.max(layout.width,...solidExtras.map(object=>object.x+object.width-group.x+2*units)),height:Math.max(layout.height,...solidExtras.map(object=>object.y+object.height-group.y+2*units))}
    if(request.placement!=='preserve'){box.x=area.x+(area.width-box.width)/2;box.y=request.placement==='top'?area.y:area.y+area.height-box.height}
    if(box.x<area.x-1e-6||box.y<area.y-1e-6||box.x+box.width>area.x+area.width+1e-6||box.y+box.height>area.y+area.height+1e-6)throw new Error('调整后的色标超出共同容器，请预留空间或选择另一侧')
    const overlap=(a:typeof box,b:typeof box)=>a.x<b.x+b.width-1e-6&&a.x+a.width>b.x+1e-6&&a.y<b.y+b.height-1e-6&&a.y+a.height>b.y+1e-6,owned=new Set([group.id,...descendants(doc,group.id).map(object=>object.id)])
    if(childrenOf(doc,parent.id).filter(object=>!owned.has(object.id)&&!('kind'in object&&(object.kind==='port'||object.path&&[object.path.start,object.path.end].some(binding=>binding&&owned.has(binding.nodeId))))).some(object=>overlap(box,object)))throw new Error('调整后的色标与现有对象重叠；不会移动源热图')
    for(const object of extras)translateGeometry(object,box.x-group.x,box.y-group.y)
    const replacements=new Map(layout.nodes.map(node=>{node.x+=box.x;node.y+=box.y;return[node.id,node]}))
    if(solidExtras.some(object=>[...replacements.values()].some(node=>overlap(object,node))))throw new Error('色标内部的手工对象占用新条目位置，请先调整位置')
    doc.nodes=doc.nodes.map(node=>replacements.get(node.id)??node);Object.assign(group,box)
  }
  if(paletteId!==record.paletteId){const oldSource=heatmapPaletteById.get(record.paletteId)?.source;if(!group.evidence||sameChartValue(group.evidence,oldSource))group.evidence=clone(palette.source);else{const free=parts.find(node=>!node.evidence||sameChartValue(node.evidence,oldSource));if(!free)throw new Error('色标图元均有独立来源，无法追加新色阶来源，请先整理来源');doc.nodes.find(node=>node.id===free.id)!.evidence=clone(palette.source)}}
  group.sharedColorbar={...record,paletteId,valueLabel,min,max,...(scale.center===undefined?{}:{center:scale.center}),parts:record.parts.map(part=>({nodeId:part.nodeId,signature:signature(doc.nodes.find(node=>node.id===part.nodeId)!,group)}))};if(scale.center===undefined)delete group.sharedColorbar.center
  const changed=reports.some(report=>report.changed)||!sameScale||doc.nodes.some(node=>!sameChartValue(node,original.nodes.find(old=>old.id===node.id)))||!sameChartValue(group,context.group)
  const figure=changed?parseDocument(doc):clone(input),afterGroup=figure.containers.find(c=>c.id===group.id)!,state=sharedColorbarStates(figure).find(row=>row.containerId===group.id)!
  if(!state.active)throw new Error(`共享色标未通过核对：${state.error}`)
  const after=presentation(figure,afterGroup),families=new Set(after.labels.map(label=>label.fontFamily)),sizes=new Set(after.labels.map(label=>label.fontSize))
  return{document:figure,report:sharedColorbarReportSchema.parse({operation:'update',changed,containerId:group.id,parentId:parent.id,chartIds:record.chartIds,paletteId,valueLabel,min,max,...(scale.center===undefined?{}:{center:scale.center}),...(families.size===1?{fontFamily:after.labels[0]!.fontFamily}:{}),...(sizes.size===1?{fontSize:after.labels[0]!.fontSize}:{}),before,after,updatedNodes:changed?figure.nodes.filter(node=>!sameChartValue(node,original.nodes.find(old=>old.id===node.id))).length:0,reason:request.reason,hiddenLocalNodes:state.localIds.length,charts:reports})}
}
export function applySharedColorbar(input:FigureDocument,request:SharedColorbarRequest){return 'containerId'in request?updateSharedColorbar(input,request):createSharedColorbar(input,request)}
export function detachSharedColorbar(input:FigureDocument,id:string){const doc=clone(input),group=doc.containers.find(c=>c.id===id);if(!group?.sharedColorbar)throw new Error('共享色标已不存在');delete group.sharedColorbar;return parseDocument(doc)}
