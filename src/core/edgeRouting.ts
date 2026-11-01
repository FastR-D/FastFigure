import {automaticEdgeRoutingSchema,type AutomaticEdgeRouting,type FigureDocument} from './model.ts'
import {descendants} from './geometry.ts'

export function internalContainerEdges(doc:FigureDocument,containerId:string){
  if(!doc.containers.some(c=>c.id===containerId))throw new Error('请选择有效的容器或组合')
  const ids=new Set(descendants(doc,containerId).filter(o=>'kind'in o).map(o=>o.id))
  return doc.edges.filter(e=>ids.has(e.source)&&ids.has(e.target))
}
/** Only change semantic edges whose two endpoints belong to this subtree. */
export function setContainerEdgeRouting(doc:FigureDocument,containerId:string,value:AutomaticEdgeRouting){
  const routing=automaticEdgeRoutingSchema.parse(value),edges=internalContainerEdges(doc,containerId)
  let changed=0
  for(const edge of edges)if((edge.routing??'orthogonal')!==routing){edge.routing=routing;delete edge.manualRoute;changed++}
  return{total:edges.length,changed,routing}
}
