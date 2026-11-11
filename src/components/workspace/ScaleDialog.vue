<script setup lang="ts">
import { computed, ref } from 'vue'
import { Box, Button, Field, Footer, Header, Heading, Modal, ModalBody, Select, Text, TextField } from '@fastrd/ui-vue'
import IconButton from '../ui/IconButton.vue'
import FigureRenderer from '../figure/FigureRenderer'
import { useEditor } from '../../composables/useEditor'
import { scaleSubtree, type ScaleAnchor } from '../../core/scaling'
const editor=useEditor(),percent=ref(100),anchor=ref<ScaleAnchor>('center')
const preview=computed(()=>{try{return {result:scaleSubtree(editor.figure.value,editor.scaleDialogId.value!,Number(percent.value)/100,anchor.value),error:''}}catch(error){return {result:null,error:(error as Error).message}}})
const target=computed(()=>preview.value.result?.document.containers.find(c=>c.id===editor.scaleDialogId.value))
const viewport=computed(()=>{const before=editor.figure.value.containers.find(c=>c.id===editor.scaleDialogId.value)!,after=target.value??before,x=Math.min(before.x,after.x)-16,y=Math.min(before.y,after.y)-16;return{x,y,width:Math.max(before.x+before.width,after.x+after.width)-x+16,height:Math.max(before.y+before.height,after.y+after.height)-y+16}})
function close(){editor.scaleDialogId.value=null}
function apply(){if(preview.value.result&&editor.applyScale(editor.scaleDialogId.value!,Number(percent.value)/100,anchor.value))close()}
</script>
<template>
  <Modal open label="整体等比缩放" size="lg" class="layout-dialog" @close="close">
    <Header><Box><Heading>整体等比缩放</Heading><Text class="muted-caption">同步缩放内部图元、字号、描边和间距。</Text></Box><IconButton icon="close" label="关闭整体缩放" @click="close" /></Header>
    <ModalBody>
      <Box class="layout-dialog-grid">
        <Box class="layout-preview"><FigureRenderer :figure="preview.result?.document ?? editor.figure.value" :viewport="viewport" :show-document-title="false" /><Text v-if="target">组合局部预览 · {{ Math.round(target.width*10)/10 }} × {{ Math.round(target.height*10)/10 }}</Text></Box><Box class="component-settings">
      <Field><Text>相对当前尺寸（%）</Text><TextField v-model.number="percent" type="number" min="10" max="400" step="5" aria-label="整体缩放百分比" /></Field>
      <Field><Text>缩放基点</Text><Select :value="anchor" :options="[{value:'center',label:'中心不变'},{value:'top-left',label:'左上角不变'}]" aria-label="缩放基点" @change="anchor=$event as ScaleAnchor" /></Field>
      <Text class="muted-caption">外部连接保留并重新布线。越界或超过字号限制时不应用。</Text>
      <Text v-if="preview.error" role="alert" class="error-text">{{ preview.error }}</Text><Text v-else-if="preview.result?.overlaps" class="placement-message">与 {{ preview.result.overlaps }} 个同层对象重叠，请检查预览。</Text>
        </Box>
      </Box>
    </ModalBody>
    <Footer><Text class="muted-caption">应用后可单步撤销</Text><Button @click="close">取消</Button><Button variant="primary" :disabled="!preview.result || Number(percent)===100" @click="apply">应用缩放</Button></Footer>
  </Modal>
</template>
