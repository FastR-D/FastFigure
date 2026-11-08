import sources from './materials/gallery-study-sources.json' with {type:'json'}
import {parseAsset,type ComponentAsset} from '../core/assets.ts'
import {parseDocument,type FigureNode} from '../core/model.ts'
import type {PathPoint} from '../core/paths.ts'
import {createStructureBuilder} from './structureBuilder.ts'

export type GallerySourceId=keyof typeof sources
export const gallerySource=(id:GallerySourceId)=>({...sources[id]})
export const galleryStudyDate='2026-11-07T00:00:00.000Z'

/** Native schematic vocabulary. Provenance records layout inspiration, not reproduced paper results. */
export function galleryBuilder(width:number,height:number){
  const b=createStructureBuilder(),{figure,root}=b
  Object.assign(root,{width,height,titleDetached:true})
  figure.canvas.frame={x:0,y:0,width,height}
  const text=(id:string,label:string,x:number,y:number,w:number,h=26,size=16,bold=false,parent='stage')=>b.text(id,label,x,y,w,h,size,parent,bold)
  function card(id:string,label:string,x:number,y:number,w=150,h=56,color=0,parent='stage'){
    const n=b.shape(id,label,x,y,w,h,color,parent)
    n.visual={...n.visual,radius:9,stroke:'#81908f',strokeWidth:1}
    n.textStyle={size:16,align:'center'};return n
  }
  function line(id:string,points:PathPoint[],arrow=false,dashed=false){
    const n=b.path(id,points,arrow?'filled':'none')
    n.visual={...n.visual,stroke:'#526463',strokeWidth:1.5,...(dashed?{dash:[5,4]}:{})};return n
  }
  function wire(id:string,a:FigureNode,z:FigureNode,via:PathPoint[]=[],vertical=false,dashed=false){
    const points=vertical?[{x:a.x+a.width/2,y:a.y+a.height},...via,{x:z.x+z.width/2,y:z.y}]:[{x:a.x+a.width,y:a.y+a.height/2},...via,{x:z.x,y:z.y+z.height/2}]
    const n=line(id,points,true,dashed);b.bind(n,a,z,points);return n
  }
  function panel(id:string,title:string,x:number,y:number,w:number,h:number){
    b.group(id,title,x,y,w,h)
    const c=figure.containers.at(-1)!;c.titleDetached=true;c.visual={fill:'none',stroke:'none',strokeWidth:1,radius:0,handDrawn:false}
    text(`${id}-heading`,title,x+12,y+8,w-24,28,20,true,id).textStyle!.align='left'
    return id
  }
  function asset(id:string,name:string,description:string,tags:string[],refs:GallerySourceId[]):ComponentAsset{
    const currentRoot=figure.containers.find(c=>c.id==='stage')!
    figure.title=currentRoot.title=name
    // Small native groups own their labels/marks. Capture therefore keeps source and membership.
    const provenance=refs.map(gallerySource);currentRoot.evidence=provenance[0]
    return parseAsset({format:'fastfigure.component',version:1,id,name,description,tags,createdAt:galleryStudyDate,updatedAt:galleryStudyDate,sources:provenance,lineage:[],figure:parseDocument(figure)})
  }
  return{...b,text,card,line,wire,panel,asset}
}
