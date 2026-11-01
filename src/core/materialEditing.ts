import {z} from 'zod'
import {clone,parseDocument,type FigureDocument,type FigureNode} from './model.ts'
import {ancestors,bounds,contentBounds,descendants,findObject,fitTransparentAncestors,moveObjects,parentOf,resolveStyle,topLevelSelection} from './geometry.ts'
import {pathPoints,setPathPoints,orthogonalPoints} from './paths.ts'
import {canvasNodeTextStyle,canvasContainerTextStyle} from './typography.ts'
import {figurePaint,pathFill,foreground} from './paint.ts'
import {supportsGradient} from './gradient.ts'
import {reflowText} from './textGeometry.ts'
import {nodeStructure} from './structures.ts'
import {edgeWaypointPoints,setEdgeWaypointFrame} from './edgeWaypoints.ts'
import {routeEdge} from './routing.ts'
import {fitTextFrames,type TextFitRow} from './textFrameFit.ts'
import {applyLineStyle,lineStylePatchSchema} from './lineAppearance.ts'
import {matchMaterialSize} from './materialSizing.ts'
import {detailInsetRequestSchema} from './detailInsetContract.ts'
import {createDetailInset} from './detailInset.ts'

const id=z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/)
const ids=z.array(id).min(1).max(24).refine(values=>new Set(values).size===values.length,'对象不能重复')
const point=z.object({x:z.number().finite().min(0).max(1000),y:z.number().finite().min(0).max(620)}).strict()
export const materialEditSchema=z.discriminatedUnion('kind',[
  detailInsetRequestSchema,
  z.object({kind:z.literal('center'),objectIds:ids,axis:z.enum(['both','horizontal','vertical'])}).strict(),
  z.object({kind:z.literal('format'),sourceId:id,objectIds:ids,channels:z.array(z.enum(['typography','stroke','fill'])).min(1).max(3).refine(values=>new Set(values).size===values.length,'格式项不能重复'),includeDescendants:z.boolean(),positionedText:z.enum(['preserve','reflow']).optional(),textPolicy:z.enum(['family','typeface','match']).optional(),includeDescriptions:z.boolean().optional()}).strict(),
  z.object({kind:z.literal('arrow'),parentId:id,nodeId:id.optional(),points:z.array(point).min(2).max(64),direction:z.enum(['horizontal','vertical','strict']),arrow:z.enum(['none','open','filled']),startArrow:z.enum(['none','open','filled']).optional(),arrowSize:z.number().finite().min(.1).max(256).nullable().optional()}).strict(),
  z.object({kind:z.literal('edge-route'),edgeId:id,points:z.array(point).max(32),direction:z.enum(['horizontal','vertical'])}).strict(),
  z.object({kind:z.literal('fit-text'),objectIds:ids,includeDescendants:z.boolean(),anchor:z.enum(['center','top-left']),expandGroups:z.boolean(),positionedText:z.enum(['preserve','reflow']).optional()}).strict(),
  z.object({kind:z.literal('match-size'),sourceId:id,objectIds:ids,dimension:z.enum(['width','height','both']),anchor:z.enum(['center','top-left'])}).strict(),
  z.object({kind:z.literal('line-style'),objectIds:ids,includeDescendants:z.boolean(),style:lineStylePatchSchema}).strict(),
])
export const materialEditsSchema=z.array(materialEditSchema).max(8)
export type MaterialEdit=z.infer<typeof materialEditSchema>
export interface MaterialEditReport {kind:MaterialEdit['kind'];objectIds:string[];summary:string;changed:number;skipped:string[];textFit?:TextFitRow[]}
export {orthogonalPoints} from './paths.ts'
const equal=(a:{x:number;y:number},b:{x:number;y:number})=>Math.abs(a.x-b.x)<1e-7&&Math.abs(a.y-b.y)<1e-7


