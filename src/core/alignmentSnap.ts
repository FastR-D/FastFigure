import type {FigureDocument} from './model.ts'
import {allObjects,bounds,descendants,topLevelSelection,type Rect} from './geometry.ts'
export interface AlignmentGuide{axis:'x'|'y';position:number;start:number;end:number}
/** Snap one selection envelope to sibling edges and centers in drawing units. */
export function snapSelection(doc:FigureDocument,ids:string[],wanted:Rect,tolerance=5){
  const moving=topLevelSelection(doc,ids),parents=new Set(moving.map(o=>o.parentId)),excluded=new Set(moving.flatMap(o=>[o.id,...descendants(doc,o.id).map(c=>c.id)]))
  if(moving.some(o=>'kind'in o&&(o.chart||o.reconstruction||o.textLayout||['path','port'].includes(o.kind))))return{x:wanted.x,y:wanted.y,guides:[]}
  const targets=allObjects(doc).filter(o=>!excluded.has(o.id)&&parents.has(o.parentId)&&!('kind'in o&&['path','port'].includes(o.kind)))
  const guides:AlignmentGuide[]=[],offset={x:0,y:0}
  for(const axis of ['x','y'] as const){
    const length=axis==='x'?'width':'height',cross=axis==='x'?'y':'x',extent=axis==='x'?'height':'width'
    let nearest:{delta:number;target:Rect;position:number}|undefined
    for(const target of targets)for(const source of [0,.5,1])for(const destination of [0,.5,1]){
      const position=target[axis]+target[length]*destination,delta=position-(wanted[axis]+wanted[length]*source)
      if(Math.abs(delta)<=tolerance&&(!nearest||Math.abs(delta)<Math.abs(nearest.delta)))nearest={delta,target,position}
    }
    if(nearest){offset[axis]=nearest.delta;guides.push({axis,position:nearest.position,start:Math.min(wanted[cross],nearest.target[cross])-10,end:Math.max(wanted[cross]+wanted[extent],nearest.target[cross]+nearest.target[extent])+10})}
  }
  return{x:wanted.x+offset.x,y:wanted.y+offset.y,guides}
}
export const selectionBounds=(doc:FigureDocument,ids:string[])=>bounds(topLevelSelection(doc,ids))
