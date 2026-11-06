import {editableFigure} from './editableFigure'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { clone, createBlank, createExample, parseDocument, type FigureDocument } from './model'
import { childrenOf, contentBounds, contains, descendants } from './geometry'
import { defaultLayoutOptions, layoutContainer } from './layout'
import { captureComponent, instantiateComponent, scaleComponent } from './assets'
import { buildRecipe } from '../data/recipes'
import { createEditor } from '../composables/useEditor'
import { routeFigure } from './routing'
import { defaultPanelOptions, layoutPanels } from './panelLayout'
import { buildDataChart, replaceDataChart } from './dataChart'
import { chartExample } from './dataChartTable'
import { exportSvg } from './svg'

function geometryFits(doc: FigureDocument, parentId: string) {
  const area = contentBounds(doc.containers.find(c => c.id === parentId)!), objects = childrenOf(doc, parentId)
  expect(objects.every(o => contains(area, o))).toBe(true)
  for (let i = 0; i < objects.length; i++) for (let j = i + 1; j < objects.length; j++) {
    const a = objects[i]!, b = objects[j]!
    expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, `overlap ${a.id}, ${b.id}`).toBe(true)
  }
  expect(() => parseDocument(doc)).not.toThrow()
}
function graph(): FigureDocument {
  const doc = createBlank()
  doc.nodes = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, parentId: 'stage', kind: 'module', label: id, x: 100 + i * 130, y: 220 + i * 20, width: 100, height: 60 }))
  doc.edges = [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']].map(([source, target], i) => ({ id: `edge-${i}`, source: source!, target: target!, sourcePort: 'right', targetPort: 'left' }))
  return doc
}
describe('container flow and panel layout', () => {
  it('composes editable data panels with a common scale, original IDs and sources, then updates a nested chart and undoes the whole composition',()=>{
    let doc=createBlank();Object.assign(doc.containers[0]!,{x:0,y:0,width:1000,height:620})
    const asset=scaleComponent(buildDataChart(chartExample('line')),.6),first=instantiateComponent(doc,asset,'stage'),second=instantiateComponent(first.document,asset,'stage')
    doc=second.document;const roots=[first.containerId,second.containerId],chart=doc.containers.find(c=>c.id===first.containerId)!
    doc.nodes.push({id:'human-note',parentId:chart.id,kind:'text',label:'Human note',x:chart.x+12,y:chart.y+chart.height-22,width:100,height:14,textStyle:{size:10}})
    const a=doc.nodes.find(n=>n.parentId===roots[0]&&n.chart?.key==='series-0-point-0')!,b=doc.nodes.find(n=>n.parentId===roots[1]&&n.chart?.key==='series-0-point-0')!
    doc.edges.push({id:'between-panels',source:a.id,target:b.id,sourcePort:'bottom',targetPort:'top'})
    const before=clone(doc),items=[{containerId:roots[1]!,caption:'Held-out'},{containerId:roots[0]!,caption:'Training'}],options={...defaultPanelOptions,columns:1}
    const result=layoutPanels(doc,'stage',items,options),next=result.document
    expect(doc).toEqual(before);expect(result.factor).toBeLessThan(1);expect(result.rows).toBe(2)
    geometryFits(next,'stage');expect(next.containers.filter(c=>result.panelIds.includes(c.id)).map(c=>c.title)).toEqual(['(a) Held-out','(b) Training'])
    for(const id of roots){const old=before.containers.find(c=>c.id===id)!,updated=next.containers.find(c=>c.id===id)!;expect(updated.dataChart).toEqual(old.dataChart);expect(updated.component).toEqual(old.component);expect(updated.width/old.width).toBeCloseTo(result.factor);expect(updated.parentId).toBe(result.panelIds[items.findIndex(item=>item.containerId===id)])}
    expect(next.nodes.map(n=>n.id)).toEqual(before.nodes.map(n=>n.id));expect(next.edges).toEqual(before.edges)
    const note=next.nodes.find(n=>n.id==='human-note')!;expect(note.label).toBe('Human note');expect(note.textStyle!.size).toBeCloseTo(10*result.factor)
    const spec=clone(chart.dataChart!.spec);spec.series[0]!.values[0]=70
    const revised=replaceDataChart(next,chart.id,spec).document;expect(revised.nodes.find(n=>n.id==='human-note')).toEqual(note);expect(revised.containers.find(c=>c.id===chart.id)!.parentId).toBe(next.containers.find(c=>c.id===chart.id)!.parentId)
    const captured=captureComponent(revised,'stage','Two panels');expect(captured.figure.containers.filter(c=>c.dataChart)).toHaveLength(2)
    expect(exportSvg(next)).toContain('(a) Held-out');expect(exportSvg(next)).not.toContain('<image');
    const storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)})
    const e=scope.run(createEditor)!;e.importProject(JSON.stringify(before));const past=e.past.value.length
    expect(e.applyPanels('stage',items,options)).toBe(true);expect(e.past.value).toHaveLength(past+1);const applied=clone(e.figure.value);expect(applied.containers.filter(c=>c.role==='panel').map(c=>c.title)).toEqual(next.containers.filter(c=>c.role==='panel').map(c=>c.title));expect(applied.nodes.filter(n=>n.titleBlock)).toHaveLength(2)
    e.undo();expect(e.figure.value).toEqual(editableFigure(before));e.redo();expect(e.figure.value).toEqual(applied);e.save();expect(scope.run(createEditor)!.figure.value).toEqual(applied)
  })
  it('rejects panel collisions, unreadable captions, duplicate choices and insufficient space without committing changes',()=>{
    const doc=createBlank();Object.assign(doc.containers[0]!,{x:0,y:0,width:1000,height:620})
    doc.containers.push(...['one','two'].map((id,i)=>({id,parentId:'stage',role:'component' as const,title:id,x:40+i*450,y:150,width:420,height:300})))
    const items=doc.containers.slice(1).map(c=>({containerId:c.id,caption:''})),before=clone(doc)
    expect(()=>layoutPanels(doc,'stage',items,{...defaultPanelOptions,columns:5})).toThrow('参数')
    expect(()=>layoutPanels(doc,'stage',[items[0]!,items[0]!],defaultPanelOptions)).toThrow('不同')
    expect(()=>layoutPanels(doc,'stage',items.map(item=>({...item,caption:'长说明'.repeat(20)})),defaultPanelOptions)).toThrow('单行宽度')
    expect(()=>layoutPanels(doc,'stage',items,{...defaultPanelOptions,columns:1,shrinkToFit:false})).toThrow('原尺寸')
    const crowded=clone(doc);crowded.nodes.push({id:'unselected',parentId:'stage',kind:'text',label:'Keep me',x:100,y:200,width:100,height:20})
    const e=scope.run(createEditor)!;e.importProject(JSON.stringify(crowded));const past=e.past.value.length
    expect(e.applyPanels('stage',items,defaultPanelOptions)).toBe(false);expect(e.notice.value).toContain('重叠');expect(e.figure.value).toEqual(editableFigure(crowded));expect(e.past.value).toHaveLength(past)
    expect(doc).toEqual(before)
  })
  it('retains internal leader bindings and rejects an internal path bound outside its panel instead of detaching it',()=>{
    const doc=createBlank();doc.containers.push(...['one','two'].map(id=>({id,parentId:'stage',role:'component' as const,title:id,x:100,y:160,width:240,height:180})))
    doc.nodes=['one','two'].map(id=>({id:`shape-${id}`,parentId:id,kind:'rectangle' as const,label:id,x:120,y:190,width:60,height:40}))
    doc.nodes.push({id:'leader',parentId:'one',kind:'path',label:'',x:140,y:230,width:100,height:60,path:{points:[{x:0,y:0},{x:1,y:1}],arrow:'open',start:{nodeId:'shape-one',x:.5,y:1}}})
    const source=parseDocument(doc),items=source.containers.slice(1).map(c=>({containerId:c.id,caption:''})),next=layoutPanels(source,'stage',items,defaultPanelOptions).document
    expect(next.nodes.find(n=>n.id==='leader')!.path!.start).toEqual(source.nodes.find(n=>n.id==='leader')!.path!.start)
    const cross=clone(source);cross.nodes.find(n=>n.id==='leader')!.path!.start!.nodeId='shape-two';const before=clone(cross)
    expect(()=>layoutPanels(cross,'stage',items,defaultPanelOptions)).toThrow('跨图引线');expect(cross).toEqual(before)
  })
  it('ranks a connected architecture, adapts gaps without resizing, and preserves topology and labels', () => {
    const doc = createExample(), before = clone(doc), result = layoutContainer(doc, 'stage', defaultLayoutOptions)
    expect(result.gap).toBe(28); expect(doc).toEqual(before)
    const ids = ['input', 'encoder', 'retriever', 'context', 'fusion']
    const nodes = ids.map(id => result.document.nodes.find(n => n.id === id)!)
    nodes.slice(1).forEach((n, i) => expect(n.x).toBeGreaterThan(nodes[i]!.x + nodes[i]!.width))
    expect(result.document.nodes.map(({ x: _x, y: _y, ...n }) => n)).toEqual(before.nodes.map(({ x: _x, y: _y, ...n }) => n))
    expect(result.document.edges.map(({ sourcePort: _s, targetPort: _t, ...e }) => e)).toEqual(before.edges.map(({ sourcePort: _s, targetPort: _t, ...e }) => e))
    expect(result.document.edges.every(e => e.sourcePort === 'right' && e.targetPort === 'left')).toBe(true)
    geometryFits(result.document, 'stage')
    expect([...routeFigure(result.document).values()].every(r => r.status === 'clear')).toBe(true)
    expect(layoutContainer(result.document, 'stage', defaultLayoutOptions).document).toEqual(result.document)
  })
  it('supports vertical ranks and preserves manually chosen ports when requested', () => {
    const doc = createExample(); doc.containers = createBlank().containers
    // A five-rank column fits compact nodes; expanded structures correctly require more height.
    for(const node of doc.nodes) node.height=66
    const result = layoutContainer(doc, 'stage', { ...defaultLayoutOptions, direction: 'down' })
    expect(result.gap).toBe(25)
    const [input, encoder, retriever, context, fusion] = result.document.nodes
    expect(input!.y).toBeLessThan(encoder!.y); expect(encoder!.y).toBeLessThan(retriever!.y)
    expect(retriever!.y).toBeLessThan(context!.y); expect(context!.y).toBeLessThan(fusion!.y)
    expect(result.document.edges.every(e => e.sourcePort === 'bottom' && e.targetPort === 'top')).toBe(true)
    expect(layoutContainer(doc, 'stage', { ...defaultLayoutOptions, adjustPorts: false }).document.edges).toEqual(doc.edges)
    geometryFits(result.document, 'stage')
  })
  it('places a diamond in distinct ranks with non-overlapping parallel branches', () => {
    const result = layoutContainer(graph(), 'stage', defaultLayoutOptions).document
    const [a, b, c, d] = result.nodes
    expect(b!.x).toBe(c!.x); expect(b!.y).toBeLessThan(c!.y)
    expect(a!.x).toBeLessThan(b!.x); expect(d!.x).toBeGreaterThan(c!.x)
    geometryFits(result, 'stage')
  })
  it('handles residual/recurrent cycles as a component instead of losing nodes or reversing bindings', () => {
    const doc = graph(); doc.edges = [
      { id: 'ab', source: 'a', target: 'b', sourcePort: 'right', targetPort: 'left' },
      { id: 'bc', source: 'b', target: 'c', sourcePort: 'right', targetPort: 'left' },
      { id: 'ca', source: 'c', target: 'a', sourcePort: 'right', targetPort: 'left' },
      { id: 'cd', source: 'c', target: 'd', sourcePort: 'right', targetPort: 'left' },
    ]
    const result = layoutContainer(doc, 'stage', defaultLayoutOptions).document
    expect(new Set(result.nodes.slice(0, 3).map(n => n.x)).size).toBe(1)
    expect(result.nodes[3]!.x).toBeGreaterThan(result.nodes[0]!.x)
    expect(result.edges.find(e => e.id === 'ca')).toMatchObject({ source: 'c', target: 'a' })
    geometryFits(result, 'stage')
    expect([...routeFigure(result).values()].every(r => r.status === 'clear')).toBe(true)
  })
  it('moves nested component containers as atoms, preserving every descendant offset and internal connection', () => {
    const asset = buildRecipe('pipeline', { stages: 2, direction: 'row' })
    const a = instantiateComponent(createBlank(), asset, 'stage'), b = instantiateComponent(a.document, asset, 'stage')
    const left = b.document.nodes.filter(n => n.parentId === a.containerId), right = b.document.nodes.filter(n => n.parentId === b.containerId)
    b.document.edges.push({ id: 'bridge', source: left[1]!.id, target: right[0]!.id, sourcePort: 'bottom', targetPort: 'top' })
    const result = layoutContainer(b.document, 'stage', defaultLayoutOptions).document
    for (const old of b.document.containers.filter(c => c.id !== 'stage')) {
      const group = result.containers.find(c => c.id === old.id)!
      expect(group.component).toEqual(old.component)
      for (const child of descendants(b.document, old.id)) {
        const current = result.nodes.find(n => n.id === child.id)!
        expect(current.x - group.x).toBeCloseTo(child.x - old.x); expect(current.y - group.y).toBeCloseTo(child.y - old.y)
      }
    }
    expect(result.edges.slice(0, 2)).toEqual(b.document.edges.slice(0, 2))
    expect(result.edges.at(-1)?.sourcePort).toBe('right')
    geometryFits(result, 'stage')
  })
  it('limits layout to the chosen scope without shifting sibling components or resizing the container', () => {
    const asset = buildRecipe('pipeline', { stages: 2, direction: 'row' }), a = instantiateComponent(createBlank(), asset, 'stage'), b = instantiateComponent(a.document, asset, 'stage')
    const result = layoutContainer(b.document, a.containerId, { ...defaultLayoutOptions, mode: 'grid', gap: 16 }).document
    expect(result.containers).toEqual(b.document.containers)
    expect(result.nodes.filter(n => n.parentId === b.containerId)).toEqual(b.document.nodes.filter(n => n.parentId === b.containerId))
    geometryFits(result, a.containerId)
  })
  it('lays out mixed-size independent objects in a column-aligned panel grid', () => {
    const doc = graph(); doc.edges = []
    doc.nodes[1]!.width = 180; doc.nodes[2]!.height = 100
    const result = layoutContainer(doc, 'stage', { ...defaultLayoutOptions, mode: 'grid', columns: 2 }).document
    geometryFits(result, 'stage')
    expect(result.nodes[0]!.x + result.nodes[0]!.width / 2).toBe(result.nodes[2]!.x + result.nodes[2]!.width / 2)
    expect(result.nodes[1]!.x + result.nodes[1]!.width / 2).toBe(result.nodes[3]!.x + result.nodes[3]!.width / 2)
  })
  it('supports a feasible sixty-node grid at the document node limit', () => {
    const doc = createBlank()
    doc.nodes = Array.from({ length: 60 }, (_, i) => ({ id: `n${i}`, parentId: 'stage', kind: 'module', label: `N${i}`, x: 100, y: 200, width: 80, height: 44 }))
    const result = layoutContainer(doc, 'stage', { ...defaultLayoutOptions, mode: 'grid', columns: 9, gap: 16 })
    expect(result.count).toBe(60); geometryFits(result.document, 'stage')
  })
  it('rejects invalid options, empty containers and impossible layouts without partial mutation', () => {
    const doc = createExample(), before = clone(doc)
    expect(() => layoutContainer(doc, 'stage', { ...defaultLayoutOptions, direction: 'down' })).toThrow('空间不足')
    expect(() => layoutContainer(doc, 'stage', { ...defaultLayoutOptions, columns: 11 })).toThrow('参数')
    expect(() => layoutContainer(doc, 'stage', { ...defaultLayoutOptions, gap: NaN })).toThrow('参数')
    expect(() => layoutContainer(createBlank(), 'stage', defaultLayoutOptions)).toThrow('没有可排列')
    expect(() => layoutContainer(doc, 'missing', defaultLayoutOptions)).toThrow('有效容器')
    expect(doc).toEqual(before)
  })
})

