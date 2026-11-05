import { clone, parseDocument, type FigureDocument, type FigureNode } from './model.ts'
import { childrenOf, contains, contentBounds, parentOf, resolveStyle } from './geometry.ts'
import { figurePaint } from './paint.ts'
import { nodeStructure, structureLabels, structurePreset } from './structures.ts'
import { structureParts, structuredNodeLayout } from './structureVisual.ts'
import { basisNode, scaleNodeMetrics } from './scaling.ts'
import { setPathPoints, syncBindings, type PathPoint } from './paths.ts'

export function expandStructure(input: FigureDocument, nodeId: string) {
  const doc=clone(input),original=doc.nodes.find(n=>n.id===nodeId),structure=original&&nodeStructure(original)
  if(!original||!structure) throw new Error('请选择带内部结构的科研组件')
  if(doc.containers.length>=21) throw new Error('当前最多支持 20 个子容器，请先合并或移除其他分组')
  const units=original.metricScale??1,actual={...original,width:Math.max(184*units,original.width),height:Math.max(structurePreset(structure.type).height*units,original.height)},node=units===1?actual:basisNode(actual)
  const parent=parentOf(doc,nodeId)!
  if(!contains(contentBounds(parent),actual)) throw new Error('转换需要可读尺寸，请先为组件留出空间或扩大父容器')
  if(childrenOf(doc,parent.id).filter(o=>o.id!==nodeId).some(o=>actual.x<o.x+o.width+8&&actual.x+actual.width+8>o.x&&actual.y<o.y+o.height+8&&actual.y+actual.height+8>o.y)) throw new Error('转换后会覆盖其他对象，请先移动周边对象')
  const used=new Set([...doc.nodes,...doc.edges,...doc.containers].map(o=>o.id))
  function unique(base:string) {base=base.slice(0,70);let id=base,i=0;while(used.has(id))id=`${base}-${++i}`;used.add(id);return id}
  const containerId=unique(`expanded-${node.id}`),paint=figurePaint(resolveStyle(doc,node.parentId),node.visual?.colorIndex)
  const layout=structuredNodeLayout(node),labels=structureLabels(structure),parts=structureParts(node,layout.area,{...paint,ink:node.visual?.stroke??paint.ink},true)
  if(layout.area.height<30||!parts.length)throw new Error('标题字号或内容占用过大，请先减小标题字号或缩短注释，再转换内部结构')
  const generated:FigureNode[]=[]
  function text(key:string,label:string,x:number,y:number,width:number,height:number,style:FigureNode['textStyle']) {
    generated.push({id:unique(`${containerId}-${key}`),kind:'text',label,parentId:containerId,x,y,width,height,textStyle:style,visual:{padding:0,fill:'none',stroke:'none',opacity:node.visual?.opacity??1}})
  }
  const titleAlign=node.textStyle?.align??'center',titleWidth=node.width-20-((structure.repeats??1)>1?24:0)-(node.iconId&&node.iconId!=='none'?22:0)
  const titleX=titleAlign==='left'?node.x+(node.iconId&&node.iconId!=='none'?32:10):titleAlign==='right'?node.x+node.width-10-titleWidth:node.x+(node.width-titleWidth)/2
  text('title',node.label,titleX,node.y+8,titleWidth,layout.header-8,{align:'center',...node.textStyle,size:layout.size})
  if(node.description) {const h=layout.bodySize*1.3;text('annotation',node.description,node.x+10,node.y+node.height-8-h/2-layout.bodySize*.375,node.width-20,h,{size:layout.bodySize,color:'#667085',align:'center',...node.descriptionStyle})}
  if((structure.repeats??1)>1) {text('repeat',`×${structure.repeats}`,node.x+node.width-32,node.y+4,24,14,{size:10,align:'right'});generated.at(-1)!.visual={...generated.at(-1)!.visual,colorIndex:node.visual?.colorIndex,textTone:'ink'}}
  if(node.iconId&&node.iconId!=='none') generated.push({id:unique(`${containerId}-icon`),kind:'icon',label:'',parentId:containerId,x:node.x+8,y:node.y+8,width:16,height:16,iconId:node.iconId,visual:{padding:0,colorIndex:node.visual?.colorIndex,stroke:node.visual?.stroke,opacity:node.visual?.opacity??1}})
  const native=new Map<string,FigureNode>()
  for(const part of parts) {
    const shape:FigureNode={id:unique(`${containerId}-${part.key}`),parentId:containerId,kind:part.kind==='line'?'path':part.kind==='box'?'rectangle':part.kind==='ellipse'?'ellipse':'text',
      label:part.labelIndex===undefined?'':labels[part.labelIndex]??'',x:node.x+part.x,y:node.y+part.y,width:part.width,height:part.height,
      visual:{role:'detail',...(part.fill==='none'?{fill:'none' as const}:part.fill===paint.fill||part.fill===paint.hatch?{tone:part.fill===paint.hatch?'hatch' as const:'fill' as const}:{fill:part.fill}),...(part.stroke==='none'?{stroke:'none' as const}:node.visual?.stroke?{stroke:node.visual.stroke}:{}),colorIndex:node.visual?.colorIndex,textTone:part.kind==='box'?'deep':'ink',radius:part.radius??0,strokeWidth:1,opacity:(part.opacity??1)*(node.visual?.opacity??1),padding:0,handDrawn:false},
      textStyle:{family:node.textStyle?.family??'Inter',size:part.fontSize??11,align:'center'}}
    if(part.kind==='line') {
      shape.label=part.key.startsWith('residual')?'残差旁路':part.key.startsWith('connection')?'神经元连接':'结构线段'
      shape.path={points:[{x:0,y:0},{x:1,y:1}],arrow:part.arrow?'open':'none'}
      setPathPoints(shape,part.points!.map(p=>({x:node.x+p.x,y:node.y+p.y})))
    }
    native.set(part.key,shape);generated.push(shape)
  }
  const shapes=[...native.values()].filter(n=>n.kind==='rectangle'||n.kind==='ellipse')
  function binding(point:PathPoint) {
    const candidates=shapes.map(shape=>{
      const x=Math.max(shape.x,Math.min(shape.x+shape.width,point.x)),y=Math.max(shape.y,Math.min(shape.y+shape.height,point.y))
      return {shape,x,y,distance:Math.hypot(point.x-x,point.y-y)}
    }).filter(c=>c.distance<=5).sort((a,b)=>a.distance-b.distance||a.shape.width*a.shape.height-b.shape.width*b.shape.height)
    const near=candidates[0]
    return near?{nodeId:near.shape.id,x:Math.max(0,Math.min(1,(near.x-near.shape.x)/near.shape.width)),y:Math.max(0,Math.min(1,(near.y-near.shape.y)/near.shape.height)),offsetX:point.x-near.x,offsetY:point.y-near.y}:undefined
  }
  for(const part of parts) if(part.kind==='line') {
    const path=native.get(part.key)!,points=part.points!.map(p=>({x:node.x+p.x,y:node.y+p.y}))
    path.path!.start=binding(points[0]!);path.path!.end=binding(points.at(-1)!)
  }
  if(doc.nodes.length+generated.length>240) throw new Error(`转换后共有 ${doc.nodes.length+generated.length} 个图元，超过工程的 240 个上限；请先拆分工程`)
  if(units!==1)for(const shape of generated){scaleNodeMetrics(shape,units,doc);shape.x=node.x+(shape.x-node.x)*units;shape.y=node.y+(shape.y-node.y)*units;shape.width*=units;shape.height*=units}
  doc.containers.push({...(units!==1?{metricScale:units}:{}),id:containerId,parentId:node.parentId,title:node.label,role:'component',x:actual.x,y:actual.y,width:actual.width,height:actual.height,
    visual:{...actual.visual,radius:actual.visual?.radius??7*units},structureOrigin:clone(structure),...(node.evidence?{evidence:clone(node.evidence)}:{})})
  // The original ID remains the externally bound interface. Internal edits never rebind external edges.
  const index=doc.nodes.findIndex(n=>n.id===node.id)
  doc.nodes.splice(index,1,{id:node.id,kind:'port',label:node.label,parentId:containerId,interfaceFor:containerId,x:actual.x,y:actual.y,width:actual.width,height:actual.height})
  doc.nodes.push(...generated);syncBindings(doc)
  return {document:parseDocument(doc),containerId,nodeCount:generated.length,paths:generated.filter(n=>n.kind==='path').length}
}
