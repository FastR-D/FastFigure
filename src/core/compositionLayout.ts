import {ancestors,contains,contentBounds} from './geometry.ts'
import {rootContainer,type FigureDocument} from './model.ts'
import type {CompositionPlan} from './compositionPlanContract.ts'

/** Verify the declared region geometry and explicit relations; never infer scientific correctness. */
export function validateCompositionLayout(plan:CompositionPlan,figure:FigureDocument){
  if(!plan.sections.some(s=>s.design))return // Previously saved plans have prose-only layouts.
  const area=contentBounds(rootContainer(figure)),frames=new Map<string,string>()
  for(const section of plan.sections){
    const planned=section.design!.frame,frame=figure.containers.find(c=>c.id===planned.id)
    if(!frame||frame.parentId!=='stage')throw new Error(`候选缺少方案的根级分区框：${planned.id}`)
    const expected={x:area.x+planned.x*area.width,y:area.y+planned.y*area.height,width:planned.width*area.width,height:planned.height*area.height}
    if((['x','y','width','height'] as const).some(key=>Math.abs(frame[key]-expected[key])>2))throw new Error(`候选分区位置或比例与采用方案不符：${section.title}`)
    for(const component of section.components)if(component.id!==frame.id&&!ancestors(figure,component.id).includes(frame.id))throw new Error(`候选组件未放入指定分区：${component.id}`)
    if(!figure.nodes.some(n=>n.kind!=='port'&&ancestors(figure,n.id).includes(frame.id)))throw new Error(`方案分区没有可见内容：${section.title}`)
    frames.set(section.id,frame.id)
  }
  const belongs=(id:string,sectionId:string)=>{
    const frameId=frames.get(sectionId)!,object=[...figure.nodes,...figure.containers].find(n=>n.id===id)
    if(!object)return false
    if(id===frameId||ancestors(figure,id).includes(frameId))return true
    // Annotation frames may be siblings of their source; accept only fully enclosed geometry.
    return 'kind'in object&&object.kind!=='port'&&contains(figure.containers.find(c=>c.id===frameId)!,object)
  }
  for(const link of plan.connections){
    if(link.kind!=='dataflow'&&link.kind!=='feedback'&&link.kind!=='detail'&&link.kind!=='parameter-transfer')continue
    const forward=(a:string,b:string)=>belongs(a,link.from)&&belongs(b,link.to)
    const paths=figure.nodes.filter(n=>n.path?.start&&n.path.end&&n.visual?.stroke!=='none'&&n.visual?.strokeOpacity!==0&&n.visual?.opacity!==0)
    const transfer=link.kind==='parameter-transfer'
    const found=transfer
      ?figure.edges.some(e=>e.appearance?.dash?.some(v=>v>0)&&(((e.appearance.arrow??'filled')!=='none'&&(e.appearance.startArrow??'none')==='none'&&forward(e.source,e.target))||((e.appearance.startArrow??'none')!=='none'&&(e.appearance.arrow??'filled')==='none'&&forward(e.target,e.source))))||paths.some(n=>n.visual?.dash?.some(v=>v>0)&&((n.path!.arrow!=='none'&&(n.path!.startArrow??'none')==='none'&&forward(n.path!.start!.nodeId,n.path!.end!.nodeId))||((n.path!.startArrow??'none')!=='none'&&n.path!.arrow==='none'&&forward(n.path!.end!.nodeId,n.path!.start!.nodeId))))
      :link.kind==='detail'
      ?paths.some(n=>n.path!.arrow==='none'&&(!n.path!.startArrow||n.path!.startArrow==='none')&&(forward(n.path!.start!.nodeId,n.path!.end!.nodeId)||forward(n.path!.end!.nodeId,n.path!.start!.nodeId)))
      :figure.edges.some(e=>((e.appearance?.arrow??'filled')!=='none'&&forward(e.source,e.target))||((e.appearance?.startArrow??'none')!=='none'&&forward(e.target,e.source)))||paths.some(n=>(n.path!.arrow!=='none'&&forward(n.path!.start!.nodeId,n.path!.end!.nodeId))||(n.path!.startArrow!==undefined&&n.path!.startArrow!=='none'&&forward(n.path!.end!.nodeId,n.path!.start!.nodeId)))
    if(!found)throw new Error(`候选缺少方案声明的${transfer?'单向虚线参数迁移连接':link.kind==='detail'?'无箭头局部对应引线':'有向跨区连接'}：${link.from} → ${link.to}`)
  }
}
