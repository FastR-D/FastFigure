import {clone,parseDocument,type FigureDocument} from './model.ts'
import {ancestors,contains,contentBounds,findObject,topLevelSelection} from './geometry.ts'
import {syncBindings} from './paths.ts'
import {routeFigure} from './routing.ts'
import {snapshotEdgeWaypoints,reframeEdgeWaypoints} from './edgeWaypoints.ts'

/** Match frames exactly. Never scale glyphs, silently clamp sizes or detach bindings. */
export function matchMaterialSize(doc:FigureDocument,input:{sourceId:string;objectIds:string[];dimension:'width'|'height'|'both';anchor:'center'|'top-left'}){
  const source=findObject(doc,input.sourceId)
  if(!source||'kind'in source&&['path','port'].includes(source.kind)||source.width<=0||source.height<=0)throw new Error('请选择有宽高的普通图元或容器作为尺寸样本')
  for(const id of input.objectIds)if(!findObject(doc,id))throw new Error(`尺寸目标已不存在：${id}`)
  const targets=topLevelSelection(doc,input.objectIds),original=clone(doc),pins=snapshotEdgeWaypoints(doc),skipped:string[]=[];let changed=0
  for(const target of targets){
    if(target.id===source.id)continue
    const protectedObject=[target.id,...ancestors(doc,target.id)].some(id=>{const c=doc.containers.find(o=>o.id===id);return c?.dataChart||c?.sharedLegend||c?.sharedColorbar})
    if(!target.parentId||protectedObject||'kind'in target&&(target.chart||target.interfaceFor||['path','port'].includes(target.kind)||target.textLayout)){
      skipped.push(`${target.id}：保留根画板、接口、路径、定位文字或图表管理对象`);continue
    }
    const width=input.dimension==='height'?target.width:source.width,height=input.dimension==='width'?target.height:source.height
    const next={x:input.anchor==='center'?target.x+(target.width-width)/2:target.x,y:input.anchor==='center'?target.y+(target.height-height)/2:target.y,width,height}
    const parent=doc.containers.find(c=>c.id===target.parentId)!
    if(!contains(contentBounds(parent),next))throw new Error(`「${'kind'in target?target.label:target.title}」匹配尺寸后超出父容器；请换基点或先留出空间`)
    if(JSON.stringify({x:target.x,y:target.y,width:target.width,height:target.height})!==JSON.stringify(next)){Object.assign(target,next);changed++}
  }
  reframeEdgeWaypoints(doc,pins)
  syncBindings(doc)
  try{parseDocument(doc)}catch(error){throw new Error('匹配尺寸无法容纳内部对象、指定折点或组件尺寸约束；请换样本或先调整内容',{cause:error})}
  const clear=[...routeFigure(original)].filter(([,route])=>route.status==='clear'),routes=routeFigure(doc)
  if(clear.some(([id])=>routes.get(id)?.status==='blocked'))throw new Error('匹配尺寸会阻塞已有连接，请先留出连线空间')
  return{objectIds:targets.map(o=>o.id),changed,skipped}
}