function selected(doc:FigureDocument,objectIds:string[]){
  for(const objectId of objectIds)if(!findObject(doc,objectId))throw new Error(`对象已不存在：${objectId}`)
  const objects=topLevelSelection(doc,objectIds)
  if(objects.some(o=>!o.parentId||'interfaceFor'in o&&o.interfaceFor))throw new Error('请选择普通素材或图元；根画板和接口不能作为编辑目标')
  return objects
}
function center(doc:FigureDocument,request:Extract<MaterialEdit,{kind:'center'}>):MaterialEditReport{
  const objects=selected(doc,request.objectIds)
  if(new Set(objects.map(o=>o.parentId)).size!==1)throw new Error('居中需要同一父容器内的对象，请选择整组素材')
  const moving=new Set(objects.flatMap(o=>[o.id,...descendants(doc,o.id).map(n=>n.id)]))
  if(doc.nodes.some(o=>moving.has(o.id)&&[o.path?.start,o.path?.end].some(b=>b&&!moving.has(b.nodeId))))throw new Error('所选路径绑定着外部对象，请一起选择关联对象或先解除绑定')
  const box=bounds(objects),area=contentBounds(parentOf(doc,objects[0]!.id)!)
  if(box.width>area.width+1e-7||box.height>area.height+1e-7)throw new Error('选区超过父容器可用空间，请先缩小素材')
  const dx=request.axis==='vertical'?0:area.x+(area.width-box.width)/2-box.x,dy=request.axis==='horizontal'?0:area.y+(area.height-box.height)/2-box.y
  moveObjects(doc,objects.map(o=>o.id),dx,dy)
  const actual=bounds(objects)
  if(!equal(actual,{x:box.x+dx,y:box.y+dy}))throw new Error('端点绑定限制了居中位置，请同时移动关联对象')
  return{kind:'center',objectIds:objects.map(o=>o.id),summary:`${objects.length} 个对象相对父容器${request.axis==='both'?'水平、垂直':request.axis==='horizontal'?'水平':'垂直'}居中；选区内相对位置保持`,changed:Math.abs(dx)+Math.abs(dy)>1e-7?objects.length:0,skipped:[]}
}
const paintable=(node:FigureNode)=>!['text','icon','port'].includes(node.kind)
const fillable=(node:FigureNode)=>paintable(node)&&(node.kind!=='path'||node.path?.points.some(p=>p.close))
function format(doc:FigureDocument,request:Extract<MaterialEdit,{kind:'format'}>):MaterialEditReport{
  const source=findObject(doc,request.sourceId)
  if(!source||'interfaceFor'in source&&source.interfaceFor)throw new Error('请选择有效的格式样本')
  const roots=selected(doc,request.objectIds),targets=new Set(roots.flatMap(o=>[o.id,...(request.includeDescendants?descendants(doc,o.id).map(n=>n.id):[])])),skipped:string[]=[]
  const sourceTheme=resolveStyle(doc,'kind'in source?source.parentId:source.id),sourceNode='kind'in source?source:undefined,paint=figurePaint(sourceTheme,sourceNode?.visual?.colorIndex)
  const text='kind'in source?canvasNodeTextStyle(source,false,sourceTheme):canvasContainerTextStyle(source,sourceTheme)
  if(sourceNode&&!sourceNode.textStyle?.color){
    if(sourceNode.textLayout){if(sourceNode.visual?.fill==='none'&&request.channels.includes('typography'))throw new Error('样本文字无可见填充，请改选有可见文字的样本');text.color=sourceNode.visual?.fill??text.color}
    else if(!nodeStructure(sourceNode)&&!sourceNode.visual?.textTone&&sourceNode.visual?.fill&&sourceNode.visual.fill!=='none')text.color=foreground(sourceNode.visual.fill)
  }
  const wants=(channel:'typography'|'stroke'|'fill')=>request.channels.includes(channel)
  if(wants('typography')&&sourceNode&&['path','port'].includes(sourceNode.kind))throw new Error('路径不能作为文字格式样本，请取消文字格式或改选样本')
  if((wants('fill')||wants('stroke'))&&(!sourceNode||!paintable(sourceNode)))throw new Error('填充和描边需选择形状或路径作为格式样本')
  if(wants('fill')&&sourceNode&&!fillable(sourceNode))throw new Error('开放路径不能作为填充样本')
  if(wants('stroke')&&source.visual?.strokeMatrix)throw new Error('此样本含变换描边，请改选普通形状或仅统一文字 / 填充')
  // Freeze the sample before touching descendants, including when it is itself a target.
  const visual=clone(source.visual??{}),sourceFill=sourceNode?pathFill(sourceTheme,{...visual,fill:visual.fill??(sourceNode.kind==='path'?undefined:visual.tone==='hatch'?paint.hatch:paint.fill)}):'none'
  let changed=0
  for(const target of [...doc.containers,...doc.nodes].filter(o=>targets.has(o.id)&&o.id!==source.id)){
    const before=JSON.stringify(target),managed=[target.id,...ancestors(doc,target.id)].some(objectId=>{const c=doc.containers.find(c=>c.id===objectId);return c?.dataChart||c?.sharedLegend||c?.sharedColorbar})
    if(managed||'interfaceFor'in target&&target.interfaceFor){skipped.push(`${target.id}：图表管理对象或接口`);continue}
    if(wants('typography')){
      if('kind'in target&&(target.textLayout&&request.positionedText!=='reflow'||['path','port'].includes(target.kind)))skipped.push(`${target.id}：定位文字或无文字路径`)
      else{
        const policy=request.textPolicy??'family',current='kind'in target?canvasNodeTextStyle(target,false,resolveStyle(doc,target.parentId)):canvasContainerTextStyle(target,resolveStyle(doc,target.id))
        target.textStyle=policy==='match'?{...text,letterSpacing:text.letterSpacing??0}:policy==='typeface'?{...target.textStyle,family:text.family,size:current.size,bold:text.bold,weight:text.weight,italic:text.italic,letterSpacing:text.letterSpacing??0}:{...target.textStyle,family:text.family,size:current.size}
        if(request.includeDescriptions&&'kind'in target&&target.description){const description=canvasNodeTextStyle(target,true,resolveStyle(doc,target.parentId));target.descriptionStyle={...target.descriptionStyle,family:text.family,size:description.size}}
        if('kind'in target&&target.textLayout){reflowText(target);fitTransparentAncestors(doc,target.id)}}
    }
    if(wants('stroke')||wants('fill')){
      if(!('kind'in target)||!paintable(target))skipped.push(`${target.id}：保留容器外框 / 非形状颜色`)
      else{
        target.visual={...target.visual}
        if(wants('stroke')){
          if(target.visual.strokeMatrix)skipped.push(`${target.id}：保留变换描边`)
          else Object.assign(target.visual,{stroke:visual.stroke??paint.ink,strokeGradient:supportsGradient(target.kind)?clone(visual.strokeGradient??null):null,strokeWidth:visual.strokeWidth??1.3,strokeOpacity:visual.strokeOpacity??1,dash:clone(visual.dash??[]),dashOffset:visual.dashOffset??0,lineCap:visual.lineCap??(sourceNode?.kind==='path'?'round':'butt'),lineJoin:visual.lineJoin??(sourceNode?.kind==='path'?'round':'miter'),miterLimit:visual.miterLimit??4})
        }
        if(wants('fill')){
          if(fillable(target))Object.assign(target.visual,{fill:sourceFill,fillGradient:supportsGradient(target.kind)?clone(visual.fillGradient??null):null,fillOpacity:visual.fillOpacity??1})
          else skipped.push(`${target.id}：保留开放路径的无填充`)
        }
      }
    }
    if(before!==JSON.stringify(target))changed++
  }
  return{kind:'format',objectIds:[...targets],summary:`以「${'kind'in source?source.label||source.id:source.title}」为样本统一${request.channels.map(c=>({typography:'主文字',stroke:'描边',fill:'填充'})[c]).join('、')}，调整 ${changed} 个对象；${request.channels.includes('typography')?({family:'统一字体，保留字号、字重、颜色和对齐',typeface:'统一字形，保留字号、颜色和对齐',match:'主文字完全匹配样本'})[request.textPolicy??'family']:''}；${request.includeDescriptions?'注释仅统一字体':'注释格式保持'}`,changed,skipped}
}
function fitText(doc:FigureDocument,request:Extract<MaterialEdit,{kind:'fit-text'}>):MaterialEditReport{
  for(const id of request.objectIds)if(!findObject(doc,id))throw new Error('文字适配目标已不存在')
  const targets=new Set(request.objectIds.flatMap(id=>[id,...(request.includeDescendants?descendants(doc,id).map(o=>o.id):[])])),rows=fitTextFrames(doc,targets,request),changed=rows.filter(r=>r.status==='fitted').length,blocked=rows.filter(r=>r.status==='blocked').length,engines=[...new Set(rows.flatMap(r=>r.engine?[r.engine]:[]))]
  return{kind:'fit-text',objectIds:[...targets],summary:`文字框适配：调整 ${changed} 个，${blocked} 个空间不足；保留原文和已设字号；${engines.includes('canvas')?'按当前浏览器字形测量':'按布局估算，需浏览器核对'}`,changed,skipped:rows.filter(r=>r.status==='blocked'||r.status==='skipped').map(r=>`${r.label||r.nodeId}：${r.reason}`),textFit:rows}
}
function matchSize(doc:FigureDocument,request:Extract<MaterialEdit,{kind:'match-size'}>):MaterialEditReport{
  const result=matchMaterialSize(doc,request)
  return{kind:'match-size',...result,summary:`按样本 ${request.sourceId} 统一${{width:'宽度',height:'高度',both:'宽高'}[request.dimension]}，调整 ${result.changed} 个外框；${request.anchor==='center'?'中心':'左上角'}保持；内部图元与字号不缩放`}
}
function lineStyle(doc:FigureDocument,request:Extract<MaterialEdit,{kind:'line-style'}>):MaterialEditReport{
  const result=applyLineStyle(doc,request.objectIds,request.includeDescendants,request.style)
  return{kind:'line-style',...result,summary:`统一连线样式：${result.total} 条开放路径 / 节点连接，调整 ${result.changed} 条；仅修改${Object.keys(request.style).map(k=>({stroke:'颜色',strokeWidth:'线宽',dash:'虚实',arrow:'终点箭头',startArrow:'起点箭头',arrowSize:'箭头大小'})[k as keyof typeof request.style]).join('、')}，保留给定点、路由方式与端点绑定`}
}
function edgeRoute(doc:FigureDocument,request:Extract<MaterialEdit,{kind:'edge-route'}>):MaterialEditReport{
  const edge=doc.edges.find(e=>e.id===request.edgeId)
  if(!edge)throw new Error('指定折点的连线已不存在')
  const before=JSON.stringify(edge),old=edgeWaypointPoints(doc,edge)
  if(!request.points.length){if((edge.routing??'orthogonal')!=='orthogonal')edge.routing='orthogonal';delete edge.manualRoute}
  else{
    if(request.points.some((p,i)=>i>0&&equal(p,request.points[i-1]!)))throw new Error('相邻指定折点不能重合')
    if(edge.routing!=='manual'||edge.manualRoute?.direction!==request.direction||old.length!==request.points.length||old.some((p,i)=>!equal(p,request.points[i]!)))setEdgeWaypointFrame(doc,edge,request.points,request.direction)
    const route=routeEdge(doc,edge);if(route.status==='blocked')throw new Error(route.reason)
  }
  return{kind:'edge-route',objectIds:[edge.id],summary:request.points.length?`连线 ${edge.id}：依次经过 ${request.points.length} 个指定折点，${request.direction==='horizontal'?'水平':'垂直'}优先；节点与端口绑定保持`:`连线 ${edge.id}：清除指定折点，恢复自动折线避障；节点与端口绑定保持`,changed:before!==JSON.stringify(edge)?1:0,skipped:[]}
}
function arrow(doc:FigureDocument,request:Extract<MaterialEdit,{kind:'arrow'}>):MaterialEditReport{
  const parent=doc.containers.find(c=>c.id===request.parentId)
  if(!parent)throw new Error('箭头放置容器已不存在')
  const points=orthogonalPoints(request.points,request.direction),area=contentBounds(parent)
  if(points.some(p=>p.x<area.x-1e-7||p.x>area.x+area.width+1e-7||p.y<area.y-1e-7||p.y>area.y+area.height+1e-7))throw new Error('给定点超出放置容器的内容区域')
  let node=request.nodeId?doc.nodes.find(n=>n.id===request.nodeId):undefined
  if(request.nodeId&&(!node?.path||node.parentId!==parent.id||node.path.points.some(p=>p.close||p.move)||node.chart))throw new Error('只能修改同一容器内的普通开放路径')
  if(node?.path){
    const old=pathPoints(doc,node)
    if(node.path.start&&!equal(old[0]!,points[0]!)||node.path.end&&!equal(old.at(-1)!,points.at(-1)!))throw new Error('给定端点与绑定位置不符，请保留端点或先解除绑定')
  }
  const before=node?JSON.stringify(node):''
  if(!node){let number=1;while(findObject(doc,`point-arrow-${number}`)||doc.edges.some(e=>e.id===`point-arrow-${number}`))number++;node={id:`point-arrow-${number}`,kind:'path',label:'',parentId:parent.id,x:0,y:0,width:0,height:0,path:{points:[],arrow:request.arrow},visual:{fill:'none',strokeWidth:1.6,lineCap:'round',lineJoin:'round',handDrawn:false}};doc.nodes.push(node)}
  node.path!.arrow=request.arrow;setPathPoints(node,points)
  if(request.startArrow!==undefined)node.path!.startArrow=request.startArrow
  if(request.arrowSize===null)delete node.path!.arrowSize;else if(request.arrowSize!==undefined)node.path!.arrowSize=request.arrowSize
  return{kind:'arrow',objectIds:[node.id],summary:`${request.nodeId?'更新':'新建'}直角路径：${request.points.length} 个给定点、${points.length-1} 段水平 / 垂直线，终点${{none:'无箭头',open:'开放箭头',filled:'实心箭头'}[request.arrow]}${node.path!.startArrow&&node.path!.startArrow!=='none'?`，起点${node.path!.startArrow==='open'?'开放':'实心'}箭头`:''}；不自动避障`,changed:before!==JSON.stringify(node)?1:0,skipped:[]}
}
function detailInset(doc:FigureDocument,request:Extract<MaterialEdit,{kind:'detail-inset'}>):MaterialEditReport{
  const result=createDetailInset(doc,request);Object.assign(doc,result.figure)
  return{kind:'detail-inset',objectIds:[result.ownerId],changed:1,summary:result.summary,skipped:[...result.omittedEdgeIds.map(id=>`${id}：源图外部连接不复制`),...result.detachedEndpoints.map(endpoint=>`${endpoint.nodeId}.${endpoint.end}：保留几何并解除外部绑定`)]}
}
/** The same atomic compiler serves manual previews and assistant proposals. */
export function applyMaterialEdits(original:FigureDocument,input:MaterialEdit[]){
  const requests=materialEditsSchema.min(1).parse(input),figure=clone(original),reports=requests.map(request=>request.kind==='detail-inset'?detailInset(figure,request):request.kind==='center'?center(figure,request):request.kind==='format'?format(figure,request):request.kind==='fit-text'?fitText(figure,request):request.kind==='match-size'?matchSize(figure,request):request.kind==='line-style'?lineStyle(figure,request):request.kind==='edge-route'?edgeRoute(figure,request):arrow(figure,request))
  return{figure:parseDocument(figure),reports,changed:JSON.stringify(original)!==JSON.stringify(figure)}
}
