<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { ErrorMessage, Article, Aside, Box, BrandMark, Button, Disclosure, DisclosureTrigger, Field, Footer, Header, Heading, Icon, Modal,ModalBody,Select, Text, TextArea, TextField } from '../ui'
import IconButton from '../ui/IconButton.vue'
import { useEditor } from '../../composables/useEditor'
import { createHarness } from '../../composables/useHarness'
import type { HarnessKind } from '../../core/harness'
import HarnessAttachments from './HarnessAttachments.vue'
import HarnessTurn from './HarnessTurn.vue'
import HarnessReconstruction from './HarnessReconstruction.vue'
import HarnessRecipeTargets from './HarnessRecipeTargets.vue'
import RepairPlanProgress from './RepairPlanProgress.vue'
import StyleAssetSummary from '../library/StyleAssetSummary.vue'
import type { ReconstructionTask } from '../../core/reconstructionContract'
const editor = useEditor(), harness = createHarness(editor), settingsOpen = ref(false), followTail = ref(true)
const stream = useTemplateRef<HTMLElement>('stream'), surface = useTemplateRef<HTMLElement>('surface')
const provider = computed(() => harness.kind.value === 'codex' ? 'Codex' : 'Claude')
const open = computed(() => editor.activePanel.value === 'assistant')
watch(editor.assistantSeed, value => { if (value) { harness.intent.value='draw';harness.clearReconstruction();harness.draft.value = value; editor.assistantSeed.value = '' } })
watch(editor.assistantReferenceId,id=>{if(id){harness.clearComposition();editor.referenceId.value=id;harness.attachReference.value=true;editor.assistantReferenceId.value=''}})
watch(editor.assistantDataset,(value,previous)=>{if(value){harness.clearComposition();harness.intent.value='draw';harness.clearReconstruction();editor.assistantStyle.value=null;harness.attachReference.value=!!editor.activeReference.value;if(!previous||value.visualizationGoal!==previous.visualizationGoal||!harness.draft.value.trim())harness.draft.value=[value.visualizationGoal,'请结合研究问题与这份数据，分析适合的可视化形式、字段映射和样式，说明选择理由、备选与待确认事项。'].filter(Boolean).join('\n')}})
watch(editor.assistantStyle,value=>{if(value){harness.intent.value='draw';harness.clearComposition();harness.clearReconstruction();const wasData=!!editor.assistantDataset.value;editor.assistantDataset.value=null;if(wasData||!harness.draft.value.trim())harness.draft.value=`请结合当前图件与风格素材${value.name}，改进模块图示、配色和简短注释。`}})
watch(editor.assistantTask,value=>{if(value){harness.prepareReconstruction(value.task,value.content);editor.assistantTask.value=null}})
watch(harness.refinementFrom,async value=>{if(!value)return;await nextTick();surface.value?.querySelector<HTMLTextAreaElement>('textarea[aria-label="绘图要求"]')?.focus({preventScroll:true});void scrollToLatest(true)})
async function scrollToLatest(force = false) {
  if (!force && !followTail.value) return
  await nextTick(); const element = stream.value
  if (element) element.scrollTop = element.scrollHeight
}
function scrolled() { const element = stream.value; if (element) followTail.value = element.scrollHeight - element.scrollTop - element.clientHeight < 56 }
watch(open, async value => {
  if (!value) {settingsOpen.value=false;return}
  if (!harness.statuses.value.length) await harness.refresh()
  await nextTick()
  surface.value?.querySelector<HTMLTextAreaElement>('textarea[aria-label="绘图要求"]')?.focus({ preventScroll: true })
  void scrollToLatest()
})
watch(() => [harness.output.value.length, harness.message.value, harness.proposal.value, harness.error.value, harness.turns.value.length], () => { void scrollToLatest() })
function send(event?: KeyboardEvent) {
  if (event?.isComposing) return
  followTail.value = true; void harness.send(); void scrollToLatest(true)
}
function retry(content: string,task?:ReconstructionTask) {if(task){harness.prepareReconstruction(task,content);return}harness.reconstructionTask.value=null;harness.draft.value=content;send()}
async function inspect(id: string) {
  followTail.value = false; await harness.inspectTurn(id); await nextTick()
  surface.value?.querySelector<HTMLElement>(`[data-turn-id="${id}"]`)?.scrollIntoView({ block: 'start' })
}
onBeforeUnmount(harness.dispose)
</script>

