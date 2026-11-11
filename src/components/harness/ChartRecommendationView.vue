<script setup lang="ts">
import { Box, Disclosure, DisclosureTrigger, Text } from '@fastrd/ui-vue'
import type { ChartReadyRecommendation, CompiledChartView } from '../../core/chartRecommendationContract'
import ChartAxesSummary from '../charts/ChartAxesSummary.vue'
import BoxplotSummary from '../charts/BoxplotSummary.vue'
import { paletteById } from '../../data/materials'
defineProps<{recommendation:ChartReadyRecommendation;details?:Partial<CompiledChartView>}>()
</script>
<template>
  <Box class="chart-view-report">
    <Text>{{ recommendation.reason }}</Text>
    <template v-if="details?.mapping">
      <Text>{{ details.boxplot?'样本标识':details.scale?'行标签':'横轴' }}：{{ details.mapping.x }}</Text>
      <Text v-if="details.mapping.labels">数据行标注：{{ details.mapping.labels }}</Text>
      <Text v-for="series in details.mapping.series" :key="series.name">{{ details.boxplot?'样本组':details.scale?'数值列':'系列' }}：{{ series.name }}<Text v-if="series.error"> · 误差：{{ series.error }}</Text></Text>
      <Text v-if="details.mapping.unusedColumns.length">本图未绘制列：{{ details.mapping.unusedColumns.join('、') }}</Text>
      <Text>{{ details.scale?'保留全部输入行列，× 表示缺失；不归一化或聚类。':'保留全部输入行；空 Y 值不绘制，未补零。' }}</Text>
      <Text>{{ details.errorLabel?`本图误差含义：${details.errorLabel}`:'本图未映射误差列。' }}</Text>
    </template>
    <Text>配色：{{ details?.scale?.title??paletteById.get(recommendation.paletteId)?.title??recommendation.paletteId }}</Text>
    <Text v-if="details?.typography">图表字体 {{ details.typography.fontFamily }} · 基准字号 {{ details.typography.fontSize }}；实例缩放会影响实际字号。</Text>
    <Text v-if="details?.scale">色标：{{ details.scale.valueLabel }} · {{ details.scale.min }} ～ {{ details.scale.max }}<Text v-if="details.scale.center!==undefined"> · 中心 {{ details.scale.center }}</Text></Text>
    <ChartAxesSummary v-if="details?.axes" :axes="details.axes" />
    <BoxplotSummary v-if="details?.boxplot" :report="details.boxplot" />
    <Text v-for="item in recommendation.cautions" :key="item" class="placement-message">待核对：{{ item }}</Text>
    <Disclosure v-if="recommendation.alternatives.length"><DisclosureTrigger size="xs">备选与取舍</DisclosureTrigger><Text v-for="item in recommendation.alternatives" :key="item.kind">{{ item.kind }}：{{ item.reason }}</Text></Disclosure>
  </Box>
</template>
