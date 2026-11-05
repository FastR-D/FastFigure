<script setup lang="ts">
import { computed } from 'vue'
import { Box, Button, Field, Select, Text, TextField } from '../ui'
import { useEditor } from '../../composables/useEditor'
import { findObject, resolveStyle } from '../../core/geometry'
import { fontOptions } from '../../data/materials'
import { canvasNodeTextStyle, canvasContainerTextStyle, resolvedTextStyle } from '../../core/typography'
import { figurePaint } from '../../core/paint'
const editor = useEditor()
const object = computed(() => findObject(editor.figure.value, editor.selectedId.value))
const canFormatText=computed(()=>!!object.value&&!('kind' in object.value&&['path','port','image'].includes(object.value.kind)))
const style = computed(() => object.value && 'kind' in object.value ? canvasNodeTextStyle(object.value,editor.textTarget.value==='description',resolveStyle(editor.figure.value,object.value.parentId)) : object.value?canvasContainerTextStyle(object.value,editor.activeStyle.value):resolvedTextStyle())
const fonts=computed(()=>fontOptions.some(f=>f.value===style.value.family)?fontOptions:[{value:style.value.family,label:style.value.family},...fontOptions])
const fillColor=computed(()=>{
  const node=editor.selectedNode.value,paint=figurePaint(resolveStyle(editor.figure.value,node?.parentId??'stage'),node?.visual?.colorIndex)
  return node?.visual?.fill&&node.visual.fill!=='none'?node.visual.fill:node?.visual?.tone==='hatch'?paint.hatch:paint.fill
})
function sizeChanged(event: Event) { const input = event.target as HTMLInputElement; if (!editor.formatText({ size: Number(input.value) })) input.value = String(style.value.size) }
</script>
<template>
  <Box class="text-toolbar" role="toolbar" aria-label="文字与形状格式">
    <Select :value="style.family" :options="fonts" size="xs" :disabled="!canFormatText" aria-label="文字字体" @change="editor.formatText({family:$event as typeof style.family})" />
    <Select v-if="object && 'kind' in object && object.description" :value="editor.textTarget.value" :options="[{value:'label',label:'标题'}, {value:'description',label:'注释'}]" size="xs" aria-label="文字区域" @change="editor.textTarget.value=$event as 'label'|'description'" />
    <TextField type="number" :value="style.size" min="1" max="256" aria-label="文字字号" :disabled="!canFormatText" @change="sizeChanged" />
    <Button size="xs" class="format-bold" :aria-pressed="style.bold" :disabled="!canFormatText" aria-label="文字加粗" title="加粗" @click="editor.formatText({bold:!style.bold})">B</Button>
    <Button size="xs" class="format-italic" :aria-pressed="style.italic" :disabled="!canFormatText" aria-label="文字斜体" title="斜体" @click="editor.formatText({italic:!style.italic})">I</Button>
    <Field title="文字颜色"><Text>A</Text><TextField type="color" :value="style.color" aria-label="文字颜色" :disabled="!canFormatText" @change="editor.formatText({color:($event.target as HTMLInputElement).value})" /></Field>
    <Select :value="style.align" size="xs" :options="[{value:'left',label:'左对齐'}, {value:'center',label:'居中'}, {value:'right',label:'右对齐'}]" aria-label="文字对齐" :disabled="!canFormatText" @change="editor.formatText({align:$event as typeof style.align})" />
    <Field title="形状填充"><Text>填充</Text><TextField type="color" :value="fillColor" aria-label="形状填充颜色" :disabled="!object || !('kind' in object) || ['path','port','text','icon','image'].includes(object.kind)" @change="editor.paintSelection('fill',($event.target as HTMLInputElement).value)" /></Field>
    <Button size="xs" :disabled="!canFormatText || object && 'role' in object && object.role==='component'" @click="editor.beginTextEdit(editor.selectedId.value, editor.textTarget.value)">编辑文字</Button>
    <Button size="xs" aria-label="素材快速居中" title="相对父容器居中整个选区" :disabled="!editor.selectedObjects.value.length || editor.selectedObjects.value.some(o=>!o.parentId)" @click="editor.materialEdit.value='center'">居中</Button>
    <Button size="xs" aria-label="统一素材格式" title="以已有对象为样本统一格式" :disabled="!editor.selectedObjects.value.length || editor.selectedObjects.value.some(o=>!o.parentId)" @click="editor.materialEdit.value='format'">统一格式</Button>
    <Button size="xs" aria-label="适配文字框" :disabled="!editor.selectedObjects.value.length" @click="editor.materialEdit.value='fit-text'">适配文字</Button>
    <Button size="xs" aria-label="统一素材尺寸" :disabled="!editor.selectedObjects.value.length || editor.selectedObjects.value.some(o=>!o.parentId)" @click="editor.materialEdit.value='match-size'">统一尺寸</Button>
    <Button size="xs" aria-label="统一连线样式" :disabled="!editor.selectedIds.value.length" @click="editor.materialEdit.value='line-style'">连线样式</Button>
    <Text class="text-toolbar-hint">双击文字编辑 · 组选中后可批量设格式</Text>
  </Box>
</template>
