<script setup lang="ts">
import { computed } from 'vue'
import { Box, Button, Text } from '@fastrd/ui-vue'
import { Icon } from '../ui'
import { useEditor } from '../../composables/useEditor'
import { findObject } from '../../core/geometry'
import ReferencePreview from './ReferencePreview'
const editor = useEditor(), image = editor.activeReference
const object = computed(() => editor.selectedIds.value.length === 1 ? findObject(editor.figure.value, editor.selectedId.value) : undefined)
</script>

<template>
  <Box v-if="image" class="reference-guide" aria-label="原图对照区">
    <Box class="reference-guide-heading"><Box><Text>REFERENCE</Text><Text>{{ image.title }}</Text></Box><Button variant="quiet" size="xs" aria-label="隐藏对照图" @click="editor.referenceMode.value = 'hidden'"><Icon name="close" /></Button></Box>
    <Box class="reference-guide-image"><ReferencePreview :image="image" :region="editor.evidenceRegion.value" label="在对照图框选区域" editable @region="editor.evidenceRegion.value = $event" /></Box>
    <Box class="reference-guide-actions"><Text class="muted-caption">{{ object ? `关联到：${'label' in object ? object.label : object.title}` : '选择一个重绘对象' }}</Text><Button size="xs" :disabled="!object" aria-label="关联对照图区域" @click="editor.bindEvidence(editor.evidenceRegion.value)">关联区域</Button></Box>
    <Text class="muted-caption">{{ image.citation || image.fileName }}</Text>
  </Box>
</template>
