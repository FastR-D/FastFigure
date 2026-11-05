import {selectionPreviewGroups,validateSelectionPreviewPages,selectionPreviewEntriesSchema} from './selectionPreviews'
import { describe, expect, it } from 'vitest'
import { buildRecipe } from '../data/recipes'
import { captureComponent, componentDocument, instantiateComponentAt, parseAsset } from './assets'
import { catalogueAsset, catalogueKey, catalogueSchema, componentInstanceSchema, composeCatalogue, createCatalogue, describeCatalogue, instanceLinkSchema, recommendCatalogue, searchCatalogue, type CatalogueEntry, type ComponentInstance, type InstanceLink } from './catalogue'
import { clone, createBlank, parseDocument, rootContainer } from './model'
import { parseHarnessResponse } from './harness'
import {cataloguePreviewLayout,catalogueSnapshotJson,describeReconstructionCatalogue,validateCataloguePreviewLayout} from './cataloguePreview'
import {cataloguePreviewInfoSchema} from './cataloguePreviewContract'
import {bindingPoint,pathPoints} from './paths'

function personal(): CatalogueEntry {
  const asset = buildRecipe('pipeline', { stages: 2, direction: 'row' })
  asset.id = 'my-pipeline'; asset.name = asset.figure.title = rootContainer(asset.figure).title = '科研编码流水线'
  asset.tags = ['编码', 'Research encoder']; asset.sources = [{ title: '方法草图', reference: 'Fig A, block 1' }]
  asset.figure.nodes[0]!.label = 'Manually refined encoder'
  return { kind: 'asset', asset: parseAsset(asset) }
}
const entries: CatalogueEntry[] = [personal(), { kind: 'recipe', id: 'fusion' }]
const specs = (): ComponentInstance[] => [
  componentInstanceSchema.parse({ id: 'pipeline', componentKey: 'asset:my-pipeline', parentId: 'stage', x: 80, y: 150, labels: { 'step-0': 'Custom encoding' } }),
  componentInstanceSchema.parse({ id: 'fuse', componentKey: 'recipe:fusion', parentId: 'stage', x: 380, y: 330, parameters: { branches: 2, operator: 'sum', feature: 'tensor' } }),
]
const links = (): InstanceLink[] => [instanceLinkSchema.parse({ id: 'bridge', source: { scope: 'port', instanceId: 'pipeline', port: 'output', index: 0 }, target: { scope: 'instance', instanceId: 'fuse', nodeId: 'branch-0' }, sourcePort: 'right', targetPort: 'left' })]

