import {z} from 'zod'
import {clone,parseDocument,nodeSchema,figureDocumentSchema,nodeSizeLimits,type FigureDocument,type FigureNode} from './model.ts'
import {contentBounds,descendants,resolveStyle,translateSubtree} from './geometry.ts'
import {layoutContainer,defaultLayoutOptions} from './layout.ts'
import {nodeTextStyle,layoutWrappedText} from './typography.ts'
import {structurePreset} from './structures.ts'
import {figureThemes,paperThemes} from './figureThemes.ts'
import {applyStyleAsset,type StyleAsset} from './styleAsset.ts'

const id=nodeSchema.shape.id
const nodeFields=nodeSchema.pick({label:true,name:true,description:true,x:true,y:true,width:true,height:true,visual:true,textRole:true,textStyle:true,descriptionStyle:true,textRuns:true,structure:true,iconId:true,path:true})
const containerFields=figureDocumentSchema.shape.containers.element.pick({title:true,x:true,y:true,width:true,height:true,visual:true,textStyle:true,appearance:true})
const edgeFields=figureDocumentSchema.shape.edges.element
const nonempty=<T extends z.ZodRawShape>(schema:z.ZodObject<T>)=>schema.strict().refine(value=>Object.keys(value).length>0,'补丁修改不能为空')
export const figurePatchOperationSchema=z.discriminatedUnion('op',[
  z.object({op:z.literal('reset'),title:z.string().trim().min(1).max(100)}).strict(),
  z.object({op:z.literal('theme'),themeId:id}).strict(),
  z.object({op:z.literal('add-node'),node:nodeFields.partial().extend({id,kind:z.enum(['module','tokens','tensor','queue','neuron','operator','volume','projection','rectangle','ellipse','diamond','text','icon','path']).default('module'),parentId:id.default('stage'),label:z.string().max(240).default('')}).strict()}).strict(),
  z.object({op:z.literal('update-node'),id,changes:nonempty(nodeFields.partial())}).strict(),
  z.object({op:z.literal('add-container'),container:containerFields.partial().extend({id,parentId:id.default('stage'),title:z.string().trim().min(1).max(100),role:z.enum(['group','boundary','lane','panel']).default('panel')}).strict()}).strict(),
  z.object({op:z.literal('update-container'),id,changes:nonempty(containerFields.partial())}).strict(),
  z.object({op:z.literal('connect'),edge:edgeFields.omit({metricScale:true,manualRoute:true}).partial({sourcePort:true,targetPort:true}).extend({routing:z.enum(['orthogonal','straight']).optional()}).strict()}).strict(),
  z.object({op:z.literal('update-edge'),id,changes:nonempty(edgeFields.omit({id:true,metricScale:true}).partial())}).strict(),
  z.object({op:z.literal('remove'),ids:z.array(id).min(1).max(240),cascade:z.boolean().default(false)}).strict(),
  z.object({op:z.literal('layout'),containerId:id.default('stage'),mode:z.enum(['flow','grid']).default('flow'),direction:z.enum(['right','down']).default('right'),gap:z.number().min(16).max(80).default(32),columns:z.number().int().min(1).max(10).default(2),recursive:z.boolean().default(false)}).strict(),
])
export type FigurePatchOperation=z.infer<typeof figurePatchOperationSchema>
export const figurePatchSchema=z.object({base:z.string().regex(/^[a-f0-9]{16}$/),operations:z.array(figurePatchOperationSchema).max(600)}).strict()

/** A deterministic conflict token, not an authenticity or security hash. */
export function figurePatchKey(figure:FigureDocument):string{
  const stable=(value:unknown):unknown=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])):value
  const text=JSON.stringify(stable(figure));let a=2166136261,b=2246822519
  for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(i),3266489917)}
  return[a,b].map(n=>(n>>>0).toString(16).padStart(8,'0')).join('')
}

