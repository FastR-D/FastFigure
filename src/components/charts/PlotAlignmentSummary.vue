<script setup lang="ts">
import {Box,Text} from '@fastrd/ui-vue'
import type {PlotAlignmentReport} from '../../core/chartPlotContract'
defineProps<{reports:PlotAlignmentReport[]}>()
const bounds=(area:PlotAlignmentReport['charts'][number]['after'])=>`${(area.right-area.left).toFixed(1)} × ${(area.bottom-area.top).toFixed(1)}`
</script>
<template>
  <Box class="shared-yaxis-summary" aria-label="绘图区对齐实际报告">
    <Box v-for="(report,index) in reports" :key="index" class="shared-yaxis-group">
      <Text>{{ report.rows }} 行 × {{ report.columns }} 列 · 绘图区对齐{{ report.changed?'':'已一致' }}</Text>
      <Text v-if="report.reason" class="muted-caption">对齐理由：{{ report.reason }}</Text>
      <Text v-for="chart in report.charts" :key="chart.containerId" class="muted-caption">{{ chart.row }} 行 {{ chart.column }} 列 · {{ chart.title }}：{{ bounds(chart.before) }} → {{ bounds(chart.after) }}；{{ chart.changed?`重排 ${chart.generated} 个图元，保留 ${chart.preserved} 个额外对象 / ${chart.formatted} 处手工格式或改字`:'已一致' }}</Text>
    </Box>
  </Box>
</template>
