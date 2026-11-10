<script setup lang="ts">
import {Box,Button,Field,Select,Text,TextField} from '@fastrd/ui-vue'
import type {chartPlotTargets} from '../../core/chartPlotAlignment'
defineProps<{targets:ReturnType<typeof chartPlotTargets>;selectedIds:string[];columns:number}>()
const emit=defineEmits<{toggle:[id:string,checked:boolean];move:[id:string,delta:number];columns:[value:number]}>()
</script>
<template>
  <Box class="shared-yaxis-controls" role="group" aria-label="绘图区图表选择">
    <Text>按从左到右、从上到下的顺序选择图表</Text>
    <Text class="muted-caption">同行对齐绘图区上下沿，同列对齐左右沿。热图保持正方形单元格，按矩阵行列比例共同收缩；比例不相容时需调整顺序或列数。保留外框和字号，请先排成对应网格。</Text>
    <Field><Text>现有网格列数</Text><Select :value="String(columns)" :options="[1,2,3,4].map(n=>({value:String(n),label:n===1?'1 列 · 上下比较':`${n} 列`}))" aria-label="绘图区网格列数" @change="emit('columns',Number($event))" /></Field>
    <Box v-for="target in targets" :key="target.containerId" class="shared-yaxis-target">
      <Field class="checkbox-field"><TextField type="checkbox" :checked="selectedIds.includes(target.containerId)" :disabled="!!target.error" :aria-label="`对齐绘图区 ${target.title}`" @change="emit('toggle',target.containerId,($event.target as HTMLInputElement).checked)" /><Text>{{ target.title }}</Text></Field>
      <Text v-if="target.error" class="placement-message">{{ target.error }}</Text>
    </Box>
    <Box v-for="(id,index) in selectedIds" :key="id" class="material-actions">
      <Text>{{ Math.floor(index/columns)+1 }} 行 {{ index%columns+1 }} 列 · {{ targets.find(t=>t.containerId===id)?.title }}</Text>
      <Button size="xs" :disabled="index===0" :aria-label="`前移绘图区 ${targets.find(t=>t.containerId===id)?.title}`" @click="emit('move',id,-1)">前移</Button><Button size="xs" :disabled="index===selectedIds.length-1" :aria-label="`后移绘图区 ${targets.find(t=>t.containerId===id)?.title}`" @click="emit('move',id,1)">后移</Button>
    </Box>
    <Text class="muted-caption">从源数据重新计算位置，不改数值、范围、统计规则或颜色。手工移动的数据标记会阻止操作；另加注释保留位置，应用前请核对预览。</Text>
  </Box>
</template>
