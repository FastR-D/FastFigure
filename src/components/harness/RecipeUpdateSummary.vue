<script setup lang="ts">
import {Box,Disclosure,DisclosureTrigger,Text} from '@fastrd/ui-vue'
import type {RecipeUpdateUse} from '../../core/recipeUpdateContract'
defineProps<{updates:RecipeUpdateUse[]}>()
</script>
<template>
  <Box class="recipe-update-summary" role="group" aria-label="组合参数更新报告"><Text class="selection-title">已有组合参数 · {{ updates.length }} 项</Text><Disclosure v-for="update in updates" :key="update.containerId"><DisclosureTrigger size="xs">{{ update.title }} · {{ update.changed?'已生成参数更新':'参数保持' }}</DisclosureTrigger><Box class="recipe-update-detail"><Text>{{ update.recipeName }} · 修订 {{ update.beforeRevision }} → {{ update.afterRevision }}</Text><Text v-for="field in update.fields" :key="field.key">{{ field.label }}：{{ field.beforeLabel }} → {{ field.afterLabel }}</Text><Text v-if="!update.fields.length" class="muted-caption">参数值保持，{{ update.changed?'按选定范围调整布局':'未改变图件' }}。</Text><Text class="muted-caption">{{ update.layout==='frame'?'适配原外框':'保持绘制比例' }} · {{ update.keepEdits?'保留改字与外观':'重置生成文字与外观' }} · 绘制比例 {{ Math.round(update.beforeScale*1000)/10 }}% → {{ Math.round(update.afterScale*1000)/10 }}%</Text><Text class="muted-caption">程序重绘 {{ update.generated }} 图元 · 保留 {{ update.retainedIds }} 个 ID · 新增 {{ update.added }} / 移除 {{ update.removed }} 个生成对象 · 保留组内另加对象 {{ update.preserved }} 个</Text><Text class="muted-caption">助手理由：{{ update.reason }}</Text></Box></Disclosure></Box>
</template>
