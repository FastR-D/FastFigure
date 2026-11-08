<script setup lang="ts">
import {computed,onBeforeUnmount,ref,shallowRef,watch} from 'vue'
import { ErrorMessage,Box,Button,Disclosure,DisclosureTrigger,Footer,Header,Heading,Image,Modal,ModalBody,Text,TextArea} from '../ui'
import IconButton from '../ui/IconButton.vue'
import AssetPreview from './AssetPreview.vue'
import {feedbackRatingLabels,feedbackReceiptSchema,verifyFeedbackCase,type FeedbackCase,type FeedbackInput} from '../../core/retrievalFeedback'
import {feedbackRequest} from '../../composables/retrievalFeedbackApi'
import {downloadFile} from '../../core/export'

const props=defineProps<{open:boolean;runId?:string;componentKey?:string;caseId?:string}>(),emit=defineEmits<{close:[];saved:[]}>()
const sample=shallowRef<FeedbackCase|null>(null),loading=ref(false),saving=ref(false),editing=ref(false),rating=ref<FeedbackInput['rating']|null>(null),note=ref(''),error=ref(''),message=ref(''),frozen=shallowRef<FeedbackInput|null>(null)
let epoch=0;onBeforeUnmount(()=>epoch++)
const latest=computed(()=>sample.value?.revisions.at(-1)?.record),choice=computed(()=>sample.value?.context.report.selection?.choices.find(row=>row.key===sample.value?.context.componentKey)),attached=computed(()=>sample.value?.context.report.catalogue.some(row=>row.key===sample.value?.context.componentKey)),changed=computed(()=>rating.value&&(!latest.value||rating.value!==latest.value.rating||note.value.trim()!==latest.value.note)),decisions={include:'保留',exclude:'排除',uncertain:'不确定'}
function draft(){rating.value=latest.value?.rating??null;note.value=latest.value?.note??'';frozen.value=null;editing.value=!latest.value}
async function load(){
  const request=++epoch;loading.value=true;saving.value=false;error.value='';message.value='';frozen.value=null
  try{
    const path=props.caseId?`/api/component-library/feedback/${props.caseId}`:`/api/harness/runs/${props.runId}/retrieval-context?${new URLSearchParams({key:props.componentKey??''})}`,value=await verifyFeedbackCase(await feedbackRequest(path))
    if(props.caseId&&value.id!==props.caseId||props.runId&&value.context.runId!==props.runId||props.componentKey&&value.context.componentKey!==props.componentKey)throw new Error('反馈上下文与所选素材不符')
    if(request===epoch){sample.value=value;draft()}
  }catch(e){if(request===epoch){sample.value=null;error.value=e instanceof Error&&!('issues'in e)?e.message:'反馈上下文无效'}}finally{if(request===epoch)loading.value=false}
}
watch(()=>[props.open,props.runId,props.componentKey,props.caseId],()=>{if(props.open)void load();else{epoch++;sample.value=null}},{immediate:true})
async function save(){
  if(loading.value||saving.value||!sample.value||!rating.value||!frozen.value&&!changed.value)return
  frozen.value??={id:crypto.randomUUID(),componentKey:sample.value.context.componentKey,rating:rating.value,note:note.value.trim(),previousId:latest.value?.id??null}
  const payload=frozen.value,packet=sample.value,request=epoch;saving.value=true;error.value='';message.value=''
  try{
    const receipt=feedbackReceiptSchema.parse(await feedbackRequest(`/api/harness/runs/${packet.context.runId}/retrieval-feedback`,payload)),record=receipt.record
    if(record.id!==payload.id||record.caseId!==packet.id||record.rating!==payload.rating||record.note!==payload.note||record.previousId!==payload.previousId)throw new Error('反馈回执与本次提交不符')
    if(request!==epoch)return
    if(receipt.latestId!==record.id){await load();message.value='该次反馈已保存，当前已有更新的判断'}
    else{const verified=await verifyFeedbackCase({...packet,revisions:packet.revisions.some(row=>row.record.id===record.id)?packet.revisions:[...packet.revisions,{record,sha256:receipt.sha256}]});if(request!==epoch)return;sample.value=verified;draft();message.value='反馈已记录，原有判断保留'}
    emit('saved')
  }catch(e){if(request===epoch)error.value=e instanceof Error&&!('issues'in e)?e.message:'反馈回执无效，可重试同一反馈核对'}finally{if(request===epoch)saving.value=false}
}
function modify(){draft();editing.value=true;message.value=''}
function cancelEdit(){draft();error.value=''}
function backup(){if(sample.value?.revisions.length)downloadFile(`retrieval-feedback-${sample.value.id.slice(0,12)}.json`,JSON.stringify(sample.value,null,2),'application/json')}
</script>
<template>
  <Modal :open="open" size="xl" label="素材适用性反馈" class="retrieval-feedback-dialog" @close="emit('close')">
    <Header><Box><Heading>{{ sample?.context.asset.name??'素材适用性反馈' }}</Heading><Text class="muted-caption">反馈保存在本机，包含检索时的完整要求与冻结图元；用于积累样本，不会自动改图、排序或训练模型。</Text></Box><IconButton icon="close" label="关闭素材反馈" @click="emit('close')" /></Header>
    <ModalBody>
      <Text v-if="loading" class="muted-caption">正在核对素材与反馈指纹…</Text>
      <Box v-if="sample" class="retrieval-feedback-layout">
        <Box><Box class="component-preview-pane"><AssetPreview :asset="sample.context.asset" /><Box class="asset-stats"><Text>{{ sample.context.asset.figure.nodes.length }} 个原生图元</Text><Text>{{ sample.context.asset.figure.edges.length }} 条连接</Text><Text>本轮冻结内容</Text></Box></Box><Disclosure v-if="sample.context.referenceImage" open><DisclosureTrigger size="xs">检索时实际裁片</DisclosureTrigger><Image class="feedback-reference-image" :src="sample.context.referenceImage.dataUrl" alt="本轮看图检索的冻结裁片" /><Text class="muted-caption">{{ sample.context.referenceImage.width }} × {{ sample.context.referenceImage.height }} · {{ sample.context.report.visualQuery?.analysis.summary }}</Text></Disclosure><Disclosure><DisclosureTrigger size="xs">来源与指纹</DisclosureTrigger><Text v-for="(source,index) in sample.context.asset.sources" :key="index" class="muted-caption">{{ source.title }} · {{ source.reference }}</Text><Text class="repository-directory">素材 SHA-256 · {{ sample.context.assetSha256 }}</Text><Text class="repository-directory">样本 SHA-256 · {{ sample.id }}</Text><Text class="muted-caption">{{ sample.context.provider }} · {{ sample.context.model||'CLI 默认模型，具体身份未报告' }}</Text></Disclosure></Box>
        <Box class="retrieval-feedback-fields">
          <Heading>检索时完整要求</Heading><Text class="feedback-query">{{ sample.context.report.query }}</Text>
          <Text class="muted-caption">本轮参考清单：{{ attached?'已附带':'未附带' }}{{ sample.context.report.fromSearchRunId?' · 沿用看图检索':sample.context.report.fromPlanRunId?' · 沿用原规划':'' }}</Text>
          <Text v-if="sample.context.capabilities" class="muted-caption">{{ sample.context.capabilities.kind==='recipe'?'原生配方参考：预览为当时默认形态，可在所列范围内配置。':sample.context.capabilities.kind==='asset'?'已保存快照：按冻结图元复用，配方来源不代表可重新生成。':'基础素材：可编辑图元，没有配方参数。' }}</Text>
          <Disclosure v-if="sample.context.capabilities?.fields.length"><DisclosureTrigger size="xs">本轮允许的配方参数</DisclosureTrigger><Text v-for="field in sample.context.capabilities.fields" :key="field.key" class="muted-caption">{{ field.label }}：{{ field.options.map(option=>`${option.label} (${option.value})`).join(' / ') }}</Text></Disclosure>
          <Disclosure v-if="choice"><DisclosureTrigger size="xs">助手原判断：{{ decisions[choice.decision] }}</DisclosureTrigger><Text class="muted-caption">{{ choice.reason }}</Text><Text v-for="quote in choice.requirements" :key="quote" class="muted-caption">要求原文：「{{ quote }}」</Text></Disclosure>
          <Heading>这份素材适合这轮要求吗？</Heading>
          <Box class="feedback-ratings"><Button v-for="(label,value) in feedbackRatingLabels" :key="value" size="sm" :aria-pressed="rating===value" :disabled="loading||!editing||saving||!!frozen" @click="rating=value">{{ label }}</Button></Box>
          <TextArea v-model="note" rows="4" maxlength="1000" aria-label="素材反馈说明" placeholder="可选：结构、参数、用途或未满足的要求" :disabled="loading||!editing||saving||!!frozen" />
          <Text v-if="latest" class="muted-caption">已记录：{{ feedbackRatingLabels[latest.rating] }} · {{ new Date(latest.createdAt).toLocaleString() }}</Text>
          <Text v-if="frozen&&error" class="muted-caption">本次判断已冻结，可重试同一请求。重新读取会以服务器当前记录为准。</Text>
          <Disclosure v-if="sample.revisions.length>1"><DisclosureTrigger size="xs">改判记录 · {{ sample.revisions.length }} 次</DisclosureTrigger><Box v-for="revision in sample.revisions" :key="revision.record.id" class="feedback-revision"><Text>{{ feedbackRatingLabels[revision.record.rating] }} · {{ new Date(revision.record.createdAt).toLocaleString() }}</Text><Text>{{ revision.record.note||'未补充说明' }}</Text></Box></Disclosure>
        </Box>
      </Box>
      <Text v-if="message" role="status" class="placement-message">{{ message }}</Text><ErrorMessage v-if="error" class="error-text" :message="error" />
    </ModalBody>
    <Footer><Button :disabled="loading||saving" @click="load">重新读取反馈</Button><Button :disabled="!sample?.revisions.length||loading||saving" @click="backup">导出反馈样本</Button><Box class="header-spacer" /><Button v-if="latest&&!editing" :disabled="loading||saving" @click="modify">修改判断</Button><Button v-if="latest&&editing" :disabled="loading||saving" @click="cancelEdit">取消改判</Button><Button v-if="editing" variant="primary" :disabled="!sample||loading||saving||!rating||!frozen&&!changed" @click="save">{{ saving?'正在记录…':frozen?'重试保存同一反馈':'保存适用性反馈' }}</Button></Footer>
  </Modal>
</template>
