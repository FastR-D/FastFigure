import {anchor,type FigureDocument,type FigureNode,type Port} from './model.ts'
import {bindingPoint,isClosedPathTarget,type PathBinding} from './paths.ts'

export interface CalloutBindings {target:PathBinding;label:PathBinding}
const sides:Port[]=['right','left','top','bottom']
const length=(a:{x:number;y:number},b:{x:number;y:number})=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)
function alternatives(figure:FigureDocument,node:FigureNode,original:PathBinding,toward:FigureNode){
  const kept={...original};delete kept.x;delete kept.y;delete kept.anchorIndex
  const rows=isClosedPathTarget(node)?node.path!.points.map((_,anchorIndex)=>({...kept,anchorIndex})):sides.map(side=>{
    const [x,y]=anchor(node,side);return{...kept,x:(x-node.x)/Math.max(.001,node.width),y:(y-node.y)/Math.max(.001,node.height)}
  })
  const center={x:toward.x+toward.width/2,y:toward.y+toward.height/2}
  const valid=rows.filter(binding=>binding.anchorIndex!==undefined||binding.x!==undefined&&binding.y!==undefined&&binding.x>=0&&binding.x<=1&&binding.y>=0&&binding.y<=1)
  valid.sort((a,b)=>length(bindingPoint(figure,a)!,center)-length(bindingPoint(figure,b)!,center))
  // A complex path can have 128 vertices. Keep its original vertex plus the
  // nearest eight real vertices; never invent a point on the path or its box.
  const candidates:PathBinding[]=[original,...valid.slice(0,8)]
  return candidates.filter((binding,index)=>candidates.findIndex(other=>other.x===binding.x&&other.y===binding.y&&other.anchorIndex===binding.anchorIndex)===index)
}
/** Candidate bindings retain endpoint identities, offsets and author notes. */
export function calloutAnchorCandidates(figure:FigureDocument,target:FigureNode,label:FigureNode,original:CalloutBindings){
  const pairs=alternatives(figure,target,original.target,label).flatMap(source=>alternatives(figure,label,original.label,target).map(destination=>({target:source,label:destination,preferred:source===original.target&&destination===original.label})))
  return pairs.map(pair=>({...pair,lowerBound:length(bindingPoint(figure,pair.target)!,bindingPoint(figure,pair.label)!)})).sort((a,b)=>a.lowerBound-b.lowerBound||Number(b.preferred)-Number(a.preferred))
}
