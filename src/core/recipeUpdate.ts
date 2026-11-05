import {snapshotEdgeWaypoints,reframeEdgeWaypoints} from './edgeWaypoints.ts'
import {buildRecipe,componentRecipes,recipeFieldValue} from '../data/recipes.ts'
import {clone,parseDocument,type FigureDocument,type FigureNode,type FigureContainer,type FigureEdge} from './model.ts'
import {ancestors,childrenOf,contains,descendants,resolveStyle} from './geometry.ts'
import {scaleSubtree} from './scaling.ts'
import {recipeUpdateRequestsSchema,recipeUpdateUseSchema,type RecipeUpdateUse} from './recipeUpdateContract.ts'

export type RecipeUpdateLayout='scale'|'frame'
type RecipeObject=FigureNode|FigureContainer|FigureEdge
const objects=(figure:FigureDocument):RecipeObject[]=>[...figure.containers,...figure.nodes,...figure.edges]
const stable=(value:unknown)=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)):v)
function scaledRecipe(id:string,parameters:Record<string,string|number>,factor:number,style:FigureDocument['style']){
  const asset=buildRecipe(id,parameters);asset.figure.style=clone(style)
  if(factor<.1){asset.figure=scaleSubtree(asset.figure,'stage',.1,'top-left').document;factor*=10}
  if(Math.abs(factor-1)>1e-10)asset.figure=scaleSubtree(asset.figure,'stage',factor,'top-left').document
  return asset
}
// Output neurons retain their role when inserting/removing hidden layers.
function logicalKey(object:RecipeObject,figure:FigureDocument,recipeId:string,parameters:Record<string,string|number>):string{
  if('source'in object)return `edge:${logicalKey(figure.nodes.find(n=>n.id===object.source)!,figure,recipeId,parameters)}:${logicalKey(figure.nodes.find(n=>n.id===object.target)!,figure,recipeId,parameters)}`
  if(recipeId==='mlp'&&'kind'in object){const match=/^neuron-(\d+)-(\d+)$/.exec(object.id);if(match){const column=Number(match[1]);return `neuron:${column===0?'input':column===Number(parameters.hiddenLayers)+1?'output':`hidden-${column}`}:${match[2]}`}}
  return object.id
}
function preserveEdits(next:FigureNode|FigureContainer,old:FigureNode|FigureContainer,baseline:FigureNode|FigureContainer){
  const fields='kind'in next?['label','name','description','iconId','textStyle','descriptionStyle','visual','textRole','textRuns','image','structure','socket']:['title','textStyle','visual','appearance','opacity']
  let edits=0
  const target=next as unknown as Record<string,unknown>,current=old as unknown as Record<string,unknown>,base=baseline as unknown as Record<string,unknown>
  for(const key of fields)if(stable(current[key])!==stable(base[key])){
    if(current[key]===undefined)delete target[key]
    else if(key==='textStyle'||key==='descriptionStyle'){
      // Preserve the edited properties; generated font sizes must still follow the new scale.
      const changed=current[key] as Record<string,unknown>,original=(base[key]??{}) as Record<string,unknown>,merged={...target[key] as Record<string,unknown>}
      for(const field of new Set([...Object.keys(original),...Object.keys(changed)]))if(stable(changed[field])!==stable(original[field])){if(changed[field]===undefined)delete merged[field];else merged[field]=clone(changed[field])}
      target[key]=merged
    }else target[key]=clone(current[key])
    edits++
  }
  return edits
}

