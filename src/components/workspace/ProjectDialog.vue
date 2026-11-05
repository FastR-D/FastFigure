<script setup lang="ts">
import { ref, watch } from 'vue'
import { Modal, Header, Heading, Text, ModalBody, Footer, Button, Field, TextField, Box, Icon } from '../ui'
import IconButton from '../ui/IconButton.vue'
import {maxProjectBytes} from '../../core/model'
import { useEditor } from '../../composables/useEditor'
import { downloadFile } from '../../core/export'
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const editor = useEditor(), title = ref(''), error = ref('')
watch(() => props.open, open => { if (open) { title.value = editor.figure.value.title; error.value = '' } })
function save() {
  if (!title.value.trim()) { error.value = '请输入工程名称'; return }
  editor.update(doc => { doc.title = title.value.trim() }); editor.save(); emit('close')
}
async function importFile(e: Event) {
  const input = e.target as HTMLInputElement, file = input.files?.[0]
  if (!file) return
  try {
    if (file.size > maxProjectBytes) throw new Error('工程文件不能超过 8 MB')
    editor.importProject(await file.text()); title.value = editor.figure.value.title; error.value = ''; emit('close')
  } catch { error.value = '无法导入。请选择有效的 FastFigure JSON 工程（不超过 8 MB）。当前画布未改变。' }
  input.value = ''
}
</script>

<template>
  <Modal :open="open" label="工程管理" @close="$emit('close')">
    <Header><Heading>工程管理</Heading><IconButton icon="close" label="关闭工程管理" @click="$emit('close')" /></Header>
    <ModalBody>
      <Text class="panel-description">工程保存在当前浏览器。导出 JSON 可以备份结构、样式、连接和参考图片。</Text>
      <Field><Text>工程名称</Text><TextField v-model="title" maxlength="100" aria-label="工程名称" @keydown.enter="save" /></Field>
      <Field><Text>导入 FastFigure 工程</Text><TextField type="file" accept=".json,application/json" aria-label="导入工程文件" @change="importFile" /></Field>
      <Text v-if="error" role="alert" class="error-text">{{ error }}</Text>
      <Box class="project-secondary-actions">
        <Button @click="editor.newProject('blank'); title = editor.figure.value.title; editor.notice.value = '已新建空白图，可通过撤销恢复之前的画布'; $emit('close')"><Icon name="plus" />新建空白图</Button>
        <Button @click="downloadFile(`${editor.figure.value.title}.fastfigure.json`, JSON.stringify(editor.figure.value, null, 2), 'application/json')"><Icon name="export" />备份 JSON</Button>
        <Button @click="editor.newProject(); title = editor.figure.value.title; editor.notice.value = '已载入示例，可通过撤销恢复之前的画布'"><Icon name="plus" />载入示例</Button>
      </Box>
    </ModalBody>
    <Footer><Button @click="$emit('close')">取消</Button><Button variant="primary" @click="save"><Icon name="save" />保存工程</Button></Footer>
  </Modal>
</template>
