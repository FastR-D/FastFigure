<script setup lang="ts">
import { computed, ref } from 'vue'
import { Box, Button, Select, Text, TextField } from '../ui'
import { materialIcons, searchIcons } from '../../data/materials'
import { useEditor } from '../../composables/useEditor'
import MaterialGlyph from './MaterialGlyph'
const editor = useEditor(), query = ref(''), category = ref('all'), chosen = ref(materialIcons[0]!.id)
const icons = computed(() => searchIcons(query.value, category.value)), selected = computed(() => materialIcons.find(i => i.id === chosen.value)!)
const categories = ['all',...new Set(materialIcons.map(i=>i.category))].map(value=>({value,label:value==='all'?'全部分类':value}))
function attach() { editor.update(doc=>{ const node = doc.nodes.find(n=>n.id===editor.selectedId.value); if(node) node.iconId=chosen.value }) }
</script>
<template>
  <Box class="library-body icon-library">
    <TextField v-model="query" type="search" aria-label="搜索图标" placeholder="搜索图标：数据库、brain、云…" />
    <Select :value="category" :options="categories" aria-label="图标分类" @change="category=$event" />
    <Text class="muted-caption">FastPPT 同源 Material Design Icons · {{ materialIcons.length }} 个精选矢量图标</Text>
    <Box class="icon-selected"><MaterialGlyph :icon-id="chosen" /><Box><Text>{{ selected.name }}</Text><Text class="muted-caption">{{ selected.id }}</Text></Box></Box>
    <Box class="material-actions"><Button size="xs" variant="primary" @click="editor.addIcon(chosen)">插入画布</Button><Button size="xs" :disabled="!editor.selectedNode.value" @click="attach">用于所选节点</Button><Button size="xs" @click="editor.useMaterialPrompt(`请使用图标 ${selected.id}（${selected.name}），结合当前图件绘制，并保留可编辑的标题与注释。`)">用于助手</Button></Box>
    <Box class="material-icon-grid"><Button v-for="icon in icons" :key="icon.id" variant="quiet" draggable="true" @dragstart="editor.libraryDrag.start($event,{kind:'node',nodeKind:'icon',label:icon.name,extras:{iconId:icon.id}})" :aria-label="`选择图标 ${icon.name}`" :aria-pressed="chosen===icon.id" :title="icon.id" @click="chosen=icon.id"><MaterialGlyph :icon-id="icon.id" /><Text>{{ icon.name }}</Text></Button></Box>
    <Text v-if="!icons.length" class="empty-state">没有匹配图标，可使用中文名称或英文关键词。</Text>
    <Text class="muted-caption">图标作为独立对象或节点内图示保存，助手使用相同 ID。Apache-2.0 · Pictogrammers。</Text>
  </Box>
</template>
