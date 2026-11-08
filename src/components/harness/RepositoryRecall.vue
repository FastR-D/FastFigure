<script setup lang="ts">
import {computed,defineAsyncComponent,onBeforeUnmount,ref} from 'vue'
import { ErrorMessage,Box,Button,Disclosure,DisclosureTrigger,Text,TextArea} from '../ui'
import {useEditor} from '../../composables/useEditor'
import type {RepositoryRecall} from '../../core/repositoryRecall'
import {selectionEvidenceSchema} from '../../core/repositorySelection'
import ComponentImageQuery from './ComponentImageQuery.vue'
import CatalogueInputPreview from './CatalogueInputPreview.vue'
const RetrievalFeedbackDialog=defineAsyncComponent(()=>import('../library/RetrievalFeedbackDialog.vue'))
const props=defineProps<{report:RepositoryRecall;runId:string;running:boolean}>(),feedbackKey=ref(''),feedbackCandidates=computed(()=>props.report.selection?.candidates??props.report.catalogue)
const editor=useEditor(),error=ref(''),opening=ref(''),evidence=ref<{prompt:string;response?:string}|null>(null),labels={candidate:'等待筛选',included:'已附带', 'already-attached':'已有同一工作快照', 'not-selected':'未选入',unavailable:'不可用'},fields={identity:'标识',name:'名称',tags:'标签',description:'说明',sources:'来源'},states={pending:'筛选中',completed:'已完成',failed:'失败',cancelled:'已停止',skipped:'已跳过'},decisions={include:'保留',exclude:'排除',uncertain:'不确定，未附带'}
let epoch=0;onBeforeUnmount(()=>epoch++)
async function inspect(id:string){if(opening.value)return;const request=++epoch;opening.value=id;error.value='';try{const {asset,record}=await editor.repository.read(id);if(request===epoch)editor.assetDialog.value={mode:'repository',record,asset}}catch(e){if(request===epoch)error.value=(e as Error).message}finally{if(request===epoch)opening.value=''}}
const candidate=(key:string)=>props.report.selection?.candidates.find(row=>row.key===key)
function inspectChoice(key:string){const id=candidate(key)?.snapshotId;if(id)void inspect(id)}
async function rawEvidence(){
  const id=props.report.selection?.evidenceRunId;if(!id||opening.value)return
  const request=++epoch;opening.value='evidence';error.value=''
  try{
    const response=await fetch(`/api/harness/runs/${id}/selection-evidence`);if(!response.ok)throw new Error('本轮筛选原始记录不可用，服务重启或清理后不再保留')
    const value=selectionEvidenceSchema.parse(await response.json()),digest=async(text:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(byte=>byte.toString(16).padStart(2,'0')).join('')
    if(value.runId!==id||await digest(value.prompt)!==props.report.selection?.promptSha256||value.promptSha256!==props.report.selection?.promptSha256||value.response!==undefined&&(await digest(value.response)!==props.report.selection?.responseSha256||value.responseSha256!==props.report.selection?.responseSha256))throw new Error('筛选原始记录与本轮指纹不符')
    if(request===epoch)evidence.value=value
  }catch(e){if(request===epoch)error.value=(e as Error).message}finally{if(request===epoch)opening.value=''}
}
</script>
<template>
  <Disclosure class="repository-recall" aria-label="本机素材召回记录">
    <DisclosureTrigger size="xs">{{ report.visualQuery?'看图素材检索':'本机素材召回' }} · {{ report.visualQuery?report.catalogue.length:report.matches.filter(row=>row.decision==='included'||row.decision==='already-attached').length }} 项附带</DisclosureTrigger>
    <ComponentImageQuery v-if="report.visualQuery" :query="report.visualQuery" />
    <Text v-if="report.fromSearchRunId" class="muted-caption">沿用已采用的检索裁片与冻结素材，没有重新检索。</Text>
    <Text v-if="report.fromPlanRunId" class="muted-caption">沿用已采用方案的固定素材，本轮没有重新检索。</Text>
    <Text class="muted-caption">按整段要求匹配名称，支持常用中英文别名。结构和否定要求仍须核对，模型可以不使用。</Text>
    <Disclosure v-if="report.selection" aria-label="助手素材筛选">
<DisclosureTrigger size="xs">助手逐项筛选 · {{ states[report.selection.status] }}</DisclosureTrigger>
      <Text class="muted-caption">{{ report.selection.message }}</Text><Text class="muted-caption">{{ report.visualQuery?report.selection.previews?.status==='ready'?'结合实际裁片、完整候选图谱与原生目录判断；图谱为默认 / 保存配置。':report.selection.previews?.status==='pending'?'正在准备候选图谱，尚未进行素材筛选。':'仅原裁片 / 原生目录判断，未附完整候选图谱。':'仅文字 / 原生目录判断。' }}引文核对不代表理由正确，仍须审阅。</Text>
      <Box v-if="report.selection.previews"><Text class="muted-caption">候选图谱：{{ report.selection.previews.status==='pending'?'等待浏览器渲染':report.selection.previews.status==='ready'?`${report.selection.previews.sheets.length} 页 · 覆盖 ${report.selection.previews.candidateCount} 项`:'未完成，已停止筛选' }}{{ report.selection.previews.elapsedMs!==undefined?` · ${(report.selection.previews.elapsedMs/1000).toFixed(1)} 秒`:'' }}</Text><ErrorMessage v-if="report.selection.previews.error" class="error-text" :message="report.selection.previews.error" /><CatalogueInputPreview v-for="(sheet,index) in report.selection.previews.sheets" :key="sheet.sha256" :info="sheet" :run-id="report.selection.previews.evidenceRunId" :selection-page="index+1" :available="true" /></Box>
      <Text class="muted-caption">{{ report.selection.provider }} · {{ report.selection.model||'CLI 默认模型，具体身份未报告' }}{{ report.selection.elapsedMs!==undefined?` · ${(report.selection.elapsedMs/1000).toFixed(1)} 秒`:'' }}</Text>
      <Box v-for="choice in report.selection.choices" :key="choice.key" class="repository-recall-match"><Box><Button v-if="candidate(choice.key)?.snapshotId" size="xs" variant="quiet" :disabled="!!opening" :aria-label="`查看召回素材 ${candidate(choice.key)?.name}`" @click="inspectChoice(choice.key)">{{ candidate(choice.key)?.name }}</Button><Text v-else>{{ candidate(choice.key)?.name||choice.key }}</Text><Text class="muted-caption">{{ decisions[choice.decision] }}</Text></Box><Text class="muted-caption">{{ choice.reason }}</Text><Text v-for="quote in choice.requirements" :key="quote" class="muted-caption">要求原文：「{{ quote }}」</Text><Text class="muted-caption">冻结内容 {{ candidate(choice.key)?.assetSha256.slice(0,12) }}</Text></Box>
      <Button v-if="report.selection.promptSha256&&report.selection.evidenceRunId" size="xs" variant="quiet" :disabled="!!opening||report.selection.status==='pending'" @click="rawEvidence">核对筛选原始记录</Button>
      <Disclosure v-if="evidence"><DisclosureTrigger size="xs">筛选提示与原响应</DisclosureTrigger><TextArea :value="evidence.prompt" readonly rows="6" aria-label="素材筛选完整提示" /><TextArea :value="evidence.response??'模型未返回响应'" readonly rows="6" aria-label="素材筛选原始响应" /></Disclosure>
    </Disclosure>
    <Text v-if="report.omittedTerms" class="muted-caption">本轮使用 {{ report.groups.length }} 组词，另有 {{ report.omittedTerms }} 个候选词未参与。</Text>
    <Disclosure v-if="report.groups.length"><DisclosureTrigger size="xs">检索词与名称别名 · {{ report.groups.length }} 组</DisclosureTrigger><Text v-for="group in report.groups" :key="group.label" class="muted-caption">{{ group.label }}{{ group.kind==='alias'?` → ${group.terms.join(' / ')}`:'' }}</Text></Disclosure>
    <Text v-if="report.candidatePoolCapped" class="muted-caption">粗排候选超过 24 项，本轮只细排前 24 项。</Text>
    <Text v-if="!report.matches.length" class="muted-caption">没有召回匹配的本机快照。</Text>
    <Disclosure :open="!report.selection"><DisclosureTrigger size="xs">文字匹配依据 · {{ report.matches.length }} 项</DisclosureTrigger><Box v-for="row in report.matches" :key="row.snapshotId" class="repository-recall-match"><Box><Button size="xs" variant="quiet" :disabled="!!opening" :aria-label="`查看召回素材 ${row.name}`" @click="inspect(row.snapshotId)">{{ row.name }}</Button><Text class="muted-caption">{{ labels[row.decision] }}</Text></Box><Text v-for="(label,field) in fields" v-show="row.matched[field].length" :key="field" class="muted-caption">{{ label }}命中：{{ row.matched[field].join('、') }}</Text><Text v-if="row.note" class="muted-caption">{{ row.note }}</Text><Text class="muted-caption">快照 {{ row.snapshotId.slice(0,12) }}</Text></Box></Disclosure>
    <ErrorMessage v-if="error" class="error-text" :message="error" />
    <Disclosure><DisclosureTrigger size="xs">实际参考清单 · {{ report.catalogue.length }} 项</DisclosureTrigger><Text v-for="item in report.catalogue" :key="item.key" class="muted-caption">{{ item.name }} · {{ item.snapshotId?'本机快照':item.key.startsWith('asset:')?'工作组件':'内置素材' }}</Text></Disclosure>
    <Disclosure v-if="feedbackCandidates.length"><DisclosureTrigger size="xs">反馈素材适用性</DisclosureTrigger><Text class="muted-caption">对照这轮完整要求评价素材；首次记录需要本轮冻结内容仍保留，已保存样本可在本机反馈记录中改判和导出。</Text><Box v-for="item in feedbackCandidates" :key="item.key" class="feedback-candidate-row"><Text>{{ item.name }}</Text><Button size="xs" :disabled="running" :aria-label="`评价素材 ${item.name}`" @click="feedbackKey=item.key">评价</Button></Box></Disclosure>
  </Disclosure>
  <RetrievalFeedbackDialog v-if="feedbackKey" :open="true" :run-id="runId" :component-key="feedbackKey" @close="feedbackKey=''" />
</template>
