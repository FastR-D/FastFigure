<script setup lang="ts">
import { computed } from 'vue'
import { Box, Button, Footer, Header, Heading, Modal, ModalBody, Text } from '../ui'
import IconButton from '../ui/IconButton.vue'
import FigureRenderer from '../figure/FigureRenderer'
import { useEditor } from '../../composables/useEditor'
import { expandStructure } from '../../core/expandStructure'
import { captureComponent } from '../../core/assets'
const editor=useEditor()
const preview=computed(()=>{
  if(!editor.structureExpandId.value)return {result:null,error:''}
  try{return {result:expandStructure(editor.figure.value,editor.structureExpandId.value),error:''}}
  catch(error){return {result:null,error:error instanceof Error&&!('issues' in error)?error.message:'转换未通过图元与容器校验'}}
})
const scoped=computed(()=>{const result=preview.value.result;return result?captureComponent(result.document,result.containerId,'结构预览').figure:null})
const viewport=computed(()=>{const c=scoped.value?.containers[0];return c?{x:-12,y:-12,width:c.width+24,height:c.height+24}:undefined})
</script>
<template>
  <Modal :open="!!editor.structureExpandId.value" label="转换为独立图元" size="md" class="structure-expand-dialog" @close="editor.structureExpandId.value=null">
    <Header><Heading>转换为独立图元</Heading><IconButton icon="close" label="关闭结构转换" @click="editor.structureExpandId.value=null" /></Header>
    <ModalBody>
      <Box v-if="scoped" class="structure-expand-preview"><FigureRenderer :figure="scoped" :viewport="viewport" :show-document-title="false" /></Box>
      <Text v-if="preview.result">{{ preview.result.nodeCount }} 个独立图元 · {{ preview.result.paths }} 条可编辑线段</Text>
      <Text>保留标题、注释、外部连接和来源。转换后可逐个移动形状、编辑文字、拖动折点，再将整组存入组件库。</Text>
      <Text class="muted-caption">转换使用可读尺寸，并保留当前颜色。层数以 ×N 标注；转换后内部结构由自由图元组成，修改预设参数请先撤销转换。</Text>
      <Text v-if="preview.error" role="alert" class="error-text">{{ preview.error }}</Text>
    </ModalBody>
    <Footer><Text class="muted-caption">可单步撤销</Text><Button @click="editor.structureExpandId.value=null">取消</Button><Button variant="primary" :disabled="!preview.result" @click="editor.expandSelectedStructure(editor.structureExpandId.value!)">转换为图元</Button></Footer>
  </Modal>
</template>
