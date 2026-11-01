import {clone,parseDocument,type FigureDocument,type FigureNode} from './model.ts'
import {canBindPathTarget,pathPoints,setPathPoints,estimatedPathLength,type PathPoint} from './paths.ts'
import {findCalloutPlacement,calloutTargets} from './callouts.ts'
import {ancestors,contentBounds,resolveStyle} from './geometry.ts'
import {nodeTextStyle} from './typography.ts'
import {calloutReflowRequestsSchema,calloutReflowReportSchema,type CalloutReflowReport} from './calloutReflowContract.ts'

const rect=(node:FigureNode)=>({x:node.x,y:node.y,width:node.width,height:node.height})
const same=(a:unknown,b:unknown):boolean=>{
  if(typeof a==='number'&&typeof b==='number')return Math.abs(a-b)<=1e-7
  if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>same(v,b[i]))
  if(a&&b&&typeof a==='object'&&typeof b==='object'){const left=a as Record<string,unknown>,right=b as Record<string,unknown>,keys=new Set([...Object.keys(left),...Object.keys(right)]);return[...keys].every(key=>same(left[key],right[key]))}
  return a===b
}
const comparable=(points:PathPoint[])=>points.map(p=>({...p,move:!!p.move,close:!!p.close}))
function pair(figure:FigureDocument,leaderId:string,labelId:string){
  const leader=figure.nodes.find(n=>n.id===leaderId),label=figure.nodes.find(n=>n.id===labelId)
  if(!leader?.path||leader.chart?.key||leader.path.points.some(p=>p.move||p.close)||!leader.path.start||!leader.path.end)throw new Error('请选择有双端附着的普通开放引线')
  if(!label||label.kind!=='text'||!label.label.trim()||label.chart?.key||label.visual?.fill&&label.visual.fill!=='none'||label.visual?.stroke&&label.visual.stroke!=='none')throw new Error('注释须为可独立编辑的无框文字，不能重排受数据管理的标签')
  const managed=new Set(figure.containers.flatMap(c=>[...Object.values(c.parametric?.objects??{}),...(c.sharedLegend?.entries.flatMap(entry=>[entry.markId,entry.labelId])??[]),...(c.sharedColorbar?.parts.map(part=>part.nodeId)??[])]))
  if(managed.has(leaderId)||managed.has(labelId))throw new Error('不能重排由组合配方、共享图例或色标管理的图元')
  const labelEnd:'start'|'end'|undefined=leader.path.end.nodeId===label.id?'end':leader.path.start.nodeId===label.id?'start':undefined
  if(!labelEnd)throw new Error('引线未附着到此注释')
  const targetEnd:'start'|'end'=labelEnd==='end'?'start':'end',binding=leader.path[targetEnd]!,target=figure.nodes.find(n=>n.id===binding.nodeId)
  if(!target||target.id===label.id||!canBindPathTarget(target))throw new Error('原目标已不存在或不再支持几何附着')
  const ids=new Set([leader.id,label.id])
  if(figure.edges.some(e=>ids.has(e.source)||ids.has(e.target))||figure.nodes.some(n=>n.id!==leader.id&&[n.path?.start,n.path?.end].some(b=>b&&ids.has(b.nodeId))))throw new Error('注释或引线另有外部引用，请先整理，避免重排影响其他连接')
  return{leader,label,target,labelEnd,targetEnd,binding,labelBinding:leader.path[labelEnd]!}
}
/** Discover existing native pairs by explicit endpoints, without adding metadata or guessing names. */
export function existingCalloutTargets(figure:FigureDocument,selectedIds:string[]=[]){
  const visible=new Map(calloutTargets(figure).map(target=>[target.targetId,target]))
  return figure.nodes.flatMap(leader=>{
    if(!leader.path?.start||!leader.path.end||leader.chart?.key||leader.path.points.some(p=>p.move||p.close))return[]
    const labelIds=[leader.path.start.nodeId,leader.path.end.nodeId].filter(id=>figure.nodes.find(n=>n.id===id)?.kind==='text')
    return[...new Set(labelIds)].map(labelId=>{
      const label=figure.nodes.find(n=>n.id===labelId)!,base={key:`${leader.id}:${labelId}`,leaderId:leader.id,labelId,text:label.label,selected:selectedIds.includes(leader.id)||selectedIds.includes(labelId)}
      try{const row=pair(figure,leader.id,labelId);if(visible.get(labelId)?.error||visible.get(row.target.id)?.error||leader.visual?.opacity===0||leader.visual?.stroke==='none'||leader.visual?.strokeOpacity===0||ancestors(figure,leader.id).some(id=>figure.containers.find(c=>c.id===id)?.opacity===0))throw new Error('注释、目标或引线已隐藏');return{...base,targetId:row.target.id,targetLabel:row.target.name||row.target.label||row.target.kind,parentId:label.parentId,targetKind:row.target.kind,bindings:{start:clone(leader.path!.start!),end:clone(leader.path!.end!)},bounds:rect(label),points:pathPoints(figure,leader),error:''}}
      catch(error){return{...base,targetId:'',targetLabel:'',parentId:label.parentId,bounds:rect(label),points:[] as PathPoint[],error:(error as Error).message}}
    })
  })
}
/** Move selected text / path geometry only. Object identities, styles and hierarchy remain exact; anchor changes are opt-in. */
export function reflowCallouts(input:FigureDocument,raw:unknown){
  const requests=calloutReflowRequestsSchema.parse(raw),original=parseDocument(clone(input)),available=new Map(existingCalloutTargets(original).map(row=>[row.key,row]))
  const pairs=requests.map(request=>{const row=available.get(`${request.leaderId}:${request.labelId}`);if(!row||row.error)throw new Error(row?.error||'请选择可调整的既有引线注释');return pair(original,request.leaderId,request.labelId)})
  const movingIds=new Set(pairs.flatMap(row=>[row.leader.id,row.label.id]))
  if(pairs.some(row=>movingIds.has(row.target.id)))throw new Error('所选注释互为目标，请分开调整，避免改变彼此的锚点位置')
  const working:FigureDocument={...clone(original),nodes:clone(original.nodes.filter(n=>!movingIds.has(n.id)))}
  const updates=new Map<string,FigureNode>(),reports:CalloutReflowReport[]=[]
  for(const [index,row] of pairs.entries()){
    const request=requests[index]!,parent=original.containers.find(c=>c.id===row.leader.parentId)!,oldPoints=pathPoints(original,row.leader)
    const placed=findCalloutPlacement(working,row.target,row.label,row.label.parentId,{side:request.side,current:rect(row.label),onlyRoute:request.mode==='route',routeArea:contentBounds(parent),fixed:{target:row.binding,label:row.labelBinding},reselect:request.anchorPolicy==='reselect'})
    if(!placed)throw new Error(`「${row.label.label}」在原容器内没有可用的注释位置与引线，请调整周围图元或侧向。整次操作未应用`)
    const proposedPoints=row.labelEnd==='end'?placed.points:[...placed.points].reverse(),labelMoved=!same(rect(row.label),placed.box),leaderChanged=!same(comparable(oldPoints),comparable(proposedPoints))
    const label=clone(row.label),leader=clone(row.leader),beforeBindings={start:clone(row.leader.path!.start!),end:clone(row.leader.path!.end!)}
    if(labelMoved){label.x=placed.box.x;label.y=placed.box.y}
    if(labelMoved||leaderChanged)setPathPoints(leader,proposedPoints)
    leader.path![row.targetEnd]=clone(placed.bindings!.target);leader.path![row.labelEnd]=clone(placed.bindings!.label)
    let afterBindings={start:clone(leader.path!.start!),end:clone(leader.path!.end!)}
    const bindingsChanged=!same(beforeBindings,afterBindings)
    if(!bindingsChanged){leader.path!.start=clone(beforeBindings.start);leader.path!.end=clone(beforeBindings.end);afterBindings=clone(beforeBindings)}
    updates.set(label.id,label);updates.set(leader.id,leader);working.nodes.push(leader,label)
    const style=nodeTextStyle(row.label,false,resolveStyle(original,row.label.parentId))
    reports.push(calloutReflowReportSchema.parse({leaderId:leader.id,labelId:label.id,targetId:row.target.id,parentId:label.parentId,mode:request.mode,anchorPolicy:request.anchorPolicy,text:label.label,fontFamily:style.family,fontSize:style.size,reason:request.reason,before:rect(row.label),after:rect(label),beforePoints:oldPoints,afterPoints:pathPoints(working,leader),labelMoved,leaderChanged,changed:labelMoved||leaderChanged||bindingsChanged,bindingsChanged,beforeBindings,afterBindings,beforeLength:estimatedPathLength(oldPoints),afterLength:estimatedPathLength(pathPoints(working,leader)),targetPreserved:true,textPreserved:true}))
  }
  const figure=parseDocument({...original,nodes:original.nodes.map(node=>updates.get(node.id)??node)})
  return{figure,reports,changed:reports.some(r=>r.changed)}
}
