<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Box, Button, Disclosure, DisclosureTrigger, Field, Select, Text, TextArea } from '../ui'
import type { Harness } from '../../composables/useHarness'
import type { FigureDocument } from '../../core/model'
import type { ReconstructionTask } from '../../core/reconstructionContract'
import { reconstructionCandidateGroup, reconstructionWorkers, sceneForReconstruction } from '../../core/reconstruction'

const props=defineProps<{harness:Harness;before:FigureDocument;after:FigureDocument;task:ReconstructionTask}>()
const selected=ref(''),focus=ref('general'),note=ref('')
const batchRegions=ref<string[]>([]),totalSeconds=ref('360')
const focuses=[
  {value:'general',label:'综合核对',instruction:'逐项核对原图的文字、标志性结构、曲线、颜色和绘制顺序，修复可确认的问题。'},
  {value:'text',label:'文字与注释',instruction:'核对文字、上下标、简洁注释和字体排版，修复错字与遗漏，保留其他几何。'},
  {value:'missing',label:'缺漏图元',instruction:'检查并补充遗漏的结构、图示、图例和数据标记，不用文字方框替代实际结构。'},
  {value:'connections',label:'连线与箭头',instruction:'核对连线路径、转折、端点与箭头方向，保持原图拓扑并修复可确认的问题。'},
  {value:'appearance',label:'轮廓与颜色',instruction:'核对轮廓、圆角、填充、描边、颜色和前后遮挡，保留文字与连接语义。'},
]
const state=computed(()=>{try{const group=reconstructionCandidateGroup(props.before,props.after,props.task);return{workers:reconstructionWorkers(group.reconstruction,sceneForReconstruction(props.after,group.id)),error:''}}catch(e){return{workers:[],error:(e as Error).message}}})
watch(()=>state.value.workers,workers=>{const preferred=props.task.kind==='repair'?props.task.regionId:'';if(!workers.some(w=>w.id===selected.value))selected.value=workers.find(w=>w.id===preferred)?.id??workers[0]?.id??''},{immediate:true})
function prepare(){const worker=state.value.workers.find(w=>w.id===selected.value);if(!worker)return;props.harness.prepareCandidateRepair(worker.id,`继续修复尚未应用的候选图，检查分区「${worker.title||worker.id}」。${focuses.find(f=>f.value===focus.value)!.instruction}${note.value.trim()?`\n具体问题：${note.value.trim()}`:''}\n只修改这个分区，保持其他区域、手工对象和已有格式；无法确认的内容在说明中列出，不猜测。`)}
function toggleRegion(id:string){if(batchRegions.value.includes(id))batchRegions.value=batchRegions.value.filter(r=>r!==id);else if(batchRegions.value.length<6)batchRegions.value.push(id)}
function startPlan(){void props.harness.startRepairPlan(batchRegions.value,`${focuses.find(f=>f.value===focus.value)!.instruction}${note.value.trim()?`\n具体问题：${note.value.trim()}`:''}\n保持其他区域、手工对象与已有格式，无法确认的内容写入说明。`,Number(totalSeconds.value))}
</script>

<template>
  <Disclosure class="candidate-repair">
    <DisclosureTrigger size="xs">继续修复候选</DisclosureTrigger>
    <Text class="muted-caption">以这版候选继续修复，画布在最终应用前保持原样。每轮使用助手设置中的运行时限。</Text>
    <Field><Text>检查分区</Text><Select :value="selected" :options="state.workers.map(w=>({value:w.id,label:`${w.title||w.id}${w.detailPass?' · 细节':''}`}))" aria-label="候选修复分区" :disabled="harness.locked.value||harness.loading.value" @change="selected=$event" /></Field>
    <Field><Text>修复重点</Text><Select :value="focus" :options="focuses" aria-label="候选修复重点" :disabled="harness.locked.value||harness.loading.value" @change="focus=$event" /></Field>
    <TextArea v-model="note" rows="2" maxlength="1200" aria-label="候选修复具体问题" placeholder="例如：编码器少了一条残差连接，图例文字不完整" :disabled="harness.locked.value||harness.loading.value" />
    <Text class="muted-caption">可先让独立会话比较原图和当前渲染，列出可定位的问题；沿用所选分区与上方关注点。</Text>
    <Button size="xs" :disabled="!selected||harness.stale.value||harness.locked.value||harness.loading.value" @click="harness.startVisualAudit(selected,`${focuses.find(f=>f.value===focus)!.instruction}${note.trim()?`\n关注：${note.trim()}`:''}`)">{{ harness.preparingImage.value?'正在准备审阅图片…':'视觉审阅此分区' }}</Button>
    <Text v-if="state.error" role="alert" class="error-text">{{ state.error }}</Text>
    <Box class="candidate-repair-actions"><Button size="xs" :disabled="!selected||harness.stale.value||harness.locked.value||harness.loading.value" @click="prepare">准备候选修复</Button></Box>
    <Disclosure class="repair-plan-setup">
      <DisclosureTrigger size="xs">批量核对分区</DisclosureTrigger>
      <Text class="muted-caption">按勾选顺序逐区核对，最多 6 区。各轮保留候选，结束后审阅应用。切换 Tab 或刷新不重启计划。</Text>
      <Box class="repair-plan-regions" role="group" aria-label="批量核对分区选择"><Button v-for="worker in state.workers" :key="worker.id" size="xs" variant="quiet" role="checkbox" :aria-checked="batchRegions.includes(worker.id)" :aria-label="`核对分区 ${worker.title||worker.id}${worker.detailPass?' · 细节':''}`" :disabled="harness.locked.value||harness.loading.value||!batchRegions.includes(worker.id)&&batchRegions.length>=6" @click="toggleRegion(worker.id)"><Text>{{ batchRegions.includes(worker.id)?`${batchRegions.indexOf(worker.id)+1}.`:'□' }}</Text><Text>{{ worker.title||worker.id }}{{ worker.detailPass?' · 细节':'' }}</Text></Button></Box>
      <Field><Text>总时限</Text><Select :value="totalSeconds" aria-label="分区核对总时限" :options="[{value:'180',label:'3 分钟'},{value:'360',label:'6 分钟'},{value:'600',label:'10 分钟'},{value:'1200',label:'20 分钟'}]" :disabled="harness.locked.value||harness.loading.value" @change="totalSeconds=$event" /></Field>
      <Text class="muted-caption">单轮上限 {{ harness.timeoutSeconds.value/60 }} 分钟；失败、取消、预算不足或本页画布变化即停止。沿用上方修复重点与具体问题。</Text>
      <Button size="xs" :disabled="!batchRegions.length||harness.stale.value||harness.locked.value||harness.loading.value" @click="startPlan">{{ harness.planPreparing.value?'正在准备分区裁片…':`开始核对 ${batchRegions.length} 个分区` }}</Button>
    </Disclosure>
  </Disclosure>
</template>