let scope: ReturnType<typeof effectScope>
beforeEach(() => { scope = effectScope(); vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined }) })
afterEach(() => { scope.stop(); vi.unstubAllGlobals() })
describe('layout history', () => {
  it('recursively fits and lays out two connected subgraphs as one undoable edit',()=>{
    const asset=buildRecipe('pipeline',{stages:2,direction:'row'})
    const a=instantiateComponent(createBlank(),asset,'stage'),b=instantiateComponent(a.document,asset,'stage')
    const left=b.document.nodes.filter(n=>n.parentId===a.containerId),right=b.document.nodes.filter(n=>n.parentId===b.containerId)
    b.document.edges.push({id:'bridge',source:left[1]!.id,target:right[0]!.id,sourcePort:'bottom',targetPort:'top'})
    const before=clone(b.document),options={...defaultLayoutOptions,recursive:true,fitContainers:true}
    const result=layoutContainer(before,'stage',options)
    expect(result.levels).toHaveLength(3);expect(result.resized).toHaveLength(2);expect(result.count).toBe(6)
    expect(result.document.containers[0]).toEqual(before.containers[0])
    for(const c of result.document.containers) geometryFits(result.document,c.id)
    for(const n of result.document.nodes) {
      const old=before.nodes.find(o=>o.id===n.id)!
      expect({...n,x:old.x,y:old.y}).toEqual(old)
    }
    const e=scope.run(createEditor)!;e.importProject(JSON.stringify(before));const history=e.past.value.length
    expect(e.applyLayout('stage',options)).toBe(true);expect(e.past.value).toHaveLength(history+1)
    const applied=clone(e.figure.value);e.undo();expect(e.figure.value).toEqual(editableFigure(before));e.redo();expect(e.figure.value).toEqual(applied)
    expect(before).toEqual(b.document)
  })
  it('retries the entire recursive tree when an outer container needs smaller inner spacing',()=>{
    const asset=buildRecipe('pipeline',{stages:2,direction:'row'})
    const a=instantiateComponent(createBlank(),asset,'stage'),b=instantiateComponent(a.document,asset,'stage')
    const left=b.document.nodes.filter(n=>n.parentId===a.containerId),right=b.document.nodes.filter(n=>n.parentId===b.containerId)
    b.document.edges.push({id:'bridge',source:left[1]!.id,target:right[0]!.id,sourcePort:'right',targetPort:'left'})
    const before=clone(b.document),result=layoutContainer(before,'stage',{...defaultLayoutOptions,direction:'down',recursive:true,fitContainers:true})
    expect(result.maxGap).toBeLessThan(defaultLayoutOptions.gap);expect(result.gap).toBe(16)
    for(const c of result.document.containers) geometryFits(result.document,c.id)
    expect(b.document).toEqual(before)
    expect(()=>layoutContainer(before,'stage',{...defaultLayoutOptions,fitContainers:true})).toThrow('参数')
    const impossible=clone(before);impossible.containers[0]!.height=300
    // Keep the input valid while making the requested recursive vertical layout impossible.
    for(const c of impossible.containers.slice(1)) {c.y=150;c.height=200}
    for(const n of impossible.nodes) n.y=210
    const frozen=clone(impossible)
    expect(()=>layoutContainer(impossible,'stage',{...defaultLayoutOptions,direction:'down',recursive:true,fitContainers:true})).toThrow('空间不足')
    expect(impossible).toEqual(frozen)
  })
  it('applies layout atomically, undoes positions and ports together, and retains the project on failure', () => {
    const editor = scope.run(createEditor)!, original = clone(editor.figure.value)
    expect(editor.applyLayout('stage', { ...defaultLayoutOptions, direction: 'down' })).toBe(false)
    expect(editor.figure.value).toEqual(original); expect(editor.past.value).toHaveLength(0)
    expect(editor.applyLayout('stage', defaultLayoutOptions)).toBe(true)
    expect(editor.past.value).toHaveLength(1)
    const applied = clone(editor.figure.value)
    editor.undo(); expect(editor.figure.value).toEqual(original)
    editor.redo(); expect(editor.figure.value).toEqual(applied)
    editor.applyLayout('stage', defaultLayoutOptions); expect(editor.past.value).toHaveLength(1)
  })
})
