<script setup lang="ts">
import {Box,Button,Field,Text,TextField} from '@fastrd/ui-vue'
import type {chartLegendTargets,sharedLegendStates} from '../../core/sharedLegend'
defineProps<{targets:ReturnType<typeof chartLegendTargets>;selectedIds:string[];groups:ReturnType<typeof sharedLegendStates>}>()
const emit=defineEmits<{toggle:[id:string,checked:boolean];detach:[id:string]}>()
</script>
<template>
  <Box class="shared-yaxis-controls" role="group" aria-label="共享图例图表选择">
    <Text>选择 2–8 张同系列图表</Text><Text class="muted-caption">系列名、颜色、符号和线型须一致。原数据及图元保留，只在共享关系有效时隐藏重复图例。请核对同名系列代表同一方法或条件。</Text>
    <Box v-for="target in targets" :key="target.containerId" class="shared-yaxis-target"><Field class="checkbox-field"><TextField type="checkbox" :checked="selectedIds.includes(target.containerId)" :disabled="!!target.error" :aria-label="`共享图例 ${target.title}`" @change="emit('toggle',target.containerId,($event.target as HTMLInputElement).checked)" /><Text>{{ target.title }}</Text></Field><Text class="muted-caption">{{ target.kind }} · {{ target.series.join(' / ') }}</Text><Text v-if="target.error" class="placement-message">{{ target.error }}</Text></Box>
    <Text v-if="!targets.length" class="muted-caption">当前范围没有原生数据图表。</Text>
    <Text class="muted-caption">在顶部或底部空白区放置；可在面板编排时预留底部空间。生成的共享图例可移动、缩放和改字体。源图表改变导致失配时，自动恢复各图图例。</Text>
    <Box v-for="group in groups" :key="group.containerId" class="shared-yaxis-target"><Text>{{ group.title }} · {{ group.active?'生效中':'已停用，已恢复各图图例' }}</Text><Text v-if="group.error" class="placement-message">{{ group.error }}</Text><Button size="xs" :aria-label="`解除共享图例 ${group.containerId}`" @click="emit('detach',group.containerId)">解除共享，保留可编辑副本</Button><Text class="muted-caption">也可选中共享图例组件后删除，以恢复各图图例。</Text></Box>
  </Box>
</template>
