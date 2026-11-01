<script setup lang="ts">
import { Box,Text } from '../ui'
import type { ChartAxesReport } from '../../core/chartAxisContract'
import { formatChartValue } from '../../core/chartText'
defineProps<{axes:ChartAxesReport}>()
const label={linear:'线性',log10:'log10 对数'}
</script>
<template>
  <Box class="chart-axes-summary" aria-label="实际坐标刻度">
    <Text v-if="axes.x.scale==='category'">横轴刻度：等距分类</Text><Text v-else>横轴刻度：{{ label[axes.x.scale] }} · {{ formatChartValue(axes.x.min) }} ～ {{ formatChartValue(axes.x.max) }}</Text>
    <Text>纵轴刻度：{{ label[axes.y.scale] }} · {{ formatChartValue(axes.y.min) }} ～ {{ formatChartValue(axes.y.max) }}</Text>
    <Text v-if="axes.x.scale==='log10'||axes.y.scale==='log10'" class="muted-caption">对数轴的等距表示相同倍数变化；原始数值、单位与统计口径保留。</Text>
  </Box>
</template>
