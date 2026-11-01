import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { addComponentPort, exposedPorts, namedPorts, portLocation, removeComponentPort, updateComponentPort } from './componentPorts'
import { anchor, clone, createBlank, parseDocument, type FigureDocument } from './model'
import { captureComponent, instantiateComponent, parseAsset } from './assets'
import { composeCatalogue, describeCatalogue, type InstanceLink } from './catalogue'
import { moveObjects, resizeObject, ungroupObject } from './geometry'
import { routeFigure } from './routing'
import { defaultLayoutOptions, layoutContainer } from './layout'
import { diffFigures } from './figureDiff'
import { exportDrawio } from './export'
import { exportSvg } from './svg'
import { harnessPrompt, parseHarnessResponse } from './harness'
import { createEditor } from '../composables/useEditor'
import { expandStructure } from './expandStructure'
import { catalogueAsset } from './catalogue'
let scope:ReturnType<typeof effectScope>
beforeEach(()=>{scope=effectScope();const storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)})})
afterEach(()=>{scope.stop();vi.unstubAllGlobals()})
function fixture(){const doc=createBlank();for(const [id,x] of [['a',120],['b',520]] as const){doc.containers.push({id,parentId:'stage',title:id==='a'?'Encoder':'Decoder',role:'component',x,y:180,width:180,height:160,visual:{fill:'none',stroke:'none'}});doc.nodes.push({id:`${id}-box`,parentId:id,kind:'rectangle',label:id,x:x+16,y:210,width:140,height:80})}const out=addComponentPort(doc,'a','output','out'),input=addComponentPort(doc,'b','input','in');updateComponentPort(doc,out.id,{key:'features',label:'Features',position:.25});updateComponentPort(doc,input.id,{key:'context',label:'Context',position:.7});return {doc:parseDocument(doc),out,input}}
function connect(doc:FigureDocument){doc.edges.push({id:'link',source:'out',target:'in',sourcePort:'right',targetPort:'left'});return parseDocument(doc)}
function asset(){const {doc}=fixture();return captureComponent(doc,'a','Encoder')}
describe('named component boundary interfaces',()=>{
  it('creates stable identifiers, allocates gaps and uses all four boundary fractions',()=>{
    const {doc}=fixture();const a=addComponentPort(doc,'a','input','i1'),b=addComponentPort(doc,'a','input','i2');expect(a.socket).toMatchObject({key:'input-1',position:.5});expect(b.socket).toMatchObject({key:'input-2',position:.25});expect(a.socket!.position).toBe(.5)
    for(const side of ['left','right','top','bottom'] as const){updateComponentPort(doc,a.id,{side,position:.3});const point=anchor(a,side);expect(point).toEqual(side==='left'?[120,228]:side==='right'?[300,228]:side==='top'?[174,180]:[174,340])}
    expect(()=>parseDocument(doc)).not.toThrow()
  })
  it('validates direction, keys, owner, label and per-component capacity',()=>{
    const {doc}=fixture(),port=doc.nodes.find(n=>n.id==='out')!;port.socket!.key='1bad';expect(()=>parseDocument(doc)).toThrow();port.socket!.key='features'
    const duplicate=addComponentPort(doc,'a','input','i');duplicate.socket!.key='features';expect(()=>parseDocument(doc)).toThrow();duplicate.socket!.key='input-1';port.label='';expect(()=>parseDocument(doc)).toThrow();port.label='Features'
    port.parentId='stage';expect(()=>parseDocument(doc)).toThrow();port.parentId='a'
    for(let i=2;i<16;i++)addComponentPort(doc,'a','input',`i${i}`);expect(namedPorts(doc,'a')).toHaveLength(16);expect(()=>addComponentPort(doc,'a','input','overflow')).toThrow('16')
    expect(()=>addComponentPort(doc,'stage','input','invalid')).toThrow('自由')
  })
  it('enforces semantic source and target directions and fixed sides',()=>{
    const {doc}=fixture();connect(doc);doc.edges[0]!.sourcePort='left';expect(()=>parseDocument(doc)).toThrow('固定边界');doc.edges[0]!.sourcePort='right'
    expect(()=>updateComponentPort(doc,'out',{direction:'input'})).toThrow('方向冲突');expect(()=>updateComponentPort(doc,'in',{direction:'output'})).toThrow('方向冲突')
    updateComponentPort(doc,'out',{direction:'both'});expect(()=>parseDocument(doc)).not.toThrow();updateComponentPort(doc,'out',{side:'bottom'});expect(doc.edges[0]!.sourcePort).toBe('bottom')
  })
  it('moves and resizes owners without losing the interface coordinate or edge reference',()=>{
    const {doc}=fixture();connect(doc);const a=doc.containers.find(c=>c.id==='a')!,out=doc.nodes.find(n=>n.id==='out')!,before=portLocation(out)
    moveObjects(doc,['a'],20,10);expect(portLocation(out)).toEqual({x:before.x+20,y:before.y+10});expect(doc.edges[0]!.source).toBe('out')
    resizeObject(doc,'a',a.width+30,a.height+20);expect(out.width).toBe(a.width);expect(portLocation(out)).toEqual({x:a.x+a.width,y:a.y+a.height*.25});expect(()=>parseDocument(doc)).not.toThrow()
  })
  it('routes an exposed endpoint around its component without other interfaces becoming duplicate obstacles',()=>{
    const {doc}=fixture();addComponentPort(doc,'a','input','a-in');addComponentPort(doc,'a','output','a-out2');addComponentPort(doc,'b','output','b-out');connect(doc)
    const route=routeFigure(doc).get('link')!;expect(route.status).toBe('clear');expect(route.points[0]).toEqual({x:300,y:220});expect(route.points.at(-1)).toEqual({x:520,y:292})
    const before=clone(doc);moveObjects(doc,['b'],-30,30);expect(routeFigure(doc).get('link')!.status).toBe('clear');expect(before.nodes).not.toEqual(doc.nodes)
  })
  it('routes feedback between two boundary interfaces outside their component',()=>{
    const {doc}=fixture();const input=addComponentPort(doc,'a','input','feedback-in');doc.edges.push({id:'feedback',source:'out',target:input.id,sourcePort:'right',targetPort:'left'});const route=routeFigure(parseDocument(doc)).get('feedback')!;expect(route.status).toBe('clear');expect(route.points.some(p=>p.y<180||p.y>340)).toBe(true)
  })
  it('keeps semantic endpoint sides while auto layout adjusts ordinary endpoints',()=>{
    const {doc}=fixture();connect(doc);const result=layoutContainer(doc,'stage',{...defaultLayoutOptions,direction:'down',adjustPorts:true})
    expect(result.document.edges[0]).toMatchObject({source:'out',target:'in',sourcePort:'right',targetPort:'left'});expect(()=>parseDocument(result.document)).not.toThrow()
  })
  it('rejects raw native path bindings to semantic interface nodes',()=>{
    const {doc}=fixture();doc.nodes.push({id:'p',kind:'path',label:'raw',parentId:'stage',x:320,y:400,width:80,height:20,path:{points:[{x:0,y:0},{x:1,y:1}],arrow:'none',start:{nodeId:'out',x:1,y:.5}}});expect(()=>parseDocument(doc)).toThrow('命名接口请使用语义连接')
  })
  it('requires visible material content in addition to hidden interfaces',()=>{
    const value=asset();value.figure.nodes=value.figure.nodes.filter(n=>n.socket);expect(()=>parseAsset(value)).toThrow('可见图元')
  })
  it('captures and instantiates two independent copies with remapped owners and stable keys',()=>{
    const original=asset(),a=instantiateComponent(createBlank(),original,'stage'),b=instantiateComponent(a.document,original,'stage'),doc=b.document
    const ports=doc.nodes.filter(n=>n.socket);expect(ports).toHaveLength(2);expect(ports[0]!.socket!.key).toBe('features');expect(ports[0]!.id).not.toBe(ports[1]!.id);expect(ports[0]!.interfaceFor).not.toBe(ports[1]!.interfaceFor)
    const saved=captureComponent(doc,a.containerId,'Again');expect(namedPorts(saved.figure,'stage')[0]!.socket).toEqual(original.figure.nodes.find(n=>n.socket)!.socket);expect(exposedPorts(saved.figure,'input')).toEqual([]);expect(exposedPorts(saved.figure,'output')).toHaveLength(1)
  })
  it('exposes explicit interface descriptions and never infers ports from decoration in a free component',()=>{
    const a=asset(),description=describeCatalogue([{kind:'asset',asset:a}])[0]!;expect(description.inputs).toEqual([]);expect(description.outputs).toEqual(['out']);expect(description.ports).toEqual([{nodeId:'out',name:'Features',key:'features',direction:'output',side:'right',position:.25}])
    a.figure.nodes=a.figure.nodes.filter(n=>!n.socket);expect(exposedPorts(a.figure,'input')).toEqual([]);expect(exposedPorts(a.figure,'output')).toEqual([])
    const legacy=expandStructure(catalogueAsset({kind:'seed',id:'encoder'}).figure,'encoder'),old=captureComponent(legacy.document,legacy.containerId,'Legacy');expect(exposedPorts(old.figure,'input').map(n=>n.id)).toEqual(['encoder'])
  })
  it('compiles stable named keys for model instances independently of node order',()=>{
    const a=asset(),input=clone(a);input.id='decoder';input.name='Decoder';updateComponentPort(input.figure,'out',{key:'context',direction:'input',side:'left',position:.7})
    const link:InstanceLink={id:'wire',source:{scope:'port',instanceId:'enc',port:'output',key:'features',index:0},target:{scope:'port',instanceId:'dec',port:'input',key:'context',index:0},sourcePort:'bottom',targetPort:'top'}
    a.figure.nodes.reverse();input.figure.nodes.reverse()
    const result=composeCatalogue(createBlank(),[{kind:'asset',asset:a},{kind:'asset',asset:input}],[{id:'enc',componentKey:`asset:${a.id}`,parentId:'stage',x:100,y:180,keepAppearance:true},{id:'dec',componentKey:'asset:decoder',parentId:'stage',x:500,y:180,keepAppearance:true}],[link])
    const edge=result.figure.edges[0]!,source=result.figure.nodes.find(n=>n.id===edge.source)!,target=result.figure.nodes.find(n=>n.id===edge.target)!;expect(source.socket!.key).toBe('features');expect(target.socket!.key).toBe('context');expect(edge).toMatchObject({sourcePort:'right',targetPort:'left'});expect(source.interfaceFor).toBe('enc');expect(target.interfaceFor).toBe('dec');expect(routeFigure(result.figure).get('wire')!.status).toBe('clear')
    expect(()=>composeCatalogue(createBlank(),[{kind:'asset',asset:a}],[{id:'enc',componentKey:`asset:${a.id}`,parentId:'stage',x:100,y:180,keepAppearance:true}],[{...link,target:{scope:'port',instanceId:'enc',port:'input',key:'features',index:0}}])).toThrow()
  })
  it('retains interface metadata in SVG and exact side fractions in drawio edge constraints',()=>{
    const {doc}=fixture();connect(doc);const svg=exportSvg(doc),xml=exportDrawio(doc)
    expect(svg).toContain('&quot;socket&quot;');expect(svg).not.toContain('data-named-port');expect(xml).toContain('exitX=1;exitY=0.25;entryX=0;entryY=0.7;');expect(xml).toContain('exitPerimeter=0;entryPerimeter=0;')
  })
  it('reports interface changes and preserves omitted metadata in a model revision',()=>{
    const {doc}=fixture(),after=clone(doc),port=after.nodes.find(n=>n.id==='out')!;port.socket!.position=.8
    expect(diffFigures(doc,after).changes.find(c=>c.id==='out')!.fields.some(f=>f.name==='命名接口')).toBe(true)
    delete port.socket;const proposal=parseHarnessResponse(JSON.stringify({message:'preserve',figure:after}),doc).figure!;expect(proposal.nodes.find(n=>n.id==='out')!.socket).toEqual(doc.nodes.find(n=>n.id==='out')!.socket)
    const prompt=harnessPrompt({sessionId:'868201df-df6f-44b4-9be4-80a6a39de380',content:'复用 Features',figure:doc,selectedIds:[],catalogue:[{kind:'asset',asset:asset()}]});expect(prompt).toContain('"key":"features"')
  })
  it('blocks ungrouping connected interfaces, then removes unused ones without creating invisible duplicate frames',()=>{
    const {doc}=fixture();connect(doc);const before=clone(doc);expect(()=>ungroupObject(doc,'a')).toThrow('命名接口仍有连接');expect(doc).toEqual(before)
    removeComponentPort(doc,'out');expect(doc.edges).toHaveLength(0);addComponentPort(doc,'a','input','unused');const selected=ungroupObject(doc,'a');expect(selected).toContain('a-box');expect(doc.nodes.some(n=>n.id==='unused')).toBe(false);expect(()=>parseDocument(doc)).not.toThrow()
  })
  it('keeps failed edits atomic, supports undo and redo, and removes incident edges explicitly',()=>{
    const {doc}=fixture(),editor=scope.run(()=>createEditor())!;editor.importProject(JSON.stringify(connect(doc)));editor.selectedId.value='out';const original=clone(editor.figure.value)
    expect(editor.setNamedPort('out',{key:'bad key'})).toBe(false);expect(editor.figure.value).toEqual(original);expect(editor.setNamedPort('out',{direction:'input'})).toBe(false);expect(editor.figure.value).toEqual(original)
    expect(editor.setNamedPort('out',{position:.6,side:'bottom'})).toBe(true);const changed=clone(editor.figure.value);editor.undo();expect(editor.figure.value).toEqual(original);editor.redo();expect(editor.figure.value).toEqual(changed)
    editor.removeNamedPort('out');expect(editor.figure.value.edges).toHaveLength(0);expect(editor.selectedId.value).toBe('a');editor.undo();expect(editor.figure.value).toEqual(changed)
  })
  it('clears a pending connection when its interface disappears or stops being an output',()=>{
    const {doc}=fixture(),editor=scope.run(()=>createEditor())!;editor.importProject(JSON.stringify(doc));editor.toggleConnect();editor.select('out');expect(editor.connectionSource.value).toBe('out');editor.removeNamedPort('out');expect(editor.connectionSource.value).toBeNull();expect(editor.connectMode.value).toBe(false)
    editor.undo();editor.toggleConnect();editor.select('out');expect(editor.setNamedPort('out',{direction:'input'})).toBe(true);expect(editor.connectionSource.value).toBeNull();expect(editor.connectMode.value).toBe(false)
  })
  it('connects human selected output to input and keeps a pending source after rejecting another output',()=>{
    const {doc}=fixture(),editor=scope.run(()=>createEditor())!;editor.importProject(JSON.stringify(doc));editor.toggleConnect();editor.select('in');expect(editor.connectionSource.value).toBeNull();editor.select('out');expect(editor.connectionSource.value).toBe('out');const extra=addComponentPort(editor.figure.value,'b','output','b-out');editor.select(extra.id);expect(editor.connectionSource.value).toBe('out');editor.select('in');expect(editor.figure.value.edges[0]).toMatchObject({source:'out',target:'in',sourcePort:'right',targetPort:'left'});expect(editor.connectMode.value).toBe(false)
  })
})
