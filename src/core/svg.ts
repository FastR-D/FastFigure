import {sharedColorbarVisibility} from './sharedColorbar.ts'
import {sharedLegendVisibility} from './sharedLegend.ts'
import rough from 'roughjs'
import {gradientCoordinates} from './gradient.ts'
import type {Affine} from './affine.ts'
import { fontStack, iconById } from '../data/materials.ts'
import { figurePaint, foreground,pathFill } from './paint.ts'
import { nodeTextStyle, textAttributes,layoutWrappedText,wrappedTextAttributes } from './typography.ts'
import { ancestors, commonContainer, resolveStyle } from './geometry.ts'
import { rootContainer, type FigureDocument, type FigureNode, type FigureContainer } from './model.ts'
import { routeEdge, routeFigure, routePath, type FigureRoutes } from './routing.ts'
import { nodeStructure } from './structures.ts'
import { structureParts, structuredNodeLayout, type StructurePart } from './structureVisual.ts'
import { basisContainer, basisNode } from './scaling.ts'
import {resolvedEdgeAppearance} from './lineAppearance.ts'
import { mapPathPoints, pathPoints, pointsData, pathArrowFrames } from './paths.ts'
import { inverse, transform } from './affine.ts'
import {containerSurface} from './containerSurface.ts'
import {comicPath} from './comicStroke.ts'
import {sketchProfiles,sketchSeed} from './sketchStyle.ts'

export interface SvgElement { tag: string; attrs?: Record<string, string | number>; children?: (SvgElement | string)[] }
const el = (tag: string, attrs: SvgElement['attrs'] = {}, children: SvgElement['children'] = []): SvgElement => ({ tag, attrs, children })
const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) & 0x7fffffff, 17) || 1
const gen = rough.generator()
export const palettes = {
  blue: { ink: '#375b83', fill: '#eff5fc', hatch: '#c9d9ed' },
  slate: { ink: '#495667', fill: '#f2f4f7', hatch: '#d4d9e1' },
  teal: { ink: '#366c73', fill: '#eef7f6', hatch: '#c5dfdc' },
  sand: { ink: '#876b37', fill: '#fff8e5', hatch: '#eddfb9' },
  rose: { ink: '#8d546c', fill: '#fff0f4', hatch: '#edcbd9' },
}

