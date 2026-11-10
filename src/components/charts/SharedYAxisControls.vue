<script setup lang="ts">
import {Box,Button,Field,Text,TextField} from '@fastrd/ui-vue'
import type {chartYAxisTargets} from '../../core/sharedYAxis'
import {formatChartValue} from '../../core/chartText'
defineProps<{targets:ReturnType<typeof chartYAxisTargets>;selectedIds:string[]}>()
const emit=defineEmits<{toggle:[id:string,checked:boolean];locate:[id:string]}>()
</script>
<template>
  <Box class="shared-yaxis-controls" role="group" aria-label="共享纵轴图表选择">
    <Text>选择 2–8 张同单位图表</Text>
    <Text class="muted-caption">使用当前有效范围的并集，包含误差、离群值和原有固定边界。标题 / 单位和刻度类型须相同；请核对它们表示同一物理量。</Text>
    <Box v-for="target in targets" :key="target.containerId" class="shared-yaxis-target">
      <Field class="checkbox-field"><TextField type="checkbox" :checked="selectedIds.includes(target.containerId)" :disabled="!!target.error" :aria-label="`统一纵轴 ${target.title}`" @change="emit('toggle',target.containerId,($event.target as HTMLInputElement).checked)" /><Text>{{ target.title }}</Text></Field>
      <Text class="muted-caption">{{ target.yLabel||'未填写纵轴标题' }} · {{ target.scale }}<Text v-if="target.range"> · {{ formatChartValue(target.range.min) }} ～ {{ formatChartValue(target.range.max) }}</Text></Text>
      <Text v-if="target.error" class="placement-message">{{ target.error }}</Text>
      <Button size="xs" variant="quiet" :aria-label="`定位纵轴图表 ${target.title}`" @click="emit('locate',target.containerId)">在画布定位</Button>
    </Box>
    <Text v-if="!targets.length" class="muted-caption">当前范围没有保留数据配置的图表，可选择更外层的共同容器。</Text>
    <Text class="muted-caption">Y 刻度按源配置重绘；保留手工样式、其他改字与另加对象。各图仍保留独立刻度和排版，后续单图编辑按该图设置处理。</Text>
  </Box>
</template>
