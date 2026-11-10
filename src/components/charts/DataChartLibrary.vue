<script setup lang="ts">
import { computed } from 'vue'
import { Box,Button,Text } from '@fastrd/ui-vue'
import { useEditor } from '../../composables/useEditor'
import { chartExample } from '../../core/dataChartTable'
import { buildDataChart } from '../../core/dataChart'
import AssetPreview from '../library/AssetPreview.vue'
const editor=useEditor(),labels={line:'多系列折线图',bar:'分组柱状图',scatter:'数值散点图',heatmap:'矩阵热图',boxplot:'原始样本箱线图'},charts=computed(()=>(['line','bar','scatter','heatmap','boxplot'] as const).map(kind=>({kind,asset:buildDataChart(chartExample(kind))})))
</script>
<template>
  <Box class="data-chart-library"><Text class="panel-description">从实验数据生成坐标轴、图例、系列与误差棒，展开后每个图元都能编辑。</Text><Button size="sm" variant="primary" @click="editor.chartDataImportOpen.value=true">导入数据，让助手选图</Button><Text class="muted-caption">先导入原始表，结合研究问题与可选参考图分析形式和映射，再审阅候选。</Text><Box class="asset-grid"><Button v-for="chart in charts" :key="chart.kind" variant="quiet" class="asset-card" draggable="true" @dragstart="editor.libraryDrag.start($event,{kind:'asset',asset:chart.asset})" :aria-label="`配置${chart.kind==='line'?'数据折线图':labels[chart.kind]}`" @click="editor.chartDialog.value={kind:chart.kind}"><AssetPreview :asset="chart.asset" /><Box><Text class="asset-name">{{ labels[chart.kind] }}</Text><Text class="component-note">{{ chart.kind==='line'?'数值 / 分类横轴 · 缺失值断线':chart.kind==='scatter'?'数值变量关系 · 不连线':chart.kind==='heatmap'?'原始矩阵 · 数值色标':chart.kind==='boxplot'?'原始样本 · 分布与离群点':'零基线 · 正负值' }} · 示例数据</Text></Box></Button></Box><Text class="muted-caption">拖拽以示例数据插入，点击可配置数据。支持 CSV / TSV 粘贴；点线 / 柱状可用同名 _err 列。误差由输入提供；箱线描述统计仅从声明的原始样本计算，不做显著性检验。</Text></Box>
</template>
