<script setup lang="ts">
import {Box,Text} from '@fastrd/ui-vue'
import type {CalloutReflowReport} from '../../core/calloutReflowContract'
import type {PathBinding} from '../../core/paths'
defineProps<{reports:CalloutReflowReport[]}>()
function anchorName(binding:PathBinding){
  if(binding.anchorIndex!==undefined)return `几何锚点 ${binding.anchorIndex+1}`
  const near=(value:number|undefined,target:number)=>value!==undefined&&Math.abs(value-target)<1e-6
  if(near(binding.x,0)&&near(binding.y,.5))return '左侧'
  if(near(binding.x,1)&&near(binding.y,.5))return '右侧'
  if(near(binding.x,.5)&&near(binding.y,0))return '上侧'
  if(near(binding.x,.5)&&near(binding.y,1))return '下侧'
  return '自定位置'
}
function lengthChange(report:CalloutReflowReport){
  if(report.beforeLength<1e-7)return '引线已重排'
  const percent=Math.round((report.afterLength/report.beforeLength-1)*1000)/10
  return percent===0?'引线长度基本不变':`引线估算${percent<0?'缩短':'增加'} ${Math.abs(percent)}%`
}
function change(report:CalloutReflowReport,kind:'target'|'label'){
  const id=kind==='target'?report.targetId:report.labelId,end=report.beforeBindings.start.nodeId===id?'start':'end'
  return `${anchorName(report.beforeBindings[end])} → ${anchorName(report.afterBindings[end])}`
}
</script>
<template>
  <Box class="shared-yaxis-summary" aria-label="已有注释调整实际报告">
    <Box v-for="report in reports" :key="report.leaderId" class="shared-yaxis-group">
      <Text>{{ report.text }}</Text>
      <Text class="muted-caption">{{ report.mode==='route'?'仅重排引线':'文字与引线' }} · {{ !report.changed?'无需调整':report.labelMoved?'文字位置已调整':'文字位置保持' }}</Text>
      <Text class="muted-caption">{{ lengthChange(report) }} · {{ report.afterPoints.length-1 }} 段</Text>
      <Text v-if="report.bindingsChanged" class="muted-caption">目标：{{ change(report,'target') }} · 注释：{{ change(report,'label') }}</Text>
      <Text v-else class="muted-caption">附着点保持</Text>
      <Text class="muted-caption">{{ report.fontFamily }} {{ report.fontSize }} · 原文、尺寸、样式与关联对象保持</Text>
      <Text class="muted-caption">{{ report.reason }}</Text>
    </Box>
    <Text class="muted-caption">长度与避让基于画布几何估算；应用后仍可手工编辑。</Text>
  </Box>
</template>
