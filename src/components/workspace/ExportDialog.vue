<script setup lang="ts">
import { computed,ref } from 'vue'
import { Modal, Header, Heading, Text, ModalBody, Footer, Button, Box } from '@fastrd/ui-vue'
import { Icon } from '../ui'
import IconButton from '../ui/IconButton.vue'
import { useEditor } from '../../composables/useEditor'
import { exportSvg } from '../../core/svg'
import { downloadFile, exportPng, pngSize } from '../../core/export'
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
let requestId=0
function close(){requestId++;emit('close')}
function configurePublication(){close();editor.publicationOpen.value=true}
function locateText(id:string){editor.select(id);close()}
const error=ref('')
const exporting=ref(false)
const pngDimensions=computed(()=>pngSize(editor.figure.value))
const format = ref<'svg' | 'png' | 'json'>('svg')
const formats = [
  { id: 'svg', title: 'SVG 矢量图', note: '保留文字与矢量外观，适合论文排版', ext: '.svg' },
  { id: 'png', title: 'PNG 图片', note: '白底高清图片，按出图区域以 2 倍分辨率导出', ext: '.png' },
  { id: 'json', title: 'FastFigure 工程', note: '完整保存结构、参数与样式，便于继续编辑', ext: '.json' },
] as const
async function run() {
  if(exporting.value)return
  const request=++requestId
  error.value=''
  exporting.value=true
  try {
  const doc = editor.figure.value, filename = doc.title.replace(/[\\/:*?"<>|]/g, '_')
  if (format.value === 'svg') downloadFile(`${filename}.svg`, exportSvg(doc), 'image/svg+xml')
  else if (format.value === 'png') {
    const png=await exportPng(doc)
    if(request!==requestId)return
    downloadFile(`${filename}.png`, png, 'image/png')
  }
  else downloadFile(`${filename}.fastfigure.json`, JSON.stringify(doc, null, 2), 'application/json')
  editor.notice.value = '图件已导出'; close()
  }catch(e){if(request===requestId)error.value=e instanceof Error?e.message:'导出失败'}finally{exporting.value=false}
}
</script>

<template>
  <Modal :open="open" label="导出图件" class="export-dialog" @close="close">
    <Header><Box><Heading>导出图件</Heading><Text class="muted-caption">选择适合下一步工作的格式</Text></Box><IconButton icon="close" label="关闭导出" @click="close" /></Header>
    <ModalBody>
      <Button v-for="item in formats" :key="item.id" variant="quiet" class="export-format" :disabled="exporting" :aria-pressed="format === item.id" @click="format = item.id">
        <Box class="format-extension">{{ item.ext }}</Box><Box><Text class="selection-title">{{ item.title }}</Text><Text class="muted-caption">{{ item.note }}</Text></Box><Icon v-if="format === item.id" name="check" />
      </Button>
      <Box class="export-note"><Icon name="info" /><Text>SVG 保留文字与矢量外观；PNG 便于直接使用图片；工程 JSON 完整保存结构、参数与样式，便于继续编辑。</Text></Box>
      <Text v-if="format==='png'" class="muted-caption">PNG 尺寸 {{ pngDimensions.width }} × {{ pngDimensions.height }} 像素，沿用当前出图区域和工程标题设置。</Text>
      <Text v-if="error" class="error-text" role="alert">{{ error }}</Text>
      <Text v-if="editor.blockedRoutes.value.length" class="error-text" role="status">当前有 {{ editor.blockedRoutes.value.length }} 条受阻连线，导出中保留红色虚线标记；可返回画布调整布局或端口。</Text>
      <TextCheckReport v-if="textCheck" :report="textCheck" @locate="locateText" />
      <Button size="sm" :disabled="exporting" @click="configurePublication"><Icon name="ruler" />{{ publication?'调整论文尺寸':'设置论文尺寸' }}</Button>
      <Text v-if="publication" class="muted-caption">SVG 整图宽 {{ publication.widthMm }} mm；{{ publication.showTitle?'显示':'隐藏' }}工程标题。工程 JSON 保留论文尺寸设置。</Text>
      <PublicationReport v-if="publicationCheck&&publication" :report="publicationCheck" :settings="publication" @locate="locateText" />
    </ModalBody>
    <Footer><Button @click="close">取消</Button><Button variant="primary" :disabled="exporting" @click="run"><Icon name="export" />{{ exporting?'正在导出…':'下载文件' }}</Button></Footer>
  </Modal>
</template>
