import type {FigureDocument,FigureEdge} from './model.ts'

export interface EdgePoint {x:number;y:number}
/** Pure geometry also accepts transient off-canvas points while a drag is being validated. */
export function orthogonalThroughPoints(input:EdgePoint[],direction:'horizontal'|'vertical'){
  const result:EdgePoint[]=[]
  for(const point of input){
    const previous=result.at(-1)
    if(previous&&previous.x===point.x&&previous.y===point.y)continue
    if(previous&&previous.x!==point.x&&previous.y!==point.y)result.push(direction==='horizontal'?{x:point.x,y:previous.y}:{x:previous.x,y:point.y})
    result.push({...point})
  }
  return result
}
export function edgeRouteContainer(doc:FigureDocument,sourceId:string,targetId:string){
  const parents=(nodeId:string)=>{const ids:string[]=[];let parent=doc.nodes.find(n=>n.id===nodeId)?.parentId??doc.containers.find(c=>c.id===nodeId)?.parentId;while(parent&&!ids.includes(parent)){ids.push(parent);parent=doc.containers.find(c=>c.id===parent)?.parentId}return ids}
  const common=parents(sourceId).find(id=>parents(targetId).includes(id))??'stage',source=doc.nodes.find(n=>n.id===sourceId),target=doc.nodes.find(n=>n.id===targetId)
  return source?.interfaceFor&&source.interfaceFor===target?.interfaceFor&&source.interfaceFor===common?doc.containers.find(c=>c.id===common)?.parentId??common:common
}
/** Pins are local drawing units, so translation and uniform subtree scaling follow their frame. */
export function edgeWaypointPoints(doc:FigureDocument,edge:FigureEdge):EdgePoint[]{
  if(!edge.manualRoute)return[]
  const frame=doc.containers.find(c=>c.id===edge.manualRoute!.containerId)
  if(!frame)throw new Error('连线折点的坐标容器已不存在')
  const scale=frame.metricScale??1
  return edge.manualRoute.points.map(p=>({x:frame.x+p.x*scale,y:frame.y+p.y*scale}))
}
export function setEdgeWaypointFrame(doc:FigureDocument,edge:FigureEdge,points:EdgePoint[],direction:'horizontal'|'vertical'){
  const containerId=edgeRouteContainer(doc,edge.source,edge.target),frame=doc.containers.find(c=>c.id===containerId)
  if(!frame)throw new Error('连线缺少有效的共同容器')
  const scale=frame.metricScale??1,local=(value:number)=>Math.abs(value)<1e-9?0:value
  edge.routing='manual';edge.manualRoute={containerId,direction,points:points.map(p=>({x:local((p.x-frame.x)/scale),y:local((p.y-frame.y)/scale)}))}
}
export function snapshotEdgeWaypoints(doc:FigureDocument,predicate:(edge:FigureEdge)=>boolean=()=>true){return new Map(doc.edges.filter(e=>e.manualRoute&&predicate(e)).map(e=>[e.id,{points:edgeWaypointPoints(doc,e),direction:e.manualRoute!.direction}]))}
export function reframeEdgeWaypoints(doc:FigureDocument,snapshot:ReturnType<typeof snapshotEdgeWaypoints>,dx=0,dy=0){
  for(const edge of doc.edges){const saved=snapshot.get(edge.id);if(edge.manualRoute&&saved)setEdgeWaypointFrame(doc,edge,saved.points.map(p=>({x:p.x+dx,y:p.y+dy})),saved.direction)}
}

/** Direct manipulation may leave a blocked route visible, but never changes its bindings. */
export function moveEdgeWaypoint(doc:FigureDocument,edgeId:string,index:number,point:EdgePoint){
  const edge=doc.edges.find(e=>e.id===edgeId),pins=edge&&edgeWaypointPoints(doc,edge)
  if(!edge?.manualRoute||!pins?.[index]||!Number.isFinite(point.x)||!Number.isFinite(point.y))throw new Error('请选择有效的连线折点')
  const frame=doc.containers.find(c=>c.id===edge.manualRoute!.containerId)!,scale=frame.metricScale??1,inset=(frame.role==='component'?2:12)*scale,top=(frame.role==='component'?2:48)*scale
  pins[index]={x:Math.max(frame.x+inset,Math.min(frame.x+frame.width-inset,point.x)),y:Math.max(frame.y+top,Math.min(frame.y+frame.height-12*scale,point.y))}
  if(frame.role==='component')pins[index]!.y=Math.max(frame.y+top,Math.min(frame.y+frame.height-2*scale,point.y))
  setEdgeWaypointFrame(doc,edge,pins,edge.manualRoute.direction)
}
export function removeEdgeWaypoint(doc:FigureDocument,edgeId:string,index:number){
  const edge=doc.edges.find(e=>e.id===edgeId),pins=edge&&edgeWaypointPoints(doc,edge)
  if(!edge?.manualRoute||!pins?.[index])throw new Error('请选择有效的连线折点')
  pins.splice(index,1);if(pins.length)setEdgeWaypointFrame(doc,edge,pins,edge.manualRoute.direction);else{delete edge.manualRoute;edge.routing='orthogonal'}
}
