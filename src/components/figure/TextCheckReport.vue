<script setup lang="ts">
import {Box,Button,Disclosure,DisclosureTrigger,Text} from '@fastrd/ui-vue'
import {textCheckFieldLabel,textCheckReasonLabels,type TextCheckReport,type TextCheckReason} from '../../core/textCheckContract'
withDefaults(defineProps<{report:TextCheckReport;expanded?:boolean}>(),{expanded:false})
const emit=defineEmits<{locate:[nodeId:string]}>()
const rounded=(value:number)=>Number(value.toFixed(2))
const reasonsText=(reasons:TextCheckReason[])=>reasons.map(reason=>textCheckReasonLabels[reason]).join(' · ')
</script>
<template>
  <Disclosure :open="expanded" class="text-check-report" aria-label="原生文字检查">
    <DisclosureTrigger size="xs">文字检查 · {{ report.total }} 项</DisclosureTrigger>
    <Text class="muted-caption">已检查 {{ report.checkedNodes }} 个节点、{{ report.checkedFields }} 项文字。文字保持完整显示；宽高是排版估算。</Text>
    <Text v-if="report.positionedNodes||report.invisibleNodes||report.hiddenStructureLabels" class="muted-caption">未检查：{{ report.positionedNodes }} 个定位字形节点、{{ report.invisibleNodes }} 个不可见节点、{{ report.hiddenStructureLabels }} 项未绘制的结构标签。</Text>
    <Text class="muted-caption">不检查实际字形、遮挡或科学内容。</Text>
    <Text v-if="!report.total" class="muted-caption">本轮规则未发现问题。</Text>
    <Box v-for="issue in report.issues" :key="`${issue.nodeId}:${issue.field}`" class="text-check-issue">
      <Button size="xs" variant="quiet" :aria-label="`定位文字 ${issue.nodeId} ${textCheckFieldLabel(issue.field)}`" @click="emit('locate',issue.nodeId)">{{ issue.nodeLabel||issue.nodeId }} · {{ textCheckFieldLabel(issue.field) }}</Button>
      <Text class="error-text">{{ reasonsText(issue.reasons) }}</Text>
      <Text class="text-check-source">原文：{{ issue.source }}</Text><Text class="text-check-source">当前排版：{{ issue.shown }}</Text>
      <Text class="muted-caption">所需 {{ issue.requiredLines }} 行 / 上限 {{ issue.lineLimit }} 行 · 字号 {{ rounded(issue.fontSize) }} · 可用 {{ rounded(issue.availableWidth) }} × {{ rounded(issue.availableHeight) }}</Text>
      <Text class="muted-caption">可调整框体、边距或字号，再核对结果。</Text>
    </Box>
    <Text v-if="report.omitted" class="muted-caption">另有 {{ report.omitted }} 项未展开，请先处理已列出的文字。</Text>
  </Disclosure>
</template>
