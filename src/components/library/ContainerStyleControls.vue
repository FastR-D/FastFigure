<script setup lang="ts">
import {computed,defineAsyncComponent,ref} from 'vue'
import {Box,Button,Field,Icon,Select,Text,TextField} from '../ui'
import {useEditor} from '../../composables/useEditor'
import {canColorContainer,setContainerColor} from '../../core/containerColor'
import {containerSurface,containerSurfaceOptions,setContainerSurface,type ContainerSurface} from '../../core/containerSurface'
import type {AccentId} from '../../core/model'
import ThemeColorPicker from './ThemeColorPicker.vue'
const editor=useEditor(),mappingOpen=ref(false)
const ColorMappingDialog=defineAsyncComponent(()=>import('./ColorMappingDialog.vue'))
const colorable=computed(()=>canColorContainer(editor.figure.value,editor.currentContainer.value.id))
const localColor=computed(()=>editor.currentContainer.value.id==='stage'?editor.figure.value.style.colorIndex:editor.currentContainer.value.appearance?.colorIndex)
</script>
<template>
  <Box class="container-style-controls">
    <Text class="style-section-label">当前容器 · {{ editor.currentContainer.value.title }}</Text>
    <Button :disabled="!colorable" @click="mappingOpen=true">多色映射与预览</Button>
    <ColorMappingDialog v-if="mappingOpen" :container-id="editor.currentContainer.value.id" @close="mappingOpen=false" />
    <Field><Text>默认主题色</Text><ThemeColorPicker :palette-id="editor.activeStyle.value.paletteId" :model-value="localColor" :effective-index="editor.activeStyle.value.colorIndex" :inherit="editor.currentContainer.value.id!=='stage'" :disabled="!colorable" label="容器默认主题色" @update:model-value="index=>editor.update(doc=>setContainerColor(doc,editor.currentContainer.value.id,index))" /></Field>
    <Field><Text>容器填充</Text><Select :value="containerSurface(editor.currentContainer.value)" :options="containerSurfaceOptions" aria-label="容器填充" @change="editor.update(doc=>{const target=doc.containers.find(c=>c.id===editor.currentContainer.value.id);if(target)setContainerSurface(target,$event as ContainerSurface)})" /></Field>
    <Field><Text>图件色系</Text><Select :value="editor.activeStyle.value.accent" :options="[{value:'blue',label:'学术蓝'},{value:'slate',label:'石墨灰'},{value:'teal',label:'青灰'},{value:'sand',label:'浅砂黄'},{value:'rose',label:'浅玫红'}]" aria-label="图件色系" @change="editor.setAccent($event as AccentId)" /></Field>
    <Button v-if="editor.currentContainer.value.parentId" variant="quiet" @click="editor.inheritAppearance"><Icon name="refresh" />恢复父级样式</Button>
    <Field v-if="editor.activeStyle.value.preset==='sketch'"><Text>手绘强度</Text><TextField type="range" min="0" max="2" step="0.05" :value="editor.figure.value.style.roughness" aria-label="手绘强度" @change="editor.update(doc=>{doc.style.roughness=Number(($event.target as HTMLInputElement).value)})" /></Field>
  </Box>
</template>
