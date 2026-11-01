<script setup lang="ts">
import {Disclosure,DisclosureTrigger,Text} from '../ui'
import type {ImageDraftOrigin} from '../../core/imageDraftContract'
import CompositionPlanView from '../harness/CompositionPlanView.vue'
defineProps<{origin:ImageDraftOrigin}>()
</script>
<template>
  <Disclosure v-if="origin.composition"><DisclosureTrigger size="xs">本次草稿的绘图方案</DisclosureTrigger><CompositionPlanView :record="origin.composition" /><Text class="muted-caption">保存的是生成时的方案快照；图片是否遵循方案仍需核对。</Text></Disclosure>
  <Disclosure class="image-draft-origin"><DisclosureTrigger size="xs">生成规格与来源</DisclosureTrigger><Text>AI 视觉设计草稿 · {{ origin.runId }}</Text><Text>{{ origin.content }}</Text><Text v-if="origin.visual">视觉要求：{{ origin.visual }}</Text><Text>风格：{{ origin.style.name }} · {{ origin.style.fontFamily }} · {{ origin.style.paletteId }}</Text><Text>方向要求：{{ origin.aspect==='landscape'?'横向':origin.aspect==='portrait'?'纵向':'方形' }}</Text><Text>{{ origin.width }} × {{ origin.height }} · {{ origin.finishedAt }}</Text><Text>图像模型：{{ origin.imageModel??'平台未报告具体版本' }}{{ origin.model?` · 请求的文本模型 ${origin.model}`:'' }}</Text><Text>图像引擎参考图核对：{{ origin.inputVerification==='verified'?'已核对全部实际输入':origin.inputVerification==='partial'?'仅核对部分输入':'平台未报告实际输入' }}</Text><Text v-for="ref in origin.referenceInputs" :key="ref.index">图 {{ ref.index }} · {{ ref.title }} · {{ origin.observedReferenceIndices.includes(ref.index)?'图像引擎已读取':'未报告直接读取' }}</Text><Text class="reference-fingerprint">输出 SHA-256：{{ origin.sha256 }}</Text><Disclosure><DisclosureTrigger size="xs">查看实际生成提示</DisclosureTrigger><Text class="image-draft-prompt">{{ origin.submittedPrompt }}</Text><Text v-if="origin.revisedPrompt" class="image-draft-prompt">平台调整后：{{ origin.revisedPrompt }}{{ origin.revisedPromptTruncated?'（此处截断）':'' }}</Text></Disclosure></Disclosure>
</template>
