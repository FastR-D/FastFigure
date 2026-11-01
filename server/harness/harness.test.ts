import {createCallouts} from '../../src/core/callouts'
import {sharedColorbarStates} from '../../src/core/sharedColorbar'
import {sharedLegendStates} from '../../src/core/sharedLegend'
import { afterEach, describe, expect, it } from 'vitest'
import { createHash,randomUUID } from 'node:crypto'
import { createServer, request as httpRequest, type Server } from 'node:http'
import { mkdtemp, readFile, rm,writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ClaudeAdapter, CodexAdapter, type AdapterOptions, type HarnessAdapter } from './adapters'
import { HarnessService,type Run } from './service'
import {selectionPreviewGroups} from '../../src/core/selectionPreviews'
import { harnessHttp } from './http'
import { clone, createBlank, createExample } from '../../src/core/model'
import { buildRecipe,componentRecipes } from '../../src/data/recipes'
import { buildDataChart,replaceDataChart } from '../../src/core/dataChart'
import { chartExample } from '../../src/core/dataChartTable'
import { parseChartDataset,preparedChartDataset } from '../../src/core/chartDataset'
import { instantiateComponent,instantiateComponentAt,scaleComponent } from '../../src/core/assets'
import {checkFigureText} from '../../src/core/figureTextCheck'
import {captureStyleAsset,applyStyleAsset,styleFromComposition} from '../../src/core/styleAsset'
import {compositionBaseKey} from '../../src/core/compositionPlan'
import { reconstructionImageRect, repairContext, sceneForReconstruction } from '../../src/core/reconstruction'
import type { ReconstructionTask } from '../../src/core/reconstructionContract'
import type { FigureDocument } from '../../src/core/model'
import {cataloguePreviewLayout,catalogueSnapshotJson} from '../../src/core/cataloguePreview'
import type {CatalogueEntry} from '../../src/core/catalogue'
import {ComponentLibraryStore} from '../componentLibrary/store'
import {verifyFeedbackCase} from '../../src/core/retrievalFeedback'

const fixture = fileURLToPath(new URL('./fixtures/cli.mjs', import.meta.url))
const options = (scenario = 'proposal', log?: string): AdapterOptions => ({ command: process.execPath, args: [fixture], env: { ...process.env, FASTFIGURE_TEST_SCENARIO: scenario, ...(log ? { FASTFIGURE_TEST_LOG: log } : {}) } })
const adapters: HarnessAdapter[] = [], services: HarnessService[] = [], servers: Server[] = [], dirs: string[] = []
afterEach(async () => {
  adapters.splice(0).forEach(a => a.dispose())
  await Promise.all(services.splice(0).map(s => s.dispose()))
  await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => { s.closeAllConnections(); s.close(() => resolve()) })))
  await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true })))
})
async function directory() { const path = await mkdtemp(join(tmpdir(), 'fastfigure-test-')); dirs.push(path); return path }
// Separate protocol checks cover both adapters. Shared compiler rules need one service run.
function serviceSession(kind:'codex'|'claude',title:string) {
  const service=new HarnessService(provider=>provider==='codex'?new CodexAdapter(options()):new ClaudeAdapter(options()));services.push(service)
  return {service,session:service.createSession(kind,title)}
}
const input = (sessionId: string) => ({ sessionId, content: 'Edit this figure', figure: createExample(), selectedIds: ['stage'] })
function reconstructionInput(sessionId:string) {
  const data=input(sessionId)
  data.figure.references=[{id:'rebuild-reference',title:'Authored protocol fixture',citation:'Test image, not a paper figure',fileName:'fixture.png',sha256:'a'.repeat(64),pixelWidth:800,pixelHeight:400,dataUrl:'data:image/png;base64,iVBORw0KGgo=',placement:{x:100,y:150,width:800,height:400}}]
  const task:ReconstructionTask={kind:'reconstruct',referenceId:'rebuild-reference',region:{x:0,y:0,width:1,height:1},destination:'new',parentId:'stage'}
  return {...data,task}
}
function previewFixture(entries:CatalogueEntry[]){const layout=cataloguePreviewLayout(entries),bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(layout.width,16);bytes.writeUInt32BE(layout.height,20);return{version:1 as const,renderer:'fastfigure-browser-v1' as const,...layout,fonts:[] as string[],snapshotSha256:createHash('sha256').update(catalogueSnapshotJson(entries)).digest('hex'),sha256:createHash('sha256').update(bytes).digest('hex'),dataUrl:`data:image/png;base64,${bytes.toString('base64')}`}}
async function pendingSelectionPreviews(service:HarnessService,run:Run){
  await new Promise<void>((resolve,reject)=>{const listen=()=>{if(service.summary(run.id).repositoryRecall?.selection?.previews?.status==='pending'){run.listeners.delete(listen);resolve()}else if(run.status!=='running'){run.listeners.delete(listen);reject(new Error(service.summary(run.id).error||'No pending preview request'))}};run.listeners.add(listen);listen()})
  const packet=service.getSelectionPreviewRequest(run.id),previews=selectionPreviewGroups(packet.entries).map(previewFixture)
  return{packet,previews,payload:{sessionId:packet.sessionId,requestId:packet.requestId,previews}}
}

function cropInput(figure:FigureDocument,task:ReconstructionTask,width=1600,height=800){
  // Header-only raster for CLI protocol fixtures; browser/live tests use decoded real images.
  const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20)
  return {referenceSha256:figure.references[0]!.sha256,width,height,sourceRect:reconstructionImageRect(figure,task),quality:'original' as const,originalWidth:2400,originalHeight:1200,dataUrl:`data:image/png;base64,${bytes.toString('base64')}`}
}

describe('Native CLI Harness adapters', () => {
  it('preserves the explicit abort reason while Codex is still initializing its RPC connection',async()=>{
    const adapter=new CodexAdapter(options('stall-init'));adapters.push(adapter)
    const controller=new AbortController(),reason=new Error('Explicit run budget exhausted'),running=adapter.send({cwd:await directory(),content:'ping',signal:controller.signal,emit:()=>undefined})
    setTimeout(()=>controller.abort(reason),50);await expect(running).rejects.toBe(reason)
  })
  for (const Adapter of [CodexAdapter, ClaudeAdapter]) {
    it(`${Adapter.name}: normalizes real child-process protocol, no duplicate output, and resumes a session`, async () => {
      const cwd = await directory(), log = join(cwd, 'args.jsonl'), adapter = new Adapter(options('text', log)); adapters.push(adapter)
      expect((await adapter.status()).state).toBe('ready')
      for (let i = 0; i < 2; i++) {
        const fragments: string[] = []
        const result = await adapter.send({ cwd, content: 'ping', signal: new AbortController().signal, emit: (type, text) => { if (type === 'assistant.delta') fragments.push(text) } })
        expect(JSON.parse(result).message).toBe('Fixture connection ready')
        expect(fragments.join('')).toBe(result)
        expect(result).not.toContain('DO NOT LEAK')
      }
      const args = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as string[])
      if (Adapter === ClaudeAdapter) { expect(args[0]).toContain('--session-id'); expect(args[1]).toContain('--resume'); expect(args[0]).toContain('--safe-mode'); expect(args[0]![args[0]!.indexOf('--tools') + 1]).toBe('') }
      else { expect(args).toHaveLength(1); expect(args[0]).toContain('features.shell_tool=false') }
    })
    it(`${Adapter.name}: interrupts a pending turn without leaving the child process active`, async () => {
      const cwd = await directory(), adapter = new Adapter(options('stall')); adapters.push(adapter)
      const controller = new AbortController()
      const running = adapter.send({ cwd, content: 'ping', signal: controller.signal, emit: () => undefined })
      setTimeout(() => controller.abort(), 100)
      await expect(running).rejects.toMatchObject({ name: 'AbortError' })
    })
  }
  it('buffers Codex notifications arriving before turn/start and excludes mismatched thread/turn events', async () => {
    const adapter = new CodexAdapter(options('early')); adapters.push(adapter)
    const deltas: string[] = []
    const text = await adapter.send({ cwd: await directory(), content: 'ping', signal: new AbortController().signal, emit: (type, text) => { if (type === 'assistant.delta') deltas.push(text) } })
    expect(JSON.parse(text).message).toBe('Fixture connection ready')
    expect(deltas.join('')).toBe(text)
  })
  it('reports missing CLIs and rejects cross-session Claude output', async () => {
    const missing = new CodexAdapter({ command: '/nonexistent-fastfigure-cli' }); adapters.push(missing)
    expect((await missing.status()).state).toBe('unavailable')
    const claude = new ClaudeAdapter(options('wrong-session')); adapters.push(claude)
    await expect(claude.send({ cwd: await directory(), content: 'ping', signal: new AbortController().signal, emit: () => undefined })).rejects.toThrow('会话 ID')
  })
})

