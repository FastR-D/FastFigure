<script setup lang="ts">
import {computed,onBeforeUnmount,ref,useTemplateRef,watch} from 'vue'
import { Box,Button,Heading,Image,Text} from '@fastrd/ui-vue'
import { ErrorMessage } from '../ui'
import type {Harness} from '../../composables/useHarness'
import type {HarnessTurn} from '../../core/harness'
import {designReviewCategories} from '../../core/designReview'
const props=defineProps<{turn:HarnessTurn;harness:Harness}>(),selected=ref(''),url=ref(''),error=ref(''),loading=ref(false),preview=useTemplateRef<HTMLElement>('preview')
const report=computed(()=>props.turn.designReviewReport!),info=computed(()=>props.turn.designReview!),finding=computed(()=>report.value.findings.find(f=>f.id===selected.value))
const severities={major:'主要',minor:'次要',uncertain:'待确认'}
let request:AbortController|undefined
function release(){if(url.value)URL.revokeObjectURL(url.value);url.value=''}
async function load(){
  request?.abort();const controller=new AbortController();request=controller;release();loading.value=true;error.value=''
  try{
    const response=await fetch(`/api/harness/runs/${props.turn.id}/candidate-image`,{signal:controller.signal});if(!response.ok)throw new Error('本轮实际图片已清理或暂不可读，报告仍保留')
    const blob=await response.blob(),bytes=await blob.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('')
    if(hash!==info.value.imageSha256)throw new Error('本轮审阅图片指纹不符')
    const bitmap=await createImageBitmap(blob);try{if(bitmap.width!==info.value.width||bitmap.height!==info.value.height)throw new Error('本轮审阅图片尺寸不符')}finally{bitmap.close()}
    if(!controller.signal.aborted)url.value=URL.createObjectURL(blob)
  }catch(e){if(!controller.signal.aborted)error.value=(e as Error).message}finally{if(request===controller)loading.value=false}
}
function locate(id:string){selected.value=id;preview.value?.scrollIntoView({block:'nearest'})}
watch(()=>props.turn.id,()=>{selected.value='';void load()},{immediate:true})
onBeforeUnmount(()=>{request?.abort();release()})
</script>

<template>
  <Box class="visual-audit-report" aria-label="主图设计审阅">
    <Heading>主图设计审阅</Heading><Text class="muted-caption">依据本轮整图渲染提出建议；设计判断仍需结合研究内容。</Text>
    <Text>第一眼与阅读路径：{{ report.firstRead }}</Text>
    <Box ref="preview" class="visual-audit-images"><Box v-if="url" class="visual-audit-image"><Text>实际发送的整图</Text><Box class="visual-audit-raster"><Image :src="url" alt="设计审阅整图" /><Box v-if="finding" class="visual-audit-location" :style="{left:`${finding.box.x*100}%`,top:`${finding.box.y*100}%`,width:`${finding.box.width*100}%`,height:`${finding.box.height*100}%`}" aria-hidden="true" /></Box></Box></Box>
    <Text v-if="loading" class="muted-caption">正在读取本轮实际图片…</Text><Box v-if="error"><ErrorMessage class="error-text" :message="error" /><Button size="xs" @click="load">重新读取整图</Button></Box>
    <Text class="muted-caption">{{ info.width }} × {{ info.height }} 像素 · 报告针对这版画布</Text>
    <Text v-for="(item,i) in report.keep" :key="i">保留：{{ item }}</Text>
    <Text v-if="!report.findings.length" class="muted-caption">本轮没有提出具体改动建议；不代表自动验收通过。</Text>
    <Box v-for="item in report.findings" :key="item.id" class="visual-audit-finding" :data-finding-id="item.id" :class="{selected:selected===item.id}">
      <Button size="xs" variant="quiet" :aria-label="`在整图中定位 ${item.title}`" @click="locate(item.id)">{{ item.title }}</Button><Text class="muted-caption">{{ designReviewCategories[item.category] }} · {{ severities[item.severity] }}</Text>
      <Text>观察：{{ item.observation }}</Text><Text>影响：{{ item.impact }}</Text><Text>建议：{{ item.suggestion }}</Text>
      <Button v-if="item.objectIds.length" size="xs" :disabled="harness.locked.value||harness.loading.value||harness.stale.value" @click="harness.locateDesignObjects(turn.id,item.objectIds)">选中相关对象</Button>
    </Box>
    <Text v-for="(item,i) in report.uncertainties" :key="i" class="placement-message">待核对：{{ item }}</Text>
    <Text v-if="harness.stale.value" role="alert" class="error-text">画布已变化，报告与图片仍保留；请重新审阅后定位当前对象。</Text>
  </Box>
</template>