function vacantPosition(doc:FigureDocument,parentId:string,width:number,height:number){
  const parent=doc.containers.find(c=>c.id===parentId);if(!parent)throw new Error(`父容器不存在：${parentId}`)
  const area=contentBounds(parent),siblings=[...doc.nodes,...doc.containers].filter(n=>n.parentId===parentId),gap=24
  const xs=[area.x,...siblings.map(n=>n.x+n.width+gap)],ys=[area.y,...siblings.map(n=>n.y+n.height+gap)]
  for(const y of ys.sort((a,b)=>a-b))for(const x of xs.sort((a,b)=>a-b))if(x+width<=area.x+area.width+.001&&y+height<=area.y+area.height+.001&&!siblings.some(n=>x<n.x+n.width+gap&&x+width+gap>n.x&&y<n.y+n.height+gap&&y+height+gap>n.y))return{x,y}
  throw new Error(`容器「${parent.title}」没有 ${Math.ceil(width)} × ${Math.ceil(height)} 的空位；请明确位置、调整布局或分区，不能缩小文字塞图`)
}
function addNode(doc:FigureDocument,spec:Extract<FigurePatchOperation,{op:'add-node'}>['node']){
  const theme=resolveStyle(doc,spec.parentId),structured=spec.kind==='module'&&spec.structure&&spec.structure.type!=='none'?spec.structure:undefined
  const prototype:FigureNode={...spec,x:spec.x??0,y:spec.y??0,width:spec.width??(spec.kind==='text'?220:spec.kind==='operator'||spec.kind==='neuron'?52:184),height:spec.height??(structured?structurePreset(structured.type).height:spec.kind==='text'?40:66)}
  if(spec.kind==='path'&&[spec.x,spec.y,spec.width,spec.height].some(value=>value===undefined))throw new Error('精确路径需要完整包围盒 x/y/width/height')
  if(spec.kind==='module'&&!structured)prototype.structure={type:'none'}
  if(spec.width===undefined&&spec.kind!=='path'){
    const font=nodeTextStyle(prototype,false,theme),max=nodeSizeLimits(spec.kind).maxWidth
    const width=[...prototype.label.split('\n')].reduce((n,line)=>Math.max(n,[...line].reduce((sum,c)=>sum+font.size*(c.codePointAt(0)!>255?1:.6),0)),0)
    prototype.width=Math.min(max,Math.max(prototype.width,width+32))
  }
  if(spec.height===undefined&&!structured&&spec.kind!=='path'){
    const font=nodeTextStyle(prototype,false,theme),lines=layoutWrappedText(prototype.label,prototype.width-24,font.size,240,font).requiredLines
    const caption=prototype.description?nodeTextStyle(prototype,true,theme):undefined,captionLines=caption?layoutWrappedText(prototype.description!,prototype.width-24,caption.size,240,caption).requiredLines:0
    prototype.height=Math.max(prototype.height,lines*font.size*1.25+24+(caption?captionLines*caption.size*1.25+8:0))
  }
  if((spec.x===undefined)!==(spec.y===undefined))throw new Error('位置须同时给出 x/y，或全部省略由程序放置')
  if(spec.x===undefined)Object.assign(prototype,vacantPosition(doc,spec.parentId,prototype.width,prototype.height))
  doc.nodes.push(prototype)
}
function mergeFields(target:object,changes:Record<string,unknown>){
  const record=target as Record<string,unknown>
  for(const [key,value]of Object.entries(changes))record[key]=['visual','textStyle','descriptionStyle','appearance'].includes(key)?{...(record[key] as object??{}),...(value as object)}:clone(value)
}
function managed(doc:FigureDocument,id:string){return[...doc.nodes,...doc.containers].some(o=>o.id===id&&('chart'in o&&!!o.chart||'dataChart'in o&&!!o.dataChart||'reconstruction'in o&&!!o.reconstruction||'sharedLegend'in o&&!!o.sharedLegend||'sharedColorbar'in o&&!!o.sharedColorbar||'parametric'in o&&!!o.parametric))||doc.containers.some(c=>(c.dataChart||c.reconstruction||c.sharedLegend||c.sharedColorbar||c.parametric)&&descendants(doc,c.id).some(o=>o.id===id))}

