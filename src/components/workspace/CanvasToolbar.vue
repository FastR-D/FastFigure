<script setup lang="ts">
import { Box, Text, Select } from '../ui'
import IconButton from '../ui/IconButton.vue'
import { useEditor } from '../../composables/useEditor'
const editor = useEditor()
</script>

<template>
  <Box class="canvas-toolbar" role="toolbar" aria-label="画布工具">
    <Box class="toolbar-group">
      <IconButton icon="undo" label="撤销 · Ctrl / ⌘ Z" :disabled="!editor.past.value.length" @click="editor.undo" />
      <IconButton icon="redo" label="重做 · Ctrl / ⌘ Shift Z" :disabled="!editor.future.value.length" @click="editor.redo" />
      <Box class="toolbar-divider" />
      <IconButton icon="cursor" label="选择工具" :active="!editor.connectMode.value" @click="editor.connectMode.value = false; editor.connectionSource.value = null" />
      <IconButton icon="connect" label="连接两个节点" :active="editor.connectMode.value" @click="editor.toggleConnect" />
      <IconButton icon="arrow" label="按点绘制直角箭头" @click="editor.materialEdit.value='arrow'" />
      <IconButton icon="layers" label="自动布局" @click="editor.layoutDialogOpen.value = true" />
      <IconButton icon="grid" label="多子图编排" @click="editor.panelLayoutOpen.value = true" />
      <IconButton icon="chat" label="添加引线注释" @click="editor.calloutOpen.value=true" />
      <IconButton icon="search" label="放大选中局部" :disabled="!editor.selectedObjects.value.length||editor.selectedIds.value.length>24||editor.selectedObjects.value.some(o=>!o.parentId||'interfaceFor'in o&&o.interfaceFor)" @click="editor.detailInsetOpen.value=true" />
      <IconButton icon="ruler" label="论文尺寸与可读性" :active="!!editor.figure.value.publication" @click="editor.publicationOpen.value = true" />
    </Box>
    <Text class="toolbar-dimensions">1000 × 620</Text>
    <Box class="toolbar-group toolbar-right">
      <IconButton class="group-toolbar-button" icon="group" label="组合为容器 · Ctrl / ⌘ G" :disabled="!editor.canGroup.value" @click="editor.groupSelection" />
      <IconButton icon="grid" label="显示网格" :active="editor.showGrid.value" @click="editor.showGrid.value = !editor.showGrid.value" />
      <Select aria-label="画布缩放" size="sm" :value="String(editor.zoom.value)" :options="[50,75,100,125,150].map(v => ({ value: String(v), label: `${v}%` }))" @change="editor.zoom.value = Number($event)" />
      <IconButton icon="fit" label="适应画布" @click="editor.zoom.value = 100" />
    </Box>
  </Box>
</template>
