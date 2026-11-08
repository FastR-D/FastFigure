import {describe,expect,it} from 'vitest'
import {galleryPrimitives,galleryPrimitive} from '../data/galleryPrimitives.ts'
import {galleryBenchmarks,galleryBenchmark} from '../data/galleryBenchmarks.ts'
import {captureComponent,instantiateComponentAt,parseAsset,scaleComponent} from './assets.ts'
import {createBlank,parseDocument,rootContainer} from './model.ts'
import {createCatalogue,recommendCatalogue} from './catalogue.ts'
import {checkFigureText} from './figureTextCheck.ts'
import {bindingPoint,pathPoints} from './paths.ts'

describe('image-reading vocabulary and benchmark compositions',()=>{
  it('publishes editable schematics without importing source artwork or invented experimental marks',()=>{
    const assets=[...galleryPrimitives(),...galleryBenchmarks()]
    expect(new Set(assets.map(a=>a.id)).size).toBe(assets.length)
    for(const asset of assets){
      expect(parseAsset(JSON.parse(JSON.stringify(asset)))).toEqual(asset)
      expect(checkFigureText(asset.figure).issues).toEqual([])
      expect(asset.sources.length).toBeGreaterThan(0)
      expect(asset.sources.every(s=>s.reference.includes('SHA-256'))).toBe(true)
      expect(asset.figure.nodes.every(n=>['rectangle','ellipse','text','path'].includes(n.kind))).toBe(true)
      expect(asset.figure.containers.every(c=>!c.dataChart)).toBe(true)
      expect(asset.figure.nodes.every(n=>!n.chart)).toBe(true)
    }
    const entries=createCatalogue([])
    for(const asset of galleryPrimitives())expect(entries.filter(e=>e.kind==='asset'&&e.asset.id===asset.id)).toHaveLength(1)
    // Full compositions require the author's explicit choice, just like existing complete paper examples.
    expect(entries.some(e=>e.kind==='asset'&&e.asset.id.startsWith('gallery-benchmark-'))).toBe(false)
    expect(recommendCatalogue(entries,'配对身份矩阵').some(e=>e.asset.id==='gallery-part-identity-matrix')).toBe(true)
  })

  it('retains local bindings, manually edited labels and provenance across repeated insertion and capture',()=>{
    const asset=galleryBenchmark('tool-feedback'),before=JSON.stringify(asset),scaled=scaleComponent(asset,.4),base=createBlank()
    Object.assign(rootContainer(base),{x:0,y:0,width:1000,height:620,role:'component'})
    const one=instantiateComponentAt(base,scaled,'stage',{x:10,y:100},'one').document
    const two=instantiateComponentAt(one,scaled,'stage',{x:520,y:100},'two')
    const actor=two.document.nodes.find(n=>n.id===two.nodeIds.actor)!
    actor.label='Custom actor'
    for(const n of two.document.nodes.filter(n=>n.path))for(const [end,endpoint]of [['start',pathPoints(two.document,n)[0]!],['end',pathPoints(two.document,n).at(-1)!]] as const){
      const binding=n.path![end]
      if(binding){
        expect(binding.nodeId.startsWith(n.id.startsWith('one-')?'one-':'two-')).toBe(true)
        const anchor=bindingPoint(two.document,binding)!
        expect(anchor.x).toBeCloseTo(endpoint.x);expect(anchor.y).toBeCloseTo(endpoint.y)
      }
    }
    const captured=captureComponent(two.document,'two','Edited feedback')
    expect(captured.figure.nodes.some(n=>n.label==='Custom actor')).toBe(true)
    expect(captured.sources).toEqual(expect.arrayContaining(asset.sources))
    expect(()=>parseDocument(captured.figure)).not.toThrow()
    expect(JSON.stringify(asset)).toBe(before)
  })

  it('separates state reading/writing, parameter transfer and categorical pair identity',()=>{
    const temporal=galleryBenchmark('temporal-state').figure
    expect(temporal.nodes.find(n=>n.id==='read-old-state')!.path).toMatchObject({start:{nodeId:'state-before'},end:{nodeId:'compute-1'}})
    expect(temporal.nodes.find(n=>n.id==='write-later-state')!.path).toMatchObject({start:{nodeId:'compute-1'},end:{nodeId:'state-after'}})
    const phases=galleryBenchmark('training-deployment').figure
    expect(phases.nodes.find(n=>n.id==='checkpoint-transfer')!).toMatchObject({visual:{dash:[5,4]},path:{start:{nodeId:'training-model'},end:{nodeId:'checkpoint'}}})
    expect(phases.nodes.find(n=>n.id==='load-checkpoint')!.path).toMatchObject({start:{nodeId:'checkpoint'},end:{nodeId:'deployed-model'}})
    expect(phases.nodes.find(n=>n.id==='gradient-update')!.path).toMatchObject({start:{nodeId:'objective'},end:{nodeId:'training-model'}})
    expect(phases.nodes.some(n=>n.parentId==='deploy'&&n.label.includes('objective'))).toBe(false)
    const matrix=galleryPrimitive('identity-matrix').figure
    expect(matrix.nodes.filter(n=>n.id.startsWith('pair-')).every(n=>n.label==='')).toBe(true)
    expect(matrix.nodes.find(n=>n.id==='matrix-note')!.label).toContain('no scores')
  })
})
