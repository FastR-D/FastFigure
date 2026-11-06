<script setup lang="ts">
import { computed } from 'vue'
import { Box, Button, Text, Field, TextField } from '../ui'
import type { Harness } from '../../composables/useHarness'
import {catalogueAsset} from '../../core/catalogue'
const props=defineProps<{harness:Harness}>()
const task=computed(()=>props.harness.reconstructionTask.value)
function setReuse(harness:Harness,event:Event){harness.reuseReconstructionComponents.value=(event.target as HTMLInputElement).checked}
</script>
<template>
  <Box v-if="task" class="harness-reconstruction-task" role="status">
    <Box><Text>{{ harness.refinementFrom.value?'继续修复候选':task.kind==='reconstruct'?'参考图结构重建':'原图分区修复' }}</Text><Button size="xs" variant="quiet" :disabled="harness.locked.value" @click="harness.clearReconstruction">{{ harness.refinementFrom.value?'取消候选修复':'返回自由绘图' }}</Button></Box>
    <Text v-if="harness.refinementFrom.value" class="muted-caption">本轮以所选候选为起点；原画布尚未应用，旧版本仍可在对话中查看。</Text>
    <Text v-if="harness.auditRepairSelection.value" class="muted-caption">本次合并 {{ harness.auditRepairSelection.value.findingIds.length }} 个视觉问题，发送时附带固定报告中的完整证据。</Text>
    <Text v-if="task.kind==='reconstruct'" class="muted-caption">{{ task.destination==='new'?'应用后替换画布，可撤销':'插入当前容器' }} · 原图区域 {{ Math.round(task.region.x*100) }}%, {{ Math.round(task.region.y*100) }}% · {{ Math.round(task.region.width*100) }}% × {{ Math.round(task.region.height*100) }}%</Text>
    <Text v-else class="muted-caption">仅修改分区 {{ task.regionId }} 的可编辑对象；其他对象作为只读上下文。</Text>
    <template v-if="task.kind==='reconstruct'">
      <Button size="xs" :disabled="harness.locked.value||harness.loading.value||!harness.draft.value.trim()||harness.status.value?.state!=='ready'||!harness.status.value?.images" @click="harness.findReconstructionComponents">看图找重绘素材</Button>
      <Text class="muted-caption">先看原图，再对照完整候选的实际图谱与目录筛选；采用后绘图。通常两次模型调用。</Text>
      <Box v-if="harness.adoptedComponentSearch.value" class="assistant-adopted-plan"><Text>已采用看图检索的冻结素材与裁片</Text><Text v-for="entry in harness.adoptedComponentSearch.value.catalogue" :key="entry.kind==='asset'?entry.asset.id:entry.id">{{ catalogueAsset(entry).name }}</Text><Text v-if="harness.componentSearchStale.value" class="error-text" role="alert">画布或参考图已变化，请重新找素材。</Text><Button size="xs" :disabled="harness.locked.value" @click="harness.clearComponentSearch">清除采用，改为手动选择</Button></Box>
      <Field v-else class="checkbox-field"><TextField :checked="harness.reuseReconstructionComponents.value" @change="setReuse(harness,$event)" type="checkbox" :disabled="harness.locked.value" aria-label="库素材辅助重建" /><Text>库素材辅助重建</Text></Field>
      <Text v-if="harness.reuseReconstructionComponents.value" class="muted-caption">将附带实际组件图谱；允许用匹配的原生结构近似局部；候选列出匹配理由与差异。图内数据须使用原始数据，素材内部对象在分区修复中只读。</Text>
    </template>
    <Text v-if="harness.refinementStale.value" role="alert" class="error-text">准备修复后画布已变化，请取消候选修复并基于当前画布重新生成。</Text>
  </Box>
</template>
