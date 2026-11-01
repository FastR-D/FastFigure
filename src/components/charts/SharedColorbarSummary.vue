<script setup lang="ts">
import {Box,Text} from '../ui'
import type {SharedColorbarReport} from '../../core/sharedColorbarContract'
import {formatChartValue} from '../../core/chartText'
defineProps<{reports:SharedColorbarReport[]}>()
</script>
<template>
  <Box class="shared-yaxis-summary" aria-label="共享色标实际报告">
    <Box v-for="report in reports" :key="report.containerId" class="shared-yaxis-group">
      <Text>{{ report.operation==='update'?(report.changed?'已准备同步已有色标':'已有色标设置无需变化'):'已准备创建共享色标' }}</Text>
      <Text>{{ report.valueLabel }} · {{ formatChartValue(report.min) }} ～ {{ formatChartValue(report.max) }}<Text v-if="report.center!==undefined"> · 中心 {{ formatChartValue(report.center) }}</Text></Text>
      <Text class="muted-caption">{{ report.paletteId }} · 共享 {{ report.chartIds.length }} 张热图 · 暂隐 {{ report.hiddenLocalNodes }} 个本地色标图元</Text>
      <Text v-if="report.before" class="muted-caption">{{ report.before.paletteId }} · {{ formatChartValue(report.before.min) }} ～ {{ formatChartValue(report.before.max) }} → {{ report.paletteId }} · {{ formatChartValue(report.min) }} ～ {{ formatChartValue(report.max) }}</Text><Text v-if="report.before" class="muted-caption">外框 {{ +report.before.box.width.toFixed(1) }} × {{ +report.before.box.height.toFixed(1) }} → {{ +report.after.box.width.toFixed(1) }} × {{ +report.after.box.height.toFixed(1) }} · 更新 {{ report.updatedNodes }} 个原图元</Text>
      <Text v-if="report.reason" class="muted-caption">共享理由：{{ report.reason }}</Text>
      <Text v-for="chart in report.charts" :key="chart.containerId" class="muted-caption">{{ chart.title }}：{{ formatChartValue(chart.beforeMin) }} ～ {{ formatChartValue(chart.beforeMax) }} → {{ formatChartValue(report.min) }} ～ {{ formatChartValue(report.max) }}；{{ chart.changed?`重绘 ${chart.generated} 个图元，保留 ${chart.preserved} 个额外对象 / ${chart.formatted} 处手工格式或改字`:'范围已一致' }}</Text>
    </Box>
  </Box>
</template>
