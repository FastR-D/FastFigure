<script setup lang="ts">
import { Box,Disclosure,DisclosureTrigger,Select,Text,TextField } from '../ui'
import { useEditor } from '../../composables/useEditor'
import type { Harness } from '../../composables/useHarness'
import { referencePurposeLabels,type ReferencePurpose } from '../../core/referenceInputs'
const props=defineProps<{harness:Harness}>(),editor=useEditor()
const purposes=Object.entries(referencePurposeLabels).map(([value,label])=>({value,label}))
function toggle(event:Event,id:string){props.harness.toggleReference(id,(event.target as HTMLInputElement).checked)}
</script>
<template>
  <Disclosure v-if="editor.figure.value.references.length&&!harness.reconstructionTask.value" class="assistant-reference-inputs"><DisclosureTrigger size="xs">多图与用途（{{ harness.selectedReferences.value.length }}/3）</DisclosureTrigger><Box class="assistant-reference-choices"><Box v-for="(ref,i) in editor.figure.value.references" :key="ref.id" class="assistant-reference-choice" :data-reference-choice="ref.id"><TextField type="checkbox" :checked="harness.selectedReferences.value.some(r=>r.id===ref.id)" :disabled="harness.locked.value" :aria-label="`选择参考图 ${i+1}：${ref.title}`" @change="toggle($event,ref.id)" /><Text class="assistant-reference-name" :title="ref.title">{{ ref.title }}</Text><Select :value="harness.selectedReferences.value.find(r=>r.id===ref.id)?.purpose??'style'" :options="purposes" size="xs" :disabled="harness.locked.value||!harness.selectedReferences.value.some(r=>r.id===ref.id)" :aria-label="`参考用途 ${i+1}：${ref.title}`" @change="harness.setReferencePurpose(ref.id,$event as ReferencePurpose)" /></Box><Text class="muted-caption">按工程参考图顺序发送，支持同时参考三张。样式借鉴配色与字体；构图借鉴层次与布局；结构语义需核对科学内容。{{ editor.assistantDataset.value?'数据选图仅允许样式 / 构图。':'' }}</Text></Box></Disclosure>
</template>
