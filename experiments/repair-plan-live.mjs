// Explicit opt-in: real CLI calls. Never imported by normal tests or browser smoke.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join,resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'

const args=process.argv.slice(2),arg=(name)=>args[args.indexOf(name)+1],seedPath=arg('--seed')
assert(args.includes('--seed')&&seedPath,'Pass --seed <saved authored reconstruction run> explicitly')
const root=process.cwd(),output=resolve(args.includes('--output')?arg('--output'):join('test-results',`repair-plan-live-${Date.now()}`)),kind=args.includes('--kind')?arg('--kind'):'codex'
assert(['codex','claude'].includes(kind));mkdirSync(output,{recursive:true})
for(const key of ['FASTFIGURE_CODEX_COMMAND','FASTFIGURE_CLAUDE_COMMAND','FASTFIGURE_TEST_SCENARIO','FASTFIGURE_TEST_LOG'])delete process.env[key]
const server=await createServer({root,configFile:false,plugins:[vue()],cacheDir:join(output,'.vite'),server:{host:'127.0.0.1',port:0,watch:null}})
let browser,service,session
const save=(name,value)=>writeFileSync(join(output,name),JSON.stringify(value,null,2))
try{
  const {HarnessService}=await server.ssrLoadModule('/server/harness/service.ts'),{repairContentChanged}=await server.ssrLoadModule('/src/core/repairPlan.ts')
  service=new HarnessService();const status=(await service.status()).find(s=>s.kind===kind);assert.equal(status.state,'ready');assert(!status.version?.includes('fixture'))
  await server.listen();const candidates=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,chromium.executablePath()],cache=join(homedir(),'.cache/ms-playwright')
  if(existsSync(cache))for(const dir of readdirSync(cache).filter(d=>/^chromium-\d+$/.test(d)).sort().reverse())candidates.push(join(cache,dir,'chrome-linux64/chrome'),join(cache,dir,'chrome-linux/chrome'))
  browser=await chromium.launch({headless:true,executablePath:candidates.find(p=>p&&existsSync(p))});const page=await browser.newPage()
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.getByTestId('figure-canvas').waitFor()
  const saved=JSON.parse(readFileSync(seedPath,'utf8')),original=structuredClone(saved.events.findLast(e=>e.type==='run.completed')?.proposal)
  assert(original);const text=original.nodes.find(n=>n.kind==='text'&&n.label==='Encoder'),ellipse=original.nodes.find(n=>n.kind==='ellipse');assert(text&&ellipse)
  const damaged=structuredClone(original);damaged.nodes.find(n=>n.id===text.id).label='Ecnoder';damaged.nodes.find(n=>n.id===ellipse.id).visual.fill='#FF0000'
  save('damaged.fastfigure.json',damaged)
  const taskFor=(regionId)=>({kind:'repair',containerId:original.containers.find(c=>c.parentId===null).id,regionId})
  const crop=(figure,task)=>page.evaluate(async({figure,task})=>{const {prepareReconstructionImage}=await import('/src/core/reconstructionImage.ts');return prepareReconstructionImage(figure,task)},{figure,task})
  const storeRun=(run,label)=>{const snapshot={id:run.id,sessionId:run.sessionId,status:run.status,baseFigure:run.baseFigure,canvasBaseline:run.canvasBaseline,events:run.events,summary:service.summary(run.id)};save(`${label}.json`,snapshot);const image=service.getInputImage(run.id);writeFileSync(join(output,`${label}.${image.contentType.split('/')[1]}`),image.bytes);return snapshot}
  session=service.createSession(kind,'Authored multi-round real model check')
  const task=taskFor(text.reconstruction.owner),first=service.start({sessionId:session.id,figure:damaged,content:'对照图片，只修正 Ecnoder 的文字错字为原图中的 Encoder。保留位置、字体与其他所有对象；右侧椭圆目前的颜色留给后续分区核对，本轮不要改动。',task,inputImage:await crop(damaged,task),selectedIds:[],catalogue:[]})
  console.log(JSON.stringify({phase:'initial-repair',runId:first.id,kind,version:status.version,budgetSeconds:180}));await first.done;storeRun(first,'initial-repair');assert.equal(first.status,'completed',service.summary(first.id).error)
  const candidate=first.events.findLast(e=>e.proposal)?.proposal;assert(candidate);assert.equal(candidate.nodes.find(n=>n.id===text.id).label,'Encoder');assert.equal(candidate.nodes.find(n=>n.id===ellipse.id).visual.fill,'#FF0000')
  const regions=[];for(const regionId of [ellipse.reconstruction.owner,text.reconstruction.owner])regions.push({regionId,image:await crop(candidate,taskFor(regionId))})
  const plan=service.startPlan({sessionId:session.id,parentRunId:first.id,regions,content:'逐区对照原图，只修复可确认的问题。右侧椭圆现在误填了鲜红色，请仅将其填充改成图片里的浅杏色，保留原轮廓和其他对象。Encoder 区域上一轮只修过错字，请复核文字；已正确就返回空补丁，保持几何、字体、蓝色曲线与背景，不做猜测性的润色。'})
  console.log(JSON.stringify({phase:'plan',planId:plan.state.id,activeRunId:plan.state.activeRunId,regions:regions.map(r=>r.regionId),budgetSeconds:360}));await plan.done
  const state=service.planSnapshot(plan.state.id);save('plan.json',state)
  for(const [i,step] of state.steps.entries())if(step.runId)storeRun(service.getRun(step.runId),`step-${i+1}`)
  const final=service.getRun(state.latestCandidateRunId).events.findLast(e=>e.proposal)?.proposal;assert(final);save('final.fastfigure.json',final)
  const fill=final.nodes.find(n=>n.id===ellipse.id).visual.fill,rgb=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)),colorDistance=Math.hypot(...rgb(fill).map((v,i)=>v-rgb('#F2D8C7')[i]))
  const secondPass=state.steps[1]?.runId?service.getRun(state.steps[1].runId):null
  const metrics={kind,version:status.version,model:'CLI default identity not reported',seed:resolve(seedPath),seedSha256:createHash('sha256').update(readFileSync(seedPath)).digest('hex'),sourceSha256:original.references[0].sha256,status:state.status,steps:state.steps,correctedText:final.nodes.find(n=>n.id===text.id).label,ellipseFill:fill,ellipseColorDistanceFromSource:colorDistance,unrelatedObjectsUnchanged:final.nodes.filter(n=>n.id!==ellipse.id).every(n=>JSON.stringify(n)===JSON.stringify(candidate.nodes.find(c=>c.id===n.id))),canvasBaselineRetained:JSON.stringify(service.getRun(state.latestCandidateRunId).canvasBaseline)===JSON.stringify(first.canvasBaseline),secondPassContentChanged:secondPass?repairContentChanged(secondPass.baseFigure,secondPass.events.findLast(e=>e.proposal)?.proposal??secondPass.baseFigure):null,note:'Controlled text and fill defects on one self-authored simple figure; not an estimate of real-paper reconstruction quality.'}
  save('metrics.json',metrics);console.log(JSON.stringify(metrics))
  assert.equal(state.status,'completed');assert(colorDistance<45);assert.equal(metrics.correctedText,'Encoder');assert(metrics.unrelatedObjectsUnchanged);assert(metrics.canvasBaselineRetained)
}finally{await service?.dispose();await browser?.close();await server.close()}
