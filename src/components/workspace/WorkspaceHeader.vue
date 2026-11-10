<script setup lang="ts">
import { computed,ref } from 'vue'
import { Header, Box, Text, Button, Modal, ModalBody, Footer, Heading, Field, TextField } from '@fastrd/ui-vue'
import { BrandMark, Icon } from '../ui'
import IconButton from '../ui/IconButton.vue'
import WorkspaceHelp from './WorkspaceHelp.vue'
import { useEditor } from '../../composables/useEditor'
const editor = useEditor()
defineEmits<{ export: []; project: [] }>()
const saveLabel = computed(() => editor.storageError.value || (editor.saved.value ? '已保存到本地' : '有未保存的更改'))
const rename=ref<'folder'|'figure'|null>(null),name=ref(''),helpOpen=ref(false)
function editName(kind:'folder'|'figure'){rename.value=kind;name.value=kind==='folder'?editor.figure.value.folder??'方法与系统架构':editor.figure.value.title}
function saveName(){const value=name.value.trim();if(!value)return;if(editor.update(doc=>{if(rename.value==='folder')doc.folder=value;else doc.title=value}))rename.value=null}
</script>

<template>
  <Header class="workspace-header">
    <Box class="brand"><BrandMark /><Text as="strong">FastFigure</Text><Text class="version-tag">PREVIEW</Text></Box>
    <Box class="header-location"><Icon name="files" /><Text>{{ editor.figure.value.folder??'方法与系统架构' }}</Text><IconButton icon="edit" label="编辑文件夹名称" @click="editName('folder')" /><Icon name="chevron" /><Text class="header-figure-name">{{ editor.figure.value.title }}</Text><IconButton icon="edit" label="编辑图件名称" @click="editName('figure')" /></Box>
    <Box class="header-spacer" />
    <Text class="save-indicator"><Icon :name="editor.saved.value ? 'check' : 'edit'" />{{ saveLabel }}</Text>
    <Button variant="quiet" class="project-trigger" @click="$emit('project')"><Icon name="files" /><Text>工程</Text></Button>
    <Button variant="primary" class="export-trigger" @click="$emit('export')"><Icon name="export" /><Text>导出图件</Text></Button>
    <IconButton class="workspace-help-trigger" icon="help" label="使用指南" @click="helpOpen=true" />
    <Box class="user-avatar" title="本地工作空间">F</Box>
  </Header>
  <Modal :open="!!rename" :label="rename==='folder'?'重命名文件夹':'重命名图件'" size="md" @close="rename=null"><Header><Heading>{{ rename==='folder'?'重命名文件夹':'重命名图件' }}</Heading><IconButton icon="close" label="关闭重命名" @click="rename=null" /></Header><ModalBody><Field><Text>名称</Text><TextField v-model="name" maxlength="100" aria-label="新名称" @keydown.enter="saveName" /></Field></ModalBody><Footer><Button @click="rename=null">取消</Button><Button variant="primary" :disabled="!name.trim()" @click="saveName">保存名称</Button></Footer></Modal>
  <WorkspaceHelp :open="helpOpen" @close="helpOpen=false" />
</template>