/** Rebuild managed recipe geometry as one candidate; external references never silently disappear. */
export function updateRecipeInstance(input:FigureDocument,containerId:string,parameters:Record<string,string|number>,layout:RecipeUpdateLayout='scale',keepEdits=true){
  if(!['scale','frame'].includes(layout))throw new Error('请选择保持比例或适配原范围')
  const baseKey=JSON.stringify(input),doc=parseDocument(clone(input)),root=doc.containers.find(c=>c.id===containerId),state=root?.parametric
  if(!root||!state)throw new Error('此组合没有可更新的原生参数记录，请从参数化组合插入')
  const recipe=componentRecipes.find(r=>r.id===state.recipe.id)
  if(!recipe||state.recipe.version!==1)throw new Error('当前不支持此配方版本的参数更新')
  if(Object.keys(parameters).some(key=>!recipe.fields.some(field=>field.key===key)))throw new Error('参数中包含此组合不支持的字段')
  const next=buildRecipe(recipe.id,{...state.recipe.parameters,...parameters}),nextRecipe=next.recipe!,factor=layout==='frame'?Math.min(root.width/next.figure.containers[0]!.width,root.height/next.figure.containers[0]!.height):root.metricScale??1
  const unchanged=stable(nextRecipe.parameters)===stable(state.recipe.parameters)&&Math.abs(factor-(root.metricScale??1))<1e-10
  if(unchanged)return{document:doc,baseKey,containerId,changed:false,generated:0,added:0,removed:0,preserved:0,overrides:0,retainedIds:0,factor}
  const style=resolveStyle(doc,containerId),before=scaledRecipe(recipe.id,state.recipe.parameters,root.metricScale??1,style),after=scaledRecipe(recipe.id,nextRecipe.parameters,factor,style),previousObjects=objects(before.figure),byId=new Map(objects(doc).map(object=>[object.id,object])),scope=new Set([root.id,...descendants(doc,root.id).map(object=>object.id)])
  const managed=new Set(Object.values(state.objects)),oldEdges=new Set(before.figure.edges.map(edge=>state.objects[edge.id]!))
  if(state.objects.stage!==root.id||Object.keys(state.objects).length!==previousObjects.length)throw new Error('参数化图元对应记录不完整，请另行插入组合')
  const prior=new Map<string,RecipeObject>()
  for(const object of previousObjects){
    const current=byId.get(state.objects[object.id]??'')
    if(!current||('kind'in current)!==('kind'in object)||('source'in current)!==('source'in object)||!('source'in current)&&!scope.has(current.id))throw new Error('组合生成图元已删除或移出，请另行插入组合')
    if('source'in current&&'source'in object){if(current.source!==state.objects[object.source]||current.target!==state.objects[object.target])throw new Error('生成连接已手工改接，请先保留为独立连接，再更新参数')}
    else if('parentId'in current&&'parentId'in object&&object.parentId&&current.parentId!==state.objects[object.parentId])throw new Error('组合生成图元已重新分组，请先恢复原层级')
    if('kind'in current&&[current.path?.start,current.path?.end].some(binding=>binding&&!managed.has(binding.nodeId)))throw new Error('生成路径绑定了另加对象，请先解除该绑定再更新参数')
    prior.set(logicalKey(object,before.figure,recipe.id,state.recipe.parameters),current)
  }
  const aliases:Record<string,string>={},nextObjects=objects(after.figure)
  for(const object of nextObjects)aliases[object.id]=object.id==='stage'?root.id:prior.get(logicalKey(object,after.figure,recipe.id,nextRecipe.parameters))?.id??`recipe-${crypto.randomUUID()}`
  const nextIds=new Set(Object.values(aliases)),removed=new Set([...managed].filter(id=>!nextIds.has(id))),extraNodes=doc.nodes.filter(node=>!managed.has(node.id)),extraEdges=doc.edges.filter(edge=>!oldEdges.has(edge.id))
  if(extraEdges.some(edge=>removed.has(edge.source)||removed.has(edge.target))||extraNodes.some(node=>removed.has(node.parentId)||node.interfaceFor&&removed.has(node.interfaceFor)||[node.path?.start,node.path?.end].some(binding=>binding&&removed.has(binding.nodeId)))||doc.containers.some(container=>!managed.has(container.id)&&container.parentId&&removed.has(container.parentId)))throw new Error('更新会移除仍被外部连接、路径或另加对象引用的图元，请先解除连接或保留该参数')
  let overrides=0
  const nodes=after.figure.nodes.map(node=>{
    const result=clone(node),old=prior.get(logicalKey(node,after.figure,recipe.id,nextRecipe.parameters)),baseline=old?previousObjects.find(object=>state.objects[object.id]===old.id):undefined
    if(keepEdits&&old&&baseline&&'kind'in old&&'kind'in baseline)overrides+=preserveEdits(result,old,baseline)
    if(old&&'kind'in old&&old.evidence)result.evidence=clone(old.evidence)
    result.id=aliases[node.id]!;result.parentId=aliases[node.parentId]!;result.x+=root.x;result.y+=root.y
    if(result.interfaceFor)result.interfaceFor=aliases[result.interfaceFor]!
    for(const binding of [result.path?.start,result.path?.end])if(binding)binding.nodeId=aliases[binding.nodeId]!
    return result
  })
  const containers=after.figure.containers.map(container=>{
    if(container.id==='stage')return{...clone(root),width:layout==='frame'?root.width:container.width,height:layout==='frame'?root.height:container.height,metricScale:factor,parametric:{...clone(state),recipe:clone(nextRecipe),revision:state.revision+1,updatedAt:new Date().toISOString(),objects:aliases}}
    const result=clone(container),old=prior.get(container.id),baseline=before.figure.containers.find(c=>c.id===container.id)
    if(keepEdits&&old&&baseline&&!('kind'in old)&&!('source'in old))overrides+=preserveEdits(result,old,baseline)
    if(old&&!('source'in old)&&old.evidence)result.evidence=clone(old.evidence)
    result.id=aliases[container.id]!;result.parentId=aliases[container.parentId!]!;result.x+=root.x;result.y+=root.y;return result
  })
  const pins=snapshotEdgeWaypoints(doc)
  const edges=after.figure.edges.map(edge=>{const old=prior.get(logicalKey(edge,after.figure,recipe.id,nextRecipe.parameters)),baseline=old?before.figure.edges.find(e=>state.objects[e.id]===old.id):undefined;const appearance=keepEdits&&old&&'source'in old&&JSON.stringify(old.appearance)!==JSON.stringify(baseline?.appearance);if(appearance)overrides++;return{...edge,id:aliases[edge.id]!,source:aliases[edge.source]!,target:aliases[edge.target]!,...(appearance?{appearance:clone(old.appearance)}:{}),...(keepEdits&&old&&'source'in old&&old.routing!==baseline?.routing?{routing:old.routing,...(old.manualRoute?{manualRoute:clone(old.manualRoute)}:{})}:{})}})
  const updatedRoot=containers.find(c=>c.id===root.id)!
  if(root.parentId&&!contains(root,updatedRoot)){
    const area=(a:FigureContainer,b:{x:number;y:number;width:number;height:number})=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y))
    if(childrenOf(doc,root.parentId).some(sibling=>sibling.id!==root.id&&!('interfaceFor'in sibling&&sibling.interfaceFor===root.id)&&area(updatedRoot,sibling)>area(root,sibling)+1e-6))throw new Error('更新后的组合会覆盖同层对象，请适配原范围或先移动组合')
  }
  const replace=<T extends {id:string}>(old:T[],next:T[])=>{let inserted=false;const result=old.flatMap(object=>{if(!managed.has(object.id))return[object];if(inserted)return[];inserted=true;return next});return inserted?result:[...result,...next]}
  doc.nodes=replace(doc.nodes,nodes);doc.edges=replace(doc.edges,edges);doc.containers=replace(doc.containers,containers);reframeEdgeWaypoints(doc,pins)
  let result:FigureDocument
  try{result=parseDocument(doc)}catch(error){throw new Error('更新后的组合超出空间、容量或连接约束，请适配原范围，或先调整容器和注释',{cause:error})}
  return{document:result,baseKey,containerId,changed:true,generated:nodes.length,added:[...nextIds].filter(id=>!managed.has(id)).length,removed:removed.size,preserved:[...scope].filter(id=>!managed.has(id)).length,overrides,retainedIds:[...nextIds].filter(id=>managed.has(id)).length,factor}
}
export type RecipeUpdateResult=ReturnType<typeof updateRecipeInstance>

