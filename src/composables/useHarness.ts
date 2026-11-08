import { selectedReferenceInputs,referenceSelectionSchema,type ReferenceSelection,type ReferencePurpose } from '../core/referenceInputs'
import { computed, ref, shallowRef, watch } from 'vue'
import { z } from 'zod'
import { harnessEventSchema, harnessHistorySchema, harnessSessionSchema, harnessStatusSchema, harnessTurnSchema, type HarnessKind, type HarnessSession, type HarnessStatus, type HarnessTurn } from '../core/harness'
import { clone, figureDocumentSchema, type FigureDocument } from '../core/model'
import type { Editor } from './useEditor'
import {galleryBenchmarks} from '../data/galleryBenchmarks'
import {paperExamples} from '../data/paperExamples'
import { catalogueKey, createCatalogue, recommendCatalogue, searchCatalogue, type ComponentUse } from '../core/catalogue'
import type { ReconstructionTask } from '../core/reconstructionContract'
import { reconstructionCandidateGroup, referenceForReconstruction, repairContext } from '../core/reconstruction'
import { prepareReconstructionImage } from '../core/reconstructionImage'
import {componentSearchSnapshotSchema,type ComponentSearchSnapshot} from '../core/componentSearch'
import {catalogueSnapshotJson} from '../core/cataloguePreview'
import {prepareCataloguePreview,prepareSelectionPreviews} from '../core/cataloguePreviewImage'
import {selectionPreviewRequestSchema} from '../core/selectionPreviews'
import { repairPlanSchema,type RepairPlan } from '../core/repairPlan'
import { prepareDesignReviewImage,prepareVisualAuditImages } from '../core/visualAuditImage'
import { auditRepairDraft,selectAuditFindings,type AuditRepairSelection } from '../core/visualAudit'
import { chartDatasetSchema } from '../core/chartDataset'
import {recipeUpdateTargets} from '../core/recipeUpdate'
import {compositionBaseKey} from '../core/compositionPlan'
import type {CompositionRecord} from '../core/compositionPlanContract'

class HarnessApiError extends Error {constructor(readonly status:number,message:string){super(message)}}

const runSnapshotSchema = z.object({ id: z.uuid(), sessionId: z.uuid(), status: z.enum(['running','completed','failed','cancelled']),
  baseFigure: figureDocumentSchema,canvasBaseline:figureDocumentSchema, content: z.string(), events: z.array(harnessEventSchema), summary: harnessTurnSchema })
