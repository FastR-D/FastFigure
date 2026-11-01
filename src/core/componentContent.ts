import {parseAsset,type ComponentAsset} from './assets.ts'
import {rootContainer} from './model.ts'

export const componentContentAlgorithm='native-content-v2' as const
const position=(value:number)=>Math.round(value*1e7)/1e7
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,v])=>[key,canonical(v)])):value
/** Advisory graphic identity, separate from immutable snapshot identity. Keep
 * visible text, order, topology, styles, raw chart values and editable recipes.
 * Only IDs, process/source metadata and sub-pixel translation noise are removed. */
export function componentContentJson(input:ComponentAsset){
  const asset=parseAsset(input),figure=asset.figure,root=rootContainer(figure),containers=[root,...figure.containers.filter(c=>c.id!==root.id)]
  const ids=new Map([...containers.map((c,i)=>[c.id,`container-${i}`] as const),...figure.nodes.map((n,i)=>[n.id,`node-${i}`] as const),...figure.edges.map((e,i)=>[e.id,`edge-${i}`] as const)])
  const id=(value:string)=>ids.get(value)??`unresolved:${value}`
  for(const node of figure.nodes){
    if(node.visual){if(node.visual.fillGradient===null)delete node.visual.fillGradient;if(node.visual.strokeGradient===null)delete node.visual.strokeGradient}
    node.id=id(node.id);node.parentId=id(node.parentId);node.x=position(node.x);node.y=position(node.y)
    delete node.name;delete node.evidence;delete node.reconstruction
    if(node.interfaceFor)node.interfaceFor=id(node.interfaceFor)
    for(const binding of [node.path?.start,node.path?.end])if(binding){binding.nodeId=id(binding.nodeId);delete binding.note}
  }
  for(const container of containers){
    container.id=id(container.id);if(container.parentId)container.parentId=id(container.parentId);container.x=position(container.x);container.y=position(container.y)
    delete container.component;delete container.evidence;delete container.reconstruction;delete container.reconstructionReuse
    if(container.parametric){container.parametric.revision=0;delete container.parametric.updatedAt;for(const alias of Object.keys(container.parametric.objects))container.parametric.objects[alias]=id(container.parametric.objects[alias]!)}
    if(container.dataChart)container.dataChart.revision=1
    if(container.sharedLegend){container.sharedLegend.chartIds=container.sharedLegend.chartIds.map(id);for(const entry of container.sharedLegend.entries){entry.markId=id(entry.markId);entry.labelId=id(entry.labelId)}}
    if(container.sharedColorbar){container.sharedColorbar.chartIds=container.sharedColorbar.chartIds.map(id);for(const part of container.sharedColorbar.parts)part.nodeId=id(part.nodeId)}
  }
  for(const edge of figure.edges){edge.id=id(edge.id);edge.source=id(edge.source);edge.target=id(edge.target);if(edge.manualRoute){edge.manualRoute.containerId=id(edge.manualRoute.containerId);edge.manualRoute.points=edge.manualRoute.points.map(p=>({x:position(p.x),y:position(p.y)}))}}
  if(figure.style.colorIndex===0)delete figure.style.colorIndex
  if(!figure.style.colorMap?.length)delete figure.style.colorMap
  const handDrawn=figure.style.preset==='sketch'||[...containers,...figure.nodes].some(object=>object.visual?.handDrawn)||containers.some(c=>c.appearance?.preset==='sketch')
  // A component-role title is selection metadata; the renderer paints no title.
  const content={algorithm:componentContentAlgorithm,recipe:root.parametric?undefined:asset.recipe,style:{...figure.style,seed:handDrawn?figure.style.seed:undefined},containers:containers.map(c=>({...c,title:c.role==='component'?undefined:c.title})),nodes:figure.nodes,edges:figure.edges}
  return JSON.stringify(canonical(content))
}
export async function componentContentHash(asset:ComponentAsset){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(componentContentJson(asset)));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')}
