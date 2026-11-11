<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Box, Button, Field, Heading, Text, TextField } from '@fastrd/ui-vue'
import { ErrorMessage } from '../ui'
import { rootContainer, type FigureDocument } from '../../core/model'
import type { ReconstructionTask, ReconstructionImageInfo } from '../../core/reconstructionContract'
import { captureComponent } from '../../core/assets'
import { reconstructionCandidateGroup, reconstructionViewport, repairContext, sourceRoi } from '../../core/reconstruction'
import ReferencePreview from '../references/ReferencePreview'
import FigureRenderer from '../figure/FigureRenderer'
import ReconstructionReuseSummary from '../references/ReconstructionReuseSummary.vue'
const props=defineProps<{before:FigureDocument;after:FigureDocument;task:ReconstructionTask;runId?:string;inputImage?:ReconstructionImageInfo}>(),opacity=ref(.55),exactInput=ref(''),imageError=ref(''),imageLoading=ref(false)
let request:AbortController|undefined
async function loadInput(){request?.abort();const controller=new AbortController();request=controller;if(exactInput.value)URL.revokeObjectURL(exactInput.value);exactInput.value='';imageError.value='';imageLoading.value=false;if(!props.runId||!props.inputImage)return;imageLoading.value=true
  try{const response=await fetch(`/api/harness/runs/${props.runId}/input-image`,{signal:controller.signal});if(!response.ok)throw new Error('本轮裁片已不可用，当前对照使用工程参考图');const blob=await response.blob();if(controller.signal.aborted)return;let bitmap:ImageBitmap;try{bitmap=await createImageBitmap(blob)}catch{throw new Error('本轮裁片无法解码，当前对照使用工程参考图')}const valid=bitmap.width===props.inputImage.width&&bitmap.height===props.inputImage.height;bitmap.close();if(!valid)throw new Error('本轮裁片尺寸不符，当前对照使用工程参考图');if(controller.signal.aborted)return;exactInput.value=URL.createObjectURL(blob)}catch(e){if(!controller.signal.aborted)imageError.value=(e as Error).message}finally{if(request===controller)imageLoading.value=false}
}
watch(()=>[props.runId,props.inputImage],()=>{void loadInput()},{immediate:true})
onBeforeUnmount(()=>{request?.abort();if(exactInput.value)URL.revokeObjectURL(exactInput.value)})
const comparison=computed(()=>{try{
  const task=props.task,group=reconstructionCandidateGroup(props.before,props.after,task)
  if(!group?.reconstruction)return null
  const source=props.before.references.find(r=>r.sha256===group.reconstruction!.referenceSha256);if(!source)return null
  const candidate=captureComponent(props.after,group.id,'Comparison').figure,record=rootContainer(candidate).reconstruction!,roi=task.kind==='repair'?repairContext(props.before,task).worker:sourceRoi(record)
  return{source,candidate,viewport:reconstructionViewport(record,roi),region:{x:roi.x/source.pixelWidth,y:roi.y/source.pixelHeight,width:roi.w/source.pixelWidth,height:roi.h/source.pixelHeight}}
}catch{return null}})
const displaySource=computed(()=>comparison.value&&exactInput.value&&props.inputImage?{...comparison.value.source,dataUrl:exactInput.value,pixelWidth:props.inputImage.width,pixelHeight:props.inputImage.height}:comparison.value?.source)
const attachments=computed(()=>comparison.value?.candidate.nodes.flatMap(node=>(['start','end'] as const).flatMap(end=>{const binding=node.path?.[end];if(binding?.anchorIndex===undefined)return[];const target=comparison.value!.candidate.nodes.find(n=>n.id===binding.nodeId);return[{key:`${node.id}:${end}`,label:node.label||node.name||'引线',end: end==='start'?'起点':'终点',target:target?.name||target?.label||'目标图元',index:binding.anchorIndex,note:binding.note}]}))??[])
</script>
<template>
  <Box v-if="comparison&&displaySource" class="reconstruction-comparison"><Heading>原图与重建叠加核对</Heading><Text v-if="exactInput" class="muted-caption">本轮实际输入裁片 · {{ inputImage?.width }} × {{ inputImage?.height }}</Text><Text v-else-if="imageLoading" class="muted-caption">正在读取本轮输入裁片…</Text><Box v-else-if="imageError"><ErrorMessage class="muted-caption" :message="imageError" /><Button size="xs" variant="quiet" @click="loadInput">重新读取输入裁片</Button></Box><Box class="reconstruction-compare-area" :style="{aspectRatio:`${comparison.viewport.width}/${comparison.viewport.height}`}"><ReferencePreview :image="displaySource" :viewport="exactInput?{x:0,y:0,width:1,height:1}:comparison.region" label="重建原图选区" /><Box class="reconstruction-native-overlay" :style="{opacity}"><FigureRenderer :figure="comparison.candidate" :viewport="comparison.viewport" :show-document-title="false" /></Box></Box><Field><Box class="field-heading"><Text>原图 ← 重建层透明度 → 结果</Text><Text>{{ Math.round(opacity*100) }}%</Text></Box><TextField v-model.number="opacity" type="range" min="0" max="1" step="0.05" aria-label="重建对照透明度" /></Field><Text class="muted-caption">切换原图与结果，核对文字、边界和遗漏对象。应用后可在属性栏选择分区修复。</Text><Box v-if="attachments.length" class="reconstruction-reuse-summary"><Heading>引线几何绑定</Heading><Text v-for="item in attachments" :key="item.key">{{ item.label }} · {{ item.end }} → {{ item.target }} · 锚点 {{ item.index+1 }}。{{ item.note }}</Text><Text class="muted-caption">端点随原生图元移动，仍需核对图示与科学含义。</Text></Box><ReconstructionReuseSummary v-for="group in comparison.candidate.containers.filter(c=>c.reconstructionReuse)" :key="group.id" :record="group.reconstructionReuse!" /></Box>
</template>
