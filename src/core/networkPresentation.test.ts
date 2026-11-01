import {afterEach,describe,expect,it,vi} from 'vitest'
import {effectScope} from 'vue'
import {buildRecipe} from '../data/recipes'
import {clone,createBlank,parseDocument,rootContainer} from './model'
import {componentDocument,instantiateComponentAt,scaleComponent,captureComponent} from './assets'
import {contentBounds,contains} from './geometry'
import {routeFigure} from './routing'
import {addComponentPort} from './componentPorts'
import {internalContainerEdges,setContainerEdgeRouting} from './edgeRouting'
import {catalogueAsset,componentInstanceSchema,composeCatalogue} from './catalogue'
import {createEditor} from '../composables/useEditor'
afterEach(()=>vi.unstubAllGlobals())
const counts={inputs:3,hiddenLayers:2,hidden:3,outputs:2}
function nested(){
  const asset=buildRecipe('pipeline',{stages:2,direction:'row'}),first=instantiateComponentAt(createBlank(),asset,'stage',{x:80,y:190},'left'),second=instantiateComponentAt(first.document,asset,'stage',{x:510,y:190},'right'),doc=second.document,owner=doc.containers.find(c=>c.id==='left')!
  owner.role='component';doc.containers.find(c=>c.id==='right')!.role='component'
  doc.containers.push({id:'inner',parentId:'left',role:'component',title:'Nested body',x:owner.x+2,y:owner.y+2,width:owner.width-4,height:owner.height-4,visual:{fill:'none',stroke:'none'}})
  doc.nodes.filter(n=>n.parentId==='left').forEach(n=>{n.parentId='inner'})
  doc.nodes.push({id:'free-line',parentId:'inner',kind:'path',label:'Independent annotation',x:110,y:210,width:60,height:0,path:{points:[{x:0,y:0},{x:1,y:0}],arrow:'open'}})
  const out=addComponentPort(doc,'left','output','left-out'),input=addComponentPort(doc,'right','input','right-in')
  doc.edges.push({id:'external',source:out.id,target:input.id,sourcePort:'right',targetPort:'left'})
  return parseDocument(doc)
}
describe('network spacing and scoped edge presentation',()=>{
  it('uses boundary, default and asymmetric gaps without changing network topology or labels',()=>{
    const baseline=buildRecipe('mlp',counts),topology=baseline.figure.edges.map(({routing:_,...edge})=>edge)
    // Minimum, maximum, asymmetric and default geometry cover the distinct spacing risks.
    for(const [layerGap,neuronGap] of [[32,12],[120,64],[32,64],[80,24]]){
      const asset=buildRecipe('mlp',{...counts,layerGap,neuronGap}),doc=asset.figure,node=(id:string)=>doc.nodes.find(n=>n.id===id)!
      expect(node('neuron-1-0').x-node('neuron-0-0').x-node('neuron-0-0').width).toBe(layerGap)
      expect(node('neuron-1-1').y-node('neuron-1-0').y-node('neuron-1-0').height).toBe(neuronGap)
      const last=[node('neuron-3-0'),node('neuron-3-1')],middle=node('neuron-1-1');expect((last[0]!.y+last[1]!.y+80)/2).toBe(middle.y+40)
      expect(doc.edges.map(({routing:_,...edge})=>edge)).toEqual(topology);expect(doc.nodes.map(n=>[n.id,n.label,n.kind,n.width,n.height])).toEqual(baseline.figure.nodes.map(n=>[n.id,n.label,n.kind,n.width,n.height]));expect(asset.sources).toEqual(baseline.sources)
      expect(doc.nodes.every(n=>contains(contentBounds(rootContainer(doc)),n))).toBe(true);expect([...routeFigure(doc).values()].every(r=>r.status==='clear'&&r.points.length===2)).toBe(true)
    }
  })
  it('supports the largest declared layout as a new figure or an explicitly scaled instance and rejects unsupported gaps',()=>{
    const asset=buildRecipe('mlp',{inputs:4,hiddenLayers:3,hidden:4,outputs:3,layerGap:120,neuronGap:64}),doc=componentDocument(asset)
    expect(rootContainer(doc)).toMatchObject({width:928,height:580});expect(doc.nodes).toHaveLength(19);expect(doc.edges).toHaveLength(60);expect(()=>parseDocument(doc)).not.toThrow()
    expect(()=>instantiateComponentAt(createBlank(),asset,'stage',{x:60,y:150},'large')).toThrow()
    const scaled=instantiateComponentAt(createBlank(),scaleComponent(asset,.5),'stage',{x:60,y:150},'small').document;expect(scaled.edges).toHaveLength(60);expect([...routeFigure(scaled).values()].every(r=>r.status==='clear')).toBe(true)
    const invalids:Record<string,number>[]=[{layerGap:40},{layerGap:0},{layerGap:80.5},{neuronGap:13},{neuronGap:65}]
    for(const parameters of invalids)expect(()=>buildRecipe('mlp',{...counts,...parameters})).toThrow()
  })
  it('changes nested internal semantic edges while preserving boundary connections, named ports and free paths',()=>{
    const doc=nested(),before=clone(doc),ids=internalContainerEdges(doc,'left').map(e=>e.id)
    expect(ids).toHaveLength(1);expect(internalContainerEdges(doc,'inner').map(e=>e.id)).toEqual(ids)
    expect(setContainerEdgeRouting(doc,'left','straight')).toEqual({total:1,changed:1,routing:'straight'})
    expect(doc.nodes).toEqual(before.nodes);expect(doc.containers).toEqual(before.containers);expect(doc.edges.find(e=>e.id==='external')).toEqual(before.edges.find(e=>e.id==='external'))
    expect(doc.edges.filter(e=>!ids.includes(e.id))).toEqual(before.edges.filter(e=>!ids.includes(e.id)))
    expect(internalContainerEdges(doc,'stage')).toHaveLength(3)
    const captured=captureComponent(doc,'left','Nested network');expect(captured.figure.edges).toHaveLength(1);expect(captured.figure.edges[0]!.routing).toBe('straight');expect(captured.figure.nodes.find(n=>n.id==='free-line')?.path).toEqual(before.nodes.find(n=>n.id==='free-line')?.path)
  })
  it('keeps a normalized no-op unchanged and rejects invalid routing or scope before mutation',()=>{
    const doc=nested(),before=clone(doc)
    expect(setContainerEdgeRouting(doc,'left','orthogonal').changed).toBe(0);expect(doc).toEqual(before)
    expect(()=>setContainerEdgeRouting(doc,'missing','straight')).toThrow('容器');expect(()=>setContainerEdgeRouting(doc,'left','curve' as 'straight')).toThrow();expect(doc).toEqual(before)
  })
  it('applies and undoes a mixed 24-edge update atomically and keeps individual edge choices in captures',()=>{
    const storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)})
    const scope=effectScope()
    try{const editor=scope.run(()=>createEditor())!,doc=componentDocument(buildRecipe('mlp',counts));doc.edges[0]!.routing='orthogonal';editor.importProject(JSON.stringify(doc));const before=clone(editor.figure.value);expect(editor.update(d=>{expect(setContainerEdgeRouting(d,'stage','orthogonal')).toMatchObject({total:24,changed:23})})).toBe(true);expect(editor.figure.value.edges.every(e=>e.routing==='orthogonal')).toBe(true);editor.undo();expect(editor.figure.value).toEqual(before);editor.redo();const captured=captureComponent(editor.figure.value,'stage','Edited modes');expect(captured.figure.edges.every(e=>e.routing==='orthogonal')).toBe(true)}finally{scope.stop()}
  })
  it('lets a model restyle a frozen saved instance without rebuilding its geometry, source revision or external links',()=>{
    const asset=buildRecipe('pipeline',{stages:2,direction:'row'});asset.figure.nodes[0]!.label='Manual label';asset.figure.nodes[0]!.x+=2;const saved=clone(asset),base=createBlank(),entries=[{kind:'asset' as const,asset}],instances=[componentInstanceSchema.parse({id:'one',componentKey:`asset:${asset.id}`,parentId:'stage',x:80,y:180,edgeRouting:'straight'}),componentInstanceSchema.parse({id:'two',componentKey:`asset:${asset.id}`,parentId:'stage',x:510,y:180})],link={id:'external',source:{scope:'port' as const,instanceId:'one',port:'output' as const,index:0},target:{scope:'port' as const,instanceId:'two',port:'input' as const,index:0},sourcePort:'right' as const,targetPort:'left' as const}
    const result=composeCatalogue(base,entries,instances,[link]);expect(asset).toEqual(saved);expect(base).toEqual(createBlank());expect(result.used[0]!.edgeRouting).toBe('straight');expect(result.used[1]!.edgeRouting).toBeUndefined();expect(result.figure.edges.filter(e=>e.id!=='external').map(e=>e.routing)).toEqual(['straight',undefined]);expect(result.figure.edges.find(e=>e.id==='external')?.routing).toBeUndefined();expect(result.figure.nodes.filter(n=>n.label==='Manual label')).toHaveLength(2)
    expect(()=>catalogueAsset(entries[0]!,{layerGap:80})).toThrow('不接受配方参数')
  })
  it('rejects an explicit internal-edge operation on a component that contains only nodes or free paths',()=>{
    const asset=buildRecipe('pipeline',{stages:2,direction:'row'});asset.figure.edges=[];const before=clone(asset)
    expect(setContainerEdgeRouting(asset.figure,'stage','straight')).toEqual({total:0,changed:0,routing:'straight'})
    expect(()=>composeCatalogue(createBlank(),[{kind:'asset',asset}],[componentInstanceSchema.parse({id:'one',componentKey:`asset:${asset.id}`,parentId:'stage',x:80,y:180,edgeRouting:'straight'})],[])).toThrow('没有可调整')
    expect(asset).toEqual(before)
  })
})
