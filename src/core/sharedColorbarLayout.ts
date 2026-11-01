import {clone,type FigureDocument,type FigureContainer,type FigureNode} from './model.ts'
import {nodeTextStyle} from './typography.ts'
import {resolveStyle} from './geometry.ts'
import {textWidth,formatChartValue} from './chartText.ts'
import {textBox} from './textGeometry.ts'
import type {heatmapScale} from './heatmap.ts'

/** Lay out the same native parts; preserve unrequested typography and object identity. */
export function layoutColorbarParts(figure:FigureDocument,group:FigureContainer,parts:FigureNode[],scale:ReturnType<typeof heatmapScale>,valueLabel:string,options:{fontFamily?:string;fontSize?:number}){
  const units=group.metricScale??1,padding=8*units,barHeight=12*units,values=[scale.min,scale.center??scale.min+(scale.max-scale.min)/2,scale.max],labels=[valueLabel,...values.map(formatChartValue)]
  if(new Set(labels.slice(1)).size!==3)throw new Error('色标刻度文字无法区分，请先调整数据单位')
  const texts=parts.slice(32).map((node,i)=>{
    if(node.kind!=='text'||node.textLayout&&(node.textLayout.matrix.some((value,j)=>Math.abs(value-[1,0,0,1][j]!)>1e-8)||node.textLayout.baseline&&node.textLayout.baseline!=='alphabetic'))throw new Error('共享色标文字有旋转、仿射或特殊基线，请先保留为手工色标')
    const copy=clone(node);copy.label=labels[i]!
    copy.textStyle={...copy.textStyle,...(options.fontFamily===undefined?{}:{family:options.fontFamily}),...(options.fontSize===undefined?{}:{size:options.fontSize})}
    const style=nodeTextStyle(copy,false,resolveStyle(figure,node.parentId)),width=textWidth(copy.label,style.size,style.family)*1.08+Math.abs(style.letterSpacing??0)*Math.max(0,[...copy.label].length-1)
    // Reserve the font line box, not only the ink ascent. MiSans SVG text rises
    // above one em; deterministic headroom keeps selection and avoidance honest.
    return{node:copy,style,width,ascent:style.size*1.2,descent:style.size*.4}
  })
  const title=texts[0]!,ticks=texts.slice(1),half=Math.max(...ticks.map(text=>text.width))/2+2*units,width=Math.max(320*units+half*2+padding*2,title.width+padding*2),barWidth=width-half*2-padding*2,barX=padding+half,barY=padding+title.ascent+title.descent+6*units,tickY=barY+barHeight+Math.max(...ticks.map(text=>text.ascent))+6*units,height=tickY+Math.max(...ticks.map(text=>text.descent))+padding
  const positions=[width/2,...values.map(value=>barX+(value-scale.min)/(scale.max-scale.min)*barWidth)]
  if(positions.slice(1).some((x,i)=>i>0&&x-positions[i]!<(texts[i+1]!.width+texts[i]!.width)/2+8*units))throw new Error('发散中心靠近端点，色标刻度文字会重叠，请调整范围或字号')
  const bands=parts.slice(0,32).map((node,i)=>({...clone(node),x:barX+barWidth*i/32,y:barY,width:barWidth/32+.01*units,height:barHeight,visual:{...node.visual,fill:scale.color(scale.min+(scale.max-scale.min)*i/31)}}))
  const nodes=[...bands,...texts.map(({node,style,ascent,descent},i)=>{
    const anchor={x:positions[i]!,y:i?tickY:padding+ascent},align=style.align??'center',estimate=(text:string)=>textWidth(text,style.size,style.family)*1.08+Math.abs(style.letterSpacing??0)*Math.max(0,[...text].length-1),w=estimate(node.label),point={x:anchor.x+(align==='left'?-w/2:align==='right'?w/2:0),y:anchor.y}
    const box=textBox(node.label,style,point,[1,0,0,1],()=>({width:w,ascent,descent}),'alphabetic')
    return{...node,...box}
  })]
  return{nodes,width,height}
}
