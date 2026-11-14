// Explicit real-model audits: controlled reconstruction comparison, or --design-review of a saved main figure. Not part of normal tests.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs'
import { resolve,join } from 'node:path'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { chromium } from 'playwright-core'
const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1]
assert(args.includes('--seed'),'Pass --seed <saved real figure JSON> explicitly')
const seed=resolve(arg('--seed')),output=resolve(args.includes('--output')?arg('--output'):join('test-results',`visual-audit-live-${Date.now()}`));mkdirSync(output,{recursive:true})
for(const key of ['FASTFIGURE_CODEX_COMMAND','FASTFIGURE_CLAUDE_COMMAND','FASTFIGURE_TEST_SCENARIO','FASTFIGURE_TEST_LOG'])delete process.env[key]
const server=await createServer({configFile:false,plugins:[vue()],cacheDir:join(output,'.vite'),server:{host:'127.0.0.1',port:0,watch:null}})
let browser,service,realCalls=0,replayCalls=0,auditCalls=0
const save=(name,value)=>writeFileSync(join(output,name),JSON.stringify(value,null,2))
try{
  const {HarnessService}=await server.ssrLoadModule('/server/harness/service.ts'),{CodexAdapter,ClaudeAdapter}=await server.ssrLoadModule('/server/harness/adapters.ts'),{sceneForReconstruction}=await server.ssrLoadModule('/src/core/reconstruction.ts'),{createBlank}=await server.ssrLoadModule('/src/core/model.ts')
  if(args.includes('--design-review')){
    const figure=JSON.parse(readFileSync(seed,'utf8')),before=JSON.stringify(figure)
    service=new HarnessService(kind=>{const adapter=kind==='codex'?new CodexAdapter():new ClaudeAdapter();return{kind:adapter.kind,status:()=>adapter.status(),dispose:()=>adapter.dispose(),send:async input=>{realCalls++;writeFileSync(join(output,'design-review-prompt.txt'),input.content);return adapter.send(input)}}})
    const session=service.createSession('codex','Main figure design review'),status=(await service.status()).find(s=>s.kind==='codex');assert.equal(status.state,'ready');assert(!status.version.includes('fixture'))
    await server.listen();browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}: {})});const page=await browser.newPage({viewport:{width:1920,height:1080}})
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.getByTestId('figure-canvas').waitFor()
    const designImage=await page.evaluate(async figure=>{const{prepareDesignReviewImage}=await import('/src/core/visualAuditImage.ts');return prepareDesignReviewImage(figure)},figure)
    const content=args.includes('--goal')?arg('--goal'):'本图希望解释 U 形编解码器的多尺度跳连与拼接机制。作为论文主图，请看整图实际阅读路径、主次、结构搭配与文字密度；先说值得保留的表达，再提出有证据的建议，不要求一定发现问题。'
    const run=service.start({sessionId:session.id,figure,content,intent:'design-review',designImage,catalogue:[],selectedIds:[],...(args.includes('--model')?{model:arg('--model')}:{})})
    console.log(JSON.stringify({phase:'main-figure-design-review',runId:run.id,version:status.version,seed,size:[designImage.width,designImage.height]}));await run.done
    const summary=service.summary(run.id);save('run.json',{id:run.id,status:run.status,summary,events:run.events});if(realCalls){const image=service.getCandidateImage(run.id);writeFileSync(join(output,`review-input.${image.contentType.split('/')[1]}`),image.bytes)};assert.equal(run.status,'completed',summary.error);assert(summary.designReviewReport);assert(!summary.hasProposal);assert.equal(summary.review,'none');assert.equal(JSON.stringify(figure),before)
    save('report.json',summary.designReviewReport);const image=service.getCandidateImage(run.id);assert.equal(createHash('sha256').update(image.bytes).digest('hex'),summary.designReview.imageSha256)
    const metrics={mode:'main-figure-design-review',realCalls,runId:run.id,model:summary.model??'CLI default',version:status.version,size:[designImage.width,designImage.height],findings:summary.designReviewReport.findings.length,readOnly:true,scope:'One live run verifies execution, not aesthetic correctness'};save('metrics.json',metrics);console.log(JSON.stringify(metrics))
  }else{
  const original=JSON.parse(readFileSync(seed,'utf8')),damaged=structuredClone(original),root=damaged.containers.find(c=>c.parentId===null),text=damaged.nodes.find(n=>n.kind==='text'&&n.label==='Encoder'),curve=damaged.nodes.find(n=>n.kind==='path'&&n.reconstruction?.owner===text?.reconstruction.owner)
  assert(text&&curve&&root.reconstruction);text.label='Ecnoder';damaged.nodes=damaged.nodes.filter(n=>n.id!==curve.id);save('controlled-damaged.fastfigure.json',damaged)
  const controlledScene=sceneForReconstruction(damaged,root.id),base=createBlank();base.references=structuredClone(original.references)
  let constructors=0
  service=new HarnessService(kind=>{
    const instance=++constructors,adapter=kind==='codex'?new CodexAdapter():new ClaudeAdapter()
    return{kind:adapter.kind,status:()=>adapter.status(),dispose:()=>adapter.dispose(),send:async input=>{
      if(instance===1&&replayCalls===0){replayCalls++;return JSON.stringify({message:'Controlled seed replay; not a model call',scene:controlledScene,warnings:[]})}
      realCalls++;const name=input.content.includes('FastFigure 独立视觉审阅助手')?(++auditCalls===1?'audit-prompt.txt':'recheck-prompt.txt'):'repair-prompt.txt';writeFileSync(join(output,name),input.content);return adapter.send(input)
    }}
  })
  const session=service.createSession('codex','Controlled visual audit'),status=(await service.status()).find(s=>s.kind==='codex');assert.equal(status.state,'ready');assert(!status.version.includes('fixture'))
  const parent=service.start({sessionId:session.id,figure:base,content:'Replay controlled corrupted seed',selectedIds:[],task:{kind:'reconstruct',referenceId:base.references[0].id,region:root.reconstruction.region,destination:'new',parentId:'stage'}});await parent.done;assert.equal(parent.status,'completed');const candidate=parent.events.at(-1).proposal
   await server.listen();browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}: {})});const page=await browser.newPage({viewport:{width:1920,height:1080}})
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.getByTestId('figure-canvas').waitFor()
  const task={kind:'repair',containerId:'stage',regionId:text.reconstruction.owner},images=await page.evaluate(async({candidate,task})=>{const{prepareVisualAuditImages}=await import('/src/core/visualAuditImage.ts');return prepareVisualAuditImages(candidate,task)},{candidate,task})
  const audit=service.startAudit({sessionId:session.id,parentRunId:parent.id,regionId:task.regionId,content:'比较原图和当前候选，列出本区域可确认的视觉差异。识别不清的地方明确列为不确定，不要求产生问题。',...images})
  console.log(JSON.stringify({phase:'independent-audit',runId:audit.id,parentRunId:parent.id,version:status.version,sourceSize:[images.sourceImage.width,images.sourceImage.height],candidateSize:[images.candidateImage.width,images.candidateImage.height],seedMode:'deterministic controlled replay; critic is a real model'}));await audit.done
  const snapshot=run=>({id:run.id,sessionId:run.sessionId,status:run.status,summary:service.summary(run.id),baseFigure:run.baseFigure,canvasBaseline:run.canvasBaseline,events:run.events})
  save('audit.json',snapshot(audit))
  for(const [name,image] of [['source',service.getInputImage(audit.id)],['candidate',service.getCandidateImage(audit.id)]])writeFileSync(join(output,`audit-${name}.${image.contentType.split('/')[1]}`),image.bytes)
  assert.equal(audit.status,'completed',service.summary(audit.id).error);const report=service.summary(audit.id).auditReport;save('report.json',report);assert(report.findings.length>0)
  const chosen=report.findings.find(f=>f.type==='text'&&f.repairable)??report.findings.find(f=>f.repairable);assert(chosen,'No confirmed repairable issue observed')
  const selected=args.includes('--merge')?report.findings.filter(f=>f.repairable):[chosen];if(args.includes('--merge'))assert(selected.some(f=>f.type==='text')&&selected.some(f=>f.type==='missing'),'Merge experiment requires both controlled defects to be observed; no retry or injected finding')
  const sourceImage=await page.evaluate(async({candidate,task})=>{const{prepareReconstructionImage}=await import('/src/core/reconstructionImage.ts');return prepareReconstructionImage(candidate,task)},{candidate,task})
  const repair=service.start({sessionId:session.id,figure:candidate,content:'合并核对所选视觉问题，以原图为准，仅修正可确认的本分区问题，保留其他区域与手工对象。',selectedIds:[],task,inputImage:sourceImage,refineFromRunId:parent.id,auditRepair:{auditRunId:audit.id,findingIds:selected.map(f=>f.id)}})
  console.log(JSON.stringify({phase:'selected-finding-repair',runId:repair.id,chosenFindings:selected.map(f=>f.id)}));await repair.done;save('repair.json',snapshot(repair));assert.equal(repair.status,'completed',service.summary(repair.id).error)
  const final=repair.events.findLast(e=>e.proposal)?.proposal;assert(final);save('final.fastfigure.json',final)
  const fixedText=final.nodes.find(n=>n.reconstruction?.objectId===text.reconstruction.objectId)?.label,otherRegionsUnchanged=candidate.nodes.filter(n=>n.reconstruction?.owner!==task.regionId).every(n=>JSON.stringify(n)===JSON.stringify(final.nodes.find(f=>f.id===n.id)))
  const metrics={version:status.version,model:'CLI default identity not reported',seedSha256:createHash('sha256').update(readFileSync(seed)).digest('hex'),sourceSha256:original.references[0].sha256,replayCalls,realCalls,controlledDefects:['Encoder → Ecnoder','removed blue curve'],findingCount:report.findings.length,findings:report.findings.map(f=>({id:f.id,type:f.type,title:f.title,repairable:f.repairable})),chosenFinding:chosen.id,fixedText,otherRegionsUnchanged,canvasBaselineRetained:JSON.stringify(repair.canvasBaseline)===JSON.stringify(parent.canvasBaseline),note:'Critic sees source/candidate rasters and geometry hints, not injected ground-truth labels. Controlled self-authored sample, not real-paper quality estimation.'}
  metrics.selectedType=chosen.type;metrics.candidateTextEvidence=chosen.textEvidence;metrics.candidateTextVerified=chosen.candidateTextVerified;metrics.curveRestored=final.nodes.filter(n=>n.kind==='path'&&n.reconstruction?.owner===task.regionId).length>candidate.nodes.filter(n=>n.kind==='path'&&n.reconstruction?.owner===task.regionId).length
  metrics.selectedFindings=selected.map(f=>f.id);metrics.merged=selected.length>1
  save('metrics.json',metrics);assert(otherRegionsUnchanged);if(selected.some(f=>f.type==='text'))assert.equal(fixedText,'Encoder');if(selected.some(f=>f.type==='missing'))assert(metrics.curveRestored,'Selected missing-structure finding was not repaired')
  if(args.includes('--recheck')){
    const nextImages=await page.evaluate(async({candidate,task})=>{const{prepareVisualAuditImages}=await import('/src/core/visualAuditImage.ts');return prepareVisualAuditImages(candidate,task)},{candidate:final,task})
    const recheck=service.startAudit({sessionId:session.id,parentRunId:repair.id,regionId:task.regionId,content:'修复后复审这版候选：从原图重新核对本分区，不沿用旧报告的结论，不因上一轮返回补丁就判定已解决。列出剩余或新引入的问题，识别不清写为不确定。',...nextImages})
    console.log(JSON.stringify({phase:'independent-recheck',runId:recheck.id,parentRunId:repair.id}));await recheck.done;save('recheck.json',snapshot(recheck));assert.equal(recheck.status,'completed',service.summary(recheck.id).error)
    const next=service.summary(recheck.id);save('recheck-report.json',next.auditReport);assert.deepEqual(next.visualAudit.recheck,{auditRunId:audit.id,repairRunId:repair.id});assert(!next.hasProposal)
    for(const [name,image] of [['source',service.getInputImage(recheck.id)],['candidate',service.getCandidateImage(recheck.id)]])writeFileSync(join(output,`recheck-${name}.${image.contentType.split('/')[1]}`),image.bytes)
    metrics.recheckRunId=recheck.id;metrics.recheckFindingCount=next.auditReport.findings.length;metrics.recheckFindings=next.auditReport.findings.map(f=>({title:f.title,type:f.type,repairable:f.repairable}));metrics.recheckUncertainties=next.auditReport.uncertainties
  }
  metrics.realCalls=realCalls;save('metrics.json',metrics);console.log(JSON.stringify(metrics))
  }
}finally{await service?.dispose();await browser?.close();await server.close()}
