<script setup lang="ts">
import {onBeforeUnmount,ref} from 'vue'
import { Box,Button,Disclosure,DisclosureTrigger,Image,Text,TextArea} from '@fastrd/ui-vue'
import { ErrorMessage } from '../ui'
import type {ComponentImageQuery} from '../../core/componentSearch'
import {selectionEvidenceSchema} from '../../core/repositorySelection'
const props=defineProps<{query:ComponentImageQuery}>(),image=ref(''),error=ref(''),loading=ref(false),evidence=ref<{prompt:string;response?:string}|null>(null)
let epoch=0;onBeforeUnmount(()=>{epoch++;if(image.value)URL.revokeObjectURL(image.value)})
async function inspect(kind:'image'|'evidence'){
  if(loading.value)return
  const token=++epoch;loading.value=true;error.value=''
  try{
    const response=await fetch(`/api/harness/runs/${props.query.evidenceRunId}/${kind==='image'?'input-image':'image-query-evidence'}`,{signal:AbortSignal.timeout(20_000)})
    if(!response.ok)throw new Error('本轮裁片或分析记录已清理；已保存反馈中的裁片仍可查看')
    if(kind==='image'){
      const blob=await response.blob();if(blob.size>600_000||!['image/png','image/webp'].includes(blob.type))throw new Error('裁片格式或容量无效')
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(byte=>byte.toString(16).padStart(2,'0')).join('');if(hash!==props.query.imageSha256)throw new Error('裁片与看图检索指纹不符')
      if(token===epoch){if(image.value)URL.revokeObjectURL(image.value);image.value=URL.createObjectURL(blob)}
    }else{
      const value=selectionEvidenceSchema.parse(await response.json()),digest=async(text:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(byte=>byte.toString(16).padStart(2,'0')).join('')
      if(value.runId!==props.query.evidenceRunId||await digest(value.prompt)!==props.query.promptSha256||value.response===undefined||await digest(value.response)!==props.query.responseSha256)throw new Error('看图分析记录与本轮指纹不符')
      if(token===epoch)evidence.value=value
    }
  }catch(e){if(token===epoch)error.value=(e as Error).message}finally{if(token===epoch)loading.value=false}
}
</script>
<template>
  <Disclosure class="component-image-query" open>
    <DisclosureTrigger size="xs">看图分析与检索线索</DisclosureTrigger>
    <Text>{{ query.analysis.summary }}</Text><Text class="muted-caption">以下为模型观察，不是科学结构验证；只有标为可见的检索词参与文字粗排。</Text>
    <Box v-for="(term,index) in query.analysis.terms" :key="index"><Text>{{ term.certainty==='visible'?'可见线索':'不确定，未用于检索' }} · {{ term.term }}</Text><Text class="muted-caption">{{ term.basis }}</Text></Box>
    <Text v-for="caution in query.analysis.cautions" :key="caution" class="muted-caption">待核对：{{ caution }}</Text>
    <Text class="muted-caption">{{ query.image.width }} × {{ query.image.height }} · {{ query.provider }} · {{ query.model||'CLI 默认模型，具体身份未报告' }} · {{ (query.elapsedMs/1000).toFixed(1) }} 秒</Text>
    <Box><Button size="xs" :disabled="loading" @click="inspect('image')">核对检索裁片</Button><Button size="xs" :disabled="loading" @click="inspect('evidence')">核对看图分析记录</Button></Box>
    <Image v-if="image" class="component-query-image" :src="image" alt="模型实际用于素材检索的裁片" />
    <Disclosure><DisclosureTrigger size="xs">实际文字查询</DisclosureTrigger><Text class="feedback-query">{{ query.searchQuery }}</Text></Disclosure>
    <Disclosure v-if="evidence"><DisclosureTrigger size="xs">看图提示与原响应</DisclosureTrigger><TextArea :value="evidence.prompt" readonly rows="6" aria-label="看图检索提示" /><TextArea :value="evidence.response" readonly rows="6" aria-label="看图检索原响应" /></Disclosure>
    <ErrorMessage v-if="error" class="error-text" :message="error" />
  </Disclosure>
</template>