describe('Harness run service and HTTP event replay', () => {
  it('screens frozen candidates before drawing, preserves plan selection and stops on invalid or uncertain choices',async()=>{
    const library=new ComponentLibraryStore(await directory());let original=buildRecipe('pipeline',{stages:2,direction:'row'}),preferredId=''
    for(let i=0;i<8;i++){const asset=buildRecipe('pipeline',{stages:2,direction:'row'});asset.name=i?'Recall pipeline '+i:'Preferred source';asset.tags=['poolneedle'];asset.figure.nodes[0]!.label=i?'Other stage':'Frozen preferred stage';const stored=library.publish({asset});if(!i){original=asset;preferredId=stored.record.id}}
    const prompts:string[]=[],service=new HarnessService(()=>{const adapter=new CodexAdapter(options());return{kind:adapter.kind,status:()=>adapter.status(),dispose:()=>adapter.dispose(),send:turn=>{prompts.push(turn.content);return adapter.send(turn)}}},180_000,library);services.push(service)
    try{
      const session=service.createSession('codex','Selection'),base=createBlank(),query='LIBRARY_RECALL_TEST SELECTION_DEEP_TEST poolneedle pipeline，不要解码器',data={sessionId:session.id,content:query,figure:base,selectedIds:[],catalogue:[{kind:'seed' as const,id:'decoder'},{kind:'recipe' as const,id:'patch-embedding'}],librarySearch:true,libraryReview:true}
      expect(library.recommend(query).matches.some(row=>row.record.id===preferredId)).toBe(false)
      const first=service.start(data);expect(service.summary(first.id).repositoryRecall!.catalogue).toEqual([]);original.figure.nodes[0]!.label='Later preferred stage';library.publish({asset:original});await first.done
      expect(first.status,service.summary(first.id).error).toBe('completed');const report=service.summary(first.id).repositoryRecall!,chosen=report.selection!.choices.filter(row=>row.decision==='include')
      expect(report.selection!.candidates.length).toBeGreaterThan(6);expect(chosen).toHaveLength(1);expect(report.catalogue[0]!.snapshotId).toBe(preferredId);expect(report.selection!.choices.find(row=>row.key==='seed:decoder')!.decision).toBe('exclude')
      expect(first.events.at(-1)!.proposal!.nodes.some(node=>node.label==='Frozen preferred stage')).toBe(true);expect(first.events.at(-1)!.proposal!.nodes.some(node=>node.label==='Later preferred stage')).toBe(false)
      expect(prompts).toHaveLength(2);expect(prompts[0]).toContain('Frozen preferred stage');expect(prompts[1]).toContain('"catalogue":[{"key":"asset:library-');expect(first.events.some(event=>event.type==='repository.updated'&&event.repositoryRecall?.selection?.status==='completed')).toBe(true)
      const evidence=service.getSelectionEvidence(first.id);expect(createHash('sha256').update(evidence.response!).digest('hex')).toBe(report.selection!.responseSha256);expect(service.history(session.id).turns[0]!.repositoryRecall).toEqual(report)
      const recipeFeedback=await service.feedbackContext(first.id,'recipe:patch-embedding');expect(recipeFeedback.context.capabilities!.kind).toBe('recipe');expect(recipeFeedback.context.capabilities!.fields.find(field=>field.key==='grid')!.options.map(option=>option.value)).toEqual(['2','3','4']);expect(recipeFeedback.context.report.selection!.choices.find(row=>row.key==='recipe:patch-embedding')!.decision).toBe('exclude')
      const plan=service.start({...data,content:'COMPOSITION_PLAN_TEST SELECTION_DEEP_TEST poolneedle pipeline',intent:'plan'});await plan.done;expect(plan.status,service.summary(plan.id).error).toBe('completed');library.close();const sends=prompts.length
      const drawn=service.start({sessionId:session.id,content:'COMPOSITION_PLAN_DRAW',figure:base,selectedIds:[],compositionPlanRunId:plan.id});await drawn.done;expect(drawn.status,service.summary(drawn.id).error).toBe('completed');expect(prompts).toHaveLength(sends+1);expect(service.summary(drawn.id).repositoryRecall!.selection!.evidenceRunId).toBe(plan.id)
      expect((await service.feedbackContext(drawn.id,'recipe:patch-embedding')).context.capabilities).toEqual(recipeFeedback.context.capabilities)
      for(const marker of ['SELECTION_BAD_KEY','SELECTION_BAD_QUOTE','SELECTION_MISSING','SELECTION_INVALID']){const count=prompts.length,failed=service.start({...data,content:marker+' poolneedle pipeline'});await failed.done;expect(failed.status).toBe('failed');expect(service.summary(failed.id).repositoryRecall!.selection!.status).toBe('failed');expect(service.getSelectionEvidence(failed.id).response).toBeTruthy();expect(prompts).toHaveLength(count+1);expect(failed.events.at(-1)!.proposal).toBeUndefined()}
      const empty=service.start({...data,content:'SELECTION_EMPTY poolneedle pipeline'});await empty.done;expect(empty.status,service.summary(empty.id).error).toBe('completed');expect(service.summary(empty.id).repositoryRecall!.catalogue).toEqual([]);expect(service.summary(empty.id).components).toEqual([])
      expect(()=>service.start({...data,librarySearch:false})).toThrow('需要开启')
      const stopped=service.start(data);service.cancel(stopped.id);await stopped.done;expect(stopped.status).toBe('cancelled');expect(service.summary(stopped.id).repositoryRecall!.selection!.status).toBe('cancelled')
    }finally{library.close()}
  })
  it('recalls server library sources, freezes the selected version and reuses plan sources without a new search',async()=>{
    const library=new ComponentLibraryStore(await directory()),asset=buildRecipe('pipeline',{stages:2,direction:'row'});asset.name='Recall pipeline';asset.tags=['poolneedle'];asset.figure.nodes[0]!.label='Stored stage';const stored=library.publish({asset});let recalls=0;const recommend=library.recommend.bind(library);library.recommend=query=>{recalls++;return recommend(query)}
    const adapter=new ClaudeAdapter(options()),prompts:string[]=[],service=new HarnessService(()=>({kind:adapter.kind,status:()=>adapter.status(),dispose:()=>adapter.dispose(),send:turn=>{prompts.push(turn.content);return adapter.send(turn)}}),180_000,library);services.push(service)
    try{
      const session=service.createSession(adapter.kind,'Library recall'),base=createBlank(),first=service.start({sessionId:session.id,content:'LIBRARY_RECALL_TEST poolneedle pipeline',figure:base,selectedIds:[],catalogue:[],librarySearch:true}),report=service.summary(first.id).repositoryRecall!
      expect(report.matches[0]).toMatchObject({snapshotId:stored.record.id,decision:'included'});asset.figure.nodes[0]!.label='Later version';const later=library.publish({asset});library.setState(stored.record.id,{archived:true});await first.done;expect(first.status,service.summary(first.id).error).toBe('completed');const proposal=first.events.at(-1)!.proposal!;expect(proposal.nodes.some(n=>n.label==='Stored stage')).toBe(true);expect(proposal.nodes.some(n=>n.label==='Later version')).toBe(false);expect(service.summary(first.id).components[0]!.componentKey).toBe(`asset:library-${stored.record.id}`);expect(prompts[0]).toContain('本轮本机素材召回记录：');expect(service.history(session.id).turns[0]!.repositoryRecall).toEqual(report)
      const key=`asset:library-${stored.record.id}`,cache=first.feedbackCandidates!.find(row=>row.key===key)!,bytes=await readFile(cache.path);await writeFile(cache.path,'{}');await expect(service.feedbackContext(first.id,key)).rejects.toThrow('指纹不符');await writeFile(cache.path,bytes)
      const packet=await service.feedbackContext(first.id,key);expect(packet.context.asset.figure.nodes.some(n=>n.label==='Stored stage')).toBe(true);expect(packet.context.report).toEqual(report);expect(packet.context.capabilities).toEqual({kind:'asset',fields:[],defaults:{}});const feedback={id:randomUUID(),componentKey:key,rating:'suitable',note:'CLI fixture feedback; not independent labeling',previousId:null},receipt=await service.recordFeedback(first.id,feedback);expect(receipt.duplicate).toBe(false);await expect(service.recordFeedback(first.id,{...feedback,id:randomUUID(),asset:{}})).rejects.toThrow('反馈参数无效');expect((await service.recordFeedback(first.id,feedback)).duplicate).toBe(true)
      const plan=service.start({sessionId:session.id,content:'COMPOSITION_PLAN_TEST poolneedle pipeline',figure:base,selectedIds:[],catalogue:[],librarySearch:true,intent:'plan'});await plan.done;expect(plan.status,service.summary(plan.id).error).toBe('completed');expect(service.summary(plan.id).repositoryRecall!.matches.map(row=>row.snapshotId)).toEqual([later.record.id]);expect(recalls).toBe(2);library.setState(later.record.id,{archived:true});library.close()
      expect(()=>service.start({sessionId:session.id,content:'COMPOSITION_PLAN_DRAW',figure:base,selectedIds:[],catalogue:[],compositionPlanRunId:plan.id,librarySearch:true})).toThrow('仅用于普通绘图')
      const drawn=service.start({sessionId:session.id,content:'COMPOSITION_PLAN_DRAW',figure:base,selectedIds:[],catalogue:[],compositionPlanRunId:plan.id});await drawn.done;expect(drawn.status,service.summary(drawn.id).error).toBe('completed');expect(recalls).toBe(2);expect(service.summary(drawn.id).repositoryRecall).toMatchObject({fromPlanRunId:plan.id});expect(service.summary(drawn.id).review).toBe('pending')
      const inherited=await service.feedbackContext(drawn.id,`asset:library-${later.record.id}`);expect(inherited.context.report.fromPlanRunId).toBe(plan.id);expect(inherited.context.asset.figure.nodes.some(n=>n.label==='Later version')).toBe(true);await service.removeSession(session.id);expect((await service.feedbackContext(first.id,key)).context).toEqual(packet.context);expect((await service.recordFeedback(first.id,{...feedback,id:randomUUID(),rating:'uncertain',previousId:receipt.record.id})).record.previousId).toBe(receipt.record.id)
    }finally{library.close()}
  })
  for(const Adapter of [CodexAdapter,ClaudeAdapter])it(`${Adapter.name}: sends three ordered image byte streams, records scoped explanations and serves immutable input snapshots`,async()=>{
    const service=new HarnessService(()=>new Adapter(options()));services.push(service)
    const session=service.createSession(Adapter===CodexAdapter?'codex':'claude','Multiple references'),figure=createExample()
    figure.references=Array.from({length:3},(_,i)=>{const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(800-i*20,16);bytes.writeUInt32BE(400-i*10,20);return{id:`image-${i}`,title:`Source ${i}`,citation:`Authored protocol ${i}`,fileName:`source-${i}.png`,sha256:String(i+1).repeat(64),pixelWidth:800-i*20,pixelHeight:400-i*10,dataUrl:`data:image/png;base64,${bytes.toString('base64')}`,placement:{x:0,y:0,width:800,height:400}}})
    const referenceInputs=[{id:'image-2',purpose:'layout' as const},{id:'image-0',purpose:'style' as const},{id:'image-1',purpose:'content' as const}],saved=clone(figure),data={sessionId:session.id,content:'MULTI_REFERENCE_TEST MULTI_REF_OMIT_LAST',figure,selectedIds:[],catalogue:[],referenceInputs},run=service.start(data);await run.done
    expect(run.status).toBe('completed');const summary=service.summary(run.id),infos=summary.referenceInputs!,report=summary.referenceUse!,candidate=run.events.at(-1)!.proposal!
    expect(infos.map(r=>r.id)).toEqual(['image-2','image-0','image-1']);expect(infos.map(r=>r.purpose)).toEqual(['layout','style','content']);expect(report.map(r=>r.decision)).toEqual(['use','use','omit']);expect(candidate.referenceUses).toHaveLength(2);expect(figure).toEqual(saved)
    expect(service.history(session.id).turns[0]!.referenceUse).toEqual(report);expect(run.events.at(-1)!.referenceUse).toEqual(report)
    const handle=harnessHttp(service),server=createServer((req,res)=>{void handle(req,res)});servers.push(server);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/harness`
    for(const info of infos){const expected=Buffer.from(saved.references.find(r=>r.id===info.id)!.dataUrl.split(',')[1]!,'base64'),image=await fetch(`${base}/runs/${run.id}/references/${info.index}`);expect(image.status).toBe(200);expect(image.headers.get('content-type')).toBe('image/png');expect(image.headers.get('cache-control')).toBe('no-store');expect(Buffer.from(await image.arrayBuffer())).toEqual(expected);expect(info.inputSha256).toBe(createHash('sha256').update(expected).digest('hex'))}
    figure.references=[];expect(service.referenceImage(run.id,1).bytes).toEqual(Buffer.from(saved.references[2]!.dataUrl.split(',')[1]!,'base64'));expect((await fetch(`${base}/runs/${run.id}/references/4`)).status).toBe(404)
    for(const marker of ['MULTI_REF_MISSING_NOTES','MULTI_REF_BAD_ALIAS']){const bad=service.start({...data,figure:saved,content:marker});await bad.done;expect(bad.status).toBe('failed');expect(bad.events.at(-1)!.proposal).toBeUndefined()}
    expect(service.summary(run.id).review).toBe('pending');expect(service.getRun(run.id).events.at(-1)!.proposal).toEqual(candidate)
    const chartData=parseChartDataset('Model,Latency (ms),Accuracy (%),Accuracy_err\nA,12,76,0.5\nB,12,83,0.6\nC,40,,',{name:'Authored',origin:'example',errorLabel:'Mean ± SE',note:'Authored',dataSource:'Authored'})
    expect(()=>service.start({...data,figure:saved,chartData})).toThrow('数据选图只借鉴')
    const chart=service.start({...data,figure:saved,content:'MULTI_REFERENCE_TEST',chartData,referenceInputs:referenceInputs.map(r=>({...r,purpose:'style' as const}))});await chart.done;expect(chart.status).toBe('completed');expect(chart.events.at(-1)!.chartRecommendation!.referenceUse?.map(r=>r.id)).toEqual(infos.map(r=>r.id));expect(chart.events.at(-1)!.proposal!.containers[0]!.dataChart!.spec.series[0]!.values).toEqual([76,83,null])
    await service.removeSession(session.id);expect((await fetch(`${base}/runs/${run.id}/references/1`)).status).toBe(404)
  })
  it('rejects image submission before calling a text-only adapter',async()=>{
    let calls=0;const service=new HarnessService(()=>({kind:'codex',status:async()=>({kind:'codex',state:'ready',message:'Text only',images:false}),send:async()=>{calls++;return''},dispose:()=>undefined}));services.push(service)
    const session=service.createSession('codex','Text'),data=reconstructionInput(session.id),run=service.start({...data,task:undefined,referenceInputs:[{id:data.figure.references[0]!.id,purpose:'style'}]});await run.done;expect(run.status).toBe('failed');expect(service.summary(run.id).error).toContain('不支持图片');expect(calls).toBe(0)
  })
  it('previews a nonaggregating pivot then compiles explicitly adopted source-bound observations',async()=>{
    const {service,session}=serviceSession('codex','Long table'),figure=reconstructionInput(session.id).figure,chartData=parseChartDataset('Run,Method,Accuracy (%),Dataset\nr2,Ours,82,A\nr1,Baseline,0,A\nr2,Baseline,,A\nr1,Ours,81,A\nr3,Baseline,78,A\nr4,Ours,8.3e1,A\nr4,Baseline,79,A',{name:'Repeated runs',origin:'example',sampleMeaning:'raw-observations',errorLabel:'',note:'Authored samples',dataSource:'Authored'}),saved=clone(chartData),before=clone(figure)
    const input={sessionId:session.id,content:'CHART_PIVOT_TEST CHART_DESIGN_WITH_IMAGE',figure,chartData,referenceId:figure.references[0]!.id,selectedIds:[],catalogue:[]},first=service.start(input);await first.done
    expect(first.status).toBe('completed');expect(service.summary(first.id)).toMatchObject({hasProposal:false,review:'none',chartRecommendation:{compiled:false,recommendation:{status:'prepare'},preparation:{source:chartData,operation:{kind:'pivot',rowColumns:['c0'],groupColumns:['c1'],valueColumn:'c2'}}}})
    const preparation=first.events.at(-1)!.chartRecommendation!.preparation!,prepared=preparedChartDataset(preparation),second=service.start({...input,content:'CHART_PIVOT_READY CHART_DESIGN_WITH_IMAGE',chartData:prepared});await second.done
    expect(second.status).toBe('completed');const proposal=second.events.at(-1)!.proposal!,spec=proposal.containers[0]!.dataChart!.spec
    expect(spec.series).toEqual([{name:'Ours',values:[82,81,null,83]},{name:'Baseline',values:[null,0,78,79]}]);expect(spec.dataPreparation).toEqual({preparation,selection:{xColumn:'c0',series:[{column:'c1'},{column:'c2'}]}})
    expect(service.history(session.id).turns.map(t=>t.chartRecommendation!.recommendation.status)).toEqual(['prepare','ready']);expect(service.history(session.id).turns[1]!.chartRecommendation!.preparation).toEqual(preparation)
    expect(service.summary(second.id).review).toBe('pending');expect(service.getRun(second.id).events.at(-1)!.proposal).toEqual(proposal);expect(chartData).toEqual(saved);expect(figure).toEqual(before)
  })
  it('selects a chart from imported data and an image, retaining analysis-only and rejected attempts',async()=>{
    const {service,session}=serviceSession('claude','Chart design')
    const figure=reconstructionInput(session.id).figure,original=clone(figure),chartData=parseChartDataset('Model,Latency (ms),Accuracy (%),Accuracy_err,Memory (GB)\nA,12,76,0.5,3\nB,12,83,0.6,4\nC,40,,,5',{name:'Evaluation',origin:'example',errorLabel:'Mean ± SE',note:'Fixed annotation',dataSource:'Authored test'}),saved=clone(chartData)
    const data={sessionId:session.id,content:'CHART_DESIGN_WITH_IMAGE',figure,selectedIds:[],catalogue:[],chartData,referenceId:figure.references[0]!.id},run=service.start(data);await run.done
    expect(run.status).toBe('completed');const proposal=run.events.at(-1)!.proposal!,report=run.events.at(-1)!.chartRecommendation!
    expect(proposal.containers[0]!.dataChart!.spec).toMatchObject({kind:'scatter',x:[12,12,40],series:[{name:'Accuracy (%)',values:[76,83,null],errors:[.5,.6,null]}],origin:'example',note:'Fixed annotation'})
    expect(report).toMatchObject({compiled:true,referenceUse:[{id:figure.references[0]!.id}],mapping:{x:'Latency (ms)',labels:'Model',unusedColumns:['Memory (GB)']}});expect(service.history(session.id).turns[0]!.chartRecommendation).toEqual(report)
    expect(service.summary(run.id)).toMatchObject({review:'pending',chartData:{rows:3,columns:5,origin:'example'}});expect(figure).toEqual(original);expect(chartData).toEqual(saved)
    const analysis=service.start({...data,content:'CHART_DESIGN_NEEDS_INPUT'});await analysis.done;expect(analysis.status).toBe('completed');expect(analysis.events.at(-1)!.proposal).toBeUndefined();expect(service.summary(analysis.id)).toMatchObject({hasProposal:false,review:'none',chartRecommendation:{compiled:false,recommendation:{status:'needs-input',suggestedKind:'箱线图'}}})
    // One rejected chart response checks service error propagation; parser boundaries live in core tests.
    const rejected=service.start({...data,content:'CHART_DESIGN_INJECT_DATA'});await rejected.done;expect(rejected.status).toBe('failed');expect(rejected.events.at(-1)!.proposal).toBeUndefined()
    expect(service.summary(run.id).review).toBe('pending');expect(service.getRun(run.id).events.at(-1)!.proposal).toEqual(proposal)
  })
  it('refines an unapplied candidate with an immutable canvas baseline and retains a no-op checkpoint',async()=>{
    const {service,session}=serviceSession('codex','Candidate checkpoints')
    const data=reconstructionInput(session.id),original=clone(data.figure),first=service.start(data);await first.done
    const candidate=clone(first.events.at(-1)!.proposal!),task:ReconstructionTask={kind:'repair',containerId:'stage',regionId:'left'}
    const second=service.start({...data,figure:candidate,task,refineFromRunId:first.id,inputImage:cropInput(candidate,task,1200,1100),timeoutSeconds:60});await second.done
    expect(second.status).toBe('completed');expect(second.baseFigure).toEqual(candidate);expect(second.canvasBaseline).toEqual(original)
    const repaired=second.events.at(-1)!.proposal!
    expect(repaired.nodes.find(n=>n.reconstruction?.objectId==='label')!.label).toBe('Encoder corrected');expect(repaired.nodes.find(n=>n.reconstruction?.objectId==='output')).toEqual(candidate.nodes.find(n=>n.reconstruction?.objectId==='output'))
    expect(service.summary(second.id)).toMatchObject({review:'pending',refinement:{parentRunId:first.id,rootRunId:first.id,round:1},timeoutSeconds:60})
    expect(service.getRun(first.id).events.at(-1)!.proposal).toEqual(candidate);expect(service.summary(first.id).review).toBe('pending');expect(data.figure).toEqual(original)
    // A real HTTP round trip omits optional undefined fields in the repair result.
    const third=service.start({...data,content:'RECONSTRUCTION_NO_CHANGE',figure:JSON.parse(JSON.stringify(repaired)),task,refineFromRunId:second.id});await third.done
    expect(third.status).toBe('completed');expect(third.events.at(-1)!.proposal).toEqual(repaired);expect(third.canvasBaseline).toEqual(original);expect(third.baseFigure).toEqual(repaired)
    expect(service.summary(third.id).refinement).toEqual({parentRunId:second.id,rootRunId:first.id,round:2})
    service.review(third.id,'discarded');expect(service.summary(second.id).review).toBe('pending')
    // A sibling starts at the selected older checkpoint, never the discarded child.
    const sibling=service.start({...data,content:'RECONSTRUCTION_NO_CHANGE',figure:candidate,task,refineFromRunId:first.id});await sibling.done
    expect(sibling.events.at(-1)!.proposal).toEqual(candidate);expect(sibling.canvasBaseline).toEqual(original);expect(service.summary(sibling.id).refinement?.round).toBe(1)
    const handle=harnessHttp(service),server=createServer((req,res)=>{void handle(req,res)});servers.push(server);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
    const response=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/api/harness/runs/${second.id}`),snapshot=await response.json()
    expect(snapshot.baseFigure).toEqual(candidate);expect(snapshot.canvasBaseline).toEqual(original);expect(snapshot.summary.refinement.rootRunId).toBe(first.id)
  })
  it('rejects foreign, modified, handled and unscoped parent candidates before starting another CLI call',async()=>{
    let calls=0;const adapter=new CodexAdapter(options()),service=new HarnessService(()=>({kind:'codex',status:()=>adapter.status(),dispose:()=>adapter.dispose(),send:turn=>{calls++;return adapter.send(turn)}}));services.push(service)
    const session=service.createSession('codex','Validation'),data=reconstructionInput(session.id),first=service.start(data);await first.done
    const candidate=clone(first.events.at(-1)!.proposal!),task:ReconstructionTask={kind:'repair',containerId:'stage',regionId:'left'},branch={...data,figure:candidate,task,refineFromRunId:first.id},other=service.createSession('codex','Other')
    expect(()=>service.start({...branch,sessionId:other.id})).toThrow('当前会话')
    const modified=clone(candidate);modified.title='Forged snapshot';expect(()=>service.start({...branch,figure:modified})).toThrow('快照不匹配')
    const reordered=clone(candidate);reordered.nodes.reverse();expect(()=>service.start({...branch,figure:reordered})).toThrow('快照不匹配')
    expect(()=>service.start({...branch,task:data.task})).toThrow('请求无效')
    expect(()=>service.start({...branch,task:{...task,containerId:'missing'}})).toThrow('重建分组')
    expect(()=>service.start({...branch,task:{...task,regionId:'missing'}})).toThrow('分区已变化')
    service.review(first.id,'discarded');expect(()=>service.start(branch)).toThrow('尚未应用或丢弃')
    expect(calls).toBe(1);expect(service.history(session.id).turns).toHaveLength(1);expect(service.history(other.id).turns).toHaveLength(0)
  })
  it('keeps the parent checkpoint after a failed or cancelled refinement without publishing partial candidates',async()=>{
    const service=new HarnessService(()=>new CodexAdapter(options('slow')));services.push(service)
    const session=service.createSession('codex','Failure checkpoints'),data=reconstructionInput(session.id),first=service.start(data);await first.done
    const candidate=clone(first.events.at(-1)!.proposal!),branch={...data,figure:candidate,task:{kind:'repair' as const,containerId:'stage',regionId:'left'},refineFromRunId:first.id}
    const failed=service.start({...branch,content:'RECONSTRUCTION_BAD_PATCH'});await failed.done;expect(failed.status).toBe('failed');expect(failed.events.at(-1)!.proposal).toBeUndefined()
    const cancelled=service.start(branch);service.cancel(cancelled.id);await cancelled.done;expect(cancelled.status).toBe('cancelled');expect(cancelled.events.at(-1)!.proposal).toBeUndefined()
    expect(service.summary(first.id).review).toBe('pending');expect(service.getRun(first.id).events.at(-1)!.proposal).toEqual(candidate)
    const resumed=service.start({...branch,content:'RECONSTRUCTION_NO_CHANGE'});await resumed.done;expect(resumed.events.at(-1)!.proposal).toEqual(candidate);expect(service.summary(resumed.id).refinement?.round).toBe(1)
  })
  it('uses each accepted run time budget and records it instead of silently retaining the service default',async()=>{
    const service=new HarnessService(()=>({kind:'codex',status:async()=>({kind:'codex',state:'ready',images:true,message:'Test only'}),dispose:()=>undefined,send:turn=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>resolve('{"message":"Done","figure":null}'),120);turn.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(turn.signal.reason)},{once:true})})}),40);services.push(service)
    const session=service.createSession('codex','Budgets'),first=service.start(input(session.id));await first.done;expect(first.status).toBe('failed')
    const longer=service.start({...input(session.id),timeoutSeconds:30});await longer.done;expect(longer.status).toBe('completed');expect(service.summary(longer.id).timeoutSeconds).toBe(30)
    for(const timeoutSeconds of [0,29,601,1.5])expect(()=>service.start({...input(session.id),timeoutSeconds})).toThrow('请求无效')
  })
  it('coalesces tiny token deltas without dropping text, hitting the event cap, or emitting after a terminal event',async()=>{
    const figure=createExample();figure.nodes[0]!.label='Coalesced output'
    const text=JSON.stringify({message:'🙂'.repeat(2000),figure})
    expect(text.length).toBeGreaterThan(5000)
    const service=new HarnessService(()=>({kind:'codex',status:async()=>({kind:'codex',state:'ready',images:true,message:'Test only'}),send:async turn=>{for(const token of text)turn.emit('assistant.delta',token);return text},dispose:()=>undefined}));services.push(service)
    const run=service.start(input(service.createSession('codex','Tiny deltas').id));await run.done
    expect(run.status).toBe('completed');expect(run.events.filter(e=>e.type==='assistant.delta').map(e=>e.text).join('')).toBe(text);expect(run.events.length).toBeLessThan(100);expect(run.events.at(-1)!.type).toBe('run.completed')
    await new Promise(resolve=>setTimeout(resolve,120));expect(run.events.at(-1)!.type).toBe('run.completed')
  })
  it('flushes already received partial text before cancellation without publishing a proposal',async()=>{
    let ready:()=>void=()=>undefined;const received=new Promise<void>(resolve=>{ready=resolve}),partial='{"message":"partial output'
    const service=new HarnessService(()=>({kind:'codex',status:async()=>({kind:'codex',state:'ready',images:true,message:'Test only'}),send:turn=>new Promise((_resolve,reject)=>{turn.emit('assistant.delta',partial);turn.signal.addEventListener('abort',()=>reject(turn.signal.reason),{once:true});ready()}),dispose:()=>undefined}));services.push(service)
    const run=service.start(input(service.createSession('codex','Cancel buffer').id));await received;service.cancel(run.id);await run.done
    expect(run.status).toBe('cancelled');expect(run.events.filter(e=>e.type==='assistant.delta').map(e=>e.text).join('')).toBe(partial);expect(run.events.at(-1)!.type).toBe('run.cancelled');expect(run.events.some(e=>e.proposal)).toBe(false)
  })
  it('sends actual crop payloads and stores image metadata without copying bytes into history',async()=>{
    const adapter=new ClaudeAdapter(options()),images:string[]=[],prompts:string[]=[]
    const service=new HarnessService(()=>({kind:adapter.kind,status:()=>adapter.status(),dispose:()=>adapter.dispose(),send:async turn=>{images.push(turn.images![0]!.dataUrl);prompts.push(turn.content);return adapter.send(turn)}}));services.push(service)
    const session=service.createSession(adapter.kind,'Crop transport'),data=reconstructionInput(session.id),image=cropInput(data.figure,data.task),first=service.start({...data,inputImage:image});await first.done
    expect(first.status).toBe('completed');const candidate=first.events.at(-1)!.proposal!
    expect(images[0]).toBe(image.dataUrl);expect(prompts[0]).not.toContain('base64');expect(sceneForReconstruction(candidate,'stage').nodes.find(n=>n.id==='frame')).toMatchObject({x:40,y:70,w:280,h:220})
    const handle=harnessHttp(service),server=createServer((req,res)=>{void handle(req,res)});servers.push(server);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/harness`
    const attached=await fetch(`${base}/runs/${first.id}/input-image`);expect(attached.status).toBe(200);expect(attached.headers.get('Content-Type')).toBe('image/png');expect(attached.headers.get('Cache-Control')).toBe('no-store');expect(Buffer.from(await attached.arrayBuffer())).toEqual(Buffer.from(image.dataUrl.split(',')[1]!,'base64'))
    expect(service.history(session.id).turns[0]!.inputImage).toMatchObject({width:1600,height:800,quality:'original'});expect(service.history(session.id).turns[0]!.inputImage).not.toHaveProperty('dataUrl')
    const task:ReconstructionTask={kind:'repair',containerId:'stage',regionId:'left'},repairImage=cropInput(candidate,task,1200,1100),second=service.start({...data,figure:candidate,task,inputImage:repairImage});await second.done
    expect(second.status).toBe('completed');const repaired=second.events.at(-1)!.proposal!
    expect(images[1]).toBe(repairImage.dataUrl);expect(repaired.nodes.find(n=>n.reconstruction?.objectId==='label')!.label).toBe('Encoder corrected');expect(repaired.nodes[3]).toEqual(candidate.nodes[3]);expect(repaired.containers[0]!.reconstruction!.revision).toBe(1)
    await service.removeSession(session.id);expect((await fetch(`${base}/runs/${first.id}/input-image`)).status).toBe(404)
  })
  it('finds reconstruction materials, freezes selection and crop through adoption and persists source-visible feedback',async()=>{
    const path=await directory(),library=new ComponentLibraryStore(path),asset=buildRecipe('tensor-stack',componentRecipes.find(recipe=>recipe.id==='tensor-stack')!.defaults);asset.name='Frozen lookup tensor';asset.tags.push('tensor-stack');const stored=library.publish({asset})
    let release!:()=>void,ready!:()=>void,gated=true;const gate=new Promise<void>(resolve=>release=resolve),selectionStarted=new Promise<void>(resolve=>ready=resolve),received:{content:string;image:string}[]=[]
    const service=new HarnessService(kind=>{const adapter=new ClaudeAdapter(options());return{kind,status:()=>adapter.status(),dispose:()=>adapter.dispose(),send:async turn=>{if(turn.content.includes('实际检索裁片指纹：')){const line=turn.content.split('\n').find(line=>line.startsWith('实际筛选图谱目录：'));expect(turn.images).toHaveLength(1+(line?JSON.parse(line.slice('实际筛选图谱目录：'.length)).length:0));received.push({content:turn.content,image:turn.images![0]!.dataUrl})}if(gated&&turn.content.startsWith('你是 FastFigure 的素材筛选助手')){gated=false;ready();await gate}return adapter.send(turn)}}},180_000,library);services.push(service)
    try{
      const session=service.createSession('claude','Look-up source'),data=reconstructionInput(session.id),image=cropInput(data.figure,data.task),before=clone(data.figure),request={...data,content:'IMAGE_COMPONENT_LOOKUP_TEST LOOKUP_SAVED：为此裁片寻找可编辑 tensor-stack 素材，不代替作者核对。'.padEnd(12_000,'x'),catalogue:[],inputImage:image,intent:'find-components' as const},lookup=service.start(request)
      const rendering=await pendingSelectionPreviews(service,lookup)
      await expect(service.submitSelectionPreviews(lookup.id,{...rendering.payload,sessionId:randomUUID()})).rejects.toThrow('会话')
      const forged=clone(rendering.previews);forged[0]!.snapshotSha256='f'.repeat(64);await expect(service.submitSelectionPreviews(lookup.id,{...rendering.payload,previews:forged})).rejects.toThrow('素材指纹')
      await expect(service.submitSelectionPreviews(lookup.id,{...rendering.payload,previews:[]})).rejects.toThrow('提交无效')
      await service.submitSelectionPreviews(lookup.id,rendering.payload);await service.submitSelectionPreviews(lookup.id,rendering.payload)
      const conflicting=clone(rendering.previews);conflicting[0]!.fonts=['different'];await expect(service.submitSelectionPreviews(lookup.id,{...rendering.payload,previews:conflicting})).rejects.toThrow('另一份')
      expect(createHash('sha256').update(service.getSelectionPreviewImage(lookup.id,1).bytes).digest('hex')).toBe(rendering.previews[0]!.sha256)
      await Promise.race([selectionStarted,lookup.done!.then(()=>{throw new Error(service.summary(lookup.id).error||'Selection did not start')})]);asset.figure.nodes.find(n=>n.label)!.label='Changed after candidate freeze';library.publish({asset});library.setState(stored.record.id,{archived:true});release();await lookup.done
      expect(lookup.status,service.summary(lookup.id).error).toBe('completed');expect(lookup.events.at(-1)!.proposal).toBeUndefined();expect(service.summary(lookup.id)).toMatchObject({hasProposal:false,review:'none',intent:'find-components'})
      const packet=service.getComponentSearch(lookup.id),report=service.summary(lookup.id).repositoryRecall!
      expect(report.query).toBe(request.content);expect(report.visualQuery!.searchQuery).not.toContain('invisible-secret-algorithm');expect(received).toHaveLength(2);expect(received.every(row=>row.image===image.dataUrl)).toBe(true)
      expect(packet.catalogue).toHaveLength(1);expect(packet.catalogue[0]!.kind).toBe('asset');expect(JSON.stringify(packet.catalogue)).not.toContain('Changed after candidate freeze');expect(service.getImageQueryEvidence(lookup.id).responseSha256).toBe(report.visualQuery!.responseSha256)
      const base={...data,content:'RECONSTRUCTION_REUSE_TEST',catalogue:[],componentSearchRunId:lookup.id,inputImage:packet.inputImage,cataloguePreview:previewFixture(packet.catalogue)}
      const changed=clone(data.figure);changed.title='Changed baseline';expect(()=>service.start({...base,figure:changed})).toThrow('已变化');expect(()=>service.start({...base,inputImage:{...image,dataUrl:image.dataUrl+'AAAA'}})).toThrow('沿用检索');expect(()=>service.start({...base,sessionId:service.createSession(session.kind,'Other').id})).toThrow('当前会话')
      const child=service.start(base);await child.done;expect(child.status,service.summary(child.id).error).toBe('completed');expect(child.events.at(-1)!.proposal!.containers.some(c=>c.reconstructionReuse?.assetName==='Frozen lookup tensor'||c.component?.name==='Frozen lookup tensor')).toBe(true);expect(service.summary(child.id).repositoryRecall!.fromSearchRunId).toBe(lookup.id);expect(received).toHaveLength(2)
      const failed=service.start({...request,content:'IMAGE_LOOKUP_BAD_ANALYSIS'});await failed.done;expect(failed.status).toBe('failed');expect(failed.events.some(event=>event.proposal)).toBe(false);expect(()=>service.getComponentSearch(failed.id)).toThrow('已完成')
      const empty=service.start({...request,content:'IMAGE_COMPONENT_LOOKUP_TEST SELECTION_EMPTY'});const emptyRendering=await pendingSelectionPreviews(service,empty);await service.submitSelectionPreviews(empty.id,emptyRendering.payload);await empty.done;expect(empty.status).toBe('completed');expect(service.summary(empty.id).repositoryRecall!.catalogue).toEqual([]);expect(()=>service.getComponentSearch(empty.id)).toThrow('匹配素材')
      const key=report.catalogue[0]!.key,context=await service.feedbackContext(lookup.id,key);expect(context.context.referenceImage!.dataUrl).toBe(image.dataUrl)
      const receipt=await service.recordFeedback(lookup.id,{id:randomUUID(),componentKey:key,rating:'uncertain',note:'Development protocol judgment, not independent human evidence',previousId:null});await service.removeSession(session.id);library.close()
      const reopened=new ComponentLibraryStore(path);try{const saved=await verifyFeedbackCase(reopened.readFeedbackCase(receipt.record.caseId));expect(saved.context.referenceImage!.dataUrl).toBe(image.dataUrl);const forged=clone(saved.context);forged.referenceImage!.dataUrl=image.dataUrl+'AAAA';expect(()=>reopened.recordFeedback(forged,{id:randomUUID(),componentKey:key,rating:'suitable',note:'Tampered image',previousId:receipt.record.id})).toThrow('冻结内容')}finally{reopened.close()}
      expect(data.figure).toEqual(before)
    }finally{release();library.close()}
  })
  it.each(['cancel','render-error'] as const)('stops a pending candidate render on %s without sending the selector or producing a candidate',async mode=>{
    const path=await directory(),library=new ComponentLibraryStore(path);let calls=0
    const service=new HarnessService(kind=>({kind,status:async()=>({kind,state:'ready',images:true,message:'Controlled lifecycle',version:'stub'}),dispose(){},send:async()=>{calls++;if(calls>1)throw new Error('Selector must not run');return JSON.stringify({summary:'Layered geometry',terms:[{term:'tensor-stack',basis:'Visible offset planes',certainty:'visible'}],cautions:[]})}}),180000,library);services.push(service)
    try{const session=service.createSession('codex','Pending renderer'),data=reconstructionInput(session.id),run=service.start({...data,intent:'find-components',catalogue:[],inputImage:cropInput(data.figure,data.task)}),render=await pendingSelectionPreviews(service,run)
      if(mode==='cancel')service.cancel(run.id)
      else await service.submitSelectionPreviews(run.id,{sessionId:session.id,requestId:render.packet.requestId,error:'Controlled raster failure'})
      await run.done;expect(run.status).toBe(mode==='cancel'?'cancelled':'failed');expect(calls).toBe(1);expect(run.events.some(event=>event.proposal)).toBe(false);expect(service.summary(run.id).repositoryRecall!.selection!.previews!.status).toBe(mode==='cancel'?'cancelled':'failed');expect(()=>service.getComponentSearch(run.id)).toThrow('已完成')
    }finally{library.close()}
  })
  it('reuses frozen native components, publishes reviewable source matches and rejects invented keys',async()=>{
    const adapter=new CodexAdapter(options()),service=new HarnessService(()=>adapter);services.push(service)
    const session=service.createSession(adapter.kind,'Hybrid reconstruction'),data=reconstructionInput(session.id),asset=buildRecipe('mlp',{inputs:2,hiddenLayers:1,hidden:3,outputs:1}),saved=clone(asset),catalogue:CatalogueEntry[]=[{kind:'asset',asset}],cataloguePreview=previewFixture(catalogue),first=service.start({...data,content:'RECONSTRUCTION_REUSE_TEST',catalogue,cataloguePreview})
    asset.name='Changed after send';await first.done;expect(first.status).toBe('completed')
    const event=first.events.at(-1)!,candidate=event.proposal!,match=candidate.containers.find(c=>c.reconstructionReuse)!
    expect(event.components).toHaveLength(1);expect(match.component!.name).toBe(saved.name);expect(match.reconstructionReuse!.differences).toHaveLength(1);expect(service.summary(first.id).review).toBe('pending');expect(candidate.edges).toHaveLength(saved.figure.edges.length)
    expect(service.getCatalogueImage(first.id).bytes).toEqual(Buffer.from(cataloguePreview.dataUrl.split(',')[1]!,'base64'));expect(service.summary(first.id).cataloguePreview!.sha256).toBe(cataloguePreview.sha256);expect(service.summary(first.id).cataloguePreview).not.toHaveProperty('dataUrl')
    const moved=clone(saved);moved.figure.nodes[0]!.x+=1
    expect(()=>service.start({...data,catalogue:[{kind:'asset',asset:saved}],cataloguePreview:{...cataloguePreview,sha256:'0'.repeat(64)}})).toThrow('字节指纹');expect(()=>service.start({...data,catalogue:[{kind:'asset',asset:moved}],cataloguePreview})).toThrow('快照已变化');expect(()=>service.start({...data,catalogue:[{kind:'asset',asset:saved}]})).toThrow('实际组件图谱')
    const invalid=service.start({...data,content:'RECONSTRUCTION_REUSE_TEST RECONSTRUCTION_REUSE_BAD_KEY',catalogue:[{kind:'asset',asset:saved}],cataloguePreview});await invalid.done;expect(invalid.status).toBe('failed');expect(service.summary(invalid.id).error).toContain('本轮组件清单');expect(first.events.at(-1)!.proposal).toEqual(candidate)
  })
  it('reconstructs attached references and repairs scoped native candidates through the CLI bridge',async()=>{
    const adapter=new CodexAdapter(options()),received:{content:string;image?:string}[]=[]
    const service=new HarnessService(()=>({kind:adapter.kind,status:()=>adapter.status(),dispose:()=>adapter.dispose(),send:async turn=>{received.push({content:turn.content,image:turn.images?.[0]?.dataUrl});expect(await readFile(turn.images![0]!.path)).toEqual(Buffer.from(turn.images![0]!.dataUrl.split(',')[1]!,'base64'));return adapter.send(turn)}}));services.push(service)
    const session=service.createSession(adapter.kind,'Reconstruction'),data=reconstructionInput(session.id),before=clone(data.figure),first=service.start(data);await first.done
    expect(first.status).toBe('completed');expect(data.figure).toEqual(before)
    const candidate=clone(first.events.at(-1)!.proposal!)
    expect(candidate.nodes.map(n=>n.kind)).toEqual(['rectangle','text','path','ellipse','path'])
    expect(candidate.containers[0]!.reconstruction).toMatchObject({referenceSha256:'a'.repeat(64),sourceWidth:800,sourceHeight:400,revision:0})
    expect(received[0]!.image).toBe(before.references[0]!.dataUrl);expect(received[0]!.content).toContain('canvas 必须是 800×400')
    expect(service.summary(first.id)).toMatchObject({task:data.task,hasProposal:true,review:'pending'});service.review(first.id,'applied')
    const frame=candidate.nodes[0]!
    candidate.nodes.splice(2,0,{id:'manual-note',parentId:'stage',kind:'rectangle',label:'Manual annotation',x:frame.x+20,y:frame.y+50,width:45,height:20})
    const task:ReconstructionTask={kind:'repair',containerId:'stage',regionId:'left'},saved=clone(candidate),second=service.start({...data,figure:candidate,task});await second.done
    expect(second.status).toBe('completed');const repaired=second.events.at(-1)!.proposal!
    expect(repaired.nodes.find(n=>n.reconstruction?.objectId==='label')).toMatchObject({label:'Encoder corrected',reconstruction:{version:1}})
    expect(repaired.nodes.find(n=>n.id==='manual-note')).toEqual(saved.nodes.find(n=>n.id==='manual-note'))
    expect(repaired.nodes.find(n=>n.reconstruction?.objectId==='output')).toEqual(saved.nodes.find(n=>n.reconstruction?.objectId==='output'))
    expect(repaired.containers[0]!.reconstruction!.revision).toBe(1);expect(candidate).toEqual(saved)
    const context=repairContext(saved,task)
    expect(received[1]!.content).toContain(`分区目录：${JSON.stringify(context.catalog)}`);expect(received[1]!.image).toBe(received[0]!.image)
    expect(service.history(session.id).turns.map(t=>t.task)).toEqual([data.task,task])
    const rejected=service.start({...data,content:'RECONSTRUCTION_BAD_PATCH',figure:repaired,task});await rejected.done
    expect(rejected.status).toBe('failed');expect(rejected.events.at(-1)?.text).toContain('ownership');expect(rejected.events.some(e=>e.proposal)).toBe(false)
    expect(rejected.events.filter(e=>e.type==='run.failed')).toHaveLength(1)
  })
  it('rejects invalid reconstruction scopes over HTTP before starting a run or sending an image',async()=>{
    let calls=0
    const service=new HarnessService(()=>({kind:'codex',status:async()=>({kind:'codex',state:'ready',images:true,message:'Test only'}),dispose:()=>undefined,send:async()=>{calls++;return '{}'}}));services.push(service)
    const handle=harnessHttp(service),server=createServer((req,res)=>{void handle(req,res)});servers.push(server)
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/harness`
    const session=service.createSession('codex','Invalid scopes'),data=reconstructionInput(session.id),task=data.task
    const invalid=[{...task,referenceId:'missing'},{...task,region:{x:0,y:0,width:.001,height:1}},{...task,destination:'current',parentId:'missing'},{kind:'repair',containerId:'stage',regionId:'missing'},{...task,region:{x:.9,y:0,width:.5,height:1}}]
    for(const scope of invalid){const response=await fetch(`${base}/runs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,task:scope})});expect(response.status).toBe(400)}
    const image=cropInput(data.figure,data.task)
    for(const inputImage of [{...image,referenceSha256:'b'.repeat(64)},{...image,sourceRect:{...image.sourceRect,x:1}},{...image,width:1200},{...image,dataUrl:'data:image/png;base64,aGVsbG8='}]){const response=await fetch(`${base}/runs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,inputImage})});expect(response.status).toBe(400)}
    expect(calls).toBe(0);expect(service.history(session.id).turns).toHaveLength(0)
  })
  it('retains ordered bounded transcripts independently of heavy run snapshots and protects each session latest run', async () => {
    const service = new HarnessService(() => ({ kind: 'codex', status: async () => ({ kind: 'codex', state: 'ready', images: true, message: 'Test only' }), send: async () => '{"message":"Explain only","figure":null}', dispose: () => undefined })); services.push(service)
    const a = service.createSession('codex', 'A'), b = service.createSession('codex', 'B')
    const protectedRun = service.start(input(a.id)); await protectedRun.done
    const ids: string[] = []
    for (let i = 0; i < 55; i++) { const run = service.start({ ...input(b.id), content: `Round ${i}`, model: 'test-only' }); ids.push(run.id); await run.done }
    const history = service.history(b.id)
    expect(history.omitted).toBe(5); expect(history.turns).toHaveLength(50)
    expect(history.turns[0]?.content).toBe('Round 5'); expect(history.turns.at(-1)?.content).toBe('Round 54')
    expect(history.turns.filter(t => t.available)).toHaveLength(19)
    expect(history.turns.every(t => t.status === 'completed' && t.review === 'none' && t.model === 'test-only')).toBe(true)
    expect(JSON.stringify(history)).not.toContain('baseFigure'); expect(JSON.stringify(history)).not.toContain('assistant.delta')
    expect(() => service.getRun(ids[0]!)).toThrow('已从')
    expect(service.getRun(protectedRun.id).status).toBe('completed')
    expect(service.history(a.id).turns[0]?.available).toBe(true)
    expect(() => service.history('missing')).toThrow('会话不存在')
    await service.removeSession(b.id); expect(() => service.history(b.id)).toThrow('会话不存在')
  })
  it('records candidate review decisions once, rejects conflicting decisions and never revives handled proposals on replay', async () => {
    const service = new HarnessService(() => new CodexAdapter(options())); services.push(service)
    const session = service.createSession('codex', 'Review'), run = service.start(input(session.id))
    expect(() => service.review(run.id, 'applied')).toThrow('没有可审阅')
    await run.done
    expect(service.summary(run.id)).toMatchObject({ status: 'completed', hasProposal: true, review: 'pending' })
    expect(service.review(run.id, 'applied').review).toBe('applied')
    expect(service.review(run.id, 'applied').review).toBe('applied')
    expect(() => service.review(run.id, 'discarded')).toThrow('已处理')
    expect(service.history(session.id).turns[0]?.review).toBe('applied')
    expect(run.events.at(-1)?.proposal).toBeDefined()
    const unchanged = clone(run.events.at(-1)!.proposal!)
    const next = service.start({ ...input(session.id), figure: unchanged }); await next.done
    expect(service.summary(next.id)).toMatchObject({ hasProposal: false, review: 'none' })
    expect(next.events.at(-1)?.proposal).toBeUndefined()
    expect(() => service.review(next.id, 'applied')).toThrow('没有可审阅')
  })
  it('accepts a review of an already loaded candidate even if its heavy snapshot is evicted before the decision arrives', async () => {
    const candidate = createExample(); candidate.nodes[0]!.label = 'Proposed'
    const service = new HarnessService(() => ({ kind: 'codex', status: async () => ({ kind: 'codex', state: 'ready', images: true, message: 'Test only' }), send: async () => JSON.stringify({ message: 'Proposed', figure: candidate }), dispose: () => undefined })); services.push(service)
    const session = service.createSession('codex', 'Late review'), first = service.start(input(session.id)); await first.done
    for (let i = 0; i < 22; i++) { const next = service.start(input(session.id)); await next.done }
    expect(() => service.getRun(first.id)).toThrow('已从')
    const handle = harnessHttp(service), server = createServer((req, res) => { void handle(req, res) }); servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as { port: number }).port, base = `http://127.0.0.1:${port}/api/harness`
    expect((await fetch(`${base}/runs/${first.id}`)).status).toBe(404)
    const response = await fetch(`${base}/runs/${first.id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"decision":"applied"}' })
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ available: false, review: 'applied' })
    expect(service.history(session.id).turns[0]?.review).toBe('applied')
    expect(() => service.review(first.id, 'discarded')).toThrow('已处理')
  })
  it('expands catalogue instances through the run service and publishes verified component use with the proposal', async () => {
    const service = new HarnessService(() => new CodexAdapter(options())); services.push(service)
    const asset = buildRecipe('pipeline', { stages: 2, direction: 'row' }); asset.id = 'test-personal'
    asset.sources = [{ title: 'Protocol fixture', reference: 'Acceptance figure A' }]
    const request = { ...input(service.createSession('codex', 'compose').id), figure: createBlank(), content: 'COMPOSE_COMPONENTS_TEST', catalogue: [{ kind: 'asset', asset }, { kind: 'recipe', id: 'fusion' }] }
    const run = service.start(request); await run.done
    expect(run.status).toBe('completed')
    const event = run.events.at(-1)!
    expect(event.components?.map(c => c.componentKey)).toEqual(['asset:test-personal', 'recipe:fusion'])
    expect(event.proposal?.nodes).toHaveLength(6)
    expect(event.proposal?.containers.find(c => c.id === 'personal-stage')?.component?.sources).toEqual(asset.sources)
    expect(event.proposal?.edges.find(e => e.id === 'composed-bridge')?.source).not.toBe('step-1')
    expect(request.figure.nodes).toEqual([])
  })
  it('validates model graphs before publishing a proposal and keeps the caller document unchanged', async () => {
    const service = new HarnessService(kind => kind === 'codex' ? new CodexAdapter(options()) : new ClaudeAdapter(options())); services.push(service)
    const session = service.createSession('codex', 'graph'), request = input(session.id), before = clone(request.figure)
    const run = service.start(request); await run.done
    expect(run.status).toBe('completed'); expect(run.events.at(-1)?.proposal?.nodes[0]?.label).toBe('Harness edited input')
    expect(request.figure).toEqual(before)
    expect(service.listSessions()[0]?.lastRunId).toBe(run.id)
  })
  for (const scenario of ['invalid','bad-geometry']) it(`fails closed on ${scenario} model output`, async () => {
    const service = new HarnessService(() => new CodexAdapter(options(scenario))); services.push(service)
    const run = service.start(input(service.createSession('codex', scenario).id)); await run.done
    expect(run.status).toBe('failed'); expect(run.events.at(-1)?.type).toBe('run.failed')
    expect(run.events.some(e => e.proposal)).toBe(false)
  })
  it('enforces session/global concurrency, cancellation, limits and timeout with one terminal event', async () => {
    const service = new HarnessService(() => new ClaudeAdapter(options('stall')), 100); services.push(service)
    const a = service.createSession('claude', 'a'), b = service.createSession('claude', 'b'), c = service.createSession('claude', 'c')
    const first = service.start(input(a.id)), second = service.start(input(b.id))
    expect(() => service.start(input(a.id))).toThrow('已有运行')
    expect(() => service.start(input(c.id))).toThrow('2 个运行')
    await expect(service.removeSession(a.id)).rejects.toThrow('停止')
    service.cancel(first.id); await first.done; await second.done
    expect(first.status).toBe('cancelled'); expect(second.status).toBe('failed')
    for (const run of [first, second]) expect(run.events.filter(e => ['run.completed','run.failed','run.cancelled'].includes(e.type))).toHaveLength(1)
    await service.removeSession(a.id)
    expect(() => service.getRun(first.id)).toThrow('不存在')
    for (let i = 0; i < 10; i++) service.createSession('claude', `${i}`)
    expect(() => service.createSession('claude', 'overflow')).toThrow('12 个会话')
  })
  it('transports recipe updates and no-op reports without publishing unreviewed edits',async()=>{
    const {service,session}=serviceSession('codex','Recipe updates'),placed=instantiateComponent(createBlank(),scaleComponent(buildRecipe('tensor-stack',{layers:5,rows:4,columns:5,spacing:'normal',tilt:'steep',note:'show'}),.6),'stage'),figure=placed.document,before=clone(figure),request={sessionId:session.id,content:'RECIPE_UPDATES_TEST',figure,selectedIds:[placed.containerId],catalogue:[],intent:'edit-recipes'},run=service.start(request)
    await run.done;expect(run.status).toBe('completed');const event=run.events.at(-1)!,report=event.recipeUpdates![0]!
    expect(event.proposal!.containers.find(c=>c.id===placed.containerId)!.parametric!.recipe.parameters).toMatchObject({layers:7,rows:5});expect(report).toMatchObject({containerId:placed.containerId,before:{layers:5,rows:4},after:{layers:7,rows:5},beforeRevision:0,afterRevision:1,layout:'frame',keepEdits:true,changed:true});expect(service.summary(run.id).review).toBe('pending');expect(service.history(session.id).turns[0]!.recipeUpdates).toEqual(event.recipeUpdates);expect(figure).toEqual(before);expect(event.components).toBeUndefined();expect(service.summary(run.id).repositoryRecall).toBeUndefined()
    const noOp=service.start({...request,figure:event.proposal!,content:'RECIPE_UPDATES_TEST RECIPE_UPDATES_NOOP'});await noOp.done;expect(noOp.status).toBe('completed');expect(service.summary(noOp.id)).toMatchObject({hasProposal:false,review:'none',recipeUpdates:[{changed:false}]});expect(service.summary(run.id).review).toBe('pending');expect(figure).toEqual(before)
    expect(()=>service.start({...request,librarySearch:true})).toThrow('当前工程')
  })
  it('computes candidate text checks instead of trusting model claims and retains exact history',async()=>{
    const {service,session}=serviceSession('codex','Native text check'),figure=createBlank(),saved=clone(figure)
    const run=service.start({...input(session.id),figure,content:'TEXT_CHECK_TEST',catalogue:[]});await run.done
    expect(run.status).toBe('completed');const event=run.events.at(-1)!,expected=checkFigureText(event.proposal!)
    expect(event.textCheck).toEqual(expected);expect(event.textCheck?.total).toBe(1)
    expect(service.summary(run.id).textCheck).toEqual(expected);expect(service.history(session.id).turns[0]!.textCheck).toEqual(expected)
    expect(service.summary(run.id).review).toBe('pending');expect(figure).toEqual(saved)
  })
  it('reviews plans before generation, restores frozen image/material snapshots and enforces source and style guards',async()=>{
    const kind='claude' as const
    const service=new HarnessService(provider=>provider==='codex'?new CodexAdapter(options()):new ClaudeAdapter(options()));services.push(service)
    const session=service.createSession(kind,'Composition plan'),asset=buildRecipe('pipeline',{stages:2,direction:'row'});asset.id='plan-frozen';asset.figure.nodes[0]!.label='Frozen feature'
    const figure=createBlank();figure.references=Array.from({length:3},(_,i)=>{const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(100+i,16);bytes.writeUInt32BE(50+i,20);return{id:`plan-image-${i}`,title:`Plan image ${i}`,citation:'Authored protocol fixture',fileName:`image-${i}.png`,sha256:String(i+1).repeat(64),pixelWidth:100+i,pixelHeight:50+i,dataUrl:`data:image/png;base64,${bytes.toString('base64')}`,placement:{x:0,y:0,width:100+i,height:50+i}}})
    const saved=clone(figure),data={sessionId:session.id,content:'COMPOSITION_PLAN_TEST MULTI_REF_OMIT_LAST',figure,selectedIds:[],intent:'plan',catalogue:[{kind:'asset',asset}],referenceInputs:[{id:'plan-image-2',purpose:'style'},{id:'plan-image-0',purpose:'layout'},{id:'plan-image-1',purpose:'content'}]},plan=service.start(data)
    asset.figure.nodes[0]!.label='Changed library copy';await plan.done;expect(plan.status).toBe('completed');const report=service.summary(plan.id).compositionRecord!
    expect(service.summary(plan.id)).toMatchObject({intent:'plan',hasProposal:false,review:'none'});expect(report.plan.sections[0]!.components).toEqual([{id:'planned-0',colorIndex:2,key:'asset:plan-frozen'}]);expect(report.references.map(r=>r.decision)).toEqual(['use','use','omit']);expect(service.history(session.id).turns[0]!.compositionRecord).toEqual(report);expect(plan.events.at(-1)!.proposal).toBeUndefined();expect(figure).toEqual(saved)
    const unplanned=service.start({...data,content:'COMPOSITION_PLAN_MISSING_LAYOUT MULTI_REF_OMIT_LAST'});await unplanned.done;expect(unplanned.status).toBe('failed');expect(service.summary(unplanned.id).error).toContain('每个分区');expect(service.summary(unplanned.id).hasProposal).toBe(false)
    const request={sessionId:session.id,figure:saved,selectedIds:[],catalogue:[],compositionPlanRunId:plan.id,content:'COMPOSITION_PLAN_DRAW MULTI_REF_OMIT_LAST'},draw=service.start(request);await draw.done;expect(draw.status).toBe('completed');const candidate=draw.events.at(-1)!.proposal!
    expect(candidate.containers.find(c=>c.id==='planned-0')!.appearance).toMatchObject({paletteId:report.plan.style.paletteId,colorIndex:2});expect(candidate.compositionPlans).toEqual([report]);expect(candidate.containers[0]!.title).toBe(report.plan.title);expect(candidate.nodes.some(n=>n.label==='Frozen feature')).toBe(true);expect(candidate.nodes.some(n=>n.label==='Changed library copy')).toBe(false);expect(service.summary(draw.id).adoptedComposition).toEqual(report);expect(service.summary(draw.id).components[0]!.componentKey).toBe('asset:plan-frozen')
    const rolePlan=service.start({...data,content:'COMPOSITION_PLAN_TEST COMPOSITION_COLOR_MAP MULTI_REF_OMIT_LAST'});await rolePlan.done;expect(rolePlan.status).toBe('completed');const roleRecord=service.summary(rolePlan.id).compositionRecord!
    const roleDraw=service.start({...request,compositionPlanRunId:rolePlan.id});await roleDraw.done;expect(roleDraw.status).toBe('completed');const roleMap=roleRecord.plan.sections[0]!.components[0]!.colorMap!
    expect(roleDraw.events.at(-1)!.proposal!.containers.find(c=>c.id==='planned-0')!.appearance!.colorMap).toEqual(roleMap);expect(service.summary(roleDraw.id).components[0]!.colorMap).toEqual(roleMap)
    for(let i=1;i<=3;i++)expect(service.referenceImage(draw.id,i).bytes).toEqual(service.referenceImage(plan.id,i).bytes)
    const stale=clone(saved);stale.title='Changed canvas';expect(()=>service.start({...request,figure:stale})).toThrow('已变化');expect(()=>service.start({...request,catalogue:[{kind:'asset',asset}]})).toThrow('固定来源');expect(()=>service.start({...request,sessionId:service.createSession(kind,'Other').id})).toThrow('当前会话')
    for(const marker of ['COMPOSITION_DRAW_BAD_STYLE','COMPOSITION_DRAW_SKIP_ASSET']){const bad=service.start({...request,content:`COMPOSITION_PLAN_DRAW ${marker} MULTI_REF_OMIT_LAST`});await bad.done;expect(bad.status).toBe('failed');expect(service.summary(bad.id).hasProposal).toBe(false);expect(service.summary(draw.id).hasProposal).toBe(true)}
    const unresolved=service.start({...data,figure:saved,content:'COMPOSITION_PLAN_NEEDS_INPUT MULTI_REF_OMIT_LAST'});await unresolved.done;expect(service.summary(unresolved.id).compositionRecord!.plan.status).toBe('needs-input');expect(()=>service.start({...request,compositionPlanRunId:unresolved.id})).toThrow('补充')
    const recordsOnly=clone(saved);recordsOnly.compositionPlans=[report];expect(compositionBaseKey(recordsOnly)).toBe(compositionBaseKey(saved));expect(figure).toEqual(saved)
  })
  it('freezes reusable styles across normal runs and adopted plans and refuses contradictory candidates',async()=>{
    const {service,session}=serviceSession('claude','Style material'),style={...captureStyleAsset(createExample()),name:'Frozen quiet style',preset:'sketch' as const,sketchStyle:'comic' as const,roughness:1.6,fontFamily:'MiSans' as const,paletteId:'figureforge-publication-soft',guide:'Muted inputs and short outside annotations',lineStyle:{scope:'edges' as const,style:{strokeWidth:2.5,startArrow:'open' as const,arrowSize:12}}},saved=clone(style),original=applyStyleAsset(createExample(),captureStyleAsset(createExample())).figure
    const data={...input(session.id),figure:original,catalogue:[],styleReference:style,content:'STYLE_ASSET_TEST'},run=service.start(data);style.guide='Changed current library';style.lineStyle.style.strokeWidth=4;await run.done;expect(run.status).toBe('completed');const proposal=run.events.at(-1)!.proposal!
    expect(service.summary(run.id).styleReference).toEqual(saved);expect(proposal.styleUses).toHaveLength(2);expect(proposal.styleUses![0]).toEqual(original.styleUses![0]);expect(proposal.styleUses![1]).toMatchObject({asset:saved,typography:'preferred',application:'harness'});expect(proposal.nodes[0]!.textStyle!.family).toBe('MiSans');expect(original.styleUses).toHaveLength(1);expect(proposal.edges.every(e=>e.appearance?.strokeWidth===2.5&&e.appearance.startArrow==='open'&&e.appearance.arrowSize===12)).toBe(true);expect(proposal.styleUses!.at(-1)!.lines!.total).toBe(proposal.edges.length);expect(service.summary(run.id).message).toContain('风格连线规范')
    const bad=service.start({...data,styleReference:saved,content:'STYLE_ASSET_TEST STYLE_ASSET_BAD_STYLE'});await bad.done;expect(bad.status).toBe('failed');expect(service.summary(bad.id).hasProposal).toBe(false);expect(service.summary(run.id).hasProposal).toBe(true)
    const planned=service.start({...data,styleReference:saved,intent:'plan',content:'COMPOSITION_PLAN_TEST',catalogue:[{kind:'asset',asset:buildRecipe('pipeline',{stages:2,direction:'row'})}]});await planned.done;expect(planned.status).toBe('completed');const record=service.summary(planned.id).compositionRecord!;expect(record.styleReference).toEqual(saved);expect(styleFromComposition(record).lineStyle).toEqual(saved.lineStyle);expect(record.plan.style).toMatchObject({preset:saved.preset,paletteId:saved.paletteId,fontFamily:saved.fontFamily})
    const drawn=service.start({...data,styleReference:undefined,catalogue:[],compositionPlanRunId:planned.id,content:'COMPOSITION_PLAN_DRAW'});await drawn.done;expect(drawn.status).toBe('completed');expect(service.summary(drawn.id).styleReference).toEqual(saved);expect(drawn.events.at(-1)!.proposal!.styleUses!.at(-1)!.asset).toEqual(saved);expect(drawn.events.at(-1)!.proposal!.edges.every(e=>e.appearance?.strokeWidth===2.5&&e.appearance.startArrow==='open')).toBe(true)
    expect(()=>service.start({...data,styleReference:saved,compositionPlanRunId:planned.id})).toThrow('固定风格')
  })
  it.each([
    ['sharedLegends', { containerIds: ['first', 'second'], placement: 'bottom', fontSize: 14, reason: 'Identical declared methods' }],
    ['sharedColorbars', { containerIds: ['first', 'second'], placement: 'bottom', fontSize: 14, reason: 'Identical measured quantity' }],
    ['plotAlignments', { containerIds: ['first', 'second'], columns: 2, reason: 'Align existing plot rows' }],
    ['callouts', { targetId: 'encoder', text: 'Frozen encoder', reason: 'Explain this operation' }],
    ['calloutReflows', { mode: 'layout', anchorPolicy:'reselect', side: 'bottom', reason: 'Leave the top lane free' }],
  ] as const)('%s: preserves program reports through events, history and review', async (field, operation) => {
    let figure = field === 'callouts'||field === 'calloutReflows' ? createExample() : createBlank()
    let command:unknown=operation
    if(field === 'calloutReflows'){const created=createCallouts(figure,[{targetId:'encoder',text:'Frozen encoder',side:'top',reason:'Explain this operation'}]);figure=created.figure;command={...operation,leaderId:created.reports[0]!.leaderId,labelId:created.reports[0]!.labelId}}
    if (field !== 'callouts'&&field !== 'calloutReflows') {
      Object.assign(figure.containers[0]!, { x: 0, y: 0, width: 1000, height: 620 })
      const chart = scaleComponent(buildDataChart(chartExample(field === 'sharedColorbars'||field === 'plotAlignments' ? 'heatmap' : 'line')), .35)
      for (const [id, x] of [['first', 80], ['second', 560]] as const)
        figure = instantiateComponentAt(figure, chart, 'stage', { x, y: 200 }, id, true).document
    }
    const before = clone(figure)
    let raw = JSON.stringify({ message: 'Controlled edit', figure: null, [field]: [command] })
    const service = new HarnessService(kind => ({
      kind, status: async () => ({ kind, state: 'ready', version: 'unit transport', message: 'Controlled response', images: false }),
      dispose() {}, async send(turn) { turn.emit('assistant.delta', raw); return raw },
    }))
    services.push(service)
    const session = service.createSession('codex', field)
    const run = service.start({ ...input(session.id), figure, catalogue: [], librarySearch: false })
    await run.done
    expect(run.status).toBe('completed')
    const event = run.events.at(-1)!, proposal = event.proposal!, report = service.summary(run.id)[field]
    expect(report).toHaveLength(1)
    expect(event[field]).toEqual(report)
    expect(service.history(session.id).turns.at(-1)![field]).toEqual(report)
    expect(figure).toEqual(before)
    if (field === 'sharedLegends') expect(sharedLegendStates(proposal)[0]!.active).toBe(true)
    else if (field === 'sharedColorbars') expect(sharedColorbarStates(proposal)[0]!.active).toBe(true)
    else if (field === 'plotAlignments') expect(proposal.containers.filter(c => c.dataChart).every(c => c.dataChart!.spec.plotArea)).toBe(true)
    else if(field === 'callouts') expect(proposal.nodes.slice(0, figure.nodes.length)).toEqual(before.nodes)
    else {expect(proposal.nodes.map(n=>n.id)).toEqual(before.nodes.map(n=>n.id));expect(event.calloutReflows![0]!.changed).toBe(true);expect(event.calloutReflows![0]!.bindingsChanged).toBe(true);expect(event.calloutReflows![0]!.afterLength).toBeLessThan(40)}
    expect(service.summary(run.id).review).toBe('pending')
    service.review(run.id, 'applied')
    expect(service.summary(run.id).review).toBe('applied')
    if(field==='sharedLegends'){
      const group=proposal.containers.find(c=>c.sharedLegend)!,source=clone(proposal),update={containerId:group.id,placement:'top',fontFamily:'MiSans',fontSize:12,columns:1,gap:4,reason:'Read the existing methods vertically'}
      raw=JSON.stringify({message:'Adjust existing legend',figure:null,sharedLegends:[update]})
      const edited=service.start({...input(session.id),figure:proposal,catalogue:[],librarySearch:false});await edited.done;expect(edited.status).toBe('completed');const event=edited.events.at(-1)!,candidate=event.proposal!,report=service.summary(edited.id).sharedLegends!
      expect(report[0]).toMatchObject({operation:'update',changed:true,containerId:group.id,after:{columns:1,gap:4}});expect(event.sharedLegends).toEqual(report);expect(service.history(session.id).turns.at(-1)!.sharedLegends).toEqual(report);expect(candidate.nodes.map(n=>n.id)).toEqual(proposal.nodes.map(n=>n.id));expect(proposal).toEqual(source);expect(candidate.containers.filter(c=>c.dataChart)).toEqual(proposal.containers.filter(c=>c.dataChart));expect(sharedLegendStates(candidate)[0]!.active).toBe(true)
      let drift=clone(candidate);for(const id of group.sharedLegend!.chartIds){const spec=drift.containers.find(c=>c.id===id)!.dataChart!.spec;drift=replaceDataChart(drift,id,{...spec,paletteId:'figureforge-publication-soft',series:spec.series.map((s,i)=>({...s,name:i===0?'Reference':s.name}))}).document}
      const sync={containerId:group.id,syncEntries:group.sharedLegend!.entries.map((entry,i)=>({seriesName:i===0?'Reference':entry.name,previousLabelId:entry.labelId})),reason:'Explicitly match renamed source methods'};raw=JSON.stringify({message:'Synchronize',figure:null,sharedLegends:[sync]});const synchronized=service.start({...input(session.id),figure:drift,catalogue:[],librarySearch:false});await synchronized.done;expect(synchronized.status).toBe('completed');const synced=synchronized.events.at(-1)!;expect(synced.sharedLegends![0]!.sourceSync!.entries[0]).toMatchObject({name:'Reference',action:'renamed',labelId:group.sharedLegend!.entries[0]!.labelId});expect(service.history(session.id).turns.at(-1)!.sharedLegends).toEqual(synced.sharedLegends);expect(sharedLegendStates(synced.proposal!)[0]!.active).toBe(true);expect(synced.proposal!.containers.filter(c=>c.dataChart)).toEqual(drift.containers.filter(c=>c.dataChart))
      const unchanged=service.start({...input(session.id),figure:synced.proposal!,catalogue:[]});await unchanged.done;expect(unchanged.status).toBe('completed');expect(unchanged.events.at(-1)!.proposal).toBeUndefined();expect(service.summary(unchanged.id).sharedLegends![0]!.changed).toBe(false)
    }
    if(field==='sharedColorbars'){
      const group=proposal.containers.find(c=>c.sharedColorbar)!,source=clone(proposal),update={containerId:group.id,placement:'top',paletteId:'heat-teal',center:null,fontFamily:'MiSans',fontSize:12,reason:'Synchronize the existing numeric scale'}
      raw=JSON.stringify({message:'Sync existing scale',figure:null,sharedColorbars:[update]});const edited=service.start({...input(session.id),figure:proposal,catalogue:[],librarySearch:false});await edited.done;expect(edited.status).toBe('completed');const event=edited.events.at(-1)!,candidate=event.proposal!,report=service.summary(edited.id).sharedColorbars!
      expect(report[0]).toMatchObject({operation:'update',changed:true,containerId:group.id,paletteId:'heat-teal'});expect(event.sharedColorbars).toEqual(report);expect(service.history(session.id).turns.at(-1)!.sharedColorbars).toEqual(report);expect(candidate.nodes.map(n=>n.id)).toEqual(proposal.nodes.map(n=>n.id));expect(proposal).toEqual(source);expect(candidate.containers.filter(c=>c.dataChart).map(c=>c.dataChart!.spec.series)).toEqual(proposal.containers.filter(c=>c.dataChart).map(c=>c.dataChart!.spec.series));expect(sharedColorbarStates(candidate)[0]!.active).toBe(true)
      raw=JSON.stringify({message:'Already synchronized',figure:null,sharedColorbars:[{...update,placement:'preserve'}]});const unchanged=service.start({...input(session.id),figure:candidate,catalogue:[]});await unchanged.done;expect(unchanged.status).toBe('completed');expect(unchanged.events.at(-1)!.proposal).toBeUndefined();expect(service.summary(unchanged.id).sharedColorbars![0]!.changed).toBe(false)
    }
  })
  it('serves SSE history/reconnect and rejects hostile origins, hosts and malformed requests', async () => {
    const service = new HarnessService(() => new CodexAdapter(options('text'))); services.push(service)
    const handle = harnessHttp(service), server = createServer((req, res) => { void handle(req, res) }); servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as { port: number }).port, base = `http://127.0.0.1:${port}/api/harness`
    const session = service.createSession('codex', 'http'), run = service.start(input(session.id))
    const stream = await (await fetch(`${base}/runs/${run.id}/events`)).text()
    const frames = stream.trim().split('\n\n').filter(s => s.startsWith('id:')).map(s => JSON.parse(s.split('\ndata: ')[1]!))
    expect(frames[0].type).toBe('run.started'); expect(frames.at(-1).type).toBe('run.completed')
    expect(frames.map(f => f.sequence)).toEqual(frames.map((_, i) => i + 1))
    const replay = await (await fetch(`${base}/runs/${run.id}/events`, { headers: { 'Last-Event-ID': '1' } })).text()
    expect(replay).not.toContain('"type":"run.started"'); expect(replay).toContain('run.completed')
    const snapshot = await (await fetch(`${base}/runs/${run.id}`)).json() as { baseFigure: unknown }
    expect(snapshot.baseFigure).toEqual(createExample())
    const history = await (await fetch(`${base}/sessions/${session.id}/history`)).json() as { turns: { id: string }[] }
    expect(history.turns.map(t => t.id)).toEqual([run.id])
    expect((await fetch(`${base}/sessions/00000000-0000-4000-8000-000000000000/history`)).status).toBe(404)
    expect((await fetch(`${base}/runs/${run.id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"decision":"applied"}' })).status).toBe(409)
    expect((await fetch(`${base}/runs/${run.id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"decision":"pending"}' })).status).toBe(400)
    expect((await fetch(`${base}/sessions`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(403)
    const hostileHost = await new Promise<number | undefined>((resolve, reject) => {
      const request = httpRequest(`${base}/status`, { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode) })
      request.on('error', reject); request.end()
    })
    expect(hostileHost).toBe(403)
    expect((await fetch(`${base}/sessions`, { method: 'POST', body: '{}' })).status).toBe(415)
    expect((await fetch(`${base}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status).toBe(400)
    expect((await fetch(`${base}/runs/${run.id}/events?after=900`)).status).toBe(400)
  })
})
