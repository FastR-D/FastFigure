import {ancestors,contentBounds} from './geometry'
import {structurePreset} from './structures'
import type {FigureDocument,FigureNode,NodeKind} from './model'

export interface CanvasPoint {x:number;y:number}
export type NodeExtras=Partial<Pick<FigureNode,'iconId'|'description'|'textStyle'|'visual'|'structure'|'path'>>
export function libraryNodeSize(kind:NodeKind,extras:NodeExtras={}){
  const round=['neuron','operator','ellipse','icon','diamond'].includes(kind)
  return{width:extras.structure?184:round?80:kind==='text'?180:140,height:extras.structure?structurePreset(extras.structure.type).height:kind==='path'?0:round?80:kind==='text'?44:66}
}

/** Manual placement follows the pointer, independently of the current selection or automatic packing. */
export function libraryPlacement(doc:FigureDocument,point:CanvasPoint,size:{width:number;height:number}){
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.y<0||point.x>doc.canvas.width||point.y>doc.canvas.height)throw new Error('请将组件拖到画布内')
  const parents=doc.containers.filter(c=>{
    const area=contentBounds(c)
    return point.x>=area.x&&point.x<=area.x+area.width&&point.y>=area.y&&point.y<=area.y+area.height&&size.width<=area.width&&size.height<=area.height
  }).sort((a,b)=>ancestors(doc,b.id).length-ancestors(doc,a.id).length||a.width*a.height-b.width*b.height)
  const parent=parents[0]
  if(!parent)throw new Error('落点处没有足够空间，请扩大容器或选择更小的组件')
  const area=contentBounds(parent)
  return{parentId:parent.id,x:Math.max(area.x,Math.min(point.x-size.width/2,area.x+area.width-size.width)),y:Math.max(area.y,Math.min(point.y-size.height/2,area.y+area.height-size.height))}
}
