<script setup lang="ts">
import SharedColorbarSummary from '../charts/SharedColorbarSummary.vue'
import PlotAlignmentSummary from '../charts/PlotAlignmentSummary.vue'
import { computed } from 'vue'
import { Box, Disclosure, DisclosureTrigger, Text } from '../ui'
import type { ChartRecommendationReport } from '../../core/chartRecommendationContract'
import ChartRecommendationView from './ChartRecommendationView.vue'
import SharedLegendSummary from '../charts/SharedLegendSummary.vue'
import SharedYAxisSummary from '../charts/SharedYAxisSummary.vue'
const props=defineProps<{report:ChartRecommendationReport}>()
const labels={line:'折线图',bar:'分组柱状图',scatter:'散点图',heatmap:'热图',boxplot:'原始样本箱线图'}
const heading=computed(()=>{
  const recommendation=props.report.recommendation
  if(recommendation.status==='ready')return `推荐：${labels[recommendation.kind]}`
  if(recommendation.status==='multi-view')return `推荐：${recommendation.views.length} 个互补视图`
  if(recommendation.status==='prepare')return '建议整理：长表转宽表'
  return `建议：${recommendation.suggestedKind}`
})
</script>
<template>
  <Box class="chart-recommendation" aria-label="数据可视化推荐">
    <Text class="chart-recommendation-title">{{ heading }}</Text>
    <Text>{{ report.dataset.name }} · {{ report.dataset.rows }} 行 × {{ report.dataset.columns }} 列 · {{ report.dataset.origin==='example'?'示例数据':'用户填写' }}</Text>
    <Text v-if="report.dataset.visualizationGoal" class="chart-selection-goal">导入时的表达目标：{{ report.dataset.visualizationGoal }}</Text>
    <Text v-if="report.declaredErrorLabel">附件误差声明：{{ report.declaredErrorLabel }}；只用于映射了误差列的视图。</Text>
    <ChartRecommendationView v-if="report.recommendation.status==='ready'" :recommendation="report.recommendation" :details="report" />
    <template v-else>
      <Text>{{ report.recommendation.reason }}</Text>
      <template v-if="report.recommendation.status==='multi-view'">
        <Text>{{ report.recommendation.title }} · 每个视图使用同一份冻结附件，坐标和图例分别保留。</Text>
        <Text v-if="report.panelLayout">{{ report.panelLayout.rows }} 行 × {{ report.panelLayout.columns }} 列 · 统一比例 {{ (report.panelLayout.factor*100).toFixed(1) }}%</Text>
        <SharedColorbarSummary v-if="report.panelLayout?.sharedColorbar" :reports="[report.panelLayout.sharedColorbar]" />
        <PlotAlignmentSummary v-if="report.panelLayout?.plotAlignment" :reports="[report.panelLayout.plotAlignment]" />
        <SharedLegendSummary v-if="report.panelLayout?.sharedLegend" :reports="[report.panelLayout.sharedLegend]" /><SharedYAxisSummary v-if="report.panelLayout?.sharedY" :reports="[report.panelLayout.sharedY]" />
        <Text v-if="report.panelLayout?.minimumLabelSize!==null && report.panelLayout?.minimumLabelSize!==undefined && report.panelLayout.minimumLabelSize<8" class="placement-message">缩小后有文字小于 8 个画布单位，请核对出版尺寸；可要求减少视图。</Text>
        <Disclosure v-for="(view,index) in report.recommendation.views" :key="index" :open="index===0" class="chart-multi-view">
          <DisclosureTrigger size="xs">视图 ({{ String.fromCharCode(97+index) }}) {{ view.caption || view.chart.title }} · {{ labels[view.chart.kind] }}</DisclosureTrigger>
          <ChartRecommendationView :recommendation="view.chart" :details="report.views?.[index]" />
        </Disclosure>
      </template>
      <template v-if="report.recommendation.status==='needs-input'"><Text v-for="question in report.recommendation.questions" :key="question" class="placement-message">请确认：{{ question }}</Text><Text>本轮只提供选型分析，补充要求或整理数据后再发送。</Text></template>
      <Text v-for="item in report.recommendation.cautions" :key="item" class="placement-message">待核对：{{ item }}</Text>
      <Disclosure v-if="report.recommendation.alternatives.length"><DisclosureTrigger size="xs">备选与取舍</DisclosureTrigger><Text v-for="item in report.recommendation.alternatives" :key="item.kind">{{ item.kind }}：{{ item.reason }}</Text></Disclosure>
    </template>
    <Text v-if="report.compiled">候选由原数据编译，应用会替换当前图件；请核对单位、映射与视觉选择，可撤销。</Text>
  </Box>
</template>
