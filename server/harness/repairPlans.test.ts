import { afterEach,describe,expect,it,vi } from 'vitest'
import { createServer,type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { CodexAdapter,type HarnessAdapter } from './adapters'
import { HarnessService } from './service'
import { harnessHttp } from './http'
import { createExample,type FigureDocument } from '../../src/core/model'
import { reconstructionImageRect } from '../../src/core/reconstruction'
import type { ReconstructionTask } from '../../src/core/reconstructionContract'
const services:HarnessService[]=[],servers:Server[]=[]
afterEach(async()=>{await Promise.all(services.splice(0).map(s=>s.dispose()));await Promise.all(servers.splice(0).map(s=>new Promise<void>(resolve=>{s.closeAllConnections();s.close(()=>resolve())})));vi.restoreAllMocks()})
const fixture=fileURLToPath(new URL('./fixtures/cli.mjs',import.meta.url))
function image(figure:FigureDocument,regionId:string){const task:ReconstructionTask={kind:'repair',containerId:'stage',regionId},sourceRect=reconstructionImageRect(figure,task),bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(800,16);bytes.writeUInt32BE(400,20);return{regionId,image:{referenceSha256:figure.references[0]!.sha256,width:800,height:400,sourceRect,quality:'preview' as const,originalWidth:800,originalHeight:400,dataUrl:`data:image/png;base64,${bytes.toString('base64')}`}}}
async function setup(scenario='proposal',sent?:(call:number)=>void){
  let calls=0,instances=0
  const service=new HarnessService(()=>{const adapter=new CodexAdapter({command:process.execPath,args:[fixture],env:{...process.env,FASTFIGURE_TEST_SCENARIO:instances++===0?scenario:'proposal'}});const wrapped:HarnessAdapter={kind:adapter.kind,status:()=>adapter.status(),dispose:()=>adapter.dispose(),send:async turn=>{calls++;const result=await adapter.send(turn);sent?.(calls);return result}};return wrapped});services.push(service);const session=service.createSession('codex','Plan test'),figure=createExample()
  figure.references=[{id:'source',title:'Authored fixture',citation:'Self-authored test',fileName:'test.png',sha256:'a'.repeat(64),pixelWidth:800,pixelHeight:400,dataUrl:'data:image/png;base64,iVBORw0KGgo=',placement:{x:100,y:100,width:800,height:400}}]
  const initial=service.start({sessionId:session.id,figure,content:'Reconstruct test',selectedIds:[],task:{kind:'reconstruct',referenceId:'source',region:{x:0,y:0,width:1,height:1},destination:'new',parentId:'stage'}});await initial.done;expect(initial.status).toBe('completed')
  const candidate=initial.events.at(-1)!.proposal!,input={sessionId:session.id,parentRunId:initial.id,content:'Check selected regions',totalSeconds:180,perRunSeconds:60,regions:[image(candidate,'left'),image(candidate,'right')]}
  return{service,session,initial,candidate,input,calls:()=>calls}
}
describe('budgeted repair plans',()=>{
  it('keeps the current candidate and its true turn number across more than 50 no-op checks',async()=>{
    const {service,input,initial,session}=await setup()
    for(let i=0;i<52;i++){const plan=service.startPlan({...input,content:'RECONSTRUCTION_NO_CHANGE',regions:[input.regions[0]!]});await plan.done;expect(plan.state.reason).toBe('unchanged')}
    const history=service.history(session.id);expect(history.turns).toHaveLength(50);expect(history.omitted).toBe(3)
    expect(history.turns.find(t=>t.id===initial.id)).toMatchObject({ordinal:1,available:true,review:'pending'});expect(history.turns.at(-1)?.ordinal).toBe(53)
    expect(service.getRun(initial.id).status).toBe('completed');expect(history.turns.filter(t=>t.available).length).toBeLessThanOrEqual(20)
  },15_000)
  it('retains the selected parent after an unchanged plan while other sessions evict old snapshots',async()=>{
    const {service,input,initial,session}=await setup('slow'),job=service.startPlan({...input,content:'RECONSTRUCTION_NO_CHANGE'}),other=service.createSession('codex','Other work')
    for(let i=0;i<24;i++){const run=service.start({sessionId:other.id,figure:createExample(),content:`Other ${i}`,selectedIds:[]});await run.done}
    await job.done;expect(job.state.reason).toBe('unchanged');expect(service.getRun(initial.id).status).toBe('completed');expect(service.history(session.id).turns.find(t=>t.id===initial.id)?.available).toBe(true)
    expect(service.history(session.id).turns.filter(t=>t.available).length+service.history(other.id).turns.filter(t=>t.available).length).toBeLessThanOrEqual(20)
  },10_000)
  it('executes selected regions once in order, retains checkpoints and releases image payloads',async()=>{
    const {service,session,initial,candidate,input}=await setup(),saved=JSON.stringify(candidate),job=service.startPlan({...input,model:'test-model'})
    expect(service.listSessions()[0]!.activePlanId).toBe(job.state.id)
    expect(()=>service.start({sessionId:session.id,figure:createExample(),content:'Concurrent edit',selectedIds:[]})).toThrow('分区核对')
    expect(()=>service.review(initial.id,'applied')).toThrow('先停止')
    await job.done;const state=service.planSnapshot(job.state.id)
    expect(state.status).toBe('completed');expect(state.steps.map(s=>s.status)).toEqual(['changed','unchanged']);expect(state.latestCandidateRunId).toBe(state.steps[0]!.runId)
    for(const step of state.steps){const run=service.getRun(step.runId!);expect(run.canvasBaseline).toEqual(initial.baseFigure);expect(service.summary(run.id)).toMatchObject({model:'test-model',timeoutSeconds:60,review:'pending'})}
    expect(JSON.stringify(candidate)).toBe(saved);expect(job.inputs).toHaveLength(0);expect(JSON.stringify(service.history(session.id))).not.toContain('base64');expect(service.listSessions()[0]).not.toHaveProperty('activePlanId')
    expect(service.history(session.id).repairPlan?.id).toBe(state.id);expect(service.review(state.latestCandidateRunId,'applied').review).toBe('applied')
  })
  it('rejects invalid budgets, duplicates, foreign and handled parents, or malformed crops before calling the model',async()=>{
    const {service,input,initial,calls}=await setup(),other=service.createSession('codex','Other')
    for(const invalid of [{...input,totalSeconds:59},{...input,totalSeconds:1201},{...input,perRunSeconds:601},{...input,regions:[]},{...input,regions:[input.regions[0],input.regions[0]]}])expect(()=>service.startPlan(invalid)).toThrow('请求无效')
    expect(()=>service.startPlan({...input,sessionId:other.id})).toThrow('本会话')
    expect(()=>service.startPlan({...input,regions:[{...input.regions[0]!,image:{...input.regions[0]!.image,width:1200}}]})).toThrow('实际尺寸')
    expect(()=>service.startPlan({...input,regions:[{...input.regions[0]!,regionId:'missing'}]})).toThrow('分区已变化')
    service.review(initial.id,'discarded');expect(()=>service.startPlan(input)).toThrow('尚未处理');expect(calls()).toBe(1)
  })
  it('stops on an invalid patch and preserves the last candidate without running remaining regions',async()=>{
    const {service,input,initial,calls}=await setup(),job=service.startPlan({...input,content:'RECONSTRUCTION_BAD_PATCH'});await job.done
    expect(job.state.status).toBe('failed');expect(job.state.steps.map(s=>s.status)).toEqual(['failed','skipped']);expect(job.state.latestCandidateRunId).toBe(initial.id);expect(calls()).toBe(2)
    expect(service.summary(initial.id).review).toBe('pending');expect(job.inputs).toHaveLength(0)
  })
  it('cancels the active child and does not schedule subsequent work, including service disposal',async()=>{
    const {service,input,initial}=await setup('slow'),job=service.startPlan(input)
    service.cancelPlan(job.state.id,'stale');await job.done
    expect(job.state.status).toBe('stopped');expect(job.state.reason).toBe('stale');expect(job.state.steps.map(s=>s.status)).toEqual(['cancelled','skipped']);expect(job.state.latestCandidateRunId).toBe(initial.id)
    const next=service.startPlan(input);await service.dispose();expect(next.state.status).toBe('stopped');expect(next.state.steps[1]!.status).toBe('skipped');expect(next.inputs).toHaveLength(0)
  })
  it('does not start another model call when the remaining total budget is below 30 seconds',async()=>{
    let now=Date.now();const {service,input,calls}=await setup('proposal',call=>{if(call===2)now+=40_000})
    vi.spyOn(Date,'now').mockImplementation(()=>now)
    const job=service.startPlan({...input,totalSeconds:60});await job.done
    expect(job.state.reason).toBe('budget');expect(job.state.steps.map(s=>s.status)).toEqual(['changed','skipped']);expect(calls()).toBe(2);expect(service.planSnapshot(job.state.id).remainingSeconds).toBe(20)
  })
  it('treats an empty pass as finished with no promoted candidate and exposes metadata-only HTTP recovery',async()=>{
    const {service,input,initial}=await setup(),handler=harnessHttp(service),server=createServer((req,res)=>{void handler(req,res)});servers.push(server);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/harness`
    const response=await fetch(`${base}/repair-plans`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,content:'RECONSTRUCTION_NO_CHANGE'})});expect(response.status).toBe(202);const started=await response.json();await service.getPlan(started.id).done
    const result=await(await fetch(`${base}/repair-plans/${started.id}`)).json();expect(result.reason).toBe('unchanged');expect(result.latestCandidateRunId).toBe(initial.id);expect(result.steps.map((s:{status:string})=>s.status)).toEqual(['unchanged','unchanged']);expect(JSON.stringify(result)).not.toContain('base64')
    expect((await fetch(`${base}/repair-plans/${started.id}/cancel`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status).toBe(200)
    await service.removeSession(input.sessionId);expect((await fetch(`${base}/repair-plans/${started.id}`)).status).toBe(404)
  })
})
