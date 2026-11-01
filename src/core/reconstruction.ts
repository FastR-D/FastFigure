import { clone, createBlank, parseDocument, type FigureContainer, type FigureDocument, type FigureNode, type ReferenceImage } from './model.ts'
import { ancestors, contentBounds, descendants, translateGeometry } from './geometry.ts'
import { captureComponent, instantiateComponent } from './assets.ts'
import { referenceSource } from './references.ts'
import { identity, parseTransform, transform, type Linear } from './affine.ts'
import { mapPathPoints, pathPoints, pointsData, setPathPoints, type PathPoint } from './paths.ts'
import { parseSvgPath } from './svgPath.ts'
import { textBox } from './textGeometry.ts'
import { figurePaint,pathFill } from './paint.ts'
import { resolveStyle } from './geometry.ts'
import {composeReconstructionReuse} from './reconstructionReuse.ts'
import type {CatalogueEntry,ComponentUse} from './catalogue.ts'
import {attachComponentLeaders} from './componentAttachments.ts'
import type {CataloguePreviewInfo} from './cataloguePreviewContract.ts'
import { applyRegionPatch, planDetailRegions, planSemanticRegions, regionObjectCatalog, snapshotVersions, translateNode, type Worker } from '../vendor/topconf/reconstruction-pipeline.mjs'
import { reconstructionNodeSchema, reconstructionSceneSchema, repairResponseSchema, reconstructionResponseSchema, type ReconstructionImageInfo, type ReconstructionNode, type ReconstructionRecord, type ReconstructionScene, type ReconstructionTask } from './reconstructionContract.ts'

