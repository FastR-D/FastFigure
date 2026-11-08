import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { createEditor } from '../composables/useEditor'
import { clone, createExample, parseDocument } from './model'
import { edgePath, exportSvg } from './svg'
import {buildRecipe,componentRecipes} from '../data/recipes'

let scope: ReturnType<typeof effectScope>
beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) })
  scope = effectScope()
})
afterEach(() => { scope.stop(); vi.unstubAllGlobals() })
const editor = () => scope.run(() => createEditor())!

describe('FigureIR integrity and editing', () => {
  it('places a new component in free space without covering existing selectable nodes', () => {
    const e = editor(), original = clone(e.figure.value)
    e.addNode('module', 'Decoder')
    const added = e.figure.value.nodes.at(-1)!
    expect(e.figure.value.nodes).toHaveLength(original.nodes.length + 1)
    for (const n of original.nodes) {
      expect(added.x < n.x + n.width && added.x + added.width > n.x && added.y < n.y + n.height && added.y + added.height > n.y).toBe(false)
    }
    expect(e.figure.value.nodes.slice(0, -1)).toEqual(original.nodes)
    expect(() => parseDocument(e.figure.value)).not.toThrow()
  })
  it('moves a container with its children and keeps bindings; node drags clamp to content', () => {
    const e = editor(), original = clone(e.figure.value)
    e.beginDrag(); e.move('stage', 20, 15); e.endDrag()
    original.nodes.forEach((n, i) => {
      expect(e.figure.value.nodes[i]!.x).toBe(n.x + 20)
      expect(e.figure.value.nodes[i]!.y).toBe(n.y + 15)
    })
    expect(e.figure.value.edges).toEqual(original.edges)
    const before = edgePath(e.figure.value, 'e1')
    e.beginDrag(); e.move('input', -9999, -9999); e.endDrag()
    expect(edgePath(e.figure.value, 'e1')).not.toBe(before)
    expect(() => parseDocument(e.figure.value)).not.toThrow()
    e.undo()
    expect(e.figure.value.nodes[0]!.x).toBe(original.nodes[0]!.x + 20)
    e.undo()
    expect(e.figure.value).toEqual(original)
  })
  it('deletes incident edges atomically, and undo/redo restore valid complete documents', () => {
    const e = editor(), original = clone(e.figure.value)
    e.selectedId.value = 'encoder'; e.removeSelected()
    expect(e.figure.value.nodes).toHaveLength(original.nodes.length-1)
    expect(e.figure.value.edges.some(x => x.source === 'encoder' || x.target === 'encoder')).toBe(false)
    expect(() => parseDocument(e.figure.value)).not.toThrow()
    e.undo(); expect(e.figure.value).toEqual(original)
    e.redo(); expect(e.figure.value.nodes).toHaveLength(original.nodes.length-1)
  })
  it('deletes the selected root and its content into a writable blank canvas as one undoable edit',()=>{
    const e=editor()
    e.setCanvasSize('width',1200);e.setCanvasSize('height',800)
    e.update(doc=>{
      doc.folder='Methods';doc.canvas.frame={x:40,y:90,width:1000,height:600}
      doc.references=[{id:'ref',title:'Keep reference',citation:'Authored fixture',fileName:'source.png',sha256:'a'.repeat(64),pixelWidth:800,pixelHeight:400,dataUrl:'data:image/png;base64,iVBORw0KGgo=',placement:{x:0,y:0,width:800,height:400}}]
      doc.containers.push({id:'nested',parentId:'stage',role:'component',title:'Nested group',x:100,y:160,width:200,height:120})
      doc.nodes.push({id:'nested-note',parentId:'nested',kind:'text',label:'Delete with parent',x:110,y:170,width:160,height:30})
    })
    const original=clone(e.figure.value),history=e.past.value.length
    e.select('stage');e.removeSelected()
    const blank=clone(e.figure.value)
    expect(blank.nodes).toEqual([]);expect(blank.edges).toEqual([]);expect(blank.containers).toHaveLength(1)
    expect(blank.containers[0]).toMatchObject({id:'stage',x:0,y:0,width:1200,height:800,titleDetached:true,visual:{fill:'none',stroke:'none'}})
    expect(blank.canvas).toEqual({width:1200,height:800})
    for(const field of ['title','folder','style','references'] as const)expect(blank[field]).toEqual(original[field])
    expect(e.selectedIds.value).toEqual([]);expect(e.past.value).toHaveLength(history+1)
    e.removeSelected();expect(e.past.value).toHaveLength(history+1)
    e.addNode('rectangle','New content');expect(e.figure.value.nodes).toHaveLength(1)
    expect(()=>parseDocument(e.figure.value)).not.toThrow()
    e.undo();expect(e.figure.value).toEqual(blank)
    e.undo();expect(e.figure.value).toEqual(original)
    e.redo();expect(e.figure.value).toEqual(blank)
    e.save();expect(editor().figure.value).toEqual(blank)
  })
  it('removes root component ownership, recipe bindings and native paths rather than leaving stale structure',()=>{
    const e=editor(),recipe=componentRecipes.find(r=>r.id==='streaming-memory')!
    e.insertComponent(buildRecipe(recipe.id,recipe.defaults),true,true)
    const original=clone(e.figure.value)
    expect(original.containers[0]!.component).toBeDefined();expect(original.containers[0]!.parametric).toBeDefined()
    expect(original.nodes.some(n=>n.path)).toBe(true)
    e.select('stage');e.removeSelected()
    expect(e.figure.value.containers[0]!.component).toBeUndefined();expect(e.figure.value.containers[0]!.parametric).toBeUndefined()
    expect(e.figure.value.nodes).toEqual([]);expect(e.figure.value.edges).toEqual([])
    expect(()=>parseDocument(e.figure.value)).not.toThrow()
    e.undo();expect(e.figure.value).toEqual(original)
  })
  it('rejects invalid import atomically and round-trips local project state', () => {
    const e = editor(), original = clone(e.figure.value)
    expect(() => e.importProject('{"version":"bad"}')).toThrow()
    expect(e.figure.value).toEqual(original)
    expect(e.past.value).toHaveLength(0)
    e.setStyle('sketch'); e.save()
    expect(e.saved.value).toBe(true)
    expect(editor().figure.value).toEqual(e.figure.value)
  })
  it('escapes text on SVG export', () => {
    const doc = createExample(); doc.nodes[0]!.label = '<script>& "研究"'
    const svg = exportSvg(doc)
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;script&gt;')
  })
})
