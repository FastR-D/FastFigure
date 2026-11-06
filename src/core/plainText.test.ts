import {describe,expect,it} from 'vitest'
import {clone,createBlank,type FigureNode} from './model'
import {nodeVisual,type SvgElement} from './svg'
import {captureComponent,scaleComponent} from './assets'
const fixture=():FigureNode=>({id:'caption',parentId:'stage',kind:'text',label:'保留源结构、手工标签与命名接口\n等比缩放 ×0.84',x:100,y:200,width:410,height:44,textStyle:{family:'MiSans',size:15,align:'center'}})
function labels(elements:SvgElement[]){const result:SvgElement[]=[];function visit(element:SvgElement|string){if(typeof element==='string')return;if(element.tag==='text'&&element.attrs?.['data-edit-field']==='label')result.push(element);element.children?.forEach(visit)}elements.forEach(visit);return result}
describe('plain caption layout',()=>{
  it('shows two explicit lines in a 44-unit caption without changing text or font size',()=>{
    const node=fixture(),before=clone(node),lines=labels(nodeVisual(node,createBlank()))
    expect(lines.map(l=>l.children?.join(''))).toEqual(node.label.split('\n'));expect(lines.every(l=>l.attrs?.['font-size']===15)).toBe(true)
    for(const line of lines){const baseline=Number(line.attrs?.y);expect(baseline).toBeGreaterThan(node.y);expect(baseline+15*.2).toBeLessThan(node.y+node.height)}expect(node).toEqual(before)
  })
  it('retains all text with explicit padding and boxed labels',()=>{
    const node=fixture(),doc=createBlank();node.visual={padding:12};expect(labels(nodeVisual(node,doc))).toHaveLength(2)
    delete node.visual;node.kind='rectangle';expect(labels(nodeVisual(node,doc))).toHaveLength(2)
    node.kind='text';node.visual={padding:0};expect(labels(nodeVisual(node,doc)).map(l=>l.children?.join(''))).toEqual(node.label.split('\n'))
  })
  it('keeps both caption lines when the saved component is scaled and reused',()=>{
    const doc=createBlank();doc.nodes=[fixture()];const asset=captureComponent(doc,'stage','Caption'),before=clone(asset),scaled=scaleComponent(asset,.5),node=scaled.figure.nodes[0]!,visual=nodeVisual(node,scaled.figure)
    expect(asset).toEqual(before);expect(visual[0]!.attrs?.transform).toContain('scale(0.5)');expect(labels(visual).map(l=>l.children?.join(''))).toEqual(node.label.split('\n'));expect(node.textStyle?.size).toBe(7.5)
  })
  it('preserves imported glyph positioning and explicit text transforms independently of default caption padding',()=>{
    const node=fixture();node.label='Positioned glyphs';node.textLayout={x:.5,y:.5,matrix:[1,0,0,1],baseline:'alphabetic'};node.visual={padding:100};const visual=nodeVisual(node,createBlank()),lines=labels(visual)
    expect(lines).toHaveLength(1);expect(lines[0]!.children).toEqual(['Positioned glyphs']);expect(lines[0]!.attrs?.transform).toBe('matrix(1 0 0 1 305 222)');expect(visual.some(v=>v.tag==='defs')).toBe(false)
  })
})
