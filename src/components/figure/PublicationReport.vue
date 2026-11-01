<script setup lang="ts">
import {Box,Button,Disclosure,DisclosureTrigger,Text} from '../ui'
import {textCheckFieldLabel} from '../../core/textCheckContract'
import type {PublicationReport,PublicationSettings} from '../../core/publicationContract'
withDefaults(defineProps<{report:PublicationReport;settings:PublicationSettings;expanded?:boolean}>(),{expanded:false})
const emit=defineEmits<{locate:[objectId:string]}>()
const rounded=(value:number|null)=>value===null?'—':String(Number(value.toFixed(2)))
</script>
<template>
  <Disclosure :open="expanded" class="publication-report" aria-label="论文尺寸检查">
    <DisclosureTrigger size="xs">尺寸检查 · {{ report.total }} 项</DisclosureTrigger>
    <Text class="muted-caption">整图 {{ rounded(report.widthMm) }} × {{ rounded(report.heightMm) }} mm；已检查 {{ report.textFields }} 项可见文字、{{ report.strokeObjects }} 个描边对象。</Text>
    <Text>最小等效字号 {{ rounded(report.minFontPt) }} pt · 描边下界 {{ rounded(report.minStrokePt) }} pt</Text>
    <Text class="muted-caption">参考阈值 {{ settings.minFontPt }} / {{ settings.minStrokePt }} pt；{{ report.smallText }} 项文字偏小，{{ report.thinStroke }} 个对象可能有细线。</Text>
    <Text class="muted-caption">形变范围取 SVG 变换的最小 / 最大缩放；细线按保守下界提示。未检查真实字形、遮挡、填充细条、箭头标记和科学内容。</Text>
    <Text v-if="!report.total" class="muted-caption">本轮尺寸规则未发现问题，仍需查看最终排版。</Text>
    <Box v-for="issue in report.issues" :key="`${issue.kind}:${issue.objectId}:${issue.field}`" class="publication-issue">
      <Button size="xs" variant="quiet" :aria-label="`定位尺寸问题 ${issue.objectId} ${issue.field}`" @click="emit('locate',issue.objectId)">{{ issue.label || issue.objectId }} · {{ issue.reason==='text'?textCheckFieldLabel(issue.field):'描边' }}</Button>
      <Text class="error-text">{{ issue.reason==='text'?'等效字号偏小':'可能存在细线' }} · {{ rounded(issue.minPt) }}<Text v-if="issue.transformed">–{{ rounded(issue.maxPt) }}</Text> pt</Text>
      <Text v-if="issue.sample" class="publication-sample">{{ issue.sample }}</Text>
    </Box>
    <Text v-if="report.omitted" class="muted-caption">另有 {{ report.omitted }} 项未列出。</Text>
  </Disclosure>
</template>
