import type { FigureNode, TextStyle } from './model.ts'
import { transform, type Linear, type Point } from './affine.ts'
import { fontStack } from '../data/materials.ts'

export interface TextMetricsBox {width:number;ascent:number;descent:number}
export type MeasureText=(label:string,style:TextStyle)=>TextMetricsBox
let canvas:OffscreenCanvas|HTMLCanvasElement|undefined
export function measureTextEvidence(label:string,style:TextStyle,familyCss=fontStack(style.family)){
  const size=style.size??16
  if(!canvas){if(typeof OffscreenCanvas!=='undefined')canvas=new OffscreenCanvas(1,1);else if(typeof document!=='undefined')canvas=document.createElement('canvas')}
  const ctx=canvas?.getContext('2d') as CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D|null|undefined
  if(ctx){ctx.font=`${style.italic?'italic ':''}${style.weight??(style.bold?'700':'400')} ${size}px ${familyCss}`;const m=ctx.measureText(label);return {width:Math.max(.1,m.width+(style.letterSpacing??0)*[...label].length),inkWidth:Math.max(.1,m.actualBoundingBoxLeft+m.actualBoundingBoxRight+(style.letterSpacing??0)*[...label].length),ascent:m.actualBoundingBoxAscent||size*.8,descent:Math.max(size*.2,m.actualBoundingBoxDescent),engine:'canvas' as const}}
  const width=Math.max(.1,[...label].reduce((sum,c)=>sum+size*(c.codePointAt(0)!>255?1:/[ilI.,:;!' ]/.test(c)?.3:.57),0)+(style.letterSpacing??0)*[...label].length)
  return {width,inkWidth:width,ascent:size*.8,descent:size*.2,engine:'estimate' as const}
}
export const measureText:MeasureText=(label,style)=>{const{width,ascent,descent}=measureTextEvidence(label,style);return{width,ascent,descent}}

export function textBox(label:string,style:TextStyle,baseline:Point,matrix:Linear,measure:MeasureText=measureText,alignment:NonNullable<FigureNode['textLayout']>['baseline']='alphabetic') {
  const metrics=measure(label,style),offset=style.align==='center'?metrics.width/2:style.align==='right'?metrics.width:0
  const shift=alignment==='middle'?(style.size??16)*.35:alignment==='central'?(metrics.ascent-metrics.descent)/2:alignment==='hanging'||alignment==='text-before-edge'?metrics.ascent:alignment==='text-after-edge'?-metrics.descent:0
  const points=[{x:-offset,y:-metrics.ascent+shift},{x:metrics.width-offset,y:-metrics.ascent+shift},{x:-offset,y:metrics.descent+shift},{x:metrics.width-offset,y:metrics.descent+shift},{x:0,y:0}].map(p=>{const q=transform(p,matrix);return{x:baseline.x+q.x,y:baseline.y+q.y}})
  const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y)),width=Math.max(1,Math.max(...points.map(p=>p.x))-x),height=Math.max(1,Math.max(...points.map(p=>p.y))-y)
  return {x,y,width,height,textLayout:{x:Math.max(0,Math.min(1,(baseline.x-x)/width)),y:Math.max(0,Math.min(1,(baseline.y-y)/height)),matrix,baseline:alignment}}
}
export function reflowText(node:FigureNode) {
  if(!node.textLayout)return
  const baseline={x:node.x+node.width*node.textLayout.x,y:node.y+node.height*node.textLayout.y}
  Object.assign(node,textBox(node.label,node.textStyle??{},baseline,node.textLayout.matrix,measureText,node.textLayout.baseline))
}
