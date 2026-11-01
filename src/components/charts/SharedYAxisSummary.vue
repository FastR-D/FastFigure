<script setup lang="ts">
import {Box,Text} from '../ui'
import type {SharedYAxisReport} from '../../core/sharedYAxisContract'
import {formatChartValue} from '../../core/chartText'
defineProps<{reports:SharedYAxisReport[]}>()
</script>
<template>
  <Box class="shared-yaxis-summary" aria-label="统一纵轴实际报告">
    <Box v-for="(report,index) in reports" :key="index" class="shared-yaxis-group">
      <Text>{{ report.yLabel }} · {{ report.scale==='log10'?'log10':'线性' }} · {{ formatChartValue(report.min) }} ～ {{ formatChartValue(report.max) }}</Text>
      <Text v-if="report.reason" class="muted-caption">助手理由：{{ report.reason }}</Text>
      <Text v-for="chart in report.charts" :key="chart.containerId" class="muted-caption">{{ chart.title }}：{{ formatChartValue(chart.beforeMin) }} ～ {{ formatChartValue(chart.beforeMax) }} → {{ formatChartValue(report.min) }} ～ {{ formatChartValue(report.max) }}；{{ chart.changed?`重绘 ${chart.generated} 个图元，保留 ${chart.preserved} 个额外对象 / ${chart.formatted} 处手工格式或改字`:'范围设置已一致' }}</Text>
    </Box>
  </Box>
</template>
