import {figureThemes,applyFigureTheme,paperTheme,paperThemes} from './figureThemes'
import {paperExample,paperPrimitives,paperRobot} from '../data/paperExamples'
import {paperThemeDefaults,paperThemeTokensSchema} from './paperThemeTokens'
import {scaleSubtree} from './scaling'
import {paperColors} from './paperStyle'
import {nodeTextStyle,canvasNodeTextStyle,canvasContainerTextStyle} from './typography'
import {measureTextEvidence} from './textGeometry'
import {bounds,contentBounds} from './geometry'
import {colorSlotInventory,setContainerColorMap} from './colorMapping'
import {checkPublication} from './publication'
import {defaultPublicationSettings} from './publicationContract'
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
  it.each(paperThemes)('renders $name with saved size hierarchy, inherited stage identity and round-trip geometry',theme=>{
    const doc=createBlank();doc.containers[0]!.title='Planning scope';doc.containers[0]!.visual={role:'planning'}
    doc.nodes=[{id:'heading',kind:'rectangle',parentId:'stage',label:'Perception',description:'Source features',textRole:'heading',x:100,y:200,width:220,height:90,visual:{role:'perception'}},{id:'manual',kind:'text',parentId:'stage',label:'Author size',x:350,y:200,width:200,height:60,textStyle:{size:22}}]
    const source=clone(doc),applied=applyStyleAsset(doc,theme).figure,tokens=theme.paperTheme!,xml=new DOMParser().parseFromString(exportSvg(applied),'image/svg+xml'),group=Array.from(xml.getElementsByTagName('g')).find(g=>g.getAttribute('data-object-id')==='heading')!,label=Array.from(group.getElementsByTagName('text')).find(t=>t.getAttribute('data-edit-field')==='label')!
    expect(Number(label.getAttribute('font-size'))).toBe(tokens.headingSize);expect(label.getAttribute('font-family')).toContain(tokens.variant==='warm'?'Noto Serif SC':tokens.variant==='handdrawn'?'Comic Neue':'MiSans')
    expect(group.getElementsByTagName('text').item(1)!.getAttribute('font-size')).toBe(String(tokens.captionSize));expect(applied.nodes[1]!.textStyle!.size).toBe(22)
    expect(exportSvg(applied).includes('data-title-tab=')).toBe(tokens.titleStyle==='tab');expect(group.getElementsByTagName('path').length>0).toBe(tokens.outline==='gentle')
    const recovered=importSvg(exportSvg(applied),{fileName:'theme.svg',sha256:'a'.repeat(64),parseXml:source=>new DOMParser().parseFromString(source,'image/svg+xml') as unknown as Document}).asset.figure
    expect(recovered.style.paperTheme).toEqual(tokens);expect(captureStyleAsset(applied).paperTheme).toEqual(tokens)
    const half=scaleSubtree(applied,'stage',.5).document;expect(half.nodes[0]!.textStyle!.size).toBe(tokens.headingSize*.5);expect(half.nodes[0]!.descriptionStyle!.size).toBe(tokens.captionSize*.5);expect(half.containers[0]!.textStyle!.size).toBe(tokens.containerHeadingSize*.5)
    const asset=captureComponent(applied,'stage','Themed mechanism'),placed=instantiateComponentAt(createBlank(),scaleComponent(asset,.4),'stage',{x:100,y:200},'instance',true).document
    expect(placed.containers.find(c=>c.id==='instance')!.appearance!.paperTheme).toEqual(tokens);expect(recordHarnessStyle(applied,theme).styleUses!.at(-1)!.asset.paperTheme).toEqual(tokens)
    const inherited=clone(doc);inherited.nodes[0]!.metricScale=.5;inherited.nodes[0]!.width=110;inherited.nodes[0]!.height=45;inherited.nodes[0]!.textStyle={family:'MiSans'};inherited.containers[0]!.metricScale=.5
    const small=applyStyleAsset(inherited,theme).figure,smallXml=new DOMParser().parseFromString(exportSvg(small),'image/svg+xml'),smallGroup=Array.from(smallXml.getElementsByTagName('g')).find(g=>g.getAttribute('data-object-id')==='heading')!,smallLabel=Array.from(smallGroup.getElementsByTagName('text')).find(t=>t.getAttribute('data-edit-field')==='label')!
    expect(smallLabel.getAttribute('font-size')).toBe(String(tokens.headingSize));expect(smallGroup.getElementsByTagName('g')[0]!.getAttribute('data-metric-scale')).toBe('0.5')
    const contradictory=clone(applied);contradictory.style.paperTheme!.headingSize+=1;expect(()=>recordHarnessStyle(contradictory,theme)).toThrow('主题尺寸');expect(doc).toEqual(source)
  })
  it('rejects unsafe theme sizes and preserves inherited metrics across repeated scaling',()=>{
    for(const patch of [{headingSize:13},{captionSize:25},{bodySize:19},{padding:30},{strokeWidth:0},{extra:'untrusted'}])expect(()=>paperThemeTokensSchema.parse({...paperThemeDefaults.soft,...patch})).toThrow()
    const doc=createBlank();doc.nodes=[{id:'label',kind:'text',parentId:'stage',label:'Scaled inherited text',x:150,y:220,width:300,height:80,metricScale:.5,textStyle:{family:'MiSans'}}]
    Object.assign(doc.containers[0]!,{x:40,y:90,width:450,height:230});const enlarged=scaleSubtree(doc,'stage',2,'top-left');expect(enlarged.document.nodes[0]!.textStyle!.size).toBe(paperThemeDefaults.soft.bodySize)
  })
  it('preserves label, caption and container font sizes when theme typography is disabled',()=>{
    const doc=createBlank();doc.containers[0]!.metricScale=.5;doc.nodes=[{id:'heading',kind:'module',parentId:'stage',label:'Heading',description:'Caption',x:100,y:200,width:180,height:80,metricScale:.5}]
    const result=applyStyleAsset(doc,paperThemes[2]!,'stage',false).figure
    for(const description of [false,true]){
      const before=canvasNodeTextStyle(doc.nodes[0]!,description,doc.style),after=canvasNodeTextStyle(result.nodes[0]!,description,result.style)
      expect({family:after.family,size:after.size}).toEqual({family:before.family,size:before.size})
    }
    const before=canvasContainerTextStyle(doc.containers[0]!,doc.style),after=canvasContainerTextStyle(result.containers[0]!,result.style)
    expect({family:after.family,size:after.size}).toEqual({family:before.family,size:before.size})
  })
  it('centers default paper text and icon-label groups and aligns the complete default diagram around shared axes',()=>{
    const doc=createBlank();doc.containers[0]!.title='Aligned scope'
    doc.nodes=[{id:'card',kind:'rectangle',parentId:'stage',label:'Query',iconId:'paper:chat',x:100,y:200,width:220,height:70},{id:'caption',kind:'text',parentId:'stage',label:'Centered caption',x:350,y:200,width:220,height:40},{id:'manual',kind:'text',parentId:'stage',label:'Manual',x:600,y:200,width:220,height:40,textStyle:{align:'left'}}]
    const before=clone(doc),xml=new DOMParser().parseFromString(exportSvg(doc),'image/svg+xml'),groups=Array.from(xml.getElementsByTagName('g')),card=groups.find(g=>g.getAttribute('data-object-id')==='card')!,label=card.getElementsByTagName('text')[0]!,icon=Array.from(card.getElementsByTagName('g')).find(g=>g.getAttribute('data-icon-id')==='paper:chat')!,transform=icon.getAttribute('transform')!.match(/translate\(([^ ]+) ([^)]+)\) scale\(([^)]+)\)/)!
    const iconX=Number(transform[1]),iconY=Number(transform[2]),iconSize=24*Number(transform[3]),labelRight=Number(label.getAttribute('x'))+measureTextEvidence('Query',nodeTextStyle(doc.nodes[0]!,false,doc.style)).width/2
    expect((iconX+labelRight)/2).toBeCloseTo(210);expect(iconY+iconSize/2).toBeCloseTo(235);expect(label.getAttribute('text-anchor')).toBe('middle')
    expect(groups.find(g=>g.getAttribute('data-object-id')==='caption')!.getElementsByTagName('text')[0]!.getAttribute('x')).toBe('460');expect(groups.find(g=>g.getAttribute('data-object-id')==='manual')!.getElementsByTagName('text')[0]!.getAttribute('text-anchor')).toBe('start')
    expect(groups.find(g=>g.getAttribute('data-container-id')==='stage')!.getElementsByTagName('text')[0]!.getAttribute('x')).toBe('500');expect(nodeTextStyle(doc.nodes[1]!,false,{...doc.style,designSystem:'legacy'}).align).toBe('left');expect(doc).toEqual(before)
    const example=createExample(),byId=(id:string)=>example.nodes.find(n=>n.id===id)!,axis=byId('encoder').y+byId('encoder').height/2
    for(const id of ['input','fusion'])expect(byId(id).y+byId(id).height/2).toBe(axis)
    expect(byId('retriever').x+byId('retriever').width/2).toBe(byId('context').x+byId('context').width/2)
    const columns=['input','encoder','retriever','fusion'].map(byId),gaps=columns.slice(1).map((n,i)=>n.x-columns[i]!.x-columns[i]!.width);expect(new Set(gaps).size).toBe(1)
    const box=bounds(example.nodes),area=contentBounds(example.containers[0]!);expect(box.x+box.width/2).toBe(area.x+area.width/2);expect(box.y+box.height/2).toBe(area.y+area.height/2)
  })
  it('resolves paper typography, palette roles and exact geometry while keeping explicit author overrides',()=>{
    const doc=createBlank();doc.nodes=[{id:'core',kind:'rectangle',parentId:'stage',label:'Core',x:100,y:200,width:180,height:70,visual:{role:'primary'},textRole:'heading'},{id:'body',kind:'text',parentId:'stage',label:'Readable body',x:320,y:200,width:180,height:40,textRole:'body'},{id:'custom',kind:'rectangle',parentId:'stage',label:'Manual',x:550,y:200,width:180,height:70,visual:{role:'memory',fill:'#123456',stroke:'#654321',radius:4},textStyle:{family:'MiSans',color:'#ffffff'}}]
    const before=clone(doc),xml=new DOMParser().parseFromString(exportSvg(doc),'image/svg+xml'),groups=Array.from(xml.getElementsByTagName('g')),core=groups.find(g=>g.getAttribute('data-object-id')==='core')!,custom=groups.find(g=>g.getAttribute('data-object-id')==='custom')!
    expect(core.getElementsByTagName('rect')[0]!.getAttribute('fill')).toBe(paperColors.primary);expect(core.getElementsByTagName('rect')[0]!.getAttribute('stroke')).toBe(doc.style.paperTheme!.ink);expect(core.getElementsByTagName('text')[0]!.getAttribute('font-family')).toContain('MiSans');expect(exportSvg(doc)).toContain('MiSans');expect(custom.getElementsByTagName('rect')[0]!.getAttribute('rx')).toBe('4');expect(custom.getElementsByTagName('rect')[0]!.getAttribute('fill')).toBe('#123456');expect(doc).toEqual(before)
    expect(colorSlotInventory(doc).some(slot=>slot.sourcePaletteId==='paper-reference'&&slot.sourceIndex===1)).toBe(true)
    setContainerColorMap(doc,'stage',[{sourcePaletteId:'paper-reference',sourceIndex:1,targetPaletteId:'paper-reference',targetIndex:2,role:'Core'}]);const mapped=new DOMParser().parseFromString(exportSvg(doc),'image/svg+xml');expect(Array.from(mapped.getElementsByTagName('g')).find(g=>g.getAttribute('data-object-id')==='core')!.getElementsByTagName('rect')[0]!.getAttribute('fill')).toBe(paperColors.memory)
    const applied=applyStyleAsset(before,{...paperTheme,fontRoles:{heading:'MiSans',body:'Patrick Hand'}}).figure;expect(applied.nodes[0]!.textStyle?.family).toBe('MiSans');expect(applied.nodes[1]!.textStyle?.family).toBe('Patrick Hand');expect(captureStyleAsset(applied).fontRoles).toEqual({heading:'MiSans',body:'Patrick Hand'});expect(applyStyleAsset(before,paperTheme,'stage',false).figure.nodes[0]!.textStyle?.family).toBeUndefined()
  })
  it('keeps native rich text and publication frames through scaling and rejects conflicting text or unsafe frames',()=>{
    const doc=createBlank();doc.canvas.frame={x:80,y:180,width:320,height:220};doc.nodes=[{id:'formula',kind:'text',parentId:'stage',label:'ℝL×d → ℝK×d',x:100,y:200,width:220,height:48,textRole:'math',textStyle:{size:20},textRuns:[{text:'ℝ'},{text:'L×d',script:'super',italic:true},{text:' → ℝ'},{text:'K×d',script:'super',color:'#4477cc'}]}];doc.publication={...defaultPublicationSettings,widthMm:160}
    const source=clone(doc),xml=new DOMParser().parseFromString(exportSvg(doc),'image/svg+xml'),texts=Array.from(xml.getElementsByTagName('text'));expect(xml.documentElement!.getAttribute('viewBox')).toBe('80 180 320 220');expect(xml.documentElement!.getAttribute('width')).toBe('160mm');expect(xml.documentElement!.getAttribute('height')).toBe('110mm');expect(texts.map(t=>t.textContent).join('')).toBe(doc.nodes[0]!.label);expect(texts[1]!.getAttribute('font-size')).toBe('14');expect(Number(texts[1]!.getAttribute('y'))).toBeLessThan(Number(texts[0]!.getAttribute('y')));expect(texts.find(t=>t.textContent==='K×d')!.getAttribute('fill')).toBe('#4477cc');expect(checkPublication(doc,doc.publication).pointsPerUnit).toBeCloseTo(160/320*72/25.4);expect(doc).toEqual(source)
    const captured=captureComponent(doc,'stage','Formula'),scaled=scaleComponent(captured,.5);expect(scaled.figure.nodes[0]!.textRuns).toEqual(doc.nodes[0]!.textRuns);expect(scaled.figure.nodes[0]!.textStyle!.size).toBe(10)
    const conflict=clone(doc);conflict.nodes[0]!.label='Changed';expect(()=>parseDocument(conflict)).toThrow('片段');expect(()=>parseDocument({...doc,canvas:{...doc.canvas,frame:{x:900,y:0,width:200,height:300}}})).toThrow('出图区域')
  })
  it('preserves actual illustration bytes and provenance through native reuse while keeping pixels out of model prompts',()=>{
    const robot=paperRobot(),doc=componentDocument(robot),before=clone(doc),image=doc.nodes.find(n=>n.kind==='image')!,svg=exportSvg(doc);expect(svg).toContain('<image');expect(svg).toContain(image.image!.dataUrl);expect(image.image!.source?.provider).toBe('imagegen');
    const snapshot=captureComponent(doc,'stage','Robot'),scaled=scaleComponent(snapshot,.5);expect(scaled.figure.nodes[0]!.image).toEqual(image.image);expect(snapshot.sources[0]!.image!.sha256).toBe(image.image!.source!.sha256)
    const candidate=clone(doc);delete candidate.nodes[0]!.image;const restored=parseHarnessResponse(JSON.stringify({message:'Move existing illustration',figure:candidate}),doc);expect(restored.figure!.nodes[0]!.image).toEqual(image.image)
    const forged=clone(doc);forged.nodes[0]!.image!.sha256='0'.repeat(64);expect(()=>parseHarnessResponse(JSON.stringify({message:'Replace bytes',figure:forged}),doc)).toThrow('图片由程序管理')
    const prompt=harnessPrompt({sessionId:crypto.randomUUID(),content:'Move the illustration',figure:doc,selectedIds:[],catalogue:[]});expect(prompt).toContain(image.image!.sha256);expect(prompt).not.toContain(image.image!.dataUrl);expect(doc).toEqual(before)
    expect(()=>parseDocument({...doc,nodes:[{...image,image:{...image.image!,dataUrl:'https://example.com/image.png'}}]})).toThrow()
  })
  it('makes both editable reference specimens and neutral diagram blocks reusable without flattening their content',()=>{
    for(const id of ['memory-comparison','internalizer-mechanism'] as const){const asset=paperExample(id),source=clone(asset),scaled=scaleComponent(asset,.7),standalone=componentDocument(scaled);expect(standalone.canvas.frame?.width).toBeCloseTo(asset.figure.containers[0]!.width*.7);expect(standalone.nodes.map(n=>n.kind)).toEqual(asset.figure.nodes.map(n=>n.kind));expect(asset).toEqual(source);if(id==='internalizer-mechanism'){const target=scaled.figure.nodes.find(n=>n.id==='target-1')!;expect(target.visual!.radius).toBeCloseTo(14*.7);expect(target.visual!.strokeWidth).toBeCloseTo(1.8*.7)}expect(()=>parseDocument(standalone)).not.toThrow()}
    const compact=paperExample('memory-comparison');expect(compact.figure.nodes.find(n=>n.id==='agent-before')!.image!.source?.provider).toBe('imagegen')
    const detailed=paperExample('internalizer-mechanism');expect(detailed.figure.nodes.find(n=>n.id==='observe-body')!.textRuns!.some(r=>r.color==='#477cff')).toBe(true);expect(detailed.figure.nodes.find(n=>n.id==='updated-formula')!.textRuns!.some(r=>r.script==='super')).toBe(true)
    for(const asset of paperPrimitives())expect(()=>parseDocument(componentDocument(asset))).not.toThrow()
  })
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
    expect(captured).toMatchObject({format:'fastfigure.style',fontFamily:figure.style.fontFamily,preset:figure.style.preset,paletteId:figure.style.paletteId,origin:{kind:'canvas'}});expect(captured).not.toHaveProperty('nodes');expect(captured).not.toHaveProperty('dataUrl')
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
    expect(themed.containers[0]!.textStyle).toMatchObject({size:10,family:'Comic Sans MS'});expect(themed.nodes[0]!.textStyle).toMatchObject({size:8,family:'Comic Sans MS'});expect(themed.nodes[0]!.descriptionStyle).toMatchObject({size:6,family:'Comic Sans MS'});expect(scaled).toEqual(snapshot)
  })
  it('scopes style to a nested container and preserves overrides, chart statistics and positioned glyph formatting',()=>{
    const figure=createExample();figure.containers.push({id:'nested',parentId:'stage',role:'component',title:'Subset',x:150,y:180,width:600,height:270,appearance:{preset:'dashed',accent:'teal'}});figure.nodes[0]!.parentId='nested';figure.nodes[0]!.x=180;figure.nodes[0]!.y=240
    const scoped=applyStyleAsset(figure,asset(),'nested',false);expect(scoped.figure.style).toEqual(figure.style);expect(scoped.figure.containers[1]!.appearance).toMatchObject({preset:'sketch',paletteId:'figureforge-publication-soft',accent:'teal'});expect(scoped.figure.nodes).toEqual(figure.nodes)
    const chart=componentDocument(buildDataChart(chartExample('scatter'))),before=clone(chart),changed=applyStyleAsset(chart,{...asset(),lineStyle:{scope:'all-lines',style:{strokeWidth:3,arrow:'open'}}});expect(changed.figure.nodes).toEqual(before.nodes);expect(changed.figure.containers).toEqual(before.containers);expect(changed.use.textNodes).toBe(0);expect(changed.use.skippedTextNodes).toBeGreaterThan(0);expect(changed.use.lines!.total).toBe(0);expect(changed.use.lines!.skipped).toBeGreaterThan(0)
    const glyph=createBlank();glyph.nodes=[{id:'g',kind:'text',label:'Original',parentId:'stage',x:100,y:200,width:150,height:25,textLayout:{x:0,y:.8,matrix:[1,0,0,1]},textStyle:{family:'MiSans',size:15}}];expect(applyStyleAsset(glyph,asset()).figure.nodes).toEqual(glyph.nodes);delete glyph.nodes[0]!.textStyle!.family;const frozen=applyFigureTheme(glyph,'comic').figure;expect(frozen.nodes[0]!.textStyle!.family).toBe(glyph.style.fontFamily);expect(frozen.nodes[0]!.textLayout).toEqual(glyph.nodes[0]!.textLayout)
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
    const ninth=recordHarnessStyle(result,{...style,id:'ninth'});expect(ninth.styleUses).toHaveLength(8);expect(ninth.styleUses![0]!.asset.id).toBe('style-1');expect(ninth.styleUses!.at(-1)!.asset.id).toBe('ninth');expect(result.styleUses).toHaveLength(8);expect(()=>parseDocument({...figure,styleUses:Array(9).fill(result.styleUses![0])})).toThrow()
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

    if(theme.sketchStyle==='comic')expect(exported).toContain('data-sketch-style="comic"')
  })
  it('draws gentle Comic contours with bounded drift, anchored arrows and stable translation',()=>{
    const path='M0 0H180V80H0Z',ink=comicPath(path,'seed'),sample=parseSvgPath(ink,identity)
    expect(ink).toBe(comicPath(path,'seed'));expect(ink).not.toBe(comicPath(path,'different'));expect(comicPath(path,'seed',0)).toBe(path);expect(ink.match(/M/g)).toHaveLength(1);expect(ink.endsWith('Z')).toBe(true)
    expect(sample[0]).not.toMatchObject({x:0,y:0});expect(sample.at(-1)).toMatchObject({...sample[0],close:true})
    const top=sample.filter(p=>p.x>10&&p.x<170&&p.y<10).map(p=>p.y)
    expect(Math.min(...top)).toBeLessThan(-.3);expect(Math.max(...top)).toBeGreaterThan(.3);expect(Math.max(...top.map(Math.abs))).toBeLessThan(2)
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
    for(const group of Array.from(rendered.getElementsByTagName('g')).filter(g=>g.hasAttribute('data-object-id'))){expect(group.getElementsByTagName('rect').length).toBe(0);expect(Array.from(group.getElementsByTagName('path')).filter(p=>p.getAttribute('data-sketch-style')==='comic')).toHaveLength(1)}
    expect(fontStack('Comic Sans MS')).toContain('"Comic Sans MS", "Comic Neue"')
  })
  it('binds a style to plans before adoption and rejects conflicting style or unrelated task modes',()=>{
    const style=asset(),plan={status:'ready',title:'Method plan',goal:'Explain stages',readingOrder:'left-to-right',layout:'Two native processing stages and an outside note',style:{designSystem:style.designSystem,paperTheme:style.paperTheme,fontRoles:style.fontRoles,preset:style.preset,paletteId:style.paletteId,fontFamily:style.fontFamily,roughness:style.roughness,sketchStyle:style.sketchStyle,usage:style.guide},sections:[{id:'main',title:'Processing',purpose:'Explain',visual:'Native operations',design:{role:'mechanism',structure:'pipeline',rationale:'Explain native processing stages.',emphasis:'primary',frame:{id:'main-region',x:0,y:0,width:1,height:1}},components:[],referenceImages:[],annotations:[]}],connections:[],checks:['Check meanings'],questions:[],uncertainties:[]},record=parseCompositionPlanResponse(JSON.stringify({message:'Review',plan}),crypto.randomUUID(),'Goal',[],[],style).compositionRecord
    expect(record.styleReference).toEqual(style);expect(styleFromComposition(record)).toMatchObject({preset:style.preset,paletteId:style.paletteId,fontFamily:style.fontFamily,guide:style.guide,origin:{kind:'plan',runId:record.runId}})
    expect(()=>parseCompositionPlanResponse(JSON.stringify({message:'Wrong',plan:{...plan,style:{...plan.style,fontFamily:'JetBrains Mono'}}}),crypto.randomUUID(),'Goal',[],[],style)).toThrow('不符')
    const input={sessionId:crypto.randomUUID(),content:'Draw',figure:createExample(),catalogue:[],selectedIds:[],styleReference:style};expect(harnessRunInputSchema.safeParse(input).success).toBe(true);expect(harnessPrompt(input)).toContain(JSON.stringify(style))
    const chartData=parseChartDataset('X,Y\n1,2\n3,4',{name:'Raw',origin:'user',errorLabel:'',note:'',dataSource:''});expect(harnessRunInputSchema.safeParse({...input,chartData}).success).toBe(false);expect(harnessRunInputSchema.safeParse({...input,compositionPlanRunId:crypto.randomUUID()}).success).toBe(false)
  })
})