function text(x: number, y: number, label: string, attrs: SvgElement['attrs'] = {}) {
  return el('text', { x, y, fill: '#243b53', 'font-size': 14, ...attrs }, [label])
}
function roughRect(x: number, y: number, width: number, height: number, doc: FigureDocument, id: string, fill?: string,options:{stroke?:string;strokeWidth?:number;hatch?:boolean;roughness?:number}={}):SvgElement {
  if(doc.style.sketchStyle==='comic'&&options.roughness!==0){
    const texture=options.hatch?[roughRect(0,0,width,height,doc,`${id}-hatch`,fill,{...options,roughness:0,stroke:'none'})]:[]
    return el('g',{transform:`translate(${x} ${y})`},[...texture,sketchedShape(el('rect',{x:0,y:0,width,height,fill:options.hatch?'none':fill??'none',stroke:options.stroke??figurePaint(doc.style).ink,'stroke-width':options.strokeWidth??1.5}),doc,id)])
  }
  const drawable = gen.rectangle(0, 0, width, height, {
    ...sketchOptions(doc,id),roughness:options.roughness??doc.style.roughness,
    stroke: options.stroke??figurePaint(doc.style).ink, strokeWidth: options.strokeWidth??1.5,
    ...(fill&&fill!=='none' ? { fill, fillStyle: options.hatch?'hachure':'solid', hachureGap: 11, fillWeight: 0.5 } : {}),
  })
  return el('g', { transform: `translate(${x} ${y})` }, gen.toPaths(drawable).map(p =>
    el('path', { d: p.d, stroke: p.stroke, fill: p.fill ?? 'none', 'stroke-width': p.strokeWidth, 'stroke-linecap': 'round' })))
}
function sketchOptions(doc:FigureDocument,id:string){return{seed:sketchSeed(`${doc.style.seed}-${id}`),bowing:doc.style.sketchStyle?sketchProfiles[doc.style.sketchStyle].bowing:.8,roughness:doc.style.roughness,disableMultiStroke:doc.style.sketchStyle?sketchProfiles[doc.style.sketchStyle].disableMultiStroke:false,preserveVertices:true}}
function sketchedPath(data:string,doc:FigureDocument,id:string){
  if(doc.style.sketchStyle==='comic')return comicPath(data,`${doc.style.seed}-${id}`,doc.style.roughness)
  return gen.toPaths(gen.path(data,{...sketchOptions(doc,id),stroke:'#000',fill:'none'})).map(path=>path.d).join(' ')
}
function sketchedShape(shape:SvgElement,doc:FigureDocument,id:string):SvgElement{
  if(!['rect','ellipse','path'].includes(shape.tag))return shape
  const attrs=shape.attrs??{},n=(key:string)=>Number(attrs[key]??0),stroke=String(attrs.stroke??'none'),fill=String(attrs.fill??'none')
  if(stroke==='none'&&fill==='none')return shape
  let data=String(attrs.d??'')
  if(shape.tag==='rect'){
    const x=n('x'),y=n('y'),w=n('width'),h=n('height'),r=Math.min(n('rx'),w/2,h/2)
    data=r?`M${x+r} ${y}H${x+w-r}Q${x+w} ${y} ${x+w} ${y+r}V${y+h-r}Q${x+w} ${y+h} ${x+w-r} ${y+h}H${x+r}Q${x} ${y+h} ${x} ${y+h-r}V${y+r}Q${x} ${y} ${x+r} ${y}Z`:`M${x} ${y}H${x+w}V${y+h}H${x}Z`
  }else if(shape.tag==='ellipse'){
    const x=n('cx'),y=n('cy'),rx=n('rx'),ry=n('ry'),k=.55228475
    data=`M${x+rx} ${y}C${x+rx} ${y+ry*k} ${x+rx*k} ${y+ry} ${x} ${y+ry}C${x-rx*k} ${y+ry} ${x-rx} ${y+ry*k} ${x-rx} ${y}C${x-rx} ${y-ry*k} ${x-rx*k} ${y-ry} ${x} ${y-ry}C${x+rx*k} ${y-ry} ${x+rx} ${y-ry*k} ${x+rx} ${y}Z`
  }
  const rest=Object.fromEntries(Object.entries(attrs).filter(([key])=>!['d','x','y','width','height','rx','ry','cx','cy','fill','stroke','stroke-width'].includes(key)))
  if(doc.style.sketchStyle==='comic')return el('path',{...rest,d:comicPath(data,`${doc.style.seed}-${id}`,doc.style.roughness),fill,stroke,'stroke-width':attrs['stroke-width']??1.3,'stroke-linecap':'round','stroke-linejoin':'round','data-sketch-style':'comic'})
  const paths=gen.toPaths(gen.path(data,{...sketchOptions(doc,id),stroke,strokeWidth:n('stroke-width')||1.3,...(fill!=='none'?{fill,fillStyle:doc.style.sketchStyle==='drawio'?'hachure' as const:'solid' as const,hachureGap:6,fillWeight:.5}:{})}))
  return el('g',{'data-sketch-style':doc.style.sketchStyle??'rough'},paths.map(path=>el('path',{...rest,d:path.d,fill:path.fill??'none',stroke:path.stroke,'stroke-width':path.strokeWidth,'stroke-linecap':'round','stroke-linejoin':'round'})))
}
export function edgePath(doc: FigureDocument, edgeId: string) {
  const edge=doc.edges.find(e=>e.id===edgeId)!
  return routePath(routeEdge(doc,edge),edge.routing==='manual'?0:6)
}
export function iconVisual(iconId: string, x: number, y: number, size: number, color: string): SvgElement | undefined {
  const icon = iconById.get(iconId)
  if (!icon) return
  return el('g', { transform: `translate(${x} ${y}) scale(${size / Math.max(icon.width, icon.height)})`, color, 'data-icon-id': iconId }, icon.elements)
}
export function structureElements(parts: StructurePart[], x=0, y=0,sketch?:{doc:FigureDocument;id:string}): SvgElement[] {
  return parts.flatMap(part => {
    const attrs:SvgElement['attrs']={fill:part.fill,stroke:part.stroke,'stroke-width':1,'data-structure-part':part.key,opacity:part.opacity??1}
    const result:SvgElement[]=[]
    if(part.kind==='box') result.push(el('rect',{...attrs,x:x+part.x,y:y+part.y,width:part.width,height:part.height,rx:part.radius??0}))
    else if(part.kind==='ellipse') result.push(el('ellipse',{...attrs,cx:x+part.x+part.width/2,cy:y+part.y+part.height/2,rx:part.width/2,ry:part.height/2}))
    else if(part.kind==='line' && part.points?.length) {
      const points=part.points.map(p=>({x:x+p.x,y:y+p.y}))
      result.push(el('path',{...attrs,d:points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' '),'stroke-linejoin':'round','stroke-linecap':'round'}))
      if(part.arrow && points.length>1) {
        const end=points.at(-1)!,prev=points.at(-2)!,angle=Math.atan2(end.y-prev.y,end.x-prev.x),s=3
        const a={x:end.x-s*Math.cos(angle)+s*.6*Math.sin(angle),y:end.y-s*Math.sin(angle)-s*.6*Math.cos(angle)}
        const b={x:end.x-s*Math.cos(angle)-s*.6*Math.sin(angle),y:end.y-s*Math.sin(angle)+s*.6*Math.cos(angle)}
        result.push(el('path',{d:`M${a.x} ${a.y} L${end.x} ${end.y} L${b.x} ${b.y}`,fill:'none',stroke:part.stroke,'stroke-width':1,opacity:part.opacity??1}))
      }
    }
    if(part.label) result.push(text(x+part.x+part.width/2,y+part.y+part.height/2+(part.fontSize??10)*.34,part.label,{'font-size':part.fontSize??10,fill:part.color??part.stroke,'text-anchor':'middle','data-edit-field':`structure:${part.labelIndex}`,...(part.textLayout?wrappedTextAttributes(part.textLayout,`structure:${part.labelIndex}`,Math.max(8,part.width-4),part.height,part.fontSize??10):{})}))
    return sketch?result.map((shape,i)=>sketchedShape(shape,sketch.doc,`${sketch.id}-${part.key}-${i}`)):result
  })
}
export function nodeVisual(node: FigureNode, doc: FigureDocument): SvgElement[] {
  const units=node.metricScale??1
  if(units!==1&&node.kind!=='path'&&node.kind!=='port'&&!node.textLayout){const basis=basisNode(node);basis.x=0;basis.y=0;return [el('g',{transform:`translate(${node.x} ${node.y}) scale(${units})`,'data-metric-scale':units},nodeVisual(basis,doc))]}
  const { x, y, width: w, height: h } = node, p = figurePaint(doc.style, node.visual?.colorIndex)
  const result: SvgElement[] = [], borderless = node.kind === 'text' || node.kind === 'icon'
  const definitions:SvgElement[]=[]
  const finish=(elements:SvgElement[])=>definitions.length?[el('defs',{},definitions),...elements]:elements
  function paint(channel:'fill'|'stroke',fallback:string,matrix?:Affine){
    const gradient=node.visual?.[channel==='fill'?'fillGradient':'strokeGradient'];if(!gradient)return fallback
    const coordinates=gradientCoordinates(gradient,node,matrix),fingerprint=JSON.stringify([coordinates,gradient.stops,gradient.spread,gradient.interpolation]),id=`ff-gradient-${node.id}-${hash(fingerprint)}-${hash([...fingerprint].reverse().join(''))}`
    if(!definitions.some(d=>d.attrs?.id===id))definitions.push(el('linearGradient',{id,gradientUnits:'userSpaceOnUse',...coordinates,spreadMethod:gradient.spread,'color-interpolation':gradient.interpolation},gradient.stops.map(stop=>el('stop',{offset:stop.offset,'stop-color':stop.color,'stop-opacity':stop.opacity}))))
    return `url(#${id})`
  }
  const fill=paint('fill',node.visual?.fill??(node.visual?.tone==='hatch'?p.hatch:p.fill)),stroke=paint('stroke',node.visual?.stroke??p.ink)
  if(node.kind==='port') return []
  if(node.kind==='path') {
    const points=pathPoints(doc,node),width=node.visual?.strokeWidth??1.3
    const matrix=node.visual?.strokeMatrix,inv=matrix&&inverse(matrix)
    const paintPoints=inv?mapPathPoints(points,p=>transform({x:p.x-node.x,y:p.y-node.y},inv)):points
    const paintMatrix:Affine|undefined=matrix?[...matrix,node.x,node.y]:undefined
    const result=[el('path',{d:pointsData(paintPoints),fill:paint('fill',pathFill(doc.style,node.visual),paintMatrix),stroke:paint('stroke',node.visual?.stroke??p.ink,paintMatrix),'stroke-width':width,'stroke-linecap':node.visual?.lineCap??'round','stroke-linejoin':node.visual?.lineJoin??'round','stroke-miterlimit':node.visual?.miterLimit??4,'stroke-dashoffset':node.visual?.dashOffset??0,'fill-rule':node.path?.fillRule??'nonzero',...(node.visual?.dash?.length?{'stroke-dasharray':node.visual.dash.join(' ')}:{}),...(matrix?{transform:`matrix(${matrix.join(' ')} ${node.x} ${node.y})`}:{}),'fill-opacity':node.visual?.fillOpacity??1,'stroke-opacity':node.visual?.strokeOpacity??1})]
    if((node.visual?.handDrawn??doc.style.preset==='sketch')&&!node.chart&&!node.reconstruction)result[0]=sketchedShape(result[0]!,doc,node.id)
    const frames=pathArrowFrames(points),size=node.path?.arrowSize??Math.max(3*(node.metricScale??1),width*3)
    for(const side of ['start','end'] as const){
      const frame=frames[side],kind=side==='start'?node.path?.startArrow??'none':node.path?.arrow??'none'
      if(!frame||kind==='none')continue
      const {tip,angle}=frame,a={x:tip.x-size*Math.cos(angle)+size*.6*Math.sin(angle),y:tip.y-size*Math.sin(angle)-size*.6*Math.cos(angle)},b={x:tip.x-size*Math.cos(angle)-size*.6*Math.sin(angle),y:tip.y-size*Math.sin(angle)+size*.6*Math.cos(angle)}
      result.push(el('path',{'data-path-arrow':side,d:`M${a.x} ${a.y} L${tip.x} ${tip.y} L${b.x} ${b.y}${kind==='filled'?'Z':''}`,stroke,'stroke-width':width,'stroke-opacity':node.visual?.strokeOpacity??1,fill:kind==='filled'?stroke:'none','fill-opacity':node.visual?.strokeOpacity??1}))
    }
    return finish(result)
  }
  if(node.kind==='text'&&node.textLayout){
    const layout=node.textLayout,s=nodeTextStyle(node,false,doc.style),base={x:x+w*layout.x,y:y+h*layout.y}
    return [el('title',{},[node.label]),text(0,0,node.label,{...textAttributes(node.textStyle,false,doc.style.fontFamily),fill:node.textStyle?.color??node.visual?.fill??s.color,stroke:node.visual?.stroke??'none','stroke-width':node.visual?.strokeWidth??1,'fill-opacity':node.visual?.fillOpacity??1,'stroke-opacity':node.visual?.strokeOpacity??1,'stroke-linecap':node.visual?.lineCap??'butt','stroke-linejoin':node.visual?.lineJoin??'miter','stroke-miterlimit':node.visual?.miterLimit??4,'stroke-dashoffset':node.visual?.dashOffset??0,...(node.visual?.dash?.length?{'stroke-dasharray':node.visual.dash.join(' ')}:{}),'dominant-baseline':layout.baseline??'alphabetic','text-anchor':s.align==='center'?'middle':s.align==='right'?'end':'start',transform:`matrix(${layout.matrix.join(' ')} ${base.x} ${base.y})`,'data-edit-field':'label','xml:space':'preserve'})]
  }
  if (node.kind === 'tensor') for (const [offset, opacity] of [[6,0.35],[3,0.6]]) result.push(el('rect', { x: x + offset!, y: y - offset!, width: w, height: h, rx: 4, fill: '#fff', stroke, 'stroke-opacity': opacity! }))
  if (!borderless) {
    const shapeStart=result.length
    if (['neuron','operator','ellipse'].includes(node.kind)) result.push(el('ellipse', { cx:x+w/2, cy:y+h/2, rx:w/2, ry:h/2, fill, stroke, 'stroke-width':node.visual?.strokeWidth??1.3 }))
    else if (node.kind === 'diamond') result.push(el('path', { d:`M${x+w/2} ${y} L${x+w} ${y+h/2} L${x+w/2} ${y+h} L${x} ${y+h/2}Z`, fill, stroke, 'stroke-width':node.visual?.strokeWidth??1.3 }))
    else if (node.kind === 'volume') {
      result.push(el('path', { d:`M${x} ${y+12} L${x+14} ${y} H${x+w} V${y+h-12} L${x+w-14} ${y+h} H${x}Z`, fill, stroke, 'stroke-width':node.visual?.strokeWidth??1.3 }))
      result.push(el('path', { d:`M${x} ${y+12} H${x+w-14} L${x+w} ${y} M${x+w-14} ${y+12} V${y+h}`, fill:'none', stroke, 'stroke-width':node.visual?.strokeWidth??1.3 }))
    } else if (node.kind === 'projection') result.push(el('path', { d:`M${x+18} ${y} H${x+w-18} L${x+w} ${y+h} H${x}Z`, fill, stroke, 'stroke-width':node.visual?.strokeWidth??1.3 }))
    else result.push(el('rect', { x,y,width:w,height:h,rx:node.kind === 'rectangle' ? node.visual?.radius ?? 0 : 7,fill,stroke,'stroke-width':node.visual?.strokeWidth??1.3 }))
    for(const shape of result.slice(shapeStart))shape.attrs={...shape.attrs,'fill-opacity':node.visual?.fillOpacity??1,'stroke-opacity':node.visual?.strokeOpacity??1,'stroke-linecap':node.visual?.lineCap??'butt','stroke-linejoin':node.visual?.lineJoin??'miter','stroke-miterlimit':node.visual?.miterLimit??4,'stroke-dashoffset':node.visual?.dashOffset??0,...(node.visual?.dash?.length?{'stroke-dasharray':node.visual.dash.join(' ')}:{})}
    if ((node.visual?.handDrawn??doc.style.preset === 'sketch')&&!node.chart&&!node.reconstruction)result.splice(0,result.length,...result.map((shape,i)=>sketchedShape(shape,doc,`${node.id}-${i}`)))
  }
  const structure=nodeStructure(node)
  if(structure) {
    const contentStart=result.length
    const layout=structuredNodeLayout(node), align=node.textStyle?.align??'center'
    const titleX=align==='left'?x+(node.iconId&&node.iconId!=='none'?32:10):align==='right'?x+w-10:x+w/2
    result.push(el('title',{},[`${node.label}${node.description?' — '+node.description:''}`]))
    result.push(...layout.lines.map((line,i)=>text(titleX,y+8+layout.size+i*layout.size*1.25,line,{...textAttributes(node.textStyle,false,doc.style.fontFamily),'font-size':layout.size,'text-anchor':align==='left'?'start':align==='right'?'end':'middle','data-edit-field':'label',...(i===0?wrappedTextAttributes(layout.textLayout,'label',layout.textWidth,h-16,layout.size):{})})))
    if((structure.repeats??1)>1) result.push(text(x+w-8,y+15,`×${structure.repeats}`,{'font-size':10,fill:stroke,'text-anchor':'end','data-structure-repeat':structure.repeats!}))
    if(node.iconId&&node.iconId!=='none') {const icon=iconVisual(node.iconId,x+8,y+8,16,stroke);if(icon)result.push(icon)}
    const parts=structureParts(node,layout.area,{...p,ink:stroke})
    result.push(el('g',{'data-structure':structure.type,'data-structure-detail':layout.area.height>=60?'full':'compact','font-family':fontStack(node.textStyle?.family??doc.style.fontFamily)},structureElements(parts,x,y,(node.visual?.handDrawn??doc.style.preset==='sketch')&&!node.chart&&!node.reconstruction?{doc,id:node.id}:undefined)))
    if(node.description) {
      const bodyAlign=node.descriptionStyle?.align??'center', bodyX=bodyAlign==='left'?x+10:bodyAlign==='right'?x+w-10:x+w/2
      const body=layoutWrappedText(node.description,w-20,layout.bodySize,1)
      result.push(text(bodyX,y+h-8,body.lines[0]??'',{...textAttributes(node.descriptionStyle,false,doc.style.fontFamily),'font-size':layout.bodySize,fill:node.descriptionStyle?.color??'#667085','text-anchor':bodyAlign==='left'?'start':bodyAlign==='right'?'end':'middle','data-edit-field':'description',...wrappedTextAttributes(body,'description',w-20,Math.min(layout.footer,h-8),layout.bodySize)}))
    }
    const clipId=`ff-structure-${node.id}-${hash(`${x}-${y}-${w}-${h}`)}`,content=result.splice(contentStart)
    result.push(el('defs',{},[el('clipPath',{id:clipId},[el('rect',{x:x+1,y:y+1,width:w-2,height:h-2})])]),el('g',{'clip-path':`url(#${clipId})`},content))
    return finish(result)
  }
  const hasIcon = !!node.iconId && iconById.has(node.iconId)
  const padding=node.visual?.padding??(node.kind==='text'&&!hasIcon?2:12)
  const centeredSymbol=/^[+×÷⊕⊙⊗−=∑∏]$/.test(node.label)&&!node.description&&!hasIcon&&(node.textStyle?.align??'center')==='center'
  const textRatio=['ellipse','operator','neuron'].includes(node.kind)&&!centeredSymbol?Math.SQRT1_2:node.kind==='diamond'?.5:1
  const insetX=Math.max(padding,w*(1-textRatio)/2),insetY=Math.max(Math.min(8,padding),h*(1-textRatio)/2)
  const bodyLeft=textRatio<1?x+insetX:x+12,bodyWidth=textRatio<1?w-insetX*2:w-24,bodyBottom=textRatio<1?y+h-insetY:y+h
  let top = y + insetY, left = x + insetX, textWidth = w - insetX*2, textHeight = h - insetY*2
  if (node.kind === 'icon' && hasIcon) {
    const size = node.label?Math.max(1,Math.min(64,w-12,h-28)):Math.min(w,h)
    result.push(iconVisual(node.iconId!,x+(w-size)/2,y+(node.label?4:0),size,stroke)!)
    top = y + size + 7; textHeight = h - size - 8
  } else if (hasIcon) {
    result.push(iconVisual(node.iconId!,textRatio<1?x+insetX:x+12,textRatio<1?y+insetY:y+12,24,stroke)!)
    left += 32; textWidth -= 32
  } else if(node.kind==='tensor') {
    for(let row=0;row<3;row++) for(let col=0;col<3;col++) result.push(el('rect',{x:x+10+col*7,y:y+12+row*7,width:6,height:6,fill:(row+col)%3===0?p.hatch:p.fill,stroke,'stroke-width':.5,'data-tensor-cell':`${row}-${col}`}))
    left+=26;textWidth-=26
  }
  if (node.kind === 'tokens' || node.kind === 'queue') {
    for (let i=0;i<4;i++) {
      const cellWidth=Math.min(22,(w-38)/4), cellX=x+w/2-(cellWidth+3)*2+i*(cellWidth+3)
      result.push(el('rect',{x:cellX,y:y+8,width:cellWidth,height:14,rx:node.kind==='tokens'?2:0,fill:p.hatch,stroke,'stroke-width':.7}),text(cellX+cellWidth/2,y+18,`${node.kind==='tokens'?'t':'q'}${i+1}`,{'font-size':8,fill:stroke,'text-anchor':'middle'}))
    }
    if(node.kind==='queue') result.push(el('path',{d:`M${x+5} ${y+15}H${x+13} M${x+10} ${y+12}L${x+13} ${y+15}L${x+10} ${y+18} M${x+w-15} ${y+15}H${x+w-5} M${x+w-8} ${y+12}L${x+w-5} ${y+15}L${x+w-8} ${y+18}`,fill:'none',stroke,'stroke-width':1}))
    top += 18; textHeight -= 18
  }
  const style = nodeTextStyle(node,false,doc.style), described = !!node.description
  const size = node.textStyle?.size ?? (node.kind === 'operator' && node.label.length < 3 ? 25 : node.kind === 'icon' ? 12 : 16)
  const bodySize = node.descriptionStyle?.size ?? 11
  const bodySpace = described ? Math.min((textRatio<1?textHeight:h)/2, bodySize*1.3*2+4) : 0
  const maxLines = Math.max(1,Math.floor((textHeight-bodySpace)/(size*1.25))), labelLayout=layoutWrappedText(node.label,textWidth,size,maxLines),lines=labelLayout.lines
  const align = node.textStyle?.align ?? (hasIcon && node.kind !== 'icon' || node.kind === 'text' || described ? 'left' : 'center')
  const textX = align === 'left' ? left : align === 'right' ? left + textWidth : left + textWidth/2
  const color = node.textStyle?.color ?? (node.visual?.textTone?style.color:node.visual?.fill && node.visual.fill !== 'none' ? foreground(node.visual.fill) : style.color)
  const baseline = described ? top+size : top+(textHeight-bodySpace-lines.length*size*1.25)/2+size
  result.push(el('title',{},[node.label+(described?' — '+node.description:'')]))
  const clipId = `ff-text-${node.id}-${hash(`${node.label}-${size}-${x}-${y}-${w}-${h}`)}`
  result.push(el('defs',{},[el('clipPath',{id:clipId},[el('rect',{x,y,width:w,height:h})])]))
  const labels:SvgElement[] = lines.map((line,i)=>text(textX,baseline+i*size*1.25,line,{...textAttributes(node.textStyle,false,doc.style.fontFamily),'font-size':size,fill:color,'text-anchor':align==='left'?'start':align==='right'?'end':'middle','data-edit-field':'label',...(i===0?wrappedTextAttributes(labelLayout,'label',textWidth,textHeight-bodySpace,size):{})}))
  if (described) {
    const bodyLayout=layoutWrappedText(node.description!,bodyWidth,bodySize,Math.max(1,Math.floor(bodySpace/(bodySize*1.3)))),bodyLines=bodyLayout.lines
    const align=node.descriptionStyle?.align??'left', bodyX=align==='right'?bodyLeft+bodyWidth:align==='center'?x+w/2:bodyLeft
    labels.push(...bodyLines.map((line,i)=>text(bodyX,bodyBottom-bodySpace+bodySize+i*bodySize*1.3,line,{...textAttributes(node.descriptionStyle,false,doc.style.fontFamily),'font-size':bodySize,fill:node.descriptionStyle?.color??'#667085','text-anchor':align==='right'?'end':align==='center'?'middle':'start','data-edit-field':'description',...(i===0?wrappedTextAttributes(bodyLayout,'description',bodyWidth,bodySpace,bodySize,1.3):{})})))
  }
  result.push(el('g',{'clip-path':`url(#${clipId})`},labels))
  return finish(result)
}
function containerVisual(c: FigureContainer, doc: FigureDocument): SvgElement {
  const units=c.metricScale??1
  if(units!==1){const basis=basisContainer(c);basis.x=0;basis.y=0;return el('g',{transform:`translate(${c.x} ${c.y}) scale(${units})`,'data-metric-scale':units},[containerVisual(basis,doc)])}
  doc = { ...doc, style: resolveStyle(doc, c.id) }
  const p = figurePaint(doc.style,c.visual?.colorIndex), preset = doc.style.preset,surface=containerSurface(c),stroke=c.visual?.stroke??p.ink,strokeWidth=c.visual?.strokeWidth??(c.role==='component'?1.3:1.4),fill=c.visual?.fill??(surface==='hatch'?p.hatch:c.role==='component'||preset==='soft'?p.fill:'#ffffff'),handDrawn=c.visual?.handDrawn??preset==='sketch'
  const result: SvgElement[] = []
  if(c.role==='component') {
    const background=handDrawn?roughRect(c.x,c.y,c.width,c.height,doc,c.id,fill,{stroke,strokeWidth,hatch:surface==='hatch'}):el('rect',{x:c.x,y:c.y,width:c.width,height:c.height,rx:c.visual?.radius??7,fill:surface==='hatch'?'none':fill,stroke,'stroke-width':strokeWidth,...(c.visual?.dash?.length?{'stroke-dasharray':c.visual.dash.join(' '),'stroke-dashoffset':c.visual.dashOffset??0}:{})})
    const layers=surface==='hatch'&&!handDrawn?[roughRect(c.x,c.y,c.width,c.height,doc,c.id,fill,{stroke:'none',hatch:true,roughness:0}),background]:[background]
    return el('g',{'data-container-id':c.id,'data-container-surface':surface,'data-expanded-structure':c.structureOrigin?.type??'custom',opacity:c.visual?.opacity??1},layers)
  }
  if(handDrawn)result.push(roughRect(c.x,c.y,c.width,c.height,doc,c.id,fill,{stroke,strokeWidth,hatch:surface==='hatch'}))
  else if (preset === 'bracket') {
    if(surface==='plain')result.push(el('rect',{x:c.x,y:c.y,width:c.width,height:c.height,fill,stroke:'none'}))
    if(surface==='hatch')result.push(roughRect(c.x,c.y,c.width,c.height,doc,c.id,fill,{stroke:'none',hatch:true,roughness:0}))
    result.push(el('path', { d: `M${c.x + 20} ${c.y} H${c.x} V${c.y + c.height} H${c.x + 20} M${c.x + c.width - 20} ${c.y} H${c.x + c.width} V${c.y + c.height} H${c.x + c.width - 20}`, fill: 'none', stroke, 'stroke-width': strokeWidth }))
  } else {
    if(surface==='hatch')result.push(roughRect(c.x,c.y,c.width,c.height,doc,c.id,fill,{stroke:'none',hatch:true,roughness:0}))
    result.push(el('rect', { x: c.x, y: c.y, width: c.width, height: c.height,rx:c.visual?.radius??(preset === 'soft' || preset === 'header' ? 12 : 3), fill:surface==='hatch'?'none':fill,stroke, 'stroke-width':strokeWidth, ...(preset === 'dashed' ? { 'stroke-dasharray': '8 6' } : {}) }))
  }
  if (preset === 'header') {
    result.push(el('path', { d: `M${c.x + 13} ${c.y + 1} H${c.x + c.width - 13} Q${c.x + c.width - 1} ${c.y + 1} ${c.x + c.width - 1} ${c.y + 13} V${c.y + 46} H${c.x + 1} V${c.y + 13} Q${c.x + 1} ${c.y + 1} ${c.x + 13} ${c.y + 1}`, fill:surface==='transparent'?'none':c.visual?.fill??p.fill }))
    result.push(el('path', { d: `M${c.x} ${c.y + 46} H${c.x + c.width}`, stroke, 'stroke-width': 1 }))
  }
  if (surface==='hatch'&&handDrawn) result.push(el('rect', { x: c.x + 14, y: c.y + 10, width: Math.min(c.width - 28, [...c.title].length * 9 + 16), height: 25, fill: '#fff' }))
  const titleWidth = [...c.title].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 15 : 7.5), 0)
  result.push(text(c.x + 22, c.y + 29, c.title, { ...textAttributes(c.textStyle,true,doc.style.fontFamily), 'data-edit-field':'label',
    ...(titleWidth > c.width - 44 ? { textLength: c.width - 44, lengthAdjust: 'spacingAndGlyphs' } : {}) }))
  return el('g', { 'data-container-id': c.id,'data-container-surface':surface,opacity:c.visual?.opacity??1 }, result)
}
export function createScene(doc: FigureDocument, showDocumentTitle = true, routes: FigureRoutes = routeFigure(doc)): SvgElement[] {
  const markerId = (id:string) => `ff-arrow-${id}-${hash(JSON.stringify(resolveStyle(doc,id)))}`
  const result: SvgElement[] = [
    el('defs', {}, [...doc.containers.map(c=>[markerId(c.id),figurePaint(resolveStyle(doc,c.id)).ink]),['ff-arrow-blocked','#c54747']].map(([id, ink]) => el('marker', { id:id!, viewBox: '0 0 8 8', refX: 7.5, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto' }, [el('path', { d: 'M0 0 L8 4 L0 8Z', fill: ink! })]))),
    ...(showDocumentTitle && rootContainer(doc).y >= 90&&!rootContainer(doc).dataChart&&doc.title!==rootContainer(doc).title ? [text(68, 68, doc.title, { 'font-size': 22, 'font-weight': 600 })] : []),
  ]
  const colorbarVisibility=sharedColorbarVisibility(doc),legendVisibility=sharedLegendVisibility(doc)
  const containers = [...doc.containers].sort((a, b) => ancestors(doc, a.id).length - ancestors(doc, b.id).length)
  for (const c of containers){result.push(containerVisual(c, doc));const warning=legendVisibility.warnings.find(row=>row.containerId===c.id);if(warning)result.push(text(c.x+8,c.y+18,'共享图例已停用 · 已恢复各图图例',{'font-size':12,fill:'#b45309','data-shared-legend-warning':c.id}));if(colorbarVisibility.warnings.some(row=>row.containerId===c.id))result.push(text(c.x+8,c.y+18,'共享色标已停用 · 已恢复各图色标',{'font-size':12,fill:'#b45309','data-shared-colorbar-warning':c.id}))}
  for (const edge of doc.edges) {
    const style = resolveStyle(doc, commonContainer(doc, edge.source, edge.target))
    const route = routes.get(edge.id)!, blocked = route.status === 'blocked'
    const data=routePath(route,edge.routing==='manual'?0:6*(edge.metricScale??1)),edgeData=!blocked&&edge.routing!=='manual'&&style.preset==='sketch'?sketchedPath(data,{...doc,style},edge.id):data
    const appearance=resolvedEdgeAppearance(doc,edge),stroke=blocked?'#c54747':appearance.stroke
    function arrowMarker(kind:'none'|'open'|'filled',start=false){
      if(kind==='none')return undefined
      if(!start&&kind==='filled'&&!edge.appearance?.stroke&&edge.appearance?.arrowSize===undefined)return blocked?'ff-arrow-blocked':markerId(commonContainer(doc,edge.source,edge.target))
      const marker=`ff-edge-arrow-${edge.id}-${hash(`${stroke}-${kind}-${appearance.arrowSize}-${appearance.strokeWidth}`)}`,size=appearance.arrowSize
      if(!result[0]!.children!.some(item=>typeof item!=='string'&&item.attrs?.id===marker))result[0]!.children!.push(el('marker',{id:marker,viewBox:'0 -.6 1 1.2',refX:1,refY:0,markerUnits:'userSpaceOnUse',markerWidth:size,markerHeight:size*1.2,orient:'auto-start-reverse',overflow:'visible'},[el('path',{d:`M0 -.6 L1 0 L0 .6${kind==='filled'?'Z':''}`,fill:kind==='open'?'none':stroke,stroke,'stroke-width':appearance.strokeWidth/size})]))
      return marker
    }
    const marker=arrowMarker(appearance.arrow),startMarker=arrowMarker(appearance.startArrow,true)
    result.push(el('path', { 'data-edge-id': edge.id,'data-edge-routing':edge.routing??'orthogonal', 'data-routing-status': route.status, d: edgeData, fill: 'none', stroke,
      ...(blocked ? { 'stroke-dasharray': '5 4' } : appearance.dash.length?{'stroke-dasharray':appearance.dash.join(' ')}:{}), 'stroke-width': appearance.strokeWidth,...(marker?{'marker-end':`url(#${marker})`}:{}),...(startMarker?{'marker-start':`url(#${startMarker})`}:{}), 'stroke-linejoin': 'round' },
    blocked ? [el('title', {}, [route.reason!])] : []))
  }
  const renderedGroups=new Set<string>()
  function renderNodes(nodes:FigureNode[],active:string[]=[]):SvgElement[] {
    const output:SvgElement[]=[]
    for(const node of nodes) {
      const group=[...ancestors(doc,node.id)].reverse().find(id=>!active.includes(id)&&doc.containers.find(c=>c.id===id)?.opacity!==undefined)
      if(group){if(renderedGroups.has(group))continue;renderedGroups.add(group);const members=nodes.filter(n=>ancestors(doc,n.id).includes(group));output.push(el('g',{'data-composite-group':group,opacity:doc.containers.find(c=>c.id===group)!.opacity!},renderNodes(members,[...active,group])));continue}
      if(node.kind!=='port')output.push(el('g',{'data-object-id':node.id,opacity:node.visual?.opacity??1},nodeVisual(node,{...doc,style:resolveStyle(doc,node.parentId)})))
    }
    return output
  }
  result.push(...renderNodes(doc.nodes.filter(node=>!legendVisibility.hidden.has(node.id)&&!colorbarVisibility.hidden.has(node.id))))
  return result
}
export const escapeXml = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
function serialize(item: SvgElement | string): string {
  if (typeof item === 'string') return escapeXml(item)
  return `<${item.tag}${Object.entries(item.attrs ?? {}).map(([k, v]) => ` ${k}="${escapeXml(String(v))}"`).join('')}>${(item.children ?? []).map(serialize).join('')}</${item.tag}>`
}
export function exportIconSvg(id: string) {
  const icon = iconById.get(id)
  return icon ? serialize(el('svg',{xmlns:'http://www.w3.org/2000/svg',viewBox:`0 0 ${icon.width} ${icon.height}`},icon.elements)) : ''
}
export function exportSvg(doc: FigureDocument) {
  const publication=doc.publication,number=(value:number)=>Number(value.toFixed(6)),width=publication?`${number(publication.widthMm)}mm`:doc.canvas.width,height=publication?`${number(publication.widthMm*doc.canvas.height/doc.canvas.width)}mm`:doc.canvas.height
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + serialize(el('svg', {
    xmlns: 'http://www.w3.org/2000/svg', width, height,
    viewBox: `0 0 ${doc.canvas.width} ${doc.canvas.height}`, 'font-family': fontStack(doc.style.fontFamily),style:'font-synthesis:weight style',
  }, [el('title', {}, [doc.title]), el('metadata', {}, [JSON.stringify({ ...doc, references: [] })]), el('rect', { width: 1000, height: 620, fill: '#fff' }), ...createScene(doc,publication?.showTitle??true)]))
}

/** Same scene as the editor, without paper metadata, document title or interaction overlays. */
export function exportSceneSvg(doc:FigureDocument,viewport:{x:number;y:number;width:number;height:number},width:number,height:number){
  return serialize(el('svg',{xmlns:'http://www.w3.org/2000/svg',width,height,viewBox:`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`,'font-family':fontStack(doc.style.fontFamily),style:'font-synthesis:weight style'},createScene(doc,false)))
}

/** Isolated vector fallback for editors without our path / affine text model. */
export function exportNodeSvg(doc:FigureDocument,node:FigureNode,padding=4) {
  return serialize(el('svg',{xmlns:'http://www.w3.org/2000/svg',viewBox:`${node.x-padding} ${node.y-padding} ${node.width+padding*2} ${node.height+padding*2}`,'font-family':fontStack(resolveStyle(doc,node.parentId).fontFamily),style:'font-synthesis:weight style'},[el('g',{opacity:node.visual?.opacity??1},nodeVisual(node,{...doc,style:resolveStyle(doc,node.parentId)}))]))
}
