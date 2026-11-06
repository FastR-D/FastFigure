import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {effectScope} from 'vue'
import {createEditor} from '../composables/useEditor'
import {createLibraryDrag} from '../composables/useLibraryDrag'
import {captureComponent} from './assets'
import {clone,createBlank,parseDocument} from './model'
import {contentBounds,contains} from './geometry'
import {bindingPoint,pathPoints} from './paths'
import {libraryNodeSize,libraryPlacement} from './libraryPlacement'
import {buildDataChart} from './dataChart'
import {chartExample} from './dataChartTable'

let scope:ReturnType<typeof effectScope>
beforeEach(()=>{scope=effectScope();vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>undefined})})
afterEach(()=>{scope.stop();vi.unstubAllGlobals()})
const editor=()=>scope.run(createEditor)!
function component(){
  const doc=createBlank();Object.assign(doc.containers[0]!,{role:'component',x:0,y:0,width:180,height:80})
  doc.nodes=[
    {id:'a',parentId:'stage',kind:'ellipse',label:'A',x:20,y:20,width:24,height:24},
    {id:'b',parentId:'stage',kind:'ellipse',label:'B',x:130,y:20,width:24,height:24},
    {id:'link',parentId:'stage',kind:'path',label:'',x:44,y:32,width:86,height:0,path:{points:[{x:0,y:0},{x:1,y:0}],arrow:'open',start:{nodeId:'a',x:1,y:.5},end:{nodeId:'b',x:0,y:.5}}},
  ]
  return captureComponent(parseDocument(doc),'stage','Editable pair')
}

