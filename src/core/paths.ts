import {maxCanvasSize} from './canvasContract.ts'
import {moveArrowPoint} from './orthogonalGeometry.ts'
import {orthogonalThroughPoints} from './edgeWaypoints.ts'
import {z} from 'zod'
import type { FigureDocument, FigureNode } from './model.ts'

export interface PathPoint { x: number; y: number; c1?:{x:number;y:number};c2?:{x:number;y:number};move?:boolean;close?:boolean }
export type PathBinding=NonNullable<NonNullable<FigureNode['path']>['start']>
/** Outward endpoint tangents, including curves with coincident terminal controls.
 * Never infer a tangent across a move or from a closed subpath. */
export function pathArrowFrames(points:PathPoint[]){
  const different=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y)>1e-9
  const firstMove=points.findIndex((p,i)=>i>0&&p.move),first=points.slice(0,firstMove<0?points.length:firstMove)
  let lastMove=0;points.forEach((p,i)=>{if(p.move||i>0&&points[i-1]!.close)lastMove=i})
  const last=points.slice(lastMove)
  function frame(part:PathPoint[],start:boolean){
    if(part.length<2||part.some(p=>p.close))return undefined
    const tip=start?part[0]!:part.at(-1)!
    const segments=Array.from({length:part.length-1},(_,i)=>start?i+1:part.length-1-i)
    for(const i of segments){const p=part[i]!,q=part[i-1]!,near=(start?[p.c1,p.c2,p]:[p.c2,p.c1,q]).find((v):v is {x:number;y:number}=>!!v&&different(tip,v));if(near)return{tip:{x:tip.x,y:tip.y},angle:Math.atan2(tip.y-near.y,tip.x-near.x)}}
    return undefined
  }
  return{start:frame(first,true),end:frame(last,false)}
}
/** Use the same 24-step curve approximation for ink avoidance and length reports. */
export function pathSegments(points:PathPoint[]){
  const segments:{a:{x:number;y:number};b:{x:number;y:number}}[]=[];let start=points[0]
  for(let i=1;i<points.length;i++){
    const end=points[i]!,from=points[i-1]!
    if(end.move){start=end;continue}
    if(from.close){start=end;continue}
    if(end.c1){
      const controls=[from,end.c1,...(end.c2?[end.c2]:[]),end];let previous:{x:number;y:number}=from
      for(let j=1;j<=24;j++){const t=j/24;let row:{x:number;y:number}[]=controls;while(row.length>1)row=row.slice(1).map((p,k)=>({x:row[k]!.x+(p.x-row[k]!.x)*t,y:row[k]!.y+(p.y-row[k]!.y)*t}));const next=row[0]!;segments.push({a:previous,b:next});previous=next}
    }else segments.push({a:from,b:end})
    if(end.close&&start)segments.push({a:end,b:start})
  }
  return segments
}
export const estimatedPathLength=(points:PathPoint[])=>pathSegments(points).reduce((sum,s)=>sum+Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y),0)
export function isClosedPathTarget(node:FigureNode){return node.kind==='path'&&!!node.path&&!node.path.start&&!node.path.end&&!!node.path.points.at(-1)?.close&&!node.path.points.slice(0,-1).some(p=>p.close)&&!node.path.points.slice(1).some(p=>p.move)}
export function canBindPathTarget(node:FigureNode){return node.kind!=='port'&&!node.socket&&(node.kind!=='path'||isClosedPathTarget(node))}
export function attachmentAnchorInventory(doc:FigureDocument){
  let remaining=128
  return new Map(doc.nodes.flatMap(node=>{if(!isClosedPathTarget(node)||!remaining)return[];const points=node.path!.points.slice(0,Math.min(16,remaining));remaining-=points.length;return[[node.id,points.map((p,index)=>({index,x:p.x,y:p.y}))] as const]}))
}
export function bindingPoint(doc:FigureDocument,binding:PathBinding){
  const target=doc.nodes.find(n=>n.id===binding.nodeId);if(!target)return undefined
  const anchor=binding.anchorIndex===undefined?{x:binding.x??.5,y:binding.y??.5}:target.path?.points[binding.anchorIndex];if(!anchor)return undefined
  return{x:target.x+target.width*anchor.x+(binding.offsetX??0),y:target.y+target.height*anchor.y+(binding.offsetY??0)}
}
export function mapPathPoints(points:PathPoint[],map:(p:{x:number;y:number})=>{x:number;y:number}):PathPoint[] {
  return points.map(p=>({...map(p),...(p.c1?{c1:map(p.c1)}:{}),...(p.c2?{c2:map(p.c2)}:{}),...(p.move!==undefined?{move:p.move}:{}),...(p.close!==undefined?{close:p.close}:{})}))
}
export const pathCoordinates=(points:PathPoint[])=>points.flatMap(p=>[p,...(p.c1?[p.c1]:[]),...(p.c2?[p.c2]:[])])
function shiftAnchor(points:PathPoint[],index:number,dx:number,dy:number) {
  const p=points[index]!,next=points[index+1]
  p.x+=dx;p.y+=dy
  if(p.c2){p.c2.x+=dx;p.c2.y+=dy}else if(p.c1){p.c1.x+=dx/2;p.c1.y+=dy/2}
  if(next&&!next.move&&!p.close&&next.c1){const factor=next.c2?1:.5;next.c1.x+=dx*factor;next.c1.y+=dy*factor}
}
export function pathPoints(doc: FigureDocument, node: FigureNode): PathPoint[] {
  if(!node.path) return []
  const points=mapPathPoints(node.path.points,p=>({x:node.x+p.x*node.width,y:node.y+p.y*node.height}))
  for(const [key,index] of [['start',0],['end',points.length-1]] as const) {
    const binding=node.path[key],target=binding&&bindingPoint(doc,binding)
    if(target)shiftAnchor(points,index,target.x-points[index]!.x,target.y-points[index]!.y)
  }
  return points
}
export function setPathPoints(node: FigureNode, points: PathPoint[]) {
  if(!node.path||points.length<2) return
  const all=pathCoordinates(points),xs=all.map(p=>p.x),ys=all.map(p=>p.y)
  node.x=Math.min(...xs);node.y=Math.min(...ys);node.width=Math.max(...xs)-node.x;node.height=Math.max(...ys)-node.y
  node.path.points=mapPathPoints(points,p=>({x:node.width?Math.max(0,Math.min(1,(p.x-node.x)/node.width)):0,y:node.height?Math.max(0,Math.min(1,(p.y-node.y)/node.height)):0}))
}
export function pointsData(points:PathPoint[]) {
  return points.map((p,i)=>`${i===0||p.move?'M':p.c2?`C${p.c1!.x} ${p.c1!.y} ${p.c2.x} ${p.c2.y} `:p.c1?`Q${p.c1.x} ${p.c1.y} `:'L'}${p.x} ${p.y}${p.close?'Z':''}`).join(' ')
}
export const pathData=(doc:FigureDocument,node:FigureNode)=>pointsData(pathPoints(doc,node))
export function syncBindings(doc: FigureDocument) {
  for(const node of doc.nodes) if(node.kind==='port'&&node.interfaceFor) {
    const owner=doc.containers.find(c=>c.id===node.interfaceFor)
    if(owner) Object.assign(node,{x:owner.x,y:owner.y,width:owner.width,height:owner.height})
  }
  for(const node of doc.nodes) if(node.path&&(node.path.start||node.path.end)) setPathPoints(node,pathPoints(doc,node))
}
/** Bind an open leader to an explicit geometry anchor, or retain its current pixels when detaching. */
export function setPathEndpointBinding(doc:FigureDocument,id:string,end:'start'|'end',targetId?:string,anchorIndex?:number,note?:string){
  const node=doc.nodes.find(n=>n.id===id)
  if(!node?.path||node.path.points.some(p=>p.move||p.close))throw new Error('只有单条开放路径可以绑定端点')
  if(node.chart?.key)throw new Error('数据图表路径不能用作附着引线，请使用独立注释路径')
  if(note!==undefined&&note.length>240)throw new Error('引线绑定说明超过 240 字')
  const points=pathPoints(doc,node),point=end==='start'?points[0]!:points.at(-1)!
  let binding:PathBinding|undefined
  if(targetId){
    const target=doc.nodes.find(n=>n.id===targetId);if(!target||target.id===id||!canBindPathTarget(target))throw new Error('请选择普通图元或独立闭合路径；命名接口使用语义连线')
    if(target.kind==='path'){
      const index=anchorIndex??target.path!.points.map((p,i)=>({i,distance:Math.hypot(target.x+p.x*target.width-point.x,target.y+p.y*target.height-point.y)})).sort((a,b)=>a.distance-b.distance)[0]!.i
      if(!Number.isInteger(index)||index<0||!target.path!.points[index])throw new Error('目标路径锚点已不存在')
      binding={nodeId:targetId,anchorIndex:index,...(note?{note}:{})}
    }else{
      if(anchorIndex!==undefined)throw new Error('只有闭合路径使用几何锚点编号')
      binding={nodeId:targetId,x:Math.max(0,Math.min(1,(point.x-target.x)/Math.max(.001,target.width))),y:Math.max(0,Math.min(1,(point.y-target.y)/Math.max(.001,target.height)))}
    }
  }
  setPathPoints(node,points);if(binding)node.path[end]=binding;else delete node.path[end];syncBindings(doc)
}
/** A removed target anchor detaches its leaders; other anchor references follow index changes. */
export function remapPathAnchorBindings(doc:FigureDocument,targetId:string,index:number,delta:1|-1){
  for(const node of doc.nodes)if(node.path&&[node.path.start,node.path.end].some(b=>b?.nodeId===targetId&&b.anchorIndex!==undefined)){
    const points=pathPoints(doc,node)
    for(const end of ['start','end'] as const){const binding=node.path[end];if(binding?.nodeId!==targetId||binding.anchorIndex===undefined)continue
      if(delta===-1&&binding.anchorIndex===index)delete node.path[end]
      else if(binding.anchorIndex>=index)binding.anchorIndex+=delta
    }
    setPathPoints(node,points)
  }
}
export function movePathPoint(doc: FigureDocument, id: string, index: number, point: PathPoint) {
  const node=doc.nodes.find(n=>n.id===id),parent=node&&doc.containers.find(c=>c.id===node.parentId)
  if(!node?.path||!parent||!Number.isInteger(index)||index<0||index>=node.path.points.length||![point.x,point.y].every(Number.isFinite)) throw new Error('请选择有效的路径点')
  const inset=(parent.role==='component'?2:12)*(parent.metricScale??1),top=(parent.role==='component'?2:parent.titleDetached?12:48)*(parent.metricScale??1)
  const points=pathPoints(doc,node),next={x:Math.max(parent.x+inset,Math.min(parent.x+parent.width-inset,point.x)),y:Math.max(parent.y+top,Math.min(parent.y+parent.height-inset,point.y))}
  if(Math.hypot(points[index]!.x-next.x,points[index]!.y-next.y)<.00001) return
  if(index===0) delete node.path.start
  if(index===points.length-1) delete node.path.end
  if(node.path.orthogonal&&!node.path.start&&!node.path.end){setPathPoints(node,moveArrowPoint(points,index,next));return}
  const original=mapPathPoints(points,p=>({...p})),dx=next.x-points[index]!.x,dy=next.y-points[index]!.y
  let first=index,last=index
  while(first>0&&!points[first]!.move&&!points[first-1]!.close)first--
  while(last<points.length-1&&!points[last]!.close&&!points[last+1]!.move)last++
  const paired=points[last]!.close&&Math.hypot(points[first]!.x-points[last]!.x,points[first]!.y-points[last]!.y)<1e-6?(index===first?last:index===last?first:null):null
  shiftAnchor(points,index,dx,dy);if(paired!==null&&paired!==index)shiftAnchor(points,paired,dx,dy)
  const previous=pathCoordinates(original),proposed=pathCoordinates(points)
  let factor=1
  proposed.forEach((p,i)=>{for(const axis of ['x','y'] as const){const min=parent[axis]+(axis==='y'?top:inset),max=parent[axis]+parent[axis==='x'?'width':'height']-inset,delta=p[axis]-previous[i]![axis];if(delta>0)factor=Math.min(factor,(max-previous[i]![axis])/delta);if(delta<0)factor=Math.min(factor,(min-previous[i]![axis])/delta)}})
  if(factor<1){let i=0;const clamped=mapPathPoints(points,p=>{const before=previous[i++]!;return{x:before.x+(p.x-before.x)*Math.max(0,factor),y:before.y+(p.y-before.y)*Math.max(0,factor)}});setPathPoints(node,clamped)}else setPathPoints(node,points)
}
export function movePathControl(doc:FigureDocument,id:string,index:number,key:'c1'|'c2',point:{x:number;y:number}) {
  const node=doc.nodes.find(n=>n.id===id),parent=node&&doc.containers.find(c=>c.id===node.parentId),points=node&&pathPoints(doc,node)
  if(!node||!parent||!points?.[index]?.[key]||![point.x,point.y].every(Number.isFinite))throw new Error('请选择有效曲线控制点')
  const inset=(parent.role==='component'?2:12)*(parent.metricScale??1),top=(parent.role==='component'?2:parent.titleDetached?12:48)*(parent.metricScale??1)
  points[index]![key]={x:Math.max(parent.x+inset,Math.min(parent.x+parent.width-inset,point.x)),y:Math.max(parent.y+top,Math.min(parent.y+parent.height-inset,point.y))}
  setPathPoints(node,points)
}
const midpoint=(a:{x:number;y:number},b:{x:number;y:number})=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2})
export function splitPathSegment(node:FigureNode,points:PathPoint[],index:number) {
  const a=points[index],b=points[index+1]
  if(!a||!b||a.close||b.move)throw new Error('请选择一个可拆分的线段')
  if(points.length>=128)throw new Error('一条路径最多 128 个锚点')
  let inserted:PathPoint
  if(b.c2){const p01=midpoint(a,b.c1!),p12=midpoint(b.c1!,b.c2),p23=midpoint(b.c2,b),p012=midpoint(p01,p12),p123=midpoint(p12,p23);inserted={...midpoint(p012,p123),c1:p01,c2:p012};b.c1=p123;b.c2=p23}
  else if(b.c1){const p01=midpoint(a,b.c1),p12=midpoint(b.c1,b);inserted={...midpoint(p01,p12),c1:p01};b.c1=p12}
  else inserted=midpoint(a,b)
  points.splice(index+1,0,inserted);setPathPoints(node,points)
}
export function setPathSegment(doc:FigureDocument,id:string,index:number,type:'line'|'quadratic'|'cubic') {
  const node=doc.nodes.find(n=>n.id===id),points=node&&pathPoints(doc,node),a=points?.[index-1],b=points?.[index]
  if(!node||!points||!a||!b||b.move||a.close)throw new Error('请选择有效曲线段')
  if(type==='line'){delete b.c1;delete b.c2}
  else if(type==='quadratic'){b.c1=b.c2?midpoint(b.c1!,b.c2):b.c1??midpoint(a,b);delete b.c2}
  else if(b.c1&&!b.c2){const c=b.c1;b.c1={x:a.x+(c.x-a.x)*2/3,y:a.y+(c.y-a.y)*2/3};b.c2={x:b.x+(c.x-b.x)*2/3,y:b.y+(c.y-b.y)*2/3}}
  else if(!b.c1){b.c1={x:a.x+(b.x-a.x)/3,y:a.y+(b.y-a.y)/3};b.c2={x:a.x+(b.x-a.x)*2/3,y:a.y+(b.y-a.y)*2/3}}
  setPathPoints(node,points)
}

/** Retain every supplied point in order; insert one explicit elbow for each diagonal pair. */
export function orthogonalPoints(input:{x:number;y:number}[],direction:'horizontal'|'vertical'|'strict'):PathPoint[]{
  const given=z.array(z.object({x:z.number().finite().min(0).max(maxCanvasSize),y:z.number().finite().min(0).max(maxCanvasSize)}).strict()).min(2).max(64).parse(input)
  for(const [i,next]of given.entries()){
    if(!i)continue
    const previous=given[i-1]!
    if(previous.x===next.x&&previous.y===next.y)throw new Error('相邻给定点不能重合')
    if(direction==='strict'&&previous.x!==next.x&&previous.y!==next.y)throw new Error('严格水平垂直模式要求相邻点的 X 或 Y 相同')
  }
  return direction==='strict'?given:orthogonalThroughPoints(given,direction)
}
