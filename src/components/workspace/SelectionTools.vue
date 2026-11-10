<script setup lang="ts">
import {computed} from 'vue'
import { Box, Button, Select, Text } from '@fastrd/ui-vue'
import { Icon } from '../ui'
import { useEditor } from '../../composables/useEditor'
import type { AlignMode } from '../../core/geometry'
const editor = useEditor()
const edgeCount=computed(()=>editor.selectedIds.value.filter(id=>editor.figure.value.edges.some(e=>e.id===id)).length)
const alignments = [
  { value: 'left', label: '左对齐' }, { value: 'center', label: '水平居中' }, { value: 'right', label: '右对齐' },
  { value: 'top', label: '顶部对齐' }, { value: 'middle', label: '垂直居中' }, { value: 'bottom', label: '底部对齐' },
  { value: 'distribute-x', label: '水平等距分布' }, { value: 'distribute-y', label: '垂直等距分布' },
]
</script>

<template>
  <Box class="selection-tools" role="group" aria-label="选区操作">
    <Text class="selection-count">{{ editor.selectedObjects.value.length }} 个图元{{ edgeCount?` · ${edgeCount} 条连接`:'' }}</Text>

    <Box class="selection-tool-row">
      <Select :value="undefined" :options="alignments" placeholder="对齐与分布" aria-label="对齐与分布" :disabled="editor.selectedObjects.value.length < 2" size="sm" @change="editor.alignSelection($event as AlignMode)" />
      <Select :value="undefined" :options="[{value:'row',label:'水平排列'}, {value:'column',label:'垂直排列'}]" placeholder="排列" aria-label="排列选区" :disabled="editor.selectedObjects.value.length < 2" size="sm" @change="editor.arrangeSelection($event as 'row' | 'column')" />
    </Box>
    <Box class="selection-tool-row">
      <Button size="sm" :disabled="!editor.canGroup.value" @click="editor.groupSelection"><Icon name="group" />组合为容器</Button>
      <Button size="sm" :disabled="!editor.selectedContainer.value?.parentId || editor.selectedIds.value.length > 1" @click="editor.ungroupSelection"><Icon name="ungroup" />解组</Button>
    </Box>
    <Button size="sm" @click="editor.layoutDialogOpen.value = true"><Icon name="layers" />自动排列当前容器</Button>
    <Button size="sm" @click="editor.panelLayoutOpen.value = true"><Icon name="grid" />多子图编排</Button>
    <Button size="sm" :disabled="!editor.selectedContainer.value || editor.selectedIds.value.length !== 1" @click="editor.scaleDialogId.value = editor.selectedContainer.value?.id ?? null"><Icon name="fit" />整体等比缩放</Button>
  </Box>
</template>
