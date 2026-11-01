import { describe,expect,it } from 'vitest'
import {createDesignReviewContext,parseDesignReviewResponse} from './designReview'
import { clone,createExample,type FigureDocument } from './model'
import { compileReconstruction,repairContext } from './reconstruction'
import type { ReconstructionTask } from './reconstructionContract'
import { auditRepairDraft,auditRepairEvidence,createVisualAuditContext,selectAuditFindings,canonicalFigureJson,parseVisualAuditResponse as parseAnonymousResponse,visualAuditPrompt } from './visualAudit'
// Fixtures use native object names for readability; the model protocol uses aliases only.
function parseVisualAuditResponse(text:string,figure:FigureDocument,task:Extract<ReconstructionTask,{kind:'repair'}>){
  const context=createVisualAuditContext(figure,task)
  let raw:unknown;try{raw=JSON.parse(text)}catch{return parseAnonymousResponse(text,context)}
  const wire=JSON.stringify(raw,(key,value)=>key==='objectIds'&&Array.isArray(value)?value.map(id=>[...context.aliases].find(([,native])=>native===id)?.[0]??id):value)
  return parseAnonymousResponse(wire,context)
}
export function auditFixture(){
  const original=createExample();original.references=[{id:'source',title:'Authored test',citation:'Self-authored',fileName:'test.png',sha256:'a'.repeat(64),pixelWidth:800,pixelHeight:400,dataUrl:'data:image/png;base64,iVBORw0KGgo=',placement:{x:100,y:100,width:800,height:400}}]
  const task={kind:'reconstruct' as const,referenceId:'source',region:{x:0,y:0,width:1,height:1},destination:'new' as const,parentId:'stage'},scene={canvas:{width:800,height:400},regions:[{id:'left',title:'Encoder',kind:'diagram',x:20,y:40,w:340,h:320},{id:'right',title:'Output',kind:'diagram',x:440,y:40,w:340,h:320}],nodes:[{id:'frame',owner:'left',type:'rect',x:40,y:70,w:280,h:220,fill:'#e9f1fb'},{id:'label',owner:'left',type:'text',x:70,y:85,w:200,h:35,text:'Ecnoder',fontSize:20,fill:'#233247'},{id:'output',owner:'right',type:'ellipse',x:520,y:150,w:140,h:70,fill:'#f2d8c7'}]}
  return{original,task,scene,figure:compileReconstruction(original,task,{message:'Controlled audit fixture',scene}).figure!,repair:{kind:'repair' as const,containerId:'stage',regionId:'left'}}
}
const issue={id:'text-check',title:'核对文字',type:'text',severity:'major',detail:'候选标签与原图不同',suggestion:'对照原图修正标签',box:{x:.2,y:.2,width:.3,height:.1},objectIds:['label'],textEvidence:{sourceText:'Encoder',candidateText:'Ecnoder',certainty:'clear'}}
const response=(findings:unknown[]= [issue])=>JSON.stringify({message:'请核对文字',findings,uncertainties:[]})
describe('independent visual audit reports',()=>{
  it('maps full-figure design opinions to position aliases while rejecting edits, scores and invented targets',()=>{
    const figure=createExample(),before=clone(figure),context=createDesignReviewContext(figure),alias=[...context.aliases].find(([,id])=>id==='encoder')![0]
    const raw={message:'待核对的设计建议',firstRead:'中心模块先吸引注意',keep:['保留输入输出关系'],findings:[{id:'focus',title:'主次待核对',category:'hierarchy',severity:'major',observation:'辅助边框与主模块相近',impact:'读者难以发现重点',suggestion:'减轻辅助边框',box:{x:.2,y:.2,width:.3,height:.2},objectIds:[alias]}],uncertainties:['需结合作者论点']},parse=(value:unknown)=>parseDesignReviewResponse(JSON.stringify(value),context)
    expect(parse(raw).findings[0]!.objectIds).toEqual(['encoder']);expect(figure).toEqual(before)
    expect(context.directory.find(row=>context.aliases.get(row.id)==='e1')?.kind).toBe('edge')
    expect(JSON.stringify(context.directory)).not.toContain('encoder')
    expect(()=>parse({...raw,keep:Array(5).fill('Over contract limit')})).toThrow()
    for(const extra of [{score:90},{figure},{patch:[]}])expect(()=>parse({...raw,...extra})).toThrow()
    expect(()=>parse({...raw,findings:[{...raw.findings[0],objectIds:['invented']}]})).toThrow('目录外')
    expect(()=>parse({...raw,findings:[{...raw.findings[0],box:{x:.9,y:0,width:.2,height:.1}}]})).toThrow('超出')
  })
  it('binds issues to the current editable region without changing the candidate',()=>{
    const {figure,repair}=auditFixture(),saved=clone(figure),report=parseVisualAuditResponse(response(),figure,repair)
    expect(report.findings[0]).toMatchObject({objectIds:['label'],repairable:true});expect(figure).toEqual(saved)
    expect(parseVisualAuditResponse(response([{...issue,type:'missing',objectIds:[]}]),figure,repair).findings[0]!.repairable).toBe(true)
  })
  it('marks manual objects, uncertain findings and excluded scope as requiring manual confirmation',()=>{
    const {figure,repair}=auditFixture(),label=figure.nodes.find(n=>n.reconstruction?.objectId==='label')!;figure.nodes.push({...clone(label),id:'manual',label:'Manual note',reconstruction:undefined})
    const protectedId=repairContext(figure,repair).catalog.readOnlyContext.find(n=>n.id.startsWith('protected-'))!.id
    const report=parseVisualAuditResponse(response([{...issue,id:'manual-check',objectIds:[protectedId],textEvidence:{sourceText:'Manual note',candidateText:'Manual note',certainty:'clear'}},{...issue,id:'uncertain',severity:'uncertain'},{...issue,id:'outside',box:{x:.97,y:.97,width:.02,height:.02}}]),figure,repair)
    expect(report.findings.map(f=>f.repairable)).toEqual([false,false,false]);expect(report.findings[0]!.repairNote).toContain('只读')
  })
  it('rejects fabricated IDs, out-of-image positions, duplicate issues and executable figure/patch outputs',()=>{
    const {figure,repair}=auditFixture()
    for(const text of [response([{...issue,objectIds:['invented']}]),response([{...issue,box:{x:.9,y:.2,width:.3,height:.1}}]),response([issue,issue]),'{"message":"Wrong mode","figure":null}','not JSON'])expect(()=>parseVisualAuditResponse(text,figure,repair)).toThrow()
    expect(parseVisualAuditResponse(response([]),figure,repair).findings).toEqual([])
  })
  it('hashes the complete snapshot consistently across JSON transport while preserving draw order',()=>{
    const {figure}=auditFixture(),reordered=Object.fromEntries(Object.entries(figure).reverse()) as typeof figure
    expect(canonicalFigureJson(reordered)).toBe(canonicalFigureJson(figure));expect(canonicalFigureJson(JSON.parse(JSON.stringify(figure)))).toBe(canonicalFigureJson(figure))
    const changed=clone(figure);changed.nodes.reverse();expect(canonicalFigureJson(changed)).not.toBe(canonicalFigureJson(figure))
  })
  it('retains but blocks text findings whose transcription contradicts the actual candidate text',()=>{
    const {figure,repair}=auditFixture(),report=parseVisualAuditResponse(response([{...issue,textEvidence:{sourceText:'Encoder',candidateText:'Encoder',certainty:'clear'}}]),figure,repair)
    expect(report.findings[0]).toMatchObject({repairable:false,candidateTextVerified:false});expect(report.findings[0]!.repairNote).toContain('转录与图元不一致')
    expect(()=>parseVisualAuditResponse(response([{...issue,textEvidence:undefined}]),figure,repair)).toThrow('分别转录')
  })
  it('gives the critic image order and geometry hints without source answers or candidate text',()=>{
    const {figure,repair}=auditFixture(),prompt=visualAuditPrompt(createVisualAuditContext(figure,repair),'检查细节')
    expect(prompt).toContain('图 1');expect(prompt).toContain('图 2');expect(prompt).not.toContain('Ecnoder');expect(prompt).not.toContain('Encoder');expect(prompt).not.toContain('base64')
  })
  it('merges selected confirmed findings in report order while refusing unknown, duplicate and uncertain selections',()=>{
    const {figure,repair}=auditFixture(),report=parseVisualAuditResponse(response([issue,{...issue,id:'color',type:'color',objectIds:['frame'],title:'核对框色'},{...issue,id:'uncertain',severity:'uncertain'}]),figure,repair)
    expect(selectAuditFindings(report,['color',issue.id]).map(f=>f.id)).toEqual([issue.id,'color'])
    for(const ids of [[],[issue.id,issue.id],['unknown'],[issue.id,'uncertain']])expect(()=>selectAuditFindings(report,ids)).toThrow()
    const draft=auditRepairDraft(report,['color',issue.id]),evidence=auditRepairEvidence(report,[issue.id])
    expect(draft).toContain('2 个视觉问题');expect(draft.indexOf(issue.title)).toBeLessThan(draft.indexOf('核对框色'))
    expect(evidence).toContain('"candidateText":"Ecnoder"');expect(evidence).not.toContain('核对框色')
  })
  it('keeps all twelve maximal findings as evidence without overflowing the editable draft',()=>{
    const {figure,repair}=auditFixture(),report=parseVisualAuditResponse(response(Array.from({length:12},(_,i)=>({...issue,id:`issue-${i}`,title:'题'.repeat(100),detail:'差'.repeat(500),suggestion:'改'.repeat(600)}))),figure,repair),ids=report.findings.map(f=>f.id)
    expect(auditRepairDraft(report,ids).length).toBeLessThan(12000)
    const evidence=auditRepairEvidence(report,ids);for(const f of report.findings){expect(evidence).toContain(`"id":"${f.id}"`);expect(evidence).toContain(f.detail);expect(evidence).toContain(f.suggestion)}
  })
  it('keeps the critic prompt byte-identical when semantic IDs, titles and provenance names change',()=>{
    const {figure,repair}=auditFixture(),renamed=clone(figure),regions=new Map([['left','secret_attention'],['right','secret_output']])
    renamed.title='PRIVATE_PAPER_TITLE';renamed.references[0]!.title='PRIVATE_REFERENCE_NAME';renamed.references[0]!.citation='PRIVATE_CITATION'
    for(const [i,n] of renamed.nodes.entries()){n.id=`native_${i}`;n.name=`PRIVATE_NODE_NAME_${i}`;if(n.reconstruction){n.reconstruction.objectId=`secret_operator_${i}`;if(n.reconstruction.owner)n.reconstruction.owner=regions.get(n.reconstruction.owner)}}
    for(const c of renamed.containers)if(c.reconstruction){for(const region of c.reconstruction.regions){region.id=regions.get(region.id)!;region.title='PRIVATE_REGION_NAME'}}
    const original=createVisualAuditContext(figure,repair),changed=createVisualAuditContext(renamed,{...repair,regionId:'secret_attention'})
    expect(visualAuditPrompt(original,'检查细节')).toBe(visualAuditPrompt(changed,'检查细节'))
    expect([...changed.aliases.values()]).not.toEqual([...original.aliases.values()]);expect(original.directory.every(row=>/^v\d{4}$/.test(row.id))).toBe(true)
  })
  it('accepts only this context’s aliases and maps them before text verification and repair selection',()=>{
    const {figure,repair}=auditFixture(),context=createVisualAuditContext(figure,repair),alias=[...context.aliases].find(([,native])=>native==='label')![0]
    expect(()=>parseAnonymousResponse(response(),context)).toThrow('目录外的对象别名')
    const parsed=parseAnonymousResponse(response([{...issue,objectIds:[alias]}]),context)
    expect(parsed.findings[0]).toMatchObject({objectIds:['label'],candidateTextVerified:true,repairable:true});expect(auditRepairEvidence(parsed,[issue.id])).toContain('"objectIds":["label"]')
    expect(()=>parseAnonymousResponse(response([{...issue,objectIds:['v9999']}]),context)).toThrow('目录外的对象别名')
  })
  it('does not confuse native IDs that resemble aliases with the current wire directory',()=>{
    const {figure,repair}=auditFixture();figure.nodes.find(n=>n.reconstruction?.objectId==='label')!.reconstruction!.objectId='v0001'
    const context=createVisualAuditContext(figure,repair),alias=[...context.aliases].find(([,native])=>native==='v0001')![0]
    expect(alias).not.toBe('v0001');expect(parseAnonymousResponse(response([{...issue,objectIds:[alias]}]),context).findings[0]).toMatchObject({objectIds:['v0001'],repairable:true})
    expect(parseAnonymousResponse(response([{...issue,objectIds:['v0001']}]),context).findings[0]).toMatchObject({objectIds:['frame'],repairable:false,candidateTextVerified:false})
  })
})
