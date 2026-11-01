import {defaultPaletteId,paletteById} from '../data/materials.ts'
import {ancestors,resolveStyle} from './geometry.ts'
import type {FigureDocument} from './model.ts'

export function canColorContainer(doc:FigureDocument,id:string){
  return !doc.containers.some(c=>c.dataChart&&(c.id===id||ancestors(doc,c.id).includes(id)))
}
/** Changes only inherited diagram colors. Explicit object colors and geometry stay intact. */
export function setContainerColor(doc:FigureDocument,id:string,index:number|undefined,paletteId?:string){
  const container=doc.containers.find(c=>c.id===id)
  if(!container)throw new Error('主题色目标容器不存在')
  if(!canColorContainer(doc,id))throw new Error('数据图表使用自己的颜色编码，不能绑定组件默认主题色')
  const palette=paletteId??resolveStyle(doc,id).paletteId??defaultPaletteId
  const colors=paletteById.get(palette)?.colors
  if(!colors||index!==undefined&&(!Number.isInteger(index)||index<0||index>=colors.length))throw new Error('主题色色槽不在所选配色中')
  if(id==='stage'){
    if(index===undefined)delete doc.style.colorIndex
    else{doc.style.paletteId=palette;doc.style.colorIndex=index}
  }else{
    container.appearance={preset:'inherit',accent:'inherit',...container.appearance}
    if(index===undefined)delete container.appearance.colorIndex
    else{container.appearance.paletteId=palette;container.appearance.colorIndex=index}
  }
}
