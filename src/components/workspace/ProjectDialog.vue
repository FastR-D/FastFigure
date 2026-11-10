<script setup lang="ts">
import { ref, watch } from 'vue'
import { Modal, Header, Heading, Text, ModalBody, Footer, Button, Field, TextField, Box } from '@fastrd/ui-vue'
import { Icon } from '../ui'
import IconButton from '../ui/IconButton.vue'
import {maxProjectBytes} from '../../core/model'
import { useEditor } from '../../composables/useEditor'
import { downloadFile } from '../../core/export'
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const editor = useEditor(), title = ref(''), error = ref('')
let operation = 0
function close() { operation++; emit('close') }
watch(() => props.open, open => { operation++; if (open) { title.value = editor.figure.value.title; error.value = '' } })
function save() {
  if (!title.value.trim()) { error.value = '请输入工程名称'; return }
  editor.update(doc => { doc.title = title.value.trim() }); editor.save(); close()
}
function loadExample() {
  operation++
  editor.newProject(); title.value = editor.figure.value.title; editor.notice.value = '已载入示例，可通过撤销恢复之前的画布'
}
async function importFile(e: Event) {
  const input = e.target as HTMLInputElement, file = input.files?.[0]
  if (!file) return
  const current = ++operation, baseline = editor.figure.value, baselineKey = JSON.stringify(baseline)
  const currentOperation = () => current === operation && props.open
  try {
    if (file.size > maxProjectBytes) throw new Error('工程文件不能超过 8 MB')
    const text = await file.text()
    if (!currentOperation()) return
    if (editor.figure.value !== baseline || JSON.stringify(editor.figure.value) !== baselineKey) { error.value = '画布已变化，请重新选择工程文件。'; return }
    editor.importProject(text); title.value = editor.figure.value.title; error.value = ''; input.value = ''; close()
  } catch { if (currentOperation()) error.value = '无法导入。请选择有效的 FastFigure JSON 工程（不超过 8 MB）。当前画布未改变。' }
  finally { if (current === operation) input.value = '' }
}
</script>

<template>
  <Modal :open="open" label="工程管理" @close="close">
    <Header><Heading>工程管理</Heading><IconButton icon="close" label="关闭工程管理" @click="close" /></Header>
    <ModalBody>
      <Text class="panel-description">工程保存在当前浏览器。导出 JSON 可以备份结构、样式、连接和参考图片。</Text>
      <Field><Text>工程名称</Text><TextField v-model="title" maxlength="100" aria-label="工程名称" @keydown.enter="save" /></Field>
      <Field><Text>导入 FastFigure 工程</Text><TextField type="file" accept=".json,application/json" aria-label="导入工程文件" @change="importFile" /></Field>
      <Text v-if="error" role="alert" class="error-text">{{ error }}</Text>
      <Box class="project-secondary-actions">
        <Button @click="editor.newProject('blank'); title = editor.figure.value.title; editor.notice.value = '已新建空白图，可通过撤销恢复之前的画布'; close()"><Icon name="plus" />新建空白图</Button>
        <Button @click="downloadFile(`${editor.figure.value.title}.fastfigure.json`, JSON.stringify(editor.figure.value, null, 2), 'application/json')"><Icon name="export" />备份 JSON</Button>
        <Button @click="loadExample"><Icon name="plus" />载入示例</Button>
      </Box>
    </ModalBody>
    <Footer><Button @click="close">取消</Button><Button variant="primary" @click="save"><Icon name="save" />保存工程</Button></Footer>
  </Modal>
</template>
