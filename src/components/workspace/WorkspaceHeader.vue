<script setup lang="ts">
import { computed } from 'vue'
import { Header, Box, Text, BrandMark, Button, Icon } from '../ui'
import { useEditor } from '../../composables/useEditor'
const editor = useEditor()
defineEmits<{ export: []; project: [] }>()
const saveLabel = computed(() => editor.saved.value ? '已保存到本地' : '有未保存的更改')
</script>

<template>
  <Header class="workspace-header">
    <Box class="brand"><BrandMark /><Text as="strong">FastFigure</Text><Text class="version-tag">PREVIEW</Text></Box>
    <Box class="header-location"><Text>个人工作空间</Text><Icon name="chevron" /><Text>科研绘图</Text></Box>
    <Box class="header-spacer" />
    <Text class="save-indicator"><Icon :name="editor.saved.value ? 'check' : 'edit'" />{{ saveLabel }}</Text>
    <Button variant="quiet" class="project-trigger" @click="$emit('project')"><Icon name="files" /><Text>工程</Text></Button>
    <Button variant="primary" class="export-trigger" @click="$emit('export')"><Icon name="export" /><Text>导出图件</Text></Button>
    <Box class="user-avatar" title="本地工作空间">F</Box>
  </Header>
</template>
