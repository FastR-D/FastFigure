import {z} from 'zod'
import {clone,parseDocument,nodeSchema,figureDocumentSchema,type FigureDocument} from './model.ts'
import {figurePatchKey} from './figurePatch.ts'

const id=nodeSchema.shape.id,token=z.string().regex(/^[a-f0-9]{16}$/)
export const figurePreviewDeltaSchema=z.object({
  base:token,result:token,
  nodes:z.array(nodeSchema.omit({image:true})).max(240),containers:z.array(figureDocumentSchema.shape.containers.element).max(21),edges:z.array(figureDocumentSchema.shape.edges.element).max(120),
  removedNodes:z.array(id).max(240),removedContainers:z.array(id).max(21),removedEdges:z.array(id).max(120),
  clearedImages:z.array(id).max(240),
  order:z.object({nodes:z.array(id).max(240),containers:z.array(id).max(21),edges:z.array(id).max(120)}).strict(),
  style:figureDocumentSchema.shape.style.optional(),title:figureDocumentSchema.shape.title.optional(),styleUses:figureDocumentSchema.shape.styleUses,
}).strict()
type FigurePreviewDelta=z.infer<typeof figurePreviewDeltaSchema>

/** Transport resolved geometry, not layout instructions or repeated image bytes. */
export function createFigurePreviewDelta(before:FigureDocument,after:FigureDocument):FigurePreviewDelta{
  const changed=<T extends {id:string}>(a:T[],b:T[])=>{const old=new Map(a.map(v=>[v.id,JSON.stringify(v)]));return b.filter(v=>old.get(v.id)!==JSON.stringify(v))}
  const removed=(a:{id:string}[],b:{id:string}[])=>{const ids=new Set(b.map(v=>v.id));return a.filter(v=>!ids.has(v.id)).map(v=>v.id)}
  const previousImages=new Map(before.nodes.flatMap(node=>node.image?[[node.id,node.image]]:[]))
  const clearedImages:string[]=[]
  const nodes=changed(before.nodes,after.nodes).map(node=>{
    const previousImage=previousImages.get(node.id)
    if(node.image&&JSON.stringify(node.image)!==JSON.stringify(previousImage))throw new Error('流式预览不能传输新增或替换的图片字节')
    if(!node.image&&previousImage)clearedImages.push(node.id)
    const resolved={...node};delete resolved.image;return resolved
  })
  return{base:figurePatchKey(before),result:figurePatchKey(after),nodes,containers:changed(before.containers,after.containers),edges:changed(before.edges,after.edges),removedNodes:removed(before.nodes,after.nodes),removedContainers:removed(before.containers,after.containers),removedEdges:removed(before.edges,after.edges),clearedImages,order:{nodes:after.nodes.map(n=>n.id),containers:after.containers.map(c=>c.id),edges:after.edges.map(e=>e.id)},...(JSON.stringify(before.style)!==JSON.stringify(after.style)?{style:after.style}:{}),...(before.title!==after.title?{title:after.title}:{}),...(JSON.stringify(before.styleUses)!==JSON.stringify(after.styleUses)?{styleUses:after.styleUses}:{})}
}

export function applyFigurePreviewDelta(before:FigureDocument,input:unknown):FigureDocument{
  const delta=figurePreviewDeltaSchema.parse(input)
  if(figurePatchKey(before)!==delta.base)throw new Error('流式预览基准不一致，请恢复事件流')
  const merge=<T extends {id:string}>(old:T[],updates:T[],removed:string[],order:string[])=>{
    const ids=new Set(removed),next=new Map(old.filter(v=>!ids.has(v.id)).map(v=>[v.id,v]));for(const value of updates)next.set(value.id,value)
    if(order.length!==next.size||new Set(order).size!==order.length||order.some(id=>!next.has(id)))throw new Error('流式预览对象目录不完整')
    return order.map(id=>next.get(id)!)
  }
  const doc=clone(before),clearedImages=new Set(delta.clearedImages)
  const nodes=delta.nodes.map(node=>{
    const image=clearedImages.has(node.id)?undefined:before.nodes.find(n=>n.id===node.id)?.image
    return {...node,...(image?{image:clone(image)}:{})}
  })
  doc.nodes=merge(doc.nodes,nodes,delta.removedNodes,delta.order.nodes);doc.containers=merge(doc.containers,delta.containers,delta.removedContainers,delta.order.containers);doc.edges=merge(doc.edges,delta.edges,delta.removedEdges,delta.order.edges)
  if(delta.style)doc.style=delta.style;if(delta.title)doc.title=delta.title;if(delta.styleUses)doc.styleUses=delta.styleUses
  const result=parseDocument(doc)
  if(figurePatchKey(result)!==delta.result)throw new Error('流式预览结果校验不一致，请恢复事件流')
  return result
}
