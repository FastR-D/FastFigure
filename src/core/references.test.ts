import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { createEditor } from '../composables/useEditor'
import { captureComponent, componentDocument, instantiateComponent, parseAsset } from './assets'
import { clone, createExample, parseDocument, referenceImageSchema, type ReferenceImage } from './model'
import { exportSvg } from './svg'
import { fitReference, normalizedRegion, referenceSource, resizeReference, wholeImage } from './references'
import {componentImageSearchQuery,parseComponentImageAnalysis} from './componentSearch'

const image = (id = 'ref-a', hash = 'a'): ReferenceImage => ({
  id, title: 'Architecture paper', citation: 'https://example.org/paper, Fig. 2(a)', fileName: 'architecture.png', sha256: hash.repeat(64),
  pixelWidth: 800, pixelHeight: 400, dataUrl: 'data:image/png;base64,iVBORw0KGgo=', placement: { x: 100, y: 150, width: 800, height: 400 },
})
let scope: ReturnType<typeof effectScope>
beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) })
  scope = effectScope()
})
afterEach(() => { scope.stop(); vi.unstubAllGlobals() })

describe('Reference guides and evidence provenance', () => {
  it('uses only declared visible image terms for retrieval and rejects invented payloads instead of treating them as evidence',()=>{
    const raw={summary:'Visible stacked planes',terms:[{term:'tensor stack',basis:'Three visible overlapping planes',certainty:'visible'},{term:'secret algorithm',basis:'Not readable',certainty:'uncertain'}],cautions:['Schematic only']},before=clone(raw),analysis=parseComponentImageAnalysis(JSON.stringify(raw))
    expect(componentImageSearchQuery('Preserve the original requirement',analysis)).toBe('Preserve the original requirement\ntensor stack');expect(raw).toEqual(before)
    expect(componentImageSearchQuery('Original text',{...analysis,terms:analysis.terms.filter(term=>term.certainty==='uncertain')})).toBe('Original text')
    for(const value of [{...raw,values:[1,2]},{...raw,terms:[{...raw.terms[0],certainty:'verified'}]},{...raw,terms:[{term:'tensor',basis:'',certainty:'visible'}]}])expect(()=>parseComponentImageAnalysis(JSON.stringify(value))).toThrow('线索契约')
  })
  it('fits portrait and landscape sources without distortion and bounds resized guides', () => {
    const area = { x: 100, y: 80, width: 600, height: 400 }
    expect(fitReference(image(), area)).toEqual({ x: 100, y: 130, width: 600, height: 300 })
    const portrait = { ...image(), pixelWidth: 400, pixelHeight: 800 }
    expect(fitReference(portrait, area)).toEqual({ x: 300, y: 80, width: 200, height: 400 })
    expect(resizeReference(portrait, 4000)).toEqual({ x: 100, y: 150, width: 1000, height: 2000 })
    expect(resizeReference(image(), 500).height).toBe(250)
  })
  it('normalizes reverse/outside drags and rejects invalid or remote image payloads, stretched placement and oversized regions', () => {
    expect(normalizedRegion({ x: 1.4, y: 0.8 }, { x: -0.2, y: 0.1 })).toEqual({ x: 0, y: 0.1, width: 1, height: 0.7000000000000001 })
    for (const dataUrl of ['https://example.org/picture.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,not base64', `data:image/png;base64,${'A'.repeat(600_000)}`])
      expect(() => referenceImageSchema.parse({ ...image(), dataUrl })).toThrow()
    expect(() => referenceImageSchema.parse({ ...image(), placement: { ...image().placement, height: 100 } })).toThrow()
    expect(() => referenceSource(image(), { x: 0.8, y: 0, width: 0.3, height: 1 })).toThrow()
  })
  it('imports references atomically, rejects duplicates/capacity, and saves them with history and portable project JSON', () => {
    const e = scope.run(createEditor)!, original = clone(e.figure.value)
    expect(e.addReference(image())).toBe(true)
    expect(e.past.value).toHaveLength(1)
    e.undo(); expect(e.figure.value).toEqual(original)
    e.redo(); expect(e.figure.value.references).toEqual([image()])
    const before = clone(e.figure.value)
    expect(e.addReference(image('different-id'))).toBe(false)
    expect(e.figure.value).toEqual(before)
    e.addReference(image('ref-b', 'b')); e.addReference(image('ref-c', 'c'))
    const full = clone(e.figure.value)
    expect(e.addReference(image('ref-d', 'd'))).toBe(false); expect(e.figure.value).toEqual(full)
    e.save()
    expect(scope.run(createEditor)!.figure.value).toEqual(full)
    e.newProject('blank'); expect(e.figure.value.references).toEqual([])
    e.importProject(JSON.stringify(full)); expect(e.figure.value).toEqual(full)
    const tooLarge = clone(full)
    tooLarge.references.forEach(r => { r.dataUrl = `data:image/png;base64,${'A'.repeat(450_000)}` })
    expect(() => e.importProject(JSON.stringify(tooLarge))).toThrow()
    expect(e.figure.value).toEqual(full)
  })
  it('retains bound regions on moves/layouts and source edits; removing an image keeps evidence and undo restores both', () => {
    const e = scope.run(createEditor)!, region = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
    e.addReference(image()); e.select('encoder'); expect(e.bindEvidence(region)).toBe(true)
    e.editReference('ref-a', { title: 'Revised paper', citation: 'Fig. 3, page 7' })
    const evidence = clone(e.selectedNode.value!.evidence!)
    expect(evidence).toMatchObject({ title: 'Revised paper', reference: 'Fig. 3, page 7', image: { region } })
    e.setPosition('x', 300); expect(e.selectedNode.value?.evidence).toEqual(evidence)
    e.applyLayout('stage', { mode: 'flow', direction: 'right', gap: 32, columns: 2, adjustPorts: true, recursive: false, fitContainers: false })
    expect(e.figure.value.nodes.find(n => n.id === 'encoder')?.evidence).toEqual(evidence)
    e.removeReference('ref-a'); expect(e.figure.value.references).toEqual([])
    expect(e.figure.value.nodes.find(n => n.id === 'encoder')?.evidence).toEqual(evidence)
    e.undo(); expect(e.figure.value.references[0]?.title).toBe('Revised paper')
    e.select('encoder'); e.clearEvidence(); expect(e.selectedNode.value?.evidence).toBeUndefined()
    e.undo(); expect(e.figure.value.nodes.find(n => n.id === 'encoder')?.evidence).toEqual(evidence)
  })
  it('captures node and root evidence into portable assets, preserves it after reinsertion, and excludes guide pixels from vectors', () => {
    const doc = createExample(), ref = image(), region = { x: 0.2, y: 0.3, width: 0.4, height: 0.5 }
    doc.references = [ref]; doc.nodes[0]!.evidence = referenceSource(ref, region)
    doc.containers[0]!.evidence = referenceSource(ref, wholeImage)
    const asset = captureComponent(doc, 'stage', 'Traced method')
    expect(asset.sources).toHaveLength(1)
    expect(asset.sources[0]!.image!.region).toEqual(wholeImage)
    expect(asset.figure.references).toEqual([])
    expect(asset.figure.nodes[0]!.evidence).toEqual(doc.nodes[0]!.evidence)
    const reused = componentDocument(parseAsset(JSON.parse(JSON.stringify(asset))))
    expect(reused.nodes[0]!.evidence).toEqual(doc.nodes[0]!.evidence)
    expect(reused.references).toEqual([])
    expect(() => parseAsset({ ...asset, figure: { ...asset.figure, references: [ref] } })).toThrow()
    const target = createExample(); target.nodes = []; target.edges = []
    // This full-size capture has no room inside a parent: failure must leave target and guide metadata intact.
    const before = clone(target)
    expect(() => instantiateComponent(target, asset, 'stage')).toThrow(); expect(target).toEqual(before)
    const svg = exportSvg(doc)
    expect(svg).not.toContain(ref.dataUrl); expect(svg).not.toContain('<image')
    expect(svg).toContain(ref.sha256); expect(svg).toContain('Architecture paper')
  })
  it('rejects duplicate reference identities/hashes and limits the total embedded image budget', () => {
    const doc = createExample(); doc.references = [image(), image('ref-b')]
    expect(() => parseDocument(doc)).toThrow()
    doc.references = [image(), image('ref-b', 'b'), image('ref-c', 'c')]
    doc.references.forEach(r => { r.dataUrl = `data:image/png;base64,${'A'.repeat(500_000)}` })
    expect(() => parseDocument(doc)).toThrow()
  })
  it('collects many objects from the same original image as one source while keeping individual object evidence', () => {
    const doc = createExample(), ref = image(), base = doc.nodes[0]!
    doc.nodes = Array.from({ length: 20 }, (_, i) => ({ ...base, id: `n-${i}`, evidence: referenceSource(ref, { x: i / 20, y: 0.1, width: 0.05, height: 0.4 }) }))
    doc.edges = []
    const asset = captureComponent(doc, 'stage', 'Twenty traced objects')
    expect(asset.sources).toHaveLength(1)
    expect(asset.sources[0]!.image!.region).toMatchObject({ x: 0, y: 0.1, width: 1, height: 0.4 })
    expect(asset.figure.nodes.map(n => n.evidence)).toEqual(doc.nodes.map(n => n.evidence))
  })
})
