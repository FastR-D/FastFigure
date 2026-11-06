import { describe, expect, it } from 'vitest'
import { DOMParser,XMLSerializer } from '@xmldom/xmldom'
import {deflateRawSync} from 'node:zlib'
import { importSvg, inspectSvg, type SvgImportOptions } from './svgImport'
import { clone, createBlank, parseDocument, type FigureNode } from './model'
import { movePathControl, movePathPoint, pathPoints, pointsData, setPathPoints, setPathSegment, splitPathSegment } from './paths'
import { multiply, parseTransform, transform } from './affine'
import { captureComponent, componentDocument, instantiateComponent, scaleComponent } from './assets'
import { createScene, exportSvg } from './svg'
import { contains, contentBounds, moveObjects, resizeObject, ungroupObject } from './geometry'
import { diffFigures } from './figureDiff'
import { parseHarnessResponse } from './harness'
import { reflowText } from './textGeometry'
import {gradientCoordinates} from './gradient'
const parseXml=(text:string)=>new DOMParser({onError:(_level,message)=>{throw new Error(message)}}).parseFromString(text,'image/svg+xml') as unknown as Document
const measure:SvgImportOptions['measure']=(label,s)=>({width:[...label].length*(s.size??16)*.5+(s.letterSpacing??0)*[...label].length,ascent:(s.size??16)*.8,descent:(s.size??16)*.2})
const options:SvgImportOptions={fileName:'architecture.svg',sha256:'a'.repeat(64),parseXml,measure}
const svg=(content:string,attrs='')=>`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200" ${attrs}>${content}</svg>`
const load=(content:string,extra:Partial<SvgImportOptions>={})=>importSvg(svg(content),{...options,...extra})
function valid(doc:ReturnType<typeof createBlank>){expect(()=>parseDocument(doc)).not.toThrow();for(const n of doc.nodes)expect(contains(contentBounds(doc.containers.find(c=>c.id===n.parentId)!),n),n.id).toBe(true)}
function geometry(){const doc=createBlank();doc.containers[0]={id:'stage',parentId:null,role:'component',title:'Curve',x:0,y:0,width:400,height:250};const n:FigureNode={id:'curve',parentId:'stage',kind:'path',label:'Curve',x:10,y:10,width:200,height:100,path:{points:[{x:0,y:0},{x:1,y:1,c1:{x:.1,y:1},c2:{x:.9,y:0}}],arrow:'none'}};doc.nodes=[n];return{doc,n}}
const bezier=(a:{x:number;y:number},b:NonNullable<FigureNode['path']>['points'][number],t:number)=>{const q=b.c1!,r=b.c2??q;return b.c2?{x:(1-t)**3*a.x+3*(1-t)**2*t*q.x+3*(1-t)*t*t*r.x+t**3*b.x,y:(1-t)**3*a.y+3*(1-t)**2*t*q.y+3*(1-t)*t*t*r.y+t**3*b.y}:{x:(1-t)**2*a.x+2*(1-t)*t*q.x+t*t*b.x,y:(1-t)**2*a.y+2*(1-t)*t*q.y+t*t*b.y}}
describe('native curves and affine geometry',()=>{
  it('composes SVG transforms in order, handles pivots and rejects malformed or singular matrices',()=>{
    expect(transform({x:1,y:2},parseTransform('translate(10 20) scale(2)'))).toEqual({x:12,y:24})
    const p=transform({x:20,y:10},parseTransform('rotate(90,10,10)'));expect(p.x).toBeCloseTo(10);expect(p.y).toBeCloseTo(20)
    expect(multiply([1,0,0,1,10,0],[2,0,0,2,0,0])).toEqual([2,0,0,2,10,0])
    for(const value of ['scale(0)','translate(no)','foo(1)','translate(1) junk','matrix(1 0 0 0 0 0)'])expect(()=>parseTransform(value)).toThrow()
  })
  it('splits cubic and quadratic curves exactly with De Casteljau',()=>{
    for(const cubic of [true,false]){const {doc,n}=geometry();if(!cubic)delete n.path!.points[1]!.c2
      const before=pathPoints(doc,n);splitPathSegment(n,pathPoints(doc,n),0);const after=pathPoints(doc,n)
      for(const t of [.1,.25,.5,.75,.9]){const expected=bezier(before[0]!,before[1]!,t),actual=t<=.5?bezier(after[0]!,after[1]!,t*2):bezier(after[1]!,after[2]!,(t-.5)*2);expect(actual.x).toBeCloseTo(expected.x,8);expect(actual.y).toBeCloseTo(expected.y,8)}
      valid(doc);expect(pointsData(after)).toContain(cubic?'C':'Q')
    }
  })
  it('edits controls, converts segment types and keeps closed duplicated endpoints together',()=>{
    const {doc,n}=geometry();movePathControl(doc,n.id,1,'c1',{x:45,y:70});expect(pathPoints(doc,n)[1]!.c1).toEqual({x:45,y:70})
    setPathSegment(doc,n.id,1,'line');expect(n.path!.points[1]!.c1).toBeUndefined();setPathSegment(doc,n.id,1,'quadratic');expect(n.path!.points[1]!.c1).toBeTruthy();setPathSegment(doc,n.id,1,'cubic');expect(n.path!.points[1]!.c2).toBeTruthy()
    setPathPoints(n,[{x:20,y:20},{x:100,y:90,c1:{x:100,y:20},c2:{x:100,y:80}},{x:20,y:20,close:true}]);movePathPoint(doc,n.id,0,{x:22,y:25});const points=pathPoints(doc,n);expect(points.at(-1)).toMatchObject({x:22,y:25,close:true});valid(doc)
    expect(()=>splitPathSegment(n,points,points.length-1)).toThrow()
  })
  it('validates control topology and excludes bindings on compound or closed paths',()=>{
    const {doc,n}=geometry();n.path!.points[0]!.c1={x:0,y:0};expect(()=>parseDocument(doc)).toThrow();delete n.path!.points[0]!.c1
    delete n.path!.points[1]!.c1;expect(()=>parseDocument(doc)).toThrow();delete n.path!.points[1]!.c2;n.path!.points[1]!.move=true;expect(()=>parseDocument(doc)).toThrow()
    n.path!.points[1]!.move=false;n.path!.points[1]!.close=true;n.path!.end={nodeId:'other',x:0,y:0};expect(()=>parseDocument(doc)).toThrow()
  })
})
describe('editable SVG ingestion',()=>{
  it('preserves affine linear fill/stroke fields using true curve bounds, CSS stops and local gradient inheritance through reuse and export',()=>{
    const matrix=parseTransform('matrix(1.5 .2 .7 .8 30 20)'),result=load('<defs><linearGradient id="base" x2="0" y2="1"><stop offset="0" style="stop-color:#ff0000;stop-opacity:.4"/><stop offset="1" stop-color="#0000ff"/></linearGradient><linearGradient id="shade" href="#base" spreadMethod="reflect"/></defs><path transform="matrix(1.5 .2 .7 .8 30 20)" d="M0 0Q50 200 100 0L100 100L0 100Z" fill="url(#shade)" stroke="url(#shade)"/>'),doc=result.asset.figure,node=doc.nodes[0]!,gradient=node.visual!.fillGradient!
    expect(gradient).toMatchObject({spread:'reflect',stops:[{offset:0,color:'#ff0000',opacity:.4},{offset:1,color:'#0000ff',opacity:1}]});expect(node.visual!.strokeGradient).toEqual(gradient);expect(node.visual!.strokeMatrix).toBeDefined()
    for(const point of [{x:0,y:0},{x:50,y:100},{x:100,y:25}]){const p=transform(transform(point,matrix),result.report.sourceTransform!),t=gradient.vector[0]*(p.x-node.x)/node.width+gradient.vector[1]*(p.y-node.y)/node.height+gradient.vector[2];expect(t).toBeCloseTo(point.y/100,9)}
    const scaled=scaleComponent(captureComponent(doc,'stage','Gradient'),.5),placed=instantiateComponent(createBlank(),scaled,'stage',true).document,copy=placed.nodes[0]!
    expect(copy.visual!.fillGradient).toEqual(gradient);const coords=gradientCoordinates(gradient,copy);expect(Object.values(coords).every(Number.isFinite)).toBe(true)
    const exported=exportSvg(placed),restored=importSvg(exported,{...options,sha256:'b'.repeat(64)}).asset.figure;expect(restored.nodes[0]!.visual!.fillGradient).toEqual(gradient);expect(exported).toContain('<linearGradient')
    const duplicate=clone(placed);duplicate.nodes.push({...clone(copy),id:'duplicate-gradient'});expect(()=>importSvg(exportSvg(duplicate),{...options,preferMetadata:false})).not.toThrow()
    const proposal=clone(placed);delete proposal.nodes[0]!.visual!.fillGradient;expect(parseHarnessResponse(JSON.stringify({message:'Keep paint',figure:proposal}),placed).figure!.nodes[0]!.visual!.fillGradient).toEqual(gradient);proposal.nodes[0]!.visual!.fillGradient=null;expect(parseHarnessResponse(JSON.stringify({message:'Solid',figure:proposal}),placed).figure!.nodes[0]!.visual!.fillGradient).toBeNull()
  })
  it('handles user-space stroke gradients on zero-height lines and degenerate fills, rejecting unsupported paint without partial import',()=>{
    const result=load('<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="20" y1="20" x2="180" y2="20"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient><linearGradient id="flat" x1="0" x2="0"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff" stop-opacity=".3"/></linearGradient></defs><line x1="20" y1="20" x2="180" y2="20" stroke="url(#g)"/><rect x="20" y="40" width="100" height="50" fill="url(#flat)"/>'),[line,rect]=result.asset.figure.nodes
    expect(line!.height).toBe(0);expect(Object.values(gradientCoordinates(line!.visual!.strokeGradient!,line!)).every(Number.isFinite)).toBe(true);expect(rect!.visual).toMatchObject({fill:'#0000ff',fillOpacity:.3});expect(rect!.visual!.fillGradient).toBeUndefined()
    for(const definitions of ['<linearGradient id="g" href="#g"/>','<radialGradient id="g"/>','<linearGradient id="g" href="#missing"/>'])expect(()=>load(`<defs>${definitions}</defs><rect width="100" height="50" fill="url(#g)"/>`)).toThrow()
  })
  it('imports basic shapes, native text and curves with exact source fingerprints and editable controls',()=>{
    const result=load('<rect id="box" x="10" y="10" width="100" height="60" rx="4" fill="#ebf4fa"/><circle cx="180" cy="40" r="20" fill="none" stroke="blue"/><text x="20" y="45" font-family="MiSans" font-size="18">Encoder</text><path d="M110 40 C130 20 140 70 160 40" fill="none" stroke="black"/>')
    expect(result.asset.figure.nodes.map(n=>n.kind)).toEqual(['rectangle','ellipse','text','path']);expect(result.report).toMatchObject({paths:1,texts:1,curves:1})
    expect(result.asset.sources).toHaveLength(1);expect(result.asset.sources[0]!.file).toEqual({format:'svg',fileName:options.fileName,sha256:options.sha256});valid(result.asset.figure)
    const xml=exportSvg(result.asset.figure);expect(xml).toContain('C');expect(xml).toContain('font-family="&quot;MiSans');expect(xml).not.toContain('<image')
  })
  it('handles nested transforms, viewBox, CSS cascade and translucent paint without flattening group alpha',()=>{
    const input=svg('<style>.node {fill:#faebcd;stroke:#aabbcc;stroke-width:2}.outer .node {fill:#112233}</style><g class="outer" transform="translate(20 10)" opacity=".5"><rect class="node" width="40" height="30" fill="red" style="stroke:#445566;fill-opacity:.4"/><path d="M0 0L20 20" stroke="black" fill="none" transform="scale(2 1)" stroke-dasharray="2,3" stroke-dashoffset="1"/></g>')
    const result=importSvg(input,options),doc=result.asset.figure
    expect(doc.nodes[0]!.visual).toMatchObject({fill:'#112233',stroke:'#445566',fillOpacity:.4,opacity:1});expect(doc.containers.find(c=>c.opacity)).toMatchObject({opacity:.5})
    expect(doc.nodes[1]!.visual?.strokeMatrix).toBeTruthy();const scene=JSON.stringify(createScene(doc,false));expect(scene).toContain('data-composite-group');expect(scene).toContain('stroke-dashoffset');expect(exportSvg(doc)).toContain('fill-opacity="0.4"')
    valid(doc)
  })
  it('supports compound evenodd contours, relative shorthand and arc conversion',()=>{
    const result=load('<path fill="#abcdef" fill-rule="evenodd" d="m0 0h100v100h-100z m20 20h60v60h-60z"/><path d="M120 20q10 20 20 0t20 0a10 10 0 0 1 20 0" stroke="black" fill="none"/>'),doc=result.asset.figure
    expect(doc.nodes[0]!.path!.points.filter(p=>p.close)).toHaveLength(2);expect(doc.nodes[0]!.path!.fillRule).toBe('evenodd');expect(doc.nodes[1]!.path!.points.some(p=>p.c2)).toBe(true);valid(doc)
    expect(exportSvg(doc)).toContain('fill-rule="evenodd"');
  })
  it('resolves local use and symbol viewports, and selects a source subgroup without its siblings',()=>{
    const input=svg('<defs><symbol id="sym" viewBox="0 0 20 10"><rect width="20" height="10" fill="blue"/></symbol></defs><g id="first" transform="translate(10 20)"><use href="#sym" width="80" height="40"/></g><g id="second"><circle cx="100" cy="50" r="10"/></g>')
    const inventory=inspectSvg(input,parseXml);expect(inventory.groups.map(g=>g.name)).toContain('first')
    const result=importSvg(input,{...options,group:inventory.groups.find(g=>g.name==='first')!.key});expect(result.asset.figure.nodes).toHaveLength(1);expect(result.asset.figure.nodes[0]!.width/result.asset.figure.nodes[0]!.height).toBeCloseTo(2);valid(result.asset.figure)
    const symbol=importSvg(input,{...options,group:inventory.groups.find(g=>g.name==='sym')!.key});expect(symbol.asset.figure.nodes).toHaveLength(1)
  })
  it('plans centered rich text as one chunk, preserves font weight, spacing, transforms and line resets',()=>{
    const result=load('<text x="150" y="50" font-family="Times New Roman" font-size="10" text-anchor="middle" transform="rotate(15 150 50)"><tspan>A</tspan><tspan font-weight="700" letter-spacing="1">BC</tspan><tspan x="150" y="70">D</tspan></text>'),doc=result.asset.figure
    expect(doc.nodes.map(n=>n.label)).toEqual(['A','BC','D']);expect(doc.nodes[1]!.textStyle!.weight).toBe(700);expect(doc.nodes[1]!.textStyle!.letterSpacing).toBeGreaterThan(0);expect(doc.nodes.every(n=>n.textLayout)).toBe(true)
    expect(doc.nodes[0]!.textLayout!.matrix[1]).toBeCloseTo(Math.sin(Math.PI/12));valid(doc)
    const baseline=(n:FigureNode)=>({x:n.x+n.width*n.textLayout!.x,y:n.y+n.height*n.textLayout!.y})
    const a=baseline(doc.nodes[0]!),b=baseline(doc.nodes[1]!);expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeCloseTo(5*result.report.scale)
    const before=clone(doc),n=doc.nodes[0]!,origin=baseline(n);n.label='A longer label';reflowText(n);expect(baseline(n).x).toBeCloseTo(origin.x);expect(diffFigures(before,doc).modified).toBe(1)
  })
  it('keeps text opacity as a composite, collapses default whitespace and omits hidden spans',()=>{
    const result=load('<text x="30" y="40" opacity=".5">  A <tspan>B</tspan><tspan visibility="hidden">X</tspan><tspan> C </tspan></text>');expect(result.asset.figure.nodes.map(n=>n.label)).toEqual(['A ','B',' C']);expect(result.asset.figure.containers.filter(c=>c.opacity===.5)).toHaveLength(1);valid(result.asset.figure)
  })
  it('retains visibility overrides inside hidden text and includes relative gaps in chunk alignment',()=>{
    const result=load('<text x="100" y="40" visibility="hidden"><tspan>Hidden</tspan><tspan visibility="visible">Visible</tspan></text><text x="100" y="70" text-anchor="middle" font-size="10"><tspan>A</tspan><tspan dx="10">B</tspan></text>'),doc=result.asset.figure
    expect(doc.nodes.map(n=>n.label)).toEqual(['Visible','A','B'])
    const a=doc.nodes[1]!,b=doc.nodes[2]!;expect(b.x-a.x).toBeCloseTo(15);expect(a.x).toBeCloseTo(doc.nodes[0]!.x-58)
    valid(doc)
  })
  it('remaps material IDs and preserves source identity through capture and reinsertion',()=>{
    const result=load('<g id="model"><rect width="70" height="40"/><text x="5" y="20">FFN</text></g>'),doc=componentDocument(result.asset),before=clone(doc)
    const root=doc.containers[0]!,group=doc.containers.find(c=>c.parentId==='stage')!;const saved=captureComponent(doc,group.id,'Again');expect(saved.sources.some(s=>s.file?.sha256===options.sha256)).toBe(true)
    moveObjects(doc,[group.id],3,3);valid(doc);expect(before.nodes).not.toEqual(doc.nodes)
    root.width=1000;root.height=620
    const inserted=instantiateComponent(createBlank(),saved,'stage');expect(new Set([...inserted.document.containers,...inserted.document.nodes].map(n=>n.id)).size).toBe(inserted.document.containers.length+inserted.document.nodes.length);valid(inserted.document)
  })
  it('restores FastFigure metadata exactly and explicitly falls back from invalid metadata',()=>{
    const result=load('<rect width="80" height="40"/><text x="5" y="20">Encoder</text>'),doc=componentDocument(result.asset),round=importSvg(exportSvg(doc),options)
    expect(round.report.mode).toBe('metadata');expect(round.asset.figure.nodes).toEqual(captureComponent(doc,'stage','Round').figure.nodes);expect(round.asset.figure.title).toBe(doc.title);expect(round.asset.figure.containers[0]!.title).toBe(doc.containers[0]!.title);expect(round.asset.sources.some(s=>s.file)).toBe(true)
    const fallback=load('<metadata>{"version":"0.2","nodes":[]}</metadata><rect width="80" height="40"/>');expect(fallback.report.mode).toBe('svg');expect(fallback.report.warnings.join()).toContain('元数据不可恢复')
  })
  it('resizes affine glyphs with their selection bounds, and guards composite ungrouping',()=>{
    const result=load('<g opacity=".5"><text x="20" y="40" transform="rotate(10)">Label</text></g>'),doc=result.asset.figure,n=doc.nodes[0]!,before=clone(n),group=doc.containers.find(c=>c.opacity===.5)!
    resizeObject(doc,n.id,n.width+8,n.height+4);expect(n.textLayout!.matrix[0]).toBeCloseTo(before.textLayout!.matrix[0]*n.width/before.width);expect(n.textLayout!.matrix[1]).toBeCloseTo(before.textLayout!.matrix[1]*n.height/before.height)
    expect(()=>ungroupObject(doc,group.id)).toThrow('100%');group.opacity=1;expect(()=>ungroupObject(doc,group.id)).not.toThrow();valid(doc)
  })
  it('preserves SVG typography, path geometry, composite opacity and source through model revisions',()=>{
    const result=load('<g opacity=".6"><text x="10" y="50" font-family="Times New Roman" font-weight="500">Layer</text><path d="M0 70C10 40 20 90 30 70"/></g>'),original=result.asset.figure,candidate=clone(original)
    const text=candidate.nodes.find(n=>n.kind==='text')!;text.label='Block';delete text.textLayout;delete text.textStyle
    const curve=candidate.nodes.find(n=>n.path)!;delete curve.path;delete curve.name;for(const c of candidate.containers)delete c.opacity
    const proposal=parseHarnessResponse(JSON.stringify({message:'Updated',figure:candidate}),original).figure!
    expect(proposal.nodes.find(n=>n.kind==='text')!.textLayout).toEqual(original.nodes.find(n=>n.kind==='text')!.textLayout);expect(proposal.nodes.find(n=>n.path)!.path).toEqual(original.nodes.find(n=>n.path)!.path);expect(proposal.containers.find(c=>c.opacity)!.opacity).toBe(.6)
  })
  it('reports source markers as adapted editable arrows',()=>{
    const result=load('<defs><marker id="a"><path d="M0 0L10 5L0 10Z"/></marker></defs><path d="M0 0L100 0" fill="none" stroke="black" marker-end="url(#a)"/>');expect(result.asset.figure.nodes[0]!.path!.arrow).toBe('filled');expect(result.report.warnings.join()).toContain('标准可编辑箭头')
  })
  it.each([
    '<script>alert(1)</script>','<image href="https://invalid.test/x.png"/>','<foreignObject/>','<rect width="10" height="10" onclick="a()"/>','<use href="https://invalid.test/x.svg#x"/>',
    '<path d="M0 0X10 20"/>','<rect width="20" height="10" fill="url(#g)"/>','<g clip-path="url(#clip)"><rect width="20" height="20"/></g>',
    '<style>@import "https://invalid.test/x.css";</style>','<style>rect:hover {fill:red}</style>','<text x="1 2" y="20">A</text>',
    '<text><tspan transform="rotate(20)">A</tspan></text>','<defs><g id="a"><use href="#a"/></g></defs><use href="#a"/>',
    '<rect id="same" width="10" height="10"/><rect id="same" width="10" height="10"/>','<text style="baseline-shift:super">A</text>',
  ])('rejects unsupported or active content without accepting a partial figure: %s',content=>{expect(()=>load(content)).toThrow()})
  it('rejects malformed XML, DTD and size or path capacity overflows',()=>{
    expect(()=>importSvg('<!DOCTYPE svg><svg/>',options)).toThrow();expect(()=>importSvg('<svg><g></svg>',options)).toThrow();expect(()=>importSvg('x'.repeat(2_000_001),options)).toThrow()
    expect(()=>load(`<path d="M0 0${Array.from({length:129},(_,i)=>`L${i} 20`).join('')}"/>`)).toThrow('128')
    expect(()=>load(Array.from({length:241},(_,i)=>`<rect x="${i}" width="1" height="1"/>`).join(''))).toThrow('240')
    expect(()=>load('<g>'.repeat(7)+'<rect width="10" height="10"/>'+'</g>'.repeat(7))).toThrow()
  })
})

