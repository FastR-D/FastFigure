<script setup lang="ts">
import {computed} from 'vue'
import {Box,Button,Disclosure,DisclosureTrigger,Text} from '@fastrd/ui-vue'
import {useEditor} from '../../composables/useEditor'
import {recipeUpdateTargets} from '../../core/recipeUpdate'
import {recipeFieldValue,visibleRecipeFields} from '../../data/recipes'
defineProps<{disabled:boolean}>()
const editor=useEditor(),targets=computed(()=>recipeUpdateTargets(editor.figure.value,editor.selectedIds.value))
</script>
<template>
  <Disclosure class="harness-recipe-targets">
    <DisclosureTrigger size="xs">可调整的画布组合 · {{ targets.length }}</DisclosureTrigger><Text class="muted-caption">只使用当前图件，不检索或插入其他素材。说明要改哪组、哪些参数；原生重绘后先审阅再应用。</Text>
    <Box v-for="target in targets" :key="target.containerId" class="harness-recipe-target"><Box class="material-actions"><Text class="selection-title">{{ target.title }}</Text><Text v-if="target.selected" class="muted-caption">与选中对象相关</Text><Button size="xs" variant="quiet" :disabled="disabled" :aria-label="`定位参数组合 ${target.containerId}`" @click="editor.select(target.containerId)">定位</Button></Box><Text class="muted-caption">{{ target.recipeName }} · 修订 {{ target.revision }}</Text><Text class="muted-caption">{{ visibleRecipeFields(target,target.parameters).map(field=>`${field.label}：${field.options.find(option=>option.value===String(recipeFieldValue(field,target.parameters)))?.label??recipeFieldValue(field,target.parameters)}`).join(' · ') }}</Text></Box>
    <Text v-if="!targets.length" class="muted-caption">当前图件没有对应记录，可先从参数化组合插入。</Text>
  </Disclosure>
</template>
