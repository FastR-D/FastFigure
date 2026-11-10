<script setup lang="ts">
import {computed,defineAsyncComponent,onBeforeUnmount,ref,shallowRef,watch} from 'vue'
import { Box,Button,Footer,Header,Heading,Link,Modal,ModalBody,Select,Text,TextField} from '@fastrd/ui-vue'
import { ErrorMessage } from '../ui'
import IconButton from '../ui/IconButton.vue'
import {feedbackPageSchema,feedbackRatingLabels} from '../../core/retrievalFeedback'
import {feedbackRequest} from '../../composables/retrievalFeedbackApi'
const RetrievalFeedbackDialog=defineAsyncComponent(()=>import('./RetrievalFeedbackDialog.vue'))
const props=defineProps<{open:boolean}>(),emit=defineEmits<{close:[]}>(),query=ref(''),rating=ref('all'),applied=ref({q:'',rating:'all'}),selected=ref(''),loading=ref(false),error=ref(''),page=shallowRef<ReturnType<typeof feedbackPageSchema.parse>>({records:[],total:0,offset:0,limit:12})
let epoch=0;onBeforeUnmount(()=>epoch++)
const exportUrl=computed(()=>`/api/component-library/feedback/export?${new URLSearchParams(applied.value)}`)
async function load(offset=0){const request=++epoch;loading.value=true;error.value='';const filter={q:query.value,rating:rating.value};try{const value=feedbackPageSchema.parse(await feedbackRequest(`/api/component-library/feedback?${new URLSearchParams({...filter,offset:String(offset),limit:'12'})}`));if(request===epoch){page.value=value;applied.value=filter}}catch(e){if(request===epoch)error.value=e instanceof Error&&!('issues'in e)?e.message:'反馈记录无效'}finally{if(request===epoch)loading.value=false}}
watch(()=>props.open,open=>{if(open)void load();else{epoch++;selected.value=''}},{immediate:true})
</script>
<template>
  <Modal :open="open&&!selected" size="xl" label="本机素材反馈记录" class="feedback-history-dialog" @close="emit('close')">
    <Header><Box><Heading>素材适用性反馈</Heading><Text class="muted-caption">每个样本保留完整要求、冻结图元、助手取舍与改判记录。通过界面提交的判断，不等于独立评测标签。</Text></Box><IconButton icon="close" label="关闭反馈记录" @click="emit('close')" /></Header>
    <ModalBody>
      <Box class="feedback-history-search"><TextField v-model="query" maxlength="200" aria-label="检索素材反馈" placeholder="素材名或这轮绘图要求" @keydown.enter="load()" /><Select :value="rating" :options="[{value:'all',label:'全部判断'},...Object.entries(feedbackRatingLabels).map(([value,label])=>({value,label}))]" aria-label="反馈判断范围" @change="rating=$event;load()" /><Button :disabled="loading" @click="load()">检索反馈</Button></Box>
      <Text v-if="loading" class="muted-caption">正在读取反馈…</Text><ErrorMessage v-if="error" class="error-text" :message="error" />
      <Text class="muted-caption">{{ page.total }} 个匹配样本；列表显示最新判断，打开后可查看全部改判与原生素材。</Text>
      <Box class="feedback-history-list"><Button v-for="record in page.records" :key="record.caseId" variant="quiet" class="feedback-history-card" :aria-label="`查看素材反馈 ${record.name}`" @click="selected=record.caseId"><Box><Text class="selection-title">{{ record.name }}</Text><Text>{{ feedbackRatingLabels[record.latest.rating] }}</Text></Box><Text>{{ record.query }}</Text><Text class="muted-caption">{{ record.latest.note||'未补充说明' }}</Text><Text class="muted-caption">{{ new Date(record.latest.createdAt).toLocaleString() }} · {{ record.assetSha256.slice(0,12) }}</Text></Button></Box>
      <Text v-if="!loading&&!page.total&&!error" class="empty-state">可在助手的“本机素材召回 → 反馈素材适用性”中开始记录。</Text>
    </ModalBody>
    <Footer><Link v-if="!loading&&page.total" :href="exportUrl" download>导出当前筛选的反馈集（JSONL）</Link><Box class="header-spacer" /><Button :disabled="loading||!page.offset" @click="load(Math.max(0,page.offset-page.limit))">上一页</Button><Text>{{ Math.floor(page.offset/page.limit)+1 }} / {{ Math.max(1,Math.ceil(page.total/page.limit)) }}</Text><Button :disabled="loading||page.offset+page.limit>=page.total" @click="load(page.offset+page.limit)">下一页</Button></Footer>
  </Modal>
  <RetrievalFeedbackDialog v-if="open&&selected" :open="true" :case-id="selected" @close="selected='';load(page.offset)" />
</template>
