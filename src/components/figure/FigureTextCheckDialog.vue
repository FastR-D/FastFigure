<script setup lang="ts">
import {computed,ref} from 'vue'
import {Box,Button,Footer,Header,Heading,Modal,ModalBody,Text} from '@fastrd/ui-vue'
import IconButton from '../ui/IconButton.vue'
import {useEditor} from '../../composables/useEditor'
import {checkFigureText} from '../../core/figureTextCheck'
import FigureRenderer from './FigureRenderer'
import TextCheckReport from './TextCheckReport.vue'
const props=defineProps<{open:boolean}>(),emit=defineEmits<{close:[]}>(),editor=useEditor(),highlighted=ref('')
const report=computed(()=>props.open?checkFigureText(editor.figure.value):null)
function locate(id:string){highlighted.value=id;editor.select(id);emit('close')}
</script>
<template>
  <Modal :open="open" label="当前图件文字检查" size="lg" class="text-check-dialog" @close="emit('close')">
    <Header><Box><Heading>文字检查</Heading><Text class="muted-caption">核对标签、注释和结构标签的原生排版。</Text></Box><IconButton icon="close" label="关闭文字检查" @click="emit('close')" /></Header>
    <ModalBody><Box class="text-check-preview"><FigureRenderer :figure="editor.figure.value" :highlighted-id="highlighted" /></Box><TextCheckReport v-if="report" :report="report" expanded @locate="locate" /></ModalBody>
    <Footer><Button @click="emit('close')">关闭</Button></Footer>
  </Modal>
</template>
