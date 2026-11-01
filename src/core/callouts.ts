import {calloutAnchorCandidates,type CalloutBindings} from './calloutAnchors.ts'
import {clone,parseDocument,anchor,type FigureDocument,type FigureNode,type Port} from './model.ts'
import {ancestors,contentBounds,contains,resolveStyle,type Rect} from './geometry.ts'
import {canBindPathTarget,isClosedPathTarget,pathPoints,setPathPoints,bindingPoint,pathSegments,type PathPoint} from './paths.ts'
import {routeEdge,routeFigure,routeCost,segmentHitsRect,simplifyPoints,segmentsCross,type Point} from './routing.ts'
import {layoutWrappedText,estimatedTextWidth} from './typography.ts'
import {figurePaint} from './paint.ts'
import {calloutRequestsSchema,calloutReportSchema,type CalloutReport} from './calloutContract.ts'
import {sharedLegendVisibility} from './sharedLegend.ts'
import {sharedColorbarVisibility} from './sharedColorbar.ts'

const directions:Port[]=['right','left','top','bottom'],opposite:Record<Port,Port>={right:'left',left:'right',top:'bottom',bottom:'top'}
const padded=(r:Rect,gap=3):Rect=>({x:r.x-gap,y:r.y-gap,width:r.width+gap*2,height:r.height+gap*2})
const overlaps=(a:Rect,b:Rect)=>a.x<b.x+b.width-1e-6&&a.x+a.width>b.x+1e-6&&a.y<b.y+b.height-1e-6&&a.y+a.height>b.y+1e-6
const hiddenInScene=(figure:FigureDocument)=>new Set([...sharedLegendVisibility(figure).hidden,...sharedColorbarVisibility(figure).hidden])
const visible=(figure:FigureDocument,node:FigureNode,hidden:Set<string>)=>!hidden.has(node.id)&&(node.visual?.opacity??1)>0&&!ancestors(figure,node.id).some(id=>figure.containers.find(c=>c.id===id)?.opacity===0)
export function calloutTargets(figure:FigureDocument,selectedIds:string[]=[]){
  const hidden=hiddenInScene(figure)
  return figure.nodes.filter(n=>canBindPathTarget(n)).map(node=>({targetId:node.id,label:node.name||node.label||node.kind,kind:node.kind,selected:selectedIds.includes(node.id),bounds:{x:node.x,y:node.y,width:node.width,height:node.height},parentIds:ancestors(figure,node.id),...(isClosedPathTarget(node)?{anchors:node.path!.points.map((p,index)=>({index,x:node.x+p.x*node.width,y:node.y+p.y*node.height}))}:{}),error:visible(figure,node,hidden)?'':'目标已隐藏'}))
}
function strokeSegments(figure:FigureDocument,hidden:Set<string>){
  const segments:{a:Point;b:Point}[]=[]
  for(const route of routeFigure(figure).values())for(let i=1;i<route.points.length;i++)segments.push({a:route.points[i-1]!,b:route.points[i]!})
  for(const node of figure.nodes.filter(n=>n.path&&visible(figure,n,hidden)&&n.chart?.role!=='grid'&&n.visual?.stroke!=='none'&&n.visual?.strokeOpacity!==0))segments.push(...pathSegments(pathPoints(figure,node)))
  return segments
}
function nearestSide(box:Rect,point:Point,toward:Point):Port{
  const gaps:Record<Port,number>={left:Math.abs(point.x-box.x),right:Math.abs(point.x-box.x-box.width),top:Math.abs(point.y-box.y),bottom:Math.abs(point.y-box.y-box.height)}
  const vector:Record<Port,number>={right:toward.x-point.x,left:point.x-toward.x,top:point.y-toward.y,bottom:toward.y-point.y}
  return [...directions].sort((a,b)=>gaps[a]-gaps[b]||vector[b]-vector[a])[0]!
}
/** Find a nearby route using actual endpoint bindings when reflowing an existing note. */
export function findCalloutPlacement(figure:FigureDocument,target:FigureNode,template:FigureNode,parentId:string,options:{side:'auto'|Port;current?:Rect;onlyRoute?:boolean;routeArea?:Rect;fixed?:CalloutBindings;reselect?:boolean}){
  const parent=figure.containers.find(c=>c.id===parentId)!,area=contentBounds(parent),width=template.width,height=template.height,hidden=hiddenInScene(figure)
  const ancestorsOfTarget=new Set(ancestors(figure,target.id)),body=(n:FigureNode)=>n.kind!=='path'||isClosedPathTarget(n)||!!n.visual?.fill&&n.visual.fill!=='none',rectangles:(Rect&{id:string})[]=[...figure.nodes.filter(n=>n.kind!=='port'&&body(n)&&visible(figure,n,hidden)),...figure.containers.filter(c=>!ancestorsOfTarget.has(c.id)&&c.opacity!==0&&!ancestors(figure,c.id).some(id=>figure.containers.find(c=>c.id===id)?.opacity===0)&&ancestors(figure,c.id).includes(parentId))]
    const strokes=strokeSegments(figure,hidden),candidates:{box:Rect;side:Port;distance:number}[]=[]
    const addCandidate=(box:Rect,side:Port)=>{
      if(!contains(area,box)||rectangles.some(r=>overlaps(padded(box),r))||strokes.some(s=>segmentHitsRect(s.a,s.b,padded(box))))return
      candidates.push({box,side,distance:Math.hypot(box.x+width/2-target.x-target.width/2,box.y+height/2-target.y-target.height/2)})
    }
    if(options.current){const dx=options.current.x+width/2-target.x-target.width/2,dy=options.current.y+height/2-target.y-target.height/2,side:Port=Math.abs(dx)>=Math.abs(dy)?dx>=0?'right':'left':dy>=0?'bottom':'top';if(options.side==='auto'||options.side===side)addCandidate(options.current,side)}
    if(!options.onlyRoute)for(const side of options.side==='auto'?directions:[options.side])for(const gap of [24,48,80])for(const offset of [0,-1,1]){
      const x=side==='right'?target.x+target.width+gap:side==='left'?target.x-gap-width:target.x+(target.width-width)/2+offset*(width+12),y=side==='bottom'?target.y+target.height+gap:side==='top'?target.y-gap-height:target.y+(target.height-height)/2+offset*(height+12)
      addCandidate({x,y,width,height},side)
    }
    candidates.sort((a,b)=>a.distance-b.distance)
    let placed:{box:Rect;side:Port;points:PathPoint[];anchorIndex?:number;bindings?:CalloutBindings}|undefined,bestScore=Infinity,attempts=0
    const used=new Set([...figure.nodes,...figure.containers,...figure.edges].map(o=>o.id));let temporary='callout-preview';while(used.has(temporary))temporary+='-x'
    const currentBox=(box:Rect)=>!!options.current&&Math.abs(box.x-options.current.x)<1e-7&&Math.abs(box.y-options.current.y)<1e-7
    for(const candidate of candidates){
      const label:FigureNode={...clone(template),id:temporary,parentId,...candidate.box}
      // Grids are decoration, not barriers. Original strokes are still kept in the figure.
      const routeDoc={...figure,nodes:[...figure.nodes.filter(n=>visible(figure,n,hidden)&&(n.id===target.id||body(n))),label]}
      const original=options.fixed?{target:options.fixed.target,label:{...options.fixed.label,nodeId:temporary}}:undefined
      const choices=original&&options.reselect?calloutAnchorCandidates(routeDoc,target,label,original):[original]
      for(const bindings of choices){
        const fixed=bindings?{source:bindingPoint(routeDoc,bindings.target)!,target:bindingPoint(routeDoc,bindings.label)!,area:options.routeArea??area}:undefined
        if(bindings&&(!fixed?.source||!fixed?.target))continue
        if(options.reselect&&fixed){
          const lowerBound=Math.abs(fixed.source.x-fixed.target.x)+Math.abs(fixed.source.y-fixed.target.y)
          if(lowerBound>bestScore+1e-7)continue
          // Bound interactive work; a missed solution is reported rather than
          // changing the diagram or weakening the obstacle checks.
          if(attempts++>=96)return placed
        }
        const [sx,sy]=anchor(target,candidate.side),[tx,ty]=anchor(label,opposite[candidate.side])
        const route=routeEdge(routeDoc,{id:'callout-route',source:target.id,target:label.id,sourcePort:fixed?nearestSide(target,fixed.source,fixed.target):candidate.side,targetPort:fixed?nearestSide(label,fixed.target,fixed.source):opposite[candidate.side]},{...(fixed??{source:{x:sx,y:sy},target:{x:tx,y:ty},area}),barriers:strokes})
        if(route.status!=='clear')continue
        let points:PathPoint[]=route.points,anchorIndex:number|undefined
        if(!bindings&&isClosedPathTarget(target)){
          const near=points[1]??points.at(-1)!,anchors=target.path!.points.map((p,index)=>({index,x:target.x+p.x*target.width,y:target.y+p.y*target.height})).sort((a,b)=>Math.hypot(a.x-near.x,a.y-near.y)-Math.hypot(b.x-near.x,b.y-near.y)),chosen=anchors[0]!
          anchorIndex=chosen.index;points=simplifyPoints([{x:chosen.x,y:chosen.y},...points.slice(1)])
          if(points.slice(1).some((p,i)=>rectangles.some(r=>r.id!==target.id&&segmentHitsRect(points[i]!,p,padded(r,2)))))continue
        }
        if(points.some(p=>!contains(options.routeArea??area,{...p,width:0,height:0}))||points.slice(1).some((p,i)=>strokes.some(s=>segmentsCross(points[i]!,p,s.a,s.b))))continue
        const score=routeCost(points)
        if(!placed||score<bestScore-1e-7||Math.abs(score-bestScore)<1e-7&&currentBox(candidate.box)&&!currentBox(placed.box)){
          placed={...candidate,points,anchorIndex,...(bindings?{bindings:{target:bindings.target,label:{...bindings.label,nodeId:template.id}}}:{})};bestScore=score
        }
        if(!options.reselect)return placed
      }
    }
  return placed
}
/** Generate ordinary, unboxed text and a bound leader. Search uses conservative
 * object bounds and existing routing; no scientific content or source geometry moves. */
