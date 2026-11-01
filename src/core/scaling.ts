import { clone, parseDocument, type FigureContainer, type FigureDocument, type FigureNode, type TextStyle } from './model.ts'
import { childrenOf, contentBounds, descendants, parentOf, resolveStyle } from './geometry.ts'
import { nodeTextStyle, resolvedTextStyle } from './typography.ts'
import { pathPoints, setPathPoints } from './paths.ts'
import {snapshotEdgeWaypoints,reframeEdgeWaypoints} from './edgeWaypoints.ts'
export type ScaleAnchor='top-left'|'center'
export function scaledTypography(style:TextStyle|undefined,size:number,factor:number):TextStyle {
  return {...style,size:size*factor,...(style?.letterSpacing!==undefined?{letterSpacing:style.letterSpacing*factor}:{})}
}
export function scaledVisual<T extends FigureNode['visual']>(visual:T,factor:number,stroke=1.3):NonNullable<T> {
  return {...visual,strokeWidth:(visual?.strokeWidth??stroke)*factor,...(visual?.radius!==undefined?{radius:visual.radius*factor}:{}),...(visual?.padding!==undefined?{padding:visual.padding*factor}:{}),...(visual?.dash?{dash:visual.dash.map(n=>n*factor)}:{}),...(visual?.dashOffset!==undefined?{dashOffset:visual.dashOffset*factor}:{})} as NonNullable<T>
}
/** Scale drawing metrics separately from world geometry; palette and opacity stay semantic. */
export function scaleNodeMetrics(node:FigureNode,factor:number,doc:FigureDocument) {
  if(node.kind==='port')return
  node.metricScale=(node.metricScale??1)*factor
  if(node.kind!=='path'){
    node.textStyle=scaledTypography(node.textStyle,nodeTextStyle(node,false,resolveStyle(doc,node.parentId)).size,factor)
    if(node.description)node.descriptionStyle=scaledTypography(node.descriptionStyle,nodeTextStyle(node,true).size,factor)
  }
  node.visual=scaledVisual(node.visual,factor)
  if(node.path?.arrowSize!==undefined)node.path.arrowSize*=factor
  for(const binding of [node.path?.start,node.path?.end])if(binding){if(binding.offsetX!==undefined)binding.offsetX*=factor;if(binding.offsetY!==undefined)binding.offsetY*=factor}
}
/** Local drawing basis: fixed geometry details use metricScale, editable text sizes remain actual units. */
export function basisNode(node:FigureNode):FigureNode {
  const s=node.metricScale??1
  return {...node,metricScale:undefined,width:node.width/s,height:node.height/s,textStyle:node.textStyle?scaledTypography(node.textStyle,node.textStyle.size??nodeTextStyle(node).size,1/s):undefined,descriptionStyle:node.descriptionStyle?scaledTypography(node.descriptionStyle,node.descriptionStyle.size??11,1/s):undefined,visual:node.visual?scaledVisual(node.visual,1/s):undefined}
}
export function basisContainer(c:FigureContainer):FigureContainer {
  const s=c.metricScale??1
  return {...c,metricScale:undefined,width:c.width/s,height:c.height/s,textStyle:c.textStyle?scaledTypography(c.textStyle,c.textStyle.size??15,1/s):undefined,visual:c.visual?scaledVisual(c.visual,1/s):undefined}
}
export function scaleSubtree(input:FigureDocument,id:string,factor:number,anchor:ScaleAnchor='center') {
  if(!Number.isFinite(factor)||factor<.1||factor>4)throw new Error('缩放比例为 10–400%')
  const doc=parseDocument(clone(input)),root=doc.containers.find(c=>c.id===id)
  if(!root)throw new Error('请先选择一个容器或组合')
  if(factor===1)return {document:doc,containerId:id,factor,count:descendants(doc,id).length,overlaps:0}
  const objects=[root,...descendants(doc,id)],ids=new Set(objects.map(o=>o.id)),x=root.x,y=root.y,dx=anchor==='center'?root.width*(1-factor)/2:0,dy=anchor==='center'?root.height*(1-factor)/2:0
  const externalFramePins=snapshotEdgeWaypoints(doc,e=>ids.has(e.source)&&ids.has(e.target)&&!ids.has(e.manualRoute!.containerId))
  for(const node of doc.nodes.filter(n=>ids.has(n.id)&&n.path)){
    const points=pathPoints(doc,node)
    if(node.path!.start&&!ids.has(node.path!.start.nodeId))delete node.path!.start
    if(node.path!.end&&!ids.has(node.path!.end.nodeId))delete node.path!.end
    setPathPoints(node,points)
  }
  // Materialize all font/paint defaults before changing the object's geometry.
  for(const object of objects){
    if('kind' in object)scaleNodeMetrics(object,factor,doc)
    else {object.metricScale=(object.metricScale??1)*factor;object.textStyle=scaledTypography(object.textStyle,resolvedTextStyle(object.textStyle,true).size,factor);object.visual=scaledVisual(object.visual,factor);if(object.reconstruction){const r=object.reconstruction;r.origin={x:x+(r.origin.x-x)*factor+dx,y:y+(r.origin.y-y)*factor+dy};r.scale*=factor}}
    object.x=x+(object.x-x)*factor+dx;object.y=y+(object.y-y)*factor+dy;object.width*=factor;object.height*=factor
  }
  for(const edge of doc.edges)if(ids.has(edge.source)&&ids.has(edge.target)){
    edge.metricScale=(edge.metricScale??1)*factor
    if(edge.appearance?.strokeWidth!==undefined)edge.appearance.strokeWidth*=factor
    if(edge.appearance?.arrowSize!==undefined)edge.appearance.arrowSize*=factor
    if(edge.appearance?.dash)edge.appearance.dash=edge.appearance.dash.map(n=>n*factor)
  }
  for(const saved of externalFramePins.values())saved.points=saved.points.map(p=>({x:x+(p.x-x)*factor+dx,y:y+(p.y-y)*factor+dy}))
  reframeEdgeWaypoints(doc,externalFramePins)
  const parent=parentOf(doc,id),area=parent?contentBounds(parent):{x:0,y:0,width:1000,height:620}
  if(root.x<area.x-1e-6||root.y<area.y-1e-6||root.x+root.width>area.x+area.width+1e-6||root.y+root.height>area.y+area.height+1e-6)throw new Error('缩放后的组合超出父容器或画布，请减小比例或调整基点')
  const overlaps=parent?childrenOf(doc,parent.id).filter(o=>o.id!==id&&!('interfaceFor' in o&&o.interfaceFor)&&root.x<o.x+o.width&&root.x+root.width>o.x&&root.y<o.y+o.height&&root.y+root.height>o.y).length:0
  try{return {document:parseDocument(doc),containerId:id,factor,count:objects.length-1,overlaps}}
  catch(error){const issues=error instanceof Error&&'issues' in error?(error.issues as {message:string}[]):[];throw new Error(`缩放后未通过尺寸、字号或路径约束${issues.length?'：'+[...new Set(issues.map(i=>i.message))].slice(0,3).join('；'):''}`,{cause:error})}
}
