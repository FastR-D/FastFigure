import {clone,parseDocument,rootContainer,type FigureDocument,type FigureNode,type ComponentSource} from './model.ts'
import {ancestors,childrenOf,contains,contentBounds,findObject,topLevelSelection,type Rect} from './geometry.ts'
import {prepareObjectSelection} from './componentCapture.ts'
import {instantiateComponentAt,parseAsset,scaleComponent} from './assets.ts'
import {detailInsetRequestSchema,nativeDetailSourceSchema,type DetailInsetRequest} from './detailInsetContract.ts'
import {pathPoints,setPathPoints} from './paths.ts'
import {segmentHitsRect} from './routing.ts'
import {checkFigureText} from './figureTextCheck.ts'

const overlaps=(a:Rect,b:Rect)=>a.x<b.x+b.width-1e-7&&a.x+a.width>b.x+1e-7&&a.y<b.y+b.height-1e-7&&a.y+a.height>b.y+1e-7
/** Snapshot selected native objects. The original graph is unchanged; guides bind only to annotation frames. */
export function createDetailInset(input:FigureDocument,raw:DetailInsetRequest){
  const request=detailInsetRequestSchema.parse(raw),baseKey=JSON.stringify(input),source=parseDocument(clone(input)),roots=topLevelSelection(source,request.objectIds),parent=source.containers.find(c=>c.id===request.parentId)
  if(request.objectIds.some(id=>!findObject(source,id))||roots.some(object=>!object.parentId||'interfaceFor'in object&&object.interfaceFor))throw new Error('请选择原生图元或组件；根画板和独立接口不能作为放大选区')
  if(!parent||!roots.every(object=>ancestors(source,object.id).includes(parent.id)))throw new Error('放大视图须放在所选对象共同的外层容器')
  const title=roots.length===1&&!('kind'in roots[0]!)?roots[0]!.title:'Selected detail',prepared=prepareObjectSelection(source,request.objectIds,{name:title,description:'选中原生对象的当前快照；保留科学内容、内部结构和局部外观。',tags:'detail, snapshot',sources:[]}),{requestedIds,objectIds,omittedEdgeIds,detachedEndpoints}=prepared.selection,record=nativeDetailSourceSchema.parse({version:1,sourceTitle:source.title,capturedAt:new Date().toISOString(),requestedIds,objectIds,omittedEdgeIds,detachedEndpoints,scale:request.scale})
  // Native object IDs are historical identifiers, not live references to the current canvas.
  const evidence:ComponentSource={title:`局部快照 · ${source.title}`.slice(0,100),reference:`选中 ${record.requestedIds.length} 项、展开 ${record.objectIds.length} 个源对象；按当前尺寸 ×${request.scale} 复制。源图后续编辑不自动同步，区域和字号不是新观测。`,nativeDetail:record}
  prepared.asset.sources.push(evidence)
  const asset=scaleComponent(parseAsset(prepared.asset),request.scale),frame=rootContainer(asset.figure),area=contentBounds(parent),anchor=prepared.asset.figure.nodes.find(n=>n.kind!=='port'&&source.nodes.some(original=>original.id===n.id))!,original=source.nodes.find(n=>n.id===anchor.id)!,capture=rootContainer(prepared.asset.figure),origin={x:original.x-anchor.x,y:original.y-anchor.y}
  const region={x:Math.max(area.x,origin.x),y:Math.max(area.y,origin.y),width:Math.min(area.x+area.width,origin.x+capture.width)-Math.max(area.x,origin.x),height:Math.min(area.y+area.height,origin.y+capture.height)-Math.max(area.y,origin.y)}
  if(region.width<=0||region.height<=0)throw new Error('选区外框为空，请选择有可见范围的对象')
  const width=Math.max(180,frame.width+16),height=frame.height+52,occupied=childrenOf(source,parent.id).filter(object=>!('interfaceFor'in object&&object.interfaceFor===parent.id)),available=(p:{x:number;y:number})=>{const rect={...p,width,height};return contains(area,rect)&&!occupied.some(object=>overlaps(rect,object))}
  const xs=[area.x,...occupied.map(o=>o.x+o.width+16)],ys=[area.y,...occupied.map(o=>o.y+o.height+16)],candidates=xs.flatMap(x=>ys.map(y=>({x,y}))).filter(available).sort((a,b)=>Math.hypot(a.x+width/2-region.x-region.width/2,a.y+height/2-region.y-region.height/2)-Math.hypot(b.x+width/2-region.x-region.width/2,b.y+height/2-region.y-region.height/2)),position=request.position??candidates[0]
  if(!position||!available(position))throw new Error('放大视图没有足够空位或指定位置与已有对象重叠，请减小倍率、调整位置或先留出空白')
  let index=1;while([...source.containers,...source.nodes,...source.edges].some(o=>o.id.startsWith(`detail-${index}-`)))index++
  const prefix=`detail-${index}`,ownerId=`${prefix}-group`,copyId=`${prefix}-copy`,copyX=position.x+(width-frame.width)/2,copyY=position.y+44
  source.containers.push({id:ownerId,parentId:parent.id,role:'component',title:request.caption,...position,width,height,visual:{fill:'none',stroke:'none'},evidence})
  const inserted=instantiateComponentAt(source,asset,ownerId,{x:copyX,y:copyY},copyId,true),figure=inserted.document
  const visual={fill:'none',stroke:'#7867a6',strokeWidth:1.2,handDrawn:false,dash:[5,3]}
  const sourceFrame:FigureNode={id:`${prefix}-source`,name:'原图选区（快照）',kind:'rectangle',label:'',parentId:parent.id,...region,visual},detailFrame:FigureNode={id:`${prefix}-frame`,name:'放大内容外框',kind:'rectangle',label:'',parentId:ownerId,x:copyX-2,y:copyY-2,width:frame.width+4,height:frame.height+4,visual:clone(visual)},caption:FigureNode={id:`${prefix}-caption`,kind:'text',label:`${request.caption} · ×${request.scale} 快照`,parentId:ownerId,x:position.x+8,y:position.y+6,width:width-16,height:32,textStyle:{size:14,bold:true,align:'center'},visual:{fill:'none',stroke:'none',padding:0}}
  figure.nodes.push(sourceFrame,detailFrame,caption)
  const guideIds:string[]=[],dx=detailFrame.x+detailFrame.width/2-region.x-region.width/2,dy=detailFrame.y+detailFrame.height/2-region.y-region.height/2,horizontal=Math.abs(dx)>=Math.abs(dy)
  if(request.guides)for(let i=0;i<2;i++){
    const a=horizontal?{x:dx>=0?1:0,y:i}:{x:i,y:dy>=0?1:0},b=horizontal?{x:dx>=0?0:1,y:i}:{x:i,y:dy>=0?0:1},points=[{x:sourceFrame.x+a.x*sourceFrame.width,y:sourceFrame.y+a.y*sourceFrame.height},{x:detailFrame.x+b.x*detailFrame.width,y:detailFrame.y+b.y*detailFrame.height}],id=`${prefix}-guide-${i}`,node:FigureNode={id,kind:'path',label:'',name:'快照对应引线',parentId:parent.id,x:0,y:0,width:0,height:0,path:{points:[{x:0,y:0},{x:1,y:1}],arrow:'none',start:{nodeId:sourceFrame.id,...a},end:{nodeId:detailFrame.id,...b}},visual:{...visual,strokeWidth:1,dash:[4,3]}};setPathPoints(node,points);figure.nodes.push(node);guideIds.push(id)
  }
  const result=parseDocument(figure),captionIssue=checkFigureText(result).issues.find(issue=>issue.nodeId===caption.id)
  if(captionIssue)throw new Error('放大标题在当前宽度内放不下，请缩短标题或选择更宽的局部')
  const kept=new Set(prepared.selection.objectIds),crossed=new Set(guideIds.flatMap(id=>{const points=pathPoints(result,result.nodes.find(n=>n.id===id)!);return source.nodes.filter(n=>!kept.has(n.id)&&n.kind!=='port'&&n.kind!=='path'&&segmentHitsRect(points[0]!,points[1]!,n)).map(n=>n.id)}))
  return{figure:result,baseKey,ownerId,copyId,sourceFrameId:sourceFrame.id,detailFrameId:detailFrame.id,guideIds,aliases:inserted.nodeIds,record,omittedEdgeIds:prepared.selection.omittedEdgeIds,detachedEndpoints:prepared.selection.detachedEndpoints,crossedObjectIds:[...crossed],summary:`已按 ×${request.scale} 复制 ${prepared.selection.objectIds.length} 个原生源对象为独立局部快照，源图与外部连接保持；${prepared.selection.omittedEdgeIds.length} 条外部边不复制、${prepared.selection.detachedEndpoints.length} 个外部路径端点解除绑定${crossed.size?`；对应引线经过 ${crossed.size} 个未选对象，请核对`:'。'}源图后续编辑不自动同步。`}
}
