<script setup lang="ts">
import {Box,Button,Field,Text,TextField} from '@fastrd/ui-vue'
import type {chartColorbarTargets,sharedColorbarStates} from '../../core/sharedColorbar'
import {formatChartValue} from '../../core/chartText'
defineProps<{targets:ReturnType<typeof chartColorbarTargets>;selectedIds:string[];groups:ReturnType<typeof sharedColorbarStates>}>()
const emit=defineEmits<{toggle:[id:string,checked:boolean];detach:[id:string]}>()
</script>
<template>
  <Box class="shared-yaxis-controls" role="group" aria-label="共享色标图表选择">
    <Text>选择 2–8 张表示同一物理量的热图</Text><Text class="muted-caption">色阶、标题 / 单位和发散中心须一致。程序取范围并集重绘颜色，让相同颜色表示相同数值；原始值、零和缺失保持。</Text>
    <Box v-for="target in targets" :key="target.containerId" class="shared-yaxis-target">
      <Field class="checkbox-field"><TextField type="checkbox" :checked="selectedIds.includes(target.containerId)" :disabled="!!target.error" :aria-label="`共享色标 ${target.title}`" @change="emit('toggle',target.containerId,($event.target as HTMLInputElement).checked)" /><Text>{{ target.title }}</Text></Field>
      <Text class="muted-caption">{{ target.valueLabel||'未填写色标单位' }} · {{ target.paletteId }}<Text v-if="target.min!==undefined&&target.max!==undefined"> · {{ formatChartValue(target.min) }} ～ {{ formatChartValue(target.max) }}</Text><Text v-if="target.center!==undefined"> · 中心 {{ formatChartValue(target.center) }}</Text></Text><Text v-if="target.error" class="placement-message">{{ target.error }}</Text>
    </Box>
    <Text v-if="!targets.length" class="muted-caption">当前范围没有原生热图，可选择更外层容器。</Text>
    <Text class="muted-caption">在顶部或底部空白区放置横向色标；面板编排可预留底部 100 空间。手工改色 / 移动的数据格会阻止操作。后续失配时恢复各图色标。</Text>
    <Box v-for="group in groups" :key="group.containerId" class="shared-yaxis-target"><Text>{{ group.title }} · {{ group.active?'生效中':'已停用，已恢复各图色标' }}</Text><Text v-if="group.error" class="placement-message">{{ group.error }}</Text><Button size="xs" :aria-label="`解除共享色标 ${group.containerId}`" @click="emit('detach',group.containerId)">解除共享，保留可编辑副本</Button><Text class="muted-caption">解除恢复各图色标，已统一的范围保留。撤销创建可恢复之前的范围。</Text></Box>
  </Box>
</template>
