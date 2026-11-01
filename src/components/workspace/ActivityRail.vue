<script setup lang="ts">
import { Nav, Button, Icon, Text, Box } from '../ui'
import { useEditor } from '../../composables/useEditor'
const editor = useEditor()
const items = [{ id: 'components', icon: 'grid', label: '组件' }, { id: 'icons', icon: 'creation', label: '图标' }, { id: 'palettes', icon: 'palette', label: '配色' }, { id: 'gallery', icon: 'book', label: '图库' }, { id: 'references', icon: 'image', label: '参考图' }, { id: 'layers', icon: 'layers', label: '图层' }, { id: 'styles', icon: 'theme', label: '样式' }, { id: 'assistant', icon: 'chat', label: '助手' }] as const
function select(id: typeof items[number]['id']) {
  if (id === 'assistant') { editor.openAssistant(); return }
  editor.activePanel.value = id
}
</script>

<template>
  <Nav class="activity-rail" aria-label="工作区导航">
    <Button v-for="item in items" :key="item.id" variant="navigation" :aria-selected="editor.activePanel.value === item.id" aria-controls="workspace-sidebar" :title="item.id === 'assistant' ? 'Harness 绘图助手' : item.label" @click="select(item.id)">
      <Icon :name="item.icon" /><Text>{{ item.label }}</Text>
    </Button>
    <Box class="rail-spacer" />
    <Button variant="navigation" title="保存到浏览器 · Ctrl / ⌘ S" @click="editor.save"><Icon name="save" /><Text>保存</Text></Button>
  </Nav>
</template>
