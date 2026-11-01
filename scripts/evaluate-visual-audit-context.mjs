// Explicit paired context experiment; offline preparation is the default, models require --live.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFileSync,existsSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs'
import { resolve,join } from 'node:path'
import { parseArgs } from 'node:util'
import { createServer } from 'vite'
const {values:args}=parseArgs({options:{dataset:{type:'string',default:'benchmarks/visual-audit-context-v1'},output:{type:'string'},live:{type:'boolean',default:false},kind:{type:'string',default:'codex'},model:{type:'string'},timeout:{type:'string',default:'180'},order:{type:'string'}}})
assert(args.output,'Pass a fresh --output directory; the bundled development case is used unless --dataset is specified')
assert(['codex','claude'].includes(args.kind),'Use codex or claude')
const timeout=Number(args.timeout);assert(Number.isInteger(timeout)&&timeout>=30&&timeout<=600,'Timeout must be 30..600 seconds')
assert(!args.model||args.model.length<=100,'Model name is too long')
const dataset=resolve(args.dataset),output=resolve(args.output);assert(!existsSync(output),'Output already exists; preserve the previous experiment and choose a new directory')
mkdirSync(output,{recursive:true})
const save=(name,data)=>writeFileSync(join(output,name),JSON.stringify(data,null,2)),sha=value=>createHash('sha256').update(value).digest('hex')
const server=await createServer({configFile:false,cacheDir:join(output,'.vite'),server:{watch:null}})
const signal=new AbortController(),interrupt=()=>signal.abort(new DOMException('Experiment interrupted','AbortError'));process.once('SIGINT',interrupt)
try{
  const {createVisualAuditContext,visualAuditPrompt,visualAuditResponseSchema,parseVisualAuditResponse,canonicalFigureJson}=await server.ssrLoadModule('/src/core/visualAudit.ts')
  const {figureDocumentSchema}=await server.ssrLoadModule('/src/core/model.ts'),{rasterDimensions}=await server.ssrLoadModule('/server/harness/raster.ts')
  const {CodexAdapter,ClaudeAdapter}=await server.ssrLoadModule('/server/harness/adapters.ts')
  const manifestBytes=readFileSync(join(dataset,'manifest.json')),manifest=JSON.parse(manifestBytes)
  assert.equal(manifest.version,'visual-audit-context-v1','Dataset version mismatch')
  const readAsset=entry=>{const path=resolve(dataset,entry.path);assert(path.startsWith(`${dataset}/`),'Dataset asset must be inside its directory');const bytes=readFileSync(path);assert.equal(sha(bytes),entry.sha256,`Dataset fingerprint mismatch: ${entry.path}`);return{path,bytes}}
  const figure=figureDocumentSchema.parse(JSON.parse(readAsset(manifest.candidate).bytes.toString('utf8')))
  assert.equal(sha(canonicalFigureJson(figure)),manifest.candidate.figureSha256,'Candidate snapshot digest mismatch')
  readAsset(manifest.knownDefects) // Verify the label file, but never parse or append its answers to either prompt.
  assert.equal(manifest.task.kind,'repair');const task=manifest.task,context=createVisualAuditContext(figure,task),nativeToAlias=new Map([...context.aliases].map(([a,n])=>[n,a]))
  const sources=[['source',manifest.sourceRaster],['candidate',manifest.candidateRaster]].map(([name,expected])=>{
    const {path:sourcePath,bytes}=readAsset(expected),format=sourcePath.split('.').at(-1);assert(['webp','png'].includes(format),'Use WebP or PNG inputs')
    const dataUrl=`data:image/${format};base64,${bytes.toString('base64')}`,size=rasterDimensions(dataUrl)
    assert.equal(size.width,expected.width);assert.equal(size.height,expected.height)
    const file=`${name}.${format}`;writeFileSync(join(output,file),bytes)
    return{file,dataUrl,sha256:sha(bytes),...size}
  })
  const content='比较原图和当前候选，列出本区域可确认的视觉差异。识别不清的地方明确列为不确定，不要求产生问题。'
  const aliasesPrompt=visualAuditPrompt(context,content),directoryLine=`对象位置提示（不是原图答案）：${JSON.stringify(context.directory)}`
  const semanticDirectory=context.directory.map(row=>({...row,id:context.aliases.get(row.id)}))
  const semanticPrompt=aliasesPrompt.replace(directoryLine,`对象位置提示（不是原图答案）：${JSON.stringify(semanticDirectory)}`).replace('\n用户关注：',`\n分区名称：${context.worker.title||context.worker.id}\n用户关注：`)
  assert.notEqual(aliasesPrompt,semanticPrompt)
  const order=args.order??(parseInt(sources[1].sha256.slice(-2),16)%2?'aliases-first':'semantic-first')
  assert(['aliases-first','semantic-first'].includes(order),'Use --order aliases-first or semantic-first')
  const conditions=order==='aliases-first'?['aliases','semantic']:['semantic','aliases'],prompts={aliases:aliasesPrompt,semantic:semanticPrompt}
  const report={version:'visual-audit-context-v1',createdAt:new Date().toISOString(),mode:args.live?'live':'offline',kind:args.kind,model:args.model??'CLI configured default; identity not reported',timeoutSeconds:timeout,datasetVersion:manifest.version,datasetManifestSha256:sha(manifestBytes),caseId:manifest.id,knownDefectsSha256:manifest.knownDefects.sha256,candidateFigureSha256:manifest.candidate.figureSha256,order,inputs:sources.map(({dataUrl:_,...row})=>row),conditions:[],notes:['Same two exact image byte strings, same geometry and attention text; only directory identifiers and the semantic region name differ.','Each condition uses a new adapter and separate cwd. No retries, no patches or automatic quality verdict.','One controlled self-authored fixture, no statistical accuracy claim; source/candidate pixels and the explicit attention may still carry semantic information.']}
  save('context-map.json',{version:'aliases-v1',directory:context.directory,aliases:Object.fromEntries(context.aliases)})
  save('candidate.fastfigure.json',figure)
  const snapshotDir=join(output,'source-snapshots');mkdirSync(snapshotDir)
  for(const [from,to] of [['src/core/visualAudit.ts','visualAudit.ts'],['server/harness/adapters.ts','adapters.ts'],['scripts/evaluate-visual-audit-context.mjs','evaluate-visual-audit-context.mjs']]){copyFileSync(from,join(snapshotDir,to));report[`${to}Sha256`]=sha(readFileSync(from))}
  for(const condition of conditions){
    signal.signal.throwIfAborted()
    const cwd=join(output,condition);mkdirSync(cwd);writeFileSync(join(cwd,'prompt.txt'),prompts[condition])
    const entry={condition,promptSha256:sha(prompts[condition]),status:'prepared',activities:[]};report.conditions.push(entry);save('evaluation.json',report)
    if(!args.live)continue
    const adapter=args.kind==='codex'?new CodexAdapter():new ClaudeAdapter(),controller=new AbortController(),abort=()=>controller.abort(signal.signal.reason)
    signal.signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(()=>controller.abort(new Error('Experiment turn exceeded its explicit time budget')),timeout*1000)
    const started=Date.now();let outputSize=0
    try{
      const status=await adapter.status();entry.cliStatus=status;assert.equal(status.state,'ready',status.message);assert(!status.version?.includes('fixture'),'Real experiment cannot use a test CLI')
      entry.status='running';entry.startedAt=new Date(started).toISOString();save('evaluation.json',report);console.log(JSON.stringify({condition,phase:'started',version:status.version,output}))
      const raw=await adapter.send({cwd,content:prompts[condition],images:sources.map(({file,dataUrl})=>({path:join(output,file),dataUrl})),signal:controller.signal,...(args.model?{model:args.model}:{}),emit:(type,text)=>{outputSize+=text.length;if(outputSize>300_000)controller.abort(new Error('Experiment output budget exceeded'));if(type==='activity')entry.activities.push(text.slice(0,500))}})
      writeFileSync(join(cwd,'raw-response.txt'),raw)
      let wire=raw
      if(condition==='semantic'){
        const parsed=visualAuditResponseSchema.parse(JSON.parse(raw.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/,'$1')))
        for(const finding of parsed.findings)finding.objectIds=finding.objectIds.map(id=>{assert(nativeToAlias.has(id),'Control report references an unknown native object ID');return nativeToAlias.get(id)})
        wire=JSON.stringify(parsed)
      }
      const normalized=parseVisualAuditResponse(wire,context);writeFileSync(join(cwd,'report.json'),JSON.stringify(normalized,null,2));entry.status='completed';entry.findingCount=normalized.findings.length;entry.repairableCount=normalized.findings.filter(f=>f.repairable).length
      console.log(JSON.stringify({condition,phase:'completed',findings:normalized.findings.map(f=>({title:f.title,type:f.type,repairable:f.repairable,textEvidence:f.textEvidence}))}))
    }catch(e){entry.status=signal.signal.aborted?'cancelled':'failed';entry.error=e.message;process.exitCode=1;console.log(JSON.stringify({condition,phase:entry.status,error:entry.error}))}
    finally{clearTimeout(timer);signal.signal.removeEventListener('abort',abort);adapter.dispose();entry.seconds=(Date.now()-started)/1000;entry.finishedAt=new Date().toISOString();save('evaluation.json',report)}
  }
  report.finishedAt=new Date().toISOString();save('evaluation.json',report)
  console.log(JSON.stringify({mode:report.mode,order,conditions:report.conditions.map(({condition,status,seconds})=>({condition,status,seconds})),output}))
}finally{process.removeListener('SIGINT',interrupt);await server.close()}
