import {exportDrawio} from './export'
import {figureThemes,applyFigureTheme} from './figureThemes'
import {comicPath} from './comicStroke'
import {parseSvgPath} from './svgPath'
import {identity} from './affine'
import {fontStack} from '../data/materials'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {DOMParser} from '@xmldom/xmldom'
import {captureStyleAsset,applyStyleAsset,styleFromComposition,recordHarnessStyle,styleAssetSchema} from './styleAsset'
import {createStyleLibrary,STYLE_LIBRARY_KEY} from '../composables/useStyleLibrary'
import {clone,createExample,createBlank,parseDocument} from './model'
import {componentDocument,captureComponent,instantiateComponentAt} from './assets'
import {scaleComponent} from './assets'
import {exportSvg} from './svg'
import {containerSurface,setContainerSurface} from './containerSurface'
import {importSvg} from './svgImport'
import {diffFigures} from './figureDiff'
import {parseHarnessResponse,harnessRunInputSchema,harnessPrompt} from './harness'
import {parseCompositionPlanResponse} from './compositionPlan'
import {buildDataChart} from './dataChart'
import {chartExample} from './dataChartTable'
import {parseChartDataset} from './chartDataset'
import {captureLineStyle} from './lineAppearance'
const asset=()=>({...captureStyleAsset(createExample()),name:'Quiet research',preset:'sketch' as const,paletteId:'figureforge-publication-soft',fontFamily:'MiSans' as const})
let storage:Map<string,string>
beforeEach(()=>{storage=new Map();vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)})})
afterEach(()=>vi.unstubAllGlobals())
describe('independent reusable style materials',()=>{
  it('reuses explicit line rules in a scoped style without changing cross-scope edges, unselected channels, topology or source snapshots',()=>{
    const figure=createBlank();figure.containers.push({id:'subset',parentId:'stage',role:'component',title:'Subset',x:100,y:200,width:340,height:200})
    figure.nodes=[{id:'a',parentId:'subset',kind:'rectangle',label:'A',x:130,y:260,width:80,height:50},{id:'b',parentId:'subset',kind:'rectangle',label:'B',x:320,y:260,width:80,height:50},{id:'c',parentId:'stage',kind:'rectangle',label:'C',x:650,y:260,width:100,height:50},{id:'note-arrow',parentId:'subset',kind:'path',label:'Note arrow',x:150,y:350,width:200,height:0,path:{points:[{x:0,y:0},{x:1,y:0}],arrow:'filled',startArrow:'open',arrowSize:8},visual:{stroke:'#ff9900',strokeWidth:3}}]
    figure.edges=[{id:'internal',source:'a',target:'b',sourcePort:'right',targetPort:'left',appearance:{stroke:'#123456',strokeWidth:3,dash:[6,3],arrow:'open',startArrow:'filled',arrowSize:10}},{id:'external',source:'b',target:'c',sourcePort:'right',targetPort:'left'}]
    const before=clone(figure),sample=captureLineStyle(figure,'internal');expect(sample).toEqual(figure.edges[0]!.appearance);sample.dash!.push(4);expect(figure).toEqual(before)
    const style={...asset(),lineStyle:{scope:'edges' as const,style:{stroke:null,strokeWidth:2,dash:[7,4]}}},result=applyStyleAsset(figure,style,'subset',false)
    expect(result.figure.nodes).toEqual(figure.nodes);expect(result.figure.edges[0]!.appearance).toEqual({strokeWidth:2,dash:[7,4],arrow:'open',startArrow:'filled',arrowSize:10});expect(result.figure.edges[1]).toEqual(figure.edges[1]);expect(result.figure.style).toEqual(figure.style);expect(result.use.lines).toEqual({total:1,changed:1,skipped:0});expect(figure).toEqual(before)
    const all=applyStyleAsset(figure,{...style,lineStyle:{scope:'all-lines',style:{stroke:'#987654',arrow:'none'}}},'subset',false);expect(all.use.lines).toEqual({total:2,changed:2,skipped:0});expect(all.figure.nodes.at(-1)!.visual).toEqual({stroke:'#987654',strokeWidth:3});expect(all.figure.nodes.at(-1)!.path).toMatchObject({arrow:'none',startArrow:'open',arrowSize:8});expect(all.figure.edges[1]).toEqual(figure.edges[1])
    const empty=applyStyleAsset(createBlank(),style);expect(empty.use.lines).toEqual({total:0,changed:0,skipped:0});expect(applyStyleAsset(figure,asset(),'subset',false).figure.edges).toEqual(figure.edges)
    const library=createStyleLibrary();library.save(style);expect(createStyleLibrary().assets.value[0]!.lineStyle).toEqual(style.lineStyle);expect(styleAssetSchema.parse(JSON.parse(JSON.stringify(style))).lineStyle).toEqual(style.lineStyle)
    for(const lineStyle of [{scope:'guessed',style:{strokeWidth:2}},{scope:'edges',style:{}},{scope:'edges',style:{arrowSize:0}},{scope:'edges',style:{strokeWidth:2,execute:'code'}}])expect(()=>styleAssetSchema.parse({...style,lineStyle})).toThrow();expect(figure).toEqual(before)
  })
  it('captures actual selected appearance and supported font without copying image pixels or graph objects',()=>{
    const figure=createExample();figure.nodes[0]!.textStyle={family:'MiSans',size:21};const captured=captureStyleAsset(figure)
    expect(captured).toMatchObject({format:'fastfigure.style',fontFamily:'MiSans',preset:figure.style.preset,paletteId:figure.style.paletteId,origin:{kind:'canvas'}});expect(captured).not.toHaveProperty('nodes');expect(captured).not.toHaveProperty('dataUrl')
    figure.style.colorIndex=7;figure.style.paletteId='figureforge-publication-soft';expect(captureStyleAsset(figure).colorIndex).toBe(1);expect(figure.style.colorIndex).toBe(7)
    const mapped={...captured,paletteId:'figureforge-publication-soft',colorMap:[{sourcePaletteId:'figureforge-publication-soft',sourceIndex:0,targetPaletteId:'figureforge-publication-soft',targetIndex:2,role:'Processing'}]},applied=applyStyleAsset(createExample(),mapped).figure
    expect(captureStyleAsset(applied).colorMap).toEqual(mapped.colorMap);expect(recordHarnessStyle(applied,mapped).styleUses!.at(-1)!.asset.colorMap).toEqual(mapped.colorMap);delete applied.style.colorMap;expect(()=>recordHarnessStyle(applied,mapped)).toThrow('不符')
    expect(()=>styleAssetSchema.parse({...captured,paletteId:'invented'})).toThrow();expect(()=>styleAssetSchema.parse({...captured,fontFamily:'Arial'})).toThrow();expect(()=>styleAssetSchema.parse({...captured,guide:'x'.repeat(1201)})).toThrow();expect(()=>styleAssetSchema.parse({...captured,execute:'code'})).toThrow()
  })
  it('applies family and base appearance atomically while preserving geometry, formats, scientific text and topology',()=>{
    const figure=createExample(),before=clone(figure);figure.nodes[0]!.textStyle={size:19,bold:true,italic:true,color:'#123456',align:'left'};before.nodes[0]=clone(figure.nodes[0]!)
    const style=asset(),result=applyStyleAsset(figure,style),first=result.figure.nodes[0]!
    expect(result.figure.style).toMatchObject({preset:'sketch',paletteId:'figureforge-publication-soft'});expect(first.textStyle).toMatchObject({...figure.nodes[0]!.textStyle,family:'MiSans'});expect(result.use.textNodes).toBe(5);expect(figure).toEqual(before)
    expect(result.figure.nodes.map(({textStyle:_,descriptionStyle:__,...node})=>node)).toEqual(figure.nodes.map(({textStyle:_,descriptionStyle:__,...node})=>node));expect(result.figure.edges).toEqual(figure.edges);expect(result.use.asset).toEqual(style)
    const scaled=createBlank();scaled.containers[0]!.metricScale=.5;scaled.nodes=[{id:'scaled-label',kind:'rectangle',label:'Smaller title',description:'Smaller note',parentId:'stage',x:100,y:200,width:100,height:60,metricScale:.5}];const snapshot=clone(scaled),themed=applyFigureTheme(scaled,'comic').figure
    expect(themed.containers[0]!.textStyle).toMatchObject({size:7.5,family:'Comic Sans MS'});expect(themed.nodes[0]!.textStyle).toMatchObject({size:8,family:'Comic Sans MS'});expect(themed.nodes[0]!.descriptionStyle).toMatchObject({size:5.5,family:'Comic Sans MS'});expect(scaled).toEqual(snapshot)
  })
  it('scopes style to a nested container and preserves overrides, chart statistics and positioned glyph formatting',()=>{
    const figure=createExample();figure.containers.push({id:'nested',parentId:'stage',role:'component',title:'Subset',x:150,y:180,width:600,height:270,appearance:{preset:'dashed',accent:'teal'}});figure.nodes[0]!.parentId='nested';figure.nodes[0]!.x=180;figure.nodes[0]!.y=240
    const scoped=applyStyleAsset(figure,asset(),'nested',false);expect(scoped.figure.style).toEqual(figure.style);expect(scoped.figure.containers[1]!.appearance).toMatchObject({preset:'sketch',paletteId:'figureforge-publication-soft',accent:'teal'});expect(scoped.figure.nodes).toEqual(figure.nodes)
    const chart=componentDocument(buildDataChart(chartExample('scatter'))),before=clone(chart),changed=applyStyleAsset(chart,{...asset(),lineStyle:{scope:'all-lines',style:{strokeWidth:3,arrow:'open'}}});expect(changed.figure.nodes).toEqual(before.nodes);expect(changed.figure.containers).toEqual(before.containers);expect(changed.use.textNodes).toBe(0);expect(changed.use.skippedTextNodes).toBeGreaterThan(0);expect(changed.use.lines!.total).toBe(0);expect(changed.use.lines!.skipped).toBeGreaterThan(0)
    const glyph=createBlank();glyph.nodes=[{id:'g',kind:'text',label:'Original',parentId:'stage',x:100,y:200,width:150,height:25,textLayout:{x:0,y:.8,matrix:[1,0,0,1]},textStyle:{family:'Inter',size:15}}];expect(applyStyleAsset(glyph,asset()).figure.nodes).toEqual(glyph.nodes);delete glyph.nodes[0]!.textStyle!.family;const frozen=applyFigureTheme(glyph,'comic').figure;expect(frozen.nodes[0]!.textStyle!.family).toBe('Inter');expect(frozen.nodes[0]!.textLayout).toEqual(glyph.nodes[0]!.textLayout)
  })
  it('preserves source snapshots through capture, scaling, insertion, SVG and model edits while rejecting forged provenance',()=>{
    const style={...asset(),lineStyle:{scope:'edges' as const,style:{strokeWidth:2,startArrow:'open' as const,arrowSize:10}}},result=applyStyleAsset(createExample(),style),captured=captureComponent(result.figure,'stage','Styled'),scaled=scaleComponent(captured,.4),inserted=instantiateComponentAt(createBlank(),scaled,'stage',{x:150,y:220},'styled')
    expect(scaled.figure.styleUses).toEqual(result.figure.styleUses);expect(inserted.document.styleUses).toEqual(result.figure.styleUses)
    const recovered=importSvg(exportSvg(result.figure),{fileName:'style.svg',sha256:'a'.repeat(64),parseXml:source=>new DOMParser().parseFromString(source,'image/svg+xml') as unknown as Document});expect(recovered.asset.figure.styleUses).toEqual(result.figure.styleUses)
    const parsed=parseHarnessResponse(JSON.stringify({message:'Keep sources',figure:{...result.figure,styleUses:[]}}),result.figure);expect(parsed.figure!.styleUses).toEqual(result.figure.styleUses)
    const removed=clone(result.figure);delete removed.styleUses;expect(diffFigures(result.figure,removed).changes[0]!.fields[0]!.name).toBe('图件风格来源')
  })
  it('renders hand-drawn outlines with a controllable pure, hatched or transparent background and retains explicit colors',()=>{
    const figure=createBlank();figure.style.preset='sketch';const before=clone(figure),root=figure.containers[0]!,paths=(source:string)=>{const xml=new DOMParser().parseFromString(source,'image/svg+xml'),group=[...Array.from(xml.getElementsByTagName('g'))].find(g=>g.getAttribute('data-container-id')==='stage')!;return Array.from(group.getElementsByTagName('path'))}
    const plain=exportSvg(figure);expect(paths(plain).some(path=>path.getAttribute('fill')==='#ffffff')).toBe(true);expect(exportSvg(figure)).toBe(plain)
    setContainerSurface(root,'hatch');const hatch=exportSvg(figure);expect(hatch).not.toBe(plain);expect(paths(hatch).every(path=>path.getAttribute('fill')==='none')).toBe(true)
    setContainerSurface(root,'transparent');expect(containerSurface(root)).toBe('transparent');expect(paths(exportSvg(figure)).every(path=>path.getAttribute('fill')==='none')).toBe(true)
    setContainerSurface(root,'plain');root.visual={...root.visual,fill:'#f0f9ff',stroke:'#123456',strokeWidth:2};const custom=paths(exportSvg(figure));expect(custom.some(path=>path.getAttribute('fill')==='#f0f9ff')).toBe(true);expect(custom.some(path=>path.getAttribute('stroke')==='#123456'&&path.getAttribute('stroke-width')==='2')).toBe(true);expect(figure.nodes).toEqual(before.nodes);expect(figure.edges).toEqual(before.edges)
    const style=captureStyleAsset(figure);expect(style.surface).toBe('plain');style.surface='hatch';expect(()=>recordHarnessStyle(figure,style)).toThrow('不符');expect(containerSurface(applyStyleAsset(figure,style).figure.containers[0]!)).toBe('hatch')
  })
  it('requires matching style in candidates, records typography as preferred and caps provenance without changing source inputs',()=>{
    const style=asset(),figure=createExample(),before=clone(figure);expect(()=>recordHarnessStyle(figure,style)).toThrow('不符');figure.style.preset=style.preset;figure.style.paletteId=style.paletteId
    const result=recordHarnessStyle(figure,style);expect(result.styleUses![0]).toMatchObject({asset:style,typography:'preferred',application:'harness',textNodes:0});expect(result.nodes).toEqual(before.nodes)
    const conflict=clone(figure);conflict.containers[0]!.appearance={preset:'precise',accent:'inherit'};expect(()=>recordHarnessStyle(conflict,style)).toThrow('不符');expect(()=>applyStyleAsset(conflict,style)).toThrow('根容器使用工程主题')
    const same=recordHarnessStyle(result,style);expect(same.styleUses).toHaveLength(1)
    for(let i=1;i<8;i++)result.styleUses!.push({...clone(result.styleUses![0]!),asset:{...style,id:`style-${i}`}})
    expect(()=>recordHarnessStyle(result,{...style,id:'ninth'})).toThrow('8 份');expect(()=>parseDocument({...figure,styleUses:Array(9).fill(result.styleUses![0])})).toThrow()
  })
  it('stores and searches independent files across projects, imports duplicates as copies and makes storage failure atomic',()=>{
    const library=createStyleLibrary(),style=asset();library.save(style);const restored=createStyleLibrary();expect(restored.assets.value).toEqual([style]);const copy=restored.importFile(JSON.stringify(style));expect(copy.id).not.toBe(style.id);expect(copy.name).toBe('Quiet research（副本 2）');restored.remove(copy.id);expect(restored.deleted.value?.id).toBe(copy.id);restored.restore();expect(restored.assets.value).toHaveLength(2)
    expect(()=>restored.importFile(JSON.stringify({...style,paletteId:'invented'}))).toThrow();expect(restored.assets.value).toHaveLength(2)
    vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{throw new Error('Quota')}});expect(()=>restored.remove(style.id)).toThrow('存储');expect(restored.assets.value).toHaveLength(2)
    storage.set(STYLE_LIBRARY_KEY,'not-json');vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)});expect(createStyleLibrary().error.value).toContain('原存储尚未覆盖');expect(storage.get(STYLE_LIBRARY_KEY)).toBe('not-json')
  })
  it.each(figureThemes)('applies $name with editable initial fonts and reproducible native shape outlines',theme=>{
    const original=createExample(),snapshot=clone(original),result=applyFigureTheme(original,theme.sketchStyle!),doc=result.figure
    expect(original).toEqual(snapshot);expect(doc.style).toMatchObject({preset:'sketch',sketchStyle:theme.sketchStyle,fontFamily:theme.fontFamily,roughness:theme.roughness,paletteId:theme.paletteId});expect(doc.edges).toEqual(original.edges)
    expect(doc.nodes.map(node=>node.textStyle?.family)).toEqual(original.nodes.map(()=>theme.fontFamily))
    expect(captureStyleAsset(doc)).toMatchObject({sketchStyle:theme.sketchStyle,roughness:theme.roughness,fontFamily:theme.fontFamily})
    const exported=exportSvg(doc);expect(exportSvg(doc)).toBe(exported)
    doc.nodes[0]!.textStyle={...doc.nodes[0]!.textStyle,family:'MiSans',italic:true};expect(parseDocument(doc).nodes[0]!.textStyle).toMatchObject({family:'MiSans',italic:true});expect(doc.style.fontFamily).toBe(theme.fontFamily)
    const chart=componentDocument(buildDataChart(chartExample('scatter'))),changed=applyFigureTheme(chart,theme.sketchStyle!);expect(changed.figure.nodes).toEqual(chart.nodes);expect(changed.figure.containers).toEqual(chart.containers)
    expect(exportDrawio(doc)).toContain(`jiggle=${theme.roughness};sketchStyle=${theme.sketchStyle==='comic'?'comic':'rough'};`)
    if(theme.sketchStyle==='comic')expect(exported).toContain('data-sketch-style="comic"')
  })
  it('draws visibly wandering Comic contours with leaning corners, anchored arrows and stable translation',()=>{
    const path='M0 0H180V80H0Z',ink=comicPath(path,'seed'),sample=parseSvgPath(ink,identity)
    expect(ink).toBe(comicPath(path,'seed'));expect(ink).not.toBe(comicPath(path,'different'));expect(comicPath(path,'seed',0)).toBe(path);expect(ink.match(/M/g)).toHaveLength(1);expect(ink.endsWith('Z')).toBe(true)
    expect(sample[0]).not.toMatchObject({x:0,y:0});expect(sample.at(-1)).toMatchObject({...sample[0],close:true})
    const top=sample.filter(p=>p.x>10&&p.x<170&&p.y<10).map(p=>p.y)
    expect(Math.min(...top)).toBeLessThan(-2);expect(Math.max(...top)).toBeGreaterThan(2)
    for(const p of sample){expect(p.x).toBeGreaterThanOrEqual(-9);expect(p.x).toBeLessThanOrEqual(189);expect(p.y).toBeGreaterThanOrEqual(-9);expect(p.y).toBeLessThanOrEqual(89)}
    const moved=parseSvgPath(comicPath('M20 30H200V110H20Z','seed'),identity)
    expect(moved.map(p=>({x:Number((p.x-20).toFixed(3)),y:Number((p.y-30).toFixed(3))}))).toEqual(sample.map(p=>({x:p.x,y:p.y})))
    const arrow=parseSvgPath(comicPath('M0 0H180V80','arrow'),identity)
    expect(arrow[0]).toMatchObject({x:0,y:0});expect(arrow.at(-1)).toMatchObject({x:180,y:80});expect(arrow.some(p=>p.x===180&&p.y===0)).toBe(true)
    const tiny=parseSvgPath(comicPath('M0 0H12V8H0Z','tiny',4),identity)
    expect(tiny.every(p=>p.x>=-2&&p.x<=14&&p.y>=-2&&p.y<=10)).toBe(true)
    const subpaths=comicPath('M0 0H40V20H0ZM60 0Q80 30 100 0','subpaths')
    expect(subpaths.match(/M/g)).toHaveLength(2);expect(subpaths.match(/Z/g)).toHaveLength(1);expect(parseSvgPath(subpaths,identity).at(-1)).toMatchObject({x:100,y:0})
    const doc=createBlank();doc.nodes=['rectangle','ellipse','diamond'].map((kind,index)=>({id:'p'+index,parentId:'stage',kind:kind as 'rectangle'|'ellipse'|'diamond',label:'Shape',x:100+index*180,y:200,width:100,height:80}))
    const rendered=new DOMParser().parseFromString(exportSvg(applyFigureTheme(doc,'comic').figure),'image/svg+xml')
    for(const group of Array.from(rendered.getElementsByTagName('g')).filter(g=>g.hasAttribute('data-object-id'))){expect(group.getElementsByTagName('rect').length).toBe(1);expect(Array.from(group.getElementsByTagName('path')).filter(p=>p.getAttribute('data-sketch-style')==='comic')).toHaveLength(1)}
    expect(fontStack('Comic Sans MS')).toContain('"Comic Sans MS", "Comic Neue"')
  })
  it('binds a style to plans before adoption and rejects conflicting style or unrelated task modes',()=>{
    const style=asset(),plan={status:'ready',title:'Method plan',goal:'Explain stages',readingOrder:'left-to-right',layout:'Two native processing stages and an outside note',style:{preset:style.preset,paletteId:style.paletteId,fontFamily:style.fontFamily,roughness:style.roughness,sketchStyle:style.sketchStyle,usage:style.guide},sections:[{id:'main',title:'Processing',purpose:'Explain',visual:'Native operations',design:{role:'mechanism',structure:'pipeline',rationale:'Explain native processing stages.',emphasis:'primary',frame:{id:'main-region',x:0,y:0,width:1,height:1}},components:[],referenceImages:[],annotations:[]}],connections:[],checks:['Check meanings'],questions:[],uncertainties:[]},record=parseCompositionPlanResponse(JSON.stringify({message:'Review',plan}),crypto.randomUUID(),'Goal',[],[],style).compositionRecord
    expect(record.styleReference).toEqual(style);expect(styleFromComposition(record)).toMatchObject({preset:style.preset,paletteId:style.paletteId,fontFamily:style.fontFamily,guide:style.guide,origin:{kind:'plan',runId:record.runId}})
    expect(()=>parseCompositionPlanResponse(JSON.stringify({message:'Wrong',plan:{...plan,style:{...plan.style,fontFamily:'Inter'}}}),crypto.randomUUID(),'Goal',[],[],style)).toThrow('不符')
    const input={sessionId:crypto.randomUUID(),content:'Draw',figure:createExample(),catalogue:[],selectedIds:[],styleReference:style};expect(harnessRunInputSchema.safeParse(input).success).toBe(true);expect(harnessPrompt(input)).toContain(JSON.stringify(style))
    const chartData=parseChartDataset('X,Y\n1,2\n3,4',{name:'Raw',origin:'user',errorLabel:'',note:'',dataSource:''});expect(harnessRunInputSchema.safeParse({...input,chartData}).success).toBe(false);expect(harnessRunInputSchema.safeParse({...input,compositionPlanRunId:crypto.randomUUID()}).success).toBe(false)
  })
})
