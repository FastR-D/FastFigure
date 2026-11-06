import {clone,parseDocument,type FigureDocument,type FigureNode} from './model.ts'
import {ancestors,childrenOf,layoutContentBounds,resolveStyle,descendants,translateGeometry,type Rect} from './geometry.ts'
import {basisNode,scaleNodeMetrics} from './scaling.ts'
import {figurePaint} from './paint.ts'
import {nodeTextStyle} from './typography.ts'
import {layoutLegendEntries} from './sharedLegendLayout.ts'
import {fontFamilies} from '../data/materials.ts'
import {sharedLegendCreateRequestSchema,sharedLegendUpdateRequestSchema,sharedLegendReportSchema,type SharedLegendCreateRequest,type SharedLegendRequest,type SharedLegendUpdateRequest,type SharedLegendReport} from './sharedLegendContract.ts'

const normalize=(value:unknown):unknown=>typeof value==='number'?Number(value.toFixed(6)):Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,normalize(v)])):value
/** Compare the visible glyph, including opacity/dash, independently of panel scale and position. */
function encoding(figure:FigureDocument,node:FigureNode,geometry=true){
  const basis=basisNode(node),visual=basis.visual??{},paint=figurePaint(resolveStyle(figure,node.parentId),visual.colorIndex)
  return JSON.stringify(normalize({kind:node.kind,fillGradient:visual.fillGradient??undefined,strokeGradient:visual.strokeGradient??undefined,fill:visual.fill??paint.fill,stroke:visual.stroke??paint.ink,strokeWidth:visual.strokeWidth??1.3,opacity:visual.opacity??1,fillOpacity:visual.fillOpacity??1,strokeOpacity:visual.strokeOpacity??1,dash:visual.dash??[],dashOffset:visual.dashOffset??0,lineCap:visual.lineCap??'butt',lineJoin:visual.lineJoin??'miter',radius:visual.radius??0,strokeMatrix:visual.strokeMatrix,path:geometry?node.path:undefined,
    ...(visual.handDrawn?{handDrawn:true}:{}),...(visual.tone==='hatch'?{tone:'hatch'}:{}),...(visual.miterLimit!==undefined&&visual.miterLimit!==4?{miterLimit:visual.miterLimit}:{}),
    ...(node.label?{label:node.label,textStyle:basis.textStyle,padding:visual.padding,textTone:visual.textTone,textLayout:node.textLayout}:{}),...(node.description?{description:node.description,descriptionStyle:basis.descriptionStyle}:{}),...(node.iconId&&node.iconId!=='none'?{iconId:node.iconId}:{}),...(node.structure&&node.structure.type!=='none'?{structure:node.structure}:{}),
  }))
}
function references(figure:FigureDocument,ids:Set<string>){return figure.edges.some(edge=>ids.has(edge.source)||ids.has(edge.target))||figure.nodes.some(node=>[node.path?.start,node.path?.end].some(binding=>binding&&ids.has(binding.nodeId)))}
const opaque=(figure:FigureDocument,id:string)=>[id,...ancestors(figure,id)].every(id=>(figure.containers.find(c=>c.id===id)?.opacity??1)===1)
function inventory(figure:FigureDocument,containerId:string){
  const root=figure.containers.find(c=>c.id===containerId)
  if(!root?.dataChart)throw new Error('源图表已不存在或不再保留数据配置')
  const spec=root.dataChart.spec
  if(!['line','bar','scatter'].includes(spec.kind))throw new Error('折线、柱状、散点使用系列图例；热图和箱线保留自己的色标 / 分组标签')
  if(root.reconstruction||root.parametric||root.structureOrigin)throw new Error('源图表存在其他受管理结构')
  if(!opaque(figure,root.id))throw new Error('源图表或祖先容器改变了整体透明度，不能保证共享图例与数据标记的实际编码一致')
  const entries=spec.series.map((series,index)=>{
    const find=(suffix:string)=>figure.nodes.filter(node=>node.parentId===containerId&&node.chart?.key===`series-${index}-${suffix}`)
    const marks=find('legend'),labels=find('name'),mark=marks[0],label=labels[0]
    if(marks.length!==1||labels.length!==1||!mark||!label||label.kind!=='text'||label.label!==series.name)throw new Error('系列图例被移除、重分组或改字，请先在图表编辑器同步')
    if(mark.visual?.opacity===0||mark.visual?.strokeOpacity===0||label.visual?.opacity===0||label.visual?.fillOpacity===0)throw new Error('系列图例被隐藏，请先恢复可见的源图例')
    const plot=figure.nodes.filter(node=>node.parentId===containerId&&node.chart?.series===index&&node.chart.role==='series'&&new RegExp(`^series-${index}-(?:point-\\d+|line)$`).test(node.chart.key??''))
    if([mark,...plot].some(node=>node.visual?.fillGradient||node.visual?.strokeGradient))throw new Error('渐变系列不能使用单色共享图例，请保留原图例')
    const reference=JSON.parse(encoding(figure,mark)),color=spec.kind==='line'||spec.kind==='scatter'?reference.stroke:reference.fill
    for(const node of plot){const paint=JSON.parse(encoding(figure,node,false));for(const channel of node.chart!.channels)if((channel==='fill'||channel==='stroke')&&paint[channel]!==color)throw new Error('图例与实际数据标记颜色不一致，请先同步系列样式')}
    const glyph=encoding(figure,mark),profile=JSON.stringify({glyph,plot:[...new Set(plot.map(node=>encoding(figure,node,false)))].sort()})
    if(profile.length>4000)throw new Error('系列存在过多不同手工样式，请先整理后再共享图例')
    return{name:series.name,mark,label,glyph,encoding:profile}
  })
  if(references(figure,new Set(entries.flatMap(entry=>[entry.mark.id,entry.label.id]))))throw new Error('源图例有外部连接或路径绑定，不能隐藏其锚点')
  return{root,kind:spec.kind as 'line'|'bar'|'scatter',entries}
}
export function chartLegendTargets(figure:FigureDocument,selectedIds:string[]=[]){
  return figure.containers.filter(c=>c.dataChart).map(c=>{
    const base={containerId:c.id,title:c.title,kind:c.dataChart!.spec.kind,series:c.dataChart!.spec.series.map(row=>row.name),selected:selectedIds.some(id=>id===c.id||ancestors(figure,id).includes(c.id))}
    try{inventory(figure,c.id);return{...base,error:''}}catch(error){return{...base,error:(error as Error).message}}
  })
}
function matched(figure:FigureDocument,ids:string[]){
  const charts=ids.map(id=>inventory(figure,id)),first=charts[0]!
  for(const chart of charts.slice(1)){
    if(chart.kind!==first.kind)throw new Error('共享图例须使用相同图表类型；不会把折线、柱形和散点符号混为一种含义')
    if(chart.entries.length!==first.entries.length||chart.entries.some(entry=>!first.entries.some(row=>row.name===entry.name)))throw new Error('各图系列名称须完全相同；不会猜测名称等价或遗漏部分系列')
    if(chart.entries.some(entry=>first.entries.find(row=>row.name===entry.name)!.encoding!==entry.encoding))throw new Error('同名系列的颜色、符号、线型或透明度不一致，请先统一实际图例样式')
  }
  return charts
}
/** Source changes may be synchronized, but never overwrite independently edited shared content. */
function ownedEntries(figure:FigureDocument,group:FigureDocument['containers'][number]){
  if(!group.sharedLegend)throw new Error('请选择仍保留关联的已有共享图例')
  if(!opaque(figure,group.id))throw new Error('共享图例或祖先容器改变了整体透明度，不能自动同步')
  return group.sharedLegend.entries.map(entry=>{
    const mark=figure.nodes.find(n=>n.id===entry.markId),label=figure.nodes.find(n=>n.id===entry.labelId)
    if(!mark||!label||mark.parentId!==group.id||label.parentId!==group.id||label.kind!=='text'||label.label!==entry.name||encoding(figure,mark)!==JSON.parse(entry.encoding).glyph||mark.visual?.opacity===0||label.visual?.opacity===0||label.visual?.fillOpacity===0)throw new Error('共享图例的文字 / 图示已手工改变或缺失，不覆盖作者修改；请先整理或解除共享')
    return{entry,mark,label}
  })
}
function syncInventory(figure:FigureDocument,containerId:string){
  const group=figure.containers.find(c=>c.id===containerId)
  if(!group?.sharedLegend)throw new Error('请选择仍保留关联的已有共享图例')
  const owned=ownedEntries(figure,group),record=group.sharedLegend,parent=figure.containers.find(c=>c.id===group.parentId)
  if(!parent||[parent,group].some(c=>c.dataChart||c.sharedColorbar||c.parametric||c.reconstruction||c.structureOrigin)||parent.sharedLegend)throw new Error('共享图例处于其他受管理结构中，不能自动同步')
  if(figure.containers.some(c=>c.id!==group.id&&c.sharedLegend?.chartIds.some(id=>record.chartIds.includes(id))))throw new Error('同一图表参与多份共享图例，请先解除重复关系')
  if(record.chartIds.some(id=>!ancestors(figure,id).includes(parent.id)))throw new Error('源图表已移出共享图例所属容器')
  const charts=matched(figure,record.chartIds)
  if(charts[0]!.kind!==record.kind)throw new Error('源图表类型已变化，请核对图型含义后解除并重新创建共享图例')
  return{group,owned,charts}
}
export function sharedLegendStates(figure:FigureDocument){
  const groups=figure.containers.filter(c=>c.sharedLegend),counts=new Map<string,number>()
  for(const group of groups)for(const id of group.sharedLegend!.chartIds)counts.set(id,(counts.get(id)??0)+1)
  return groups.map(group=>{
    const record=group.sharedLegend!,localIds:string[]=[]
    try{
      if(record.chartIds.some(id=>(counts.get(id)??0)>1))throw new Error('同一图表参与多份共享图例')
      ownedEntries(figure,group)
      const charts=matched(figure,record.chartIds),first=charts[0]!
      if(first.kind!==record.kind||record.entries.length!==first.entries.length)throw new Error('源系列类型或数量已变化')
      for(const entry of record.entries){
        const current=first.entries.find(row=>row.name===entry.name)
        if(!current||current.encoding!==entry.encoding)throw new Error('源系列或共享图例的文字 / 图示已变化')
      }
      for(const chart of charts)localIds.push(...chart.entries.flatMap(entry=>[entry.mark.id,entry.label.id]))
      return{containerId:group.id,title:group.title,chartIds:record.chartIds,active:true,error:'',localIds,sharedIds:record.entries.flatMap(entry=>[entry.markId,entry.labelId])}
    }catch(error){return{containerId:group.id,title:group.title,chartIds:record.chartIds,active:false,error:(error as Error).message,localIds:[],sharedIds:record.entries.flatMap(entry=>[entry.markId,entry.labelId])}}
  })
}
/** Local originals remain in the IR; incompatible edits restore them at render/export time. */
export function sharedLegendVisibility(figure:FigureDocument){
  const states=sharedLegendStates(figure)
  return{hidden:new Set(states.flatMap(state=>state.active?state.localIds:state.sharedIds)),warnings:states.filter(state=>!state.active)}
}
const overlaps=(a:Rect,b:Rect)=>a.x<b.x+b.width-1e-6&&a.x+a.width>b.x+1e-6&&a.y<b.y+b.height-1e-6&&a.y+a.height>b.y+1e-6
function presentation(figure:FigureDocument,containerId:string){
  const group=figure.containers.find(c=>c.id===containerId)!,scale=group.metricScale??1
  return{box:{x:group.x,y:group.y,width:group.width,height:group.height},columns:group.sharedLegend!.layout?.columns??0,gap:(group.sharedLegend!.layout?.gap??20)*scale,labels:group.sharedLegend!.entries.flatMap(entry=>{const label=figure.nodes.find(n=>n.id===entry.labelId);if(!label)return[];const style=nodeTextStyle(label,false,resolveStyle(figure,label.parentId));return[{id:label.id,name:label.label,fontFamily:style.family,fontSize:style.size}]})}
}
export function sharedLegendEditTargets(figure:FigureDocument,selectedIds:string[]=[]){
  return sharedLegendStates(figure).map(state=>{
    const info={...state,...presentation(figure,state.containerId),selected:selectedIds.some(id=>id===state.containerId||ancestors(figure,id).includes(state.containerId))}
    try{const {group,charts}=syncInventory(figure,state.containerId);return{...info,syncReady:true,syncError:'',sourceEntries:charts[0]!.entries.map(entry=>({name:entry.name,markKind:entry.mark.kind,matchingLabelId:group.sharedLegend!.entries.find(old=>old.name===entry.name)?.labelId??null}))}}
    catch(error){return{...info,syncReady:false,syncError:(error as Error).message,sourceEntries:[]}}
  })
}
function actualReport(figure:FigureDocument,containerId:string,operation:'create'|'update',reason:string,changed:boolean,updatedNodes:number,before?:ReturnType<typeof presentation>,sourceSync?:SharedLegendReport['sourceSync']){
  const root=figure.containers.find(c=>c.id===containerId)!,state=sharedLegendStates(figure).find(row=>row.containerId===containerId)!
  if(!state.active)throw new Error(`共享图例未通过样式核对：${state.error}`)
  const after=presentation(figure,containerId),families=new Set(after.labels.map(label=>label.fontFamily)),sizes=new Set(after.labels.map(label=>label.fontSize))
  return sharedLegendReportSchema.parse({operation,changed,containerId,parentId:root.parentId,chartIds:root.sharedLegend!.chartIds,title:root.title,entries:root.sharedLegend!.entries.map(entry=>entry.name),hiddenLocalNodes:state.localIds.length,...(families.size===1?{fontFamily:after.labels[0]!.fontFamily}:{}),...(sizes.size===1?{fontSize:after.labels[0]!.fontSize}:{}),...(before?{before}:{}),...(sourceSync?{sourceSync}:{}),after,updatedNodes,reason})
}
function synchronizeEntries(doc:FigureDocument,group:FigureDocument['containers'][number],mapping:NonNullable<SharedLegendUpdateRequest['syncEntries']>){
  const {owned,charts}=syncInventory(doc,group.id),source=charts[0]!.entries
  if(mapping.length!==source.length||source.some(entry=>!mapping.some(row=>row.seriesName===entry.name)))throw new Error('同步须明确覆盖当前全部源系列，不接受遗漏或新增未存在的名称')
  if(mapping.some(row=>row.previousLabelId!==null&&!owned.some(old=>old.label.id===row.previousLabelId)))throw new Error('匹配引用了其他图例或不存在的旧条目')
  const retained=new Set(mapping.flatMap(row=>row.previousLabelId?[row.previousLabelId]:[])),removed=owned.filter(old=>!retained.has(old.label.id)),removedIds=new Set(removed.flatMap(old=>[old.mark.id,old.label.id]))
  if(references(doc,removedIds))throw new Error('待移除的图例条目仍有连接或引线绑定，请先解除引用或保留对应条目')
  if(doc.nodes.length-removedIds.size+mapping.filter(row=>row.previousLabelId===null).length*2>240)throw new Error('同步会超过 240 个图元，请先整理容量；不会遗漏源系列')
  const template=owned[0]!,templateStyle=nodeTextStyle(template.label,false,resolveStyle(doc,group.id)),pairs:{mark:FigureNode;label:FigureNode}[]=[],entries:NonNullable<SharedLegendReport['sourceSync']>['entries']=[],record:NonNullable<typeof group.sharedLegend>['entries']=[]
  const ordered=[...mapping].sort((a,b)=>{const rank=(row:typeof a)=>row.previousLabelId===null?owned.length+source.findIndex(e=>e.name===row.seriesName):owned.findIndex(e=>e.label.id===row.previousLabelId);return rank(a)-rank(b)})
  for(const row of ordered){
    const current=source.find(entry=>entry.name===row.seriesName)!,old=owned.find(entry=>entry.label.id===row.previousLabelId),mark=clone(current.mark),label=clone(old?.label??current.label)
    const factor=old?(old.mark.metricScale??1)/(mark.metricScale??1):templateStyle.size/nodeTextStyle(current.label,false,resolveStyle(doc,current.label.parentId)).size
    scaleNodeMetrics(mark,factor,doc)
    if(old){delete mark.reconstruction;Object.assign(mark,{id:old.mark.id,parentId:group.id,x:old.mark.x,y:old.mark.y,width:old.mark.width,height:old.mark.height});for(const key of ['evidence','reconstruction','name'] as const)if(old.mark[key]!==undefined)Object.assign(mark,{[key]:clone(old.mark[key])})}
    else{
      mark.width*=factor;mark.height*=factor;mark.x=0;mark.y=0;mark.id=`legend-mark-${crypto.randomUUID()}`;mark.parentId=group.id
      scaleNodeMetrics(label,factor,doc);label.width*=factor;label.height*=factor;label.x=(current.label.x-current.mark.x)*factor;label.y=(current.label.y-current.mark.y)*factor;label.id=`legend-label-${crypto.randomUUID()}`;label.parentId=group.id;label.textStyle={...label.textStyle,family:templateStyle.family}
    }
    label.label=current.name
    for(const node of [mark,label]){delete node.chart;if(!old)delete node.reconstruction}
    pairs.push({mark,label});record.push({name:current.name,markId:mark.id,labelId:label.id,encoding:current.encoding});entries.push({name:current.name,...(old?{previousName:old.entry.name}:{}),markId:mark.id,labelId:label.id,action:old?old.entry.name===current.name?'kept':'renamed':'added',encodingChanged:!old||old.entry.encoding!==current.encoding})
  }
  const replacements=new Map(pairs.flatMap(pair=>[pair.mark,pair.label]).map(node=>[node.id,node])),oldIds=new Set(owned.flatMap(old=>[old.mark.id,old.label.id])),added=pairs.flatMap(pair=>[pair.mark,pair.label]).filter(node=>!oldIds.has(node.id)),last=[...doc.nodes].reverse().find(node=>oldIds.has(node.id))!.id
  doc.nodes=doc.nodes.flatMap(node=>[...(removedIds.has(node.id)?[]:[replacements.get(node.id)??node]),...(node.id===last?added:[])]);group.sharedLegend!.entries=record
  return{entries,removed:removed.map(old=>({name:old.entry.name,markId:old.mark.id,labelId:old.label.id}))}
}
export function createSharedLegend(input:FigureDocument,raw:Omit<SharedLegendCreateRequest,'reason'|'placement'|'fontSize'|'columns'|'gap'>&Partial<Pick<SharedLegendCreateRequest,'reason'|'placement'|'fontSize'|'columns'|'gap'>>){
  const request=sharedLegendCreateRequestSchema.parse({reason:'合并重复系列图例',...raw}),doc=parseDocument(clone(input)),charts=matched(doc,request.containerIds),first=charts[0]!
  if(doc.containers.some(c=>c.sharedLegend?.chartIds.some(id=>request.containerIds.includes(id))))throw new Error('图表已关联共享图例，请调整已有图例或先解除原共享关系')
  const common=[...ancestors(doc,first.root.id)].find(id=>request.containerIds.every(chartId=>ancestors(doc,chartId).includes(id)))??'stage',parentId=request.parentId??common,parent=doc.containers.find(c=>c.id===parentId)
  if(!parent||parent.dataChart||parent.sharedLegend||request.containerIds.some(id=>!ancestors(doc,id).includes(parentId)))throw new Error('请选择所有源图表的共同外层容器')
  const family=request.fontFamily??resolveStyle(doc,parentId).fontFamily??'MiSans'
  if(!fontFamilies.includes(family))throw new Error('请选择可用图例字体')
  const area=layoutContentBounds(doc,parent),layout=layoutLegendEntries(doc,first.entries,{fontFamily:family,fontSize:request.fontSize,columns:request.columns,gap:request.gap,padding:10,maxWidth:area.width-24})
  const box={x:area.x+(area.width-Math.max(100,layout.width))/2,y:request.placement==='top'?area.y:area.y+area.height-layout.height,width:Math.max(100,layout.width),height:layout.height}
  if(box.height>area.height||box.width>area.width)throw new Error('共享图例放不进共同容器，请扩大可用空间')
  if(childrenOf(doc,parentId).filter(o=>!('kind'in o&&o.kind==='port')).some(o=>overlaps(box,o)))throw new Error('图例位置与现有对象重叠，请在面板编排中预留空间，或选择另一侧')
  const id=`legend-${crypto.randomUUID()}`,record={version:1 as const,chartIds:request.containerIds,kind:first.kind,layout:{columns:request.columns,gap:request.gap},entries:[] as {name:string;markId:string;labelId:string;encoding:string}[]}
  for(const [index,pair]of layout.entries.entries()){
    const mark=pair.mark,label=pair.label
    Object.assign(mark,{id:`legend-mark-${crypto.randomUUID()}`,parentId:id});Object.assign(label,{id:`legend-label-${crypto.randomUUID()}`,parentId:id})
    for(const node of [mark,label]){node.x+=box.x;node.y+=box.y;delete node.chart;delete node.reconstruction}
    doc.nodes.push(mark,label);record.entries.push({name:first.entries[index]!.name,markId:mark.id,labelId:label.id,encoding:first.entries[index]!.encoding})
  }
  doc.containers.push({id,parentId,role:'component',title:'共享图例',...box,visual:{fill:'none',stroke:'none',handDrawn:false},sharedLegend:record})
  const figure=parseDocument(doc)
  return{document:figure,report:actualReport(figure,id,'create',request.reason,true,record.entries.length*2)}
}
export function updateSharedLegend(input:FigureDocument,raw:unknown){
  const request=sharedLegendUpdateRequestSchema.parse(raw),doc=parseDocument(clone(input)),original=clone(doc),group=doc.containers.find(c=>c.id===request.containerId)
  if(!group?.sharedLegend)throw new Error('请选择仍保留关联的已有共享图例')
  const state=sharedLegendStates(doc).find(row=>row.containerId===group.id)!
  if(!state.active&&!request.syncEntries)throw new Error(`共享图例已停用：${state.error}；请先明确匹配当前源系列，不覆盖手工改字或图示`)
  const parent=doc.containers.find(c=>c.id===group.parentId)
  if(!parent||parent.dataChart||parent.sharedLegend||parent.sharedColorbar||parent.parametric||parent.reconstruction||parent.structureOrigin||group.dataChart||group.parametric||group.reconstruction||group.structureOrigin||group.sharedColorbar)throw new Error('共享图例处于其他受管理结构中，不能自动重排')
  const before=presentation(doc,group.id),scale=group.metricScale??1,columns=request.columns??before.columns,gap=request.gap??before.gap
  const sourceSync=request.syncEntries?synchronizeEntries(doc,group,request.syncEntries):undefined
  const finish=()=>{
    let figure=parseDocument(doc)
    const changed=JSON.stringify(normalize(figure))!==JSON.stringify(normalize(original))
    if(!changed)figure=clone(input)
    const updatedNodes=changed?figure.nodes.filter(node=>input.nodes.some(old=>old.id===node.id)&&JSON.stringify(normalize(node))!==JSON.stringify(normalize(input.nodes.find(old=>old.id===node.id)))).length:0
    return{document:figure,report:actualReport(figure,group.id,'update',request.reason,changed,updatedNodes,before,sourceSync)}
  }
  const sameText=before.labels.every(label=>(request.fontFamily===undefined||request.fontFamily===label.fontFamily)&&(request.fontSize===undefined||Math.abs(request.fontSize-label.fontSize)<1e-8))
  const membershipChanged=!!sourceSync&&(sourceSync.removed.length>0||sourceSync.entries.some(entry=>entry.action!=='kept'))
  if(sameText&&!membershipChanged&&request.columns===undefined&&request.gap===undefined&&request.placement==='preserve')return finish()
  const area=layoutContentBounds(doc,parent),pairs=group.sharedLegend.entries.map(entry=>({mark:doc.nodes.find(n=>n.id===entry.markId)!,label:doc.nodes.find(n=>n.id===entry.labelId)!})),managed=new Set(pairs.flatMap(pair=>[pair.mark.id,pair.label.id]))
  const layout=layoutLegendEntries(doc,pairs,{fontFamily:request.fontFamily,fontSize:request.fontSize,columns,gap,padding:10*scale,maxWidth:area.width-24*scale}),extras=descendants(doc,group.id).filter(object=>!managed.has(object.id)),solidExtras=extras.filter(object=>!('kind'in object&&object.kind==='port'))
  const box={x:group.x,y:group.y,width:Math.max(100*scale,layout.width,...solidExtras.map(object=>object.x+object.width-group.x+2*scale)),height:Math.max(layout.height,...solidExtras.map(object=>object.y+object.height-group.y+2*scale))}
  if(request.placement!=='preserve'){box.x=area.x+(area.width-box.width)/2;box.y=request.placement==='top'?area.y:area.y+area.height-box.height}
  if(box.x<area.x-1e-6||box.y<area.y-1e-6||box.x+box.width>area.x+area.width+1e-6||box.y+box.height>area.y+area.height+1e-6)throw new Error('调整后的图例超出共同容器，请预留空间或明确选择另一侧')
  const owned=new Set([group.id,...descendants(doc,group.id).map(object=>object.id)])
  const obstacles=childrenOf(doc,parent.id).filter(object=>!owned.has(object.id)&&!('kind'in object&&(object.kind==='port'||object.path&&[object.path.start,object.path.end].some(binding=>binding&&owned.has(binding.nodeId)))))
  if(obstacles.some(object=>overlaps(box,object)))throw new Error('调整后的图例与现有对象重叠；不会移动源图表或缩小文字')
  const dx=box.x-group.x,dy=box.y-group.y
  for(const object of extras)translateGeometry(object,dx,dy)
  const replacements=new Map(layout.entries.flatMap(pair=>[pair.mark,pair.label]).map(node=>{node.x+=box.x;node.y+=box.y;return[node.id,node]}))
  if(solidExtras.some(object=>[...replacements.values()].some(node=>overlaps(object,node))))throw new Error('图例内部的手工对象占用新条目位置，请先调整位置；原对象保持')
  doc.nodes=doc.nodes.map(node=>replacements.get(node.id)??node);Object.assign(group,box);group.sharedLegend.layout={columns,gap:gap/scale}
  return finish()
}
export function applySharedLegend(input:FigureDocument,request:SharedLegendRequest){return 'containerId'in request?updateSharedLegend(input,request):createSharedLegend(input,request)}
export function detachSharedLegend(input:FigureDocument,containerId:string){const doc=clone(input),group=doc.containers.find(c=>c.id===containerId);if(!group?.sharedLegend)throw new Error('共享图例已不存在');delete group.sharedLegend;return parseDocument(doc)}
