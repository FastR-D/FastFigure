import { fontStack } from '../data/materials.ts'
import type { FigureContainer, FigureDocument, FigureNode, TextStyle } from './model.ts'
import { nodeStructure } from './structures.ts'
import { figurePaint, mixColor } from './paint.ts'
export function resolvedTextStyle(style?: TextStyle, title = false) {
  return { family: style?.family ?? 'Inter', size: style?.size ?? (title ? 15 : 16), bold: style?.bold ?? (style?.weight!==undefined?style.weight>=600:title),weight:style?.weight, italic: style?.italic ?? false,letterSpacing:style?.letterSpacing, color: style?.color ?? '#243247', align: style?.align ?? (title?'left':'center') }
}
export function textAttributes(style?: TextStyle, title = false, family?:string) {
  const s = resolvedTextStyle({family,...style}, title)
  return { 'font-family': fontStack(s.family), 'font-size': s.size, 'font-weight':s.weight??(s.bold ? 700 : 400), 'font-style': s.italic ? 'italic' : 'normal',...(s.letterSpacing!==undefined?{'letter-spacing':s.letterSpacing}:{}), fill: s.color }
}
export function nodeTextStyle(node: FigureNode, description=false,theme?:FigureDocument['style']) {
  const structured=!!nodeStructure(node)
  const ink=node.visual?.stroke&&node.visual.stroke!=='none'?node.visual.stroke:theme?figurePaint(theme,node.visual?.colorIndex).ink:'#243247'
  const color=node.visual?.textTone==='ink'?ink:node.visual?.textTone==='deep'?mixColor(ink,'#182235',.2):undefined
  return resolvedTextStyle(description?{family:theme?.fontFamily,size:11,align:structured?'center':'left',...node.descriptionStyle}:{
    family:theme?.fontFamily,size:node.kind==='operator'&&node.label.length<3?25:node.kind==='icon'?12:16,
    align:structured?'center':node.iconId&&node.iconId!=='none'&&node.kind!=='icon'||node.kind==='text'||node.description?'left':'center',...(color?{color}:{}),...node.textStyle,
  })
}
/** Canvas units: a missing style scales with the drawing basis; an explicit style uses actual units. */
export function canvasNodeTextStyle(node:FigureNode,description=false,theme?:FigureDocument['style']){
  const style=nodeTextStyle(node,description,theme),explicit=description?node.descriptionStyle:node.textStyle
  if(!explicit&&!node.textLayout)style.size*=node.metricScale??1
  return style
}
export function canvasContainerTextStyle(container:FigureContainer,theme?:FigureDocument['style']){
  const style=resolvedTextStyle({family:theme?.fontFamily,...container.textStyle},true)
  if(!container.textStyle)style.size*=container.metricScale??1
  return style
}
export const estimatedTextWidth=(value:string,size:number)=>[...value].reduce((n,char)=>n+size*(char.codePointAt(0)!>255?1:/[ilI.,:;!' ]/.test(char)?0.3:/[MW@]/.test(char)?0.85:0.57),0)
export interface WrappedTextLayout{lines:string[];requiredLines:number;maxLines:number;truncated:boolean;overwide:boolean}
/** The renderer and diagnostics share this deterministic estimate; it is not browser glyph measurement. */
export function layoutWrappedText(value: string, width: number, size: number, maxLines = 20):WrappedTextLayout {
  const lines: string[] = []
  for (const paragraph of value.split('\n')) {
    let line = '', used = 0
    const measure = (token: string) => estimatedTextWidth(token,size)
    for (const token of paragraph.match(/[\u3400-\u9fff]|[^\s\u3400-\u9fff]+|[ \t]+/gu) ?? []) {
      const advance = measure(token)
      if (advance <= Math.max(size,width)) {
        if (used + advance > Math.max(size,width) && line) { lines.push(line.trim()); line='';used=0 }
        if (!line && !token.trim()) continue
        line += token; used += advance
      } else for (const char of token) {
        const step = measure(char)
        if (used+step>Math.max(size,width) && line) { lines.push(line.trim());line='';used=0 }
        line+=char;used+=step
      }
    }
    lines.push(line.trim())
  }
  const limit=Math.max(1,Math.floor(maxLines)),truncated=lines.length>limit,visible=truncated?[...lines.slice(0,limit-1),`${lines[limit-1]?.slice(0,-1)??''}…`]:lines
  return{lines:visible,requiredLines:lines.length,maxLines:limit,truncated,overwide:visible.some(line=>estimatedTextWidth(line,size)>Math.max(0,width)+1e-6)}
}
/** Explicit font sizes stay intact. Bound text by lines instead of shrinking a caption to unreadable pixels. */
export const wrapText=(value:string,width:number,size:number,maxLines=20)=>layoutWrappedText(value,width,size,maxLines).lines
export function wrappedTextAttributes(layout:WrappedTextLayout,field:string,width:number,height:number,size:number,lineStep=1.25){
  return{'data-text-field':field,'data-text-required-lines':layout.requiredLines,'data-text-shown-lines':layout.lines.length,'data-text-line-limit':layout.maxLines,'data-text-truncated':Number(layout.truncated),'data-text-overwide':Number(layout.overwide),'data-text-width':width,'data-text-height':height,'data-text-size':size,'data-text-line-step':lineStep}
}
