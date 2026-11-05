import {isPaperStyle,paperColors} from './paperStyle.ts'
import { paletteById } from '../data/materials.ts'
import type { FigureDocument,FigureNode } from './model.ts'
import {sourceColorSlot,sourceSlotColor,colorSlotKey} from './colorMappingContract.ts'
export function mixColor(color: string, other: string, ratio: number) {
  return '#' + [1,3,5].map(i => Math.round(parseInt(color.slice(i,i+2),16) * (1-ratio) + parseInt(other.slice(i,i+2),16) * ratio).toString(16).padStart(2,'0')).join('')
}
export function foreground(color: string) {
  const v = [1,3,5].map(i => { const n = parseInt(color.slice(i,i+2),16)/255; return n <= 0.04045 ? n/12.92 : ((n+0.055)/1.055)**2.4 })
  return v[0]! * 0.2126 + v[1]! * 0.7152 + v[2]! * 0.0722 > 0.179 ? '#182235' : '#ffffff'
}
export function figurePaint(style: FigureDocument['style'], index = style.colorIndex??0) {
  const slot=sourceColorSlot(style,index),mapping=style.colorMap?.find(row=>colorSlotKey(row)===colorSlotKey(slot))
  const color=mapping?paletteById.get(mapping.targetPaletteId)!.colors[mapping.targetIndex]!:sourceSlotColor(slot)
  if(isPaperStyle(style))return{ink:paperColors.ink,fill:color,hatch:mixColor(color,'#ffffff',.35),color}
  if(style.preset==='sketch'&&style.sketchStyle==='xkcd')return{ink:color,fill:'#ffffff',hatch:'#dddddd',color}
  if(style.preset==='sketch'&&style.sketchStyle==='comic')return{ink:'#303030',fill:mixColor(color,'#ffffff',.68),hatch:mixColor(color,'#ffffff',.45),color}
  return { ink: mixColor(color, '#182235', 0.45), fill: mixColor(color, '#ffffff', 0.88), hatch: mixColor(color, '#ffffff', 0.65), color }
}
/** Filled free paths opt into semantic paint; ordinary paths remain unfilled. */
export function pathFill(style:FigureDocument['style'],visual:FigureNode['visual']){const paint=figurePaint(style,visual?.colorIndex);return visual?.fill??(visual?.tone==='hatch'?paint.hatch:visual?.tone==='fill'?paint.fill:'none')}
/** Series marks change together; axes, significance annotations and heat scales stay intact. */
export function recolorChartSeries(doc:FigureDocument,paletteId:string) {
  const palette=paletteById.get(paletteId)
  if(!palette)throw new Error('未知配色方案')
  for(const container of doc.containers)if(container.dataChart&&container.dataChart.spec.kind!=='heatmap')container.dataChart.spec.paletteId=paletteId
  for(const node of doc.nodes){
    if(node.chart?.role!=='series'||node.chart.series===undefined)continue
    const color=palette.colors[node.chart.series%palette.colors.length]!
    for(const channel of node.chart.channels){if(channel==='text')node.textStyle={...node.textStyle,color};else {node.visual={...node.visual,[channel]:color};delete node.visual[channel==='fill'?'fillGradient':'strokeGradient']}}
  }
}