describe('library drag placement',()=>{
  it('places at the pointer in the deepest container that fits and clamps to its content edges',()=>{
    const doc=createBlank();doc.containers.push({id:'group',parentId:'stage',title:'Nested',role:'component',x:250,y:240,width:300,height:180})
    const size=libraryNodeSize('rectangle')
    expect(libraryPlacement(doc,{x:400,y:330},size)).toEqual({parentId:'group',x:330,y:297})
    expect(libraryPlacement(doc,{x:253,y:243},size)).toEqual({parentId:'group',x:252,y:242})
    expect(libraryPlacement(doc,{x:400,y:330},{width:400,height:200})).toEqual({parentId:'stage',x:200,y:230})
    expect(()=>libraryPlacement(doc,{x:-1,y:300},size)).toThrow('画布内')
    expect(()=>libraryPlacement(doc,{x:NaN,y:300},size)).toThrow('画布内')
    expect(()=>libraryPlacement(doc,{x:400,y:330},{width:999,height:619})).toThrow('足够空间')
    expect(libraryPlacement(buildDataChart(chartExample('line')).figure,{x:200,y:150},size).parentId).toBe('stage')
  })
  it('drops independent nodes into the hovered container regardless of selection, with one-step undo',async()=>{
    const e=editor(),doc=createBlank();doc.containers.push({id:'group',parentId:'stage',title:'Nested',role:'component',x:250,y:240,width:300,height:180});e.importProject(JSON.stringify(doc));const before=clone(e.figure.value)
    expect(await e.dropLibraryItem({kind:'node',nodeKind:'operator',label:'C'},{x:400,y:330})).toBe(true)
    expect(e.selectedNode.value).toMatchObject({kind:'operator',label:'C',parentId:'group',x:360,y:290,width:80,height:80})
    expect(contains(contentBounds(e.figure.value.containers[1]!),e.selectedNode.value!)).toBe(true)
    e.undo();expect(e.figure.value).toEqual(before)
    expect(await e.dropLibraryItem({kind:'node',nodeKind:'rectangle',label:''},{x:10,y:10})).toBe(false);expect(e.figure.value).toEqual(before)
  })
  it('drops whole editable assets without automatic packing and remaps all internal path bindings',async()=>{
    const e=editor();e.newProject('blank');const before=clone(e.figure.value),asset=component(),source=clone(asset)
    expect(await e.dropLibraryItem({kind:'asset',asset},{x:400,y:300})).toBe(true)
    const group=e.selectedContainer.value!,nodes=e.figure.value.nodes.filter(n=>n.parentId===group.id),link=nodes.find(n=>n.kind==='path')!
    expect(group).toMatchObject({parentId:'stage',x:310,y:260,width:180,height:80});expect(nodes).toHaveLength(3)
    expect(pathPoints(e.figure.value,link)[0]).toEqual(bindingPoint(e.figure.value,link.path!.start!));expect(pathPoints(e.figure.value,link).at(-1)).toEqual(bindingPoint(e.figure.value,link.path!.end!));expect(asset).toEqual(source)
    // Deliberate manual overlap is allowed; the second drop must stay at the requested point.
    expect(await e.dropLibraryItem({kind:'asset',asset},{x:400,y:300})).toBe(true);expect(e.selectedContainer.value).toMatchObject({parentId:'stage',x:310,y:260})
    e.undo();expect(e.figure.value.containers).toHaveLength(before.containers.length+1);e.undo();expect(e.figure.value).toEqual(before)
    expect(await e.dropLibraryItem({kind:'asset',asset},{x:0,y:0})).toBe(false);expect(e.figure.value).toEqual(before)
  })
  it('rejects stale asynchronous reads and failed loads without changing the project',async()=>{
    const e=editor(),asset=component();let resolve!:(value:typeof asset)=>void
    const pending=e.dropLibraryItem({kind:'asset',asset:()=>new Promise(done=>{resolve=done})},{x:400,y:300})
    e.newProject('blank');const before=clone(e.figure.value);resolve(asset);expect(await pending).toBe(false);expect(e.figure.value).toEqual(before)
    expect(await e.dropLibraryItem({kind:'asset',asset:async()=>{throw new Error('素材读取失败')}},{x:400,y:300})).toBe(false);expect(e.figure.value).toEqual(before);expect(e.notice.value).toBe('素材读取失败')
    const valid=await e.dropLibraryItem({kind:'asset',asset:async()=>asset},{x:400,y:300});expect(valid).toBe(true)
  })
  it('adds editable annotations to a chart canvas while retaining its generated objects and data',async()=>{
    const e=editor();e.importProject(JSON.stringify(buildDataChart(chartExample('line')).figure));const before=clone(e.figure.value)
    expect(await e.dropLibraryItem({kind:'node',nodeKind:'text',label:'Manual annotation'},{x:200,y:150})).toBe(true)
    expect(e.figure.value.containers).toEqual(before.containers);expect(e.figure.value.nodes.slice(0,before.nodes.length)).toEqual(before.nodes);expect(e.selectedNode.value).toMatchObject({kind:'text',label:'Manual annotation',parentId:'stage'})
    e.undo();expect(e.figure.value).toEqual(before)
  })
  it('accepts only the matching live transfer token and clears canceled drags',()=>{
    const drag=createLibraryDrag(),values=new Map<string,string>(),dataTransfer={types:[] as string[],effectAllowed:'none',clearData(){values.clear();this.types=[]},setData(key:string,value:string){values.set(key,value);this.types.push(key)},getData:(key:string)=>values.get(key)??''},event={dataTransfer,preventDefault:vi.fn(),stopPropagation:vi.fn()} as unknown as DragEvent
    const item={kind:'node' as const,nodeKind:'ellipse' as const,label:'Circle'}
    expect(drag.accepts(event)).toBe(false);drag.start(event,item);expect(dataTransfer.effectAllowed).toBe('copy');expect(drag.accepts(event)).toBe(true)
    const key=dataTransfer.types[0]!,token=values.get(key)!;values.set(key,'foreign');expect(drag.take(event)).toBeNull();values.set(key,token);expect(drag.take(event)).toEqual(item);expect(drag.take(event)).toBeNull()
    drag.start(event,item);drag.clear();expect(drag.accepts(event)).toBe(false);expect(values.get(key)).not.toContain('Circle')
  })
})
