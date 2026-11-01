<script setup lang="ts">
import {computed,ref} from 'vue'
import {Box,Button,Field,Footer,Header,Heading,Modal,ModalBody,Select,Text,TextField} from '../ui'
import IconButton from '../ui/IconButton.vue'
import {useEditor} from '../../composables/useEditor'
import {clone,type FigureDocument} from '../../core/model'
import {resolveStyle} from '../../core/geometry'
import {setContainerColorMap} from '../../core/colorMapping'
import type {ColorMapping} from '../../core/colorMappingContract'
import {colorPalettes,defaultPaletteId,paletteById} from '../../data/materials'
import ColorMapEditor from './ColorMapEditor.vue'
import FigureRenderer from '../figure/FigureRenderer'
const props=defineProps<{containerId:string}>(),emit=defineEmits<{close:[]}>(),editor=useEditor()
const base=clone(editor.figure.value),baseline=JSON.stringify(base),style=resolveStyle(base,props.containerId),rows=ref<ColorMapping[]|undefined>(clone(style.colorMap??[])),paletteId=ref(style.paletteId??defaultPaletteId),query=ref(''),error=ref(''),before=ref(false)
const options=computed(()=>{const terms=query.value.toLowerCase().trim().split(/\s+/).filter(Boolean),found=colorPalettes.filter(p=>terms.every(t=>[p.title,p.id,...p.tags].join(' ').toLowerCase().includes(t))).slice(0,24);return[...new Map([paletteById.get(paletteId.value)!,...found].map(p=>[p.id,p])).values()].map(p=>({value:p.id,label:p.title}))})
const preview=computed<{figure?:FigureDocument;error?:string}>(()=>{try{const figure=clone(base);setContainerColorMap(figure,props.containerId,rows.value);return{figure}}catch(e){return{error:(e as Error).message}}})
function apply(){if(JSON.stringify(editor.figure.value)!==baseline){error.value='画布已变化，请关闭并重新预览颜色映射';return}if(preview.value.figure&&editor.update(doc=>setContainerColorMap(doc,props.containerId,rows.value))){editor.notice.value='已应用颜色映射，可单步撤销';emit('close')}}
</script>
<template>
  <Modal :open="true" size="xl" label="组件颜色映射" class="color-mapping-dialog" @close="emit('close')">
    <Header><Box><Heading>组件颜色映射</Heading><Text class="muted-caption">{{ base.containers.find(c=>c.id===containerId)?.title }} · 预览后应用，保留结构、文字与固定颜色。</Text></Box><IconButton icon="close" label="关闭颜色映射" @click="emit('close')" /></Header>
    <ModalBody><Box class="color-mapping-layout"><Box class="color-mapping-controls"><Field><Text>查找目标配色</Text><TextField v-model="query" type="search" aria-label="查找映射配色" /></Field><Select :value="paletteId" :options="options" aria-label="映射目标配色" @change="paletteId=$event" /><ColorMapEditor v-model="rows" :figure="base" :container-id="containerId" :target-palette-id="paletteId" /><Box><Button size="xs" @click="rows=[]">清空映射</Button><Button v-if="containerId!=='stage'" size="xs" variant="quiet" @click="rows=undefined">恢复父级映射</Button></Box></Box><Box class="color-mapping-preview"><Box><Button size="xs" :variant="before?'primary':'quiet'" @click="before=true">修改前</Button><Button size="xs" :variant="before?'quiet':'primary'" @click="before=false">预览结果</Button></Box><FigureRenderer v-if="preview.figure" :figure="before?base:preview.figure" /><Text v-if="preview.error" role="alert" class="error-text">{{ preview.error }}</Text><Text v-if="error" role="alert" class="error-text">{{ error }}</Text><Text class="muted-caption">色槽表示视觉角色，不代表统计量或科学含义。数据图表使用自己的系列和数值色阶。</Text></Box></Box></ModalBody>
    <Footer><Button @click="emit('close')">取消</Button><Button variant="primary" :disabled="!preview.figure" @click="apply">应用颜色映射</Button></Footer>
  </Modal>
</template>
