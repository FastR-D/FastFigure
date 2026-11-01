import {clone,parseDocument,type FigureDocument,type FigureNode} from './model.ts'
import {buildDataChart,replaceDataChart} from './dataChart.ts'
import {scaleComponent} from './assets.ts'
import {textWidth} from './chartText.ts'
import {textBox} from './textGeometry.ts'
import type {DataChartSpec} from './dataChartSchema.ts'

export function sameChartValue(a:unknown,b:unknown):boolean{
  if(typeof a==='number'&&typeof b==='number')return Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b))
  if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((value,index)=>sameChartValue(value,b[index]))
  if(a&&b&&typeof a==='object'&&typeof b==='object'){const left=a as Record<string,unknown>,right=b as Record<string,unknown>,keys=Object.keys(left);return keys.length===Object.keys(right).length&&keys.every(key=>key in right&&sameChartValue(left[key],right[key]))}
  return a===b
}
function patchStyle<T extends object>(current:T|undefined,canonical:T|undefined,next:T|undefined){
  const result={...next} as Record<string,unknown>;let changed=false
  for(const key of new Set([...Object.keys(current??{}),...Object.keys(canonical??{})])){
    const value=(current as Record<string,unknown>|undefined)?.[key],before=(canonical as Record<string,unknown>|undefined)?.[key]
    if(!sameChartValue(value,before)){changed=true;if(value===undefined)delete result[key];else result[key]=clone(value)}
  }
  return{value:Object.keys(result).length?result as T:undefined,changed}
}
/** Preserve presentation overrides, while Y tick labels and all data geometry come from the source spec. */
function preserveFormatting(next:FigureNode,old:FigureNode,canonical:FigureNode,origin:{x:number;y:number},regenerateYLabels:boolean){
  if(old.evidence)next.evidence=clone(old.evidence)
  if(old.reconstruction)next.reconstruction=clone(old.reconstruction)
  const visual=patchStyle(old.visual,canonical.visual,next.visual),text=patchStyle(old.textStyle,canonical.textStyle,next.textStyle),description=patchStyle(old.descriptionStyle,canonical.descriptionStyle,next.descriptionStyle)
  const tick=regenerateYLabels&&next.chart?.key?.startsWith('label-y-'),labelChanged=!tick&&old.label!==canonical.label
  const descriptionChanged=old.description!==canonical.description,iconChanged=old.iconId!==canonical.iconId
  const matrixChanged=old.textLayout&&!sameChartValue(old.textLayout.matrix,canonical.textLayout?.matrix)
  const base=(node:FigureNode)=>({x:node.x+node.width*node.textLayout!.x,y:node.y+node.height*node.textLayout!.y})
  const before=canonical.textLayout?base(canonical):undefined,current=old.textLayout?base(old):undefined
  const offset=before&&current?{x:current.x-before.x-origin.x,y:current.y-before.y-origin.y}:{x:0,y:0}
  const layoutChanged=!!old.textLayout!==!!canonical.textLayout||!!(old.textLayout&&canonical.textLayout&&(old.textLayout.baseline!==canonical.textLayout.baseline||matrixChanged||!sameChartValue(offset.x,0)||!sameChartValue(offset.y,0)))
  if(next.kind!==old.kind){if(visual.changed||text.changed||description.changed||labelChanged||descriptionChanged||iconChanged||layoutChanged)throw new Error('范围变化会改变带手工内容的图元表示，请先调整范围或整理标注');return false}
  if(next.kind==='text'&&!!old.textLayout!==!!canonical.textLayout)throw new Error('生成文字的定位表示已手动改变，请先整理标注')
  next.visual=visual.value;next.textStyle=text.value;next.descriptionStyle=description.value
  if(labelChanged)next.label=old.label
  if(descriptionChanged)next.description=old.description
  if(iconChanged)next.iconId=old.iconId
  if(old.name!==canonical.name)next.name=old.name
  if(next.kind==='text'&&next.textLayout&&old.textLayout&&before&&current){
    const layout=next.textLayout,after=base(next)
    if(next.label===old.label){
      // Keep the source glyph box and its measured layout; only translate by the
      // canonical axis reflow. Re-estimating ascent can reject a valid hand title.
      next.x=old.x+after.x-before.x-origin.x;next.y=old.y+after.y-before.y-origin.y
      next.width=old.width;next.height=old.height;next.textLayout=clone(old.textLayout)
    }else if(text.changed||layoutChanged){
      const baseline={x:after.x+offset.x,y:after.y+offset.y},matrix=matrixChanged?old.textLayout.matrix:layout.matrix
      const box=textBox(next.label,next.textStyle??{},baseline,matrix,(label,style)=>{const size=style.size??16;return{width:textWidth(label,size,style.family)+(style.letterSpacing??0)*[...label].length,ascent:size,descent:size*.3}},old.textLayout.baseline)
      next.x=box.x-1;next.y=box.y-1;next.width=box.width+2;next.height=box.height+2;next.textLayout={...box.textLayout,x:(baseline.x-next.x)/next.width,y:(baseline.y-next.y)/next.height}
    }
  }
  return visual.changed||text.changed||description.changed||labelChanged||descriptionChanged||iconChanged||layoutChanged
}
/** Recompile geometry from source data, preserving stable IDs and explicit presentation overrides. */
export function reflowDataChart(input:FigureDocument,containerId:string,spec:DataChartSpec,regenerateYLabels=false){
  const root=input.containers.find(container=>container.id===containerId)!
  const beforeRoot=clone(root),canonical=scaleComponent(buildDataChart(root.dataChart!.spec),root.metricScale??1).figure
  const byKey=new Map(canonical.nodes.filter(node=>node.chart?.key).map(node=>[node.chart!.key!,node]))
  const previous=new Map(input.nodes.filter(node=>node.parentId===root.id&&node.chart?.key).map(node=>[node.chart!.key!,clone(node)]))
  if([...previous.keys()].some(key=>!byKey.has(key)))throw new Error('有无法对应源数据的生成标识，请先整理图表配置')
  if([...previous].some(([key,node])=>node.kind!==byKey.get(key)!.kind))throw new Error('生成图元表示已手动改变，请先在图表编辑器整理，避免丢失手工内容')
  const result=replaceDataChart(input,root.id,spec),doc=result.document,nextRoot=doc.containers.find(container=>container.id===containerId)!,nextRecord=nextRoot.dataChart!
  for(const key of Object.keys(nextRoot))if(!(key in beforeRoot))delete (nextRoot as Record<string,unknown>)[key]
  Object.assign(nextRoot,beforeRoot,{dataChart:nextRecord});doc.style=clone(input.style)
  let formatted=0
  for(const node of doc.nodes.filter(node=>node.parentId===containerId&&node.chart?.key)){
    const key=node.chart!.key!,old=previous.get(key),basis=byKey.get(key)
    if(old&&basis&&preserveFormatting(node,old,basis,beforeRoot,regenerateYLabels))formatted++
  }
  // Keep source stacking order, especially owner annotations above data marks.
  const byId=new Map(doc.nodes.map(node=>[node.id,node])),oldIds=new Set(input.nodes.map(node=>node.id))
  const added=doc.nodes.filter(node=>!oldIds.has(node.id)),lastGenerated=[...input.nodes].reverse().find(node=>node.parentId===containerId&&node.chart?.key)?.id
  doc.nodes=input.nodes.flatMap(node=>[...(byId.has(node.id)?[byId.get(node.id)!]:[]),...(node.id===lastGenerated?added:[])])
  if(!lastGenerated)doc.nodes.push(...added)
  return{document:parseDocument(doc),generated:result.generated,preserved:result.preserved,formatted}
}
