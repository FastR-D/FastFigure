import {paperNode,paperContainer} from './paperStyle.ts'
import {ancestors,commonContainer,resolveStyle} from './geometry.ts'
import {canColorContainer} from './containerColor.ts'
import {colorMapSchema,colorMapKey,colorSlotKey,sourceColorSlot,sourceSlotColor,type ColorMapping} from './colorMappingContract.ts'
import {figurePaint} from './paint.ts'
import type {FigureDocument} from './model.ts'

/** The catalog describes semantic paint references, not scientific meaning inferred from color. */
export function colorSlotInventory(doc:FigureDocument,containerId='stage'){
  const scope=new Set([containerId,...[...doc.containers,...doc.nodes].filter(o=>ancestors(doc,o.id).includes(containerId)).map(o=>o.id)])
  const groups=new Map<string,{sourcePaletteId:string;sourceIndex:number;sourceColor:string;objects:number;edges:number;examples:string[];currentColors:string[]}>()
  function add(id:string,parentId:string,index:number|undefined,label:string,edge=false){
    const style=resolveStyle(doc,parentId),slot=sourceColorSlot(style,index),key=colorSlotKey(slot)
    let group=groups.get(key)
    if(!group){group={...slot,sourceColor:sourceSlotColor(slot),objects:0,edges:0,examples:[],currentColors:[]};groups.set(key,group)}
    if(edge)group.edges++;else group.objects++
    if(group.examples.length<5)group.examples.push(label||id)
    const color=figurePaint(style,index).color;if(!group.currentColors.includes(color))group.currentColors.push(color)
  }
  for(const c of doc.containers)if(scope.has(c.id)&&!(c.role==='component'&&c.visual?.fill==='none'&&c.visual?.stroke==='none'))add(c.id,c.id,paperContainer(c,resolveStyle(doc,c.id)).visual?.colorIndex,c.title)
  for(const n of doc.nodes)if(scope.has(n.id)&&n.kind!=='port'&&n.kind!=='image'){
    const paintText=!!n.visual?.textTone&&(!n.textStyle?.color||!!n.description&&!n.descriptionStyle?.color),paintShape=n.kind==='path'?n.visual?.stroke===undefined||n.visual?.fill===undefined&&!!n.visual?.tone:n.kind==='icon'?n.visual?.stroke===undefined:n.kind!=='text'&&(n.visual?.fill===undefined||n.visual?.stroke===undefined||!!n.structure)
    if(paintText||paintShape)add(n.id,n.parentId,paperNode(n,resolveStyle(doc,n.parentId)).visual?.colorIndex,n.label||n.name||n.kind)
  }
  for(const edge of doc.edges)if(scope.has(edge.source)&&scope.has(edge.target))add(edge.id,commonContainer(doc,edge.source,edge.target),undefined,'内部连接',true)
  return [...groups.values()].sort((a,b)=>colorSlotKey(a).localeCompare(colorSlotKey(b)))
}
export function validateColorMapping(doc:FigureDocument,containerId:string,rows:ColorMapping[]){
  const mapping=colorMapSchema.parse(rows)
  if(!canColorContainer(doc,containerId))throw new Error('数据图表的系列与数值色阶不能使用组件颜色映射')
  const available=new Set(colorSlotInventory(doc,containerId).map(colorSlotKey))
  if(mapping.some(row=>!available.has(colorSlotKey(row))))throw new Error('颜色映射引用了组件中不存在的语义色槽')
  return mapping
}
/** Palette rules are simultaneous. Source nodes, geometry, raw colors and connections stay intact. */
export function setContainerColorMap(doc:FigureDocument,containerId:string,rows:ColorMapping[]|undefined,merge=false){
  const container=doc.containers.find(c=>c.id===containerId);if(!container)throw new Error('颜色映射目标不存在')
  if(!canColorContainer(doc,containerId))throw new Error('数据图表不能使用组件颜色映射')
  let mapping=rows===undefined?undefined:colorMapSchema.parse(rows)
  const previous=resolveStyle(doc,containerId).colorMap??[]
  if(mapping)validateColorMapping(doc,containerId,mapping.filter(row=>!previous.some(old=>colorMapKey([old])===colorMapKey([row]))))
  if(mapping&&merge)mapping=colorMapSchema.parse([...new Map([...previous,...mapping].map(row=>[colorSlotKey(row),row])).values()])
  if(containerId==='stage'){if(mapping===undefined)delete doc.style.colorMap;else doc.style.colorMap=mapping}
  else{container.appearance={preset:'inherit',accent:'inherit',...container.appearance};if(mapping===undefined)delete container.appearance.colorMap;else container.appearance.colorMap=mapping}
}