<template>
  <Aside v-show="open" ref="surface" class="assistant-panel" data-assistant-panel aria-label="Harness 绘图助手">
    <Box class="assistant-session-bar"><Select :value="harness.selectedSessionId.value" :disabled="harness.locked.value || harness.loading.value" :options="harness.sessions.value.map((s,i) => ({value:s.id,label:`${s.kind} · ${s.title} (${harness.sessions.value.length-i})`}))" placeholder="新的绘图会话" size="sm" aria-label="Harness 会话" @change="harness.loadSession($event)" /><IconButton icon="plus" label="新建会话" :disabled="harness.locked.value || harness.loading.value || harness.status.value?.state !== 'ready'" @click="harness.newSession" /></Box>
    <RepairPlanProgress :harness="harness" />
    <Box ref="stream" class="assistant-stream" aria-label="Harness 运行结果" @scroll.passive="scrolled">
      <Box v-if="!harness.turns.value.length && !harness.userContent.value && !harness.error.value" class="assistant-empty"><BrandMark /><Heading>从一张结构图开始</Heading><Text>描述模块、连接与样式要求，或结合参考图和组件继续绘制。</Text><Button size="xs" @click="harness.intent.value='design-review';harness.draft.value = '分析当前方法图，提出布局与可读性改进建议。'">分析当前图件</Button><Button size="xs" @click="harness.draft.value = '结合参考组件，为当前方法设计清晰的模块化结构图。'">结合组件绘图</Button></Box>
      <Text v-if="harness.omittedTurns.value" class="muted-caption">保留 {{ harness.turns.value.length }} 条消息，另有 {{ harness.omittedTurns.value }} 轮已清理；当前候选优先保留。</Text>
      <HarnessTurn v-for="(turn,index) in harness.turns.value" :key="turn.id" :turn="turn" :number="harness.omittedTurns.value + index + 1" :harness="harness" :provider="provider" @retry="retry" @inspect="inspect" />
      <Article v-if="harness.userContent.value && !harness.runId.value" class="assistant-message assistant-message-user"><Header><Icon name="cursor" /><Text>你</Text></Header><Text>{{ harness.userContent.value }}</Text></Article>
      <ErrorMessage v-if="harness.error.value" class="error-text" :message="harness.error.value" />
      <Text v-if="harness.reviewSync.value" role="status" class="muted-caption">正在保存候选图处理状态…</Text>
      <Box v-if="harness.reviewError.value" class="assistant-sync-error"><ErrorMessage class="error-text" :message="harness.reviewError.value" /><Button size="xs" :disabled="harness.reviewSync.value" @click="harness.syncReview">重试同步处理状态</Button></Box>
    </Box>
    <Button v-if="!followTail" size="xs" class="assistant-jump" @click="followTail = true; scrollToLatest(true)">回到最新消息 <Icon name="chevron" /></Button>
    <Footer class="assistant-composer">
      <Field v-if="!harness.reconstructionTask.value&&!editor.assistantDataset.value" class="assistant-task-row"><Text>本轮任务</Text><Select :value="harness.intent.value" :disabled="harness.locked.value||harness.loading.value||!!harness.adoptedComposition.value" :options="[{value:'draw',label:'生成候选图'},{value:'plan',label:'先规划绘图方案'},{value:'edit-recipes',label:'调整已有组合参数'},{value:'design-review',label:'审阅当前主图'}]" size="xs" aria-label="助手本轮任务" @change="harness.intent.value=$event as 'draw'|'plan'|'edit-recipes'|'design-review'" /></Field>
      <Box v-if="harness.adoptedComposition.value" class="assistant-adopted-plan"><Text>已采用方案：{{ harness.adoptedComposition.value.record.plan.title }}</Text><Text class="muted-caption">来源和方案已固定，发送要求后生成候选。</Text><Text v-if="harness.compositionStale.value" role="alert" class="error-text">画布或参考图已变化，请清除方案重新规划，或还原后发送。</Text><Button size="xs" variant="quiet" :disabled="harness.locked.value" @click="harness.clearComposition">清除已采用方案</Button></Box>
      <Text v-if="harness.intent.value==='design-review'" class="muted-caption">审阅整张画布的视觉重点、结构搭配与留白。请说明研究论点和使用场景；返回定位建议，画布保持原样。</Text>
      <HarnessRecipeTargets v-if="harness.intent.value==='edit-recipes'" :disabled="harness.locked.value||harness.loading.value" />
      <HarnessReconstruction v-if="!['edit-recipes','design-review'].includes(harness.intent.value)" :harness="harness" />
      <Box v-if="editor.assistantStyle.value&&!harness.adoptedComposition.value" class="assistant-style-attachment"><StyleAssetSummary :asset="editor.assistantStyle.value" /><IconButton icon="close" label="移除风格附件" :disabled="harness.locked.value" @click="editor.assistantStyle.value=null" /></Box>
      <Box v-if="harness.intent.value!=='design-review'&&!harness.reconstructionTask.value" class="assistant-data-attachment"><Box><Button size="xs" variant="quiet" :disabled="harness.locked.value" @click="editor.chartDataImportOpen.value=true"><Icon name="grid" />{{ editor.assistantDataset.value?'编辑数据附件':'导入数据，让助手选图' }}</Button><IconButton v-if="editor.assistantDataset.value" icon="close" label="移除数据附件" :disabled="harness.locked.value" @click="editor.assistantDataset.value=null" /></Box><Text v-if="editor.assistantDataset.value" class="muted-caption">{{ editor.assistantDataset.value.name }}{{ editor.assistantDataset.value.preparation?' · 已确认展开（原表保留）':'' }} · {{ editor.assistantDataset.value.rows.length }} 行 × {{ editor.assistantDataset.value.columns.length }} 列 · {{ editor.assistantDataset.value.origin==='example'?'示例数据':'用户填写' }}{{ editor.assistantDataset.value.sampleMeaning==='raw-observations'?' · 声明为原始观测':editor.assistantDataset.value.sampleMeaning==='summaries'?' · 已汇总统计量':' · 数值含义待确认' }}；先说明要表达的问题，可附参考图。</Text></Box>
      <HarnessAttachments v-if="!['edit-recipes','design-review'].includes(harness.intent.value)&&!harness.adoptedComposition.value" :harness="harness" :components="!harness.adoptedComponentSearch.value&&(!harness.reconstructionTask.value||harness.reconstructionTask.value.kind==='reconstruct'&&harness.reuseReconstructionComponents.value)&&!editor.assistantDataset.value" :references="!harness.reconstructionTask.value" />
      <TextArea v-model="harness.draft.value" :disabled="harness.locked.value" maxlength="12000" rows="3" aria-label="绘图要求" placeholder="描述图件要求…" @keydown.ctrl.enter.prevent="send" @keydown.meta.enter.prevent="send" />
      <Box class="assistant-composer-toolbar"><Button size="xs" variant="quiet" aria-label="切换模型设置" @click="settingsOpen = !settingsOpen"><Text>{{ provider }}</Text><Text class="assistant-model">{{ harness.model.value || '默认模型' }}</Text><Icon name="chevron" /></Button><Button size="xs" :variant="harness.busy.value ? 'danger' : 'primary'" :disabled="harness.busy.value ? harness.cancelling.value : harness.locked.value || harness.loading.value || !harness.draft.value.trim() || harness.status.value?.state !== 'ready'" @click="harness.busy.value ? harness.cancel() : send()"><Icon :name="harness.busy.value ? 'close' : 'chat'" />{{ harness.busy.value ? harness.cancelling.value ? '正在停止…' : '停止运行' : '发送要求' }}</Button></Box>
      <Text class="assistant-composer-hint">{{ harness.preparingImage.value?'正在准备图片与组件图谱…':harness.loading.value ? '正在连接本地服务…' : 'Ctrl / ⌘ Enter 发送 · 当前图件会作为上下文' }}</Text>
    </Footer>
  </Aside>
  <Modal :open="settingsOpen&&open" label="助手设置" size="md" class="assistant-settings-dialog" @close="settingsOpen=false">
    <Header><Heading>助手设置</Heading><IconButton icon="close" label="关闭助手设置" @click="settingsOpen=false" /></Header>
    <ModalBody>
      <Box class="assistant-settings">
      <Box class="assistant-setting-grid"><Field><Text>Harness</Text><Select :value="harness.kind.value" :disabled="harness.locked.value || harness.loading.value" :options="[{value:'codex',label:'Codex'}, {value:'claude',label:'Claude'}]" size="sm" aria-label="Harness 类型" @change="harness.setKind($event as HarnessKind)" /></Field><Field><Text>模型</Text><TextField v-model="harness.model.value" :disabled="harness.locked.value" maxlength="100" aria-label="Harness 模型" placeholder="CLI 默认模型" /></Field></Box>
      <Box class="harness-status"><Icon :name="harness.status.value?.state === 'ready' ? 'check' : 'info'" /><Text>{{ harness.loading.value ? '正在连接…' : harness.status.value?.state === 'ready' ? 'CLI 可用' : 'CLI 不可用' }}</Text><IconButton icon="refresh" label="重新检测 Harness" :disabled="harness.loading.value || harness.locked.value" @click="harness.refresh" /></Box>
      <Text class="muted-caption">{{ harness.status.value?.version }} · {{ harness.status.value?.message || '使用本机 CLI 登录与模型配置' }}</Text>
      <Disclosure>
        <DisclosureTrigger size="xs">素材检索</DisclosureTrigger><Box class="assistant-retrieval-settings">
        <Field class="checkbox-field"><TextField type="checkbox" :checked="harness.catalogueMode.value==='auto'" :disabled="harness.locked.value" aria-label="按要求自动推荐组件" @change="harness.catalogueMode.value=($event.target as HTMLInputElement).checked?'auto':'none'" /><Text>按要求自动推荐组件</Text></Field>
      </Box>
      </Disclosure>
      </Box>
    </ModalBody>
    <Footer><Button size="xs" variant="quiet" :disabled="harness.locked.value || harness.loading.value || !harness.selectedSessionId.value" @click="harness.removeSession">移除当前会话</Button><Button variant="primary" @click="settingsOpen=false">完成</Button></Footer>
  </Modal>
</template>
