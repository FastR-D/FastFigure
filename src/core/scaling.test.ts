import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { scaleSubtree } from './scaling'
import { captureComponent, componentDocument, instantiateComponent, scaleComponent } from './assets'
import { anchor, clone, createBlank, createExample, parseDocument } from './model'
import { catalogueAsset, composeCatalogue } from './catalogue'
import { buildRecipe } from '../data/recipes'
import { addComponentPort, updateComponentPort } from './componentPorts'
import { expandStructure } from './expandStructure'
import { pathPoints } from './paths'
import { exportSvg } from './svg'
import { exportDrawio } from './export'
import { diffFigures } from './figureDiff'
import { parseHarnessResponse } from './harness'
import { createEditor } from '../composables/useEditor'
import { ungroupObject } from './geometry'
import { defaultLayoutOptions, layoutContainer } from './layout'
const blank=()=>createBlank()
afterEach(()=>vi.unstubAllGlobals())
describe('whole component scaling',()=>{
  it('scales the entire hierarchy and default font metrics around the selected center without mutating the source',()=>{
    const doc=createExample(),before=clone(doc),root=doc.containers[0]!,scaled=scaleSubtree(doc,'stage',.5).document,next=scaled.containers[0]!
    expect(doc).toEqual(before);expect(next.x+next.width/2).toBe(root.x+root.width/2);expect(next.y+next.height/2).toBe(root.y+root.height/2)
    for(const n of scaled.nodes){const old=doc.nodes.find(p=>p.id===n.id)!;expect(n.width).toBe(old.width*.5);expect(n.x-next.x).toBe((old.x-root.x)*.5);expect(n.textStyle?.size).toBe(8);expect(n.metricScale).toBe(.5)}
    expect(scaled.nodes.find(n=>n.id==='encoder')?.descriptionStyle?.size).toBe(5.5)
    expect(scaled.edges.every(e=>e.metricScale===.5)).toBe(true);expect(()=>parseDocument(scaled)).not.toThrow()
    expect(exportSvg(scaled)).toContain('scale(0.5)');expect(exportDrawio(scaled)).toContain('image=data:image/svg+xml')
  })
  it('keeps the top left corner and independently scales primitive, structured and nested assets',()=>{
    const assets=[...['shape-circle','volume','encoder'].map(id=>catalogueAsset({kind:'seed',id})),buildRecipe('fusion',{branches:3,operator:'concat',feature:'volume'})]
    for(const asset of assets){const before=clone(asset),small=scaleComponent(asset,.5),large=scaleComponent(asset,1.5)
      expect(small.figure.containers[0]!.x).toBe(0);expect(small.figure.nodes[0]!.width).toBe(asset.figure.nodes[0]!.width*.5);expect(()=>instantiateComponent(blank(),small,'stage')).not.toThrow();expect(()=>parseDocument(large.figure)).not.toThrow();expect(asset).toEqual(before)}
  })
  it('preserves Bézier coordinates, binding offsets and named boundary interfaces',()=>{
    const doc=blank();doc.containers.push({id:'native',parentId:'stage',role:'component',title:'Native',x:120,y:180,width:320,height:200,visual:{fill:'none',stroke:'none'}})
    doc.nodes=[{id:'shape',parentId:'native',kind:'rectangle',label:'x',x:140,y:210,width:80,height:50},{id:'curve',parentId:'native',kind:'path',label:'curve',x:220,y:230,width:100,height:80,path:{points:[{x:0,y:0},{x:1,y:1,c1:{x:.2,y:1},c2:{x:.8,y:0}}],arrow:'open',start:{nodeId:'shape',x:1,y:.4,offsetX:3}},visual:{stroke:'#123456',strokeWidth:2,dash:[3,5],dashOffset:1}}]
    const port=addComponentPort(doc,'native','output','port');updateComponentPort(doc,port.id,{key:'features',position:.3});doc.nodes.push({id:'external',parentId:'stage',kind:'module',label:'Outside',x:650,y:230,width:100,height:70});doc.edges.push({id:'external-edge',source:'port',target:'external',sourcePort:'right',targetPort:'left'})
    const source=parseDocument(doc),beforePoints=pathPoints(source,source.nodes.find(n=>n.id==='curve')!),scaled=scaleSubtree(source,'native',.5,'top-left').document,curve=scaled.nodes.find(n=>n.id==='curve')!
    const points=pathPoints(scaled,curve);expect(points[0]!.x).toBeCloseTo(120+(beforePoints[0]!.x-120)*.5);expect(points[1]!.c1!.y).toBeCloseTo(180+(beforePoints[1]!.c1!.y-180)*.5)
    expect(curve.path!.start!.offsetX).toBe(1.5);expect(curve.visual).toMatchObject({stroke:'#123456',strokeWidth:1,dash:[1.5,2.5],dashOffset:.5})
    const socket=scaled.nodes.find(n=>n.id==='port')!;expect(socket.socket).toEqual(port.socket);expect(anchor(socket,'right')).toEqual([280,210]);expect(scaled.edges[0]).toEqual(source.edges[0]);expect(scaled.nodes.find(n=>n.id==='external')).toEqual(source.nodes.find(n=>n.id==='external'))
  })
  it('keeps transformed text matrices and scales actual sizes without baking in the current palette',()=>{
    const doc=blank();doc.nodes.push({id:'text',parentId:'stage',kind:'text',label:'Rotated',x:100,y:200,width:70,height:40,textLayout:{x:.2,y:.8,matrix:[0,1,-1,0]},textStyle:{family:'Inter',size:20,letterSpacing:2},visual:{textTone:'ink',colorIndex:2,stroke:'none',fill:'none',strokeWidth:1}})
    const scaled=scaleSubtree(doc,'stage',.5).document,n=scaled.nodes[0]!
    expect(n.textLayout).toEqual(doc.nodes[0]!.textLayout);expect(n.textStyle).toMatchObject({size:10,letterSpacing:1});expect(n.textStyle?.color).toBeUndefined();expect(exportSvg(scaled)).toContain('font-size="10"')
  })
  it('expands a scaled scientific module into native editable geometry at the same scale',()=>{
    const doc=blank();doc.nodes=[{id:'encoder',parentId:'stage',kind:'module',label:'Encoder',x:140,y:200,width:184,height:164,structure:{type:'encoder',repeats:6}}]
    const scaled=scaleSubtree(doc,'stage',.5).document,result=expandStructure(scaled,'encoder').document
    const group=result.containers.find(c=>c.structureOrigin)!;expect(group.metricScale).toBe(.5);expect(group.width).toBe(92);expect(result.nodes.find(n=>n.interfaceFor===group.id)).toBeTruthy();expect(()=>parseDocument(result)).not.toThrow()
    expect(result.nodes.some(n=>n.path?.start)).toBe(true)
  })
  it('preserves geometry on reciprocal scaling and keeps identity operations exact',()=>{
    const doc=createExample(),same=scaleSubtree(doc,'stage',1).document;expect(same).toEqual(doc);expect(same).not.toBe(doc)
    const next=scaleSubtree(scaleSubtree(doc,'stage',.5).document,'stage',2).document
    for(const n of next.nodes){const old=doc.nodes.find(o=>o.id===n.id)!;for(const key of ['x','y','width','height'] as const)expect(n[key]).toBeCloseTo(old[key])}
  })
  it('rejects bounds, cumulative scale and actual font limits atomically',()=>{
    const doc=createExample(),before=clone(doc);expect(()=>scaleSubtree(doc,'stage',1.5)).toThrow('超出');expect(()=>scaleSubtree(doc,'stage',NaN)).toThrow('比例');expect(()=>scaleSubtree(doc,'encoder',.5)).toThrow('容器');expect(doc).toEqual(before)
    const big=blank();big.nodes=[{id:'large',parentId:'stage',kind:'text',label:'Title',x:100,y:200,width:200,height:150,textStyle:{size:256}}];expect(()=>scaleSubtree(big,'stage',.1)).not.toThrow()
    const asset=captureComponent(big,'stage','Large');expect(()=>scaleComponent(scaleComponent(asset,.5),3)).toThrow()
    const small=scaleSubtree(doc,'stage',.1).document;expect(()=>scaleSubtree(small,'stage',.1)).toThrow()
  })
  it('compiles scaled model instances and preserves scale fields in follow-up responses and diff review',()=>{
    const entry={kind:'seed' as const,id:'encoder'},base=blank(),composed=composeCatalogue(base,[entry],[{id:'enc',componentKey:'seed:encoder',parentId:'stage',x:90,y:180,scale:.5,keepAppearance:true}],[])
    expect(composed.used[0]?.scale).toBe(.5);const node=composed.figure.nodes[0]!;expect(node.width).toBe(92)
    const editable=clone(composed.figure);delete editable.nodes[0]!.metricScale;delete editable.containers.find(c=>c.id==='enc')!.metricScale
    const result=parseHarnessResponse(JSON.stringify({message:'改字',figure:editable}),composed.figure,[entry]);expect(result.figure!.nodes[0]!.metricScale).toBe(.5)
    const scaled=scaleSubtree(createExample(),'stage',.5).document,diff=diffFigures(createExample(),scaled);expect(diff.changes.filter(c=>c.kind==='edge').length).toBe(5)
  })
  it('applies one undoable edit and rejects invalid previews without touching history',()=>{
    const storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)})
    const scope=effectScope();try{scope.run(()=>{const editor=createEditor(),before=clone(editor.figure.value);expect(editor.applyScale('stage',1.5,'center')).toBe(false);expect(editor.past.value).toHaveLength(0);expect(editor.applyScale('stage',.5,'center')).toBe(true);expect(editor.past.value).toHaveLength(1);editor.undo();expect(editor.figure.value).toEqual(before);editor.redo();editor.save();expect(JSON.parse(storage.get('fastfigure.project.v2')!).nodes[0].metricScale).toBe(.5)})}finally{scope.stop()}
  })
  it('recaptures a scaled library asset and keeps both inserted copies independently editable',()=>{
    const asset=scaleComponent(buildRecipe('pipeline',{stages:3,direction:'row'}),.5),first=instantiateComponent(blank(),asset,'stage'),second=instantiateComponent(first.document,asset,'stage')
    const captured=captureComponent(second.document,first.containerId,'Small pipeline'),standalone=componentDocument(captured)
    expect(standalone.nodes[0]!.metricScale).toBe(.5);expect(captured.lineage).toHaveLength(1);expect(second.document.nodes.filter(n=>n.parentId===second.containerId).every(n=>n.metricScale===.5)).toBe(true)
  })
  it('preserves scaled frame details when ungrouping expanded structure and small native shapes',()=>{
    const asset=catalogueAsset({kind:'seed',id:'encoder'}),expanded=expandStructure(asset.figure,'encoder'),small=scaleComponent(captureComponent(expanded.document,expanded.containerId,'Native'),.5),inserted=instantiateComponent(blank(),small,'stage')
    const proxy=inserted.document.nodes.find(n=>n.interfaceFor===inserted.containerId)!,before=clone(inserted.document)
    ungroupObject(inserted.document,inserted.containerId);expect(inserted.document.nodes.find(n=>n.id===proxy.id)).toMatchObject({kind:'rectangle',metricScale:.5});expect(()=>parseDocument(inserted.document)).not.toThrow();expect(before.containers.length).toBe(inserted.document.containers.length+1)
    const tiny=blank();tiny.containers.push({id:'tiny',parentId:'stage',role:'component',title:'Tiny',x:100,y:200,width:5,height:5});tiny.nodes=[{id:'dot',kind:'rectangle',label:'',parentId:'tiny',x:102,y:202,width:1,height:1}];const scaled=scaleSubtree(tiny,'tiny',.1,'top-left').document;ungroupObject(scaled,'tiny');expect(()=>parseDocument(scaled)).not.toThrow();expect(scaled.nodes.find(n=>n.id==='tiny')?.metricScale).toBe(.1)
  })
  it('fits scaled nested containers using their actual header and inset sizes',()=>{
    const doc=blank();doc.containers.push({id:'group',parentId:'stage',role:'group',title:'Branch',x:100,y:180,width:300,height:200});doc.nodes=[{id:'inside',parentId:'group',kind:'module',label:'Compute',x:130,y:250,width:100,height:60}]
    const scaled=scaleSubtree(doc,'stage',.5).document,result=layoutContainer(scaled,'stage',{...defaultLayoutOptions,recursive:true,fitContainers:true}),group=result.document.containers.find(c=>c.id==='group')!
    expect(group.metricScale).toBe(.5);expect(group.width).toBe(100);expect(group.height).toBe(60);expect(result.document.nodes[0]!.width).toBe(50);expect(()=>parseDocument(result.document)).not.toThrow()
  })
})