const protectedOwner='ff-protected'
const pixel=(n:number)=>Math.round(n*1e6)/1e6
export function referenceForReconstruction(doc:FigureDocument,task:ReconstructionTask):ReferenceImage {
  const sha=task.kind==='repair'?doc.containers.find(c=>c.id===task.containerId)?.reconstruction?.referenceSha256:undefined
  const reference=doc.references.find(r=>task.kind==='reconstruct'?r.id===task.referenceId:r.sha256===sha)
  if(!reference)throw new Error(task.kind==='repair'?'请先导入这组图元对应的原参考图，再进行分区修复':'重建所选参考图已不在工程中')
  if(task.kind==='reconstruct'){
    if(task.region.width*reference.pixelWidth<3||task.region.height*reference.pixelHeight<3)throw new Error('重建区域至少需要 3 × 3 像素，请重新框选')
    if(task.destination==='current'&&!doc.containers.some(c=>c.id===task.parentId))throw new Error('重建目标容器已不存在')
  }
  return reference
}
export function sourceRoi(record:Pick<ReconstructionRecord,'region'|'sourceWidth'|'sourceHeight'>){const r=record.region;return{x:r.x*record.sourceWidth,y:r.y*record.sourceHeight,w:r.width*record.sourceWidth,h:r.height*record.sourceHeight}}
function toWorld(point:{x:number;y:number},record:ReconstructionRecord){const r=sourceRoi(record);return{x:record.origin.x+(point.x-r.x)*record.scale,y:record.origin.y+(point.y-r.y)*record.scale}}
function toSource(point:{x:number;y:number},record:ReconstructionRecord){const r=sourceRoi(record);return{x:pixel(r.x+(point.x-record.origin.x)/record.scale),y:pixel(r.y+(point.y-record.origin.y)/record.scale)}}
export function reconstructionViewport(record:ReconstructionRecord,region:{x:number;y:number;w:number;h:number}){return{...toWorld(region,record),width:region.w*record.scale,height:region.h*record.scale}}
const coordinates=(node:ReconstructionNode):PathPoint[]=>{
  if(node.type==='line')return[{x:node.x,y:node.y},{x:node.x2,y:node.y2}]
  if(node.type==='path')return parseSvgPath(node.d,identity)
  if(node.type==='polyline'){const raw=node.points.trim().split(/[ ,]+/).map(Number);if(raw.length<4||raw.length%2||raw.some(n=>!Number.isFinite(n)))throw new Error('重建折线坐标无效');return raw.filter((_,i)=>i%2===0).map((x,i)=>({x,y:raw[i*2+1]!}))}
  const {x,y,w,h}=node,rotation=parseTransform(`rotate(${node.rotation??0} ${x+w/2} ${y+h/2})`)
  if(node.type==='ellipse')return parseSvgPath(`M${x+w} ${y+h/2}A${w/2} ${h/2} 0 1 1 ${x} ${y+h/2}A${w/2} ${h/2} 0 1 1 ${x+w} ${y+h/2}Z`,rotation)
  if(node.type==='rect'&&node.rx){const r=Math.min(node.rx,w/2,h/2);return parseSvgPath(`M${x+r} ${y}H${x+w-r}A${r} ${r} 0 0 1 ${x+w} ${y+r}V${y+h-r}A${r} ${r} 0 0 1 ${x+w-r} ${y+h}H${x+r}A${r} ${r} 0 0 1 ${x} ${y+h-r}V${y+r}A${r} ${r} 0 0 1 ${x+r} ${y}Z`,rotation)}
  return mapPathPoints([{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h,close:true}],p=>transform(p,rotation))
}
function sceneNodeToNative(row:ReconstructionNode,id:string,parentId:string,record:ReconstructionRecord,reference:ReferenceImage):FigureNode {
  const s=record.scale,paint:NonNullable<FigureNode['visual']>={fill:row.fill??'none',stroke:row.stroke??(['text'].includes(row.type)?'none':'#334155'),strokeWidth:Math.max(.01,(row.strokeWidth??1)*s),handDrawn:false,padding:0,opacity:row.opacity??1,fillOpacity:row.fillOpacity??1,strokeOpacity:row.strokeOpacity??1,...(row.dash?{dash:row.dash.map(n=>n*s)}:{})}
  const node:FigureNode={id,parentId,kind:'path',label:row.name??row.type,name:row.name??row.type,x:0,y:0,width:1,height:1,metricScale:s,visual:paint,reconstruction:{objectId:row.id,version:row.version,...(row.owner?{owner:row.owner}:{})}}
  if(row.type==='text'){
    const angle=(row.rotation??0)*Math.PI/180,matrix:Linear=row.matrix??[Math.cos(angle),Math.sin(angle),-Math.sin(angle),Math.cos(angle)]
    const anchor=row.anchor?{x:row.x+row.w*row.anchor.x,y:row.y+row.h*row.anchor.y}:transform({x:row.x+row.w*(row.align==='center'?.5:row.align==='right'?1:0),y:row.y+row.h/2+row.fontSize*.3},parseTransform(`rotate(${row.rotation??0} ${row.x+row.w/2} ${row.y+row.h/2})`))
    const textStyle={family:row.fontFamily??'Inter',size:row.fontSize*s,weight:row.fontWeight??(row.bold?700:400),letterSpacing:(row.letterSpacing??0)*s,bold:row.bold??(row.fontWeight??400)>=600,italic:row.italic??false,align:row.align??'left' as const,color:row.fill&&row.fill!=='none'?row.fill:'#243247'}
    Object.assign(node,{kind:'text',label:row.text,textStyle,...textBox(row.text,textStyle,toWorld(anchor,record),matrix),visual:{...paint,fill:row.fill??'#243247',stroke:'none'}})
  }else if((row.type==='rect'||row.type==='ellipse')&&!row.rotation&&row.w>=1&&row.h>=1){Object.assign(node,{kind:row.type==='rect'?'rectangle':'ellipse',label:'',...toWorld(row,record),width:row.w*s,height:row.h*s});if(row.type==='rect')paint.radius=(row.rx??0)*s}
  else {node.path={points:[{x:0,y:0},{x:1,y:1}],arrow:'arrow' in row&&row.arrow?'filled':'none',...('fillRule' in row&&row.fillRule?{fillRule:row.fillRule}:{})};setPathPoints(node,mapPathPoints(coordinates(row),p=>toWorld(p,record)))}
  const box={x:node.x,y:node.y,width:node.width,height:node.height},a=toSource(box,record),width=Math.min(reference.pixelWidth,Math.max(1,box.width/s)),height=Math.min(reference.pixelHeight,Math.max(1,box.height/s))
  node.evidence=referenceSource(reference,{x:Math.max(0,Math.min(reference.pixelWidth-width,a.x))/reference.pixelWidth,y:Math.max(0,Math.min(reference.pixelHeight-height,a.y))/reference.pixelHeight,width:width/reference.pixelWidth,height:height/reference.pixelHeight})
  return node
}
function validateSourceScene(scene:ReconstructionScene,reference:ReferenceImage,task:Extract<ReconstructionTask,{kind:'reconstruct'}>){
  if(scene.canvas.width!==reference.pixelWidth||scene.canvas.height!==reference.pixelHeight)throw new Error('重建场景尺寸必须等于所附参考图的像素尺寸')
  const roi=sourceRoi({region:task.region,sourceWidth:scene.canvas.width,sourceHeight:scene.canvas.height})
  for(const r of scene.regions)if(r.x<roi.x-.001||r.y<roi.y-.001||r.x+r.w>roi.x+roi.w+.001||r.y+r.h>roi.y+roi.h+.001)throw new Error('重建分区超出选定原图区域')
  if(scene.nodes.some(n=>n.owner===protectedOwner))throw new Error('初次重建不能使用受保护对象标记')
  return roi
}
export function compileReconstruction(original:FigureDocument,task:Extract<ReconstructionTask,{kind:'reconstruct'}>,raw:unknown,catalogue:CatalogueEntry[]=[],cataloguePreview?:CataloguePreviewInfo) {
  const response=reconstructionResponseSchema.parse(raw),scene=response.scene,reference=referenceForReconstruction(original,task)
  if(!scene){if(response.reuse.length||response.attachments.length)throw new Error('复用素材或引线绑定必须同时提供原图场景');return {figure:null,message:response.message,used:[]}}
  if(!scene.nodes.length&&!response.reuse.length)throw new Error('没有识别到可编辑图元，请补充说明或重新选择原图区域')
  const roi=validateSourceScene(scene,reference,task)
  const area=task.destination==='new'?{width:920,height:490}:contentBounds(original.containers.find(c=>c.id===task.parentId)??(()=>{throw new Error('重建目标容器已不存在')})())
  const scale=Math.min(8,(area.width-32)/roi.w,(area.height-32)/roi.h,256/Math.max(1,...scene.nodes.map(n=>n.type==='text'?n.fontSize:1)),64/Math.max(1,...scene.nodes.map(n=>n.strokeWidth??1)))
  if(scale<.05)throw new Error('选定区域过大，请缩小原图区域后重建')
  const record:ReconstructionRecord={referenceSha256:reference.sha256,sourceWidth:reference.pixelWidth,sourceHeight:reference.pixelHeight,region:clone(task.region),origin:{x:16,y:16},scale,revision:scene.revision,regions:clone(scene.regions),warnings:response.warnings}
  let figure=createBlank();if(original.imageDrafts)figure.imageDrafts=clone(original.imageDrafts);figure.title=reference.title;figure.style={...original.style,preset:'precise'}
  figure.containers=[{id:'stage',parentId:null,role:'component',title:reference.title,x:0,y:0,width:roi.w*scale+32,height:roi.h*scale+32,visual:{fill:'none',stroke:'none'},reconstruction:record,evidence:referenceSource(reference,task.region)}]
  const composed=composeReconstructionReuse(figure,response.reuse,catalogue,reference,record,cataloguePreview);figure=composed.figure;let used:ComponentUse[]=composed.used
  const traced=scene.nodes.map((n,i)=>sceneNodeToNative(n,`rebuilt-${i+1}`,'stage',record,reference))
  for(const node of traced){const box=node;if(box.x<15.5||box.y<15.5||box.x+box.width>figure.containers[0]!.width-15.5||box.y+box.height>figure.containers[0]!.height-15.5)throw new Error(`重建对象「${node.name??node.label}」超出选定原图区域，请修正识别坐标或拆分文字`)}
  figure.nodes.push(...traced)
  figure=attachComponentLeaders(figure,catalogue,response.reuse,composed.nodeAliases,response.attachments,Object.fromEntries(scene.nodes.map((node,index)=>[node.id,traced[index]!.id])))

  const valid=parseDocument(figure)
  let candidate:FigureDocument
  if(task.destination==='new'){
    candidate=clone(valid);candidate.references=clone(original.references)
    if(original.publication)candidate.publication=clone(original.publication)
    const x=(1000-candidate.containers[0]!.width)/2,y=90
    for(const object of [...candidate.containers,...candidate.nodes])translateGeometry(object,x,y)
  }else {const asset=captureComponent(valid,'stage',reference.title,'从参考图重建的可编辑图元',['重建']),inserted=instantiateComponent(original,asset,task.parentId,true);candidate=inserted.document
    // Transplant remaps container IDs in source order. Report the actual inserted instance IDs.
    const placed=candidate.containers.slice(-valid.containers.length)
    used=used.map(use=>({...use,instanceId:placed[valid.containers.findIndex(c=>c.id===use.instanceId)]!.id}))
  }
  return {figure:parseDocument(candidate),message:response.message,used}
}
export function reconstructionGroup(doc:FigureDocument,id:string){const group=doc.containers.find(c=>c.id===id);if(!group?.reconstruction)throw new Error('请选择一组由参考图重建的图元');return group as FigureContainer&{reconstruction:ReconstructionRecord}}
export function reconstructionCandidateGroup(before:FigureDocument,after:FigureDocument,task:ReconstructionTask){
  const group=task.kind==='repair'?after.containers.find(c=>c.id===task.containerId):task.destination==='new'?after.containers.find(c=>c.parentId===null):after.containers.find(c=>c.reconstruction&&!before.containers.some(old=>old.id===c.id&&old.reconstruction))
  if(!group?.reconstruction)throw new Error('候选图没有可继续修复的重建分组')
  return reconstructionGroup(after,group.id)
}
function ownedNodes(doc:FigureDocument,groupId:string){return doc.nodes.filter(n=>n.reconstruction&&(['rectangle','ellipse'].includes(n.kind)||n.kind==='text'&&n.textLayout||n.kind==='path'&&n.path&&!n.visual?.strokeMatrix)&&ancestors(doc,n.id).find(id=>doc.containers.find(c=>c.id===id)?.reconstruction)===groupId)}
export function sceneForReconstruction(doc:FigureDocument,id:string):ReconstructionScene {
  const group=reconstructionGroup(doc,id),record=group.reconstruction,editable=new Set(ownedNodes(doc,id).map(n=>n.id)),nodes:ReconstructionNode[]=[]
  const relevant=descendants(doc,id).filter((o):o is FigureNode=>'kind' in o&&o.kind!=='port')
  for(const node of relevant){
    const a=toSource(node,record),color=figurePaint(resolveStyle(doc,node.parentId),node.visual?.colorIndex),base={id:editable.has(node.id)?node.reconstruction!.objectId:`protected-${node.id}`,owner:editable.has(node.id)?node.reconstruction!.owner:protectedOwner,version:node.reconstruction?.version??0,name:node.name??node.label.slice(0,100),fill:node.kind==='path'?pathFill(resolveStyle(doc,node.parentId),node.visual):node.visual?.fill??(['text','icon'].includes(node.kind)?'none':color.fill),stroke:node.visual?.stroke??color.ink,strokeWidth:pixel((node.visual?.strokeWidth??1.3)/record.scale),opacity:node.visual?.opacity??1,fillOpacity:node.visual?.fillOpacity??1,strokeOpacity:node.visual?.strokeOpacity??1,...(node.visual?.dash?{dash:node.visual.dash.map(n=>pixel(n/record.scale))}:{})},box={x:a.x,y:a.y,w:Math.max(.001,pixel(node.width/record.scale)),h:Math.max(.001,pixel(node.height/record.scale))}
    if(node.kind==='text'&&node.textLayout){nodes.push({...base,type:'text',...box,text:node.label,fontSize:pixel((node.textStyle?.size??16)/record.scale),fontWeight:node.textStyle?.weight??(node.textStyle?.bold?700:400),letterSpacing:pixel((node.textStyle?.letterSpacing??0)/record.scale),fontFamily:node.textStyle?.family??'Inter',fill:node.textStyle?.color??'#243247',bold:node.textStyle?.bold??(node.textStyle?.weight??400)>=600,italic:node.textStyle?.italic??false,align:node.textStyle?.align??'left',anchor:{x:node.textLayout.x,y:node.textLayout.y},matrix:node.textLayout.matrix})}
    else if(node.kind==='rectangle'||node.kind==='ellipse')nodes.push({...base,type:node.kind==='rectangle'?'rect':'ellipse',...box,...(node.kind==='rectangle'?{rx:pixel((node.visual?.radius??0)/record.scale)}:{})})
    else if(node.kind==='path'&&node.path&&!node.visual?.strokeMatrix)nodes.push({...base,type:'path',d:pointsData(mapPathPoints(pathPoints(doc,node),p=>toSource(p,record))),arrow:node.path.arrow!=='none',fillRule:node.path.fillRule})
    else nodes.push({...base,id:`protected-${node.id}`,owner:protectedOwner,type:'rect',...box})
  }
  return reconstructionSceneSchema.parse({canvas:{width:record.sourceWidth,height:record.sourceHeight},revision:record.revision,regions:clone(record.regions),nodes})
}
export function reconstructionWorkers(record:ReconstructionRecord,scene:ReconstructionScene):Worker[] {
  const roi=sourceRoi(record),local:ReconstructionScene={...scene,canvas:{width:roi.w,height:roi.h},nodes:scene.nodes.map(n=>translateNode(n,-roi.x,-roi.y)),regions:scene.regions.map(r=>({...r,x:r.x-roi.x,y:r.y-roi.y}))}
  const semantic=planSemanticRegions(local,roi.w,roi.h).map(r=>({...r,editableOwners:[...(r.editableOwners??[]),...(r.parentId?[r.parentId]:[])]}))
  const workers=[...semantic,...planDetailRegions(semantic,roi.w,roi.h)]
  return workers.map(w=>({...w,x:w.x+roi.x,y:w.y+roi.y,coreX:(w.coreX??w.x)+roi.x,coreY:(w.coreY??w.y)+roi.y,coreRight:(w.coreRight??w.x+w.w)+roi.x,coreBottom:(w.coreBottom??w.y+w.h)+roi.y,excludeRects:w.excludeRects?.map(r=>({...r,x:r.x+roi.x,y:r.y+roi.y}))})).slice(0,120)
}
export function repairContext(doc:FigureDocument,task:Extract<ReconstructionTask,{kind:'repair'}>) {
  const group=reconstructionGroup(doc,task.containerId),reference=referenceForReconstruction(doc,task)
  if(reference.pixelWidth!==group.reconstruction.sourceWidth||reference.pixelHeight!==group.reconstruction.sourceHeight)throw new Error('参考图的压缩尺寸与重建记录不同，请重新重建或使用原工程图片')
  const scene=sceneForReconstruction(doc,group.id),worker=reconstructionWorkers(group.reconstruction,scene).find(r=>r.id===task.regionId)
  if(!worker)throw new Error('所选修复分区已变化，请重新选择')
  const catalog=regionObjectCatalog(scene,worker)
  return {group,reference,scene,worker,catalog,versions:snapshotVersions(scene)}
}
export function reconstructionImageRect(doc:FigureDocument,task:ReconstructionTask){
  const reference=referenceForReconstruction(doc,task)
  if(task.kind==='reconstruct')return sourceRoi({region:task.region,sourceWidth:reference.pixelWidth,sourceHeight:reference.pixelHeight})
  const worker=repairContext(doc,task).worker;return {x:worker.x,y:worker.y,w:worker.w,h:worker.h}
}
export function validateReconstructionImage(doc:FigureDocument,task:ReconstructionTask,image:ReconstructionImageInfo){
  const reference=referenceForReconstruction(doc,task),rect=reconstructionImageRect(doc,task)
  if(image.referenceSha256!==reference.sha256)throw new Error('裁片与本轮参考图来源不匹配')
  if((['x','y','w','h'] as const).some(key=>Math.abs(rect[key]-image.sourceRect[key])>.00001))throw new Error('裁片范围与本轮重建分区不匹配，请重新生成裁片')
  if(image.originalWidth*image.originalHeight>24_000_000)throw new Error('裁片原图尺寸超过限制')
}
/** Exact diagonal coordinate projection, including glyph matrices and rotated geometry. */
export function projectReconstructionNode(row:ReconstructionNode,sx:number,sy:number,dx=0,dy=0):ReconstructionNode{
  const factor=Math.sqrt(sx*sy),map=(p:{x:number;y:number})=>({x:p.x*sx+dx,y:p.y*sy+dy})
  const base=Object.fromEntries(Object.entries(row).filter(([key])=>['id','owner','version','name','fill','stroke','strokeWidth','opacity','fillOpacity','strokeOpacity','dash'].includes(key)))
  if(row.strokeWidth!==undefined)base.strokeWidth=row.strokeWidth*factor
  if(row.dash)base.dash=row.dash.map(v=>v*factor)
  if(row.type==='line')return {...base,type:'line',...map(row),x2:row.x2*sx+dx,y2:row.y2*sy+dy,...(row.arrow!==undefined?{arrow:row.arrow}:{})} as ReconstructionNode
  if(row.type==='path'||row.type==='polyline'||(row.type==='rect'||row.type==='ellipse')&&(row.rotation||row.type==='rect'&&row.rx&&Math.abs(sx-sy)>1e-10))return {...base,type:'path',d:pointsData(mapPathPoints(coordinates(row),map)),...('arrow' in row?{arrow:row.arrow}:{}),...('fillRule' in row?{fillRule:row.fillRule}:{})} as ReconstructionNode
  if(row.type==='rect'||row.type==='ellipse')return {...base,type:row.type,...map(row),w:row.w*sx,h:row.h*sy,...(row.type==='rect'&&row.rx!==undefined?{rx:row.rx*sx}:{})} as ReconstructionNode
  const text=row as Extract<ReconstructionNode,{type:'text'}>,angle=(text.rotation??0)*Math.PI/180,matrix=text.matrix??[Math.cos(angle),Math.sin(angle),-Math.sin(angle),Math.cos(angle)]
  const anchor=map(text.anchor?{x:text.x+text.w*text.anchor.x,y:text.y+text.h*text.anchor.y}:transform({x:text.x+text.w*(text.align==='center'?.5:text.align==='right'?1:0),y:text.y+text.h/2+text.fontSize*.3},parseTransform(`rotate(${text.rotation??0} ${text.x+text.w/2} ${text.y+text.h/2})`)))
  const corner=map(text),x=Math.min(corner.x,anchor.x),y=Math.min(corner.y,anchor.y),w=Math.max(corner.x+text.w*sx,anchor.x)-x,h=Math.max(corner.y+text.h*sy,anchor.y)-y
  return {...base,type:'text',x,y,w,h,text:text.text,fontSize:text.fontSize*factor,...(text.letterSpacing!==undefined?{letterSpacing:text.letterSpacing*factor}:{}),...Object.fromEntries(Object.entries(text).filter(([key])=>['fontFamily','fontWeight','bold','italic','align'].includes(key))),anchor:{x:(anchor.x-x)/w,y:(anchor.y-y)/h},matrix:[matrix[0]!*sx/factor,matrix[1]!*sy/factor,matrix[2]!*sx/factor,matrix[3]!*sy/factor]} as ReconstructionNode
}
export function inheritRepairFormats(response:ReturnType<typeof repairResponseSchema.parse>,nodes:ReconstructionNode[]){
  for(const operation of response.patch.operations)if(operation.op==='update'){
    const before=nodes.find(n=>n.id===operation.id)
    if(before){const keep:Record<string,unknown>={};for(const key of ['name','fill','stroke','strokeWidth','opacity','fillOpacity','strokeOpacity','dash',...(before.type===operation.node.type?['rx','rotation','fontFamily','fontWeight','letterSpacing','bold','italic','align','anchor','matrix','arrow','fillRule']:[])])if(key in before)keep[key]=before[key as keyof ReconstructionNode]
      if(before.type==='text'&&operation.node.type==='text'){
        if(operation.node.bold!==undefined&&operation.node.fontWeight===undefined&&operation.node.bold!==before.bold)keep.fontWeight=operation.node.bold?700:400
        if(operation.node.fontWeight!==undefined&&operation.node.bold===undefined)keep.bold=operation.node.fontWeight>=600
      }
      operation.node=reconstructionNodeSchema.parse({...keep,...operation.node})}
  }
  return response
}
export function compileReconstructionRepair(original:FigureDocument,task:Extract<ReconstructionTask,{kind:'repair'}>,raw:unknown){
  const context=repairContext(original,task),response=inheritRepairFormats(repairResponseSchema.parse(raw),context.catalog.nodes)
  for(const operation of response.patch.operations){const rows='node' in operation?[operation.node]:'nodes' in operation?operation.nodes:[];for(const row of rows)if(row.type==='path'||row.type==='polyline')coordinates(row)}
  const result=applyRegionPatch(context.scene,context.worker,response.patch,context.versions)
  if(result.conflicts.length||result.rejected.length)throw new Error(`局部修复未应用：${[...new Set([...result.conflicts,...result.rejected].map(r=>r.reason))].join('、')}；请遵守对象版本、分区和只读上下文范围`)
  if(JSON.stringify(result.scene.nodes)===JSON.stringify(context.scene.nodes))return {figure:null,message:response.message+(result.ignored.length?`（已忽略 ${result.ignored.length} 项重复或越界补充）`:''),used:[]}
  const candidate=clone(original),group=reconstructionGroup(candidate,task.containerId),mapped=new Map(ownedNodes(candidate,group.id).map(n=>[n.reconstruction!.objectId,n])),manualIds=new Set(context.scene.nodes.filter(n=>n.owner===protectedOwner).map(n=>n.id)),taken=new Set([...candidate.nodes,...candidate.containers,...candidate.edges].map(n=>n.id))
  const proposedOwner=context.scene.regions.find(r=>r.id===context.worker.id)?.id??context.worker.parentRegionId??context.worker.parentId
  const canonicalOwner=context.scene.regions.find(r=>r.id===proposedOwner)?.id
  const changed=result.scene.nodes.filter(n=>!manualIds.has(n.id)).map(n=>({...n,owner:n.owner===context.worker.id?canonicalOwner:n.owner}))
  const beforeIds=new Set([...mapped.values()].map(n=>n.id)),next:FigureNode[]=[]
  for(const row of changed){const previous=mapped.get(row.id);let id=previous?.id??`rebuilt-${crypto.randomUUID()}`;while(!previous&&taken.has(id))id=`rebuilt-${crypto.randomUUID()}`;taken.add(id)
    const native=sceneNodeToNative(row,id,previous?.parentId??group.id,group.reconstruction,context.reference)
    if(previous&&JSON.stringify(row)===JSON.stringify(context.scene.nodes.find(n=>n.id===row.id)))next.push(previous)
    else {if(previous){native.chart=previous.chart;if(native.path&&previous.path)native.path={...native.path,...(previous.path.start?{start:previous.path.start}:{}),...(previous.path.end?{end:previous.path.end}:{})}}next.push(native)}
  }
  const subtree=new Map(descendants(candidate,group.id).filter((o):o is FigureNode=>'kind' in o&&o.kind!=='port').map(n=>[n.id,n])),rebuilt=new Map(next.map(n=>[n.reconstruction!.objectId,n])),protectedNodes=new Map([...subtree.values()].filter(n=>!beforeIds.has(n.id)).map(n=>[`protected-${n.id}`,n]))
  const ordered=result.scene.nodes.map(row=>protectedNodes.get(row.id)??rebuilt.get(row.id)).filter((n):n is FigureNode=>!!n)
  let inserted=false;candidate.nodes=candidate.nodes.flatMap(n=>{if(!subtree.has(n.id))return[n];if(inserted)return[];inserted=true;return ordered})
  if(!inserted)candidate.nodes.push(...ordered)
  group.reconstruction.revision=result.scene.revision
  return {figure:parseDocument(candidate),message:response.message+(result.ignored.length?`（已忽略 ${result.ignored.length} 项重复或越界补充）`:''),used:[]}
}
export function parseReconstructionResponse(text:string,original:FigureDocument,task:ReconstructionTask,image?:ReconstructionImageInfo,catalogue:CatalogueEntry[]=[],cataloguePreview?:CataloguePreviewInfo){let value:unknown;try{value=JSON.parse(text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/,'$1'))}catch{throw new Error('重建结果必须是完整 JSON，当前画布未改变')}
  try{
    if(image){validateReconstructionImage(original,task,image);const rect=image.sourceRect,sx=rect.w/image.width,sy=rect.h/image.height
      if(task.kind==='reconstruct'){
        const result=reconstructionResponseSchema.parse(value)
        if(result.scene){if(result.scene.canvas.width!==image.width||result.scene.canvas.height!==image.height)throw new Error('模型场景尺寸必须等于本轮裁片尺寸');const reference=referenceForReconstruction(original,task);result.scene={...result.scene,canvas:{width:reference.pixelWidth,height:reference.pixelHeight},nodes:result.scene.nodes.map(n=>projectReconstructionNode(n,sx,sy,rect.x,rect.y)),regions:result.scene.regions.map(r=>({...r,x:rect.x+r.x*sx,y:rect.y+r.y*sy,w:r.w*sx,h:r.h*sy}))}}
        result.reuse=result.reuse.map(row=>({...row,x:rect.x+row.x*sx,y:rect.y+row.y*sy,w:row.w*sx,h:row.h*sy}));value=result
      }else{
        const context=repairContext(original,task),catalog=context.catalog.nodes.map(n=>projectReconstructionNode(n,1/sx,1/sy)),result=inheritRepairFormats(repairResponseSchema.parse(value),catalog)
        for(const op of result.patch.operations){if('node' in op)op.node=projectReconstructionNode(op.node,sx,sy);if('nodes' in op)op.nodes=op.nodes.map(n=>projectReconstructionNode(n,sx,sy))}value=result
      }
    }
    return task.kind==='reconstruct'?compileReconstruction(original,task,value,catalogue,cataloguePreview):compileReconstructionRepair(original,task,value)
  }catch(error){if(error instanceof Error&&'issues' in error){const messages=(error.issues as {message:string}[]).map(i=>i.message);throw new Error(`重建结果未通过对象与几何校验：${[...new Set(messages)].slice(0,3).join('；')}`,{cause:error})}throw error}}
