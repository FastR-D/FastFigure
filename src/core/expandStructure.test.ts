import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { expandStructure } from './expandStructure'
import { createBlank, createExample, clone, parseDocument, type FigureDocument } from './model'
import { catalogueAsset, composeCatalogue, describeCatalogue } from './catalogue'
import { captureComponent, componentDocument, importComponentText, instantiateComponent } from './assets'
import { bounds, contentBounds, contains, groupObjects, moveObjects, resizeObject, ungroupObject, resolveStyle } from './geometry'
import { movePathPoint, pathPoints } from './paths'
import { createEditor } from '../composables/useEditor'
import { diffFigures } from './figureDiff'
import { edgePath, exportSvg, nodeVisual } from './svg'
import { defaultPaletteId } from '../data/materials'
import { parseHarnessResponse } from './harness'
import { defaultLayoutOptions, layoutContainer } from './layout'

let scope:ReturnType<typeof effectScope>
beforeEach(()=>{scope=effectScope();const storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)})})
afterEach(()=>{scope.stop();vi.unstubAllGlobals()})
const seed=(id:string)=>catalogueAsset({kind:'seed',id}).figure
function expanded(id='encoder') {return expandStructure(seed(id),id)}
function valid(doc:FigureDocument) {
  expect(()=>parseDocument(doc)).not.toThrow()
  for(const node of doc.nodes.filter(n=>!n.interfaceFor))expect(contains(contentBounds(doc.containers.find(c=>c.id===node.parentId)!),node),node.id).toBe(true)
}
describe('independent native structure objects',()=>{
  it('converts all eight structures into editable shapes and paths with full labels and stable external IDs',()=>{
    for(const id of ['encoder','decoder','attention','mlp-block','convolution','retriever','fusion','memory']) {
      const doc=seed(id),before=clone(doc),result=expandStructure(doc,id)
      valid(result.document);expect(doc).toEqual(before)
      expect(result.paths).toBeGreaterThan(0);expect(result.document.nodes.every(n=>!n.structure)).toBe(true)
      expect(result.document.nodes.find(n=>n.id===id)).toMatchObject({kind:'port',interfaceFor:result.containerId,parentId:result.containerId})
      expect(result.document.containers.find(c=>c.id===result.containerId)?.structureOrigin).toEqual(before.nodes[0]!.structure)
      expect(result.document.nodes.some(n=>n.kind==='text'&&n.label===before.nodes[0]!.label)).toBe(true)
    }
    const doc=createExample(),before=clone(doc),result=expandStructure(doc,'encoder')
    expect(result.document.edges).toEqual(before.edges)
    expect(result.document.nodes.find(n=>n.label==='Self-attention')).toBeTruthy()
    expect(diffFigures(before,result.document).changes.some(c=>c.id==='encoder'&&c.kind==='node')).toBe(true)
  })
  it('moves a neuron with all five incident connectors, keeps unrelated paths unchanged and clamps attached endpoints',()=>{
    const {document:doc}=expanded('mlp-block'),node=doc.nodes.find(n=>n.id.endsWith('neuron-1-0'))!,before=clone(doc)
    const incident=doc.nodes.filter(n=>n.path&&(n.path.start?.nodeId===node.id||n.path.end?.nodeId===node.id))
    expect(incident).toHaveLength(5)
    moveObjects(doc,[node.id],5,4)
    for(const path of incident) {
      const old=before.nodes.find(n=>n.id===path.id)!,a=pathPoints(before,old),b=pathPoints(doc,path)
      for(const [key,index] of [['start',0],['end',b.length-1]] as const) {
        const bound=path.path![key]?.nodeId===node.id
        expect(b[index]!.x-a[index]!.x).toBeCloseTo(bound?5:0);expect(b[index]!.y-a[index]!.y).toBeCloseTo(bound?4:0)
      }
    }
    const untouched=before.nodes.find(n=>n.path&&!incident.some(p=>p.id===n.id))!
    expect(doc.nodes.find(n=>n.id===untouched.id)).toEqual(untouched)
    moveObjects(doc,[node.id],-10000,-10000);valid(doc)
  })
  it('moves a component once with its interface and all geometry, preserving external topology',()=>{
    const result=expandStructure(createExample(),'encoder'),doc=result.document,before=clone(doc)
    moveObjects(doc,[result.containerId,'encoder'],12,8)
    const frame=doc.containers.find(c=>c.id===result.containerId)!,port=doc.nodes.find(n=>n.id==='encoder')!
    expect(frame.x-before.containers.at(-1)!.x).toBe(12);expect(port).toMatchObject({x:frame.x,y:frame.y,width:frame.width,height:frame.height})
    for(const path of before.nodes.filter(n=>n.path)) {
      const next=doc.nodes.find(n=>n.id===path.id)!,old=pathPoints(before,path),points=pathPoints(doc,next)
      points.forEach((p,i)=>{expect(p.x-old[i]!.x).toBeCloseTo(12);expect(p.y-old[i]!.y).toBeCloseTo(8)})
    }
    expect(doc.edges).toEqual(before.edges);valid(doc)
    resizeObject(doc,frame.id,frame.width+20,frame.height+20)
    expect(port.width).toBe(frame.width);expect(port.height).toBe(frame.height);valid(doc)
  })
  it('edits a bend without changing endpoint bindings, detaches a moved endpoint and detaches a separately moved path',()=>{
    const {document:doc}=expanded(),path=doc.nodes.find(n=>n.id.endsWith('residual-0'))!,before=clone(path.path),points=pathPoints(doc,path)
    movePathPoint(doc,path.id,1,{x:points[1]!.x+2,y:points[1]!.y-3})
    expect(path.path!.start).toEqual(before!.start);expect(path.path!.end).toEqual(before!.end)
    const endpoints=pathPoints(doc,path)
    movePathPoint(doc,path.id,0,{x:endpoints[0]!.x+3,y:endpoints[0]!.y})
    expect(path.path!.start).toBeUndefined();expect(path.path!.end).toEqual(before!.end)
    moveObjects(doc,[path.id],2,2);expect(path.path!.end).toBeUndefined();valid(doc)
    expect(()=>movePathPoint(doc,path.id,99,{x:0,y:0})).toThrow('有效')
  })
  it('round-trips personal components and remaps every binding independently for two instances and model composition',()=>{
    const result=expanded('mlp-block'),asset=importComponentText(JSON.stringify(captureComponent(result.document,result.containerId,'自定义网络')))
    asset.id='native-network'
    const first=instantiateComponent(createBlank(),asset,'stage'),second=instantiateComponent(first.document,asset,'stage')
    expect(second.document.nodes.length).toBeGreaterThan(60);valid(second.document)
    for(const path of second.document.nodes.filter(n=>n.path)) for(const b of [path.path!.start,path.path!.end]) if(b) expect(second.document.nodes.find(n=>n.id===b.nodeId)?.parentId).toBe(path.parentId)
    const otherBefore=clone(second.document.nodes.filter(n=>n.parentId===second.containerId))
    const neuron=second.document.nodes.find(n=>n.parentId===first.containerId&&n.kind==='ellipse')!
    moveObjects(second.document,[neuron.id],3,3)
    expect(second.document.nodes.filter(n=>n.parentId===second.containerId)).toEqual(otherBefore)
    const standalone=componentDocument(asset);expect(standalone.containers[0]!.role).toBe('component');expect(standalone.nodes.find(n=>n.kind==='port')?.interfaceFor).toBe('stage')
    const entry={kind:'asset' as const,asset},manifest=describeCatalogue([entry])
    expect(manifest[0]?.inputs).toHaveLength(1);expect(manifest[0]?.outputs).toHaveLength(1)
    const composed=composeCatalogue(createBlank(),[entry],[{id:'native',componentKey:'asset:native-network',parentId:'stage',x:100,y:180,keepAppearance:true}],[])
    valid(composed.figure);expect(composed.used[0]!.componentKey).toBe('asset:native-network')
  })
  it('ungroups without losing external interfaces and deletes incident native paths without dangling bindings',()=>{
    const e=scope.run(createEditor)!,original=clone(e.figure.value)
    expect(e.expandSelectedStructure('encoder')).toBe(true)
    const converted=clone(e.figure.value),container=e.selectedId.value,path=e.figure.value.nodes.find(n=>n.path?.end)!,targetId=path.path!.end!.nodeId
    e.select(targetId);e.removeSelected();valid(e.figure.value)
    expect(e.figure.value.nodes.some(n=>n.path&&(n.path.start?.nodeId===targetId||n.path.end?.nodeId===targetId))).toBe(false)
    e.undo();expect(e.figure.value).toEqual(converted)
    const selected=ungroupObject(e.figure.value,container)
    expect(selected.length).toBeGreaterThan(5);expect(e.figure.value.nodes.find(n=>n.id==='encoder')?.interfaceFor).toBeUndefined()
    expect(e.figure.value.edges).toEqual(original.edges);valid(e.figure.value)
    expect(e.figure.value.nodes.find(n=>n.id==='encoder')?.kind).toBe('rectangle')
    const route=edgePath(e.figure.value,'e1');moveObjects(e.figure.value,['encoder'],3,3);expect(edgePath(e.figure.value,'e1')).not.toBe(route);valid(e.figure.value)
  })
  it('keeps semantic palette roles after conversion and inheritance, preserving local colors when ungrouping',()=>{
    const {document:doc,containerId}=expanded(),native=doc.nodes.find(n=>n.kind==='rectangle')!
    const before=JSON.stringify(nodeVisual(native,{...doc,style:resolveStyle(doc,native.parentId)}))
    doc.style.paletteId=defaultPaletteId
    expect(JSON.stringify(nodeVisual(native,{...doc,style:resolveStyle(doc,native.parentId)}))).not.toBe(before)
    expect(native.visual?.fill).toBeUndefined();expect(native.visual?.tone).toBeTruthy()
    const asset=captureComponent(doc,containerId,'主题编码器'),target=createBlank();target.style.accent='rose';target.style.preset='sketch'
    const keep=instantiateComponent(target,asset,'stage',true),inherit=instantiateComponent(target,asset,'stage',false)
    const keepNode=keep.document.nodes.find(n=>n.kind==='rectangle')!,inheritNode=inherit.document.nodes.find(n=>n.kind==='rectangle')!
    const render=(d:FigureDocument,id:string)=>JSON.stringify(nodeVisual(d.nodes.find(n=>n.id===id)!,{...d,style:resolveStyle(d,d.nodes.find(n=>n.id===id)!.parentId)}))
    expect(render(keep.document,keepNode.id)).not.toBe(render(inherit.document,inheritNode.id))
    const appearance=render(keep.document,keepNode.id);ungroupObject(keep.document,keep.containerId)
    expect(render(keep.document,keepNode.id)).toBe(appearance);valid(keep.document)
    const noStroke=seed('encoder');noStroke.nodes[0]!.visual={stroke:'none'};expect(()=>expandStructure(noStroke,'encoder')).not.toThrow()
  })
  it('groups native primitives without adding a title bar, keeping paths and bindings reusable',()=>{
    const {document:doc,containerId}=expanded('mlp-block'),shapes=doc.nodes.filter(n=>n.parentId===containerId&&n.kind==='ellipse').slice(0,2)
    const before=clone(shapes);groupObjects(doc,shapes.map(n=>n.id),'native-subgroup')
    const group=doc.containers.find(c=>c.id==='native-subgroup')!;expect(group.role).toBe('component');expect(group.width).toBeLessThan(80);expect(group.visual).toMatchObject({fill:'none',stroke:'none'})
    expect(shapes.map(n=>({x:n.x,y:n.y}))).toEqual(before.map(n=>({x:n.x,y:n.y})));valid(doc)
    ungroupObject(doc,group.id);expect(doc.nodes.some(n=>n.id===group.id)).toBe(false);valid(doc)
  })
  it('inherits the original asset and evidence when extracting an edited inner group into a new material',()=>{
    const result=expanded('mlp-block'),asset=captureComponent(result.document,result.containerId,'原始网络')
    asset.id='original-network';asset.sources=[{title:'Source paper',reference:'Figure 3'}]
    const inserted=instantiateComponent(createBlank(),asset,'stage'),doc=inserted.document
    doc.containers.find(c=>c.id===inserted.containerId)!.evidence={title:'Method sketch',reference:'Panel B'}
    const cells=doc.nodes.filter(n=>n.kind==='ellipse').slice(0,2)
    groupObjects(doc,cells.map(n=>n.id),'extracted-layer')
    const derived=captureComponent(doc,'extracted-layer','局部网络')
    expect(derived.sources).toContainEqual({title:'Source paper',reference:'Figure 3'})
    expect(derived.sources).toContainEqual({title:'Method sketch',reference:'Panel B'})
    expect(derived.lineage.some(origin=>origin.assetId===asset.id)).toBe(true)
    expect(derived.figure.nodes).toHaveLength(2)
  })
  it('validates binding targets and path geometry and leaves the source/history unchanged on failure',()=>{
    const {document:doc}=expanded(),path=doc.nodes.find(n=>n.path)!
    for(const target of ['missing',path.id]) {
      const invalid=clone(doc);invalid.nodes.find(n=>n.id===path.id)!.path!.start={nodeId:target,x:.5,y:.5}
      expect(()=>parseDocument(invalid)).toThrow()
    }
    const repeated=clone(doc),p=repeated.nodes.find(n=>n.id===path.id)!
    p.path!.points=[{x:0,y:0},{x:0,y:0}];expect(()=>parseDocument(repeated)).toThrow('重合')
    const e=scope.run(createEditor)!,original=clone(e.figure.value)
    e.update(d=>{d.nodes.push({id:'obstacle',kind:'rectangle',label:'',parentId:'stage',x:440,y:320,width:24,height:24})})
    const crowded=clone(e.figure.value),history=e.past.value.length
    expect(e.expandSelectedStructure('encoder')).toBe(false);expect(e.figure.value).toEqual(crowded);expect(e.past.value).toHaveLength(history)
    expect(()=>expandStructure(original,'missing')).toThrow('科研组件')
  })
  it('rejects capacity and nesting overflow before changing the source document',()=>{
    const full=seed('encoder')
    full.nodes.push(...Array.from({length:238},(_,i)=>({id:`tiny-${i}`,kind:'rectangle' as const,label:'',parentId:'stage',x:12,y:48,width:1,height:1})))
    const before=clone(full);expect(()=>expandStructure(full,'encoder')).toThrow('240');expect(full).toEqual(before)
    const deep=createBlank();Object.assign(deep.containers[0]!,{x:0,y:0,width:1000,height:620})
    for(let i=1;i<=6;i++)deep.containers.push({id:`level-${i}`,parentId:i===1?'stage':`level-${i-1}`,role:'group',title:`Level ${i}`,x:12*i,y:48*i,width:1000-24*i,height:620-60*i})
    deep.nodes=[{id:'encoder',kind:'module',label:'Encoder',parentId:'level-6',x:100,y:350,width:184,height:164,structure:{type:'encoder'}}]
    valid(deep);const frozen=clone(deep);expect(()=>expandStructure(deep,'encoder')).toThrow('六层');expect(deep).toEqual(frozen)
  })
  it('exports real vector paths with editable text and preserves fields in Harness revisions',()=>{
    const {document:doc}=expanded('decoder'),svg=exportSvg(doc)
    expect(svg).not.toContain('<image');expect(svg).toContain('Cross-attention');expect(svg).toContain('data-expanded-structure="decoder"')
    const proposal=clone(doc);for(const n of proposal.nodes){delete n.path;delete n.interfaceFor}for(const c of proposal.containers){delete c.visual;delete c.structureOrigin}
    const parsed=parseHarnessResponse(JSON.stringify({message:'保持结构',figure:proposal}),doc).figure!
    expect(parsed).toEqual(doc)
  })
  it('retains authored internal geometry during recursive outer layout, and preserves all-or-nothing undo and bend editing',()=>{
    const e=scope.run(createEditor)!
    const before=clone(e.figure.value);e.expandSelectedStructure('encoder');const expandedDoc=clone(e.figure.value)
    expect(e.past.value).toHaveLength(1);e.undo();expect(e.figure.value).toEqual(before);e.redo();expect(e.figure.value).toEqual(expandedDoc)
    const frame=e.figure.value.containers.find(c=>c.role==='component')!,children=e.figure.value.nodes.filter(n=>n.parentId===frame.id)
    const offsets=children.map(n=>({id:n.id,x:n.x-frame.x,y:n.y-frame.y}))
    const result=layoutContainer(e.figure.value,'stage',{...defaultLayoutOptions,recursive:true,fitContainers:true})
    const placed=result.document.containers.find(c=>c.id===frame.id)!
    expect(result.resized.some(r=>r.id===frame.id)).toBe(false)
    for(const offset of offsets) {const n=result.document.nodes.find(n=>n.id===offset.id)!;expect(n.x-placed.x).toBeCloseTo(offset.x);expect(n.y-placed.y).toBeCloseTo(offset.y)}
    expect(()=>layoutContainer(e.figure.value,frame.id,defaultLayoutOptions)).toThrow('自由图元')
    const path=e.figure.value.nodes.find(n=>n.path)!,saved=clone(e.figure.value)
    e.select(path.id);e.addPathBend();expect(e.selectedNode.value?.path?.points.length).toBe(path.path!.points.length+1)
    e.removePathBend();expect(e.figure.value).toEqual(saved)
    const all=pathPoints(e.figure.value,e.selectedNode.value!),box=bounds(all.map(p=>({...p,width:0,height:0})))
    expect(e.selectedNode.value?.width).toBeCloseTo(box.width)
    e.save();expect(scope.run(createEditor)!.figure.value).toEqual(e.figure.value)
  })
})
