<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { Box, Button, TextArea, Text } from '../ui'
import { useEditor } from '../../composables/useEditor'
import { findObject } from '../../core/geometry'
import { fontStack } from '../../data/materials'
import { nodeStructure, structureLabels } from '../../core/structures'
const editor = useEditor(), draft = ref(''), input = useTemplateRef<HTMLTextAreaElement>('input')
const object = computed(() => editor.textEdit.value ? findObject(editor.figure.value, editor.textEdit.value.id) : undefined)
const description = computed(() => editor.textEdit.value?.field === 'description')
const structureIndex = computed(()=>editor.textEdit.value?.field.startsWith('structure:') ? Number(editor.textEdit.value.field.slice(10)) : null)
const style = computed(() => object.value && 'kind' in object.value && description.value ? object.value.descriptionStyle : object.value?.textStyle)
watch(editor.textEdit, async edit => {
  if (!edit || !object.value) return
  const structure='kind' in object.value?nodeStructure(object.value):undefined
  draft.value = structure&&structureIndex.value!==null ? structureLabels(structure)[structureIndex.value]??'' : 'kind' in object.value ? description.value ? object.value.description ?? '' : object.value.label : object.value.title
  await nextTick(); input.value?.focus(); input.value?.select()
})
function finish(cancel = false) { editor.finishTextEdit(draft.value, cancel) }
function keydown(event: KeyboardEvent) {
  if (event.isComposing) return
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(true) }
  else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); finish() }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); event.stopPropagation(); finish(); editor.save() }
}
</script>
<template>
  <Box v-if="editor.textEdit.value && object" class="canvas-text-editor" :style="{left:`${object.x/10}%`,top:`${object.y/6.2}%`,width:`max(180px,${object.width/10}%)`,maxWidth:`calc(100% - ${object.x/10}%)`}" @pointerdown.stop @keydown="keydown">
    <TextArea ref="input" v-model="draft" aria-label="画布文字编辑" :maxlength="structureIndex!==null?40:description||object&&'kind' in object&&object.kind==='text'?240:100" rows="3" :style="{fontFamily:fontStack(style?.family),fontSize:`${Math.min(24,Math.max(14,style?.size ?? 16))}px`,fontWeight:style?.bold?700:400,fontStyle:style?.italic?'italic':'normal'}" @blur="finish()" />
    <Box @pointerdown.prevent><Text>{{ description ? '注释' : '文字' }} · Ctrl/⌘ Enter 完成</Text><Button size="xs" @click="finish(true)">取消</Button><Button size="xs" variant="primary" @click="finish()">完成</Button></Box>
  </Box>
</template>