export function createHarness(editor: Editor) {
  const statuses = ref<HarnessStatus[]>([]), sessions = ref<HarnessSession[]>([]), selectedSessionId = ref(''), kind = ref<HarnessKind>('codex')
  const models = ref({ codex: '', claude: '' })
  const selectedReferences=computed(()=>editor.figure.value.references.flatMap(ref=>{const choice=referenceSelections.value.find(r=>r.id===ref.id);return choice?[choice]:[]}))
  watch(()=>editor.figure.value.references.map(r=>r.id),ids=>{referenceSelections.value=referenceSelections.value.filter(r=>ids.includes(r.id))})
  function toggleReference(id:string,on:boolean){if(!on){referenceSelections.value=referenceSelections.value.filter(r=>r.id!==id);return}if(!referenceSelections.value.some(r=>r.id===id))referenceSelections.value.push({id,purpose:'style'})}
  function setReferencePurpose(id:string,purpose:ReferencePurpose){if(editor.assistantDataset.value&&purpose==='content'){error.value='数据选图只借鉴样式或构图，请选择对应用途';return}const item=referenceSelections.value.find(r=>r.id===id);if(item)item.purpose=purpose}
  const model = computed({ get: () => models.value[kind.value], set: (value: string) => { models.value[kind.value] = value } })
  const referenceSelections=ref<ReferenceSelection[]>([])
  const attachReference=computed({get:()=>referenceSelections.value.some(r=>r.id===editor.activeReference.value?.id),set:(value:boolean)=>{const id=editor.activeReference.value?.id;if(id)toggleReference(id,value)}})
  const draft = ref(''), loading = ref(false), sending = ref(false), cancelling = ref(false), error = ref(''), connection = ref('')
  const intent=ref<'draw'|'plan'|'edit-recipes'|'design-review'>('draw'),adoptedComposition=shallowRef<{record:CompositionRecord;baseKey:string}|null>(null)
  const compositionStale=computed(()=>!!adoptedComposition.value&&compositionBaseKey(editor.figure.value)!==adoptedComposition.value.baseKey)
  function clearComposition(){adoptedComposition.value=null}
  const adoptedComponentSearch=shallowRef<ComponentSearchSnapshot|null>(null)
  const componentSearchStale=computed(()=>!!adoptedComponentSearch.value&&JSON.stringify(editor.figure.value)!==JSON.stringify(adoptedComponentSearch.value.figure))
  function clearComponentSearch(){adoptedComponentSearch.value=null;catalogueMode.value='selected';selectedComponentKeys.value=[]}
  const reconstructionTask=shallowRef<ReconstructionTask|null>(null), reuseReconstructionComponents=ref(false)
  watch(selectedSessionId,()=>{if(adoptedComponentSearch.value){adoptedComponentSearch.value=null;reuseReconstructionComponents.value=false}},{flush:'sync'})
  const refinementFrom=shallowRef<{runId:string;figure:FigureDocument;baseline:string}|null>(null)
  const auditRepairSelection=shallowRef<AuditRepairSelection|null>(null)
  const preparingImage=ref(false)
  const repairPlan=shallowRef<RepairPlan|null>(null),planPreparing=ref(false),planCanvasBaseline=ref('')
  const planRunning=computed(()=>repairPlan.value?.status==='running')
  const runId = ref(''), runStatus = ref<'idle'|'running'|'completed'|'failed'|'cancelled'>('idle')
  const userContent = ref(''), output = ref(''), message = ref(''), activities = ref<string[]>([])
  const turns = ref<HarnessTurn[]>([]), omittedTurns = ref(0), reviewSync = ref(false), reviewError = ref('')
  const reviewFigure = shallowRef<FigureDocument | null>(null), reviewBase = shallowRef<FigureDocument | null>(null)
  const reviewBaseline=shallowRef<FigureDocument|null>(null)
  const currentTurn = computed(() => turns.value.find(t => t.id === runId.value))
  const catalogueMode = ref<'auto' | 'selected' | 'none'>('none'), catalogueQuery = ref(''), selectedComponentKeys = ref<string[]>([]), usedComponents = ref<ComponentUse[]>([])
  const librarySearch=ref(false),libraryReview=ref(false)
  const catalogue = computed(() => createCatalogue([]))
  const manualCatalogue=computed(()=>{
    const entries=new Map(catalogue.value.map(entry=>[catalogueKey(entry),entry]))
    for(const asset of [...paperExamples(),...galleryBenchmarks()])if(!entries.has(`asset:${asset.id}`))entries.set(`asset:${asset.id}`,{kind:'asset',asset})
    return [...entries.values()]
  })
  const componentOptions=computed(()=>searchCatalogue(manualCatalogue.value,catalogueQuery.value))
  const catalogueResults = computed(() => searchCatalogue(catalogue.value, catalogueMode.value === 'selected' ? catalogueQuery.value : draft.value || userContent.value))
  const referenceComponents = computed(() => catalogueMode.value === 'none' ? [] : catalogueMode.value === 'auto' ? recommendCatalogue(catalogue.value, draft.value || userContent.value)
    : searchCatalogue(manualCatalogue.value, '').filter(item => selectedComponentKeys.value.includes(item.key)))
  const proposal = shallowRef<FigureDocument | null>(null), baseline = ref('')
  const stale = computed(() => (!!proposal.value||!!currentTurn.value?.visualAudit||!!currentTurn.value?.designReview) && JSON.stringify(editor.figure.value) !== baseline.value)
  const refinementStale=computed(()=>!!refinementFrom.value&&JSON.stringify(editor.figure.value)!==refinementFrom.value.baseline)
  const selectedSession = computed(() => sessions.value.find(s => s.id === selectedSessionId.value))
  const status = computed(() => statuses.value.find(s => s.kind === kind.value))
  const busy = computed(() => sending.value || runStatus.value === 'running'||planRunning.value)
  const locked = computed(() => busy.value || preparingImage.value||planPreparing.value || reviewSync.value || !!reviewError.value)
  let source: EventSource | undefined, lastSequence = 0, epoch = 0, disposed = false
  let planTimer:ReturnType<typeof setTimeout>|undefined,planFetching=false
  try {
    const settings = JSON.parse(localStorage.getItem('fastfigure.harness.settings') ?? '{}') as Record<string, unknown>
    if (settings.kind === 'codex' || settings.kind === 'claude') kind.value = settings.kind
    for (const provider of ['codex','claude'] as const) if (typeof settings[provider] === 'string') models.value[provider] = settings[provider].slice(0, 100)
  } catch { /* Invalid local preferences do not affect the figure. */ }
  watch([kind, models], () => { try { localStorage.setItem('fastfigure.harness.settings', JSON.stringify({ kind: kind.value, ...models.value })) } catch { /* Optional preferences. */ } }, { deep: true })
  async function api(path: string, body?: unknown, method = 'POST',signal?:AbortSignal): Promise<unknown> {
    const response = await fetch(`/api/harness${path}`, body !== undefined ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),...(signal?{signal}:{}) } : signal?{signal}:{})
    let value: unknown
    try { value = await response.json() } catch { throw new Error('本地 Harness 接口不可用，请通过 pnpm dev 或 pnpm preview 运行') }
    if (!response.ok) throw new HarnessApiError(response.status,z.object({ error: z.string() }).safeParse(value).data?.error ?? 'Harness 请求失败')
    return value
  }
  const selectionPreviewJobs=new Map<string,{requestId:string;sessionId:string;controller:AbortController}>()
  async function renderSelectionPreviews(id:string,requestId:string,sessionId:string){
    const controller=new AbortController(),job={requestId,sessionId,controller};selectionPreviewJobs.set(id,job)
    const current=()=>!disposed&&!controller.signal.aborted&&runId.value===id&&selectedSessionId.value===sessionId
    try{
      const packet=selectionPreviewRequestSchema.parse(await api(`/runs/${id}/selection-previews`,undefined,'GET',controller.signal))
      if(!current())return
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(catalogueSnapshotJson(packet.entries))))].map(n=>n.toString(16).padStart(2,'0')).join('')
      if(packet.runId!==id||packet.sessionId!==sessionId||packet.requestId!==requestId||packet.poolSha256!==hash)throw new Error('筛选候选池与本轮指纹不符')
      const previews=await prepareSelectionPreviews(packet.entries,controller.signal)
      if(!current())return
      try{await api(`/runs/${id}/selection-previews`,{sessionId,requestId,previews},'POST',controller.signal)}
      catch(uploadError){
        // A committed upload may lose its reply. Read the accepted fingerprints before failing the run.
        const snapshot=runSnapshotSchema.parse(await api(`/runs/${id}`,undefined,'GET',controller.signal)),accepted=snapshot.summary.repositoryRecall?.selection?.previews
        if(snapshot.id!==id||snapshot.summary.id!==id||snapshot.sessionId!==sessionId||snapshot.summary.sessionId!==sessionId||accepted?.status!=='ready'||accepted.requestId!==requestId||accepted.poolSha256!==hash||JSON.stringify(accepted.sheets.map(sheet=>sheet.sha256))!==JSON.stringify(previews.map(page=>page.sha256)))throw uploadError
      }
    }catch(reason){
      if(current()){
        // Another page may already have supplied the same request, or the run may have ended.
        try{const snapshot=runSnapshotSchema.parse(await api(`/runs/${id}`,undefined,'GET',controller.signal));if(snapshot.id!==id||snapshot.sessionId!==sessionId||snapshot.summary.id!==id||snapshot.summary.sessionId!==sessionId)throw new Error('图谱运行与当前会话不匹配',{cause:reason});if(snapshot.summary.repositoryRecall?.selection?.previews?.status==='ready'||snapshot.status!=='running')return}catch{/* Preserve the original failure. */}
        const message=reason instanceof Error?reason.message:'浏览器无法生成筛选图谱';error.value=message
        try{await api(`/runs/${id}/selection-previews`,{sessionId,requestId,error:`实际筛选图谱生成失败：${message}`.slice(0,1500)},'POST',controller.signal)}catch{/* A cancelled/expired run must not restart or fall back to text selection. */}
      }
    }finally{if(selectionPreviewJobs.get(id)===job)selectionPreviewJobs.delete(id)}
  }
  watch([runId,selectedSessionId,runStatus,()=>currentTurn.value?.repositoryRecall?.selection?.previews],()=>{
    for(const [id,job]of selectionPreviewJobs)if(id!==runId.value||job.sessionId!==selectedSessionId.value||runStatus.value!=='running')job.controller.abort()
    const previews=currentTurn.value?.repositoryRecall?.selection?.previews
    if(runStatus.value==='running'&&previews?.status==='pending'&&!selectionPreviewJobs.has(runId.value))void renderSelectionPreviews(runId.value,previews.requestId,selectedSessionId.value)
  })
  function disconnect() { source?.close(); source = undefined; connection.value = '' }
  function clearRun() { disconnect(); lastSequence = 0; runId.value = ''; runStatus.value = 'idle'; userContent.value = ''; output.value = ''; message.value = ''; activities.value = []; usedComponents.value = []; proposal.value = null; reviewFigure.value = null; reviewBase.value = null;reviewBaseline.value=null; baseline.value = ''; error.value = ''; reviewError.value = '' }
  function clearCandidateRefinement(){auditRepairSelection.value=null;if(refinementFrom.value){refinementFrom.value=null;reconstructionTask.value=null}}
  function clearSession() { clearTimeout(planTimer);repairPlan.value=null;planCanvasBaseline.value='';clearRun();clearCandidateRefinement();clearComposition(); turns.value = []; omittedTurns.value = 0 }
  function remember(turn: HarnessTurn) {
    const index = turns.value.findIndex(t => t.id === turn.id)
    if (index >= 0) turns.value[index] = turn
    else { turns.value.push(turn); if (turns.value.length > 50) { turns.value.shift(); omittedTurns.value++ } }
  }
  function receive(raw: unknown) {
    const event = harnessEventSchema.parse(raw)
    if (event.runId !== runId.value || event.sessionId !== selectedSessionId.value || event.sequence <= lastSequence) return
    if (event.sequence !== lastSequence + 1) throw new Error('事件流不连续，请重新选择此会话恢复运行记录')
    lastSequence = event.sequence
    if (event.type === 'run.started') runStatus.value = 'running'
    if (event.type === 'assistant.delta') output.value = (output.value + (event.text ?? '')).slice(-300_000)
    if (event.type === 'activity') activities.value = [...activities.value.slice(-49), event.text ?? '处理中']
    const turn = currentTurn.value
    if(turn&&event.repositoryRecall)turn.repositoryRecall=event.repositoryRecall
    if (event.type === 'run.completed') {
      runStatus.value = 'completed'; message.value = event.text ?? '运行完成'; usedComponents.value = event.components ?? []
      reviewFigure.value = event.proposal ?? null
      if (turn) { turn.status = 'completed'; turn.message = message.value; turn.components = usedComponents.value; turn.hasProposal = !!event.proposal; if (turn.review === 'none') turn.review = event.proposal ? 'pending' : 'none' }
      if(turn&&event.referenceUse)turn.referenceUse=event.referenceUse
      if(turn&&event.compositionRecord)turn.compositionRecord=event.compositionRecord
      if(turn&&event.textCheck)turn.textCheck=event.textCheck
      if(turn&&event.designReviewReport)turn.designReviewReport=event.designReviewReport
      if(turn&&event.auditReport)turn.auditReport=event.auditReport
      if(turn&&event.chartRecommendation)turn.chartRecommendation=event.chartRecommendation
      if(turn&&event.recipeUpdates)turn.recipeUpdates=event.recipeUpdates
      if(turn&&event.sharedYAxes)turn.sharedYAxes=event.sharedYAxes
      if(turn&&event.sharedLegends)turn.sharedLegends=event.sharedLegends
      if(turn&&event.plotAlignments)turn.plotAlignments=event.plotAlignments
      if(turn&&event.sharedColorbars)turn.sharedColorbars=event.sharedColorbars
      if(turn&&event.callouts)turn.callouts=event.callouts
      if(turn&&event.calloutReflows)turn.calloutReflows=event.calloutReflows
      proposal.value = turn?.review === 'pending' ? reviewFigure.value : null
    }
    if (event.type === 'run.failed') { runStatus.value = 'failed'; if (turn) { turn.status = 'failed'; turn.error = event.text ?? '运行失败' } }
    if (event.type === 'run.cancelled') { runStatus.value = 'cancelled'; message.value = '运行已停止'; if (turn) { turn.status = 'cancelled'; turn.message = message.value } }
    if (turn && event.type.startsWith('run.') && event.type !== 'run.started') turn.finishedAt = event.timestamp
    if (event.type.startsWith('run.') && event.type !== 'run.started') { cancelling.value = false; disconnect() }
  }
  function follow(id: string) {
    disconnect()
    const stream = new EventSource(`/api/harness/runs/${id}/events?after=${lastSequence}`)
    source = stream
    stream.onopen = () => { connection.value = '' }
    let recovering = false
    async function recover() {
      if (source !== stream || recovering) return
      connection.value = '连接中断，正在恢复事件流…'; recovering = true
      try {
        const run = runSnapshotSchema.parse(await api(`/runs/${id}`))
        if (source !== stream) return
        if (run.id !== id || run.sessionId !== selectedSessionId.value || run.summary.id !== id || run.summary.sessionId !== run.sessionId) throw new Error('运行与当前会话不匹配')
        remember(run.summary)
        for (const event of run.events) receive(event)
      } catch (e) {
        if (source === stream) {
          error.value = (e as Error).message; runStatus.value = 'failed'
          if (currentTurn.value) { currentTurn.value.status = 'failed'; currentTurn.value.error = error.value }
          disconnect()
        }
      } finally { recovering = false }
    }
    stream.onmessage = event => {
      if (source !== stream) return
      try { receive(JSON.parse(event.data)) }
      catch { void recover() }
    }
    // Also detects expired runs after a service restart, rather than reconnecting forever on 404.
    stream.onerror = () => { void recover() }
  }
  async function readRun(id: string, token: number) {
    const run = runSnapshotSchema.parse(await api(`/runs/${id}`))
    if (token !== epoch || disposed) return
    if (run.sessionId !== selectedSessionId.value || run.id !== id || run.summary.id !== id || run.summary.sessionId !== run.sessionId) throw new Error('运行与当前会话不匹配')
    clearRun(); remember(run.summary)
    clearCandidateRefinement()
    runId.value = run.id; userContent.value = run.content; reviewBase.value = run.baseFigure;reviewBaseline.value=run.canvasBaseline; baseline.value = JSON.stringify(run.canvasBaseline)
    if(planRunning.value)planCanvasBaseline.value=baseline.value
    for (const event of run.events) receive(event)
    if (run.status === 'running') follow(run.id)
  }
  async function inspectTurn(id: string) {
    if (locked.value || loading.value || id === runId.value) return
    const turn = turns.value.find(t => t.id === id)
    if (!turn?.available) return
    const token = ++epoch
    loading.value = true; error.value = ''
    try { await readRun(id, token) }
    catch (e) { if (token === epoch) error.value = (e as Error).message }
    finally { if (token === epoch) loading.value = false }
  }
  async function adoptComposition(id:string){
    if(locked.value||loading.value||editor.assistantDataset.value||reconstructionTask.value)return
    const token=++epoch,sessionId=selectedSessionId.value
    loading.value=true;error.value=''
    try{
      const snapshot=runSnapshotSchema.parse(await api(`/runs/${id}`)),record=snapshot.summary.compositionRecord
      if(disposed||token!==epoch||sessionId!==selectedSessionId.value)return
      if(snapshot.sessionId!==selectedSessionId.value||snapshot.status!=='completed'||snapshot.summary.intent!=='plan'||!record||record.plan.status!=='ready')throw new Error('请选择本会话已完成、可采用的绘图方案')
      const baseKey=compositionBaseKey(snapshot.baseFigure)
      if(compositionBaseKey(editor.figure.value)!==baseKey)throw new Error('规划后画布或参考图已变化，请重新规划或还原后采用')
      adoptedComposition.value={record:clone(record),baseKey};editor.assistantStyle.value=null;intent.value='draw'
      if(!draft.value.trim())draft.value=`${record.userGoal}\n请按已采用方案生成可编辑候选。`
    }catch(e){if(token===epoch)error.value=(e as Error).message}finally{if(token===epoch)loading.value=false}
  }
  async function loadSession(id: string) {
    if (locked.value) return
    const token = ++epoch
    clearSession(); selectedSessionId.value = id
    const session = sessions.value.find(s => s.id === id)
    if (!session) return
    kind.value = session.kind
    loading.value = true
    try {
      const history = harnessHistorySchema.parse(await api(`/sessions/${id}/history`))
      if (token !== epoch || disposed) return
      if (history.turns.some(t => t.sessionId !== id)) throw new Error('会话记录不匹配')
      turns.value = history.turns; omittedTurns.value = history.omitted
      repairPlan.value=history.repairPlan??null
      const last=history.turns.at(-1),plan=repairPlan.value,usePlan=plan&&(plan.status==='running'||plan.steps.some(s=>s.runId===last?.id))
      const latest = usePlan?history.turns.find(t=>t.id===(plan.activeRunId??plan.latestCandidateRunId))??last:last
      if (latest?.available) await readRun(latest.id, token)
    } catch (e) { if (token === epoch) error.value = (e as Error).message }
    finally { if (token === epoch) {loading.value = false;if(planRunning.value)schedulePlanRefresh()} }
  }
  async function refresh() {
    if (loading.value) return
    loading.value = true; error.value = ''
    try {
      const [rawStatuses, rawSessions] = await Promise.all([api('/status'), api('/sessions')])
      if (disposed) return
      statuses.value = z.array(harnessStatusSchema).parse(rawStatuses); sessions.value = z.array(harnessSessionSchema).parse(rawSessions)
      if (selectedSessionId.value && !selectedSession.value) { clearSession(); selectedSessionId.value = '' }
      if (!selectedSession.value && status.value?.state !== 'ready') kind.value = statuses.value.find(s => s.state === 'ready')?.kind ?? kind.value
      loading.value = false
      if (!selectedSessionId.value && sessions.value[0]) await loadSession((sessions.value.find(s=>s.activePlanId)??sessions.value[0]).id)
      else if (selectedSessionId.value && !locked.value) await loadSession(selectedSessionId.value)
    } catch (e) { error.value = (e as Error).message }
    finally { loading.value = false }
  }
  async function newSession() {
    if (locked.value || loading.value) return
    loading.value = true; error.value = ''
    try {
      const session = harnessSessionSchema.parse(await api('/sessions', { kind: kind.value, title: editor.figure.value.title }))
      ++epoch; clearSession(); sessions.value.unshift(session); selectedSessionId.value = session.id
    } catch (e) { error.value = (e as Error).message }
    finally { loading.value = false }
  }
  async function removeSession() {
    if (locked.value || loading.value || !selectedSessionId.value) return
    loading.value = true
    try {
      await api(`/sessions/${selectedSessionId.value}`, {}, 'DELETE')
      sessions.value = sessions.value.filter(s => s.id !== selectedSessionId.value); ++epoch; clearSession(); selectedSessionId.value = ''
    } catch (e) { error.value = (e as Error).message }
    finally { loading.value = false }
  }
  function setKind(value: HarnessKind) {
    if (locked.value || loading.value || value === kind.value) return
    ++epoch; clearSession(); selectedSessionId.value = ''; kind.value = value
  }
  function prepareDesignReview(content:string){if(locked.value||loading.value)return;intent.value='design-review';draft.value=content}
  async function sendDesignReview(){
    if(status.value&&!status.value.images){error.value='构图审阅需要支持图片的模型入口';return}
    if(!selectedSession.value)await newSession()
    if(!selectedSession.value||disposed)return
    const token=++epoch,sessionId=selectedSessionId.value,figure=clone(editor.figure.value),snapshot=JSON.stringify(figure),content=draft.value.trim()
    preparingImage.value=true;error.value=''
    try{
      const designImage=await prepareDesignReviewImage(figure)
      if(disposed||token!==epoch||sessionId!==selectedSessionId.value)return
      if(JSON.stringify(editor.figure.value)!==snapshot)throw new Error('准备整图渲染期间画布已变化，请重新发送审阅')
      const payload={sessionId,intent:'design-review',figure,content,designImage,catalogue:[],selectedIds:[],...(model.value.trim()?{model:model.value.trim()}:{})}
      if(new TextEncoder().encode(JSON.stringify(payload)).length>1_990_000)throw new Error('整图审阅内容超过 2 MB，请简化图件后重试')
      clearRun();baseline.value=snapshot;reviewBaseline.value=figure;reviewBase.value=figure;userContent.value=content;sending.value=true
      const started=z.object({id:z.uuid(),sessionId:z.uuid(),summary:harnessTurnSchema}).parse(await api('/runs',payload))
      if(disposed||token!==epoch||sessionId!==selectedSessionId.value)return
      if(started.sessionId!==sessionId||started.summary.id!==started.id||started.summary.sessionId!==sessionId)throw new Error('审阅运行与当前会话不匹配')
      runId.value=started.id;runStatus.value='running';selectedSession.value!.lastRunId=started.id;draft.value='';remember(started.summary);follow(started.id)
    }catch(e){if(token===epoch&&!disposed){error.value=(e as Error).message;runStatus.value='failed'}}
    finally{preparingImage.value=false;sending.value=false}
  }
  function locateDesignObjects(id:string,ids:string[]){
    if(locked.value||loading.value||id!==runId.value||!currentTurn.value?.designReviewReport||stale.value)return
    const valid=new Set([...editor.figure.value.nodes,...editor.figure.value.containers,...editor.figure.value.edges].map(o=>o.id))
    if(ids.length&&ids.every(value=>valid.has(value))&&currentTurn.value.designReviewReport.findings.some(f=>JSON.stringify(f.objectIds)===JSON.stringify(ids)))editor.selectedIds.value=[...ids]
  }
  async function send(findComponents=false) {
    if (locked.value || loading.value || !draft.value.trim()) return
    if(intent.value==='design-review')return sendDesignReview()
    const editingRecipes=intent.value==='edit-recipes'
    if(editingRecipes&&!recipeUpdateTargets(editor.figure.value).length){error.value='当前图件没有可调整的原生组合，请先从参数化组合插入';return}
    if(editingRecipes&&(reconstructionTask.value||editor.assistantDataset.value||adoptedComposition.value||adoptedComponentSearch.value||editor.assistantStyle.value)){error.value='组合参数任务只使用当前图件，请先清除其他任务与风格附件';return}
    if(!findComponents&&componentSearchStale.value){error.value='采用素材后画布或参考图已变化，请重新找素材';return}
    if(findComponents&&reconstructionTask.value?.kind!=='reconstruct'){error.value='请先准备整图或选区重建，再看图找素材';return}
    if(compositionStale.value){error.value='采用方案后画布或参考图已变化，请清除方案重新规划，或还原画布后发送';return}
    if(editor.assistantStyle.value&&(editor.assistantDataset.value||reconstructionTask.value)){error.value='风格素材仅用于普通绘图和方案规划，请先移除或切换任务';return}
    if((intent.value==='plan'||adoptedComposition.value)&&(reconstructionTask.value||editor.assistantDataset.value)){error.value='绘图方案不能与数据附件或重建任务混用，请先清除方案或返回直接绘图';return}
    if(adoptedComposition.value&&intent.value==='plan'){error.value='请先清除已采用方案，再规划新方案';return}
    if (!editingRecipes&&!adoptedComposition.value&&!reconstructionTask.value&&!editor.assistantDataset.value&&catalogueMode.value === 'selected' && !referenceComponents.value.length) { error.value = '请至少选择一个参考组件，或切换为不使用组件'; return }
    const chartData=editor.assistantDataset.value?clone(chartDatasetSchema.parse(editor.assistantDataset.value)):undefined
    const refinement=refinementFrom.value
    if(refinementStale.value){error.value='准备修复后画布已变化，请返回当前画布重新生成';return}
    const figure = clone(refinement?.figure??editor.figure.value),canvasBaseline=refinement?JSON.parse(refinement.baseline) as FigureDocument:clone(figure), content = draft.value.trim(),task=reconstructionTask.value?clone(reconstructionTask.value):undefined
    let referenceId:string|undefined
    const referenceInputs=task||adoptedComposition.value?[]:clone(selectedReferences.value)
    try{selectedReferenceInputs({figure,referenceInputs,chartData})}catch(e){error.value=(e as Error).message;return}
    if((referenceInputs.length||adoptedComposition.value?.record.references.length)&&status.value&&!status.value.images){error.value='当前 Harness 不支持图片，请移除参考图或切换模型入口';return}
    if(task){try{referenceId=referenceForReconstruction(figure,task).id;if(status.value&&!status.value.images)throw new Error('当前 Harness 不支持图片，请切换到支持图片的模型入口')}catch(e){error.value=(e as Error).message;return}}
    const entries = editingRecipes||findComponents?[]:adoptedComponentSearch.value?clone(adoptedComponentSearch.value.catalogue):task?task.kind==='reconstruct'&&reuseReconstructionComponents.value?clone(referenceComponents.value.map(item=>item.entry)):[]:chartData||adoptedComposition.value?[]:clone(referenceComponents.value.map(item=>item.entry))
    if(!findComponents&&task?.kind==='reconstruct'&&reuseReconstructionComponents.value&&!entries.length){error.value='开启素材辅助重建后，请选择至少一个组件或关闭此选项';return}
    let inputImage,cataloguePreview
    if(task){preparingImage.value=true;try{inputImage=!findComponents&&adoptedComponentSearch.value?clone(adoptedComponentSearch.value.inputImage):await prepareReconstructionImage(figure,task);if(entries.length)cataloguePreview=await prepareCataloguePreview(entries)}catch(e){error.value=(e as Error).message;return}finally{preparingImage.value=false}
      if(disposed)return
      if(JSON.stringify(editor.figure.value)!==JSON.stringify(canvasBaseline)){error.value='准备原图与组件图谱期间画布已变化，请重新发送';return}
    }
    const searchLibrary=!editingRecipes&&librarySearch.value&&catalogueMode.value==='auto'&&!task&&!chartData&&!adoptedComposition.value&&!refinement
    const payload = {librarySearch:searchLibrary,libraryReview:searchLibrary&&libraryReview.value,content, figure, catalogue: adoptedComponentSearch.value&&!findComponents?[]:entries,...(!findComponents&&adoptedComponentSearch.value?{componentSearchRunId:adoptedComponentSearch.value.runId}:{}),...(cataloguePreview?{cataloguePreview}:{}),...(editor.assistantStyle.value&&!adoptedComposition.value?{styleReference:clone(editor.assistantStyle.value)}:{}), selectedIds: refinement?[]:[...editor.selectedIds.value],...(findComponents?{intent:'find-components'}:intent.value==='plan'||editingRecipes?{intent:intent.value}:{}),...(adoptedComposition.value?{compositionPlanRunId:adoptedComposition.value.record.runId}:{}),...(chartData?{chartData}:{}),...(refinement?{refineFromRunId:refinement.runId}:{}),...(auditRepairSelection.value?{auditRepair:clone(auditRepairSelection.value)}:{}), ...(task?{task,inputImage}:{}),...(model.value.trim() ? { model: model.value.trim() } : {}), ...(referenceId ? { referenceId } : {}),...(referenceInputs.length?{referenceInputs}:{}) }
    if (new TextEncoder().encode(JSON.stringify(payload)).length > 1_990_000) { error.value = '本次参考内容超过 2 MB，请减少所选组件或参考图片后再发送'; return }
    if (!selectedSession.value) await newSession()
    if (!selectedSession.value) return
    clearRun(); baseline.value = JSON.stringify(canvasBaseline);reviewBaseline.value=canvasBaseline; reviewBase.value = figure; userContent.value = content; sending.value = true
    try {
      const started = z.object({ id: z.uuid(), sessionId: z.uuid(),summary:harnessTurnSchema }).parse(await api('/runs', { ...payload, sessionId: selectedSessionId.value }))
      if(started.sessionId!==selectedSessionId.value||started.summary.id!==started.id||started.summary.sessionId!==started.sessionId)throw new Error('运行与当前会话不匹配')
      runId.value = started.id; runStatus.value = 'running'; selectedSession.value.lastRunId = started.id; draft.value = '';adoptedComponentSearch.value=null;refinementFrom.value=null;reconstructionTask.value=null;auditRepairSelection.value=null;remember(started.summary);follow(started.id)
    } catch (e) { error.value = (e as Error).message; runStatus.value = 'failed' }
    finally { sending.value = false }
  }
  async function findReconstructionComponents(){await send(true)}
  async function adoptReconstructionSearch(id:string){
    if(locked.value||loading.value)return
    const turn=turns.value.find(turn=>turn.id===id);if(turn?.intent!=='find-components'||turn.status!=='completed')return
    const token=++epoch,session=selectedSessionId.value;loading.value=true;error.value=''
    try{
      const packet=componentSearchSnapshotSchema.parse(await api(`/runs/${id}/component-search`))
      const digest=async(bytes:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)))].map(byte=>byte.toString(16).padStart(2,'0')).join('')
      if(packet.runId!==id||await digest(new TextEncoder().encode(catalogueSnapshotJson(packet.catalogue)))!==packet.catalogueSha256||await digest(Uint8Array.from(atob(packet.inputImage.dataUrl.split(',')[1]!),char=>char.charCodeAt(0)))!==packet.imageSha256)throw new Error('检索素材或原图裁片指纹不符，请重新找素材')
      if(disposed||token!==epoch||session!==selectedSessionId.value)return
      if(JSON.stringify(editor.figure.value)!==JSON.stringify(packet.figure))throw new Error('画布或参考图已变化，请重新看图找素材')
      prepareReconstruction(packet.task,turn.content)
      adoptedComponentSearch.value=packet;reuseReconstructionComponents.value=true
      draft.value=turn.content+'\n请基于已采用的冻结素材及实际图谱重建，明确说明匹配理由、差异和不确定处，生成待审候选。'
    }catch(e){if(token===epoch)error.value=(e as Error).message}finally{if(token===epoch)loading.value=false}
  }
  async function cancel() {
    if(planRunning.value){await cancelRepairPlan();return}
    if (!runId.value || !busy.value || cancelling.value) return
    cancelling.value = true
    try { await api(`/runs/${runId.value}/cancel`, {}) }
    catch (e) { cancelling.value = false; error.value = (e as Error).message }
  }
  function schedulePlanRefresh(){clearTimeout(planTimer);if(!disposed&&planRunning.value)planTimer=setTimeout(()=>{void refreshRepairPlan()},750)}
  async function refreshRepairPlan(){
    const id=repairPlan.value?.id,session=selectedSessionId.value,token=epoch
    if(!id||planFetching||disposed)return
    planFetching=true;let recovered=false
    try{
      const next=repairPlanSchema.parse(await api(`/repair-plans/${id}`));if(disposed||token!==epoch||session!==selectedSessionId.value)return
      if(next.id!==id||next.sessionId!==session)throw new Error('核对计划与当前会话不匹配')
      repairPlan.value=next
      const history=harnessHistorySchema.parse(await api(`/sessions/${session}/history`));if(disposed||token!==epoch)return
      turns.value=history.turns;omittedTurns.value=history.omitted
      const target=next.activeRunId??next.latestCandidateRunId
      if(target!==runId.value||next.status!=='running')await readRun(target,token)
      if(!disposed&&token===epoch){connection.value='';recovered=true}
    }catch(e){if(!disposed&&token===epoch){if(e instanceof HarnessApiError&&e.status===404){repairPlan.value=null;error.value='分区核对计划已不可用，请检查服务状态；不会自动重新发起'}else connection.value='核对进度连接中断，正在恢复；不会重复启动计划'}}
    finally{planFetching=false;if(!recovered&&!disposed&&token===epoch&&repairPlan.value?.id===id){clearTimeout(planTimer);planTimer=setTimeout(()=>{void refreshRepairPlan()},1500)}else schedulePlanRefresh()}
  }
  async function cancelRepairPlan(reason:'cancelled'|'stale'='cancelled'){
    const plan=repairPlan.value;if(!plan||plan.status!=='running'||plan.stopping)return
    repairPlan.value={...plan,stopping:true};cancelling.value=true
    try{const saved=repairPlanSchema.parse(await api(`/repair-plans/${plan.id}/cancel`,{reason}));if(!disposed&&repairPlan.value?.id===plan.id)repairPlan.value=saved}
    catch(e){if(!disposed){error.value=(e as Error).message;if(repairPlan.value?.id===plan.id)repairPlan.value={...repairPlan.value,stopping:false}}}
    finally{cancelling.value=false;schedulePlanRefresh()}
  }
  watch([()=>JSON.stringify(editor.figure.value),repairPlan,planCanvasBaseline],()=>{if(planRunning.value&&planCanvasBaseline.value&&JSON.stringify(editor.figure.value)!==planCanvasBaseline.value)void cancelRepairPlan('stale')})
  async function startRepairPlan(regionIds:string[],content:string){
    if(locked.value||loading.value||!proposal.value||!reviewBase.value||!currentTurn.value?.task||currentTurn.value.review!=='pending')return
    if(stale.value){error.value='画布已变化，请基于当前画布重新生成';return}
    const candidate=clone(proposal.value),parentRunId=runId.value,session=selectedSessionId.value,canvasBaseline=baseline.value
    planPreparing.value=true;error.value=''
    try{
      const group=reconstructionCandidateGroup(reviewBase.value,candidate,currentTurn.value.task),regions=[]
      for(const regionId of regionIds){const task={kind:'repair' as const,containerId:group.id,regionId};regions.push({regionId,image:await prepareReconstructionImage(candidate,task)})}
      if(disposed)return
      if(JSON.stringify(editor.figure.value)!==canvasBaseline)throw new Error('准备分区裁片期间画布已变化，请重新开始')
      const payload={sessionId:session,parentRunId,content,regions,...(model.value.trim()?{model:model.value.trim()}:{})}
      if(new TextEncoder().encode(JSON.stringify(payload)).length>3_990_000)throw new Error('分区裁片超过 4 MB，请减少所选分区')
      const started=repairPlanSchema.parse(await api('/repair-plans',payload));if(disposed)return
      if(started.sessionId!==session)throw new Error('核对计划与当前会话不匹配')
      planCanvasBaseline.value=canvasBaseline;repairPlan.value=started;refinementFrom.value=null;reconstructionTask.value=null;auditRepairSelection.value=null
      schedulePlanRefresh()
    }catch(e){if(!disposed)error.value=(e as Error).message}
    finally{planPreparing.value=false}
  }
  async function syncReview() {
    const turn = currentTurn.value
    if (!turn || !['applied', 'discarded'].includes(turn.review) || reviewSync.value) return
    const id = turn.id, session = selectedSessionId.value, decision = turn.review
    reviewSync.value = true; reviewError.value = ''
    try {
      const saved = harnessTurnSchema.parse(await api(`/runs/${id}/review`, { decision }))
      if (session === selectedSessionId.value && !disposed) remember(saved)
    } catch { if (session === selectedSessionId.value && !disposed) reviewError.value = '画布处理已完成，但会话状态未同步。请重试同步后继续。' }
    finally { reviewSync.value = false }
  }
  function apply(): boolean {
    if (!proposal.value) return false
    if (locked.value || loading.value || currentTurn.value?.review !== 'pending') return false
    if (JSON.stringify(editor.figure.value) !== baseline.value) { error.value = '当前画布已变化，请基于最新画布重新生成候选图'; return false }
    if (!editor.update(doc => Object.assign(doc, clone(proposal.value!)))) { error.value = editor.notice.value; return false }
    proposal.value = null; currentTurn.value.review = 'applied';clearReconstruction();clearComposition();void syncReview(); editor.selectedId.value = 'stage'; editor.notice.value = '已应用 Harness 候选图，可撤销恢复'; return true
  }
  function discard() { if (locked.value || loading.value || !proposal.value || currentTurn.value?.review !== 'pending') return; proposal.value = null; currentTurn.value.review = 'discarded';clearReconstruction(); void syncReview() }
  function prepareReconstruction(task:ReconstructionTask,content:string){
    if(locked.value){editor.notice.value='请先完成或停止当前助手运行';return}
    adoptedComponentSearch.value=null;reuseReconstructionComponents.value=false;clearCandidateRefinement();clearComposition();intent.value='draw';editor.assistantStyle.value=null;editor.assistantDataset.value=null
    try{editor.referenceId.value=referenceForReconstruction(editor.figure.value,task).id;reconstructionTask.value=clone(task);attachReference.value=true;draft.value=content;error.value=''}catch(e){error.value=(e as Error).message}
  }
  function prepareCandidateRepair(regionId:string,content:string){
    if(locked.value||loading.value||!proposal.value||!reviewBase.value||currentTurn.value?.review!=='pending'||!currentTurn.value.task)return
    if(stale.value){error.value='画布已变化，请基于当前画布重新生成';return}
    try{
      const group=reconstructionCandidateGroup(reviewBase.value,proposal.value,currentTurn.value.task),task={kind:'repair' as const,containerId:group.id,regionId}
      const context=repairContext(proposal.value,task)
      clearComposition();intent.value='draw';editor.assistantStyle.value=null;editor.assistantDataset.value=null
      auditRepairSelection.value=null
      refinementFrom.value={runId:runId.value,figure:clone(proposal.value),baseline:baseline.value};reconstructionTask.value=task
      editor.referenceId.value=context.reference.id;attachReference.value=true;draft.value=content;error.value=''
    }catch(e){error.value=(e as Error).message}
  }
  function clearReconstruction(){if(!locked.value){adoptedComponentSearch.value=null;reuseReconstructionComponents.value=false;reconstructionTask.value=null;refinementFrom.value=null;auditRepairSelection.value=null}}
  async function startVisualAudit(regionId:string,content:string){
    if(locked.value||loading.value||!proposal.value||!reviewBase.value||currentTurn.value?.review!=='pending'||!currentTurn.value.task)return
    if(stale.value){error.value='画布已变化，请基于当前画布重新生成';return}
    const candidate=clone(proposal.value),parentRunId=runId.value,canvasBaseline=baseline.value
    preparingImage.value=true;error.value=''
    try{
      const group=reconstructionCandidateGroup(reviewBase.value,candidate,currentTurn.value.task),task={kind:'repair' as const,containerId:group.id,regionId},images=await prepareVisualAuditImages(candidate,task)
      if(disposed)return
      if(JSON.stringify(editor.figure.value)!==canvasBaseline)throw new Error('准备审阅图片期间画布已变化，请重新开始')
      const payload={sessionId:selectedSessionId.value,parentRunId,regionId,content,...images,...(model.value.trim()?{model:model.value.trim()}:{})}
      if(new TextEncoder().encode(JSON.stringify(payload)).length>1_990_000)throw new Error('两张审阅裁片超过 2 MB，请选择更小分区')
      const started=z.object({id:z.uuid(),sessionId:z.uuid(),summary:harnessTurnSchema}).parse(await api('/visual-audits',payload));if(disposed)return
      if(started.sessionId!==selectedSessionId.value||started.summary.id!==started.id)throw new Error('视觉审阅与当前会话不匹配')
      clearRun();baseline.value=canvasBaseline;reviewBase.value=candidate;reviewBaseline.value=JSON.parse(canvasBaseline) as FigureDocument;userContent.value=content
      refinementFrom.value=null;reconstructionTask.value=null;auditRepairSelection.value=null;runId.value=started.id;runStatus.value='running';if(selectedSession.value)selectedSession.value.lastRunId=started.id;remember(started.summary);follow(started.id)
    }catch(e){if(!disposed)error.value=(e as Error).message}
    finally{preparingImage.value=false}
  }
  async function prepareAuditRepair(auditRunId:string,findingIds:string[]){
    if(locked.value||loading.value)return
    const turn=turns.value.find(t=>t.id===auditRunId),audit=turn?.visualAudit,report=turn?.auditReport
    if(!audit||!report)return
    let content:string,ids:string[]
    try{content=auditRepairDraft(report,findingIds);ids=selectAuditFindings(report,findingIds).map(f=>f.id)}catch(e){error.value=(e as Error).message;return}
    const parent=turns.value.find(t=>t.id===audit.parentRunId)
    if(!parent?.available||parent.review!=='pending'){error.value='受审候选已处理或清理，请回到当前画布重新核对';return}
    const session=selectedSessionId.value
    await inspectTurn(parent.id)
    if(disposed||selectedSessionId.value!==session)return
    if(runId.value!==parent.id||!proposal.value){error.value='无法恢复受审候选，请重新打开详情';return}
    prepareCandidateRepair(audit.regionId,content)
    if(refinementFrom.value?.runId===parent.id&&reconstructionTask.value?.kind==='repair'&&reconstructionTask.value.regionId===audit.regionId&&!error.value)auditRepairSelection.value={auditRunId,findingIds:ids}
  }
  async function reauditRepair(){
    const info=currentTurn.value?.auditRepair
    if(!info)return
    await startVisualAudit(info.regionId,`修复后复审这版候选：请重新对照原图完整核对本分区，不沿用旧报告的结论，也不因上一轮返回补丁就判定问题已解决。\n上轮选择：${info.findings.map(f=>f.title).join('；')}。\n同时留意修复引入的新问题；识别不清就列为不确定，空清单也不代表自动验收。`)
  }
  function setComponentSelection(keys:string[]){
    if(locked.value||loading.value)return false
    const valid=new Set(manualCatalogue.value.map(catalogueKey))
    if(keys.length>6||new Set(keys).size!==keys.length||keys.some(key=>!valid.has(key))){error.value='请选择至多 6 个有效且不同的组件';return false}
    selectedComponentKeys.value=[...keys];catalogueMode.value=keys.length?'selected':'none';error.value='';return true
  }
  function setReferenceSelection(choices:ReferenceSelection[]){
    if(locked.value||loading.value)return false
    try{
      const next=z.array(referenceSelectionSchema).max(3).parse(choices)
      selectedReferenceInputs({figure:editor.figure.value,referenceInputs:next,...(editor.assistantDataset.value?{chartData:editor.assistantDataset.value}:{})})
      referenceSelections.value=clone(next);error.value='';return true
    }catch(e){error.value=e instanceof Error&&!('issues'in e)?e.message:'请选择有效的参考图与用途';return false}
  }
  function toggleComponent(key: string) {
    if (busy.value) return
    if (!manualCatalogue.value.some(entry => catalogueKey(entry) === key)) return
    if (selectedComponentKeys.value.includes(key)) selectedComponentKeys.value = selectedComponentKeys.value.filter(k => k !== key)
    else if (referenceComponents.value.length < 6) selectedComponentKeys.value.push(key)
    else error.value = '每轮最多选择 6 个参考组件'
  }
  function dispose() { for(const job of selectionPreviewJobs.values())job.controller.abort();disposed = true; ++epoch;clearTimeout(planTimer); disconnect() }
  function resumeDataSelection(content:string){if(!locked.value&&!loading.value)draft.value=content}
  watch(intent,value=>{if(value==='edit-recipes'||value==='design-review'){clearComposition();clearCandidateRefinement();reconstructionTask.value=null;adoptedComponentSearch.value=null;editor.assistantDataset.value=null;editor.assistantStyle.value=null}})
  return { statuses, sessions, selectedSessionId, selectedSession, kind, model, draft,intent,adoptedComposition,compositionStale,adoptComposition,clearComposition, attachReference,selectedReferences,toggleReference,setReferencePurpose, chartDataset:editor.assistantDataset,adoptedComponentSearch,componentSearchStale,clearComponentSearch,findReconstructionComponents,adoptReconstructionSearch,reconstructionTask,reuseReconstructionComponents,refinementFrom,refinementStale, preparingImage, prepareReconstruction,prepareCandidateRepair, clearReconstruction, loading, busy, cancelling, error, connection, runStatus,
    resumeDataSelection,userContent, output, message, activities, proposal, stale, status, catalogueMode,librarySearch,libraryReview, catalogueQuery, componentOptions, setComponentSelection, setReferenceSelection, selectedComponentKeys, catalogueResults, referenceComponents, usedComponents, toggleComponent,
    runId, turns, omittedTurns, currentTurn, reviewFigure, reviewBase,reviewBaseline, reviewSync, reviewError, locked, inspectTurn, syncReview,
    repairPlan,planRunning,planPreparing,startRepairPlan,cancelRepairPlan,refreshRepairPlan,
    startVisualAudit,prepareAuditRepair,reauditRepair,auditRepairSelection,locateDesignObjects,prepareDesignReview,
    refresh, newSession, removeSession, loadSession, setKind, send, cancel, apply, discard, dispose }
}
export type Harness = ReturnType<typeof createHarness>
