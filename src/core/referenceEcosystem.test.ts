import { readFileSync } from 'node:fs'
import { DOMParser } from '@xmldom/xmldom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { figureforgeResources, convertFigureforgeTemplate } from './figureforge'
import { createPaperGallery, defaultGalleryFilters, importPaperReference, paperCitation, paperImageUrl, searchPaperGallery, topconfCommit, type PaperFigure } from './paperGallery'
import { clone, createBlank, parseDocument } from './model'
import { captureComponent, instantiateComponent, scaleComponent } from './assets'
import { composeCatalogue, describeCatalogue } from './catalogue'
import { paletteById } from '../data/materials'
import { recolorChartSeries } from './paint'
import { exportSvg } from './svg'
import { parseHarnessResponse } from './harness'
import { diffFigures } from './figureDiff'
const read=(file:string)=>JSON.parse(readFileSync(new URL(`../../${file}`,import.meta.url),'utf8'))
const templates=figureforgeResources.parse(read('public/resources/figureforge/templates.json')).templates
// A chart and a diagram exercise distinct SVG content; the converter is tested in svgImport.test.ts.
const representativeTemplates=['grouped-bar','schematic','heatmap','comp-abc'].map(id=>templates.find(t=>t.id===id)!)
const paper=(id:string,title:string,patch:Partial<PaperFigure>={}):PaperFigure=>({id,title,venue:'iclr',year:2026,authors:['Researcher A','Researcher Z'],pattern:'architecture',image:`images/iclr/final/${id}.jpg`,paper:`https://example.org/papers/${id}`,w:800,h:400,tier:'oral',...patch})
const gallerySource={version:1,commit:topconfCommit,figures:[
  paper('multimodal','Multimodal Vision Language Framework'),
  paper('diffusion','Diffusion Models for Image Generation',{venue:'cvpr',year:2025,pattern:'results'}),
  paper('graph','Graph Neural Networks for Prediction',{venue:'neurips',year:2024,pattern:'framework'}),
  paper('retrieval','Retrieval Augmented Generation with Reranking',{venue:'acl',year:2025,pattern:'pipeline'}),
  paper('contrastive','Contrastive Feature Learning',{tier:'spotlight'})
]},gallery=createPaperGallery(gallerySource)
const parseXml=(s:string)=>new DOMParser({onError:(_level,message)=>{throw new Error(message)}}).parseFromString(s,'image/svg+xml') as unknown as Document
afterEach(()=>vi.unstubAllGlobals())
describe('pinned FigureForge template reuse',()=>{
  it.each(representativeTemplates)('converts $id into editable geometry, retains attribution and reuses it through the model catalogue',template=>{
    const asset=convertFigureforgeTemplate(template,{parseXml}),before=clone(asset),inserted=instantiateComponent(createBlank(),asset,'stage')
    expect(asset.sources[0]?.reference).toContain('MIT');expect(asset.sources[0]?.file?.sha256).toBe(template.sha256)
    expect(()=>parseDocument(inserted.document)).not.toThrow();expect(exportSvg(inserted.document)).not.toContain('<image');
    const small=scaleComponent(asset,.5),insertion=instantiateComponent(createBlank(),small,'stage'),recaptured=captureComponent(insertion.document,insertion.containerId,'Example')
    expect(recaptured.sources[0]?.file?.sha256).toBe(template.sha256)
    const entry={kind:'asset' as const,asset},instance=composeCatalogue(createBlank(),[entry],[{id:'chart',componentKey:`asset:${asset.id}`,parentId:'stage',x:70,y:155,scale:.7,keepAppearance:true}],[])
    expect(instance.figure.nodes.map(n=>n.kind)).toEqual(asset.figure.nodes.map(n=>n.kind));expect(describeCatalogue([entry])[0]!.nodes).toHaveLength(asset.figure.nodes.length);expect(asset).toEqual(before)
  })
  it('recolors series marks and matching legends together while preserving axes and statistical layers',()=>{
    const template=representativeTemplates[0]!,asset=convertFigureforgeTemplate(template,{parseXml}),before=clone(asset.figure),palette=paletteById.get('figureforge-classic')!
    recolorChartSeries(asset.figure,palette.id)
    for(const node of asset.figure.nodes){if(node.chart?.role==='series'&&node.chart.series!==undefined){for(const channel of node.chart.channels)if(channel!=='text')expect(node.visual?.[channel]).toBe(palette.colors[node.chart.series%palette.colors.length])}else expect(node).toEqual(before.nodes.find(n=>n.id===node.id))}
    const candidate=clone(asset.figure);for(const n of candidate.nodes)delete n.chart
    const response=parseHarnessResponse(JSON.stringify({message:'修改图表',figure:candidate}),asset.figure);expect(response.figure?.nodes.map(n=>n.chart)).toEqual(asset.figure.nodes.map(n=>n.chart))
    const changed=clone(asset.figure);changed.nodes.find(n=>n.chart?.role==='series')!.chart!.series=2;expect(diffFigures(asset.figure,changed).changes.some(c=>c.fields.some(f=>f.name==='图表语义'))).toBe(true)
  })
})
describe('Top-Conf source metadata and CPU retrieval',()=>{
  it('reuses bilingual query expansion, token matching and BM25 ranking without model downloads',()=>{
    for(const [zh,en] of [['多模态','multimodal'],['扩散','diffusion'],['图神经网络','graph neural'],['检索增强','retrieval augmented']]){const results=searchPaperGallery(gallery,zh!);expect(results.length).toBeGreaterThan(0);expect(results.some(r=>r.hits.includes(en!.split(' ')[0]!))).toBe(true)}
    const exact=gallery.figures.find(f=>f.id==='retrieval')!;expect(searchPaperGallery(gallery,exact.title)[0]!.figure.id).toBe(exact.id);expect(searchPaperGallery(gallery,'Researcher Z').some(r=>r.figure.id===exact.id)).toBe(true);expect(searchPaperGallery(gallery,'zzzz-no-such-paper')).toHaveLength(0)
    expect(paperImageUrl(exact)).toBe(`https://raw.githubusercontent.com/qwdwqfwq/topconf-paper-figure-gallery/${topconfCommit}/${exact.image}`);expect(paperCitation(exact)).toContain(exact.paper);expect(paperCitation(exact)).toContain('Researcher A, Researcher Z')
  })
  it('combines all gallery filters and never manufactures rows on empty or unmatched queries',()=>{
    const results=searchPaperGallery(gallery,'',{venue:'iclr',year:'2026',pattern:'architecture',tier:'oral'});expect(results.length).toBeGreaterThan(0);expect(results.every(r=>r.figure.venue==='iclr'&&r.figure.year===2026&&r.figure.pattern==='architecture'&&r.figure.tier==='oral')).toBe(true)
    expect(searchPaperGallery(gallery,'',defaultGalleryFilters).map(row=>row.figure.id)).toEqual(['multimodal','contrastive','diffusion','retrieval','graph']);expect(searchPaperGallery(gallery,'diffusion',{...defaultGalleryFilters,venue:'aaai',year:'2030'})).toHaveLength(0)
  })
  it('rejects corrupt versions, duplicate IDs and arbitrary image origins',()=>{
    expect(()=>createPaperGallery({...gallerySource,commit:'untrusted'})).toThrow();expect(()=>createPaperGallery({...gallerySource,figures:[gallery.figures[0],gallery.figures[0]]})).toThrow('重复')
    expect(()=>paperImageUrl({...gallery.figures[0]!,image:'https://example.org/asset.jpg'})).toThrow();expect(()=>paperImageUrl({...gallery.figures[0]!,image:'images/a/final/../../secret.jpg'})).toThrow()
  })
  it('fails oversized or unavailable remote images cleanly',async()=>{
    const figure=gallery.figures[0]!
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(null,{status:404})));await expect(importPaperReference(figure,{x:0,y:0,width:400,height:200})).rejects.toThrow('404')
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(new Uint8Array([1]),{headers:{'content-length':'12000001'}})));await expect(importPaperReference(figure,{x:0,y:0,width:400,height:200})).rejects.toThrow('12 MB')
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(new Uint8Array(12_000_001))));await expect(importPaperReference(figure,{x:0,y:0,width:400,height:200})).rejects.toThrow('12 MB')
  })
})
