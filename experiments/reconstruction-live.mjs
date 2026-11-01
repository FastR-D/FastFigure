// Explicit opt-in validation: starts a local service and calls the configured real CLI model.
// pnpm test and pnpm test:ui never import or execute this script.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { createServer as createViteServer } from 'vite'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { reconstructionFixture } from './fixtures.mjs'
import { auditReconstructionPixels } from './reconstruction-quality.mjs'

const root=fileURLToPath(new URL('..',import.meta.url)),results=join(root,'test-results'),kind=process.env.FASTFIGURE_LIVE_KIND??'codex'
assert(['codex','claude'].includes(kind));mkdirSync(results,{recursive:true})
const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve))
const base=`http://127.0.0.1:${port}`
delete process.env.FASTFIGURE_CODEX_COMMAND;delete process.env.FASTFIGURE_CLAUDE_COMMAND;delete process.env.FASTFIGURE_TEST_SCENARIO;delete process.env.FASTFIGURE_TEST_LOG
const server=await createViteServer({root,server:{host:'127.0.0.1',port,strictPort:true,watch:null}})
let browser,session,activeRun
const api=async(path,body,method='POST')=>{const r=await fetch(`${base}/api/harness${path}`,body===undefined?{}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error??`HTTP ${r.status}`);return data}
const artifacts=name=>join(results,`reconstruction-live-${kind}-${name}`)
try {
  await server.listen()
  const statuses=await api('/status'),status=statuses.find(s=>s.kind===kind);assert.equal(status.state,'ready');assert(!status.version.includes('fixture'))
  const cache=join(homedir(),'.cache/ms-playwright'),candidates=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,chromium.executablePath()]
  if(existsSync(cache))for(const dir of readdirSync(cache).filter(d=>/^chromium-\d+$/.test(d)).sort().reverse())candidates.push(join(cache,dir,'chrome-linux64/chrome'),join(cache,dir,'chrome-linux/chrome'))
  browser=await chromium.launch({headless:true,executablePath:candidates.find(p=>p&&existsSync(p))})
  const page=await browser.newPage({viewport:{width:1920,height:1080}});await page.goto(base);await page.getByTestId('figure-canvas').waitFor()
  const source=await reconstructionFixture(page);writeFileSync(artifacts('source.png'),source.buffer)
  const figure=await page.evaluate(async bytes=>{const {createBlank}=await import('/src/core/model.ts'),{readReferenceImage}=await import('/src/core/references.ts');const doc=createBlank();doc.references=[await readReferenceImage(new File([new Uint8Array(bytes)],'authored-reconstruction-benchmark.png',{type:'image/png'}),doc.containers[0])];return doc},[...source.buffer])
  session=await api('/sessions',{kind,title:'Authored reconstruction verification'})
  async function run(content,document,task,label){
    const inputImage=await page.evaluate(async ({document,task})=>{const {prepareReconstructionImage}=await import('/src/core/reconstructionImage.ts');return prepareReconstructionImage(document,task)},{document,task})
    writeFileSync(artifacts(`${label}-input.webp`),Buffer.from(inputImage.dataUrl.split(',')[1],'base64'))
    const started=await api('/runs',{sessionId:session.id,content,figure:document,selectedIds:['stage'],task,inputImage});activeRun=started.id
    console.log(JSON.stringify({phase:label,id:started.id,sessionId:session.id,version:status.version,status:'running',inputImage:{width:inputImage.width,height:inputImage.height,quality:inputImage.quality,sourceRect:inputImage.sourceRect}}))
    let result
    for(let i=0;i<240;i++){result=await api(`/runs/${started.id}`);if(result.status!=='running')break;await delay(1000)}
    writeFileSync(artifacts(`${label}.json`),JSON.stringify(result,null,2));assert.notEqual(result.status,'running','The service run is still live; inspect its handle before rerunning')
    activeRun=undefined;console.log(JSON.stringify({phase:label,status:result.status,error:result.summary.error,message:result.summary.message}))
    assert.equal(result.status,'completed',result.summary.error)
    return result.events.findLast(e=>e.type==='run.completed')?.proposal
  }
  const task={kind:'reconstruct',referenceId:figure.references[0].id,region:{x:0,y:0,width:1,height:1},destination:'new',parentId:'stage'}
  const previous=process.env.FASTFIGURE_LIVE_INITIAL?JSON.parse(readFileSync(process.env.FASTFIGURE_LIVE_INITIAL,'utf8')):undefined
  const candidate=previous?previous.events.findLast(e=>e.type==='run.completed')?.proposal:await run('忠实重建所附自制基准图的圆角矩形、Encoder 文字、蓝色贝塞尔曲线、右侧椭圆和水平箭头。保持几何、层次和颜色，按真实观察划分区域。',figure,task,'initial')
  assert(candidate&&candidate.nodes.length>=3);assert(candidate.nodes.some(n=>n.kind==='text'&&n.label==='Encoder'));assert(candidate.nodes.some(n=>n.path));assert(candidate.nodes.every(n=>n.reconstruction))
  assert.equal(candidate.references[0].sha256,figure.references[0].sha256,'Loaded candidate must use this exact authored source')
  const information=await page.evaluate(async doc=>{const {sceneForReconstruction,reconstructionWorkers}=await import('/src/core/reconstruction.ts'),{exportSvg}=await import('/src/core/svg.ts');const group=doc.containers[0],scene=sceneForReconstruction(doc,group.id);return {svg:exportSvg(doc,{bounds:'content'}),workers:reconstructionWorkers(group.reconstruction,scene)}},candidate)
  writeFileSync(artifacts('candidate.svg'),information.svg)
  const target=candidate.nodes.find(n=>n.kind==='text'&&n.label==='Encoder'),worker=information.workers.find(w=>w.id===target.reconstruction.owner)??information.workers.find(w=>!w.detailPass)
  assert(worker)
  const damaged=structuredClone(candidate);damaged.nodes.find(n=>n.id===target.id).label='Ecnoder'
  writeFileSync(artifacts('damaged.fastfigure.json'),JSON.stringify(damaged,null,2))
  const repaired=await run('对照原图修复当前分区的文字错别字：当前目录中的 Ecnoder 应修复为图片里准确的 Encoder。只修改此文字，保持现有位置、字体、曲线、背景和其他对象。请返回实际 update 补丁。',damaged,{kind:'repair',containerId:candidate.containers[0].id,regionId:worker.id},'repair')
  assert(repaired,'A real correction should produce a candidate');assert.equal(repaired.nodes.find(n=>n.id===target.id)?.label,'Encoder')
  for(const node of damaged.nodes.filter(n=>n.id!==target.id))assert.deepEqual(repaired.nodes.find(n=>n.id===node.id),node,'Unrelated objects must remain unchanged')
  const final=repaired??candidate,finalSvg=await page.evaluate(async doc=>{const {exportSvg}=await import('/src/core/svg.ts');return exportSvg(doc,{bounds:'content'})},final)
  writeFileSync(artifacts('final.svg'),finalSvg)
  const pixels=await auditReconstructionPixels(page,final,artifacts('quality'))
  const repairRun=JSON.parse(readFileSync(artifacts('repair.json'),'utf8'))
  const metrics={kind,version:status.version,source:{width:800,height:400,sha256:figure.references[0].sha256},initial:{reusedSavedRun:!!previous,nodes:candidate.nodes.length,regions:candidate.containers[0].reconstruction.regions.length,texts:candidate.nodes.filter(n=>n.kind==='text').map(n=>n.label),paths:candidate.nodes.filter(n=>n.path).length,warnings:candidate.containers[0].reconstruction.warnings},repair:{hasCandidate:!!repaired,corrected:'Ecnoder → Encoder',unrelatedObjectsUnchanged:true,revision:final.containers[0].reconstruction.revision,inputImage:repairRun.summary.inputImage},pixels,note:'Self-authored simple sample; this verifies image attachment and the reconstruction/repair protocol, not paper-wide reconstruction quality.'}
  writeFileSync(artifacts('metrics.json'),JSON.stringify(metrics,null,2));console.log(JSON.stringify(metrics))
} finally {
  if(activeRun){await api(`/runs/${activeRun}/cancel`,{}).catch(()=>{});for(let i=0;i<20;i++){const run=await api(`/runs/${activeRun}`).catch(()=>null);if(!run||run.status!=='running')break;await delay(200)}}
  if(session)await api(`/sessions/${session.id}`,{},'DELETE').catch(()=>{})
  await browser?.close();await server.close()
}
