import {describe,expect,it} from 'vitest'
import {DOMParser} from '@xmldom/xmldom'
import {templateComponents,templateComponent,templateComponentSpecs,templateComponentSource} from '../data/templateComponents.ts'
import {captureComponent,componentDocument,instantiateComponentAt,parseAsset,scaleComponent} from './assets.ts'
import {clone,createBlank,parseDocument,rootContainer} from './model.ts'
import {createCatalogue,describeCatalogue,recommendCatalogue} from './catalogue.ts'
import {checkFigureText} from './figureTextCheck.ts'
import {exportSvg} from './svg.ts'
import {pathPoints} from './paths.ts'

describe('curated components from the user PPTX template',()=>{
  it.each(templateComponentSpecs)('keeps $name native, legible and traceable through scaling, independent insertion, capture and SVG',spec=>{
    const asset=templateComponent(spec.id),before=clone(asset),doc=componentDocument(asset)
    expect(parseAsset(JSON.parse(JSON.stringify(asset)))).toEqual(asset)
    expect(asset.sources[0]!.reference).toContain(templateComponentSource.sha256)
    expect(asset.sources[0]!.reference).toContain(`第 ${spec.pages.join('、')} 页`)
    expect(doc.nodes.every(n=>['rectangle','ellipse','text','path','port'].includes(n.kind))).toBe(true)
    expect(checkFigureText(doc).issues).toEqual([])
    const svg=exportSvg(doc),xml=new DOMParser().parseFromString(svg,'image/svg+xml')
    expect(parseDocument(JSON.parse(xml.getElementsByTagName('metadata')[0]!.textContent!))).toEqual(doc)
    expect(svg).not.toContain('<image')
    const base=createBlank();Object.assign(rootContainer(base),{x:0,y:0,width:1000,height:620,role:'component'})
    const scaled=scaleComponent(asset,.7)
    const first=instantiateComponentAt(base,scaled,'stage',{x:40,y:150},'first').document
    const both=instantiateComponentAt(first,scaled,'stage',{x:540,y:150},'second').document
    const firstIds=new Set(both.nodes.filter(n=>n.id.startsWith('first')).map(n=>n.id))
    for(const n of both.nodes.filter(n=>n.id.startsWith('second')&&n.path))for(const binding of [n.path!.start,n.path!.end])if(binding){expect(firstIds.has(binding.nodeId)).toBe(false);expect(both.nodes.some(target=>target.id===binding.nodeId)).toBe(true)}
    const captured=captureComponent(both,'first',asset.name)
    expect(captured.sources.some(s=>s.title===templateComponentSource.title&&s.reference.includes(templateComponentSource.sha256))).toBe(true)
    expect(captured.figure.nodes).toHaveLength(asset.figure.nodes.length)
    for(const n of scaled.figure.nodes.filter(n=>n.path)){const original=asset.figure.nodes.find(target=>target.id===n.id)!;expect(pathPoints(scaled.figure,n)[0]!.x).toBeCloseTo(pathPoints(asset.figure,original)[0]!.x*.7)}
    expect(asset).toEqual(before)
  })

  it('publishes each component once in the default assistant catalogue and retrieves bilingual names',()=>{
    const entries=createCatalogue([]),assets=templateComponents()
    expect(new Set(assets.map(a=>a.id)).size).toBe(assets.length)
    for(const asset of assets){
      const matches=entries.filter(e=>e.kind==='asset'&&e.asset.id===asset.id)
      expect(matches).toHaveLength(1)
      expect(recommendCatalogue(entries,asset.name).some(item=>item.asset.id===asset.id)).toBe(true)
      const described=describeCatalogue(matches)[0]!
      expect(described.sources).toEqual(asset.sources)
      expect(described.nodes).toHaveLength(asset.figure.nodes.length)
    }
    expect(recommendCatalogue(entries,'Siamese').some(item=>item.asset.id==='paper-template-paired-streams')).toBe(true)
    expect(recommendCatalogue(entries,'Milestone').some(item=>item.asset.id==='paper-template-milestone-timeline')).toBe(true)
  })

  it('keeps missing inputs disconnected and input identity explicit without assuming shared parameters',()=>{
    const modalities=templateComponent('modality-slots').figure
    expect(modalities.nodes.find(n=>n.id==='modality-3')!.label).toBe('Missing')
    expect(modalities.nodes.some(n=>n.path?.start?.nodeId==='modality-3'||n.path?.end?.nodeId==='modality-3')).toBe(false)
    for(let i=0;i<3;i++)expect(modalities.nodes.find(n=>n.id===`modality-encoder-${i}`)!.path).toMatchObject({start:{nodeId:`modality-${i}`},end:{nodeId:`encoder-${i}`}})
    const paired=templateComponent('paired-streams').figure
    expect(paired.nodes.find(n=>n.id==='encode-0')!.path).toMatchObject({start:{nodeId:'input-0'},end:{nodeId:'encoder-0'}})
    expect(paired.nodes.find(n=>n.id==='encode-1')!.path).toMatchObject({start:{nodeId:'input-1'},end:{nodeId:'encoder-1'}})
    expect(paired.nodes.some(n=>n.label.includes('Shared'))).toBe(false)
  })
})