describe('native draw.io source ingestion',()=>{
  const graph='<mxGraphModel pageWidth="640" pageHeight="360"><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="group" parent="1" vertex="1" style="group;"><mxGeometry x="100" y="60" width="440" height="180" as="geometry"/></mxCell><mxCell id="encoder" parent="group" vertex="1" value="&lt;b&gt;Encoder&lt;/b&gt;&lt;br/&gt;keys" style="rounded=1;arcSize=10;fillColor=#dceefa;strokeColor=#1f3344;fontFamily=MiSans;fontSize=14;html=1;whiteSpace=wrap;"><mxGeometry x="20" y="30" width="100" height="60" as="geometry"/></mxCell><mxCell id="decoder" parent="group" vertex="1" value="Decoder" style="ellipse;fillColor=#edf6ed;strokeColor=#1f3344;fontFamily=MiSans;fontSize=14;"><mxGeometry x="260" y="30" width="100" height="60" as="geometry"/></mxCell><mxCell id="flow" parent="group" edge="1" source="encoder" target="decoder" style="endArrow=block;strokeColor=#334455;exitX=1;exitY=0.5;exitPerimeter=0;entryX=0;entryY=0.5;entryPerimeter=0;"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="200" y="60"/></Array></mxGeometry></mxCell></root></mxGraphModel>'
  const settings={...options,parseHtml:(source:string)=>new DOMParser().parseFromString(source,'text/html') as unknown as Document,serializeXml:(element:Element)=>new XMLSerializer().serializeToString(element as never)}
  it('imports four gradient directions and independent alpha while retaining source-bound connections',async()=>{
    const {importDrawio}=await import('./drawioImport'),source=(direction:string,extra='')=>graph.replace('fillColor=#dceefa',`fillColor=#ff0000;gradientColor=#0000ff;gradientDirection=${direction};opacity=60;fillOpacity=50;strokeOpacity=40;${extra}`)
    for(const [direction,vector] of [['east',[1,0,0]],['south',[0,1,0]],['west',[-1,0,1]],['north',[0,-1,1]]] as const){
      const loaded=await importDrawio(source(direction),settings),doc=loaded.asset.figure,node=doc.nodes.find(n=>n.name==='drawio-cell-3-shape')!
      expect(loaded.report.boundEnds).toBe(2);expect(node.visual).toMatchObject({opacity:1,fillOpacity:.3,strokeOpacity:.24,fillGradient:{stops:[{color:'#ff0000'},{color:'#0000ff'}]}});node.visual!.fillGradient!.vector.forEach((value,i)=>expect(value).toBeCloseTo(vector[i]!,10))
    }
    const turned=await importDrawio(source('south','direction=north'),settings);expect(turned.asset.figure.nodes.find(n=>n.name==='drawio-cell-3-shape')!.visual!.fillGradient!.vector[0]).toBeCloseTo(1)
    await expect(importDrawio(source('diagonal'),settings)).rejects.toThrow('方向')
  })
  it('limits swimlane gradients to the rounded header while retaining body fill and logical endpoint bounds',async()=>{
    const {importDrawio}=await import('./drawioImport'),source=graph.replace('rounded=1;arcSize=10;fillColor=#dceefa','swimlane;rounded=1;startSize=24;fillColor=#ff0000;gradientColor=#0000ff;swimlaneFillColor=#ddffee'),loaded=await importDrawio(source,settings),doc=loaded.asset.figure,header=doc.nodes.find(n=>n.name==='drawio-cell-3-shape')!,body=doc.nodes.find(n=>n.name==='drawio-cell-3-body')!,edge=doc.nodes.find(n=>n.name==='drawio-cell-5-edge')!,anchor=doc.nodes.find(n=>n.id===edge.path!.start!.nodeId)!
    expect(header.height).toBeCloseTo(24);expect(header.visual!.fillGradient!.vector[1]).toBeCloseTo(1);expect(body.visual!.fill).toBe('#ddffee');expect(body.visual!.fillGradient).toBeUndefined();expect(body.height).toBeCloseTo(36);expect(anchor).toMatchObject({kind:'rectangle',width:100,height:60,visual:{opacity:0}});expect(loaded.report.boundEnds).toBe(2)
    const saved=clone(doc);moveObjects(doc,[header.parentId],12,0);expect(pathPoints(doc,edge)[0]!.x).toBeCloseTo(pathPoints(saved,saved.nodes.find(n=>n.id===edge.id)!)[0]!.x+12);expect(header.visual!.fillGradient).toEqual(saved.nodes.find(n=>n.id===header.id)!.visual!.fillGradient)
    await expect(importDrawio(source.replace('startSize=24','horizontal=0;startSize=24'),settings)).rejects.toThrow('泳道');await expect(importDrawio(source.replace('startSize=24','opacityGroup=1;startSize=24'),settings)).rejects.toThrow('透明度')
  })
  it('decodes raw/compressed multi-page sources, retains nested geometry, rich text, native endpoint motion and page/object provenance through material reuse',async()=>{
    const {inspectDrawio,prepareDrawio,importPreparedDrawio}=await import('./drawioImport'),compressed=deflateRawSync(encodeURIComponent(graph)).toString('base64'),source=`<mxfile><diagram id="arch" name="Architecture">${graph}</diagram><diagram id="same" name="Compressed">${compressed}</diagram></mxfile>`,inventory=await inspectDrawio(source,settings)
    expect(inventory.pages.map(page=>page.name)).toEqual(['Architecture','Compressed'])
    const first=importPreparedDrawio(prepareDrawio(inventory,'page-0',settings),settings),second=importPreparedDrawio(prepareDrawio(inventory,'page-1',settings),settings),doc=first.asset.figure,encoder=doc.nodes.find(node=>node.name==='drawio-cell-3-shape')!,decoder=doc.nodes.find(node=>node.name==='drawio-cell-4-shape')!,edge=doc.nodes.find(node=>node.name==='drawio-cell-5-edge')!
    expect(first.report).toMatchObject({mode:'drawio',connections:1,boundEnds:2,unboundEnds:0});expect(encoder).toMatchObject({kind:'rectangle',x:36,y:46,width:100,height:60,visual:{fill:'#dceefa'}});expect(decoder.kind).toBe('ellipse');expect(edge.path).toMatchObject({arrow:'filled',start:{nodeId:encoder.id,x:1,y:.5},end:{nodeId:decoder.id,x:0,y:.5}});expect(pathPoints(doc,edge)[0]).toEqual({x:136,y:76});expect(pathPoints(doc,edge).at(-1)).toEqual({x:276,y:76})
    expect(doc.nodes.find(node=>node.label==='Encoder')!.textStyle).toMatchObject({weight:700,family:'MiSans'});expect(doc.nodes.some(node=>node.label==='keys')).toBe(true);expect(encoder.evidence!.file).toMatchObject({format:'drawio',page:{index:0,id:'arch',name:'Architecture'},objectId:'encoder'});expect(second.asset.sources[0]!.file!.page!.id).toBe('same');expect(second.asset.figure.nodes.map(node=>[node.name,node.x,node.y,node.width,node.height,node.label])).toEqual(doc.nodes.map(node=>[node.name,node.x,node.y,node.width,node.height,node.label]))
    const moved=clone(doc);moveObjects(moved,[encoder.parentId],15,0);expect(pathPoints(moved,moved.nodes.find(node=>node.id===edge.id)!)[0]!.x).toBe(151);expect(pathPoints(moved,moved.nodes.find(node=>node.id===edge.id)!).at(-1)).toEqual({x:276,y:76});expect(encoder.x).toBe(36)
    const placed=instantiateComponent(createBlank(),first.asset,'stage').document,recaptured=captureComponent(placed,placed.containers.find(container=>container.id!=='stage')!.id,'Again');expect(recaptured.sources.some(source=>source.file?.page?.id==='arch')).toBe(true);expect(recaptured.figure.nodes.find(node=>node.path?.start)!.path!.start!.nodeId).not.toBe(encoder.id);expect(exportSvg(recaptured.figure)).toContain('drawio');valid(recaptured.figure)
    const small=instantiateComponent(createBlank(),scaleComponent(first.asset,.4),'stage').document,both=instantiateComponent(small,scaleComponent(second.asset,.4),'stage').document,collected=captureComponent(both,'stage','Two source pages');expect(collected.sources.filter(source=>source.file?.format==='drawio').map(source=>source.file!.page!.id).sort()).toEqual(['arch','same']);expect(collected.sources.filter(source=>source.file).every(source=>!source.file!.objectId)).toBe(true)
    const prepared=prepareDrawio(await inspectDrawio(graph.replace('id="flow"','id="flow" value="Flow"'),settings),'page-0',settings),edgeGroup=prepared.inventory.groups.find(group=>group.name==='Flow')!,fragment=importPreparedDrawio(prepared,{...settings,group:edgeGroup.key});expect(fragment.report).toMatchObject({connections:1,boundEnds:0,unboundEnds:2});expect(fragment.asset.figure.nodes.find(node=>node.path)!.path!.start).toBeUndefined();valid(fragment.asset.figure)
    const embedded=`<svg xmlns="http://www.w3.org/2000/svg" content="${source.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;')}"/>`;expect((await inspectDrawio(embedded,settings)).pages.map(page=>page.id)).toEqual(['arch','same'])
  })
  it('keeps mxGraph label offset direction and endpoint bindings when automatic routing changes the line, while absolute labels ignore geometry x/y',async()=>{
    const {inspectDrawio,prepareDrawio,importPreparedDrawio}=await import('./drawioImport'),labeled=graph.replace('id="flow"','id="flow" value="Flow"').replace('endArrow=block;','edgeStyle=orthogonalEdgeStyle;endArrow=block;').replace('x="260" y="30"','x="260" y="110"').replace('<mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="200" y="60"/></Array></mxGeometry>','<mxGeometry x="-0.5" y="12" relative="1" as="geometry"/>'),pages=await inspectDrawio(labeled,settings),prepared=prepareDrawio(pages,'page-0',settings),connection=prepared.drawing.connections[0]!
    const start=connection.source!.point,end=connection.target!.point,length=Math.hypot(end.x-start.x,end.y-start.y)
    expect(connection.label!.point.x).toBeCloseTo(start.x+(end.x-start.x)/4+(end.y-start.y)/length*12);expect(connection.label!.point.y).toBeCloseTo(start.y+(end.y-start.y)/4-(end.x-start.x)/length*12)
    const unchanged=importPreparedDrawio({...prepared,drawing:{...prepared.drawing,connections:[{...connection,automatic:false}]}},settings),routed=importPreparedDrawio(prepared,settings),label=(result:typeof routed)=>result.asset.figure.nodes.find(node=>node.label==='Flow')!,path=routed.asset.figure.nodes.find(node=>node.path?.start)!,points=pathPoints(routed.asset.figure,path)
    expect(routed.report).toMatchObject({rerouted:1,boundEnds:2,unboundEnds:0});expect(points.slice(1).every((p,i)=>Math.abs(p.x-points[i]!.x)<1e-6||Math.abs(p.y-points[i]!.y)<1e-6)).toBe(true);expect(Math.hypot(label(routed).x-label(unchanged).x,label(routed).y-label(unchanged).y)).toBeGreaterThan(5);expect(routed.asset.figure.nodes.map(node=>node.evidence)).toEqual(unchanged.asset.figure.nodes.map(node=>node.evidence));valid(routed.asset.figure)
    const absolute=prepareDrawio(await inspectDrawio(labeled.replace('x="-0.5" y="12" relative="1"','x="900" y="999" relative="0"'),settings),'page-0',settings).drawing.connections[0]!
    expect(absolute.label!.point).toEqual({x:(start.x+end.x)/2,y:(start.y+end.y)/2})
  })
  it('imports embedded SVG vectors, and rejects malformed topology, active labels, unsupported visual effects and decompression overflow without partial success',async()=>{
    const {inspectDrawio,importDrawio}=await import('./drawioImport'),embedded=svg('<rect x="20" y="20" width="100" height="60" fill="#dceefa"/><path d="M120 50C150 20 160 70 190 50" stroke="#123456" fill="none"/><text x="30" y="50" font-size="16">Editable</text>'),source=graph.replace(/style="rounded=1;[^"]+"/,`style="shape=image;image=data:image/svg+xml,${encodeURIComponent(embedded)};"`),roundtrip=await importDrawio(source,settings)
    expect(roundtrip.asset.figure.nodes.some(node=>node.kind==='text'&&node.label==='Editable')).toBe(true);expect(roundtrip.asset.figure.nodes.some(node=>node.path?.points.some(point=>point.c1))).toBe(true);expect(exportSvg(roundtrip.asset.figure)).not.toContain('<image');valid(roundtrip.asset.figure)
    for(const source of [graph.replace('parent="group"','parent="missing"'),graph.replace('id="decoder"','id="encoder"'),graph.replace('parent="1" vertex="1"','parent="encoder" vertex="1"'),graph.replace('endArrow=block','startArrow=block;endArrow=block')])await expect(importDrawio(source,settings)).rejects.toThrow()
    const activeLabel=graph.replace('&lt;b&gt;Encoder&lt;/b&gt;','&lt;img src=&quot;https://example.org/remote.png&quot;/&gt;');await expect(importDrawio(activeLabel,settings)).rejects.toThrow('活动或外部内容')
    const clipped='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><defs><clipPath id="c"><rect width="20" height="20"/></clipPath></defs><g clip-path="url(#c)"><rect width="100" height="60" fill="red"/></g></svg>',image=graph.replace(/style="rounded=1;[^"]+"/,`style="shape=image;image=data:image/svg+xml,${encodeURIComponent(clipped)};"`);await expect(importDrawio(image,settings)).rejects.toThrow('clip-path')
    await expect(importDrawio(graph.replace('id="1" parent="0"','id="1" parent="0" visible="0"'),settings)).rejects.toThrow('没有')
    await expect(inspectDrawio('<!DOCTYPE mxfile><mxfile/>',settings)).rejects.toThrow('声明');await expect(inspectDrawio('<mxfile><diagram>not a compressed page!</diagram></mxfile>',settings)).rejects.toThrow();const overflow=deflateRawSync('A'.repeat(8_000_001)).toString('base64');await expect(inspectDrawio(`<mxfile><diagram>${overflow}</diagram></mxfile>`,settings)).rejects.toThrow('8 MB')
  })
})
