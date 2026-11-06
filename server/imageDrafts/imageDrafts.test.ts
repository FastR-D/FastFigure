import {afterEach,expect,it} from 'vitest'
import {createHash,randomUUID} from 'node:crypto'
import {resolve} from 'node:path'
import {createServer} from 'node:http'
import type {AddressInfo} from 'node:net'
import {DOMParser} from '@xmldom/xmldom'
import {ImageDraftService} from './service'
import {imageDraftHttp} from './http'
import {CodexImageDraftAdapter} from './adapter'
import {captureStyleAsset} from '../../src/core/styleAsset'
import {createExample,createBlank,clone,parseDocument} from '../../src/core/model'
import {draftStyleSchema,imageDraftBundleSchema,imageDraftInputSchema,type ImageDraftInput} from '../../src/core/imageDraftContract'
import {compileImageDraftDesign,imageDraftPlanStyle,imageDraftPlanReferences} from '../../src/core/imageDraftDesign'
import type {CompositionRecord} from '../../src/core/compositionPlanContract'
import {imageDraftPrompt} from './prompt'
import {compileReconstruction} from '../../src/core/reconstruction'
import {captureComponent,componentDocument,scaleComponent} from '../../src/core/assets'
import {exportSvg} from '../../src/core/svg'
import {importSvg} from '../../src/core/svgImport'
import {parseChartDataset} from '../../src/core/chartDataset'
import {parseChartRecommendationResponse} from '../../src/core/chartRecommendation'
import {parseHarnessResponse} from '../../src/core/harness'
const services:ImageDraftService[]=[]
afterEach(async()=>{await Promise.all(services.splice(0).map(s=>s.dispose()))})
function service(scenario='early'){const s=new ImageDraftService(()=>new CodexImageDraftAdapter({command:process.execPath,args:[resolve('server/harness/fixtures/cli.mjs')],env:{...process.env,FASTFIGURE_TEST_SCENARIO:scenario}}));services.push(s);return s}
function input():ImageDraftInput{const{id,name,updatedAt,preset,paletteId,fontFamily,guide}=captureStyleAsset(createExample());return{requestId:randomUUID(),title:'Authored image draft',content:'Tokens → Encoder → Embeddings; no scientific measurements.',visual:'Clear native structure and notes',aspect:'landscape',timeoutSeconds:30,style:draftStyleSchema.parse({id,name,updatedAt,preset,paletteId,fontFamily,guide}),references:[]}}
function plannedInput():ImageDraftInput{
  const request=input(),composition:CompositionRecord={version:1,runId:randomUUID(),userGoal:request.content,components:[{key:'recipe:encoder',name:'Encoder',revision:'fixture-v1',nodeCount:4}],references:[],plan:{status:'ready',title:'Encoder training and deployment',goal:'Train the encoder and transfer its parameters to deployment; explain one declared block.',readingOrder:'left-to-right',layout:'Training left, deployment upper right, explanatory inset lower right.',style:{preset:'precise',paletteId:'figureforge-publication-soft',fontFamily:'MiSans',colorIndex:2,usage:'Blue processing, orange output; neutral grouping.'},sections:[
    {id:'train',title:'Training',purpose:'Train declared encoder',visual:'Tokens and encoder; repeat the declared block twice.',design:{role:'mechanism',structure:'layered',rationale:'Show the two declared blocks.',emphasis:'primary',frame:{id:'train-frame',x:0,y:0,width:.55,height:1}},components:[{id:'encoder',key:'recipe:encoder',parameters:{repeats:2},colorIndex:2}],referenceImages:[],annotations:['Tokens → Encoder']},
    {id:'deploy',title:'Deployment',purpose:'Apply trained encoder',visual:'Encoder and embeddings',design:{role:'overview',structure:'pipeline',rationale:'Display deployment order.',emphasis:'supporting',frame:{id:'deploy-frame',x:.6,y:0,width:.4,height:.5}},components:[],referenceImages:[],annotations:['Embeddings']},
    {id:'detail',title:'Block detail',purpose:'Explain the same declared block',visual:'A conceptual explanation of the encoder, without new stages.',design:{role:'detail',structure:'custom',rationale:'Explain without adding data flow.',emphasis:'supporting',frame:{id:'detail-frame',x:.6,y:.6,width:.4,height:.4}},components:[],referenceImages:[],annotations:[]}],connections:[{from:'train',to:'deploy',kind:'parameter-transfer',meaning:'Copy trained encoder parameters'},{from:'train',to:'detail',kind:'detail',meaning:'Explanatory correspondence only'}],checks:['Check transfer direction and exact block count'],questions:[],uncertainties:['Internal details beyond supplied block are unknown']}}
  return{...request,content:composition.plan.goal,style:imageDraftPlanStyle(composition),composition}
}
it('compiles complete plan geometry, module identity, parameters and distinct relation types without synthesizing new modules',()=>{
  const request=plannedInput(),before=clone(request),design=compileImageDraftDesign(request.composition!,[])
  expect(design.sections.map(s=>[s.id,s.frame])).toEqual(request.composition!.plan.sections.map(s=>[s.id,s.design!.frame]))
  expect(design.sections.flatMap(s=>s.modules)).toEqual([{id:'encoder',key:'recipe:encoder',parameters:{repeats:2},colorIndex:2,name:'Encoder'}])
  expect(design.connections.map(({relation:_,...link})=>link)).toEqual(request.composition!.plan.connections)
  expect(design.originalRequest).toBe(before.composition!.userGoal);expect(design.uncertainties).toEqual(before.composition!.plan.uncertainties);expect(request).toEqual(before)
  expect(()=>imageDraftInputSchema.parse({...request,outputKind:'illustration'})).toThrow('整图方案');
  const prompt=imageDraftPrompt(request,[]);expect(prompt).toContain(JSON.stringify(design));expect(prompt).not.toContain('data:image')
  for(const mutate of [(r:ImageDraftInput)=>{r.content='Add a discriminator'},(r:ImageDraftInput)=>{r.style.paletteId='figureforge-tableau10'},(r:ImageDraftInput)=>{r.composition!.plan.status='needs-input';r.composition!.plan.questions=['What does the block do?']},(r:ImageDraftInput)=>{delete r.composition!.plan.sections[0]!.design}]){const changed=clone(request);mutate(changed);expect(imageDraftInputSchema.safeParse(changed).success).toBe(false)}
})
it('binds plan reference bytes, remaps omitted reference indices, freezes the submitted plan and rejects drift before any run',async()=>{
  const s=service(),sample=s.start(input());await sample.done;const bytes=s.image(sample.info.id).bytes,request=plannedInput(),record=request.composition!,source={index:2,id:'source',title:'Layout anchor',citation:'Authored fixture',fileName:'source.png',sha256:'a'.repeat(64),inputSha256:createHash('sha256').update(bytes).digest('hex'),width:8,height:8,purpose:'layout' as const,decision:'use' as const,observation:'One main region and an inset',application:'Use hierarchy only',uncertainty:''}
  record.references=[{...source,index:1,id:'omitted',sha256:'b'.repeat(64),decision:'omit'},source];record.plan.sections[0]!.referenceImages=[2]
  const doc=createBlank();doc.references=[{id:source.id,title:source.title,citation:source.citation,fileName:source.fileName,sha256:source.sha256,pixelWidth:8,pixelHeight:8,dataUrl:`data:image/png;base64,${bytes.toString('base64')}`,placement:{x:0,y:0,width:8,height:8}}];request.references=imageDraftPlanReferences(record,doc)
  expect(()=>imageDraftPlanReferences(record,createBlank())).toThrow('移除')
  const changed=clone(request);changed.composition!.references[1]!.inputSha256='c'.repeat(64);expect(()=>s.start(changed)).toThrow('实际字节');expect(s.list()).toHaveLength(1)
  const wrong=clone(request);wrong.references[0]!.purpose='content';expect(()=>s.start(wrong)).toThrow('顺序');expect(s.list()).toHaveLength(1)
  const frozen=clone(record),run=s.start(request);record.plan.sections[0]!.visual='Changed after submission';await run.done
  expect(run.info.status).toBe('completed');expect(run.info.composition).toEqual(frozen);expect(run.info.origin!.composition).toEqual(frozen)
  const origin=run.info.origin!,design=compileImageDraftDesign(frozen,origin.referenceInputs);expect(design.sections[0]!.references[0]).toMatchObject({index:1,sourceIndex:2,id:'source'});expect(origin.submittedPrompt).toContain(JSON.stringify(design));expect(origin.referenceInputs).toHaveLength(1)
  const oversized=plannedInput();oversized.visual='v'.repeat(2000);oversized.composition!.userGoal='x'.repeat(12000);for(const section of oversized.composition!.plan.sections){section.visual='v'.repeat(600);section.purpose='p'.repeat(400);section.annotations=Array(4).fill('a'.repeat(160))}oversized.composition!.plan.layout='l'.repeat(1200)
  expect(()=>s.start(oversized)).toThrow('提示容量');expect(s.list()).toHaveLength(2)
})
it('deduplicates image submissions, reads actual native output, freezes the brief and requires explicit review',async()=>{
  const s=service(),request={...input(),outputKind:'illustration' as const},run=s.start(request),again=s.start(clone(request));expect(again).toBe(run);expect(()=>s.start({...request,content:'Changed duplicate'})).toThrow('标识');expect(()=>s.start({...input()})).toThrow('正在生成')
  request.content='Changed after submission';await run.done;expect(run.info.outputKind).toBe('illustration');expect(run.info.origin?.outputKind).toBe('illustration');expect(run.info.origin?.submittedPrompt).toContain('透明背景（alpha）');expect(run.info.status).toBe('completed');expect(run.info.review).toBe('pending');expect(run.info.origin!.content).toContain('Tokens');expect(run.info.origin!.inputVerification).toBe('verified');expect(run.info.origin!.sha256).toBe(createHash('sha256').update(s.image(run.info.id).bytes).digest('hex'));expect(s.start({...request,content:run.info.content})).toBe(run)
  expect(s.review(run.info.id,'imported').review).toBe('imported');expect(()=>s.review(run.info.id,'discarded')).toThrow('已经处理')
})
it('keeps AI origin and content specification through reconstruction, material capture, scaling and native SVG, without model forgery',async()=>{
  const s=service(),run=s.start(plannedInput());await run.done;const origin=run.info.origin!,bytes=s.image(run.info.id).bytes,doc=createBlank(),trace={runId:origin.runId,provider:origin.provider,sha256:origin.sha256,illustrative:true as const}
  expect(origin.composition!.plan.sections[0]!.components[0]!.parameters).toEqual({repeats:2})
  doc.imageDrafts=[origin];doc.references=[{id:'draft',title:origin.title,citation:'AI visual draft',fileName:'draft.png',sha256:origin.sha256,pixelWidth:8,pixelHeight:8,dataUrl:`data:image/png;base64,${bytes.toString('base64')}`,placement:{x:100,y:100,width:300,height:300},generated:trace}]
  const candidate=compileReconstruction(doc,{kind:'reconstruct',referenceId:'draft',region:{x:0,y:0,width:1,height:1},destination:'new',parentId:'stage'},{message:'Authored fixture reconstruction',warnings:[],scene:{canvas:{width:8,height:8},revision:0,regions:[],nodes:[{id:'block',type:'rect',version:0,x:1,y:1,w:3,h:3,fill:'#abcdef',stroke:'#123456'}]}}).figure!
  expect(candidate.imageDrafts).toEqual([origin]);expect(candidate.nodes[0]!.evidence!.generated).toEqual(trace)
  const data=parseChartDataset('X,Y\n1,3\n2,7',{name:'Observed',origin:'user',errorLabel:'',note:'',dataSource:'User table'}),recommendation={status:'ready',kind:'line',xColumn:'c0',series:[{column:'c1'}],title:'Observed',xLabel:'X',yLabel:'Y',paletteId:'figureforge-publication-soft',grid:true,showValues:false,reason:'Ordered observations',alternatives:[],cautions:[]},chart=parseChartRecommendationResponse(JSON.stringify({message:'Use actual data',recommendation}),doc,data).figure!
  expect(chart.imageDrafts).toEqual([origin]);expect(chart.containers[0]!.dataChart!.spec.series[0]!.values).toEqual([3,7])
  const bundle=imageDraftBundleSchema.parse(JSON.parse(JSON.stringify({format:'fastfigure.image-draft',version:1,origin,image:{mime:'image/png',base64:bytes.toString('base64')}})));expect(bundle.origin).toEqual(origin);expect(Buffer.from(bundle.image.base64,'base64')).toEqual(bytes)
  const mismatched=clone(bundle);mismatched.origin.composition!.plan.goal='A different scientific specification';expect(imageDraftBundleSchema.safeParse(mismatched).success).toBe(false)
  const asset=captureComponent(candidate,'stage','Generated origin'),scaled=componentDocument(scaleComponent(asset,.5));expect(scaled.imageDrafts).toEqual([origin]);expect(asset.sources.some(s=>s.generated?.runId===origin.runId)).toBe(true)
  const recovered=importSvg(exportSvg(candidate),{fileName:'draft.svg',sha256:'a'.repeat(64),parseXml:source=>new DOMParser().parseFromString(source,'image/svg+xml') as unknown as Document}).asset.figure;expect(recovered.imageDrafts).toEqual([origin]);expect(recovered.nodes[0]!.evidence!.generated).toEqual(trace)
  const response={message:'Preserve',figure:clone(candidate)};delete response.figure.imageDrafts;expect(parseHarnessResponse(JSON.stringify(response),candidate).figure!.imageDrafts).toEqual([origin]);response.figure.nodes[0]!.evidence!.generated!.runId=randomUUID();expect(()=>parseHarnessResponse(JSON.stringify(response),candidate)).toThrow('伪造');expect(()=>parseDocument({...doc,references:[{...doc.references[0],generated:{...trace,sha256:'b'.repeat(64)}}]})).toThrow('指纹')
})
it('verifies reference bytes and rejects unselected native inputs, opaque outputs and cancellation without auto retry',async()=>{
  const base=service(),sample=base.start(input());await sample.done;const bytes=base.image(sample.info.id).bytes,request=input();request.references=[{id:'source',title:'Source',citation:'Authored fixture',fileName:'source.png',sha256:'a'.repeat(64),width:8,height:8,purpose:'layout',dataUrl:`data:image/png;base64,${bytes.toString('base64')}`}]
  const matched=base.start(request);await matched.done;expect(matched.info.origin!.referenceInputs[0]!.inputSha256).toBe(createHash('sha256').update(bytes).digest('hex'));expect(matched.info.origin!.inputVerification).toBe('verified')
  for(const [scenario,error]of [['image-extra-input','清单之外'],['image-no-result','可读取']] as const){const s=service(scenario),run=s.start(input());await run.done;expect(run.info.status).toBe('failed');expect(run.info.error).toContain(error);expect(run.info.available).toBe(false);expect(s.list()).toHaveLength(1)}
  const stalled=service('stall'),run=stalled.start(input());stalled.cancel(run.info.id);await run.done;expect(run.info.status).toBe('cancelled');expect(run.info.available).toBe(false)
  expect(()=>base.start({...input(),references:[{...request.references[0]!,width:12}]})).toThrow('尺寸')
})
it('rejects cross-site image generation and exposes only the recorded image through its local run API',async()=>{
  const s=service(),http=createServer((req,res)=>{void imageDraftHttp(s)(req,res)});await new Promise<void>(resolve=>http.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(http.address() as AddressInfo).port}`,payload=input()
  try{
    const blocked=await fetch(`${base}/api/image-drafts/runs`,{method:'POST',headers:{'content-type':'application/json',origin:'https://unrelated.invalid'},body:JSON.stringify(payload)});expect(blocked.status).toBe(403);expect(s.list()).toHaveLength(0)
    const request=()=>fetch(`${base}/api/image-drafts/runs`,{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify(payload)}),first=await request();expect(first.status).toBe(202);const row=await first.json() as {id:string};expect((await(await request()).json() as {id:string}).id).toBe(row.id);await s.get(row.id).done
    const image=await fetch(`${base}/api/image-drafts/runs/${row.id}/image`);expect(image.headers.get('content-type')).toBe('image/png');expect(Buffer.from(await image.arrayBuffer())).toEqual(s.image(row.id).bytes);expect(s.get(row.id).info.review).toBe('pending')
  }finally{http.closeAllConnections();await new Promise<void>(resolve=>http.close(()=>resolve()))}
})
