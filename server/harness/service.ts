import {editableFigure} from '../../src/core/editableFigure.ts'
import {createDesignReviewContext,parseDesignReviewResponse,designReviewPrompt} from '../../src/core/designReview.ts'
import { selectedReferenceInputs,type ReferenceUse } from '../../src/core/referenceInputs.ts'
import {checkFigureText} from '../../src/core/figureTextCheck.ts'
import {compositionBaseKey,compositionSnapshotKey,parseCompositionPlanResponse,applyCompositionRecord} from '../../src/core/compositionPlan.ts'
import type {CompositionRecord} from '../../src/core/compositionPlanContract.ts'
import {recordHarnessStyle} from '../../src/core/styleAsset.ts'
import {catalogueAsset,catalogueKey,createCatalogue,searchCatalogue,describeCatalogue,type CatalogueEntry} from '../../src/core/catalogue.ts'
import {clone} from '../../src/core/model.ts'
import {catalogueSnapshotJson,validateCataloguePreviewLayout} from '../../src/core/cataloguePreview.ts'
import {cataloguePreviewInfo} from '../../src/core/cataloguePreviewContract.ts'
import {selectionPreviewGroups,selectionPreviewRequestSchema,selectionPreviewSubmissionSchema,validateSelectionPreviewPages,type SelectionPreviewRequest} from '../../src/core/selectionPreviews.ts'
import { createHash,randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { harnessPrompt, harnessRunInputSchema, parseHarnessResponse, type HarnessEvent, type HarnessKind, type HarnessRunInput, type HarnessSession, type HarnessTurn } from '../../src/core/harness.ts'
import { datasetInfo } from '../../src/core/chartDataset.ts'
import { parseChartRecommendationResponse } from '../../src/core/chartRecommendation.ts'
import type { ChartRecommendationReport } from '../../src/core/chartRecommendationContract.ts'
import { diffFigures } from '../../src/core/figureDiff.ts'
import type {ComponentLibraryStore} from '../componentLibrary/store.ts'
import {recallComponentCatalogue,prepareComponentSelection,finalizeComponentCatalogue,type RecallCandidates} from '../componentLibrary/recall.ts'
import type {RepositoryRecall} from '../../src/core/repositoryRecall.ts'
import {componentSnapshotJson} from '../../src/core/componentRepository.ts'
import {feedbackCanonicalJson,feedbackContextSchema,feedbackInputSchema,type FeedbackCapabilities} from '../../src/core/retrievalFeedback.ts'
import {componentImageQueryPrompt,parseComponentImageAnalysis,componentImageSearchQuery,componentSearchSnapshotSchema,type ComponentSearchSnapshot} from '../../src/core/componentSearch.ts'
import type {ReconstructionImage} from '../../src/core/reconstructionContract.ts'
import {componentRecipes} from '../../src/data/recipes.ts'
import {parseRepositorySelection,repositorySelectionPrompt} from '../../src/core/repositorySelection.ts'
import { ClaudeAdapter, CodexAdapter, type HarnessAdapter } from './adapters.ts'
import type { FigureDocument } from '../../src/core/model.ts'
import { parseReconstructionResponse, reconstructionCandidateGroup, referenceForReconstruction, repairContext, validateReconstructionImage } from '../../src/core/reconstruction.ts'
import { repairContentChanged,repairPlanInputSchema,type RepairPlan,type RepairPlanInput } from '../../src/core/repairPlan.ts'
import { rasterDimensions } from './raster.ts'
import { auditRepairEvidence,createVisualAuditContext,selectAuditFindings,canonicalFigureJson,parseVisualAuditResponse,visualAuditInputSchema,visualAuditPrompt,type AuditRepairInfo,type VisualAuditInfo,type VisualAuditInput,type VisualAuditReport } from '../../src/core/visualAudit.ts'

export class HarnessError extends Error {
  readonly status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
interface Session { info: HarnessSession; adapter: HarnessAdapter; cwd?: string; active?: string;plan?:string;lastPlan?:string;retainedCandidate?:string; turns: HarnessTurn[]; omitted: number }
interface PlanJob {state:RepairPlan;inputs:RepairPlanInput['regions'];done?:Promise<void>;stopReason?:'cancelled'|'stale'}
interface AuditExecution {input:VisualAuditInput;info:VisualAuditInfo;task:{kind:'repair';containerId:string;regionId:string}}
interface FeedbackCandidate {key:string;path:string;sha256:string;capabilities:FeedbackCapabilities}
interface SelectionPreviewExchange {directory:string;request:SelectionPreviewRequest;startedAt:number;pending?:{resolve:()=>void;reject:(reason:unknown)=>void};images:{bytes:Buffer;contentType:string;path:string}[];upload?:{digest:string;promise:Promise<void>}}
export interface Run {
  id: string; sessionId: string; status: 'running' | 'completed' | 'failed' | 'cancelled'
  events: HarnessEvent[]; controller: AbortController; listeners: Set<(event: HarnessEvent) => void>; done?: Promise<void>
  baseFigure: FigureDocument; canvasBaseline:FigureDocument; content: string
  inputImage?:{bytes:Buffer;contentType:string}
  candidateImage?:{bytes:Buffer;contentType:string}
  catalogueImage?:{bytes:Buffer;contentType:string}
  compositionInputs?:{catalogue:CatalogueEntry[];description:ReturnType<typeof describeCatalogue>}
  selectionInputs?:RecallCandidates
  selectionEvidence?:{prompt:string;response?:string}
  imageQueryEvidence?:{prompt:string;response?:string}
  selectionPreviewExchange?:SelectionPreviewExchange
  searchInputImage?:ReconstructionImage
  searchResult?:ComponentSearchSnapshot
  searchCapabilitiesKey?:string
  feedbackInputs?:CatalogueEntry[]
  feedbackCandidates?:FeedbackCandidate[]
  feedbackInherited?:FeedbackCandidate[]
}
export type AdapterFactory = (kind: HarnessKind) => HarnessAdapter
export const defaultAdapterFactory: AdapterFactory = kind => kind === 'codex'
  ? new CodexAdapter({ ...(process.env.FASTFIGURE_CODEX_COMMAND ? { command: process.env.FASTFIGURE_CODEX_COMMAND } : {}) })
  : new ClaudeAdapter({ ...(process.env.FASTFIGURE_CLAUDE_COMMAND ? { command: process.env.FASTFIGURE_CLAUDE_COMMAND } : {}) })

export class HarnessService {
  private sessions = new Map<string, Session>()
  private runs = new Map<string, Run>()
  private plans=new Map<string,PlanJob>()
  private factory: AdapterFactory
  constructor(factory: AdapterFactory = defaultAdapterFactory,private library?:ComponentLibraryStore) { this.factory = factory }
  async status() { return await Promise.all((['codex', 'claude'] as const).map(async kind => { const adapter = this.factory(kind); try { return await adapter.status() } finally { adapter.dispose() } })) }
  listSessions() { return [...this.sessions.values()].map(s => ({...s.info,...(s.plan?{activePlanId:s.plan}:{})})).reverse() }
  createSession(kind: HarnessKind, title: string): HarnessSession {
    if (this.sessions.size >= 12) throw new HarnessError(409, '最多保留 12 个会话，请先移除不需要的会话')
    const info = { id: randomUUID(), kind, title: title.trim().slice(0, 100) || '绘图会话', createdAt: new Date().toISOString() }
    this.sessions.set(info.id, { info, adapter: this.factory(kind), turns: [], omitted: 0 }); return info
  }
  history(id: string) {
    const session = this.sessions.get(id)
    if (!session) throw new HarnessError(404, '会话不存在，服务重启后请新建会话')
    return { turns: session.turns.map(t => ({ ...t, available: this.runs.has(t.id) })), omitted: session.omitted,...(session.lastPlan&&this.plans.has(session.lastPlan)?{repairPlan:this.planSnapshot(session.lastPlan)}:{}) }
  }
  summary(id: string): HarnessTurn {
    for (const session of this.sessions.values()) {
      const turn = session.turns.find(t => t.id === id)
      if (turn) return { ...turn, available: this.runs.has(id) }
    }
    throw new HarnessError(404, '运行不存在或已从本次服务的历史中清理')
  }
  review(id: string, decision: 'applied' | 'discarded'): HarnessTurn {
    const summary = this.summary(id), turn = this.sessions.get(summary.sessionId)!.turns.find(t => t.id === id)!
    if(this.sessions.get(summary.sessionId)?.plan)throw new HarnessError(409,'请先停止分区核对，再处理候选图')
    if (turn.status !== 'completed' || !turn.hasProposal) throw new HarnessError(409, '此轮没有可审阅的候选图')
    if (turn.review !== 'pending' && turn.review !== decision) throw new HarnessError(409, '此候选图已处理，请重新生成')
    turn.review = decision
    return { ...summary, review: decision }
  }
  private pruneRuns() {
    for (const [id, run] of this.runs) {
      if (this.runs.size <= 20) break
      const session = this.sessions.get(run.sessionId)
      if (run.status === 'running' || (session?.retainedCandidate??session?.info.lastRunId) === id||[...this.plans.values()].some(p=>p.state.status==='running'&&(p.state.latestCandidateRunId===id||p.state.parentRunId===id))) continue
      this.runs.delete(id)
      if (session?.cwd) void rm(join(session.cwd, id), { recursive: true, force: true }).catch(() => undefined)
    }
  }
  async removeSession(id: string) {
    const session = this.sessions.get(id)
    if (!session) throw new HarnessError(404, '会话不存在，服务重启后请新建会话')
    if (session.active||session.plan) throw new HarnessError(409, '请先停止当前运行或分区核对')
    this.sessions.delete(id); session.adapter.dispose()
    for (const [runId, run] of this.runs) if (run.sessionId === id) this.runs.delete(runId)
    for(const [planId,plan] of this.plans)if(plan.state.sessionId===id)this.plans.delete(planId)
    if (session.cwd) await rm(session.cwd, { recursive: true, force: true })
  }
  getRun(id: string): Run {
    const run = this.runs.get(id)
    if (!run) throw new HarnessError(404, '运行不存在或已从本次服务的历史中清理')
    return run
  }
  getInputImage(id:string){const image=this.getRun(id).inputImage;if(!image)throw new HarnessError(404,'本轮输入图片未保留，请使用工程参考图核对');return image}
  getCatalogueImage(id:string){const image=this.getRun(id).catalogueImage;if(!image)throw new HarnessError(404,'本轮组件图谱未保留或已清理');return image}
  getCandidateImage(id:string){const image=this.getRun(id).candidateImage;if(!image)throw new HarnessError(404,'本轮候选渲染已清理');return image}
  startAudit(raw:unknown){
    const parsed=visualAuditInputSchema.safeParse(raw);if(!parsed.success)throw new HarnessError(400,'视觉审阅请求无效，请检查两张裁片与预算')
    const input=parsed.data,parent=this.getRun(input.parentRunId),summary=this.summary(parent.id),candidate=parent.events.find(e=>e.type==='run.completed')?.proposal
    if(parent.sessionId!==input.sessionId||parent.status!=='completed'||summary.review!=='pending'||!candidate||!summary.task)throw new HarnessError(409,'请选择本会话尚未处理的重建候选')
    let task:AuditExecution['task']
    try{
      const group=reconstructionCandidateGroup(parent.baseFigure,candidate,summary.task);task={kind:'repair',containerId:group.id,regionId:input.regionId};repairContext(candidate,task)
      validateReconstructionImage(candidate,task,input.sourceImage)
      if(input.sourceImage.width!==input.candidateImage.width||input.sourceImage.height!==input.candidateImage.height)throw new Error('原图与候选裁片尺寸必须一致')
      if(createHash('sha256').update(canonicalFigureJson(candidate)).digest('hex')!==input.candidateImage.figureSha256)throw new Error('候选渲染对应的工程快照不匹配')
      for(const image of [input.sourceImage,input.candidateImage]){const dims=rasterDimensions(image.dataUrl);if(dims.width!==image.width||dims.height!==image.height)throw new Error('审阅图片实际尺寸与元数据不匹配')}
    }catch(e){throw new HarnessError(400,(e as Error).message)}
    const sourceImage=(({dataUrl:_,...info})=>info)(input.sourceImage),candidateImage=(({dataUrl:_,...info})=>info)(input.candidateImage),previous=summary.auditRepair,info:VisualAuditInfo={parentRunId:parent.id,containerId:task.containerId,regionId:task.regionId,contextVersion:'aliases-v1',sourceImage,candidateImage,...(previous?.regionId===task.regionId&&previous.containerId===task.containerId?{recheck:{auditRunId:previous.auditRunId,repairRunId:parent.id}}:{})}
    return this.start({sessionId:input.sessionId,figure:candidate,content:input.content,selectedIds:[],catalogue:[],task,inputImage:input.sourceImage,refineFromRunId:parent.id,...(input.model?{model:input.model}:{}),},undefined,{input,info,task})
  }
  start(raw: unknown,planId?:string,audit?:AuditExecution): Run {
    const parsed = harnessRunInputSchema.safeParse(raw)
    if (!parsed.success) throw new HarnessError(400, `运行请求无效：${[...new Set(parsed.error.issues.map(i=>i.message))].slice(0,3).join('；')}`)
    const input = parsed.data, session = this.sessions.get(input.sessionId)
    if (!session) throw new HarnessError(404, '会话不存在，服务重启后请新建会话')
    if(input.designImage){
      const image=input.designImage,bytes=Buffer.from(image.dataUrl.split(',')[1]!,'base64')
      try{if(image.viewport!==`canvas-${input.figure.canvas.width}x${input.figure.canvas.height}`)throw new Error('构图渲染须覆盖完整当前画布');const dims=rasterDimensions(image.dataUrl);if(dims.width!==image.width||dims.height!==image.height)throw new Error('构图渲染实际尺寸与元数据不匹配');if(createHash('sha256').update(canonicalFigureJson(input.figure)).digest('hex')!==image.figureSha256)throw new Error('构图渲染与工程快照不匹配');if(createHash('sha256').update(bytes).digest('hex')!==image.imageSha256)throw new Error('构图渲染字节指纹不匹配')}catch(e){throw new HarnessError(400,(e as Error).message)}
    }
    let adoptedSearch:ComponentSearchSnapshot|undefined
    if(input.intent==='find-components'&&!this.library)throw new HarnessError(503,'当前服务未配置本机素材库')
    if(input.componentSearchRunId){
      const source=this.getRun(input.componentSearchRunId);adoptedSearch=this.getComponentSearch(input.componentSearchRunId)
      if(source.sessionId!==input.sessionId)throw new HarnessError(409,'只能采用当前会话找到的素材')
      if(!isDeepStrictEqual(input.figure,adoptedSearch.figure)||!isDeepStrictEqual(input.task,adoptedSearch.task))throw new HarnessError(409,'画布、参考图或重建范围已变化，请重新看图找素材')
      if(!isDeepStrictEqual(input.inputImage,adoptedSearch.inputImage))throw new HarnessError(409,'采用素材时必须沿用检索时的实际裁片')
      input.catalogue=clone(adoptedSearch.catalogue)
    }
    if(input.libraryReview&&!input.librarySearch)throw new HarnessError(400,'助手筛选素材需要开启本机库自动检索')
    if(input.librarySearch&&(input.task||input.chartData||input.refineFromRunId||input.auditRepair||input.compositionPlanRunId))throw new HarnessError(400,'本机自动召回仅用于普通绘图和规划，其他任务使用已固定的素材')
    if(input.cataloguePreview){try{const preview=input.cataloguePreview;validateCataloguePreviewLayout(input.catalogue,preview);if(createHash('sha256').update(catalogueSnapshotJson(input.catalogue)).digest('hex')!==preview.snapshotSha256)throw new Error('组件图谱对应的素材快照已变化');const bytes=Buffer.from(preview.dataUrl.split(',')[1]!,'base64'),dimensions=rasterDimensions(preview.dataUrl);if(createHash('sha256').update(bytes).digest('hex')!==preview.sha256||dimensions.width!==preview.width||dimensions.height!==preview.height)throw new Error('组件图谱字节指纹或实际尺寸不符')}catch(e){throw new HarnessError(400,(e as Error).message)}}
    if(session.plan&&session.plan!==planId)throw new HarnessError(409,'当前会话正在分区核对，请先停止计划')
    if (session.active) throw new HarnessError(409, '当前会话已有运行，请等待或停止后重试')
    if (!session.plan&&[...this.sessions.values()].filter(s=>s.active||s.plan).length>=2) throw new HarnessError(409, '已有 2 个运行，请稍后重试')
    let adoptedComposition:CompositionRecord|undefined,repositoryRecall:RepositoryRecall|undefined=adoptedSearch?{...clone(this.summary(adoptedSearch.runId).repositoryRecall!),fromSearchRunId:adoptedSearch.runId}:undefined,selectionInputs:RecallCandidates|undefined
    if(input.compositionPlanRunId){
      const parent=this.getRun(input.compositionPlanRunId),source=this.summary(parent.id)
      if(parent.sessionId!==input.sessionId)throw new HarnessError(409,'只能采用当前会话的绘图方案')
      if(parent.status!=='completed'||source.intent!=='plan'||!source.compositionRecord||!parent.compositionInputs)throw new HarnessError(409,'请选择已完成且仍可用的绘图方案')
      if(source.compositionRecord.plan.status!=='ready')throw new HarnessError(409,'请先补充方案中的问题，再生成可采用方案')
      if(compositionBaseKey(input.figure)!==compositionBaseKey(parent.baseFigure))throw new HarnessError(409,'规划后画布或参考图已变化，请重新规划或还原后采用')
      if(compositionSnapshotKey(describeCatalogue(parent.compositionInputs.catalogue))!==compositionSnapshotKey(parent.compositionInputs.description))throw new HarnessError(409,'配方能力已变化，请重新规划')
      adoptedComposition=clone(source.compositionRecord)
      input.styleReference=adoptedComposition.styleReference?clone(adoptedComposition.styleReference):undefined
      input.catalogue=clone(parent.compositionInputs.catalogue)
      if(source.repositoryRecall)repositoryRecall={...clone(source.repositoryRecall),fromPlanRunId:parent.id}
      input.referenceInputs=(source.referenceInputs??[]).map(r=>({id:r.id,purpose:r.purpose}))
    }
    let canvasBaseline=input.figure,refinement:HarnessTurn['refinement']
    if(input.refineFromRunId){
      const parent=this.getRun(input.refineFromRunId),summary=this.summary(parent.id),candidate=parent.events.find(e=>e.type==='run.completed')?.proposal
      if(parent.sessionId!==input.sessionId)throw new HarnessError(409,'只能继续修复当前会话的候选图')
      if(parent.status!=='completed'||summary.review!=='pending'||!candidate||!summary.task)throw new HarnessError(409,'请选择尚未应用或丢弃的重建候选图')
      // Optional undefined fields disappear over HTTP/SSE; compare the exact JSON representation.
      if(!isDeepStrictEqual(JSON.parse(JSON.stringify(input.figure)),JSON.parse(JSON.stringify(candidate))))throw new HarnessError(409,'候选快照不匹配，请重新打开该轮详情')
      if(input.task?.kind!=='repair'||reconstructionCandidateGroup(parent.baseFigure,candidate,summary.task).id!==input.task.containerId)throw new HarnessError(400,'只能修复该候选的重建分组')
      canvasBaseline=parent.canvasBaseline
      refinement={parentRunId:parent.id,rootRunId:summary.refinement?.rootRunId??parent.id,round:(summary.refinement?.round??0)+1}
    }
    let auditRepair:AuditRepairInfo|undefined,repairEvidence=''
    if(input.auditRepair){
      const source=this.summary(input.auditRepair.auditRunId),context=source.visualAudit
      if(source.sessionId!==input.sessionId||source.status!=='completed'||!context||!source.auditReport)throw new HarnessError(409,'请选择本会话已完成的视觉审阅报告')
      if(context.parentRunId!==input.refineFromRunId||input.task?.kind!=='repair'||context.regionId!==input.task.regionId||context.containerId!==input.task.containerId)throw new HarnessError(409,'问题报告与本轮候选或分区不匹配，请重新核对')
      try{
        const selected=selectAuditFindings(source.auditReport,input.auditRepair.findingIds)
        auditRepair={auditRunId:source.id,findingIds:selected.map(f=>f.id),containerId:context.containerId,regionId:context.regionId,findings:selected.map(({id,title})=>({id,title}))}
        repairEvidence=auditRepairEvidence(source.auditReport,auditRepair.findingIds)
      }catch(e){throw new HarnessError(400,(e as Error).message)}
    }
    if (input.referenceId && !input.figure.references.some(r => r.id === input.referenceId)) throw new HarnessError(400, '所选参考图已不在当前工程')
    if(input.task){try{input.referenceId=referenceForReconstruction(input.figure,input.task).id;harnessPrompt(input)}catch(error){throw new HarnessError(400,error instanceof Error?error.message:'重建范围无效')}}
    if(input.task&&input.inputImage){try{validateReconstructionImage(input.figure,input.task,input.inputImage);const dimensions=rasterDimensions(input.inputImage.dataUrl);if(dimensions.width!==input.inputImage.width||dimensions.height!==input.inputImage.height)throw new Error('裁片实际像素尺寸与坐标元数据不匹配')}catch(error){throw new HarnessError(400,(error as Error).message)}}
    if(input.librarySearch){
      if(!this.library)throw new HarnessError(503,'当前服务未配置本机素材库，请关闭本机库自动检索后重试')
      try{
        if(input.libraryReview){selectionInputs=prepareComponentSelection(this.library,input.content,input.catalogue);input.catalogue=[];repositoryRecall=selectionInputs.report}
        else{const recalled=recallComponentCatalogue(this.library,input.content,input.catalogue);input.catalogue=clone(recalled.catalogue);repositoryRecall=recalled.report}
      }catch(error){throw new HarnessError(503,error instanceof Error&&!('issues'in error)?error.message:'本机素材召回失败，请检查素材库或关闭自动检索')}
    }
    if(!planId)session.retainedCandidate=input.componentSearchRunId??input.compositionPlanRunId??audit?.info.parentRunId??(auditRepair?input.refineFromRunId:undefined)
    const referenceInputs=selectedReferenceInputs(input).map(info=>({...info,inputSha256:createHash('sha256').update(Buffer.from(input.figure.references.find(r=>r.id===info.id)!.dataUrl.split(',')[1]!,'base64')).digest('hex')}))
    const run: Run = { id: randomUUID(), sessionId: input.sessionId, status: 'running', events: [], controller: new AbortController(), listeners: new Set(), baseFigure: input.figure,canvasBaseline, content: input.content }
    if(input.intent==='find-components'||adoptedSearch)run.searchInputImage=clone(input.inputImage!)
    if(selectionInputs){run.selectionInputs=clone(selectionInputs);if(repositoryRecall?.selection)repositoryRecall.selection={...repositoryRecall.selection,provider:session.info.kind,...(input.model?{model:input.model}:{}),evidenceRunId:run.id}}
    if(repositoryRecall){run.feedbackInputs=run.selectionInputs?.candidates??input.catalogue;if(repositoryRecall.fromPlanRunId||repositoryRecall.fromSearchRunId)run.feedbackInherited=clone(this.getRun((repositoryRecall.fromPlanRunId??repositoryRecall.fromSearchRunId)!).feedbackCandidates??[])}
    if(input.intent==='plan')run.compositionInputs={catalogue:clone(input.catalogue),description:describeCatalogue(input.catalogue)}
    this.runs.set(run.id, run); session.active = run.id
    session.info.lastRunId = run.id
    session.turns.push({ id: run.id, sessionId: run.sessionId,ordinal:session.omitted+session.turns.length+1, status: 'running', content: input.content, createdAt: new Date().toISOString(),
      ...(repositoryRecall?{repositoryRecall}:{}),
      ...(input.designImage?{designReview:{...(({dataUrl:_,...info})=>info)(input.designImage),contextVersion:'design-aliases-v1' as const}}:{}),...(input.styleReference?{styleReference:clone(input.styleReference)}:{}),...(input.model ? { model: input.model } : {}),...(input.intent?{intent:input.intent}:{}),...(adoptedComposition?{adoptedComposition}:{}),...(referenceInputs.length?{referenceInputs}:{}),...(input.chartData?{chartData:datasetInfo(input.chartData)}:{}),...(audit?{visualAudit:audit.info}:refinement?{refinement}:{}),...(auditRepair?{auditRepair}:{}),...(input.task&&!audit?{task:input.task}:{}),...(input.inputImage?{inputImage:(( {dataUrl:_,...info})=>info)(input.inputImage)}:{}),...(input.cataloguePreview?{cataloguePreview:cataloguePreviewInfo(input.cataloguePreview)}:{}), message: '', error: '', components: [], hasProposal: false, review: 'none', available: true })
    if (session.turns.length > 50) {
      const plan=session.plan?this.plans.get(session.plan)?.state:undefined,protectedIds=new Set([run.id,session.retainedCandidate,plan?.parentRunId,plan?.latestCandidateRunId])
      const index=session.turns.findIndex(t=>!protectedIds.has(t.id)),removed=session.turns.splice(index,1)[0]!
      this.runs.delete(removed.id);session.omitted++
    }
    this.pruneRuns()
    this.emit(run, 'run.started', '正在连接本机 Harness')
    run.done = this.execute(session, run, input,audit,repairEvidence)
    return run
  }
  cancel(id: string) {
    const run = this.getRun(id)
    if (run.status === 'running') run.controller.abort(new DOMException('运行已取消', 'AbortError'))
  }
  getPlan(id:string){const plan=this.plans.get(id);if(!plan)throw new HarnessError(404,'分区核对计划不存在或已清理');return plan}
  planSnapshot(id:string):RepairPlan {return structuredClone(this.getPlan(id).state)}
  cancelPlan(id:string,reason:'cancelled'|'stale'='cancelled'){
    const plan=this.getPlan(id);if(plan.state.status!=='running')return
    plan.stopReason??=reason;plan.state.stopping=true;plan.state.message='正在停止分区核对，已完成候选会保留'
    if(plan.state.activeRunId)this.cancel(plan.state.activeRunId)
  }
  startPlan(raw:unknown){
    const parsed=repairPlanInputSchema.safeParse(raw);if(!parsed.success)throw new HarnessError(400,'分区核对请求无效，请检查分区、裁片与运行预算')
    const input=parsed.data,session=this.sessions.get(input.sessionId);if(!session)throw new HarnessError(404,'会话不存在')
    if(session.active||session.plan)throw new HarnessError(409,'当前会话已有运行或核对计划')
    if([...this.sessions.values()].filter(s=>s.active||s.plan).length>=2)throw new HarnessError(409,'已有 2 个运行，请稍后重试')
    const parent=this.getRun(input.parentRunId),summary=this.summary(parent.id),candidate=parent.events.find(e=>e.type==='run.completed')?.proposal
    if(parent.sessionId!==input.sessionId||parent.status!=='completed'||summary.review!=='pending'||!candidate||!summary.task)throw new HarnessError(409,'请选择本会话尚未处理的重建候选')
    let group:ReturnType<typeof reconstructionCandidateGroup>,steps:RepairPlan['steps']
    try{
      group=reconstructionCandidateGroup(parent.baseFigure,candidate,summary.task)
      steps=input.regions.map(r=>{const task={kind:'repair' as const,containerId:group.id,regionId:r.regionId},context=repairContext(candidate,task);validateReconstructionImage(candidate,task,r.image);const dims=rasterDimensions(r.image.dataUrl);if(dims.width!==r.image.width||dims.height!==r.image.height)throw new Error('裁片实际尺寸不匹配');return{regionId:r.regionId,title:context.worker.title||r.regionId,status:'pending' as const}})
    }catch(e){throw new HarnessError(400,(e as Error).message)}
    const now=Date.now(),state:RepairPlan={id:randomUUID(),sessionId:input.sessionId,parentRunId:parent.id,latestCandidateRunId:parent.id,containerId:group.id,createdAt:new Date(now).toISOString(),status:'running',stopping:false,message:'按所选顺序逐区核对，结果等待人工审阅',steps}
    const job:PlanJob={state,inputs:input.regions};this.plans.set(state.id,job);session.plan=state.id;session.lastPlan=state.id
    for(const [id,p] of this.plans){if(this.plans.size<=24)break;if(p.state.status!=='running'&&this.sessions.get(p.state.sessionId)?.lastPlan!==id)this.plans.delete(id)}
    job.done=this.executePlan(job,input);return job
  }
  private async executePlan(job:PlanJob,input:RepairPlanInput){
    const state=job.state
    try{
      for(const [index,step] of state.steps.entries()){
        if(job.stopReason)break
        const parent=this.getRun(state.latestCandidateRunId),candidate=parent.events.find(e=>e.type==='run.completed')?.proposal
        if(!candidate)throw new Error('上一版候选已不可用，计划已停止')
        const run=this.start({sessionId:input.sessionId,figure:candidate,content:`按计划核对分区「${step.title}」，只修复可确认的问题；没有问题返回空补丁，不为产生差异而改图。\n${input.content}`,selectedIds:[],catalogue:[],task:{kind:'repair',containerId:state.containerId,regionId:step.regionId},inputImage:job.inputs[index]!.image,refineFromRunId:parent.id,...(input.model?{model:input.model}:{})},state.id)
        step.runId=run.id;step.status='running';state.activeRunId=run.id;state.message=`正在核对 ${index+1} / ${state.steps.length}：${step.title}`
        await run.done
        delete state.activeRunId
        if(run.status!=='completed'){step.status=run.status==='cancelled'?'cancelled':'failed';if(!job.stopReason)throw new Error(this.summary(run.id).error||'本轮已停止');break}
        const next=run.events.find(e=>e.type==='run.completed')?.proposal
        if(next&&repairContentChanged(candidate,next)){step.status='changed';state.latestCandidateRunId=run.id}else step.status='unchanged'
      }
      if(job.stopReason){state.status='stopped';state.reason=job.stopReason;state.message=job.stopReason==='stale'?'当前画布已变化，已停止；候选仍可回看':'已停止分区核对；保留最近候选'}
      else{state.status='completed';state.reason=state.steps.some(s=>s.status==='changed')?'completed':'unchanged';state.message=state.reason==='unchanged'?'所选分区未产生有效内容改动，保留原候选':'所选分区已核对，仍需人工检查并应用候选'}
    }catch(e){state.status='failed';state.reason='failed';state.message=`核对已停止：${(e as Error).message.slice(0,1000)}；保留最近候选`}
    finally{state.stopping=false;state.finishedAt=new Date(Date.now()).toISOString();delete state.activeRunId;for(const s of state.steps)if(s.status==='pending')s.status='skipped';job.inputs=[];const session=this.sessions.get(state.sessionId);if(session?.plan===state.id){session.plan=undefined;session.retainedCandidate=state.latestCandidateRunId}this.pruneRuns()}
  }
  referenceImage(id:string,index:number){
    const run=this.getRun(id),info=this.summary(id).referenceInputs?.find(r=>r.index===index),ref=info?run.baseFigure.references.find(r=>r.id===info.id):undefined
    if(!ref||!info)throw new HarnessError(404,'本轮参考图已清理或不存在')
    const format=/^data:image\/(png|jpeg|webp);base64,/.exec(ref.dataUrl)?.[1]
    if(!format)throw new HarnessError(404,'本轮参考图格式无效')
    return{bytes:Buffer.from(ref.dataUrl.split(',')[1]!,'base64'),contentType:`image/${format}`}
  }
  getSelectionEvidence(id:string){
    const evidence=this.getRun(id).selectionEvidence
    if(!evidence)throw new HarnessError(404,'本轮没有保留素材筛选原始记录')
    return{runId:id,...evidence,promptSha256:createHash('sha256').update(evidence.prompt).digest('hex'),...(evidence.response!==undefined?{responseSha256:createHash('sha256').update(evidence.response).digest('hex')}:{})}
  }
  getImageQueryEvidence(id:string){
    const evidence=this.getRun(id).imageQueryEvidence
    if(!evidence)throw new HarnessError(404,'本轮没有保留看图检索记录')
    return{runId:id,...evidence,promptSha256:createHash('sha256').update(evidence.prompt).digest('hex'),...(evidence.response!==undefined?{responseSha256:createHash('sha256').update(evidence.response).digest('hex')}:{})}
  }
  getSelectionPreviewRequest(id:string){
    const run=this.getRun(id),exchange=run.selectionPreviewExchange
    if(run.status!=='running'||!exchange?.pending||exchange.request.status!=='pending')throw new HarnessError(409,'本轮没有等待渲染的筛选图谱，请核对运行摘要')
    if(createHash('sha256').update(catalogueSnapshotJson(exchange.request.entries)).digest('hex')!==exchange.request.poolSha256)throw new HarnessError(409,'候选结构已变化，停止生成图谱')
    return selectionPreviewRequestSchema.parse(clone(exchange.request))
  }
  getSelectionPreviewImage(id:string,index:number){
    const value=this.getRun(id).selectionPreviewExchange?.images[index-1]
    if(!value)throw new HarnessError(404,'本轮筛选图谱已清理或尚未生成')
    return value
  }
  async submitSelectionPreviews(id:string,raw:unknown){
    const parsed=selectionPreviewSubmissionSchema.safeParse(raw)
    if(!parsed.success)throw new HarnessError(400,'筛选图谱提交无效')
    const run=this.getRun(id),exchange=run.selectionPreviewExchange,input=parsed.data
    if(!exchange||exchange.request.requestId!==input.requestId||run.sessionId!==input.sessionId)throw new HarnessError(409,'筛选图谱不属于当前运行或会话')
    if(input.error){if(run.status!=='running'||!exchange.pending||exchange.upload)throw new HarnessError(409,'本轮已经接收图谱或已结束');exchange.pending.reject(new Error(input.error));return{requestId:input.requestId,accepted:false}}
    const pages=input.previews!,digest=createHash('sha256').update(JSON.stringify(pages)).digest('hex')
    if(exchange.upload){if(exchange.upload.digest!==digest)throw new HarnessError(409,'本轮已提交另一份筛选图谱');await exchange.upload.promise;return{requestId:input.requestId,accepted:true}}
    if(run.status!=='running'||!exchange.pending)throw new HarnessError(409,'本轮已结束，不再接收图谱')
    const entries=exchange.request.entries,groups=selectionPreviewGroups(entries)
    try{
      if(createHash('sha256').update(catalogueSnapshotJson(entries)).digest('hex')!==exchange.request.poolSha256)throw new Error('候选结构已变化')
      validateSelectionPreviewPages(entries,pages)
      for(const [index,page]of pages.entries()){
        if(createHash('sha256').update(catalogueSnapshotJson(groups[index]!)).digest('hex')!==page.snapshotSha256)throw new Error('筛选图谱素材指纹不符')
        const bytes=Buffer.from(page.dataUrl.split(',')[1]!,'base64'),size=rasterDimensions(page.dataUrl)
        if(createHash('sha256').update(bytes).digest('hex')!==page.sha256||size.width!==page.width||size.height!==page.height)throw new Error('筛选图谱字节或实际尺寸不符')
      }
    }catch(error){throw new HarnessError(400,(error as Error).message)}
    const commit=async()=>{
      const images=pages.map((page,index)=>({bytes:Buffer.from(page.dataUrl.split(',')[1]!,'base64'),contentType:page.dataUrl.startsWith('data:image/png')?'image/png':'image/webp',path:join(exchange.directory,`selection-preview-${index+1}.${page.dataUrl.startsWith('data:image/png')?'png':'webp'}`)}))
      try{await Promise.all(images.map(image=>writeFile(image.path,image.bytes,{mode:0o600})));run.controller.signal.throwIfAborted();exchange.images=images;exchange.request.status='ready';exchange.request.entries=[]
        const report=clone(this.summary(id).repositoryRecall!);Object.assign(report.selection!.previews!,{status:'ready',sheets:pages.map(cataloguePreviewInfo),elapsedMs:Date.now()-exchange.startedAt});this.updateRepositoryRecall(run,report);exchange.pending?.resolve()
      }catch(error){exchange.pending?.reject(error);throw error}
    }
    exchange.upload={digest,promise:commit()};await exchange.upload.promise
    return{requestId:input.requestId,accepted:true}
  }
  getComponentSearch(id:string){
    const run=this.getRun(id),value=run.searchResult
    if(run.status!=='completed'||!value?.catalogue.length)throw new HarnessError(409,'请选择已完成且包含匹配素材的看图检索')
    if(createHash('sha256').update(catalogueSnapshotJson(value.catalogue)).digest('hex')!==value.catalogueSha256||compositionSnapshotKey(describeCatalogue(value.catalogue))!==run.searchCapabilitiesKey)throw new HarnessError(409,'冻结素材或配方能力已变化，请重新找素材')
    if(createHash('sha256').update(Buffer.from(value.inputImage.dataUrl.split(',')[1]!,'base64')).digest('hex')!==value.imageSha256)throw new HarnessError(409,'冻结裁片指纹不符，请重新找素材')
    return componentSearchSnapshotSchema.parse(clone(value))
  }
  async feedbackContext(id:string,key:string){
    if(!this.library)throw new HarnessError(503,'当前服务未配置本机反馈存储')
    const saved=this.library.feedbackContext(id,key);if(saved)return saved
    const run=this.getRun(id);if(run.status==='running')throw new HarnessError(409,'请等待本轮结束后核对素材适用性')
    const summary=this.summary(id),report=summary.repositoryRecall?clone(summary.repositoryRecall):undefined,candidate=run.feedbackCandidates?.find(row=>row.key===key),provider=this.sessions.get(run.sessionId)?.info.kind
    if(!report||!candidate)throw new HarnessError(404,'本轮冻结素材已清理或未包含此项，已有反馈可在本机记录查看')
    if(!provider)throw new HarnessError(404,'本轮会话已清理')
    let text:string;try{text=await readFile(candidate.path,'utf8')}catch{throw new HarnessError(503,'本轮冻结素材文件不可用，未改用当前素材库内容')}
    if(createHash('sha256').update(text).digest('hex')!==candidate.sha256)throw new HarnessError(503,'本轮冻结素材指纹不符')
    const asset=JSON.parse(text),context=feedbackContextSchema.parse({format:'fastfigure.retrieval-context',version:1,runId:id,sourceCreatedAt:summary.createdAt,componentKey:key,asset,assetSha256:candidate.sha256,capabilities:clone(candidate.capabilities),report,...(report.visualQuery&&run.searchInputImage?{referenceImage:{...clone(run.searchInputImage),sha256:report.visualQuery.imageSha256}}:{}),provider,...(summary.model?{model:summary.model}:{})})
    const declared=report.selection?.candidates.find(row=>row.key===key)?.assetSha256;if(declared&&declared!==candidate.sha256)throw new HarnessError(503,'素材与本轮筛选目录指纹不符')
    return{format:'fastfigure.retrieval-feedback' as const,version:1 as const,id:createHash('sha256').update(feedbackCanonicalJson(context)).digest('hex'),context,revisions:[]}
  }
  async recordFeedback(id:string,value:unknown){
    if(!this.library)throw new HarnessError(503,'当前服务未配置本机反馈存储')
    const input=feedbackInputSchema.safeParse(value);if(!input.success)throw new HarnessError(400,'反馈参数无效，请选择适用性并限制说明在 1000 字以内')
    const receipt=this.library.feedbackReceipt(id,input.data);if(receipt)return receipt
    const sample=await this.feedbackContext(id,input.data.componentKey)
    return this.library.recordFeedback(sample.context,input.data)
  }
  private updateRepositoryRecall(run:Run,report:RepositoryRecall){
    this.sessions.get(run.sessionId)!.turns.find(turn=>turn.id===run.id)!.repositoryRecall=clone(report)
    this.emit(run,'repository.updated')
  }
  private async freezeFeedbackInputs(run:Run,directory:string){
      if(run.feedbackInputs||run.feedbackInherited?.length){
        const candidates:FeedbackCandidate[]=[]
        for(const inherited of run.feedbackInherited??[]){
          run.controller.signal.throwIfAborted();const text=await readFile(inherited.path,'utf8')
          if(createHash('sha256').update(text).digest('hex')!==inherited.sha256)throw new Error('原方案冻结素材指纹不符')
          const path=join(directory,`feedback-${candidates.length}.json`);await writeFile(path,text,{mode:0o600});candidates.push({...inherited,path})
        }
        for(const entry of run.feedbackInputs??[]){
          run.controller.signal.throwIfAborted()
          const text=componentSnapshotJson(catalogueAsset(entry)),key=catalogueKey(entry),hash=createHash('sha256').update(text).digest('hex'),previous=candidates.find(row=>row.key===key)
          if(Buffer.byteLength(text)>2_000_000)throw new Error('单份冻结反馈素材超过 2 MB')
          if(previous){if(previous.sha256!==hash)throw new Error('采用方案的素材与原冻结内容不符');continue}
          const recipe=entry.kind==='recipe'?componentRecipes.find(row=>row.id===entry.id):undefined,capabilities:FeedbackCapabilities={kind:entry.kind,fields:recipe?clone(recipe.fields):[],defaults:recipe?clone(recipe.defaults):{}}
          const path=join(directory,`feedback-${candidates.length}.json`);await writeFile(path,text,{mode:0o600});candidates.push({key,path,sha256:hash,capabilities})
        }
        run.feedbackCandidates=candidates;run.feedbackInputs=undefined;run.feedbackInherited=undefined
      }
  }
  private async waitForSelectionPreviews(run:Run,entries:CatalogueEntry[],directory:string){
    const request=selectionPreviewRequestSchema.parse({runId:run.id,sessionId:run.sessionId,requestId:randomUUID(),poolSha256:createHash('sha256').update(catalogueSnapshotJson(entries)).digest('hex'),entries:clone(entries),status:'pending'})
    let resolve!:()=>void,reject!:(reason:unknown)=>void
    const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no}),startedAt=Date.now()
    const exchange:SelectionPreviewExchange={request,startedAt,directory,pending:{resolve,reject},images:[]};run.selectionPreviewExchange=exchange
    const abort=()=>reject(run.controller.signal.reason);run.controller.signal.addEventListener('abort',abort,{once:true})
    const report=clone(this.summary(run.id).repositoryRecall!);report.selection!.previews={requestId:request.requestId,evidenceRunId:run.id,poolSha256:request.poolSha256,candidateCount:entries.length,status:'pending',sheets:[]};report.selection!.message='等待浏览器渲染完整候选图谱';this.updateRepositoryRecall(run,report)
    this.emit(run,'activity',`正在准备 ${entries.length} 项冻结素材的实际图谱；浏览器需保持连接，刷新后可继续`)
    try{if(run.controller.signal.aborted)reject(run.controller.signal.reason);await promise;run.controller.signal.throwIfAborted()}
    catch(error){const current=clone(this.summary(run.id).repositoryRecall!);Object.assign(current.selection!.previews!,{status:run.controller.signal.aborted&&run.controller.signal.reason instanceof Error&&run.controller.signal.reason.name==='AbortError'?'cancelled':'failed',error:(error instanceof Error?error.message:'筛选图谱未生成').slice(0,1500),elapsedMs:Date.now()-startedAt});this.updateRepositoryRecall(run,current);throw error}
    finally{run.controller.signal.removeEventListener('abort',abort);exchange.pending=undefined;exchange.request.entries=[]}
  }
  private async findReconstructionComponents(session:Session,run:Run,input:HarnessRunInput,directory:string){
    const image=input.inputImage!,bytes=Buffer.from(image.dataUrl.split(',')[1]!,'base64'),format=image.dataUrl.startsWith('data:image/png')?'png':'webp',path=join(directory,`lookup-image.${format}`)
    const prompt=componentImageQueryPrompt(input.content,image)+'\n实际检索裁片指纹：'+createHash('sha256').update(bytes).digest('hex'),adapter=this.factory(session.info.kind),started=Date.now()
    run.inputImage={bytes,contentType:`image/${format}`};run.imageQueryEvidence={prompt}
    await writeFile(path,bytes,{mode:0o600});await writeFile(join(directory,'image-query-prompt.txt'),prompt,{mode:0o600})
    this.emit(run,'activity',`正在分析实际 ${image.width}×${image.height} 裁片，提取可见的素材检索线索；本轮不绘图`)
    let response:string,version:string|undefined
    try{
      const status=await adapter.status();if(status.state!=='ready'||!status.images)throw new Error('看图找素材需要可用的图片模型');version=status.version
      let emitted=0
      response=await adapter.send({cwd:directory,content:prompt,images:[{path,dataUrl:image.dataUrl}],signal:run.controller.signal,...(input.model?{model:input.model}:{}),emit:(type,text)=>{if(run.controller.signal.aborted)return;emitted+=text.length;if(emitted>20_000){run.controller.abort(new Error('看图检索输出超过 20000 字'));return}if(type==='activity')this.emit(run,'activity',`看图检索：${text}`)}})
      run.controller.signal.throwIfAborted()
    }finally{adapter.dispose()}
    run.imageQueryEvidence.response=response
    await writeFile(join(directory,'image-query-response.txt'),response,{mode:0o600})
    if(response.length>20_000)throw new Error('看图检索响应超过 20000 字')
    this.emit(run,'assistant.delta',response)
    const analysis=parseComponentImageAnalysis(response),searchQuery=componentImageSearchQuery(input.content,analysis)
    const initial=searchCatalogue(createCatalogue([]),searchQuery).filter(row=>row.score>0).map(row=>row.entry)
    const prepared=prepareComponentSelection(this.library!,searchQuery,initial,input.content)
    const rejected=new Set(prepared.candidates.filter(entry=>catalogueAsset(entry).figure.containers.some(c=>c.dataChart)).map(catalogueKey))
    prepared.candidates=prepared.candidates.filter(entry=>!rejected.has(catalogueKey(entry)))
    prepared.report.query=input.content
    prepared.report.visualQuery={analysis,searchQuery,image:(({dataUrl:_,...info})=>info)(image),imageSha256:createHash('sha256').update(bytes).digest('hex'),evidenceRunId:run.id,promptSha256:createHash('sha256').update(prompt).digest('hex'),responseSha256:createHash('sha256').update(response).digest('hex'),provider:session.info.kind,...(input.model?{model:input.model}:{}),...(version?{cliVersion:version}:{}),elapsedMs:Date.now()-started}
    const selection=prepared.report.selection!
    selection.candidates=selection.candidates.filter(row=>!rejected.has(row.key));selection.provider=session.info.kind;selection.evidenceRunId=run.id;if(input.model)selection.model=input.model
    for(const match of prepared.report.matches)if(match.componentKey&&rejected.has(match.componentKey)){match.decision='unavailable';match.note='数据图不能作为重建结构素材，未借用其观测值'}
    if(!prepared.candidates.length)Object.assign(selection,{status:'skipped',message:'没有可筛选的结构素材；可手动选择或继续逐图元描摹'})
    run.selectionInputs=clone(prepared);run.feedbackInputs=prepared.candidates
    this.updateRepositoryRecall(run,prepared.report)
    await this.freezeFeedbackInputs(run,directory)
    if(prepared.candidates.length){await this.waitForSelectionPreviews(run,prepared.candidates,directory);await this.selectRepositoryComponents(session,run,input,directory)}
    else run.selectionInputs=undefined
    run.searchResult=componentSearchSnapshotSchema.parse({runId:run.id,catalogue:clone(input.catalogue),catalogueSha256:createHash('sha256').update(catalogueSnapshotJson(input.catalogue)).digest('hex'),figure:clone(input.figure),task:clone(input.task),inputImage:clone(image),imageSha256:createHash('sha256').update(bytes).digest('hex')})
    run.searchCapabilitiesKey=compositionSnapshotKey(describeCatalogue(input.catalogue))
  }
  private async selectRepositoryComponents(session:Session,run:Run,input:HarnessRunInput,directory:string){
    const prepared=run.selectionInputs!,report=clone(this.summary(run.id).repositoryRecall!),selection=report.selection!,started=Date.now(),adapter=this.factory(session.info.kind)
    try{
      const prompt=repositorySelectionPrompt(input.content,prepared.candidates,report.visualQuery,selection.previews)
      if(prompt.length>160_000)throw new Error('素材筛选目录超过本轮文字预算，请改用指定素材')
      const folder=join(directory,'selection');await mkdir(folder,{recursive:true,mode:0o700})
      run.selectionEvidence={prompt};selection.promptSha256=createHash('sha256').update(prompt).digest('hex')
      await writeFile(join(folder,'prompt.txt'),prompt,{mode:0o600})
      selection.message='正在按完整要求逐项筛选素材';this.updateRepositoryRecall(run,report)
      this.emit(run,'activity',`正在独立模型会话筛选 ${prepared.candidates.length} 项冻结素材`)
      const status=await adapter.status();if(status.state!=='ready'||report.visualQuery&&!status.images)throw new Error(status.message||'素材筛选需要图片输入');selection.cliVersion=status.version
      let emitted=0
      const response=await adapter.send({cwd:folder,content:prompt,signal:run.controller.signal,...(report.visualQuery?{images:[{path:join(directory,`lookup-image.${run.searchInputImage!.dataUrl.startsWith('data:image/png')?'png':'webp'}`),dataUrl:run.searchInputImage!.dataUrl},...run.selectionPreviewExchange!.images.map(image=>({path:image.path,dataUrl:`data:${image.contentType};base64,${image.bytes.toString('base64')}`}))]}:{}),...(input.model?{model:input.model}:{}),emit:(type,text)=>{
        if(run.controller.signal.aborted)return
        emitted+=text.length;if(emitted>40_000){run.controller.abort(new Error('素材筛选输出超过 40000 字'));return}
        if(type==='activity')this.emit(run,'activity',`素材筛选：${text}`)
      }})
      run.controller.signal.throwIfAborted()
      if(response.length>40_000)throw new Error('素材筛选响应超过 40000 字')
      run.selectionEvidence.response=response;selection.responseSha256=createHash('sha256').update(response).digest('hex')
      await writeFile(join(folder,'response.txt'),response,{mode:0o600})
      const parsed=parseRepositorySelection(response,input.content,prepared.candidates)
      Object.assign(selection,{status:'completed',message:parsed.message,choices:parsed.choices,elapsedMs:Date.now()-started})
      const selected=finalizeComponentCatalogue(prepared,parsed.choices.filter(choice=>choice.decision==='include').map(choice=>choice.key),selection)
      if(report.visualQuery)selected.report.visualQuery=report.visualQuery
      input.catalogue=clone(selected.catalogue)
      if(input.intent==='plan')run.compositionInputs={catalogue:clone(input.catalogue),description:describeCatalogue(input.catalogue)}
      await writeFile(join(folder,'selection.json'),JSON.stringify(selected.report),{mode:0o600})
      this.updateRepositoryRecall(run,selected.report)
      this.emit(run,'activity',`素材筛选完成：保留 ${input.catalogue.length} 项，其余排除或不确定；${input.intent==='find-components'?'等待采用，不自动绘图':`继续生成待审${input.intent==='plan'?'方案':'图件'}`}`)
    }catch(error){
      const reason=run.controller.signal.aborted?run.controller.signal.reason:error
      Object.assign(selection,{status:reason instanceof Error&&reason.name==='AbortError'?'cancelled':'failed',message:(reason instanceof Error?reason.message:'素材筛选失败').slice(0,1500),elapsedMs:Date.now()-started})
      this.updateRepositoryRecall(run,report)
      throw error
    }finally{adapter.dispose();run.selectionInputs=undefined}
  }
  private emit(run: Run, type: HarnessEvent['type'], text?: string, proposal?: HarnessEvent['proposal'], components?: HarnessEvent['components'],auditReport?:VisualAuditReport,chartRecommendation?:ChartRecommendationReport,referenceUse?:ReferenceUse[],compositionRecord?:CompositionRecord,recipeUpdates?:HarnessEvent['recipeUpdates'],sharedYAxes?:HarnessEvent['sharedYAxes'],sharedLegends?:HarnessEvent['sharedLegends'],plotAlignments?:HarnessEvent['plotAlignments'],sharedColorbars?:HarnessEvent['sharedColorbars'],callouts?:HarnessEvent['callouts'],calloutReflows?:HarnessEvent['calloutReflows']) {
    const textCheck=type==='run.completed'&&proposal?checkFigureText(proposal):undefined,designReviewReport=type==='run.completed'?this.summary(run.id).designReviewReport:undefined
    const event: HarnessEvent = { sequence: run.events.length + 1, runId: run.id, sessionId: run.sessionId, timestamp: new Date().toISOString(), type,
      ...(text ? { text } : {}), ...(proposal ? { proposal } : {}), ...(components?.length ? { components } : {}),...(designReviewReport?{designReviewReport}:{}),...(auditReport?{auditReport}:{}),...(chartRecommendation?{chartRecommendation}:{}),...(referenceUse?.length?{referenceUse}:{}),...(textCheck?{textCheck}:{}),...(compositionRecord?{compositionRecord}:{}),...(recipeUpdates?.length?{recipeUpdates}:{}),...(sharedYAxes?.length?{sharedYAxes}:{}),...(sharedLegends?.length?{sharedLegends}:{}),...(plotAlignments?.length?{plotAlignments}:{}),...(sharedColorbars?.length?{sharedColorbars}:{}),...(callouts?.length?{callouts}:{}),...(calloutReflows?.length?{calloutReflows}:{}),...(type==='repository.updated'?{repositoryRecall:clone(this.summary(run.id).repositoryRecall!)}:{}) }
    run.events.push(event)
    const turn = this.sessions.get(run.sessionId)!.turns.find(t => t.id === run.id)!
    if (type === 'run.completed') { turn.message = text ?? ''; turn.components = components ?? []; turn.hasProposal = !!proposal; turn.review = proposal ? 'pending' : 'none' }
    if(referenceUse?.length)turn.referenceUse=referenceUse
    if(textCheck)turn.textCheck=textCheck
    if(compositionRecord)turn.compositionRecord=compositionRecord
    if(recipeUpdates?.length)turn.recipeUpdates=recipeUpdates
    if(sharedYAxes?.length)turn.sharedYAxes=sharedYAxes
    if(sharedLegends?.length)turn.sharedLegends=sharedLegends
    if(plotAlignments?.length)turn.plotAlignments=plotAlignments
    if(sharedColorbars?.length)turn.sharedColorbars=sharedColorbars
    if(callouts?.length)turn.callouts=callouts
    if(calloutReflows?.length)turn.calloutReflows=calloutReflows
    if(auditReport)turn.auditReport=auditReport
    if(chartRecommendation)turn.chartRecommendation=chartRecommendation
    if (type === 'run.failed') turn.error = text ?? '运行失败'
    if (type === 'run.cancelled') turn.message = '运行已停止'
    if (type !== 'run.started' && type.startsWith('run.')) { turn.status = run.status; turn.finishedAt = event.timestamp }
    for (const listener of run.listeners) listener(event)
  }
  private async execute(session: Session, run: Run, input: HarnessRunInput,audit?:AuditExecution,repairEvidence='') {
    let emitted = 0,pending='',flushTimer:ReturnType<typeof setTimeout>|undefined,auditAdapter:HarnessAdapter|undefined
    const flush=()=>{clearTimeout(flushTimer);flushTimer=undefined;if(pending){const text=pending;pending='';this.emit(run,'assistant.delta',text)}}
    try {
      run.controller.signal.throwIfAborted()
      session.cwd ??= await mkdtemp(join(tmpdir(), 'fastfigure-harness-'))
      const directory = join(session.cwd, run.id)
      await mkdir(directory, { recursive: true, mode: 0o700 })
      await this.freezeFeedbackInputs(run,directory)
      const auditContext=audit?createVisualAuditContext(input.figure,audit.task):undefined,designContext=input.intent==='design-review'?createDesignReviewContext(input.figure):undefined
      const referenceInputs=this.summary(run.id).referenceInputs??[]
      if((referenceInputs.length||input.task)&&!(await session.adapter.status()).images)throw new Error('当前 Harness 不支持图片，请移除参考图或切换入口')
      if(input.intent==='find-components'){await this.findReconstructionComponents(session,run,input,directory);run.status='completed';this.emit(run,'run.completed',`看图检索完成，保留 ${input.catalogue.length} 项素材。请核对裁片与匹配依据后采用；本轮没有绘图。`);return}
      const adoptedComposition=this.summary(run.id).adoptedComposition
      if(run.selectionInputs&&this.summary(run.id).repositoryRecall?.selection?.status==='pending')await this.selectRepositoryComponents(session,run,input,directory)
      run.controller.signal.throwIfAborted()
      const prompt = designContext?designReviewPrompt(designContext,input.content):auditContext?visualAuditPrompt(auditContext,input.content):harnessPrompt(input,referenceInputs,adoptedComposition,this.summary(run.id).repositoryRecall)+repairEvidence
      if(designContext)await writeFile(join(directory,'design-context.json'),JSON.stringify({version:'design-aliases-v1',directory:designContext.directory,aliases:Object.fromEntries(designContext.aliases),story:designContext.story}),{mode:0o600})
      if(designContext)this.emit(run,'activity','正在独立会话中审阅整图的视觉主次、结构搭配、表达和留白；只返回建议')
      if(auditContext)await writeFile(join(directory,'audit-context.json'),JSON.stringify({version:'aliases-v1',directory:auditContext.directory,aliases:Object.fromEntries(auditContext.aliases)}),{mode:0o600})
      if(audit)this.emit(run,'activity','正在独立会话中比较原图与候选渲染，只返回可定位的问题清单')
      else if(input.task)this.emit(run,'activity',input.task.kind==='reconstruct'?'正在识别选定原图区域，结果将转换为可编辑图元':'已固定分区对象与版本，正在生成局部修复补丁')
      else if(input.chartData){await writeFile(join(directory,'chart-data.json'),JSON.stringify(input.chartData),{mode:0o600});this.emit(run,'activity',`已固定 ${input.chartData.rows.length} 行、${input.chartData.columns.length} 列数据，正在分析可视化形式与字段映射`)}
      if (input.catalogue.length) this.emit(run, 'activity', `已附带 ${input.catalogue.length} 个参考组件快照`)
      const recalled=this.summary(run.id).repositoryRecall;if(recalled)this.emit(run,'activity',`${recalled.fromPlanRunId?'沿用方案固定的本机素材':'本机库文字匹配'}：${recalled.matches.filter(row=>row.decision==='included'||row.decision==='already-attached').length} 项进入本轮清单，适用性仍须核对`)
      await writeFile(join(directory, 'context.txt'), prompt, { mode: 0o600 })
      const images: { path: string; dataUrl: string }[]=[]
      const sources=input.task?input.figure.references.filter(r=>r.id===input.referenceId):referenceInputs.map(info=>input.figure.references.find(r=>r.id===info.id)!)
      for(const [i,ref]of sources.entries()){
        const dataUrl=input.inputImage?.dataUrl??ref.dataUrl,format=/^data:image\/(png|jpeg|webp);base64,/.exec(dataUrl)?.[1]
        if(!format)throw new Error('参考图格式无效')
        const path=join(directory,`reference-${i+1}.${format}`)
        await writeFile(path,Buffer.from(dataUrl.split(',')[1]!,'base64'),{mode:0o600});images.push({path,dataUrl})
        if(input.inputImage)run.inputImage={bytes:Buffer.from(dataUrl.split(',')[1]!,'base64'),contentType:`image/${format}`}
        this.emit(run,'activity',`已附带参考图：${ref.title}`)
        if(input.inputImage)this.emit(run,'activity',`已附带${input.inputImage.quality==='original'?'原图':'预览'}裁片：${input.inputImage.width}×${input.inputImage.height}；坐标由程序映射回原图`)
      }
      if(input.cataloguePreview){const dataUrl=input.cataloguePreview.dataUrl,path=join(directory,`catalogue-preview.${dataUrl.startsWith('data:image/png')?'png':'webp'}`);const bytes=Buffer.from(dataUrl.split(',')[1]!,'base64');await writeFile(path,bytes,{mode:0o600});images.push({path,dataUrl});run.catalogueImage={bytes,contentType:dataUrl.slice(5,dataUrl.indexOf(';'))};this.emit(run,'activity',`已按第2张图片附带 ${input.cataloguePreview.tiles.length} 项组件实际图谱，可在历史记录回看`)}
      if(audit){const dataUrl=audit.input.candidateImage.dataUrl,format=dataUrl.startsWith('data:image/png')?'png':'webp',path=join(directory,`candidate.${format}`);await writeFile(path,Buffer.from(dataUrl.split(',')[1]!,'base64'),{mode:0o600});images.push({path,dataUrl});run.candidateImage={bytes:Buffer.from(dataUrl.split(',')[1]!,'base64'),contentType:`image/${format}`};auditAdapter=this.factory(session.info.kind)}
      if(input.designImage){
        auditAdapter=this.factory(session.info.kind);if(!(await auditAdapter.status()).images)throw new Error('构图审阅需要支持图片的 Harness')
        const dataUrl=input.designImage.dataUrl,format=dataUrl.startsWith('data:image/png')?'png':'webp',path=join(directory,`design.${format}`),bytes=Buffer.from(dataUrl.split(',')[1]!,'base64');await writeFile(path,bytes,{mode:0o600});images.push({path,dataUrl});run.candidateImage={bytes,contentType:`image/${format}`}
      }
      run.controller.signal.throwIfAborted()
      const text = await (auditAdapter??session.adapter).send({ cwd: designContext?directory:session.cwd, content: prompt, signal: run.controller.signal,
        ...(input.model ? { model: input.model } : {}), ...(images.length ? { images } : {}),
        emit: (type, text) => {
          if (run.controller.signal.aborted||run.status!=='running') return
          emitted += text.length
          if (emitted > 300_000 || run.events.length > 5000) { run.controller.abort(new Error('Harness 输出超过限制，请缩小绘图任务')); return }
          if(type==='assistant.delta'){pending+=text;if(pending.length>=128)flush();else flushTimer??=setTimeout(flush,100)}else{flush();this.emit(run,type,text)}
        },
      })
      run.controller.signal.throwIfAborted()
      flush()
      if (text.length > 300_000) throw new Error('Harness 输出超过限制，请缩小绘图任务')
      if(designContext){const report=parseDesignReviewResponse(text,designContext);await writeFile(join(directory,'response.json'),JSON.stringify(report),{mode:0o600});session.turns.find(turn=>turn.id===run.id)!.designReviewReport=report;run.status='completed';this.emit(run,'run.completed',report.message);return}
      if(auditContext){const report=parseVisualAuditResponse(text,auditContext);await writeFile(join(directory,'response.json'),JSON.stringify(report),{mode:0o600});run.status='completed';this.emit(run,'run.completed',report.message,undefined,undefined,report);return}
      if(input.intent==='plan'){
        const planned=parseCompositionPlanResponse(text,run.id,input.content,input.catalogue,referenceInputs,input.styleReference)
        await writeFile(join(directory,'response.json'),JSON.stringify(planned),{mode:0o600});run.status='completed';this.emit(run,'run.completed',planned.message,undefined,undefined,undefined,undefined,planned.referenceUse,planned.compositionRecord);return
      }
      const chartResponse=input.chartData?parseChartRecommendationResponse(text,input.figure,input.chartData,referenceInputs):undefined
      const response = chartResponse??(input.task?parseReconstructionResponse(text,input.figure,input.task,input.inputImage,input.catalogue,input.cataloguePreview?cataloguePreviewInfo(input.cataloguePreview):undefined):parseHarnessResponse(text, input.figure, input.catalogue,referenceInputs,adoptedComposition,input.intent==='edit-recipes'))
      await writeFile(join(directory, 'response.json'), JSON.stringify(response), { mode: 0o600 })
      // A no-op repair retains its parent candidate; it has not reached the canvas yet.
      let candidate=response.figure??(input.refineFromRunId?input.figure:null)
      if(candidate&&input.figure.folder)candidate.folder=input.figure.folder
      if(candidate&&adoptedComposition)candidate=applyCompositionRecord(candidate,adoptedComposition,response.used)
      if(candidate&&input.styleReference)candidate=recordHarnessStyle(candidate,input.styleReference)
      const styleLines=input.styleReference?.lineStyle?candidate?.styleUses?.at(-1)?.lines:undefined
      const message=styleLines?`风格连线规范：可处理 ${styleLines.total} 条，调整 ${styleLines.changed} 条，保留 ${styleLines.skipped} 条；几何与端点绑定保持。\n${response.message}`.slice(0,5000):response.message
      const proposal = candidate && diffFigures(run.canvasBaseline,candidate).changes.length ? editableFigure(candidate) : undefined
      if(input.auditRepair&&proposal)session.retainedCandidate=run.id
      run.status = 'completed'; this.emit(run, 'run.completed', message, proposal, response.used,undefined,chartResponse?.chartRecommendation,('referenceUse' in response?response.referenceUse:undefined)??chartResponse?.chartRecommendation.referenceUse,undefined,'recipeUpdates'in response?response.recipeUpdates:undefined,'sharedYAxes'in response?response.sharedYAxes:undefined,'sharedLegends'in response?response.sharedLegends:undefined,'plotAlignments'in response?response.plotAlignments:undefined,'sharedColorbars'in response?response.sharedColorbars:undefined,'callouts'in response?response.callouts:undefined,'calloutReflows'in response?response.calloutReflows:undefined)
    } catch (e) {
      flush()
      const reason = run.controller.signal.aborted ? run.controller.signal.reason : e
      const cancelled = reason instanceof Error && reason.name === 'AbortError'
      const recall=this.summary(run.id).repositoryRecall
      if(recall?.selection?.status==='pending'){const report=clone(recall);Object.assign(report.selection!,{status:cancelled?'cancelled':'failed',message:(reason instanceof Error?reason.message:'素材筛选未完成').slice(0,1500)});this.updateRepositoryRecall(run,report)}
      run.status = cancelled ? 'cancelled' : 'failed'
      this.emit(run, cancelled ? 'run.cancelled' : 'run.failed', reason instanceof Error ? reason.message.slice(0, 1200) : 'Harness 运行失败')
    } finally { clearTimeout(flushTimer);auditAdapter?.dispose();run.selectionInputs=undefined;run.feedbackInputs=undefined;run.feedbackInherited=undefined;session.active = undefined }
  }
  async dispose() {
    for(const p of this.plans.values())if(p.state.status==='running')this.cancelPlan(p.state.id)
    for (const run of this.runs.values()) if (run.status === 'running') this.cancel(run.id)
    for (const session of this.sessions.values()) session.adapter.dispose()
    await Promise.allSettled([...this.runs.values()].flatMap(r => r.done ? [r.done] : []))
    await Promise.allSettled([...this.plans.values()].flatMap(p=>p.done?[p.done]:[]))
    await Promise.allSettled([...this.sessions.values()].flatMap(s => s.cwd ? [rm(s.cwd, { recursive: true, force: true })] : []))
    this.sessions.clear(); this.runs.clear();this.plans.clear()
  }
}
