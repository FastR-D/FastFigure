import {describe,it,expect} from 'vitest'
import {editableFigure} from './editableFigure'
import {clone,createBlank,createExample,parseDocument} from './model'
import {moveObjects,contentBounds,layoutContentBounds} from './geometry'
import {scaleSubtree} from './scaling'
import {applyStyleAsset} from './styleAsset'
import {paperThemes} from './figureThemes'
import {exportSvg} from './svg'
import {DOMParser} from '@xmldom/xmldom'
import {importSvg} from './svgImport'

describe('independent canvas headings',()=>{
  it('stores titles as ordinary editable text without coupling their text or position to frame names',()=>{
    const source=createExample(),before=clone(source),doc=editableFigure(source),title=doc.nodes.find(n=>n.titleBlock)!,frame=clone(doc.containers[0]!)
    expect(title).toMatchObject({kind:'text',parentId:frame.id,label:frame.title,textRole:'heading'});expect(frame.titleDetached).toBe(true)
    const old={x:title.x,y:title.y};moveObjects(doc,[title.id],20,15);title.label='Independent heading'
    expect(title).toMatchObject({x:old.x+20,y:old.y+15});expect(doc.containers[0]).toEqual(frame);expect(parseDocument(doc).nodes.find(n=>n.id===title.id)!.label).toBe('Independent heading')
    expect(layoutContentBounds(doc,doc.containers[0]!).y).toBeGreaterThan(title.y+title.height);expect(contentBounds(doc.containers[0]!).y).toBeLessThan(title.y);expect(source).toEqual(before);expect(editableFigure(doc)).toEqual(doc)
  })
  it('keeps title deletion through save and reopening, and moves or scales retained titles with the group',()=>{
    const doc=editableFigure(createExample()),title=doc.nodes.find(n=>n.titleBlock)!,old=clone(title)
    moveObjects(doc,['stage'],20,10);expect(title).toMatchObject({x:old.x+20,y:old.y+10})
    const scaled=scaleSubtree(doc,'stage',.5).document;expect(scaled.nodes.find(n=>n.id===title.id)!.textStyle!.size).toBe(10)
    doc.nodes=doc.nodes.filter(n=>n.id!==title.id);expect(editableFigure(JSON.parse(JSON.stringify(doc))).nodes.some(n=>n.titleBlock)).toBe(false)
  })
  it('renders warm title tabs inside the movable block and round-trips it with SVG',()=>{
    const doc=applyStyleAsset(editableFigure(createExample()),paperThemes[1]!).figure,title=doc.nodes.find(n=>n.titleBlock)!,svg=exportSvg(doc)
    expect(svg).toContain(`data-title-tab="${title.id}"`);expect(svg).not.toContain('data-title-tab="stage"')
    const recovered=importSvg(svg,{fileName:'heading.svg',sha256:'a'.repeat(64),parseXml:value=>new DOMParser().parseFromString(value,'image/svg+xml') as unknown as Document}).asset.figure
    expect(recovered.nodes.find(n=>n.id===title.id)).toEqual({...title,x:title.x-doc.containers[0]!.x,y:title.y-doc.containers[0]!.y});expect(recovered.containers[0]!.titleDetached).toBe(true)
    expect(editableFigure(createBlank()).nodes).toEqual([])
  })
})
