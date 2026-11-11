<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Box, Button, Disclosure, DisclosureTrigger, Field, Footer, Header, Heading, Modal, ModalBody, Select, Text, TextField } from '@fastrd/ui-vue'
import { Icon } from '../ui'
import IconButton from '../ui/IconButton.vue'
import FigureRenderer from '../figure/FigureRenderer'
import { useEditor } from '../../composables/useEditor'
import { defaultLayoutOptions, layoutContainer, type LayoutOptions } from '../../core/layout'
import { ancestors } from '../../core/geometry'
import { routeFigure } from '../../core/routing'

const editor = useEditor(), containerId = ref('stage'), options = ref<LayoutOptions>({ ...defaultLayoutOptions })
watch(editor.layoutDialogOpen, open => { if (open) { containerId.value = editor.currentContainer.value.id; options.value = { ...defaultLayoutOptions } } })
const containers = computed(() => editor.figure.value.containers.map(c => ({ value: c.id, label: `${'· '.repeat(ancestors(editor.figure.value, c.id).length)}${c.title}` })))
const preview = computed(() => {
  try { return { result: layoutContainer(editor.figure.value, containerId.value, options.value), error: '' } }
  catch (e) { return { result: null, error: e instanceof Error ? e.message : '无法生成布局' } }
})
const previewRoutes = computed(() => preview.value.result ? routeFigure(preview.value.result.document) : undefined)
const blocked = computed(() => [...previewRoutes.value?.values() ?? []].filter(r => r.status === 'blocked').length)
const viewport = computed(() => {
  const container = (preview.value.result?.document ?? editor.figure.value).containers.find(c => c.id === containerId.value)!
  return { x: container.x - 20, y: container.y - 20, width: container.width + 40, height: container.height + 40 }
})
function apply() { if (editor.applyLayout(containerId.value, options.value)) { editor.layoutDialogOpen.value = false } }
function setScope(value: string) { options.value.recursive = value === 'subtree'; if (!options.value.recursive) options.value.fitContainers = false }
const summary = computed(() => {
  const result = preview.value.result
  if (!result) return '当前图件 · 尚未应用布局'
  const gap = result.gap === result.maxGap ? String(result.gap) : `${result.gap}–${result.maxGap}`
  return `${result.count} 个对象 · ${result.levels.length} 个容器 · 实际间距 ${gap}`
})
</script>

<template>
  <Modal :open="editor.layoutDialogOpen.value" label="自动布局" size="lg" class="layout-dialog" @close="editor.layoutDialogOpen.value = false">
    <Header><Box><Heading>自动布局</Heading><Text class="muted-caption">按连接排列对象，可递归整理嵌套子图。</Text></Box><IconButton icon="close" label="关闭自动布局" @click="editor.layoutDialogOpen.value = false" /></Header>
    <ModalBody>
      <Box class="layout-dialog-grid">
        <Box class="layout-preview"><FigureRenderer :figure="preview.result?.document ?? editor.figure.value" :routes="previewRoutes" :viewport="viewport" :show-document-title="false" /><Text>{{ summary }}</Text></Box>
        <Box class="component-settings">
          <Field><Text>目标容器</Text><Select :value="containerId" :options="containers" aria-label="布局目标容器" @change="containerId = $event" /></Field>
          <Field><Text>处理范围</Text><Select :value="options.recursive ? 'subtree' : 'children'" :options="[{value:'children',label:'仅排列当前层'}, {value:'subtree',label:'递归整理子图'}]" aria-label="布局处理范围" @change="setScope" /></Field>
          <Field><Text>布局方式</Text><Select :value="options.mode" :options="[{value:'flow',label:'按连接关系分层'}, {value:'grid',label:'子图 / 对象网格'}]" aria-label="布局方式" @change="options.mode = $event as LayoutOptions['mode']" /></Field>
          <Field v-if="options.mode === 'flow'"><Text>方向</Text><Select :value="options.direction" :options="[{value:'right',label:'从左到右'}, {value:'down',label:'从上到下'}]" aria-label="自动布局方向" @change="options.direction = $event as LayoutOptions['direction']" /></Field>
          <Field v-else><Text>网格列数</Text><Select :value="String(options.columns)" :options="Array.from({length:10},(_,i) => ({value:String(i+1),label:String(i+1)}))" aria-label="布局网格列数" @change="options.columns = Number($event)" /></Field>
          <Field><Text>对象间距</Text><Select :value="String(options.gap)" :options="[16,24,32,48,64,80].map(n => ({value:String(n),label:String(n)}))" aria-label="布局间距" @change="options.gap = Number($event)" /></Field>
          <Field class="checkbox-field"><TextField v-model="options.fitContainers" :disabled="!options.recursive" type="checkbox" aria-label="按内容适配子容器尺寸" /><Text>按内容适配子容器尺寸</Text></Field>
          <Field class="checkbox-field"><TextField v-model="options.adjustPorts" type="checkbox" aria-label="布局时调整端口" /><Text>同步调整跨对象连接端口</Text></Field>
          <Text class="muted-caption">递归模式先整理内部，再排列外层。目标容器范围固定；可按内容缩放其非空子容器，保留节点尺寸、层级、标签与来源。间距最小 16，放不下时整轮不应用。</Text>
        </Box>
      </Box>
      <Disclosure v-if="preview.result?.resized.length" class="layout-resize-report"><DisclosureTrigger size="xs">子容器尺寸变化 · {{ preview.result.resized.length }} 项</DisclosureTrigger><Box v-for="item in preview.result.resized" :key="item.id"><Text>{{ item.title }}</Text><Text>{{ item.before.width }} × {{ item.before.height }} → {{ item.after.width }} × {{ item.after.height }}</Text></Box></Disclosure>
      <Text v-if="preview.error" class="error-text" role="alert">{{ preview.error }}</Text>
      <Text v-else-if="blocked" class="placement-message" role="status">预览中有 {{ blocked }} 条连线仍受阻，可调整方向、间距，或应用后手动修改端口。</Text>
    </ModalBody>
    <Footer><Text class="muted-caption">应用后可单步撤销</Text><Button @click="editor.layoutDialogOpen.value = false">取消</Button><Button variant="primary" :disabled="!preview.result" @click="apply"><Icon name="check" />应用布局</Button></Footer>
  </Modal>
</template>
