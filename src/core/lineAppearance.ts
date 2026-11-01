import {lineStylePatchSchema,type LineStylePatch,type LinePreset} from './lineStyleContract.ts'
export {lineStylePatchSchema,type LineStylePatch} from './lineStyleContract.ts'
import type {FigureDocument,FigureEdge} from './model.ts'
import {ancestors,descendants,findObject,resolveStyle} from './geometry.ts'
import {edgeRouteContainer} from './edgeWaypoints.ts'
import {figurePaint} from './paint.ts'

const managed=(doc:FigureDocument,id:string)=>[id,...ancestors(doc,id)].some(key=>{const c=doc.containers.find(o=>o.id===key);return c?.dataChart||c?.sharedLegend||c?.sharedColorbar})
export function resolvedEdgeAppearance(doc:FigureDocument,edge:FigureEdge){const width=edge.appearance?.strokeWidth??1.5*(edge.metricScale??1);return{stroke:edge.appearance?.stroke??figurePaint(resolveStyle(doc,edgeRouteContainer(doc,edge.source,edge.target))).ink,strokeWidth:width,dash:edge.appearance?.dash??[],arrow:edge.appearance?.arrow??'filled' as const,startArrow:edge.appearance?.startArrow??'none' as const,arrowSize:edge.appearance?.arrowSize??width*6}}
export function captureLineStyle(doc:FigureDocument,id:string):LineStylePatch{
  const targets=lineStyleTargets(doc,[id],false),edge=targets.edges[0],path=targets.paths[0]
  if(edge){const current=resolvedEdgeAppearance(doc,edge);return{stroke:edge.appearance?.stroke??null,strokeWidth:current.strokeWidth,dash:[...current.dash],arrow:current.arrow,startArrow:current.startArrow,arrowSize:edge.appearance?.arrowSize??null}}
  if(!path)throw new Error('请选择普通节点连接或无变换的开放路径作为样本')
  if(path.visual?.strokeGradient)throw new Error('连线规范暂不采集渐变，请手工指定颜色或跟随主题')
  if(path.visual?.stroke==='none'||path.visual?.strokeOpacity===0||path.visual?.opacity===0)throw new Error('请选择有可见描边的连线作为样本')
  return{stroke:path.visual?.stroke??null,strokeWidth:path.visual?.strokeWidth??1.3,dash:[...(path.visual?.dash??[])],arrow:path.path!.arrow,startArrow:path.path!.startArrow??'none',arrowSize:path.path!.arrowSize??null}
}
export function describeLineStyle(style:LineStylePatch){
  const arrow={none:'无箭头',open:'开放箭头',filled:'实心箭头'},parts:string[]=[]
  if(style.stroke!==undefined)parts.push(style.stroke===null?'颜色跟随主题':`颜色 ${style.stroke}`)
  if(style.strokeWidth!==undefined)parts.push(style.strokeWidth===null?'恢复默认线宽':`线宽 ${style.strokeWidth}`)
  if(style.dash!==undefined)parts.push(style.dash?.length?`虚线间隔 ${style.dash.join(', ')}`:'实线')
  if(style.arrow!==undefined)parts.push(`终点${arrow[style.arrow]}`)
  if(style.startArrow!==undefined)parts.push(`起点${arrow[style.startArrow]}`)
  if(style.arrowSize!==undefined)parts.push(style.arrowSize===null?'箭头大小采用默认':`箭头大小 ${style.arrowSize}`)
  return parts.join('；')
}
export function lineStyleTargets(doc:FigureDocument,objectIds:string[],includeDescendants:boolean,scope:LinePreset['scope']='all-lines'){
  for(const id of objectIds)if(!findObject(doc,id)&&!doc.edges.some(e=>e.id===id))throw new Error(`连线样式目标已不存在：${id}`)
  const ids=new Set(objectIds.flatMap(id=>[id,...(includeDescendants?descendants(doc,id).map(o=>o.id):[])])),skipped:string[]=[]
  const paths=doc.nodes.filter(n=>{
    if(scope==='edges'||!ids.has(n.id)||!n.path)return false
    if(n.chart||managed(doc,n.id)||n.path.points.some(p=>p.close)||n.visual?.strokeMatrix){skipped.push(`${n.id}：保留图表、闭合路径或变换描边`);return false}
    return true
  })
  const edges=doc.edges.filter(e=>{
    if(!ids.has(e.id)&&!(ids.has(e.source)&&ids.has(e.target)))return false
    if(managed(doc,e.source)||managed(doc,e.target)){skipped.push(`${e.id}：保留图表管理连接`);return false}
    return true
  })
  return{paths,edges,skipped}
}
export function applyLineStyle(doc:FigureDocument,objectIds:string[],includeDescendants:boolean,input:LineStylePatch){
  const patch=lineStylePatchSchema.parse(input),{paths,edges,skipped}=lineStyleTargets(doc,objectIds,includeDescendants)
  if(!paths.length&&!edges.length)throw new Error('选区内没有可调整的开放路径或节点连接')
  let changed=0
  for(const edge of edges){
    const before=JSON.stringify(edge);edge.appearance={...edge.appearance}
    for(const field of ['stroke','strokeWidth','dash','arrow','startArrow','arrowSize'] as const){const value=patch[field];if(value===null)delete edge.appearance[field];else if(value!==undefined)Object.assign(edge.appearance,{[field]:Array.isArray(value)?[...value]:value})}
    if(!Object.keys(edge.appearance).length)delete edge.appearance
    if(before!==JSON.stringify(edge))changed++
  }
  for(const path of paths){
    const before=JSON.stringify(path)
    if(patch.arrow!==undefined)path.path!.arrow=patch.arrow
    if(patch.startArrow!==undefined)path.path!.startArrow=patch.startArrow
    if(patch.arrowSize===null)delete path.path!.arrowSize;else if(patch.arrowSize!==undefined)path.path!.arrowSize=patch.arrowSize
    if(['stroke','strokeWidth','dash'].some(field=>patch[field as keyof LineStylePatch]!==undefined))path.visual={...path.visual}
    for(const field of ['stroke','strokeWidth','dash'] as const){const value=patch[field];if(value===null)delete path.visual![field];else if(value!==undefined)Object.assign(path.visual!,{[field]:Array.isArray(value)?[...value]:value})}
    if(patch.stroke!==undefined)delete path.visual!.strokeGradient
    if(patch.dash!==undefined)delete path.visual!.dashOffset
    if(path.visual&&!Object.keys(path.visual).length)delete path.visual
    if(before!==JSON.stringify(path))changed++
  }
  return{objectIds:[...edges.map(e=>e.id),...paths.map(n=>n.id)],changed,skipped,total:paths.length+edges.length}
}
