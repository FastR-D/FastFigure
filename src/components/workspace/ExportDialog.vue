<script setup lang="ts">
import { computed,ref } from 'vue'
import { Modal, Header, Heading, Text, ModalBody, Footer, Button, Box, Icon } from '../ui'
import IconButton from '../ui/IconButton.vue'
import { useEditor } from '../../composables/useEditor'
import { exportSvg } from '../../core/svg'
import { exportDrawio, downloadFile } from '../../core/export'
import TextCheckReport from '../figure/TextCheckReport.vue'
import {checkFigureText} from '../../core/figureTextCheck'
import PublicationReport from '../figure/PublicationReport.vue'
import {checkPublication} from '../../core/publication'
const props=defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const editor = useEditor()
const textCheck=computed(()=>props.open?checkFigureText(editor.figure.value):null)
const publication=computed(()=>editor.figure.value.publication)
const publicationCheck=computed(()=>props.open&&publication.value?checkPublication(editor.figure.value,publication.value):null)
function configurePublication(){emit('close');editor.publicationOpen.value=true}
function locateText(id:string){editor.select(id);emit('close')}
const error=ref('')
const format = ref<'svg' | 'drawio' | 'json'>('svg')
const formats = [
  { id: 'svg', title: 'SVG 矢量图', note: '保留文字与矢量外观，适合论文排版', ext: '.svg' },
  { id: 'drawio', title: 'draw.io 可编辑图', note: '原生节点与连接；容器皮肤近似映射', ext: '.drawio' },
  { id: 'json', title: 'FastFigure 工程', note: '完整保存结构、参数与样式，便于继续编辑', ext: '.json' },
] as const
function run() {
  error.value=''
  try {
  const doc = editor.figure.value, filename = doc.title.replace(/[\\/:*?"<>|]/g, '_')
  if (format.value === 'svg') downloadFile(`${filename}.svg`, exportSvg(doc), 'image/svg+xml')
  else if (format.value === 'drawio') downloadFile(`${filename}.drawio`, exportDrawio(doc), 'application/xml')
  else downloadFile(`${filename}.fastfigure.json`, JSON.stringify(doc, null, 2), 'application/json')
  editor.notice.value = '图件已导出'; emit('close')
  }catch(e){error.value=e instanceof Error?e.message:'导出失败'}
}
</script>

<template>
  <Modal :open="open" label="导出图件" class="export-dialog" @close="$emit('close')">
    <Header><Box><Heading>导出图件</Heading><Text class="muted-caption">选择适合下一步工作的格式</Text></Box><IconButton icon="close" label="关闭导出" @click="$emit('close')" /></Header>
    <ModalBody>
      <Button v-for="item in formats" :key="item.id" variant="quiet" class="export-format" :aria-pressed="format === item.id" @click="format = item.id">
        <Box class="format-extension">{{ item.ext }}</Box><Box><Text class="selection-title">{{ item.title }}</Text><Text class="muted-caption">{{ item.note }}</Text></Box><Icon v-if="format === item.id" name="check" />
      </Button>
      <Box class="export-note"><Icon name="info" /><Text>SVG 保留视觉与文字，连接语义以工程文件为准。曲线和导入文字在 draw.io 中以独立 SVG 矢量对象保留，控制点请在 FastFigure 编辑。draw.io 暂未在目标编辑器中验收；PPTX 导出尚未接入。</Text></Box>
      <Text v-if="error" class="error-text" role="alert">{{ error }}</Text>
      <Text v-if="editor.blockedRoutes.value.length" class="error-text" role="status">当前有 {{ editor.blockedRoutes.value.length }} 条受阻连线，导出中保留红色虚线标记；可返回画布调整布局或端口。</Text>
      <TextCheckReport v-if="textCheck" :report="textCheck" @locate="locateText" />
      <Button size="sm" @click="configurePublication"><Icon name="ruler" />{{ publication?'调整论文尺寸':'设置论文尺寸' }}</Button>
      <Text v-if="publication" class="muted-caption">SVG 整图宽 {{ publication.widthMm }} mm；{{ publication.showTitle?'显示':'隐藏' }}工程标题。其他导出格式保留各自尺寸规则。</Text>
      <PublicationReport v-if="publicationCheck&&publication" :report="publicationCheck" :settings="publication" @locate="locateText" />
    </ModalBody>
    <Footer><Button @click="$emit('close')">取消</Button><Button variant="primary" @click="run"><Icon name="export" />下载文件</Button></Footer>
  </Modal>
</template>