export function createCallouts(input:FigureDocument,raw:unknown,aliases:Record<string,Record<string,string>>={}){
  const requests=calloutRequestsSchema.parse(raw),original=parseDocument(clone(input)),targets=new Map(original.nodes.map(node=>[node.id,node])),hidden=hiddenInScene(original)
  if(original.nodes.length+requests.length*2>240)throw new Error('引线注释会超过 240 个图元，请减少标注数量')
  let figure=original;const reports:CalloutReport[]=[]
  for(const request of requests){
    const targetId=request.targetId??aliases[request.instanceId!]?.[request.nodeId!],target=targetId&&targets.get(targetId)
    if(!target||!canBindPathTarget(target)||!visible(figure,target,hidden))throw new Error('注释须引用本轮有效且可见的普通图元或独立闭合路径；组合请选择内部图元，命名接口使用语义连接')
    const parentId=request.parentId??target.parentId,parent=figure.containers.find(c=>c.id===parentId)
    if(!parent||!ancestors(figure,target.id).includes(parentId))throw new Error('注释容器须为目标的外层容器')
    const area=contentBounds(parent),family=request.fontFamily??resolveStyle(figure,parentId).fontFamily??'Inter',size=request.fontSize,maxWidth=Math.min(request.maxWidth,area.width)
    if(maxWidth<40)throw new Error('注释容器太窄，请选择更外层容器')
    const initial=layoutWrappedText(request.text,maxWidth-4,size,160),width=Math.min(maxWidth,Math.max(size*1.5,...initial.lines.map(line=>estimatedTextWidth(line,size)))+6)
    const textLayout=layoutWrappedText(request.text,width-4,size,160),height=textLayout.lines.length*size*1.25+6
    if(textLayout.truncated||textLayout.overwide||height>area.height)throw new Error('完整注释放不进容器，请调整宽度、字号或布局；不会缩写或缩字')
    const template:FigureNode={id:'preview-label',parentId,kind:'text',label:request.text,x:0,y:0,width,height,textStyle:{family,size,align:'left'},visual:{fill:'none',stroke:'none',padding:2}}
    const placed=findCalloutPlacement(figure,target,template,parentId,{side:request.side})
    if(!placed)throw new Error(`「${target.name||target.label||target.kind}」附近没有可用的注释位置与引线，请调整侧向、宽度或选择更外层容器。整次操作未应用`)
    const labelId=`note-${crypto.randomUUID()}`,leaderId=`leader-${crypto.randomUUID()}`,label:FigureNode={id:labelId,parentId,kind:'text',label:request.text,...placed.box,textStyle:{family,size,align:'left'},visual:{fill:'none',stroke:'none',padding:2}},paint=figurePaint(resolveStyle(figure,parentId))
    const leader:FigureNode={id:leaderId,parentId,kind:'path',label:'',name:'注释引线',x:0,y:0,width:1,height:1,path:{points:[{x:0,y:0},{x:1,y:1}],arrow:'none'},visual:{fill:'none',stroke:paint.ink,strokeWidth:1,lineCap:'round',lineJoin:'round'}}
    setPathPoints(leader,placed.points)
    const [sx,sy]=anchor(target,placed.side),[tx,ty]=anchor(label,opposite[placed.side])
    leader.path!.start=placed.anchorIndex===undefined?{nodeId:target.id,x:(sx-target.x)/Math.max(.001,target.width),y:(sy-target.y)/Math.max(.001,target.height),note:request.reason}:{nodeId:target.id,anchorIndex:placed.anchorIndex,note:request.reason}
    leader.path!.end={nodeId:label.id,x:(tx-label.x)/label.width,y:(ty-label.y)/label.height}
    figure.nodes.push(leader,label);figure=parseDocument(figure)
    reports.push(calloutReportSchema.parse({targetId:target.id,labelId,leaderId,parentId,text:request.text,fontFamily:family,fontSize:size,side:placed.side,box:placed.box,lines:textLayout.lines.length,points:pathPoints(figure,leader),reason:request.reason,...(request.instanceId?{instanceId:request.instanceId,nodeId:request.nodeId}:{})}))
  }
  return{figure,reports}
}