describe('Research component retrieval and deterministic composition', () => {
  it('keeps complementary relevant families available for a main figure while preserving saved edits and simple-query relevance',()=>{
    const recipes:CatalogueEntry[]=[{kind:'recipe',id:'feature-pyramid'},{kind:'recipe',id:'unet-encoder-decoder'},{kind:'recipe',id:'tensor-stack'},{kind:'recipe',id:'structure-matrix'},{kind:'recipe',id:'residual-block'},{kind:'recipe',id:'pipeline'},{kind:'recipe',id:'layered-architecture'}],query='main figure 多尺度 特征 张量 矩阵',before=clone(recipes)
    const main=recommendCatalogue(recipes,query);expect(main[0]!.key).toBe(searchCatalogue(recipes,query)[0]!.key);expect(main.some(item=>item.key==='recipe:tensor-stack')).toBe(true);expect(main.some(item=>item.key==='recipe:structure-matrix')).toBe(true);expect(main).toHaveLength(6);expect(new Set(main.map(item=>item.key)).size).toBe(6);expect(recipes).toEqual(before)
    const blank=recommendCatalogue(recipes,'主图');expect(blank.filter(item=>['recipe:feature-pyramid','recipe:unet-encoder-decoder'].includes(item.key))).toHaveLength(1)
    expect(new Set(recommendCatalogue([...recipes,...recipes],'主图').map(item=>item.key)).size).toBe(6)
    const simple=recommendCatalogue(recipes,'UNet');expect(simple[0]!.key).toBe('recipe:unet-encoder-decoder')
    const mine=personal(),manual=recommendCatalogue([mine,...recipes],'主图');expect(manual.some(item=>item.key===catalogueKey(mine))).toBe(true);expect(manual.find(item=>item.key===catalogueKey(mine))!.asset.figure.nodes[0]!.label).toBe('Manually refined encoder')
    const described=describeCatalogue(recipes);expect(described.find(item=>item.key==='recipe:unet-encoder-decoder')!.compositionUse).toMatchObject({family:'multiscale',roles:['overview','mechanism']});expect(described.find(item=>item.key==='recipe:residual-block')!.compositionUse!.caution).toContain('post-activation')
  })
  it('covers the complete 24-candidate pool with ordered six-item pages and rejects dropped or reordered sheets',()=>{
    const entries=Array.from({length:24},(_,index)=>{const entry=personal();if(entry.kind==='asset'){entry.asset.id=`pool-${index}`;entry.asset.name=`Candidate ${index}`}return entry}),groups=selectionPreviewGroups(entries),pages=groups.map(group=>({version:1 as const,renderer:'fastfigure-browser-v1' as const,sha256:'a'.repeat(64),snapshotSha256:'b'.repeat(64),fonts:[],...cataloguePreviewLayout(group)}))
    expect(groups.map(group=>group.length)).toEqual([6,6,6,6]);expect(()=>validateSelectionPreviewPages(entries,pages)).not.toThrow();expect(()=>validateSelectionPreviewPages(entries,pages.slice(1))).toThrow('页数');expect(()=>validateSelectionPreviewPages(entries,[...pages].reverse())).toThrow('顺序');expect(()=>selectionPreviewEntriesSchema.parse([...entries,entries[0]])).toThrow();expect(selectionPreviewGroups(entries.slice(0,7)).map(group=>group.length)).toEqual([6,1])
  })

  it('marks omitted colour-use annotations as unspecified while keeping palette, slot and value validation strict',()=>{
    const base=createBlank(),sources:CatalogueEntry[]=[{kind:'recipe',id:'scaled-attention'}],mapping={sourcePaletteId:'paper-reference',sourceIndex:0,targetPaletteId:'figureforge-publication-soft',targetIndex:1},instance={id:'attention',componentKey:'recipe:scaled-attention',parentId:'stage',x:80,y:160,fit:{width:800,height:400},colorMap:[mapping]},response={message:'Mapped native attention',figure:base,instances:[instance]},saved=clone(sources)
    const result=parseHarnessResponse(JSON.stringify(response),base,sources);expect(result.used[0]!.colorMap![0]!.role).toBe('用途未注明');expect(result.figure!.containers.find(c=>c.id==='attention')!.appearance!.colorMap![0]!.role).toBe('用途未注明');expect(sources).toEqual(saved)
    for(const invalid of [{...mapping,sourcePaletteId:'invented'},{...mapping,targetIndex:12},{...mapping,role:2}])expect(()=>parseHarnessResponse(JSON.stringify({...response,instances:[{...instance,colorMap:[invalid]}]}),base,sources)).toThrow()
  })
  it('fits configured native instances uniformly into explicit content regions without changing sources or relaxing collisions',()=>{
    const base=createBlank(),catalogue:CatalogueEntry[]=[{kind:'recipe',id:'scaled-attention'}],before=clone(base),spec=componentInstanceSchema.parse({id:'attention',componentKey:'recipe:scaled-attention',parentId:'stage',x:80,y:160,parameters:{mask:'causal'},fit:{width:800,height:400},keepAppearance:true})
    const result=composeCatalogue(base,catalogue,[spec],[]),group=result.figure.containers.find(c=>c.id==='attention')!,factor=400/510
    expect(group).toMatchObject({x:80,y:160});expect(group.width).toBeCloseTo(980*factor);expect(group.height).toBeCloseTo(400);expect(result.used[0]).toMatchObject({scale:factor,fit:{width:800,height:400},parameters:{mask:'causal'}});expect(base).toEqual(before)
    expect(()=>componentInstanceSchema.parse({...spec,scale:1})).toThrow('只能选择一种');expect(()=>composeCatalogue(base,catalogue,[{...spec,fit:{width:900,height:400}}],[])).toThrow('内容区');expect(()=>composeCatalogue(base,catalogue,[{...spec,fit:{width:1,height:1}}],[])).toThrow('10–400%')
    const occupied=clone(base);occupied.nodes.push({id:'obstacle',kind:'rectangle',label:'Existing',parentId:'stage',x:100,y:180,width:80,height:80});expect(()=>composeCatalogue(occupied,catalogue,[spec],[])).toThrow('重叠');expect(occupied.nodes).toHaveLength(1)
    const response={message:'Fit explicitly',figure:base,instances:[spec]},candidate=parseHarnessResponse(JSON.stringify(response),base,catalogue).figure!;expect(candidate).toEqual(result.figure)
  })
  it('attaches base-figure leaders to declared new-instance anchors without exposing expanded IDs to the model',()=>{
    const base=createBlank();base.nodes.push({id:'leader',kind:'path',label:'Annotation',parentId:'stage',x:100,y:145,width:120,height:40,path:{points:[{x:0,y:0},{x:1,y:1}],arrow:'none'},visual:{fill:'none'}})
    const component={id:'stack',componentKey:'recipe:tensor-stack',parentId:'stage',x:260,y:160,keepAppearance:true},attachment={pathId:'leader',end:'end',instanceId:'stack',nodeId:'plane-0',anchorIndex:1,reason:'Explicit annotation binding'},response={message:'Native annotation',figure:base,instances:[component],attachments:[attachment]},sources:CatalogueEntry[]=[{kind:'recipe',id:'tensor-stack'}],saved=clone(base)
    const doc=parseHarnessResponse(JSON.stringify(response),base,sources).figure!,leader=doc.nodes.find(n=>n.id==='leader')!;expect(pathPoints(doc,leader).at(-1)).toMatchObject(bindingPoint(doc,leader.path!.end!)!);expect(base).toEqual(saved)
    expect(()=>parseHarnessResponse(JSON.stringify({...response,attachments:[{...attachment,instanceId:'other'}]}),base,sources)).toThrow('引线绑定');expect(()=>parseHarnessResponse(JSON.stringify({...response,figure:null}),base,sources)).toThrow('目标画布')
    expect(describeCatalogue(sources)[0]!.nodes.find(n=>n.id==='plane-0')!.attachmentAnchors!.some(a=>a.index===1)).toBe(true)
  })
  it('pins default preview tiles to ordered frozen assets, including manual geometry, and reports structure-directory coverage honestly',()=>{
    const all:CatalogueEntry[]=[personal(),{kind:'seed',id:'encoder'},{kind:'recipe',id:'mlp'},{kind:'seed',id:'tensor'},{kind:'seed',id:'volume'},{kind:'recipe',id:'fusion'}],saved=clone(all),layout=cataloguePreviewLayout(all)
    expect(layout).toMatchObject({width:1600,height:1440});expect(layout.tiles.map(t=>[t.index,t.key,t.x,t.y])).toEqual(all.map((e,i)=>[i+1,catalogueKey(e),i%2*800,Math.floor(i/2)*480]))
    const snapshot=catalogueSnapshotJson(all),reordered=JSON.parse(JSON.stringify(all),(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).reverse()):value) as CatalogueEntry[];expect(catalogueSnapshotJson(reordered)).toBe(snapshot)
    const changed=clone(all);if(changed[0]!.kind==='asset')changed[0]!.asset.figure.nodes[0]!.x+=1;expect(catalogueSnapshotJson(changed)).not.toBe(snapshot);expect(catalogueSnapshotJson([...all].reverse())).not.toBe(snapshot);expect(all).toEqual(saved)
    const info=cataloguePreviewInfoSchema.parse({version:1,renderer:'fastfigure-browser-v1',sha256:'a'.repeat(64),snapshotSha256:'b'.repeat(64),fonts:[],...layout});expect(()=>validateCataloguePreviewLayout(all,info)).not.toThrow();expect(()=>validateCataloguePreviewLayout([...all].reverse(),info)).toThrow('顺序');expect(()=>cataloguePreviewLayout([])).toThrow('至少需要')
    const described=describeReconstructionCatalogue(all);expect(described[1]!.nodes[0]!.structure).toMatchObject({type:'encoder',repeats:6});expect(described[2]!.edges.length).toBeGreaterThan(0);expect(described[0]!.nodes[0]!.label).toBe('Manually refined encoder')
    const dense=catalogueAsset({kind:'recipe',id:'mlp'},{inputs:4,hiddenLayers:3,hidden:4,outputs:3});for(let i=0;i<80;i++)dense.figure.nodes.push({...clone(dense.figure.nodes[0]!),id:`extra-${i}`,kind:'ellipse'});const coverage=describeReconstructionCatalogue([{kind:'asset',asset:dense}])[0]!.coverage;expect(coverage.detailedNodes).toBe(80);expect(coverage.omittedNodes).toBe(dense.figure.nodes.length-80)
  })
  it('retrieves personal and bilingual components and includes personal assets in fallback', () => {
    const my = personal(), catalogue = createCatalogue(my.kind === 'asset' ? [my.asset] : [])
    expect(searchCatalogue(catalogue, 'Research encoder')[0]!.key).toBe('asset:my-pipeline')
    expect(searchCatalogue(catalogue, 'MLP')[0]!.key).toBe('recipe:mlp')
    expect(searchCatalogue(catalogue, '多分支特征融合')[0]!.key).toBe('recipe:fusion')
    expect(searchCatalogue(catalogue, '缩放点积注意力 QKV')[0]!.key).toBe('recipe:scaled-attention')
    const suggested = recommendCatalogue(catalogue, '')
    expect(suggested.some(item => item.key === 'asset:my-pipeline')).toBe(true)
  })
  it('expands a saved manual component and a parameterized recipe with trusted provenance and remapped external edges', () => {
    const base = createBlank(), before = clone(base), originals = clone(entries)
    const result = composeCatalogue(base, entries, specs(), links())
    expect(base).toEqual(before); expect(entries).toEqual(originals)
    expect(result.figure.nodes).toHaveLength(6); expect(result.figure.containers).toHaveLength(3); expect(result.figure.edges).toHaveLength(5)
    const a = result.figure.containers.find(c => c.id === 'pipeline')!, b = result.figure.containers.find(c => c.id === 'fuse')!
    expect(a.component?.sources).toEqual([{ title: '方法草图', reference: 'Fig A, block 1' }])
    expect(b.component?.recipe?.parameters).toEqual({ branches: 2, operator: 'sum', feature: 'tensor' })
    expect(result.used.map(use => use.componentKey)).toEqual(['asset:my-pipeline', 'recipe:fusion'])
    const bridge = result.figure.edges.find(e => e.id === 'bridge')!
    expect(result.figure.nodes.find(n => n.id === bridge.source)?.label).toBe('Stage 2')
    expect(result.figure.nodes.find(n => n.id === bridge.target)?.label).toBe('Feature 1')
    expect(result.figure.nodes.find(n => n.label === 'Custom encoding')?.parentId).toBe('pipeline')
    expect(result.figure.edges.every(e => result.figure.nodes.some(n => n.id === e.source) && result.figure.nodes.some(n => n.id === e.target))).toBe(true)
    expect(composeCatalogue(base, entries, specs(), links())).toEqual(result)
    const captured = captureComponent(result.figure, 'stage', 'Reusable composed method')
    expect(captured.sources.map(s => s.title)).toEqual(['方法草图', '模板合集20260627.pptx'])
    expect(captured.lineage.map(a => a.assetId)).toEqual(['my-pipeline', 'builtin-fusion'])
    expect(componentDocument(captured).nodes).toHaveLength(6)
  })
  it('keeps saved recipe-derived components frozen, validates recipe parameters, and rejects missing labels or catalogue keys', () => {
    expect(() => catalogueAsset(personal(), { stages: 5 })).toThrow('不接受配方参数')
    expect(() => catalogueAsset({ kind: 'recipe', id: 'fusion' }, { layers: 4 })).toThrow('不支持参数')
    expect(() => catalogueAsset({ kind: 'recipe', id: 'fusion' }, { branches: 8 })).toThrow()
    const badLabel = specs(); badLabel[0]!.labels = { missing: 'x' }
    expect(() => composeCatalogue(createBlank(), entries, badLabel, [])).toThrow('不存在节点')
    expect(() => composeCatalogue(createBlank(), [], specs(), [])).toThrow('本轮参考')
    expect(() => catalogueSchema.parse([...entries, personal()])).toThrow()
  })
  it('rejects overlaps, parent cycles, duplicate/generated IDs, capacity and invalid connection endpoints atomically', () => {
    const base = createBlank(), before = clone(base)
    const overlap = specs(); overlap[1]!.x = 100; overlap[1]!.y = 170
    expect(() => composeCatalogue(base, entries, overlap, [])).toThrow('重叠')
    const outside = specs(); outside[1]!.y = 500
    expect(() => composeCatalogue(base, entries, outside, [])).toThrow('超出')
    const cycle = specs(); cycle[0]!.parentId = 'fuse'; cycle[1]!.parentId = 'pipeline'
    expect(() => composeCatalogue(base, entries, cycle, [])).toThrow('循环依赖')
    const duplicate = specs(); duplicate[1]!.id = 'pipeline'
    expect(() => composeCatalogue(base, entries, duplicate, [])).toThrow('不能重复')
    const badLink = links(); badLink[0]!.target = { scope: 'port', instanceId: 'fuse', port: 'output', index: 10 }
    expect(() => composeCatalogue(base, entries, specs(), badLink)).toThrow('序号不存在')
    const dangling = links(); dangling[0]!.source = { scope: 'node', nodeId: 'missing' }
    expect(() => composeCatalogue(base, entries, specs(), dangling)).toThrow('节点不存在')
    const self = links(); self[0]!.target = clone(self[0]!.source)
    expect(() => composeCatalogue(base, entries, specs(), self)).toThrow()
    expect(base).toEqual(before)
    const occupied = createBlank(); occupied.nodes.push({ id: 'pipeline-object-2', kind: 'module', parentId: 'stage', label: 'Existing', x: 750, y: 150, width: 100, height: 60 })
    expect(() => composeCatalogue(occupied, entries, [specs()[0]!], [])).toThrow('ID 已使用')
    const crowded = catalogueAsset({ kind: 'seed', id: 'encoder' })
    crowded.id = 'thirty-nodes'; crowded.figure.nodes = Array.from({ length: 30 }, (_, index) => ({ ...crowded.figure.nodes[0]!, id: `n-${index}` }))
    const crowdedEntries: CatalogueEntry[] = [{ kind: 'asset', asset: crowded }]
    const many = [80, 320, 560].map((x, i) => componentInstanceSchema.parse({ id: `instance-${i}`, componentKey: 'asset:thirty-nodes', parentId: 'stage', x, y: 150 }))
    expect(composeCatalogue(base, crowdedEntries, many.slice(0, 2), []).figure.nodes).toHaveLength(60)
    expect(() => composeCatalogue(base, crowdedEntries, many, [])).toThrow()
    expect(base).toEqual(before)
  })
  it('resolves nested instance parents independently of declaration order and handles unordered source containers', () => {
    const big = buildRecipe('pipeline', { stages: 2, direction: 'row' })
    big.id = 'big'; const root = rootContainer(big.figure)
    root.width = 800; root.height = 450
    big.figure.nodes[0]!.x = 30; big.figure.nodes[0]!.y = 70
    big.figure.nodes[1]!.x = 220; big.figure.nodes[1]!.y = 70
    const catalogue: CatalogueEntry[] = [{ kind: 'asset', asset: big }, { kind: 'seed', id: 'neuron' }]
    const child = componentInstanceSchema.parse({ id: 'child', componentKey: 'seed:neuron', parentId: 'parent', x: 100, y: 300 })
    const parent = componentInstanceSchema.parse({ id: 'parent', componentKey: 'asset:big', parentId: 'stage', x: 60, y: 150 })
    // Parent height 450 would exceed root content, so expand the canvas root within its fixed canvas first.
    const doc = createBlank(); Object.assign(rootContainer(doc), { x: 0, y: 0, width: 1000, height: 620 })
    const composed = composeCatalogue(doc, catalogue, [child, parent], [])
    expect(composed.figure.containers.find(c => c.id === 'child')?.parentId).toBe('parent')
    const asset = captureComponent(composed.figure, 'parent', 'Nested asset')
    asset.figure.containers.reverse()
    const result = instantiateComponentAt(doc, asset, 'stage', { x: 60, y: 100 }, 'unordered')
    expect(result.containerId).toBe('unordered')
    expect(() => parseDocument(result.document)).not.toThrow()
    expect(Object.values(result.nodeIds).every(id => result.document.nodes.some(n => n.id === id))).toBe(true)
  })
  it('rejects composition without a target graph and validates an actual model composition response', () => {
    expect(() => parseHarnessResponse(JSON.stringify({ message: 'bad', figure: null, instances: specs() }), createBlank(), entries)).toThrow('目标画布')
    const result = parseHarnessResponse(JSON.stringify({ message: 'composed', figure: createBlank(), instances: specs(), instanceLinks: links() }), createBlank(), entries)
    expect(result.figure?.nodes).toHaveLength(6); expect(result.used).toHaveLength(2)
  })
})
