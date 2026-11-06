import {editableFigure} from './editableFigure'
import {routeFigure,segmentsCross} from './routing'
import {pathPoints} from './paths'
import {createCallouts} from './callouts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { createEditor } from '../composables/useEditor'
import { createHarness } from '../composables/useHarness'
import { clone, createBlank, createExample as sourceExample, type FigureDocument } from './model'
import { harnessPrompt,parseHarnessResponse, type HarnessEvent, type HarnessTurn } from './harness'
import {instantiateComponent,scaleComponent} from './assets'
import { buildRecipe } from '../data/recipes'
import type { RepairPlan } from './repairPlan'
import { parseChartDataset } from './chartDataset'
import { parseChartRecommendationResponse } from './chartRecommendation'
import {captureStyleAsset} from './styleAsset'
import { parseCompositionPlanResponse } from './compositionPlan'
import {prepareDesignReviewImage} from './visualAuditImage'
vi.mock('./visualAuditImage',async importOriginal=>({...await importOriginal<typeof import('./visualAuditImage')>(),prepareDesignReviewImage:vi.fn()}))

const createExample=()=>editableFigure(sourceExample())
const sessionId = '868201df-df6f-44b4-9be4-80a6a39de380', runId = 'ba6a099b-dcc1-4cc6-8e81-50e737adad05'
function parameterSource(){
  let figure=createBlank();const ids:string[]=[]
  for(const asset of [buildRecipe('mlp',{inputs:2,hiddenLayers:1,hidden:3,outputs:2}),buildRecipe('tensor-stack',{layers:5,rows:4,columns:5,spacing:'normal',tilt:'steep',note:'show'}),buildRecipe('pipeline',{stages:3,direction:'row'})]){const placed=instantiateComponent(figure,scaleComponent(asset,.35),'stage');figure=placed.document;ids.push(placed.containerId)}
  const [network,tensor,pipeline]=ids.map(id=>figure.containers.find(c=>c.id===id)!),output=network!.parametric!.objects['neuron-2-0']!,last=pipeline!.parametric!.objects['step-2']!
  figure.nodes.find(node=>node.id===output)!.label='Human logits';figure.nodes.push({id:'receiver',parentId:'stage',kind:'module',label:'Receiver',x:800,y:350,width:100,height:60});figure.edges.push({id:'network-out',source:output,target:'receiver',sourcePort:'right',targetPort:'left'},{id:'pipeline-out',source:last,target:'receiver',sourcePort:'right',targetPort:'top'})
  return{figure,network:network!,tensor:tensor!,pipeline:pipeline!,output}
}
class Source {
  static all: Source[] = []
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onopen: (() => void) | null = null
  closed = false
  constructor(readonly url: string) { Source.all.push(this) }
  close() { this.closed = true }
  event(type: HarnessEvent['type'], sequence: number, proposal?: FigureDocument, override: Partial<HarnessEvent> = {}) {
    this.onmessage?.({ data: JSON.stringify({ type, sequence, sessionId, runId: this.url.split('/runs/')[1]!.split('/')[0], timestamp: new Date().toISOString(), text: 'Model response', ...(proposal ? { proposal } : {}), ...override }) })
  }
}
let scope: ReturnType<typeof effectScope>
beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) })
  vi.stubGlobal('EventSource', Source); Source.all = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/sessions')) return new Response(JSON.stringify(options?.method === 'POST' ? { id: sessionId, kind: 'codex', title: 'Test', createdAt: new Date().toISOString() } : []))
    if (url.endsWith('/runs')) return Response.json({ id: runId, sessionId,summary:turn({status:'running',review:'none',hasProposal:false,content:JSON.parse(String(options?.body)).content}) })
    if (url.endsWith('/cancel')) return new Response(JSON.stringify({ cancelled: true }))
    if (url.endsWith('/review')) return new Response(JSON.stringify(turn({ review: JSON.parse(String(options?.body)).decision })))
    return new Response(JSON.stringify({ error: '会话不存在，服务重启后请新建会话' }), { status: 404 })
  }))
  scope = effectScope()
})
afterEach(() => { scope.stop(); vi.restoreAllMocks();vi.unstubAllGlobals() })
const setup = () => scope.run(() => { const editor = createEditor(); return { editor, harness: createHarness(editor) } })!
const candidate = () => { const doc = createExample(); doc.nodes[0]!.label = 'Proposed input'; return doc }
const turn = (overrides: Partial<HarnessTurn> = {}): HarnessTurn => ({ id: runId, sessionId, status: 'completed', content: 'Edit input', createdAt: new Date().toISOString(),
  message: 'Model response', error: '', components: [], hasProposal: true, review: 'pending', available: true, ...overrides })

