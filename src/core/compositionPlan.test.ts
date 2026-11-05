import {describe,expect,it} from 'vitest'
import {DOMParser} from '@xmldom/xmldom'
import {buildRecipe} from '../data/recipes'
import {clone,createBlank,parseDocument} from './model'
import {compositionPlanSchema,type CompositionPlan} from './compositionPlanContract'
import {applyCompositionRecord,compositionPlanPrompt,compositionBaseKey,compositionSnapshotKey,parseCompositionPlanResponse,mergeCompositionRecords,validateCompositionCandidate} from './compositionPlan'
import {componentInstanceSchema,composeCatalogue,type CatalogueEntry} from './catalogue'
import {captureComponent,componentDocument,scaleComponent} from './assets'
import {exportSvg} from './svg'
import {importSvg} from './svgImport'
import {diffFigures} from './figureDiff'
import {harnessRunInputSchema,parseHarnessResponse} from './harness'
import type {ReferenceInputInfo} from './referenceInputs'
import {setContainerColor} from './containerColor'
import {figurePaint} from './paint'
import {resolveStyle} from './geometry'
import {exportDrawio} from './export'
import {buildDataChart} from './dataChart'
import {chartExample} from './dataChartTable'
import {colorSlotInventory,setContainerColorMap} from './colorMapping'
import {colorMapSchema,type ColorMapping} from './colorMappingContract'
import {instantiateComponentAt} from './assets'
const runId='7c9bfbd2-661b-4982-9589-9b9973efea78'
const plan=():CompositionPlan=>({status:'ready',title:'Pipeline plan',goal:'Explain the feature pipeline',readingOrder:'left-to-right',layout:'Place the native pipeline on the left with a short explanatory annotation on the right.',style:{preset:'precise',paletteId:'figureforge-publication-soft',fontFamily:'Inter',usage:'Blue for processing; muted notes.'},sections:[{id:'process',title:'Processing',purpose:'Two operations',visual:'Use two native stages with a directed connection.',components:[{id:'pipe',key:'asset:builtin-pipeline'}],referenceImages:[1],annotations:['Features flow through both stages']},{id:'note',title:'Summary',purpose:'Explain output',visual:'Use a short caption beside the last stage.',components:[],referenceImages:[],annotations:[]}],connections:[{from:'process',to:'note',meaning:'Explain the resulting features'}],checks:['Preserve the two-stage relation'],questions:[],uncertainties:['Reference style is a model interpretation.']})
const entries=():CatalogueEntry[]=>[{kind:'asset',asset:buildRecipe('pipeline',{stages:2,direction:'row'})}]
const references:ReferenceInputInfo[]=[{index:1,id:'r1',title:'Style source',purpose:'style',citation:'Authored fixture',fileName:'a.png',sha256:'a'.repeat(64),width:100,height:50},{index:2,id:'r2',title:'Unused layout',purpose:'layout',citation:'Authored fixture',fileName:'b.png',sha256:'b'.repeat(64),width:100,height:50}]
const notes=()=>[{image:1,decision:'use',observation:'Muted colors',application:'Processing section',uncertainty:''},{image:2,decision:'omit',observation:'Unrelated composition',application:'No matching role',uncertainty:''}]
const response=(p=plan())=>({message:'Review this plan',plan:p,referenceNotes:notes()})
const parse=(value:unknown,catalogue=entries())=>parseCompositionPlanResponse(JSON.stringify(value),runId,'User pipeline goal',catalogue,references,undefined,{layoutPolicy:'legacy'})
describe('reviewable composition planning',()=>{
  it('requires a visible one-way dashed parameter transfer between declared phases instead of a data arrow or bidirectional tie',()=>{
    const asset=buildRecipe('distillation-stages',{hardTargets:'show'}),doc=clone(asset.figure),p=plan();p.style.paletteId=doc.style.paletteId!;p.style.preset=doc.style.preset;p.style.surface='transparent';p.readingOrder='left-to-right';p.sections=[]
    for(const [id,role,emphasis]of [['distill-train','mechanism','primary'],['distill-infer','context','supporting']] as const){const frame=doc.containers.find(c=>c.id===id)!;p.sections.push({id,title:id,purpose:'Separate training and deployment.',visual:'Native phase contents',design:{role,emphasis,structure:id==='distill-train'?'network':'pipeline',rationale:'Use a training fork and a student-only deployment chain.',frame:{id,x:(frame.x-2)/976,y:(frame.y-2)/596,width:frame.width/976,height:frame.height/596}},components:[],referenceImages:[],annotations:[]})}
    p.connections=[{from:'distill-train',to:'distill-infer',kind:'parameter-transfer',meaning:'Transfer the trained student checkpoint.'}];const record=parseCompositionPlanResponse(JSON.stringify({message:'Staged plan',plan:p}),runId,'Train then deploy',[],[]).compositionRecord
    expect(()=>validateCompositionCandidate(record,doc,[])).not.toThrow()
    for(const change of ['solid','reversed','both','hidden']){const bad=clone(doc),line=bad.nodes.find(n=>n.id==='student-checkpoint')!;if(change==='solid')line.visual!.dash=[];if(change==='reversed'){const start=line.path!.start;line.path!.start=line.path!.end;line.path!.end=start}if(change==='both')line.path!.startArrow='filled';if(change==='hidden')line.visual!.stroke='none';expect(()=>validateCompositionCandidate(record,bad,[])).toThrow('单向虚线')}
  })
  it('requires concrete designs for new ready responses while retaining stored legacy records and unresolved questions',()=>{
    const value=response();expect(()=>parseCompositionPlanResponse(JSON.stringify(value),runId,'Goal',entries(),references)).toThrow('每个分区')
    const legacy=parse(value).compositionRecord,doc=createBlank();doc.compositionPlans=[legacy];expect(()=>parseDocument(doc)).not.toThrow()
    const pending=plan();pending.status='needs-input';pending.questions=['What does the output represent?'];expect(parseCompositionPlanResponse(JSON.stringify(response(pending)),runId,'Goal',entries(),references).compositionRecord.plan.status).toBe('needs-input')
    const modern=plan();modern.connections[0]!.kind='comparison';modern.sections.forEach((section,i)=>section.design={role:i?'detail':'mechanism',structure:i?'comparison':'pipeline',rationale:'Each structure supports a declared explanatory role.',emphasis:i?'supporting':'primary',frame:{id:`region-${i}`,x:i*.55,y:0,width:.45,height:1}})
    expect(parseCompositionPlanResponse(JSON.stringify(response(modern)),runId,'Goal',entries(),references).compositionRecord.plan.sections.every(section=>section.design)).toBe(true)
  })
  it('plans a mixed-structure main figure and rejects misplaced parts, missing directional links and fake detail arrows',()=>{
    const catalogue:CatalogueEntry[]=[{kind:'recipe',id:'layered-architecture'},{kind:'recipe',id:'feature-pyramid'},{kind:'recipe',id:'structure-matrix'}],p=plan();p.sections=[];p.connections=[]
    const specs=[{id:'overview',key:'recipe:layered-architecture',structure:'layered' as const,x:0,y:0,width:.3,height:1},{id:'mechanism',key:'recipe:feature-pyramid',structure:'encoder-decoder' as const,x:.33,y:0,width:.67,height:.6},{id:'detail',key:'recipe:structure-matrix',structure:'matrix' as const,x:.33,y:.66,width:.67,height:.34}]
    p.readingOrder='panels';p.sections=specs.map((spec,i)=>({id:spec.id,title:spec.id,purpose:'Explain a different part of the same method',visual:'Use the declared native structure',design:{role:i===0?'overview':i===1?'mechanism':'detail',structure:spec.structure,rationale:'The selected relationship matches this section of the method.',emphasis:i===1?'primary':'supporting',frame:{id:`region-${spec.id}`,x:spec.x,y:spec.y,width:spec.width,height:spec.height}},components:[{id:`native-${spec.id}`,key:spec.key}],referenceImages:[],annotations:[]}))
    p.connections=[{from:'overview',to:'mechanism',kind:'dataflow',meaning:'Input features'},{from:'mechanism',to:'detail',kind:'detail',meaning:'Conceptual explanation, not a new data flow'}]
    const record=parseCompositionPlanResponse(JSON.stringify({message:'Mixed structure plan',plan:p}),runId,'Method overview plus mechanism and conceptual detail',catalogue,[]).compositionRecord,base=createBlank();base.style.paletteId=p.style.paletteId;base.style.preset=p.style.preset
    const root=base.containers[0]!,area={x:root.x+12,y:root.y+48,width:root.width-24,height:root.height-60}
    for(const spec of specs)base.containers.push({id:`region-${spec.id}`,parentId:'stage',role:'component',title:spec.id,x:area.x+spec.x*area.width,y:area.y+spec.y*area.height,width:spec.width*area.width,height:spec.height*area.height,visual:{fill:'none',stroke:'none'}})
    const built=composeCatalogue(base,catalogue,specs.map(spec=>{const f=base.containers.find(c=>c.id===`region-${spec.id}`)!;return componentInstanceSchema.parse({id:`native-${spec.id}`,componentKey:spec.key,parentId:f.id,x:f.x+8,y:f.y+8,fit:{width:f.width-16,height:f.height-16}})}),[])
    const first=(id:string)=>built.figure.nodes.find(n=>n.kind!=='port'&&n.parentId===`native-${id}`)!
    built.figure.edges.push({id:'region-flow',source:first('overview').id,target:first('mechanism').id,sourcePort:'right',targetPort:'left'})
    built.figure.nodes.push({id:'detail-guide',kind:'path',label:'Conceptual correspondence',parentId:'stage',x:500,y:300,width:50,height:50,path:{points:[{x:0,y:0},{x:1,y:1}],arrow:'none',start:{nodeId:first('mechanism').id,x:.5,y:1},end:{nodeId:first('detail').id,x:.5,y:0}}})
    expect(()=>validateCompositionCandidate(record,built.figure,built.used)).not.toThrow()
    const shifted=clone(built.figure);shifted.containers.find(c=>c.id==='region-detail')!.y+=8;expect(()=>validateCompositionCandidate(record,shifted,built.used)).toThrow('位置或比例')
    const missing=clone(built.figure);missing.edges=missing.edges.filter(e=>e.id!=='region-flow');expect(()=>validateCompositionCandidate(record,missing,built.used)).toThrow('有向跨区')
    const fake=clone(built.figure);fake.nodes.find(n=>n.id==='detail-guide')!.path!.arrow='filled';expect(()=>validateCompositionCandidate(record,fake,built.used)).toThrow('无箭头')
    const wrong=clone(built.figure);wrong.containers.find(c=>c.id==='native-detail')!.parentId='region-mechanism';expect(()=>validateCompositionCandidate(record,wrong,built.used)).toThrow('指定分区')
  })
  it('rejects incomplete, overlapping or equally emphasized new composition designs without forcing diversity on simple figures',()=>{
    const p=plan(),design={role:'overview' as const,structure:'layered' as const,rationale:'Containment communicates module ownership.',emphasis:'primary' as const,frame:{id:'region-a',x:0,y:0,width:.5,height:1}}
    p.sections[0]!.design=design;expect(()=>compositionPlanSchema.parse(p)).toThrow('每个分区')
    p.sections[1]!.design={...design,frame:{...design.frame,id:'region-b',x:.5}};p.connections[0]!.kind='comparison';expect(()=>compositionPlanSchema.parse(p)).toThrow('主视觉')
    p.sections[1]!.design!.emphasis='supporting';expect(()=>compositionPlanSchema.parse(p)).not.toThrow()
    p.sections[1]!.design!.frame.x=.49;expect(()=>compositionPlanSchema.parse(p)).toThrow('不得重叠')
    p.sections.pop();p.connections=[];p.sections[0]!.design!.frame.width=1;expect(()=>compositionPlanSchema.parse(p)).not.toThrow()
  })
  it('swaps semantic slots simultaneously while preserving raw object colors, nested palettes and chart encoding',()=>{
    const doc=createBlank();doc.style.paletteId='figureforge-publication-soft';doc.style.preset='precise'
    doc.nodes=[{id:'a',kind:'rectangle',label:'Input',parentId:'stage',x:100,y:200,width:100,height:60,visual:{colorIndex:0}},{id:'b',kind:'rectangle',label:'Output',parentId:'stage',x:280,y:200,width:100,height:60,visual:{colorIndex:1}},{id:'manual',kind:'rectangle',label:'Manual RGB',parentId:'stage',x:100,y:300,width:100,height:60,visual:{colorIndex:0,fill:'#123456',stroke:'#654321'}}]
    doc.edges=[{id:'a-b',source:'a',target:'b',sourcePort:'right',targetPort:'left'}]
    const rows:ColorMapping[]=[{sourcePaletteId:doc.style.paletteId,sourceIndex:0,targetPaletteId:doc.style.paletteId,targetIndex:1,role:'Input'},{sourcePaletteId:doc.style.paletteId,sourceIndex:1,targetPaletteId:doc.style.paletteId,targetIndex:0,role:'Output'}],before=clone(doc)
    setContainerColorMap(doc,'stage',rows);expect(doc.nodes).toEqual(before.nodes);expect(doc.edges).toEqual(before.edges)
    expect(figurePaint(resolveStyle(doc,'stage'),0).color).toBe('#FC8D62');expect(figurePaint(resolveStyle(doc,'stage'),1).color).toBe('#66C2A5')
    const svg=exportSvg(doc),xml=new DOMParser().parseFromString(svg,'image/svg+xml'),edge=Array.from(xml.getElementsByTagName('path')).find(p=>p.getAttribute('data-edge-id')==='a-b')!
    expect(edge.getAttribute('stroke')).toBe(figurePaint(resolveStyle(doc,'stage')).ink);expect(svg).toContain('#123456');expect(svg).toContain('#654321');expect(exportDrawio(doc)).toContain(`strokeColor=${edge.getAttribute('stroke')}`)
    doc.containers.push({id:'other',parentId:'stage',role:'component',title:'Other palette',x:480,y:180,width:200,height:120,appearance:{preset:'inherit',accent:'inherit',paletteId:'figureforge-tableau10'}});expect(figurePaint(resolveStyle(doc,'other'),0).color).toBe('#4E79A7')
    const chart=scaleComponent(buildDataChart(chartExample('scatter')),.3),withChart=instantiateComponentAt(doc,chart,'stage',{x:600,y:350},'chart',true).document
    expect(resolveStyle(withChart,'chart').colorMap).toBeUndefined();expect(()=>setContainerColorMap(withChart,'stage',rows)).toThrow('数据图表')
  })
  it('compiles adopted per-role maps from the fixed plan instead of trusting instance output, and retains maps through native reuse',()=>{
    const catalogue=entries(),entry=catalogue[0]!;if(entry.kind!=='asset')throw new Error('fixture');entry.asset.figure.style.paletteId='figureforge-publication-soft';entry.asset.figure.nodes[0]!.visual={colorIndex:0};entry.asset.figure.nodes[1]!.visual={colorIndex:1}
    const rows:ColorMapping[]=[{sourcePaletteId:'figureforge-publication-soft',sourceIndex:0,targetPaletteId:'figureforge-publication-soft',targetIndex:2,role:'Encoding'},{sourcePaletteId:'figureforge-publication-soft',sourceIndex:1,targetPaletteId:'figureforge-publication-soft',targetIndex:0,role:'Output'}],p=plan();p.sections[0]!.components[0]!.colorMap=rows
    const record=parse(response(p),catalogue).compositionRecord,base=createBlank();base.style.preset=p.style.preset;base.style.paletteId=p.style.paletteId
    const saved=clone(catalogue),raw={message:'Apply fixed plan',figure:base,instances:[{id:'pipe',componentKey:'asset:builtin-pipeline',parentId:'stage',x:100,y:180,keepAppearance:false,colorMap:[{...rows[0],targetIndex:4}]}],referenceNotes:notes()},parsed=parseHarnessResponse(JSON.stringify(raw),base,catalogue,references,record),candidate=applyCompositionRecord(parsed.figure!,record,parsed.used)
    expect(catalogue).toEqual(saved);expect(parsed.used[0]!.colorMap).toEqual(colorMapSchema.parse(rows));expect(figurePaint(resolveStyle(candidate,'pipe'),0).color).toBe('#8DA0CB');expect(figurePaint(resolveStyle(candidate,'pipe'),1).color).toBe('#66C2A5')
    const partial=JSON.parse(JSON.stringify(candidate));partial.containers.find((c:{id:string})=>c.id==='pipe').appearance={paletteId:'figureforge-publication-soft',colorIndex:2,colorMap:rows};expect(parseDocument(partial).containers.find(c=>c.id==='pipe')!.appearance).toMatchObject({preset:'inherit',accent:'inherit'});partial.containers.find((c:{id:string})=>c.id==='pipe').appearance.accent='#123456';expect(()=>parseDocument(partial)).toThrow()
    const captured=captureComponent(candidate,'pipe','Mapped'),scaled=componentDocument(scaleComponent(captured,.5));expect(scaled.style.colorMap).toEqual(colorMapSchema.parse(rows));expect(candidate.nodes.map(n=>n.visual)).toEqual(entry.asset.figure.nodes.map(n=>n.visual));expect(scaled.nodes.map(n=>n.visual?.colorIndex)).toEqual(entry.asset.figure.nodes.map(n=>n.visual?.colorIndex))
    const recovered=importSvg(exportSvg(candidate),{fileName:'mapped.svg',sha256:'e'.repeat(64),parseXml:source=>new DOMParser().parseFromString(source,'image/svg+xml') as unknown as Document}).asset.figure;expect(recovered.containers.find(c=>c.id==='pipe')!.appearance!.colorMap).toEqual(colorMapSchema.parse(rows))
  })
  it('rejects unknown semantic sources, duplicate maps, conflicting modes and scientific chart remapping atomically',()=>{
    const catalogue=entries(),p=plan(),map:ColorMapping={sourcePaletteId:'figureforge-tableau10',sourceIndex:0,targetPaletteId:p.style.paletteId,targetIndex:2,role:'Processing'};p.sections[0]!.components[0]!.colorMap=[map]
    expect(()=>parse(response(p),catalogue)).toThrow('不存在');expect(()=>colorMapSchema.parse([map,map])).toThrow('重复');expect(()=>colorMapSchema.parse([{...map,targetIndex:11}])).toThrow('色槽')
    const legacyEntry=catalogue[0]!;if(legacyEntry.kind==='asset')delete legacyEntry.asset.figure.style.paletteId
    map.sourcePaletteId='legacy:blue';expect(parse(response(p),catalogue).compositionRecord.plan.sections[0]!.components[0]!.colorMap).toHaveLength(1)
    p.sections[0]!.components[0]!.colorIndex=2;expect(()=>parse(response(p),catalogue)).toThrow('不能混用');delete p.sections[0]!.components[0]!.colorIndex
    p.sections[0]!.components[0]!.colorMap![0]!.targetPaletteId='figureforge-tableau10';expect(()=>parse(response(p),catalogue)).toThrow('方案目标配色')
    const chart=componentDocument(buildDataChart(chartExample('heatmap'))),before=clone(chart);expect(()=>setContainerColorMap(chart,'stage',[{...map,targetPaletteId:p.style.paletteId}])).toThrow('数据图表');expect(chart).toEqual(before)
    expect(colorSlotInventory(catalogue[0]!.kind==='asset'?catalogue[0]!.asset.figure:createBlank()).some(slot=>slot.edges>0)).toBe(true)
  })
  it('binds image observations and native source metadata without creating a figure or changing inputs',()=>{
    const catalogue=entries(),saved=clone(catalogue),result=parse(response(),catalogue)
    expect(result).not.toHaveProperty('figure');expect(result.compositionRecord).toMatchObject({runId,userGoal:'User pipeline goal',components:[{key:'asset:builtin-pipeline',name:'处理流水线',nodeCount:2}],references:[{id:'r1',sha256:'a'.repeat(64),decision:'use'},{id:'r2',decision:'omit'}]});expect(catalogue).toEqual(saved)
  })
  it('normalizes declared recipe options into explicit immutable structure parameters',()=>{
    const p=plan();p.sections[0]!.components=[{id:'pipe',key:'recipe:mlp',parameters:{inputs:'3',hiddenLayers:2,hidden:3,outputs:2,layerGap:104,neuronGap:40}}]
    const result=parse(response(p),[{kind:'recipe',id:'mlp'}]);expect(result.compositionRecord.plan.sections[0]!.components[0]!.parameters).toEqual({inputs:3,hiddenLayers:2,hidden:3,outputs:2,layerGap:104,neuronGap:40})
    delete p.sections[0]!.components[0]!.parameters;expect(parse(response(p),[{kind:'recipe',id:'mlp'}]).compositionRecord.plan.sections[0]!.components[0]!.parameters).toMatchObject({inputs:2,hiddenLayers:1,layerGap:80,neuronGap:24})
  })
  it('rejects unselected sources, invented recipe parameters and regeneration of saved manual assets',()=>{
    const unknown=plan();unknown.sections[0]!.components=[{id:'pipe',key:'asset:invented'}];expect(()=>parse(response(unknown))).toThrow('清单之外')
    const saved=plan();saved.sections[0]!.components[0]!.parameters={stages:4};expect(()=>parse(response(saved))).toThrow('不接受配方参数')
    const bad=plan();bad.sections[0]!.components=[{id:'pipe',key:'recipe:mlp',parameters:{layerGap:41}}];expect(()=>parse(response(bad),[{kind:'recipe',id:'mlp'}])).toThrow()
  })
  it('requires exact per-image notes and explicit use-to-section correspondence',()=>{
    const missing=response();missing.referenceNotes.pop();expect(()=>parse(missing)).toThrow('逐一对应')
    const omitted=plan();omitted.sections[0]!.referenceImages=[2];expect(()=>parse(response(omitted))).toThrow('已采用')
    const unbound=plan();unbound.sections[0]!.referenceImages=[];expect(()=>parse(response(unbound))).toThrow('至少一个')
    const invented=plan();invented.sections[0]!.referenceImages=[3];expect(()=>parse(response(invented))).toThrow('参考图号')
  })
  it('rejects duplicate instance identities, out-of-palette slots and chart color bindings before adoption',()=>{
    const p=plan();p.sections[0]!.components[0]!.colorIndex=1
    expect(parse(response(p)).compositionRecord.plan.sections[0]!.components[0]!.colorIndex).toBe(1)
    p.sections[1]!.components=[clone(p.sections[0]!.components[0]!)];expect(()=>parse(response(p))).toThrow('实例标识不能重复');p.sections[1]!.components=[]
    p.sections[0]!.components[0]!.id='stage';expect(()=>parse(response(p))).toThrow('根容器');p.sections[0]!.components[0]!.id='pipe'
    p.sections[0]!.components[0]!.colorIndex=11;expect(()=>parse(response(p))).toThrow('色槽')
    const chart=buildDataChart(chartExample('heatmap'));p.sections[0]!.components=[{id:'matrix',key:`asset:${chart.id}`,colorIndex:1}]
    expect(()=>parse(response(p),[{kind:'asset',asset:chart}])).toThrow('数据图表')
  })
  it('binds two uses of the same native source to their approved default colors without rewriting source objects',()=>{
    const p=plan();p.sections[0]!.components=[{id:'blue',key:'asset:builtin-pipeline',colorIndex:2},{id:'orange',key:'asset:builtin-pipeline',colorIndex:1}]
    const catalogue=entries(),asset=catalogue[0]!;if(asset.kind!=='asset')throw new Error('fixture');asset.asset.figure.nodes[0]!.visual={fill:'#123456',stroke:'#654321'}
    const saved=clone(catalogue),record=parse(response(p),catalogue).compositionRecord,base=createBlank();base.style.preset=p.style.preset;base.style.paletteId=p.style.paletteId
    const built=composeCatalogue(base,catalogue,['blue','orange'].map((id,i)=>componentInstanceSchema.parse({id,componentKey:'asset:builtin-pipeline',parentId:'stage',x:100+i*400,y:180,scale:.6,keepAppearance:true})),[]),before=clone(built.figure),result=applyCompositionRecord(built.figure,record,built.used)
    expect(catalogue).toEqual(saved);expect(built.figure).toEqual(before);expect(result.nodes).toEqual(before.nodes);expect(result.edges).toEqual(before.edges)
    const blue=figurePaint(resolveStyle(result,'blue')),orange=figurePaint(resolveStyle(result,'orange'));expect(blue.color).toBe('#8DA0CB');expect(orange.color).toBe('#FC8D62')
    const svg=new DOMParser().parseFromString(exportSvg(result),'image/svg+xml'),paths=Array.from(svg.getElementsByTagName('path'))
    expect(paths.find(path=>path.getAttribute('data-edge-id')===result.edges[0]!.id)?.getAttribute('stroke')).toBe(blue.ink);expect(paths.find(path=>path.getAttribute('data-edge-id')===result.edges[1]!.id)?.getAttribute('stroke')).toBe(orange.ink)
    expect(exportSvg(result)).toContain('#123456');expect(exportDrawio(result)).toContain(`strokeColor=${blue.ink}`);expect(exportDrawio(result)).toContain(`strokeColor=${orange.ink}`)
    expect(()=>applyCompositionRecord(before,record,[{...built.used[0]!,instanceId:'wrong'},built.used[1]!])).toThrow('实例标识')
  })
  it('keeps inherited default colors through save, capture, scaling and SVG while respecting explicit object slots and chart scopes',()=>{
    const base=createBlank();base.style.paletteId='figureforge-publication-soft';setContainerColor(base,'stage',2)
    base.nodes=[{id:'inherit',kind:'rectangle',label:'Inherited',parentId:'stage',x:100,y:200,width:100,height:60},{id:'explicit',kind:'rectangle',label:'Explicit',parentId:'stage',x:240,y:200,width:100,height:60,visual:{colorIndex:0}}]
    const svg=exportSvg(base);expect(svg).toContain(figurePaint(base.style).fill);expect(figurePaint(base.style).color).toBe('#8DA0CB');expect(figurePaint(base.style,0).color).toBe('#66C2A5')
    const captured=captureComponent(base,'stage','Blue diagram'),scaled=scaleComponent(captured,.5),inserted=composeCatalogue(createBlank(),[{kind:'asset',asset:scaled}],[componentInstanceSchema.parse({id:'saved',componentKey:`asset:${scaled.id}`,parentId:'stage',x:100,y:180,keepAppearance:true})],[])
    expect(resolveStyle(inserted.figure,'saved').colorIndex).toBe(2);expect(parseDocument(JSON.parse(JSON.stringify(base))).style.colorIndex).toBe(2)
    const recovered=importSvg(svg,{fileName:'blue.svg',sha256:'d'.repeat(64),parseXml:source=>new DOMParser().parseFromString(source,'image/svg+xml') as unknown as Document}).asset.figure;expect(recovered.style.colorIndex).toBe(2)
    const chart=componentDocument(buildDataChart(chartExample('scatter'))),before=clone(chart);expect(()=>setContainerColor(chart,'stage',1)).toThrow('数据图表');expect(chart).toEqual(before)
  })
  it('validates topology, source-free questions and strict plan-only responses',()=>{
    const duplicate=plan();duplicate.sections[1]!.id='process';expect(()=>compositionPlanSchema.parse(duplicate)).toThrow('不能重复')
    const link=plan();link.connections[0]!.to='invented';expect(()=>compositionPlanSchema.parse(link)).toThrow('现有分区')
    const questions=plan();questions.status='needs-input';expect(()=>parse(response(questions))).toThrow();questions.questions=['What is the output meaning?'];expect(parse(response(questions)).compositionRecord.plan.status).toBe('needs-input')
    expect(()=>parse({...response(),figure:null})).toThrow('契约');expect(()=>parse({...response(),components:[{key:'fake'}]})).toThrow('契约')
    const unknownPalette=plan();unknownPalette.style.paletteId='unknown';expect(()=>parse(response(unknownPalette))).toThrow('配色')
  })
  it('enforces approved native reuse, exact recipe parameters and global style while refusing extra material instances',()=>{
    const record=parse(response()).compositionRecord,base=createBlank();base.style.paletteId=record.plan.style.paletteId;base.style.preset=record.plan.style.preset
    const built=composeCatalogue(base,entries(),[componentInstanceSchema.parse({id:'pipe',componentKey:'asset:builtin-pipeline',parentId:'stage',x:100,y:180})],[])
    expect(()=>validateCompositionCandidate(record,built.figure,built.used)).not.toThrow();const titled=applyCompositionRecord(built.figure,record,built.used);expect(titled.containers[0]!.title).toBe(record.plan.title);expect(titled.nodes).toEqual(built.figure.nodes);titled.title=record.plan.title;expect(exportSvg(titled).match(/>Pipeline plan<\/text>/g)).toHaveLength(1);expect(built.figure.containers[0]!.title).not.toBe(record.plan.title);expect(()=>validateCompositionCandidate(record,built.figure,[])).toThrow('复用');expect(()=>validateCompositionCandidate(record,built.figure,[...built.used,built.used[0]!])).toThrow('之外')
    const changed=clone(built.figure);changed.style.preset='sketch';expect(()=>validateCompositionCandidate(record,changed,built.used)).toThrow('样式')
    const p=plan();p.sections[0]!.components=[{id:'pipe',key:'recipe:mlp',parameters:{inputs:3}}];const recipeRecord=parse(response(p),[{kind:'recipe',id:'mlp'}]).compositionRecord
    expect(()=>validateCompositionCandidate(recipeRecord,base,[{...built.used[0]!,componentKey:'recipe:mlp',parameters:{inputs:2}}])).toThrow('参数')
  })
  it('preserves approved records through editing, capture, scaling and native SVG roundtrip and detects provenance-only changes',()=>{
    const record=parse(response()).compositionRecord,doc=createBlank();doc.nodes=[{id:'n',kind:'text',label:'Feature note',parentId:'stage',x:100,y:200,width:200,height:44}];doc.compositionPlans=[record]
    const captured=captureComponent(doc,'stage','Planned'),scaled=componentDocument(scaleComponent(captured,.5));expect(scaled.compositionPlans).toEqual([record])
    const recovered=importSvg(exportSvg(doc),{fileName:'planned.svg',sha256:'c'.repeat(64),parseXml:source=>new DOMParser().parseFromString(source,'image/svg+xml') as unknown as Document}).asset.figure;expect(recovered.compositionPlans).toEqual([record])
    const result=parseHarnessResponse(JSON.stringify({message:'Keep provenance',figure:{...doc,compositionPlans:[]}}),doc);expect(result.figure!.compositionPlans).toEqual([record])
    const removed=clone(doc);delete removed.compositionPlans;expect(diffFigures(doc,removed).changes[0]!.fields[0]!.name).toBe('图件绘图方案')
  })
  it('caps adopted records and refuses unresolved plans or internally inconsistent imported records',()=>{
    const record=parse(response()).compositionRecord,previous=Array.from({length:4},()=>({...record,runId:crypto.randomUUID()}))
    expect(()=>mergeCompositionRecords(previous,record)).toThrow('4 份');expect(mergeCompositionRecords([record],record)).toHaveLength(1)
    expect(()=>mergeCompositionRecords(undefined,{...record,plan:{...record.plan,status:'needs-input',questions:['Clarify relation']}})).toThrow('补充')
    const invalid=createBlank();invalid.compositionPlans=[clone(record)];invalid.compositionPlans[0]!.plan.sections[0]!.components[0]!.key='missing';expect(()=>parseDocument(invalid)).toThrow('输入来源')
  })
  it('detects real canvas or source changes while allowing only record bookkeeping and JSON property order differences',()=>{
    const original=createBlank(),changed=clone(original);changed.compositionPlans=[parse(response()).compositionRecord];expect(compositionBaseKey(changed)).toBe(compositionBaseKey(original));changed.title='Revised task';expect(compositionBaseKey(changed)).not.toBe(compositionBaseKey(original))
    expect(compositionSnapshotKey({a:1,b:{c:2}})).toBe(compositionSnapshotKey({b:{c:2},a:1}))
  })
  it('keeps planning prompt bounded and rejects mixing approved plans with new sources or unrelated tasks',()=>{
    const prompt=compositionPlanPrompt('Pipeline goal',entries(),references);expect(prompt).toContain('实际参考图目录：');expect(prompt).not.toContain('data:image');expect(prompt.length).toBeLessThan(25000)
    const input={sessionId:crypto.randomUUID(),content:'Generate',figure:createBlank(),catalogue:[],selectedIds:[],compositionPlanRunId:runId}
    expect(()=>harnessRunInputSchema.parse(input)).not.toThrow();expect(()=>harnessRunInputSchema.parse({...input,intent:'plan'})).toThrow('混用');expect(()=>harnessRunInputSchema.parse({...input,catalogue:entries()})).toThrow('固定来源');expect(()=>harnessRunInputSchema.parse({...input,referenceInputs:[{id:'missing',purpose:'style'}]})).toThrow()
    const sourceFree=plan();sourceFree.sections[0]!.components=[];sourceFree.sections[0]!.referenceImages=[];expect(parseCompositionPlanResponse(JSON.stringify({message:'Text plan',plan:sourceFree}),runId,'Text goal',[],[],undefined,{layoutPolicy:'legacy'}).compositionRecord.references).toEqual([])
  })
})
