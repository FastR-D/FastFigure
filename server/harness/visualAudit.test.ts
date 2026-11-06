import { afterEach,describe,expect,it } from 'vitest'
import { createHash } from 'node:crypto'
import { createServer,type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CodexAdapter,ClaudeAdapter,type HarnessTurn } from './adapters'
import { HarnessService } from './service'
import { harnessHttp } from './http'
import { createExample } from '../../src/core/model'
import { reconstructionImageRect } from '../../src/core/reconstruction'
import { canonicalFigureJson } from '../../src/core/visualAudit'
const fixture=fileURLToPath(new URL('./fixtures/cli.mjs',import.meta.url)),services:HarnessService[]=[],servers:Server[]=[]
afterEach(async()=>{await Promise.all(services.splice(0).map(s=>s.dispose()));await Promise.all(servers.splice(0).map(s=>new Promise<void>(resolve=>{s.closeAllConnections();s.close(()=>resolve())})))})
async function setup(Adapter:typeof CodexAdapter|typeof ClaudeAdapter=CodexAdapter,scenario='proposal'){
  let instances=0,started:()=>void=()=>undefined;const auditStarted=new Promise<void>(resolve=>{started=resolve}),sent:{instance:number;input:HarnessTurn}[]=[]
  const service=new HarnessService(()=>{const instance=++instances,adapter=new Adapter({command:process.execPath,args:[fixture],env:{...process.env,FASTFIGURE_TEST_SCENARIO:instance===2?scenario:'proposal'}});return{kind:adapter.kind,status:()=>adapter.status(),dispose:()=>adapter.dispose(),send:async(input:HarnessTurn)=>{sent.push({instance,input});if(instance===2)started();return adapter.send(input)}}});services.push(service)
  const session=service.createSession(Adapter===CodexAdapter?'codex':'claude','Visual audit'),figure=createExample();figure.references=[{id:'source',title:'Authored test',citation:'Self-authored',fileName:'test.png',sha256:'a'.repeat(64),pixelWidth:800,pixelHeight:400,dataUrl:'data:image/png;base64,iVBORw0KGgo=',placement:{x:100,y:100,width:800,height:400}}]
  const first=service.start({sessionId:session.id,figure,content:'Reconstruct fixture',selectedIds:[],task:{kind:'reconstruct',referenceId:'source',region:{x:0,y:0,width:1,height:1},destination:'new',parentId:'stage'}});await first.done;const candidate=first.events.at(-1)!.proposal!,task={kind:'repair' as const,containerId:'stage',regionId:'left'},bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(800,16);bytes.writeUInt32BE(400,20)
  const sourceImage={referenceSha256:figure.references[0]!.sha256,width:800,height:400,sourceRect:reconstructionImageRect(candidate,task),quality:'preview' as const,originalWidth:800,originalHeight:400,dataUrl:`data:image/png;base64,${bytes.toString('base64')}`},candidateImage={width:800,height:400,figureSha256:createHash('sha256').update(canonicalFigureJson(candidate)).digest('hex'),renderer:'fastfigure-browser-v1' as const,fonts:['400 20px MiSans'],dataUrl:`data:image/png;base64,${Buffer.concat([bytes,Buffer.from('candidate')]).toString('base64')}`}
  return{service,session,first,candidate,sent,auditStarted,input:{sessionId:session.id,parentRunId:first.id,regionId:'left',content:'核对视觉差异',sourceImage,candidateImage}}
}
describe('two-image independent visual audits',()=>{
  it('reviews the full canvas in isolation, checks byte and snapshot identity and retains a read-only report',async()=>{
    const {service,session,candidate,sent}=await setup(),figure=structuredClone(candidate),saved=JSON.stringify(figure),bytes=Buffer.alloc(24)
    Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(1600,16);bytes.writeUInt32BE(992,20)
    const image={dataUrl:`data:image/png;base64,${bytes.toString('base64')}`,width:1600,height:992,viewport:'canvas-1000x620',renderer:'fastfigure-browser-v1',fonts:[],figureSha256:createHash('sha256').update(canonicalFigureJson(figure)).digest('hex'),imageSha256:createHash('sha256').update(bytes).digest('hex')},input={sessionId:session.id,figure,intent:'design-review',designImage:image,content:'主图的视觉重点是什么？',catalogue:[],selectedIds:[]}
    for(const bad of [{...input,designImage:{...image,figureSha256:'b'.repeat(64)}},{...input,designImage:{...image,imageSha256:'b'.repeat(64)}},{...input,designImage:{...image,width:1000,height:620}},{...input,librarySearch:true}])expect(()=>service.start(bad)).toThrow()
    const run=service.start(input);await run.done;expect(run.status).toBe('completed');expect(sent.map(row=>row.instance)).toEqual([1,2])
    const request=sent[1]!.input;expect(request.cwd).toContain(run.id);expect(request.cwd).not.toBe(sent[0]!.input.cwd);expect(request.images).toHaveLength(1);expect(await readFile(request.images![0]!.path)).toEqual(bytes)
    expect(request.content).not.toContain('Authored test');expect(request.content).not.toContain('data:image')
    const summary=service.summary(run.id);expect(summary).toMatchObject({hasProposal:false,review:'none',designReview:{imageSha256:image.imageSha256},designReviewReport:{findings:[{id:'design-focus'}]}})
    expect(run.events.at(-1)?.designReviewReport).toEqual(summary.designReviewReport);expect(run.events.at(-1)?.proposal).toBeUndefined();expect(JSON.stringify(service.history(session.id))).not.toContain('base64')
    expect(service.getCandidateImage(run.id).bytes).toEqual(bytes);expect(JSON.stringify(figure)).toBe(saved);expect(()=>service.review(run.id,'applied')).toThrow('没有可审阅')
  })
  it('sends source then candidate in a fresh session, retains exact bytes and never proposes a figure',async()=>{
    const {service,input,first,candidate,sent}=await setup(ClaudeAdapter),saved=JSON.stringify(candidate),audit=service.startAudit(input);await audit.done
    expect(audit.status).toBe('completed');expect(sent.map(s=>s.instance)).toEqual([1,2]);expect(sent[1]!.input.images?.map(i=>i.dataUrl)).toEqual([input.sourceImage.dataUrl,input.candidateImage.dataUrl])
    for(const image of sent[1]!.input.images!)expect(await readFile(image.path)).toEqual(Buffer.from(image.dataUrl.split(',')[1]!,'base64'))
    expect(audit.events.at(-1)!.proposal).toBeUndefined();expect(audit.events.at(-1)!.auditReport?.findings[0]).toMatchObject({repairable:true,objectIds:['label']})
    const prompt=sent[1]!.input.content,directory=JSON.parse(prompt.split('对象位置提示（不是原图答案）：')[1]!.split('\n')[0]!)
    expect(directory.every((row:{id:string})=>/^v\d{4}$/.test(row.id))).toBe(true);expect(prompt).not.toContain('Encoder');expect(prompt).not.toContain('"id":"label"');expect(prompt).not.toContain('Authored test')
    expect(service.summary(audit.id).visualAudit?.contextVersion).toBe('aliases-v1')
    const context=JSON.parse(await readFile(join(sent[1]!.input.cwd,audit.id,'audit-context.json'),'utf8'))
    expect(Object.values(context.aliases)).toContain('label');expect(context.version).toBe('aliases-v1')
    expect(service.summary(audit.id)).toMatchObject({hasProposal:false,review:'none',visualAudit:{parentRunId:first.id},auditReport:{findings:[{id:'label-check'}]}});expect(service.summary(audit.id)).not.toHaveProperty('task')
    expect(JSON.stringify(service.history(input.sessionId))).not.toContain('base64');expect(JSON.stringify(candidate)).toBe(saved);expect(service.summary(first.id).review).toBe('pending');expect(()=>service.review(audit.id,'applied')).toThrow('没有可审阅')
    const handle=harnessHttp(service),server=createServer((req,res)=>{void handle(req,res)});servers.push(server);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/harness/runs/${audit.id}`
    for(const [suffix,expected] of [['input-image',input.sourceImage.dataUrl],['candidate-image',input.candidateImage.dataUrl]]){const response=await fetch(`${base}/${suffix}`);expect(response.headers.get('Cache-Control')).toBe('no-store');expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from(expected!.split(',')[1]!,'base64'))}
    await service.removeSession(input.sessionId);expect((await fetch(`${base}/candidate-image`)).status).toBe(404)
  })
  it('rejects stale snapshot hashes, scope errors, swapped dimensions and foreign parents before sending',async()=>{
    const {service,input,sent}=await setup(),other=service.createSession('codex','Other')
    for(const bad of [{...input,candidateImage:{...input.candidateImage,figureSha256:'b'.repeat(64)}},{...input,candidateImage:{...input.candidateImage,width:1200}},{...input,candidateImage:{...input.candidateImage,dataUrl:input.candidateImage.dataUrl.replace('iVBORw0KGgo','aGVsbG8AAAA')}},{...input,regionId:'missing'}])expect(()=>service.startAudit(bad)).toThrow()
    expect(()=>service.startAudit({...input,sessionId:other.id})).toThrow('本会话');expect(sent).toHaveLength(1)
  })
  it('keeps reports without a pass verdict and rejects malformed reports without affecting the parent',async()=>{
    const {service,input,first}=await setup(),empty=service.startAudit({...input,content:'AUDIT_EMPTY'});await empty.done
    expect(empty.status).toBe('completed');expect(service.summary(empty.id).auditReport?.findings).toEqual([]);expect(service.summary(empty.id).hasProposal).toBe(false)
    for(const content of ['AUDIT_BAD_OBJECT','AUDIT_BAD_JSON']){const run=service.startAudit({...input,content});await run.done;expect(run.status).toBe('failed');expect(service.summary(run.id).auditReport).toBeUndefined()}
    expect(service.summary(first.id).review).toBe('pending')
  })
  it('cancels the independent critic without disposing the drawing session or losing its candidate',async()=>{
    const {service,input,first,candidate,auditStarted,sent}=await setup(CodexAdapter,'stall'),audit=service.startAudit(input);await auditStarted;service.cancel(audit.id);await audit.done;expect(audit.status).toBe('cancelled')
    const repair=service.start({sessionId:input.sessionId,figure:candidate,content:'Repair label',selectedIds:[],task:{kind:'repair',containerId:'stage',regionId:'left'},refineFromRunId:first.id});await repair.done
    expect(repair.status).toBe('completed');expect(sent.at(-1)!.instance).toBe(1);expect(service.summary(first.id).review).toBe('pending')
  })
  it('merges two authoritative findings into one atomic repair and re-audits the resulting snapshot',async()=>{
    const {service,input,first,candidate,sent}=await setup(),audit=service.startAudit({...input,content:'AUDIT_MULTIPLE'});await audit.done
    const repair=service.start({sessionId:input.sessionId,figure:candidate,content:'核对已选问题',selectedIds:[],task:{kind:'repair',containerId:'stage',regionId:'left'},refineFromRunId:first.id,auditRepair:{auditRunId:audit.id,findingIds:['frame-color','label-check']}});await repair.done
    expect(repair.status).toBe('completed');expect(sent).toHaveLength(3)
    expect(sent.at(-1)!.input.content).toContain('确认后使用 #cdebdc');expect(sent.at(-1)!.input.content).not.toContain('此处无法读清')
    expect(service.summary(repair.id).auditRepair).toMatchObject({auditRunId:audit.id,findingIds:['label-check','frame-color'],regionId:'left'})
    const fixed=repair.events.at(-1)!.proposal!;expect(fixed.nodes.find(n=>n.reconstruction?.objectId==='label')?.label).toBe('Encoder corrected');expect(fixed.nodes.find(n=>n.reconstruction?.objectId==='frame')?.visual?.fill).toBe('#cdebdc')
    for(const n of candidate.nodes.filter(n=>!['label','frame'].includes(n.reconstruction?.objectId??'')))expect(fixed.nodes.find(row=>row.id===n.id)).toEqual(n)
    expect(repair.baseFigure).toEqual(candidate);expect(repair.canvasBaseline).toEqual(first.canvasBaseline)
    expect(()=>service.startAudit({...input,parentRunId:repair.id})).toThrow('快照不匹配')
    const recheck=service.startAudit({...input,parentRunId:repair.id,content:'修复后复审这版候选',candidateImage:{...input.candidateImage,figureSha256:createHash('sha256').update(canonicalFigureJson(fixed)).digest('hex')}});await recheck.done
    expect(service.summary(recheck.id)).toMatchObject({hasProposal:false,visualAudit:{parentRunId:repair.id,recheck:{auditRunId:audit.id,repairRunId:repair.id}},auditReport:{findings:[]}})
    expect(sent.map(s=>s.instance)).toEqual([1,2,1,3]);expect(service.summary(repair.id).review).toBe('pending')
    expect(service.history(input.sessionId).turns.find(t=>t.id===repair.id)?.auditRepair?.findings).toHaveLength(2)
  })
  it('rejects mixed reports, unconfirmed findings, wrong parents and changed scopes before invoking the model',async()=>{
    const {service,input,first,candidate,sent}=await setup(),audit=service.startAudit({...input,content:'AUDIT_MULTIPLE'});await audit.done
    const repair={sessionId:input.sessionId,figure:candidate,content:'Fix',selectedIds:[],task:{kind:'repair',containerId:'stage',regionId:'left'},refineFromRunId:first.id,auditRepair:{auditRunId:audit.id,findingIds:['label-check','frame-color']}}
    for(const findingIds of [[],['label-check','label-check'],['invented'],['label-check','unreadable']])expect(()=>service.start({...repair,auditRepair:{auditRunId:audit.id,findingIds}})).toThrow()
    expect(()=>service.start({...repair,auditRepair:{...repair.auditRepair,findings:[]}})).toThrow('请求无效')
    expect(()=>service.start({...repair,task:{...repair.task,regionId:'right'}})).toThrow('候选或分区不匹配')
    expect(()=>service.start({...repair,refineFromRunId:undefined})).toThrow('请求无效')
    expect(()=>service.start({...repair,auditRepair:{...repair.auditRepair,auditRunId:first.id}})).toThrow('审阅报告')
    const foreign=service.createSession('codex','Foreign'),foreignBase=service.start({sessionId:foreign.id,figure:first.baseFigure,content:'Reconstruct',selectedIds:[],task:service.summary(first.id).task});await foreignBase.done
    const foreignAudit=service.startAudit({...input,sessionId:foreign.id,parentRunId:foreignBase.id});await foreignAudit.done
    const before=sent.length;expect(()=>service.start({...repair,auditRepair:{...repair.auditRepair,auditRunId:foreignAudit.id}})).toThrow('本会话');expect(sent).toHaveLength(before)
    const child=service.start({...repair,auditRepair:undefined});await child.done
    expect(()=>service.start({...repair,figure:child.events.at(-1)!.proposal,refineFromRunId:child.id})).toThrow('候选或分区不匹配')
  })
  it('keeps the audited candidate after failed or empty merged repairs, without scheduling a recheck automatically',async()=>{
    const {service,input,first,candidate,sent}=await setup(),audit=service.startAudit({...input,content:'AUDIT_MULTIPLE'});await audit.done
    const repair={sessionId:input.sessionId,figure:candidate,content:'RECONSTRUCTION_BAD_PATCH',selectedIds:[],task:{kind:'repair',containerId:'stage',regionId:'left'},refineFromRunId:first.id,auditRepair:{auditRunId:audit.id,findingIds:['label-check','frame-color']}}
    const failed=service.start(repair);await failed.done;expect(failed.status).toBe('failed');expect(service.summary(failed.id).auditRepair?.findingIds).toHaveLength(2)
    const other=service.createSession('codex','Cleanup pressure');for(let i=0;i<22;i++){const run=service.start({sessionId:other.id,figure:createExample(),content:'Plain result',selectedIds:[]});await run.done}
    expect(service.summary(first.id).available).toBe(true);expect(service.summary(audit.id).available).toBe(false)
    const before=sent.length,unchanged=service.start({...repair,content:'RECONSTRUCTION_NO_CHANGE'});await unchanged.done
    expect(unchanged.status).toBe('completed');expect(unchanged.events.at(-1)!.proposal).toEqual(candidate);expect(sent).toHaveLength(before+1)
    expect(service.summary(unchanged.id).auditRepair?.findingIds).toHaveLength(2);expect(service.summary(first.id).review).toBe('pending')
  })
})