describe('Harness response validation and figure review', () => {
  it('rejects a changed render snapshot and only selects review targets while the reviewed canvas is current',async()=>{
    const {editor,harness}=setup();await harness.newSession();harness.prepareDesignReview('检查主次');const before=clone(editor.figure.value),image={dataUrl:'data:image/png;base64,iVBORw0KGgo=',width:1600,height:992,viewport:'canvas-1000x620' as const,renderer:'fastfigure-browser-v1' as const,figureSha256:'a'.repeat(64),imageSha256:'b'.repeat(64),fonts:[]}
    vi.mocked(prepareDesignReviewImage).mockImplementationOnce(async()=>{editor.figure.value.title='Edited while rendering';return image})
    await harness.send();expect(harness.error.value).toContain('渲染期间画布已变化');expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).endsWith('/runs'))).toBe(false)
    editor.figure.value=clone(before);vi.mocked(prepareDesignReviewImage).mockResolvedValue(image)
    const designReview={width:image.width,height:image.height,viewport:image.viewport,renderer:image.renderer,figureSha256:image.figureSha256,imageSha256:image.imageSha256,fonts:image.fonts,contextVersion:'design-aliases-v1' as const},prior=vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation(async(url,options)=>String(url).endsWith('/runs')?Response.json({id:runId,sessionId,summary:turn({status:'running',review:'none',hasProposal:false,intent:'design-review',designReview})}):prior(url,options))
    await harness.send();const request=JSON.parse(String(vi.mocked(fetch).mock.calls.find(([url])=>String(url).endsWith('/runs'))![1]?.body));expect(request).toMatchObject({intent:'design-review',catalogue:[],selectedIds:[],designImage:image});expect(request).not.toHaveProperty('styleReference')
    const report={message:'设计建议',firstRead:'先看到中心模块',keep:[],findings:[{id:'focus',title:'检查主次',category:'hierarchy' as const,severity:'major' as const,observation:'辅助模块过重',impact:'重点不突出',suggestion:'减轻辅助边框',box:{x:.2,y:.2,width:.2,height:.2},objectIds:['encoder']}],uncertainties:[]}
    Source.all[0]!.event('run.completed',1,undefined,{designReviewReport:report});expect(harness.currentTurn.value?.designReviewReport).toEqual(report);expect(harness.proposal.value).toBeNull();expect(editor.figure.value).toEqual(before)
    harness.locateDesignObjects(runId,['encoder']);expect(editor.selectedIds.value).toEqual(['encoder']);editor.selectedIds.value=[];editor.figure.value.title='Later edit';expect(harness.stale.value).toBe(true);harness.locateDesignObjects(runId,['encoder']);expect(editor.selectedIds.value).toEqual([]);harness.dispose()
  })
  it('compiles text fitting from author scope and reports estimation without accepting model-owned frame sizes',()=>{
    const figure=createBlank();figure.nodes=[{id:'caption',kind:'text',label:'Complete annotation',parentId:'stage',x:200,y:200,width:70,height:25,textStyle:{size:20}}]
    const request={kind:'fit-text',objectIds:['caption'],includeDescendants:false,anchor:'top-left',expandGroups:false},payload={message:'Keep all words and font size',figure:null,materialEdits:[request]},before=clone(figure),result=parseHarnessResponse(JSON.stringify(payload),figure),node=result.figure!.nodes[0]!
    expect(node.label).toBe('Complete annotation');expect(node.textStyle!.size).toBe(20);expect(node.x).toBe(200);expect(node.y).toBe(200);expect(result.message).toContain('按布局估算');expect(node.width*node.height).toBeGreaterThan(70*25);expect(figure).toEqual(before)
    expect(()=>parseHarnessResponse(JSON.stringify({...payload,materialEdits:[{...request,after:{width:100,height:40}}]}),figure)).toThrow('契约')
    expect(parseHarnessResponse(JSON.stringify(payload),result.figure!).figure).toBeNull()
  })
  it('compiles deterministic material operations into reviewed candidates, recomputes actual messages and rejects mixed or invented geometry',()=>{
    const figure=createExample(),before=clone(figure),request={kind:'center',objectIds:['encoder'],axis:'both'},payload={message:'Author-selected presentation change',figure:null,materialEdits:[request]},result=parseHarnessResponse(JSON.stringify(payload),figure)
    expect(result.figure).not.toBeNull();expect(result.figure!.nodes.find(n=>n.id==='encoder')!.x).not.toBe(figure.nodes.find(n=>n.id==='encoder')!.x);expect(result.figure!.edges).toEqual(figure.edges);expect(result.message).toContain('相对父容器水平、垂直居中');expect(figure).toEqual(before)
    expect(parseHarnessResponse(JSON.stringify(payload),result.figure!).figure).toBeNull()
    const input=figure.nodes.find(n=>n.id==='input')!,encoder=figure.nodes.find(n=>n.id==='encoder')!
    const pinned=parseHarnessResponse(JSON.stringify({message:'Pin a native connection',figure:null,materialEdits:[{kind:'edge-route',edgeId:'e1',points:[{x:(input.x+input.width+encoder.x)/2,y:input.y+input.height/2}],direction:'horizontal'}]}),figure)
    expect(pinned.figure!.edges[0]!.routing).toBe('manual');expect(pinned.figure!.edges[0]!.source).toBe('input');expect(pinned.figure!.nodes).toEqual(figure.nodes);expect(pinned.message).toContain('节点与端口绑定保持')
    const drawn=parseHarnessResponse(JSON.stringify({message:'Given author waypoints',figure:null,materialEdits:[{kind:'arrow',parentId:'stage',points:[{x:100,y:180},{x:300,y:260}],direction:'horizontal',arrow:'filled'}]}),figure)
    const path=drawn.figure!.nodes.at(-1)!;expect(pathPoints(drawn.figure!,path)).toEqual([{x:100,y:180},{x:300,y:180},{x:300,y:260}]);expect(drawn.figure!.nodes.slice(0,-1)).toEqual(figure.nodes)
    const styled=parseHarnessResponse(JSON.stringify({...payload,materialEdits:[{kind:'line-style',objectIds:['e1'],includeDescendants:false,style:{stroke:'#287f72',strokeWidth:2,arrow:'open',startArrow:'filled',arrowSize:12}}]}),figure);expect(styled.figure!.edges[0]!.appearance).toEqual({stroke:'#287f72',strokeWidth:2,arrow:'open',startArrow:'filled',arrowSize:12});expect(styled.figure!.nodes).toEqual(figure.nodes);expect(styled.message).toContain('保留给定点');expect(parseHarnessResponse(JSON.stringify({...payload,materialEdits:[{kind:'line-style',objectIds:['e1'],includeDescendants:false,style:{stroke:'#287f72',strokeWidth:2,arrow:'open',startArrow:'filled',arrowSize:12}}]}),styled.figure!).figure).toBeNull()
    const resized=parseHarnessResponse(JSON.stringify({...payload,materialEdits:[{kind:'match-size',sourceId:'encoder',objectIds:['fusion'],dimension:'width',anchor:'top-left'}]}),figure);expect(resized.figure!.nodes.find(n=>n.id==='fusion')!.width).toBe(figure.nodes.find(n=>n.id==='encoder')!.width);expect(resized.message).toContain('内部图元与字号不缩放')
    for(const bad of [{...payload,figure},{...payload,callouts:[{targetId:'encoder',text:'Mixed note',reason:'Forbidden mixture'}]},{...payload,materialEdits:[{...request,objectIds:['invented']}]},{...payload,materialEdits:[{...request,after:{x:10,y:10}}]}])expect(()=>parseHarnessResponse(JSON.stringify(bad),figure)).toThrow()
    expect(()=>parseHarnessResponse(JSON.stringify(payload),figure,[],[],undefined,true)).toThrow('单独');expect(figure).toEqual(before)
  })

  it('compiles source-bound annotation reflows, returns no-op reports and rejects mixed or invented edits atomically',()=>{
    const created=createCallouts(createExample(),[{targetId:'encoder',text:'Keep this exact note',side:'top',reason:'Identify frozen weights'}]),figure=created.figure,before=clone(figure),pair=created.reports[0]!,request={leaderId:pair.leaderId,labelId:pair.labelId,mode:'layout',side:'bottom',reason:'Leave the top lane free'},payload={message:'Reposition note',figure:null,calloutReflows:[request]},result=parseHarnessResponse(JSON.stringify(payload),figure)
    expect(result.calloutReflows![0]).toMatchObject({leaderId:pair.leaderId,labelId:pair.labelId,changed:true,textPreserved:true,targetPreserved:true,bindingsChanged:false});expect(result.figure!.nodes.map(n=>n.id)).toEqual(figure.nodes.map(n=>n.id));expect(figure).toEqual(before)
    const points=pathPoints(result.figure!,result.figure!.nodes.find(n=>n.id===pair.leaderId)!),routes=[...routeFigure(figure).values()].flatMap(route=>route.points.slice(1).map((b,i)=>({a:route.points[i]!,b})));expect(points.slice(1).every((b,i)=>routes.every(route=>!segmentsCross(points[i]!,b,route.a,route.b)))).toBe(true)
    expect([...routeFigure(result.figure!)]).toEqual([...routeFigure(figure)])
    const compact=parseHarnessResponse(JSON.stringify({...payload,calloutReflows:[{...request,anchorPolicy:'reselect'}]}),figure),report=compact.calloutReflows![0]!
    expect(report).toMatchObject({anchorPolicy:'reselect',bindingsChanged:true,targetPreserved:true});expect(report.afterLength).toBeLessThan(result.calloutReflows![0]!.afterLength);expect(report.afterBindings.start.nodeId).toBe(report.beforeBindings.start.nodeId);expect([...routeFigure(compact.figure!)]).toEqual([...routeFigure(figure)])
    const noOp=parseHarnessResponse(JSON.stringify(payload),result.figure!);expect(noOp.figure).toBeNull();expect(noOp.calloutReflows![0]!.changed).toBe(false)
    for(const bad of [{...payload,figure:createBlank()},{...payload,callouts:[{targetId:'encoder',text:'Another note',reason:'Mixed'}]},{...payload,calloutReflows:[{...request,leaderId:'invented'}]},{...payload,calloutReflows:[{...request,after:{x:10,y:10,width:100,height:20}}]},{...payload,calloutReflows:[{...request,anchorPolicy:'invented'}]},{...payload,calloutReflows:[{...request,anchorPolicy:'reselect',afterBindings:{start:{nodeId:'invented',x:0,y:0}}}]}])expect(()=>parseHarnessResponse(JSON.stringify(bad),figure)).toThrow()
    expect(()=>parseHarnessResponse(JSON.stringify(payload),figure,[],[],undefined,true)).toThrow('单独')
    const prompt=harnessPrompt({sessionId,figure,content:'Move the existing note',selectedIds:[pair.labelId],catalogue:[]});expect(prompt).toContain(JSON.stringify({key:`${pair.leaderId}:${pair.labelId}`,leaderId:pair.leaderId,labelId:pair.labelId}).slice(0,-1));expect(figure).toEqual(before)
  })
  it('creates controlled callouts on existing objects and resolves material aliases after new composition atomically',()=>{
    const original=createExample(),snapshot=clone(original),callout={targetId:'encoder',text:'Frozen encoder',reason:'Explain parameter state'},request={message:'Add callout',figure:null,callouts:[callout]},existing=parseHarnessResponse(JSON.stringify(request),original)
    expect(existing.callouts).toHaveLength(1);expect(existing.figure!.nodes.slice(0,original.nodes.length)).toEqual(original.nodes);expect(original).toEqual(snapshot)
    expect(()=>parseHarnessResponse(JSON.stringify({...request,recipeUpdates:[{containerId:'stage',parameters:{stages:3},reason:'Mixed',layout:'frame'}]}),original)).toThrow('混用')
    const asset=buildRecipe('pipeline',{stages:2,direction:'row'}),node=asset.figure.nodes.find(n=>n.kind!=='port'&&n.kind!=='path')!,catalogue=[{kind:'asset' as const,asset}],payload={message:'Compose and annotate',figure:createBlank(),instances:[{id:'pipe',componentKey:`asset:${asset.id}`,parentId:'stage',x:200,y:260,scale:.5}],callouts:[{instanceId:'pipe',nodeId:node.id,parentId:'stage',text:'Feature extraction',reason:'Label the reused operation'}]},result=parseHarnessResponse(JSON.stringify(payload),original,catalogue),report=result.callouts![0]!
    expect(result.used).toHaveLength(1);expect(report).toMatchObject({instanceId:'pipe',nodeId:node.id,text:'Feature extraction'});expect(result.figure!.nodes.find(n=>n.id===report.targetId)!.parentId).toBe('pipe');expect(result.figure!.nodes.find(n=>n.id===report.leaderId)!.path!.start!.nodeId).toBe(report.targetId)
    expect(()=>parseHarnessResponse(JSON.stringify({...payload,callouts:[{...payload.callouts[0],instanceId:'missing'}]}),original,catalogue)).toThrow('有效');expect(original).toEqual(snapshot)
  })
  it('compiles parameter-only requests from frozen source roles, keeps external bindings and reports actual canonical changes',()=>{
    const {figure,network,tensor,output}=parameterSource(),before=clone(figure),requests=[{containerId:network.id,parameters:{hiddenLayers:2},layout:'frame',reason:'增加一个隐藏层，保留现有输出。'},{containerId:tensor.id,parameters:{layers:7,rows:5},layout:'frame',reason:'增加示意片层与网格行数。'}]
    const parsed=parseHarnessResponse(JSON.stringify({message:'参数候选',figure:null,recipeUpdates:requests}),figure,[],[],undefined,true),candidate=parsed.figure!
    expect(figure).toEqual(before);expect(candidate.containers.find(c=>c.id===network.id)!.parametric!.objects['neuron-3-0']).toBe(output);expect(candidate.nodes.find(n=>n.id===output)!.label).toBe('Human logits');expect(candidate.edges.filter(edge=>edge.id==='network-out'||edge.id==='pipeline-out')).toEqual(figure.edges.filter(edge=>edge.id==='network-out'||edge.id==='pipeline-out'));expect(parsed.used).toEqual([])
    expect(parsed.recipeUpdates).toHaveLength(2);expect(parsed.recipeUpdates![0]).toMatchObject({before:{hiddenLayers:1},after:{hiddenLayers:2},keepEdits:true,beforeRevision:0,afterRevision:1,changed:true});expect(parsed.recipeUpdates![0]!.fields).toContainEqual({key:'hiddenLayers',label:'隐藏层数',before:1,after:2,beforeLabel:'1',afterLabel:'2'})
    const prompt=harnessPrompt({sessionId,content:'调整选中的组合',figure,selectedIds:[output],catalogue:[],intent:'edit-recipes'}),context=JSON.parse(prompt.split('以下是当前工程快照（最新状态优先于历史会话）：\n')[1]!.split('\n')[0]!)
    expect(context.figure.containers.every((c:{parametric?:unknown})=>!c.parametric)).toBe(true);expect(context.recipeUpdateTargets.find((target:{containerId:string})=>target.containerId===network.id)).toMatchObject({selected:true,parameters:{hiddenLayers:1}});expect(context.recipeUpdateTargets[0].objects).toBeUndefined();expect(figure).toEqual(before)
    const noOp=parseHarnessResponse(JSON.stringify({message:'保持当前参数',figure:null,recipeUpdates:[{...requests[0],parameters:{hiddenLayers:2}}]}),candidate,[],[],undefined,true);expect(noOp.figure).toBeNull();expect(noOp.recipeUpdates![0]).toMatchObject({changed:false,beforeRevision:1,afterRevision:1})
  })
  it('rejects mixed geometry, injected fields, unknown or duplicate targets and a failing later update without partial publication',()=>{
    const {figure,network,pipeline}=parameterSource(),before=clone(figure),first={containerId:network.id,parameters:{hiddenLayers:2},layout:'frame',reason:'合法的首项'},last={containerId:pipeline.id,parameters:{stages:2},layout:'frame',reason:'仍有外部引用的末项'},response=(recipeUpdates:unknown[],extra:Record<string,unknown>={})=>JSON.stringify({message:'参数请求',figure:null,recipeUpdates,...extra})
    expect(()=>parseHarnessResponse(response([first,last]),figure)).toThrow('引用');expect(figure).toEqual(before)
    for(const request of [{...first,containerId:'unknown'},{...first,parameters:{x:1}},{...first,objects:{}},{...first,generated:0}])expect(()=>parseHarnessResponse(response([request]),figure)).toThrow()
    expect(()=>parseHarnessResponse(response([first,first]),figure)).toThrow('每轮只能更新一次');expect(()=>parseHarnessResponse(response([first],{figure}),figure)).toThrow('单独提交');expect(()=>parseHarnessResponse(JSON.stringify({message:'手算底图',figure}),figure,[],[],undefined,true)).toThrow('单独提交');expect(figure).toEqual(before)
  })
  it('sends only the current figure in parameter mode and retains the server-computed report from the event stream before apply',async()=>{
    const {editor,harness}=setup(),source=parameterSource();editor.figure.value=source.figure;harness.catalogueMode.value='selected';harness.librarySearch.value=true;harness.libraryReview.value=true;harness.intent.value='edit-recipes';harness.draft.value='增加隐藏层';await harness.send()
    const payload=JSON.parse(String(vi.mocked(fetch).mock.calls.find(([url])=>String(url).endsWith('/runs'))![1]?.body));expect(payload).toMatchObject({intent:'edit-recipes',catalogue:[],librarySearch:false,libraryReview:false});expect(payload.figure).toEqual(source.figure)
    const result=parseHarnessResponse(JSON.stringify({message:'待审参数候选',figure:null,recipeUpdates:[{containerId:source.network.id,parameters:{hiddenLayers:2},layout:'frame',reason:'增加隐藏层'}]}),source.figure)
    Source.all[0]!.event('run.started',1);Source.all[0]!.event('run.completed',2,result.figure!,{recipeUpdates:result.recipeUpdates});expect(harness.currentTurn.value!.recipeUpdates).toEqual(result.recipeUpdates);expect(editor.figure.value).toEqual(source.figure);expect(editor.past.value).toHaveLength(0);harness.dispose()
  })
  it('sends an independent immutable style snapshot and manually applies styles as one undoable edit',async()=>{
    const {editor,harness}=setup(),original=clone(editor.figure.value),style={...captureStyleAsset(original),preset:'sketch' as const,fontFamily:'MiSans' as const,paletteId:'figureforge-publication-soft'}
    editor.applySavedStyle(style);expect(editor.figure.value.style.preset).toBe('sketch');expect(editor.figure.value.styleUses![0]!.asset).toEqual(style);editor.undo();expect(editor.figure.value).toEqual(original);editor.redo();expect(editor.figure.value.styleUses).toHaveLength(1);editor.undo()
    editor.useSavedStyle(style);harness.draft.value='Use the selected style';const sending=harness.send();editor.assistantStyle.value!.guide='Changed after send';await sending
    const request=vi.mocked(fetch).mock.calls.find(([url])=>String(url).endsWith('/runs'))!;expect(JSON.parse(String(request[1]?.body)).styleReference).toEqual(style);expect(editor.figure.value).toEqual(original);harness.dispose()
  })

  it('adopts a reviewed composition via GET only, gates stale canvases and sends fixed source identity explicitly',async()=>{
    const {editor,harness}=setup(),original=clone(editor.figure.value),record=parseCompositionPlanResponse(JSON.stringify({message:'Review first',plan:{status:'ready',title:'Native pipeline',goal:'Explain two processing stages',readingOrder:'left-to-right',layout:'Two stages and one short caption',style:{preset:'precise',paletteId:'figureforge-publication-soft',fontFamily:'MiSans',usage:'Muted blue processing stages'},sections:[{id:'pipeline',title:'Processing',purpose:'Show stages',visual:'Use the native pipeline',design:{role:'mechanism',structure:'pipeline',rationale:'Native stages explain the supplied order.',emphasis:'primary',frame:{id:'pipeline-region',x:0,y:0,width:1,height:1}},components:[{id:'pipeline',key:'asset:builtin-pipeline'}],referenceImages:[],annotations:[]}],connections:[],checks:['Keep stages'],questions:[],uncertainties:[]}}),runId,'Draw a pipeline',[{kind:'asset',asset:buildRecipe('pipeline',{stages:2,direction:'row'})}],[]).compositionRecord
    harness.intent.value='plan';harness.draft.value='Draw a pipeline';await harness.send();expect(harness.intent.value).toBe('plan');Source.all[0]!.event('run.completed',1,undefined,{compositionRecord:record})
    expect(harness.proposal.value).toBeNull();expect(harness.currentTurn.value?.compositionRecord).toEqual(record);expect(editor.figure.value).toEqual(original)
    const prior=vi.mocked(fetch).getMockImplementation()!;vi.mocked(fetch).mockImplementation(async(url,options)=>String(url).endsWith(`/runs/${runId}`)?Response.json({id:runId,sessionId,status:'completed',content:'Draw a pipeline',baseFigure:original,canvasBaseline:original,summary:turn({intent:'plan',hasProposal:false,review:'none',compositionRecord:record}),events:[]}):prior(url,options))
    const posts=()=>vi.mocked(fetch).mock.calls.filter(([,options])=>options?.method==='POST').length,before=posts()
    await harness.adoptComposition(runId);expect(posts()).toBe(before);expect(harness.adoptedComposition.value?.record).toEqual(record);expect(harness.intent.value).toBe('draw');expect(harness.draft.value).toContain('已采用方案');expect(editor.figure.value).toEqual(original)
    editor.figure.value.title='Changed after adoption';await harness.send();expect(harness.error.value).toContain('已变化');expect(posts()).toBe(before)
    editor.figure.value=clone(original);await harness.send();const request=vi.mocked(fetch).mock.calls.filter(([url])=>String(url).endsWith('/runs')).at(-1)!,input=JSON.parse(String(request[1]?.body))
    expect(input).toMatchObject({compositionPlanRunId:runId,catalogue:[]});expect(input).not.toHaveProperty('referenceInputs');expect(input).not.toHaveProperty('intent');expect(editor.figure.value).toEqual(original);harness.dispose()
  })
  it('keeps explicit multiple selections when the active reference changes and uses document order',()=>{
    const{editor,harness}=setup();editor.figure.value.references=Array.from({length:3},(_,i)=>({id:`ref-${i}`,title:`Source ${i}`,citation:'Authored',fileName:`${i}.png`,sha256:String(i+1).repeat(64),pixelWidth:800,pixelHeight:400,dataUrl:'data:image/png;base64,iVBORw0KGgo=',placement:{x:0,y:0,width:800,height:400}}))
    harness.toggleReference('ref-1',true);harness.toggleReference('ref-0',true);harness.setReferencePurpose('ref-0','layout');editor.referenceId.value='ref-2'
    expect(harness.attachReference.value).toBe(false);expect(harness.selectedReferences.value).toEqual([{id:'ref-0',purpose:'layout'},{id:'ref-1',purpose:'style'}]);harness.attachReference.value=true
    expect(harness.selectedReferences.value).toHaveLength(3);editor.referenceId.value='ref-0';expect(harness.selectedReferences.value).toHaveLength(3);harness.attachReference.value=false;expect(harness.selectedReferences.value.map(r=>r.id)).toEqual(['ref-1','ref-2']);harness.dispose()
  })
  it('blocks content-reference reuse in data mode before making a request and permits an explicit purpose correction',async()=>{
    const{editor,harness}=setup();editor.figure.value.references=[{id:'ref',title:'Source',citation:'Authored',fileName:'source.png',sha256:'a'.repeat(64),pixelWidth:800,pixelHeight:400,dataUrl:'data:image/png;base64,iVBORw0KGgo=',placement:{x:0,y:0,width:800,height:400}}]
    harness.attachReference.value=true;harness.setReferencePurpose('ref','content');editor.assistantDataset.value=parseChartDataset('X,Y\n1,2\n3,4',{name:'Raw',origin:'example',errorLabel:'',note:'',dataSource:''});harness.draft.value='Select a chart';await harness.send()
    expect(harness.error.value).toContain('数据选图只借鉴');expect(fetch).not.toHaveBeenCalled();harness.setReferencePurpose('ref','layout');await harness.send()
    const call=vi.mocked(fetch).mock.calls.find(([url])=>String(url).endsWith('/runs'))!;expect(JSON.parse(String(call[1]?.body)).referenceInputs).toEqual([{id:'ref',purpose:'layout'}]);harness.dispose()
  })
  it('sends an immutable imported table with no component catalogue and retains structured selection in the current turn',async()=>{
    const {editor,harness}=setup(),data=parseChartDataset('Model,Latency (ms),Accuracy (%)\nA,12,76\nB,20,83',{name:'Imported observations',visualizationGoal:'比较准确率与延迟的取舍',origin:'example',errorLabel:'',note:'Fixed note',dataSource:'Authored test'}),saved=clone(data)
    editor.assistantDataset.value=data;harness.catalogueMode.value='selected';harness.draft.value='分析变量关系并选择可视化'
    const sending=harness.send();editor.assistantDataset.value!.rows[0]![1]='999';editor.assistantDataset.value!.visualizationGoal='后续修改不改变本轮';await sending
    const request=vi.mocked(fetch).mock.calls.find(([url])=>String(url).endsWith('/runs'))!,payload=JSON.parse(String(request[1]?.body))
    expect(payload.chartData).toEqual(saved);expect(payload.catalogue).toEqual([])
    const parsed=parseChartRecommendationResponse(JSON.stringify({message:'Use scatter',recommendation:{status:'ready',kind:'scatter',xColumn:'c1',series:[{column:'c2'}],title:'Relationship',xLabel:'Latency (ms)',yLabel:'Accuracy (%)',paletteId:'figureforge-publication-soft',grid:true,showValues:false,reason:'Two numeric variables',alternatives:[],cautions:[]}}),editor.figure.value,saved)
    Source.all[0]!.event('run.completed',1,parsed.figure!,{chartRecommendation:parsed.chartRecommendation})
    expect(harness.currentTurn.value?.chartRecommendation).toEqual(parsed.chartRecommendation);expect(editor.figure.value).toEqual(createExample());expect(harness.apply()).toBe(true);editor.undo();expect(editor.figure.value).toEqual(createExample());harness.dispose()
  })
  it('blocks data selection with an attached image when the selected adapter lacks image input',async()=>{
    const {editor,harness}=setup();editor.assistantDataset.value=parseChartDataset('X,Y\n1,2\n2,3',{name:'Table',origin:'user',errorLabel:'',note:'',dataSource:''})
    editor.figure.value.references=[{id:'ref',title:'Reference',citation:'Authored',fileName:'style.png',sha256:'a'.repeat(64),pixelWidth:800,pixelHeight:400,dataUrl:'data:image/png;base64,iVBORw0KGgo=',placement:{x:100,y:100,width:800,height:400}}]
    harness.statuses.value=[{kind:'codex',state:'ready',message:'No images',images:false}];harness.attachReference.value=true;harness.draft.value='按参考样式分析数据'
    await harness.send();expect(harness.error.value).toContain('不支持图片');expect(fetch).not.toHaveBeenCalled();harness.dispose()
  })
  it('recovers an active plan without restarting it, retries transient errors and subsequently opens newer manual turns',async()=>{
    const childId='45839a0d-5739-4f05-9a1d-f3c77ac51bc8',planId='e028ebfb-ae54-401b-923e-c493e6141db4',manualId='96c675bd-9aeb-453a-a929-74ae8ede2765',original=createExample(),parent=candidate(),refined=clone(parent);refined.nodes[1]!.label='Plan result'
    let checks=0,complete=false,later=false
    const plan:RepairPlan={id:planId,sessionId,parentRunId:runId,latestCandidateRunId:runId,activeRunId:childId,containerId:'stage',createdAt:new Date().toISOString(),status:'running',stopping:false,message:'Running',steps:[{regionId:'left',title:'Encoder',runId:childId,status:'running'}]}
    const child=()=>turn({id:childId,status:complete?'completed':'running',review:complete?'pending':'none',hasProposal:complete,refinement:{parentRunId:runId,rootRunId:runId,round:1}})
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
      if(url.endsWith('/status'))return Response.json([{kind:'codex',state:'ready',message:'Test',images:true}])
      if(url.endsWith('/sessions'))return Response.json([{id:manualId,kind:'codex',title:'Newer unrelated session',createdAt:plan.createdAt},{id:sessionId,kind:'codex',title:'Active plan',createdAt:plan.createdAt,activePlanId:planId}])
      if(url.endsWith('/history'))return Response.json({turns:[turn(),child(),...(later?[turn({id:manualId,content:'New manual request'})]:[])],omitted:0,repairPlan:plan})
      if(url.endsWith(`/repair-plans/${planId}`)){
        if(++checks===1)return Response.json({error:'Temporary connection failure'},{status:503})
        complete=true;Object.assign(plan,{status:'completed',reason:'completed',activeRunId:undefined,latestCandidateRunId:childId,steps:[{regionId:'left',title:'Encoder',runId:childId,status:'changed'}]});return Response.json(plan)
      }
      const record=later&&url.endsWith(manualId)?turn({id:manualId,content:'New manual request'}):child()
      return Response.json({id:record.id,sessionId,status:record.status,content:record.content,baseFigure:parent,canvasBaseline:original,summary:record,events:record.status==='running'?[{sequence:1,runId:record.id,sessionId,timestamp:record.createdAt,type:'run.started'}]:[{sequence:1,runId:record.id,sessionId,timestamp:record.createdAt,type:'run.completed',proposal:refined}]})
    }))
    const {harness}=setup();await harness.refresh();expect(harness.selectedSessionId.value).toBe(sessionId);expect(harness.planRunning.value).toBe(true);expect(harness.locked.value).toBe(true)
    await harness.refreshRepairPlan();expect(harness.planRunning.value).toBe(true);expect(harness.connection.value).toContain('不会重复启动')
    await harness.refreshRepairPlan();expect(harness.planRunning.value).toBe(false);expect(harness.proposal.value).toEqual(refined);expect(harness.stale.value).toBe(false)
    later=true;await harness.refresh();expect(harness.runId.value).toBe(manualId)
    expect(vi.mocked(fetch).mock.calls.every(([,options])=>!options?.method)).toBe(true);harness.dispose()
  })
  it('preserves an explicitly prepared reference task while the initial assistant refresh restores a previous session',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
      if(url.endsWith('/status'))return Response.json([{kind:'codex',state:'ready',message:'Test',images:true}])
      if(url.endsWith('/sessions'))return Response.json([{id:sessionId,kind:'codex',title:'Previous session',createdAt:new Date().toISOString()}])
      if(url.endsWith('/history'))return Response.json({turns:[turn()],omitted:0})
      return Response.json({id:runId,sessionId,status:'completed',content:'Previous request',baseFigure:createExample(),canvasBaseline:createExample(),summary:turn(),events:[{sequence:1,runId,sessionId,timestamp:new Date().toISOString(),type:'run.completed',proposal:candidate()}]})
    }))
    const {editor,harness}=setup()
    editor.figure.value.references=[{id:'new-reference',title:'New task',citation:'Authored test fixture',fileName:'test.png',sha256:'a'.repeat(64),pixelWidth:800,pixelHeight:400,dataUrl:'data:image/png;base64,iVBORw0KGgo=',placement:{x:100,y:100,width:800,height:400}}]
    const task={kind:'reconstruct' as const,referenceId:'new-reference',region:{x:0,y:0,width:1,height:1},destination:'new' as const,parentId:'stage'}
    harness.prepareReconstruction(task,'Reconstruct the newly imported reference');await harness.refresh()
    expect(harness.reconstructionTask.value).toEqual(task);expect(harness.draft.value).toBe('Reconstruct the newly imported reference');expect(harness.attachReference.value).toBe(true);harness.dispose()
  })
  it('restores a candidate branch against the original canvas baseline, blocks concurrent edits and applies the whole branch in one undo step',async()=>{
    const childId='45839a0d-5739-4f05-9a1d-f3c77ac51bc8',original=createExample(),parent=candidate(),refined=clone(parent);refined.nodes[1]!.label='Refined encoder'
    const child=turn({id:childId,content:'Repair candidate',refinement:{parentRunId:runId,rootRunId:runId,round:1}}),history=[turn(),child]
    vi.stubGlobal('fetch',vi.fn(async(url:string,options?:RequestInit)=>{
      if(url.endsWith('/status'))return Response.json([{kind:'codex',state:'ready',message:'Test',images:true}])
      if(url.endsWith('/sessions'))return Response.json([{id:sessionId,kind:'codex',title:'Branch',createdAt:child.createdAt}])
      if(url.endsWith('/history'))return Response.json({turns:history,omitted:0})
      if(url.endsWith('/review'))return Response.json({...child,review:JSON.parse(String(options?.body)).decision})
      return Response.json({id:childId,sessionId,status:'completed',content:child.content,baseFigure:parent,canvasBaseline:original,summary:child,events:[{sequence:1,runId:childId,sessionId,timestamp:child.createdAt,type:'run.completed',proposal:refined}]})
    }))
    const {editor,harness}=setup();await harness.refresh()
    expect(harness.reviewBase.value).toEqual(parent);expect(harness.reviewBaseline.value).toEqual(original);expect(harness.stale.value).toBe(false);expect(editor.figure.value).toEqual(original)
    editor.setLabel('Concurrent canvas edit');const edited=clone(editor.figure.value)
    expect(harness.stale.value).toBe(true);expect(harness.apply()).toBe(false);expect(editor.figure.value).toEqual(edited)
    editor.undo();expect(harness.apply()).toBe(true);expect(editor.figure.value).toEqual(refined);expect(editor.past.value).toHaveLength(1)
    editor.undo();expect(editor.figure.value).toEqual(original);await vi.waitFor(()=>expect(harness.reviewSync.value).toBe(false));harness.dispose()
  })
  it('sends an immutable selected component snapshot and requires a selection in explicit reference mode', async () => {
    const { editor, harness } = setup(), asset = buildRecipe('pipeline', { stages: 2, direction: 'row' })
    asset.id = 'personal-test'; asset.figure.nodes[0]!.label = 'Manual revision before request'
    editor.library.save(asset)
    harness.catalogueMode.value = 'selected'; harness.draft.value = 'Reuse my component'
    await harness.send(); expect(harness.error.value).toContain('至少选择')
    expect(fetch).not.toHaveBeenCalled()
    harness.toggleComponent('asset:personal-test')
    const sending = harness.send(); editor.library.remove('personal-test'); await sending
    const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith('/runs'))!
    const payload = JSON.parse(String(call[1]?.body))
    expect(payload.catalogue).toHaveLength(1)
    expect(payload.catalogue[0].asset.figure.nodes[0].label).toBe('Manual revision before request')
    expect(editor.library.assets.value).toEqual([])
    Source.all[0]!.event('run.started', 1)
    Source.all[0]!.event('run.completed', 2, candidate(), { components: [{ instanceId: 'my-instance', componentKey: 'asset:personal-test', name: asset.name, revision: asset.updatedAt, nodeCount: 2 }] })
    expect(harness.usedComponents.value[0]?.componentKey).toBe('asset:personal-test')
    harness.dispose()
  })
  it('accepts structured/fenced responses and preserves source guides and omitted object provenance', () => {
    const doc = createExample(), now = new Date().toISOString()
    doc.nodes[0]!.evidence = { title: 'Original paper', reference: 'Fig. 2' }
    doc.containers[0]!.component = { assetId: 'asset-1', name: 'Module', revision: now, sources: [], lineage: [] }
    const figure = candidate()
    const parsed = parseHarnessResponse(`\`\`\`json\n${JSON.stringify({ message: 'Updated input', figure })}\n\`\`\``, doc)
    expect(parsed.figure?.nodes[0]?.evidence).toEqual(doc.nodes[0]!.evidence)
    expect(parsed.figure?.containers[0]?.component).toEqual(doc.containers[0]!.component)
    expect(parsed.figure?.references).toEqual(doc.references)
    expect(parseHarnessResponse('{"message":"Ready","figure":null}', doc).figure).toBeNull()
  })
  it('rejects malformed/truncated responses, invalid geometry and invented topology', () => {
    const doc = createExample()
    for (const response of ['{"message":', 'prose before {"message":"a","figure":null}', '{"message":"missing figure"}']) expect(() => parseHarnessResponse(response, doc)).toThrow()
    const outside = candidate(); outside.nodes[0]!.x = 0
    expect(() => parseHarnessResponse(JSON.stringify({ message: 'Outside', figure: outside }), doc)).toThrow('校验')
    const dangling = candidate(); dangling.edges[0]!.source = 'missing'
    expect(() => parseHarnessResponse(JSON.stringify({ message: 'Dangling', figure: dangling }), doc)).toThrow('校验')
    const original=createBlank(),before=clone(original),figure=clone(original);figure.containers[0]!.title=''
    expect(()=>parseHarnessResponse(JSON.stringify({message:'Chart candidate',figure,instances:[],instanceLinks:[]}),original)).toThrow('容器标题不能为空')
    expect(original).toEqual(before);expect(figure.containers[0]!.title).toBe('')
  })
  it('keeps the live figure unchanged until apply, then records one undoable update', async () => {
    const { editor, harness } = setup(), before = clone(editor.figure.value)
    harness.draft.value = 'Edit input'; await harness.send()
    const source = Source.all[0]!
    source.event('run.started', 1); source.event('assistant.delta', 2)
    expect(editor.figure.value).toEqual(before); expect(harness.busy.value).toBe(true)
    source.event('run.completed', 3, candidate())
    expect(editor.figure.value).toEqual(before); expect(harness.proposal.value?.nodes[0]?.label).toBe('Proposed input')
    expect(harness.apply()).toBe(true); expect(editor.past.value).toHaveLength(1)
    expect(editor.figure.value.nodes[0]?.label).toBe('Proposed input')
    editor.undo(); expect(editor.figure.value).toEqual(before)
    await vi.waitFor(() => expect(harness.reviewSync.value).toBe(false))
    expect(harness.turns.value[0]?.review).toBe('applied'); expect(harness.proposal.value).toBeNull()
    expect(source.closed).toBe(true); harness.dispose()
  })
  it('blocks stale proposals after a concurrent edit and permits discarding without changing the document', async () => {
    const { editor, harness } = setup()
    harness.draft.value = 'Edit input'; await harness.send()
    editor.setLabel('Concurrent change'); const edited = clone(editor.figure.value)
    Source.all[0]!.event('run.started', 1); Source.all[0]!.event('run.completed', 2, candidate())
    expect(harness.stale.value).toBe(true); expect(harness.apply()).toBe(false); expect(editor.figure.value).toEqual(edited)
    harness.discard(); expect(harness.proposal.value).toBeNull(); expect(editor.figure.value).toEqual(edited)
    await vi.waitFor(() => expect(harness.reviewSync.value).toBe(false))
    harness.dispose()
  })
  it('ignores duplicate/out-of-scope stream events, cancels explicitly and detects expired runs during reconnect', async () => {
    const { harness } = setup()
    harness.draft.value = 'Edit input'; await harness.send()
    const source = Source.all[0]!
    source.event('run.started', 1); source.event('assistant.delta', 2)
    source.event('assistant.delta', 2); source.event('assistant.delta', 3, undefined, { runId: sessionId })
    expect(harness.output.value).toBe('Model response')
    await harness.cancel(); expect(harness.cancelling.value).toBe(true)
    source.event('run.cancelled', 3); expect(harness.busy.value).toBe(false); expect(source.closed).toBe(true)
    harness.draft.value = 'Retry'; await harness.send()
    Source.all[1]!.onerror?.()
    await vi.waitFor(() => expect(harness.error.value).toContain('会话不存在'))
    expect(harness.busy.value).toBe(false); expect(Source.all[1]!.closed).toBe(true)
    harness.dispose()
  })
  it('restores multiple turns, opens earlier details without losing later messages and keeps applied candidates read-only', async () => {
    const secondId = '45839a0d-5739-4f05-9a1d-f3c77ac51bc8', history = [turn({ review: 'applied' }), turn({ id: secondId, content: 'Second request' })]
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/status')) return Response.json([{ kind: 'codex', state: 'ready', message: 'Test', images: true }])
      if (url.endsWith('/sessions')) return Response.json([{ id: sessionId, kind: 'codex', title: 'Test', createdAt: new Date().toISOString(), lastRunId: secondId }])
      if (url.endsWith('/history')) return Response.json({ turns: history, omitted: 0 })
      const record = history.find(t => url.endsWith(t.id))!
      return Response.json({ id: record.id, sessionId, status: 'completed', content: record.content, baseFigure: createExample(),canvasBaseline:createExample(), summary: record,
        events: [{ sequence: 1, runId: record.id, sessionId, timestamp: record.createdAt, type: 'run.completed', text: record.message, proposal: candidate() }] })
    }))
    const { editor, harness } = setup()
    await harness.refresh()
    expect(harness.turns.value).toHaveLength(2); expect(harness.runId.value).toBe(secondId)
    expect(harness.proposal.value).not.toBeNull()
    await harness.inspectTurn(runId)
    expect(harness.turns.value.map(t => t.content)).toEqual(['Edit input', 'Second request'])
    expect(harness.currentTurn.value?.review).toBe('applied'); expect(harness.proposal.value).toBeNull()
    expect(harness.reviewFigure.value?.nodes[0]?.label).toBe('Proposed input')
    expect(harness.apply()).toBe(false); expect(editor.past.value).toHaveLength(0)
    harness.dispose()
  })
  it('preserves the successful canvas edit and retries failed review synchronization without adding another undo step', async () => {
    const defaultFetch = fetch; let attempts = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/review') && ++attempts === 1) return Response.json({ error: 'temporary failure' }, { status: 503 })
      return defaultFetch(url, options)
    }))
    const { editor, harness } = setup()
    harness.draft.value = 'Edit input'; await harness.send()
    Source.all[0]!.event('run.started', 1); Source.all[0]!.event('run.completed', 2, candidate())
    expect(harness.apply()).toBe(true)
    await vi.waitFor(() => expect(harness.reviewError.value).toContain('未同步'))
    expect(editor.figure.value.nodes[0]?.label).toBe('Proposed input'); expect(editor.past.value).toHaveLength(1)
    harness.draft.value = 'Do not send until sync'; await harness.send(); expect(Source.all).toHaveLength(1)
    await harness.syncReview(); expect(harness.reviewError.value).toBe(''); expect(harness.locked.value).toBe(false)
    expect(editor.past.value).toHaveLength(1); expect(attempts).toBe(2)
    harness.dispose()
  })
  for (const scenario of ['gap', 'unreadable']) it(`repairs a ${scenario} SSE frame from the authoritative snapshot and restores its review decision`, async () => {
    const originalFetch = fetch
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith(`/runs/${runId}`)) return Response.json({ id: runId, sessionId, status: 'completed', content: 'Edit input', baseFigure: createExample(),canvasBaseline:createExample(), summary: turn({ review: 'discarded' }),
        events: [
          { sequence: 1, runId, sessionId, timestamp: new Date().toISOString(), type: 'run.started' },
          { sequence: 2, runId, sessionId, timestamp: new Date().toISOString(), type: 'assistant.delta', text: 'Recovered output' },
          { sequence: 3, runId, sessionId, timestamp: new Date().toISOString(), type: 'run.completed', text: 'Recovered message', proposal: candidate() },
        ] })
      return originalFetch(url, options)
    }))
    const { harness } = setup(); harness.draft.value = 'Edit input'; await harness.send()
    const source = Source.all[0]!
    source.event('run.started', 1)
    if (scenario === 'gap') source.event('assistant.delta', 3)
    else source.onmessage?.({ data: 'invalid event JSON' })
    await vi.waitFor(() => expect(harness.runStatus.value).toBe('completed'))
    expect(harness.output.value).toBe('Recovered output'); expect(harness.turns.value[0]?.review).toBe('discarded')
    expect(harness.proposal.value).toBeNull(); expect(harness.reviewFigure.value).not.toBeNull(); expect(harness.busy.value).toBe(false)
    harness.dispose()
  })
})
