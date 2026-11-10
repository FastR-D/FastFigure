<script setup lang="ts">
import { computed,onBeforeUnmount,ref } from 'vue'
import { Box,Button,Disclosure,DisclosureTrigger,Footer,Header,Heading,Image,Modal,ModalBody,Text } from '@fastrd/ui-vue'
import { ErrorMessage } from '../ui'
import IconButton from '../ui/IconButton.vue'
import { referencePurposeLabels,type ReferenceInputInfo,type ReferenceUse } from '../../core/referenceInputs'
const props=withDefaults(defineProps<{inputs?:ReferenceInputInfo[];uses?:ReferenceUse[];runId?:string;available?:boolean;removable?:boolean}>(),{inputs:()=>[],uses:()=>[],available:true,removable:false,runId:undefined})
const entries=computed(()=>props.inputs.length?props.inputs.map(info=>({info,use:props.uses.find(r=>r.index===info.index&&r.id===info.id&&r.sha256===info.sha256&&r.purpose===info.purpose)})):props.uses.map(info=>({info,use:info})))
const emit=defineEmits<{remove:[index:number]}>(),selected=ref<ReferenceInputInfo|null>(null),source=ref(''),loading=ref(false),error=ref('');let request:AbortController|undefined
function release(){request?.abort();if(source.value)URL.revokeObjectURL(source.value);source.value=''}
function close(){release();selected.value=null}
async function preview(info:ReferenceInputInfo){
  if(!props.runId||!props.available)return
  release();selected.value=info;loading.value=true;error.value='';const controller=new AbortController();request=controller
  try{
    const response=await fetch(`/api/harness/runs/${props.runId}/references/${info.index}`,{signal:controller.signal});if(!response.ok)throw new Error('本轮参考图已清理或不可用，请重新发送需要的图片')
    const blob=await response.blob(),bytes=await blob.arrayBuffer();if(controller.signal.aborted)return
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('')
    if(info.inputSha256&&digest!==info.inputSha256)throw new Error('本轮参考图指纹不符，已停止显示')
    const bitmap=await createImageBitmap(blob),valid=bitmap.width===info.width&&bitmap.height===info.height;bitmap.close();if(!valid)throw new Error('本轮参考图尺寸不符，已停止显示')
    if(!controller.signal.aborted)source.value=URL.createObjectURL(blob)
  }catch(e){if(!controller.signal.aborted)error.value=(e as Error).message}finally{if(request===controller)loading.value=false}
}
onBeforeUnmount(release)
</script>
<template>
  <Box v-if="entries.length" class="reference-use-summary" aria-label="参考图用途与输入">
    <Text class="section-eyebrow">{{ runId?'本轮参考图':'图件参考来源' }}</Text>
    <Text v-if="uses.length" class="muted-caption">采用说明由模型提供，请核对实际图片与结果。</Text>
    <Box v-for="({info,use},i) in entries" :key="`${info.index}:${info.id}:${info.sha256}:${info.purpose}`" class="reference-use-item">
      <Text>{{ runId?`图 ${info.index} · `:'' }}{{ referencePurposeLabels[info.purpose] }} · {{ info.title }}</Text>
      <Text v-if="info.generated" class="muted-caption">AI 视觉设计草稿 · 非实验依据</Text>
      <template v-if="use">
        <Text>{{ use.decision==='use'?'采用':'未采用' }}：{{ use.application }}</Text>
        <Disclosure><DisclosureTrigger size="xs">观察与不确定性</DisclosureTrigger><Text>{{ use.observation }}</Text><Text v-if="use.uncertainty">待核对：{{ use.uncertainty }}</Text></Disclosure>
      </template>
      <Button v-if="runId" size="xs" :disabled="!available" @click="preview(info)">查看本轮参考图 {{ info.index }}</Button>
      <Disclosure><DisclosureTrigger size="xs">来源记录</DisclosureTrigger><Text>{{ info.citation||info.fileName }}</Text><Text class="reference-fingerprint">原文件：{{ info.sha256 }}</Text><Text v-if="info.inputSha256" class="reference-fingerprint">实际输入：{{ info.inputSha256 }}</Text></Disclosure>
      <Button v-if="removable" size="xs" variant="quiet" :aria-label="`移除参考来源记录 ${i+1}`" @click="emit('remove',i)">移除此来源记录</Button>
    </Box>
  </Box>
  <Modal :open="!!selected" size="xl" label="本轮实际参考图" @close="close"><Header><Box><Heading>图 {{ selected?.index }} · {{ selected?.title }}</Heading><Text v-if="selected" class="muted-caption">{{ referencePurposeLabels[selected.purpose] }} · 本轮图片输入快照 · {{ selected.width }} × {{ selected.height }}</Text></Box><IconButton icon="close" label="关闭实际参考图" @click="close" /></Header><ModalBody><Text v-if="loading" role="status">正在读取本轮图片…</Text><ErrorMessage v-if="error" class="error-text" :message="error" /><Image v-if="source" :src="source" class="reference-input-image" :alt="`本轮参考图 ${selected?.index}`" /></ModalBody><Footer><Button @click="close">关闭</Button></Footer></Modal>
</template>
