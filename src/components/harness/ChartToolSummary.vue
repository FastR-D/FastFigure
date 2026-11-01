<script setup lang="ts">
import { Box,Text } from '../ui'
import ChartPreparationPreview from '../charts/ChartPreparationPreview.vue'
import ChartAxesSummary from '../charts/ChartAxesSummary.vue'
import BoxplotSummary from '../charts/BoxplotSummary.vue'
import { paletteById } from '../../data/materials'
import { heatmapPaletteById } from '../../data/heatmapPalettes'
import type { ChartToolUse } from '../../core/dataChartSchema'
defineProps<{chart:ChartToolUse}>()
const kind={line:'折线图',bar:'分组柱状图',scatter:'散点图',heatmap:'热图',boxplot:'原始样本箱线图'}
const bound=(value:number|null|undefined)=>value===undefined?'保持原设置':value===null?'自动':String(value)
</script>
<template>
  <Box class="harness-chart-tool" aria-label="图表重绘记录"><Text v-if="chart.typography" class="muted-caption">图表字体 {{ chart.typography.fontFamily }} · 基准字号 {{ chart.typography.fontSize }}；实例缩放会影响实际字号。</Text><Text>{{ kind[chart.sourceKind] }} → {{ kind[chart.kind] }} · {{ chart.kind==='heatmap'?`${chart.conditionCount} 行 × ${chart.seriesCount} 列`:chart.kind==='boxplot'?`${chart.seriesCount} 组 · ${chart.conditionCount} 行样本`:`${chart.seriesCount} 个系列 · ${chart.conditionCount} 个条件` }}</Text><Text>{{ chart.kind==='boxplot'?'沿用原始样本与固定统计规则':chart.kind==='heatmap'?'沿用原始矩阵与数据声明':'沿用源数值与误差' }} · {{ chart.origin==='example'?'示例数据':'用户填写的数据' }}</Text><Text v-if="chart.options.yMin!==undefined||chart.options.yMax!==undefined">纵轴 {{ bound(chart.options.yMin) }} ～ {{ bound(chart.options.yMax) }}</Text><Text v-if="chart.kind==='heatmap'&&(chart.options.colorMin!==undefined||chart.options.colorMax!==undefined)">色标 {{ bound(chart.options.colorMin) }} ～ {{ bound(chart.options.colorMax) }}</Text><Text v-if="chart.options.colorCenter!==undefined">色标中心：{{ bound(chart.options.colorCenter) }}</Text><Text v-if="chart.options.paletteId">配色：{{ heatmapPaletteById.get(chart.options.paletteId)?.title??paletteById.get(chart.options.paletteId)?.title??chart.options.paletteId }}</Text><ChartPreparationPreview v-if="chart.preparation" :preparation="chart.preparation" read-only /><ChartAxesSummary v-if="chart.axes" :axes="chart.axes" /><BoxplotSummary v-if="chart.boxplot" :report="chart.boxplot" /><Text>按数据重绘 {{ chart.generated }} 个图元，保留 {{ chart.preserved }} 个额外对象；请核对候选外观与轴标题。</Text></Box>
</template>
