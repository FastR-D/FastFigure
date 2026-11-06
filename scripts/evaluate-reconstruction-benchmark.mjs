// Offline by default. --live --case <id> is an explicit real-model invocation.
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { chromium } from 'playwright-core'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const root=fileURLToPath(new URL('..',import.meta.url)),args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined},live=args.includes('--live'),kind=option('--kind')??'codex',selected=option('--case'),split=option('--split')??'evaluation',predictions=option('--predictions')
const timeoutSeconds=Number(option('--timeout-seconds')??180)
if(!Number.isFinite(timeoutSeconds)||timeoutSeconds<1||timeoutSeconds>600)throw new Error('Benchmark timeout must be between 1 and 600 seconds')
if(!['codex','claude'].includes(kind)||!['all','development','evaluation'].includes(split))throw new Error('Invalid kind or split')
if(live&&!selected&&!args.includes('--all'))throw new Error('Real model calls require --case <id> or --all; ordinary evaluation makes no calls')
if(!live&&!predictions)throw new Error('Use --predictions <directory> for saved results, or explicitly --live --case <id>')
const directory=join(root,'benchmarks/cs-figures-v1'),manifestBytes=readFileSync(join(directory,'manifest.json')),manifest=JSON.parse(manifestBytes),cases=manifest.cases.filter(c=>selected?c.id===selected:split==='all'||c.split===split),hash=bytes=>createHash('sha256').update(bytes).digest('hex')
if(!cases.length)throw new Error('No selected benchmark cases')
for(const sample of cases)for(const file of [sample.source,sample.image])if(hash(readFileSync(join(directory,file.path)))!==file.sha256)throw new Error(`Pinned reference changed: ${file.path}`)
const output=resolve(option('--output')??join(root,'test-results',`benchmark-${live?kind:'offline'}`));mkdirSync(output,{recursive:true})
delete process.env.FASTFIGURE_CODEX_COMMAND;delete process.env.FASTFIGURE_CLAUDE_COMMAND;delete process.env.FASTFIGURE_TEST_SCENARIO
let benchmarkHandle
const server=await createServer({root,configFile:false,cacheDir:join(output,'vite-cache'),plugins:[vue(),{name:'benchmark-harness',configureServer(vite){vite.middlewares.use((req,res,next)=>{if(req.url?.startsWith('/api/harness/')&&benchmarkHandle)void benchmarkHandle(req,res);else next()})}}],server:{host:'127.0.0.1',port:0,strictPort:false,watch:null}})
let browser,page,activeRun,session,base,service
const report={dataset:manifest.version,manifestSha256:hash(manifestBytes),evaluatorSha256:hash(readFileSync(join(root,'src/core/reconstructionEvaluation.ts'))),harnessSourceSha256:hash(readFileSync(join(root,'server/harness/service.ts'))),timeoutSeconds:live?timeoutSeconds:undefined,mode:live?'live':'offline',kind:live?kind:undefined,model:live?'CLI configured default (model identity not reported)':undefined,selectedCases:cases.map(c=>c.id),results:[]}
writeFileSync(join(output,'evaluator.ts.snapshot'),readFileSync(join(root,'src/core/reconstructionEvaluation.ts')));writeFileSync(join(output,'harness-service.ts.snapshot'),readFileSync(join(root,'server/harness/service.ts')))
const api=async(path,body,method='POST')=>{const r=await fetch(`${base}/api/harness${path}`,body===undefined?{}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),value=await r.json();if(!r.ok)throw new Error(value.error??`HTTP ${r.status}`);return value}
try{
  const {evaluateReconstruction}=await server.ssrLoadModule('/src/core/reconstructionEvaluation.ts')
  if(hash(readFileSync(join(root,'src/core/reconstructionEvaluation.ts')))!==report.evaluatorSha256)throw new Error('Evaluator changed while loading; no model call was made')
  if(live){
    const {HarnessService}=await server.ssrLoadModule('/server/harness/service.ts'),{harnessHttp}=await server.ssrLoadModule('/server/harness/http.ts');service=new HarnessService();benchmarkHandle=harnessHttp(service)
    await server.listen();base=server.resolvedUrls.local[0].replace(/\/$/,'');const status=(await api('/status')).find(s=>s.kind===kind);if(status?.state!=='ready'||status.version.includes('fixture'))throw new Error('The real CLI is unavailable');report.cliVersion=status.version
    const cache=join(homedir(),'.cache/ms-playwright'),candidates=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,chromium.executablePath()];if(existsSync(cache))for(const dir of readdirSync(cache).filter(x=>/^chromium-\d+$/.test(x)).sort().reverse())candidates.push(join(cache,dir,'chrome-linux64/chrome'),join(cache,dir,'chrome-linux/chrome'))
    browser=await chromium.launch({headless:true,executablePath:candidates.find(p=>p&&existsSync(p))});page=await browser.newPage({viewport:{width:1920,height:1080}});await page.goto(base);await page.getByTestId('figure-canvas').waitFor()
  }
  for(const sample of cases){
    const entry={caseId:sample.id,split:sample.split,inputSha256:sample.image.sha256,status:'pending'};report.results.push(entry)
    try{
      let result
      if(live){
        session=await api('/sessions',{kind,title:`Benchmark ${sample.id}`})
        const bytes=readFileSync(join(directory,sample.image.path)),data=await page.evaluate(async bytes=>{
          const {createBlank}=await import('/src/core/model.ts'),{readReferenceImage}=await import('/src/core/references.ts'),{prepareReconstructionImage}=await import('/src/core/reconstructionImage.ts'),figure=createBlank()
          figure.references=[await readReferenceImage(new File([new Uint8Array(bytes)],'benchmark-reference.png',{type:'image/png'}),figure.containers[0])];figure.references[0].title='CS reconstruction evaluation';figure.references[0].citation='Self-authored evaluation image'
          const task={kind:'reconstruct',referenceId:figure.references[0].id,region:{x:0,y:0,width:1,height:1},destination:'new',parentId:'stage'}
          return {figure,task,inputImage:await prepareReconstructionImage(figure,task)}
        },[...bytes])
        const imageBytes=Buffer.from(data.inputImage.dataUrl.split(',')[1],'base64'),{dataUrl:_,...imageInfo}=data.inputImage;entry.inputImage={...imageInfo,encodedSha256:hash(imageBytes)};writeFileSync(join(output,`${sample.id}.input.webp`),imageBytes)
        // No SVG, source labels, coordinates, object counts or expected answers are sent.
        const started=await api('/runs',{sessionId:session.id,content:'忠实重建所附科研示意图的文字、内部结构、形状、注释和连接。保留原图布局和绘制顺序；说明不确定之处，不重新设计或省略细节。',selectedIds:['stage'],catalogue:[],...data});activeRun=started.id
        console.log(JSON.stringify({caseId:sample.id,runId:activeRun,status:'running',timeoutSeconds,width:data.inputImage.width,height:data.inputImage.height}))
        const benchmarkRunId=activeRun;let stoppedByBudget=false
        const benchmarkTimer=setTimeout(()=>{stoppedByBudget=true;service.cancel(benchmarkRunId)},timeoutSeconds*1000)
        try{await service.getRun(activeRun).done}finally{clearTimeout(benchmarkTimer)}
        result=await api(`/runs/${activeRun}`);if(stoppedByBudget)result.benchmarkBudgetExpired=true
        activeRun=undefined;result.benchmarkInput=entry.inputImage;writeFileSync(join(output,`${sample.id}.json`),JSON.stringify(result,null,2));if(result.status!=='completed')throw new Error(result.summary.error??'Model run failed')
      }else{const file=join(resolve(predictions),`${sample.id}.json`);if(!existsSync(file))throw new Error('No saved prediction for this selected case');result=JSON.parse(readFileSync(file,'utf8'))}
      const candidate=result.events?.findLast(e=>e.proposal)?.proposal??result.figure??(result.version?result:undefined)
      if(candidate){const source=candidate.containers?.find(c=>c.parentId===null)?.reconstruction?.referenceSha256;if(source!==sample.image.sha256)throw new Error('Prediction source fingerprint does not match the pinned benchmark image');entry.sourceAssociation='fingerprint verified'}else if(result.referenceSha256){if(result.referenceSha256!==sample.image.sha256)throw new Error('Prediction source fingerprint does not match the pinned benchmark image');entry.sourceAssociation='raw Scene wrapper fingerprint verified'}else entry.sourceAssociation='raw Scene associated by filename; no reference fingerprint available'
      if(candidate)writeFileSync(join(output,`${sample.id}.fastfigure.json`),JSON.stringify(candidate,null,2));entry.metrics=evaluateReconstruction(sample,result);entry.status='scored'
      console.log(JSON.stringify({caseId:sample.id,status:entry.status,textRecall:entry.metrics.text.exactRecall,characterErrorRate:entry.metrics.text.characterErrorRate,shapeRecall:entry.metrics.shapes.recall,strokeRecall:entry.metrics.strokes.objectRecall,arrowRecall:entry.metrics.arrows.recall,inkRecall:entry.metrics.ink.objectRecall}))
    }catch(error){entry.status='failed';entry.error=String(error.message??error).slice(0,2000);console.log(JSON.stringify({caseId:sample.id,status:'failed',error:entry.error}));process.exitCode=1}
    finally{if(activeRun){await api(`/runs/${activeRun}/cancel`,{}).catch(()=>{});for(let i=0;i<20;i++){const r=await api(`/runs/${activeRun}`).catch(()=>null);if(!r||r.status!=='running')break;await delay(200)}activeRun=undefined}if(session){await api(`/sessions/${session.id}`,{},'DELETE').catch(()=>{});session=undefined}}
  }
  report.scored=report.results.filter(r=>r.status==='scored').length;report.failed=report.results.length-report.scored
  writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2))
  const percent=value=>value===null?'—':`${(100*value).toFixed(1)}%`
  writeFileSync(join(output,'report.md'),`# ${manifest.version}\n\nManifest: ${report.manifestSha256}\n\nScored ${report.scored} / ${report.results.length}. No automatic acceptance threshold.\n\n| Case | Split | Text exact recall | Character error | Strict shape recall | Strict stroke recall | Arrow recall | Union outline recall | Union precision |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${report.results.map(r=>r.metrics?`| ${r.caseId} | ${r.split} | ${percent(r.metrics.text.exactRecall)} | ${percent(r.metrics.text.characterErrorRate)} | ${percent(r.metrics.shapes.recall)} | ${percent(r.metrics.strokes.objectRecall)} | ${percent(r.metrics.arrows.recall)} | ${percent(r.metrics.ink.objectRecall)} | ${percent(r.metrics.ink.precision)} |`:`| ${r.caseId} | ${r.split} | FAILED: ${r.error.replace(/[|\r\n]/g,' ')} | — | — | — | — | — | — |`).join('\n')}\n`)
}finally{await service?.dispose();await browser?.close();await server.close()}