/** Apply in a private copy; a missing target, stale base or invalid final graph rejects the entire batch. */
export function applyFigurePatch(original:FigureDocument,input:unknown,preferredStyle?:StyleAsset):FigureDocument{
  const patch=figurePatchSchema.parse(input)
  if(patch.base!==figurePatchKey(original))throw new Error('补丁基准已变化，请基于最新工程重新生成')
  let doc=preferredStyle&&patch.operations.length?applyStyleAsset(original,preferredStyle).figure:clone(original)
  const requireFresh=(id:string)=>{if([...doc.nodes,...doc.containers,...doc.edges].some(o=>o.id===id))throw new Error(`对象 ID 已存在：${id}`)}
  for(const operation of patch.operations){
    switch(operation.op){
      case'reset':{
        const root=clone(doc.containers.find(c=>c.id==='stage')!);root.title=operation.title;delete root.titleDetached;delete root.appearance;delete root.dataChart;delete root.reconstruction;delete root.sharedLegend;delete root.sharedColorbar;delete root.parametric
        doc.title=operation.title;doc.nodes=[];doc.edges=[];doc.containers=[root];break
      }
      case'theme':{
        const theme=[...paperThemes,...figureThemes].find(theme=>theme.id===operation.themeId)
        if(!theme)throw new Error('未知绘图主题')
        doc=applyStyleAsset(doc,theme).figure;break
      }
      case'add-node':requireFresh(operation.node.id);if(managed(doc,operation.node.parentId))throw new Error('生成图表或参数组合请使用专用操作');addNode(doc,operation.node);break
      case'update-node':{
        const target=doc.nodes.find(n=>n.id===operation.id);if(!target)throw new Error(`图元不存在：${operation.id}`)
        if(managed(doc,target.id))throw new Error('生成图表、重建或参数组合请使用专用操作')
        mergeFields(target,operation.changes);break
      }
      case'add-container':{
        const spec=operation.container;requireFresh(spec.id);if(managed(doc,spec.parentId))throw new Error('不能改写程序生成的组合内部结构')
        const size={width:spec.width??360,height:spec.height??220}
        if((spec.x===undefined)!==(spec.y===undefined))throw new Error('容器位置须同时给出 x/y')
        const position=spec.x===undefined?vacantPosition(doc,spec.parentId,size.width,size.height):{x:spec.x,y:spec.y!}
        doc.containers.push({...spec,...size,...position,visual:{fill:'none',stroke:'none',...spec.visual}});break
      }
      case'update-container':{
        const target=doc.containers.find(c=>c.id===operation.id);if(!target)throw new Error(`容器不存在：${operation.id}`)
        if(managed(doc,target.id))throw new Error('程序生成的组合请使用专用操作')
        if(operation.changes.x!==undefined||operation.changes.y!==undefined)translateSubtree(doc,target,(operation.changes.x??target.x)-target.x,(operation.changes.y??target.y)-target.y)
        if(target.titleDetached&&operation.changes.title!==undefined){const title=doc.nodes.find(n=>n.parentId===target.id&&n.titleBlock);if(title)title.label=operation.changes.title}
        mergeFields(target,operation.changes);break
      }
      case'connect':{
        const spec=operation.edge;requireFresh(spec.id)
        const a=doc.nodes.find(n=>n.id===spec.source),b=doc.nodes.find(n=>n.id===spec.target)
        if(!a||!b)throw new Error('连接须引用已经存在的图元')
        const dx=b.x+b.width/2-a.x-a.width/2,dy=b.y+b.height/2-a.y-a.height/2,horizontal=Math.abs(dx)>=Math.abs(dy)
        doc.edges.push({...spec,sourcePort:spec.sourcePort??a.socket?.side??(horizontal?(dx>=0?'right':'left'):(dy>=0?'bottom':'top')),targetPort:spec.targetPort??b.socket?.side??(horizontal?(dx>=0?'left':'right'):(dy>=0?'top':'bottom')),routing:spec.routing??'orthogonal'});break
      }
      case'update-edge':{
        const target=doc.edges.find(e=>e.id===operation.id);if(!target)throw new Error(`连接不存在：${operation.id}`)
        if(managed(doc,target.source)||managed(doc,target.target))throw new Error('生成组合的内部连接请使用专用操作')
        const appearance=operation.changes.appearance?{...target.appearance,...operation.changes.appearance}:target.appearance
        Object.assign(target,operation.changes);if(appearance)target.appearance=appearance;break
      }
      case'remove':{
        const ids=new Set(operation.ids)
        for(const id of ids){if(id==='stage'||![...doc.nodes,...doc.containers,...doc.edges].some(o=>o.id===id))throw new Error(`不能删除此目标：${id}`);if(managed(doc,id))throw new Error('生成组合请使用专用操作')}
        for(const id of operation.ids){const children=descendants(doc,id);if(children.length&&!operation.cascade)throw new Error('删除非空容器须明确 cascade=true');for(const child of children)ids.add(child.id)}
        doc.nodes=doc.nodes.filter(n=>!ids.has(n.id));doc.containers=doc.containers.filter(c=>!ids.has(c.id));doc.edges=doc.edges.filter(e=>!ids.has(e.id)&&!ids.has(e.source)&&!ids.has(e.target));break
      }
      case'layout':{
        if(managed(doc,operation.containerId))throw new Error('生成组合请使用专用布局操作')
        doc=layoutContainer(doc,operation.containerId,{...defaultLayoutOptions,...operation,adjustPorts:true,fitContainers:false}).document;break
      }
    }
  }
  return parseDocument(doc)
}
