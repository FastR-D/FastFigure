import {sharedColorbarVisibility} from './sharedColorbar.ts'
import {sharedLegendVisibility} from './sharedLegend.ts'
import {containerSurface} from './containerSurface.ts'
import { escapeXml, exportIconSvg, exportNodeSvg } from './svg'
import { figurePaint } from './paint'
import { nodeTextStyle, resolvedTextStyle } from './typography'
import { anchor, type FigureDocument,type FigureNode } from './model'
import { ancestors, commonContainer, parentOf, resolveStyle } from './geometry'
import { routeFigure } from './routing'
import { nodeStructure, structureLabels } from './structures'
import { structuredNodeLayout, structureParts } from './structureVisual'
import {paperNode,paperContainer} from './paperStyle'
import { bindingPoint, pathPoints } from './paths'

export function exportDrawio(doc: FigureDocument): string {
  const colorbarVisibility=sharedColorbarVisibility(doc),legendVisibility=sharedLegendVisibility(doc);doc={...doc,nodes:doc.nodes.filter(node=>!legendVisibility.hidden.has(node.id)&&!colorbarVisibility.hidden.has(node.id))}
  if(doc.containers.some(c=>c.opacity!==undefined&&c.opacity!==1))throw new Error('含组合透明度的图件请使用 SVG 或工程 JSON 导出，以保留重叠区域的正确外观')
  const usedIds=new Set([...doc.nodes,...doc.containers,...doc.edges].map(o=>o.id))
  function uniqueId(base:string) { let id=base,index=0;while(usedIds.has(id)) id=`${base}-${++index}`;usedIds.add(id);return id }
  const graphRoot=uniqueId('0'), graphLayer=uniqueId('1')
  function paint(id: string) {
    const style = resolveStyle(doc, id)
    return { ...figurePaint(style), sketch: style.preset === 'sketch' ? `sketch=1;fillStyle=${containerSurface(doc.containers.find(c=>c.id===id)!)==='hatch'?'hachure':'solid'};jiggle=${style.roughness};sketchStyle=${style.sketchStyle==='comic'?'comic':'rough'};disableMultiStroke=${style.sketchStyle==='comic'||style.sketchStyle==='xkcd'?1:0};` : '', dashed: style.preset === 'dashed' ? 'dashed=1;' : '' }
  }
  function typeStyle(style: import('./model').TextStyle | undefined, title=false,family?:string) { const s=resolvedTextStyle({family,...style},title); return `fontFamily=${s.family};fontSize=${s.size};fontStyle=${(s.bold?1:0)+(s.italic?2:0)};fontColor=${s.color};align=${s.align};` }
  const nativePath=(n:FigureNode)=>n.kind==='path'&&n.path&&(!n.visual?.fill||n.visual.fill==='none')&&(!n.visual?.lineCap||n.visual.lineCap==='butt')&&(!n.visual?.lineJoin||n.visual.lineJoin==='miter')&&!n.visual?.dashOffset
  const vectorPadding=(n:FigureNode)=>(n.kind!=='port'&&n.metricScale!==undefined&&n.metricScale!==1||n.kind==='image'||n.textRuns||n.textLayout||n.name!==undefined&&!nativePath(n)||n.visual?.strokeMatrix||n.visual?.fillGradient||n.visual?.strokeGradient||n.path?.points.some(p=>p.c1||p.move||p.close))?Math.max(4,(n.visual?.strokeWidth??1)*2):0
  const cells = [
    `<mxCell id="${graphRoot}"/><mxCell id="${graphLayer}" parent="${graphRoot}"/>`,
  ]
  for (let c of [...doc.containers].sort((a, b) => ancestors(doc, a.id).length - ancestors(doc, b.id).length)) {
    const theme=resolveStyle(doc,c.id)
    c=paperContainer(c,theme)
    const parent = parentOf(doc, c.id)
    const colors = paint(c.id)
    if(c.role==='component') {
      const componentColors=figurePaint(resolveStyle(doc,c.id),c.visual?.colorIndex)
      cells.push(`<mxCell id="${c.id}" value="" data-component-title="${escapeXml(c.title)}" style="rounded=1;container=1;collapsible=0;fillColor=${c.visual?.fill??(containerSurface(c)==='hatch'?componentColors.hatch:componentColors.fill)};strokeColor=${c.visual?.stroke??componentColors.ink};strokeWidth=${c.visual?.strokeWidth??1.3};${c.visual?.handDrawn===false?'':colors.sketch}" vertex="1" parent="${c.parentId??graphLayer}"><mxGeometry x="${c.x-(parent?.x??0)}" y="${c.y-(parent?.y??0)}" width="${c.width}" height="${c.height}" as="geometry"/></mxCell>`)
      continue
    }
    cells.push(`<mxCell id="${c.id}" value="${escapeXml(c.title)}" style="swimlane;startSize=${46*(c.metricScale??1)};container=1;collapsible=0;horizontal=1;rounded=1;whiteSpace=wrap;html=0;fillColor=${c.visual?.fill??(containerSurface(c)==='hatch'?figurePaint(resolveStyle(doc,c.id)).hatch:resolveStyle(doc,c.id).preset==='soft'?colors.fill:'#ffffff')};strokeColor=${c.visual?.stroke??colors.ink};strokeWidth=${c.visual?.strokeWidth??1.4};${typeStyle(c.textStyle,true,resolveStyle(doc,c.id).fontFamily)}${colors.sketch}${colors.dashed}" vertex="1" parent="${c.parentId ?? graphLayer}"><mxGeometry x="${c.x - (parent?.x ?? 0)}" y="${c.y - (parent?.y ?? 0)}" width="${c.width}" height="${c.height}" as="geometry"/></mxCell>`)
  }
  for (const rawNode of doc.nodes) {
    const n=paperNode(rawNode,resolveStyle(doc,rawNode.parentId))
    const parent = parentOf(doc, n.id)!
    const colors = figurePaint(resolveStyle(doc,n.parentId),n.visual?.colorIndex)
    if(vectorPadding(n)) {
      const padding=vectorPadding(n),image=encodeURIComponent(exportNodeSvg(doc,n,padding))
      cells.push(`<mxCell id="${n.id}" value="" data-vector-fallback="1" style="shape=image;imageAspect=0;image=data:image/svg+xml,${image};" vertex="1" parent="${n.parentId}"><mxGeometry x="${n.x-parent.x-padding}" y="${n.y-parent.y-padding}" width="${n.width+padding*2}" height="${n.height+padding*2}" as="geometry"/></mxCell>`)
      continue
    }
    if(n.kind==='path'&&n.path) {
      const points=pathPoints(doc,n),start=points[0]!,end=points.at(-1)!,middle=points.slice(1,-1).map(p=>`<mxPoint x="${p.x-parent.x}" y="${p.y-parent.y}"/>`).join('')
      const binding=(key:'start'|'end')=>{
        const b=n.path![key];if(!b)return''
        const target=doc.nodes.find(node=>node.id===b.nodeId)!,p=bindingPoint(doc,b)!,padding=vectorPadding(target),x=(p.x-(b.offsetX??0)-target.x+padding)/(target.width+padding*2),y=(p.y-(b.offsetY??0)-target.y+padding)/(target.height+padding*2),prefix=key==='start'?'exit':'entry'
        return`${prefix}X=${x};${prefix}Y=${y};${prefix}Dx=${b.offsetX??0};${prefix}Dy=${b.offsetY??0};${prefix}Perimeter=0;`
      }
      const width=n.visual?.strokeWidth??1.3,dash=n.visual?.dash?.length?`dashed=1;dashPattern=${n.visual.dash.map(value=>value/width).join(' ')};`:''
      cells.push(`<mxCell id="${n.id}" value="" edge="1" parent="${n.parentId}"${n.path.start?` source="${n.path.start.nodeId}"`:''}${n.path.end?` target="${n.path.end.nodeId}"`:''} style="noEdgeStyle=1;rounded=0;endArrow=${n.path.arrow==='open'?'open':n.path.arrow==='filled'?'block':'none'};endSize=3;strokeColor=${n.visual?.stroke??colors.ink};strokeWidth=${width};opacity=${(n.visual?.opacity??1)*(n.visual?.strokeOpacity??1)*100};${dash}${binding('start')}${binding('end')}"><mxGeometry relative="1" as="geometry"><mxPoint x="${start.x-parent.x}" y="${start.y-parent.y}" as="sourcePoint"/><mxPoint x="${end.x-parent.x}" y="${end.y-parent.y}" as="targetPoint"/><Array as="points">${middle}</Array></mxGeometry></mxCell>`)
      continue
    }
    if(n.kind==='port') {
      cells.push(`<mxCell id="${n.id}" value=""${n.socket?` data-interface-key="${escapeXml(n.socket.key)}" data-interface-name="${escapeXml(n.label)}" data-interface-direction="${n.socket.direction}"`:""} style="fillColor=none;strokeColor=none;opacity=0;" vertex="1" parent="${n.parentId}"><mxGeometry x="${n.x-parent.x}" y="${n.y-parent.y}" width="${n.width}" height="${n.height}" as="geometry"/></mxCell>`)
      continue
    }
    const shape = n.kind === 'icon' && n.iconId ? `shape=image;image=data:image/svg+xml,${encodeURIComponent(exportIconSvg(n.iconId).replaceAll('currentColor',colors.ink))};verticalLabelPosition=bottom;verticalAlign=top;` : n.kind === 'text' ? 'shape=text;' : n.kind === 'diamond' ? 'rhombus;' : n.kind === 'rectangle' ? `rounded=${n.visual?.radius?1:0};` : n.kind === 'neuron' || n.kind === 'operator' || n.kind === 'ellipse' ? 'ellipse;perimeter=ellipsePerimeter;' : n.kind === 'volume' ? 'shape=cube;' : n.kind === 'projection' ? 'shape=trapezoid;perimeter=trapezoidPerimeter;' : 'rounded=1;'
    cells.push(`<mxCell id="${n.id}" value="${escapeXml(n.label)}" style="${shape}whiteSpace=wrap;html=0;fillColor=${n.kind==='text'?'none':n.visual?.fill??(n.visual?.tone==='hatch'?colors.hatch:colors.fill)};strokeColor=${n.kind==='text'?'none':n.visual?.stroke??colors.ink};strokeWidth=${n.visual?.strokeWidth??1.3};opacity=${(n.visual?.opacity??1)*100};spacing=${n.visual?.padding??0};${typeStyle(nodeTextStyle(n,false,resolveStyle(doc,n.parentId)))}${n.chart||n.reconstruction||n.visual?.handDrawn===false?'':paint(n.parentId).sketch}${n.description||nodeStructure(n)?'verticalAlign=top;spacingTop=8;':''}" vertex="1" parent="${n.parentId}"><mxGeometry x="${n.x - parent.x}" y="${n.y - parent.y}" width="${n.width}" height="${n.height}" as="geometry"/></mxCell>`)
  }
  for (const rawNode of doc.nodes) {
    const n=paperNode(rawNode,resolveStyle(doc,rawNode.parentId))
    const structure=nodeStructure(n)
    if (n.description) cells.push(`<mxCell id="${uniqueId(`${n.id}-annotation`)}" value="${escapeXml(n.description)}" style="shape=text;whiteSpace=wrap;html=0;strokeColor=none;fillColor=none;${typeStyle({...nodeTextStyle(n,true,resolveStyle(doc,n.parentId)),color:n.descriptionStyle?.color??'#667085'})}" vertex="1" parent="${n.id}"><mxGeometry x="10" y="${n.height-(structure?24:32)}" width="${n.width-20}" height="${structure?22:30}" as="geometry"/></mxCell>`)
    if (n.iconId && n.iconId!=='none' && n.kind!=='icon') cells.push(`<mxCell id="${uniqueId(`${n.id}-glyph`)}" value="" style="shape=image;image=data:image/svg+xml,${encodeURIComponent(exportIconSvg(n.iconId).replaceAll('currentColor',paint(n.parentId).ink))};" vertex="1" parent="${n.id}"><mxGeometry x="8" y="8" width="${structure?16:24}" height="${structure?16:24}" as="geometry"/></mxCell>`)
    if(structure) {
      const labels=structureLabels(structure),parts=structureParts(n,structuredNodeLayout(n).area,figurePaint(resolveStyle(doc,n.parentId),n.visual?.colorIndex))
      for(const part of parts) {
        const id=uniqueId(`${n.id}-${part.key}`),label=part.labelIndex===undefined?'':labels[part.labelIndex]??''
        if(part.kind==='line'&&part.points?.length) {
          const start=part.points[0]!,end=part.points.at(-1)!,points=part.points.slice(1,-1).map(p=>`<mxPoint x="${p.x}" y="${p.y}"/>`).join('')
          cells.push(`<mxCell id="${id}" value="" edge="1" parent="${n.id}" style="noEdgeStyle=1;rounded=1;endArrow=${part.arrow?'open':'none'};endSize=3;strokeWidth=1;strokeColor=${part.stroke};opacity=${(part.opacity??1)*100};"><mxGeometry relative="1" as="geometry"><mxPoint x="${start.x}" y="${start.y}" as="sourcePoint"/><mxPoint x="${end.x}" y="${end.y}" as="targetPoint"/><Array as="points">${points}</Array></mxGeometry></mxCell>`)
        } else cells.push(`<mxCell id="${id}" value="${escapeXml(part.label?label:'')}" vertex="1" parent="${n.id}" style="${part.kind==='text'?'shape=text;':part.kind==='ellipse'?'ellipse;':'rounded=1;'}whiteSpace=wrap;html=0;fillColor=${part.fill};strokeColor=${part.stroke};fontFamily=${n.textStyle?.family??resolveStyle(doc,n.parentId).fontFamily??'Inter'};fontSize=${part.fontSize??10};fontColor=${part.color??part.stroke};"><mxGeometry x="${part.x}" y="${part.y}" width="${part.width}" height="${part.height}" as="geometry"/></mxCell>`)
      }
      if((structure.repeats??1)>1) cells.push(`<mxCell id="${uniqueId(`${n.id}-repeat`)}" value="×${structure.repeats}" vertex="1" parent="${n.id}" style="shape=text;html=0;fillColor=none;strokeColor=none;fontSize=10;"><mxGeometry x="${n.width-25}" y="2" width="23" height="16" as="geometry"/></mxCell>`)
    }
  }
  const ports = { left: [0, 0.5], right: [1, 0.5], top: [0.5, 0], bottom: [0.5, 1] }
  const routes = routeFigure(doc)
  for (const e of doc.edges) {
    const source=doc.nodes.find(n=>n.id===e.source)!,target=doc.nodes.find(n=>n.id===e.target)!
    const fraction=(node:typeof source,side:typeof e.sourcePort)=>{const [x,y]=anchor(node,side),pad=vectorPadding(node);return [(x-node.x+pad)/(node.width+pad*2),(y-node.y+pad)/(node.height+pad*2)]}
    const fixed=(node:typeof source)=>!!node.socket||e.routing==='straight'||!!vectorPadding(node)
    const from = fixed(source)?fraction(source,e.sourcePort):ports[e.sourcePort], to = fixed(target)?fraction(target,e.targetPort):ports[e.targetPort]
    const parentId = commonContainer(doc, e.source, e.target), colors = paint(parentId), parent = doc.containers.find(c => c.id === parentId)!
    const route = routes.get(e.id)!, blocked = route.status === 'blocked'
    const points = route.points.slice(1, -1).map(p => `<mxPoint x="${p.x - parent.x}" y="${p.y - parent.y}"/>`).join('')
    cells.push(`<mxCell id="${e.id}" edge="1" parent="${parentId}" source="${e.source}" target="${e.target}" data-edge-routing="${e.routing??'orthogonal'}" style="noEdgeStyle=1;rounded=${e.routing==='straight'?0:1};html=0;endArrow=block;strokeWidth=${1.5*(e.metricScale??1)};strokeColor=${blocked ? '#c54747' : colors.ink};${blocked ? 'dashed=1;' : colors.sketch}exitX=${from[0]};exitY=${from[1]};entryX=${to[0]};entryY=${to[1]};exitPerimeter=${fixed(source)?0:1};entryPerimeter=${fixed(target)?0:1};"><mxGeometry relative="1" as="geometry"><Array as="points">${points}</Array></mxGeometry></mxCell>`)
  }
  for(const warning of legendVisibility.warnings){const c=doc.containers.find(c=>c.id===warning.containerId)!;cells.push(`<mxCell id="${uniqueId('legend-warning')}" value="共享图例已停用 · 已恢复各图图例" vertex="1" parent="${c.id}" style="shape=text;html=0;fontSize=12;fontColor=#b45309;"><mxGeometry x="8" y="4" width="${Math.max(1,c.width-16)}" height="24" as="geometry"/></mxCell>`)}
  for(const warning of colorbarVisibility.warnings){const c=doc.containers.find(c=>c.id===warning.containerId)!;cells.push(`<mxCell id="${uniqueId('colorbar-warning')}" value="共享色标已停用 · 已恢复各图色标" vertex="1" parent="${c.id}" style="shape=text;html=0;fontSize=12;fontColor=#b45309;"><mxGeometry x="8" y="4" width="${Math.max(1,c.width-16)}" height="24" as="geometry"/></mxCell>`)}
  return `<?xml version="1.0" encoding="UTF-8"?><mxfile host="FastFigure"><diagram id="figure" name="${escapeXml(doc.title)}"><mxGraphModel page="1" pageWidth="1000" pageHeight="620"><root>${cells.join('')}</root></mxGraphModel></diagram></mxfile>`
}
export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