/** Model-facing capabilities omit the internal alias map; compilation still uses the frozen source. */
export function recipeUpdateTargets(figure:FigureDocument,selectedIds:string[]=[]){
  return figure.containers.flatMap(container=>{
    const state=container.parametric,recipe=componentRecipes.find(recipe=>recipe.id===state?.recipe.id)
    if(!state||!recipe||state.recipe.version!==1)return[]
    return[{containerId:container.id,title:container.title,recipeId:recipe.id,recipeName:recipe.name,revision:state.revision,parameters:clone(state.recipe.parameters),width:container.width,height:container.height,scale:container.metricScale??1,selected:selectedIds.some(id=>id===container.id||ancestors(figure,id).includes(container.id)),fields:clone(recipe.fields),ports:figure.nodes.filter(node=>node.interfaceFor===container.id&&node.socket).map(node=>({id:node.id,label:node.label,...node.socket!}))}]
  })
}

export function applyRecipeUpdates(input:FigureDocument,raw:unknown){
  const requests=recipeUpdateRequestsSchema.parse(raw),known=new Set(recipeUpdateTargets(input).map(target=>target.containerId)),uses:RecipeUpdateUse[]=[]
  let figure=clone(input)
  for(const request of requests){
    if(!known.has(request.containerId))throw new Error('参数更新目标不是原工程中可调整的组合')
    const root=figure.containers.find(container=>container.id===request.containerId)!,state=clone(root.parametric!),recipe=componentRecipes.find(recipe=>recipe.id===state.recipe.id)!
    const result=updateRecipeInstance(figure,request.containerId,request.parameters,request.layout,request.keepEdits),next=result.document.containers.find(container=>container.id===request.containerId)!.parametric!,fields=recipe.fields.filter(field=>stable(state.recipe.parameters[field.key])!==stable(next.recipe.parameters[field.key])).map(field=>{const before=recipeFieldValue(field,state.recipe.parameters),after=recipeFieldValue(field,next.recipe.parameters),label=(value:string|number)=>field.options.find(option=>option.value===String(value))?.label??String(value);return{key:field.key,label:field.label,before,after,beforeLabel:label(before),afterLabel:label(after)}})
    uses.push(recipeUpdateUseSchema.parse({containerId:root.id,title:root.title,recipeId:recipe.id,recipeName:recipe.name,before:state.recipe.parameters,after:next.recipe.parameters,layout:request.layout,keepEdits:request.keepEdits,reason:request.reason,changed:result.changed,beforeRevision:state.revision,afterRevision:next.revision,beforeScale:root.metricScale??1,afterScale:result.factor,generated:result.generated,added:result.added,removed:result.removed,preserved:result.preserved,overrides:result.overrides,retainedIds:result.retainedIds,fields}))
    figure=result.document
  }
  return{figure,uses}
}
