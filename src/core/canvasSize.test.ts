import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {effectScope} from 'vue'
import {createEditor} from '../composables/useEditor'
import {clone,createBlank,createExample,parseDocument} from './model'
import {resizeCanvas} from './canvasSize'
import {exportSvg} from './svg'
import {pngSize} from './export'
import {orthogonalPoints} from './paths'
import {createDesignReviewContext,designRasterSchema} from './designReview'

let scope:ReturnType<typeof effectScope>
beforeEach(()=>{scope=effectScope();vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>undefined})})
afterEach(()=>{scope.stop();vi.unstubAllGlobals()})
const editor=()=>scope.run(createEditor)!

describe('editable canvas dimensions',()=>{
  it('grows the workspace frame while preserving all editable nodes, text and connections',()=>{
    const doc=createExample(),before=clone(doc);resizeCanvas(doc,1400,900)
    expect(doc.canvas).toEqual({width:1400,height:900});expect(doc.nodes).toEqual(before.nodes);expect(doc.edges).toEqual(before.edges)
    expect(doc.containers[0]!.width).toBe(before.containers[0]!.width+400);expect(doc.containers[0]!.height).toBe(before.containers[0]!.height+280);expect(()=>parseDocument(doc)).not.toThrow()
    const svg=exportSvg(doc);expect(svg).toContain('viewBox="0 0 1400 900"');expect(svg).toContain('<rect width="1400" height="900" fill="#fff">');expect(pngSize(doc)).toEqual({width:2800,height:1800})
  })
  it('supports a smaller canvas that still contains content and rejects invalid or clipping changes atomically',()=>{
    const e=editor(),doc=createBlank();doc.nodes=[{id:'note',parentId:'stage',kind:'rectangle',label:'Keep',x:100,y:200,width:100,height:50}];e.importProject(JSON.stringify(doc))
    expect(e.setCanvasSize('width',800)).toBe(true);expect(e.setCanvasSize('height',500)).toBe(true);const valid=clone(e.figure.value),history=e.past.value.length
    for(const width of [0,99,4097,NaN,800.5,240]){expect(e.setCanvasSize('width',width)).toBe(false);expect(e.figure.value).toEqual(valid);expect(e.past.value).toHaveLength(history)}
    e.undo();expect(e.figure.value.canvas.height).toBe(620);e.undo();expect(e.figure.value.canvas.width).toBe(1000)
  })
  it('retains crop frames when they fit and validates them against the actual canvas',()=>{
    const doc=createBlank();doc.canvas.frame={x:900,y:100,width:100,height:300};const before=clone(doc)
    expect(()=>resizeCanvas(doc,950,620)).toThrow('裁切');expect(doc).toEqual(before)
    resizeCanvas(doc,1400,900);expect(doc.canvas.frame).toEqual(before.canvas.frame)
    doc.canvas.frame={x:1100,y:700,width:200,height:100};expect(()=>parseDocument(doc)).not.toThrow();doc.canvas.frame.width=301;expect(()=>parseDocument(doc)).toThrow('出图区域')
  })
  it('places editable symbols and right-angle paths beyond the former 1000 × 620 bounds',async()=>{
    const e=editor();e.newProject('blank');expect(e.setCanvasSize('width',4096)).toBe(true);expect(e.setCanvasSize('height',4096)).toBe(true)
    expect(await e.dropLibraryItem({kind:'node',nodeKind:'operator',label:'C'},{x:3500,y:3000})).toBe(true);expect(e.selectedNode.value).toMatchObject({x:3460,y:2960});expect(()=>parseDocument(e.figure.value)).not.toThrow()
    expect(orthogonalPoints([{x:3000,y:2800},{x:3500,y:3000}],'horizontal')).toEqual([{x:3000,y:2800},{x:3500,y:2800},{x:3500,y:3000}]);expect(pngSize(e.figure.value)).toEqual({width:8192,height:8192})
  })
  it('normalizes design-review positions and raster proportions to the custom canvas',()=>{
    const doc=createBlank();resizeCanvas(doc,1200,800);doc.nodes=[{id:'node',kind:'rectangle',parentId:'stage',label:'A',x:600,y:400,width:120,height:80}]
    const context=createDesignReviewContext(doc),alias=[...context.aliases].find(([,id])=>id==='node')![0];expect(context.directory.find(o=>o.id===alias)!.box).toEqual({x:.5,y:.5,width:.1,height:.1})
    const image={dataUrl:'data:image/png;base64,iVBORw0KGgo=',width:1800,height:1200,viewport:'canvas-1200x800',imageSha256:'a'.repeat(64),figureSha256:'b'.repeat(64),renderer:'fastfigure-browser-v1',fonts:[]};expect(designRasterSchema.safeParse(image).success).toBe(true);expect(designRasterSchema.safeParse({...image,height:1000}).success).toBe(false)
  })
})
