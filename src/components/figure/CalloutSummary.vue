<script setup lang="ts">
import {Box,Text} from '../ui'
import type {CalloutReport} from '../../core/calloutContract'
defineProps<{reports:CalloutReport[]}>()
const sides={right:'右侧',left:'左侧',top:'上方',bottom:'下方'}
</script>
<template>
  <Box class="shared-yaxis-summary" aria-label="引线注释实际报告">
    <Box v-for="report in reports" :key="report.labelId" class="shared-yaxis-group"><Text>{{ report.text }}</Text><Text class="muted-caption">{{ sides[report.side] }} · {{ report.lines }} 行 · {{ report.fontFamily }} {{ report.fontSize }} · {{ report.points.length-1 }} 段引线</Text><Text class="muted-caption">关联 {{ report.targetId }}<Text v-if="report.instanceId"> · 素材实例 {{ report.instanceId }} / {{ report.nodeId }}</Text></Text><Text class="muted-caption">{{ report.reason }}</Text></Box>
    <Text class="muted-caption">原对象保持，文字与引线可独立编辑。两端跟随移动，后续仍需检查路径；避让基于估算几何。</Text>
  </Box>
</template>
