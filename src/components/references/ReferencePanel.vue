<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ErrorMessage, Box, Button, Disclosure, DisclosureTrigger, Field, Heading, Icon, Select, Text, TextArea, TextField } from '../ui'
import { useEditor } from '../../composables/useEditor'
import { findObject } from '../../core/geometry'
import { readReferenceImage,readImageDraftBundle, resizeReference, wholeImage } from '../../core/references'
import type { EvidenceRegion } from '../../core/model'
import ReferencePreview from './ReferencePreview'
import OriginalImageCache from './OriginalImageCache.vue'
import ImageDraftPanel from './ImageDraftPanel.vue'
import ImageDraftOriginView from './ImageDraftOriginView.vue'

const editor = useEditor(), image = editor.activeReference
const busy = ref(false), error = ref(''), region = editor.evidenceRegion
const mode=ref<'import'|'draft'>('import')
watch(editor.imageDraftPlan,plan=>{if(plan)mode.value='draft'},{immediate:true})
const generatedOrigin=computed(()=>editor.figure.value.imageDrafts?.find(d=>d.runId===image.value?.generated?.runId))
const destination=ref<'new'|'current'>('new')
const cacheRevision=ref(0)
function reconstruct(crop=false){if(!image.value)return;editor.requestReconstruction({kind:'reconstruct',referenceId:image.value.id,region:crop?{...region.value}:{...wholeImage},destination:destination.value,parentId:editor.currentContainer.value.id},crop?'对照选定区域，重建其中的结构、文字和连线，保留可编辑的独立图元；说明无法识别的细节。':'对照整张参考图，先识别语义分区，再重建结构、文字、图示和连线；说明无法识别的细节。')}
const object = computed(() => editor.selectedIds.value.length === 1 ? findObject(editor.figure.value, editor.selectedId.value) : undefined)
const linked = computed(() => !!image.value && object.value?.evidence?.image?.sha256 === image.value.sha256)
watch(() => image.value?.id, () => { error.value = '' })
async function importImage(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  if (!file || busy.value) return
  busy.value = true; error.value = ''
  // A file decoded for one project must not land in another project after a concurrent import/new action.
  const document = editor.figure.value
  try {
    const reference = await readReferenceImage(file, editor.currentContainer.value)
    if (editor.figure.value !== document) throw new Error('画布已变化，请重新导入参考图')
    if (!editor.addReference(reference)) throw new Error(editor.notice.value)
  } catch (e) { error.value = e instanceof Error && !('issues' in e) ? e.message : '参考图导入失败，当前工程未改变' }
  finally { busy.value = false; input.value = '';cacheRevision.value++ }
}
async function importBundle(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file||busy.value)return;busy.value=true;error.value='';const baseline=editor.figure.value
  try{const result=await readImageDraftBundle(file,editor.currentContainer.value);if(editor.figure.value!==baseline)throw new Error('画布已变化，请重新导入草稿包');if(!editor.addDraftReference(result.reference,result.origin))throw new Error(editor.notice.value)}catch(e){error.value=e instanceof Error&&!('issues'in e)?e.message:'草稿包格式或来源无效'}finally{busy.value=false;input.value='';cacheRevision.value++}}
function textChange(field: 'title' | 'citation', event: Event) {
  const input = event.target as HTMLInputElement
  if (!image.value) return
  if (field === 'title' && !input.value.trim()) { input.value = image.value.title; return }
  editor.editReference(image.value.id, { [field]: input.value.trim() })
}
function placementChange(field: 'x' | 'y' | 'width', event: Event) {
  const input = event.target as HTMLInputElement, value = Number(input.value)
  if (!image.value || !Number.isFinite(value)) return
  const placement = field === 'width' ? resizeReference(image.value, value) : { ...image.value.placement, [field]: Math.max(-2000, Math.min(2000, value)) }
  editor.editReference(image.value.id, { placement }); input.value = String(Math.round(image.value.placement[field]))
}
function bind() { if (!editor.bindEvidence(region.value)) error.value = editor.notice.value }
function regionChange(field: keyof EvidenceRegion, event: Event) {
  const input = event.target as HTMLInputElement, value = Number(input.value) / 100
  if (!Number.isFinite(value)) return
  const next = { ...region.value }
  if (field === 'x' || field === 'y') next[field] = Math.max(0, Math.min(0.99, value))
  else next[field] = Math.max(0.01, Math.min(1, value))
  next.width = Math.min(next.width, 1 - next.x); next.height = Math.min(next.height, 1 - next.y)
  region.value = next; input.value = String(Math.round(next[field] * 10000) / 100)
}
</script>

<template>
  <Box class="library-body reference-panel">
    <Box class="library-tabs"><Button size="xs" :aria-pressed="mode==='import'" @click="mode='import'">导入与重绘</Button><Button size="xs" :aria-pressed="mode==='draft'" @click="mode='draft'">AI 图像草稿</Button></Box>
    <ImageDraftPanel v-if="mode==='draft'" />
    <template v-else>
    <Text class="panel-description">导入论文插图，手工对照绘制，或交给助手重建。</Text>
    <Field><Text>{{ busy ? '正在处理图片…' : '添加参考图' }}</Text><TextField type="file" accept="image/png,image/jpeg,image/webp" :disabled="busy" aria-label="导入参考图" @change="importImage" /></Field>
    <Text class="muted-caption">PNG / JPEG / WebP，原图 ≤ 12 MB。每个工程最多 3 张，图片随工程 JSON 备份。</Text>
    <Disclosure><DisclosureTrigger size="xs">导入已保存的 AI 草稿包</DisclosureTrigger><TextField type="file" accept=".json,application/json" :disabled="busy" aria-label="导入 AI 草稿包" @change="importBundle" /><Text class="muted-caption">fastfigure.image-draft，包含原图及生成规格，≤ 17 MB。</Text></Disclosure>
    <ErrorMessage v-if="error" class="error-text" :message="error" />
    <template v-if="image">
      <OriginalImageCache :key="image.sha256+cacheRevision" :image="image" />
      <Text v-if="image.generated" class="muted-caption">AI 视觉设计草稿，请按原始内容规格核对后重建。</Text><ImageDraftOriginView v-if="generatedOrigin" :origin="generatedOrigin" />
      <Box class="reconstruction-reference-actions"><Heading>结构重建</Heading><Select :value="destination" :options="[{value:'new',label:'生成新图件候选'},{value:'current',label:'插入当前容器候选'}]" aria-label="重建结果位置" @change="destination=$event as 'new'|'current'" /><Button @click="reconstruct()">重建整张参考图</Button><Button @click="reconstruct(true)">重建框选区域</Button><Text class="muted-caption">在助手中发送要求，生成后先审阅再应用。复杂图建议框选一个子图。</Text></Box>
      <Select :value="image.id" :options="editor.figure.value.references.map(r => ({value:r.id,label:r.title}))" aria-label="当前参考图" @change="editor.referenceId.value = $event" />
      <Field><Text>显示方式</Text><Select :value="editor.referenceMode.value" :options="[{value:'side',label:'并排对照'}, {value:'overlay',label:'透明叠加'}, {value:'hidden',label:'隐藏参考图'}]" aria-label="参考图显示方式" @change="editor.referenceMode.value = $event as 'side' | 'overlay' | 'hidden'" /></Field>
      <Field v-if="editor.referenceMode.value === 'overlay'"><Box class="field-heading"><Text>参考图透明度</Text><Text>{{ Math.round(editor.referenceOpacity.value * 100) }}%</Text></Box><TextField v-model.number="editor.referenceOpacity.value" type="range" min="0.05" max="0.85" step="0.05" aria-label="参考图透明度" /></Field>
      <Box v-if="editor.referenceMode.value === 'overlay'" class="reference-placement">
        <Box class="position-grid"><Field><Text>X</Text><TextField type="number" :value="Math.round(image.placement.x)" aria-label="参考图 X 位置" @change="placementChange('x', $event)" /></Field><Field><Text>Y</Text><TextField type="number" :value="Math.round(image.placement.y)" aria-label="参考图 Y 位置" @change="placementChange('y', $event)" /></Field></Box>
        <Field><Text>宽度（等比缩放）</Text><TextField type="number" min="1" max="2000" :value="Math.round(image.placement.width)" aria-label="参考图宽度" @change="placementChange('width', $event)" /></Field>
        <Button @click="editor.fitActiveReference"><Icon name="fit" />适配当前容器</Button>
      </Box>
      <Field><Text>来源名称</Text><TextField :key="image.id + '-title'" :value="image.title" maxlength="100" aria-label="参考图来源名称" @change="textChange('title', $event)" /></Field>
      <Field><Text>链接 / 图号 / 页码</Text><TextArea :key="image.id + '-citation'" :value="image.citation" maxlength="500" rows="3" aria-label="参考图引用" placeholder="论文链接，Fig. 3 (a)" @change="textChange('citation', $event)" /></Field>
      <Box class="reference-evidence">
        <Heading>原图区域</Heading><Text class="muted-caption">拖动框选，或选择整图，再关联一个重绘对象。</Text>
        <ReferencePreview :key="image.id" :image="image" :region="region" editable @region="region = $event" />
        <Text class="muted-caption">区域：{{ Math.round(region.x * 100) }}%, {{ Math.round(region.y * 100) }}% · {{ Math.round(region.width * 100) }}% × {{ Math.round(region.height * 100) }}%</Text>
        <Disclosure><DisclosureTrigger size="xs">精确设置区域（%）</DisclosureTrigger><Box class="position-grid"><Field v-for="(label, key) in {x:'X',y:'Y',width:'宽度',height:'高度'}" :key="key"><Text>{{ label }}</Text><TextField type="number" min="0" max="100" step="0.1" :value="Math.round(region[key] * 10000) / 100" :aria-label="`来源区域${label}百分比`" @change="regionChange(key, $event)" /></Field></Box></Disclosure>
        <Button variant="quiet" size="xs" @click="region = { ...wholeImage }">使用整张图片</Button>
        <Text class="reference-selected">{{ object ? `关联对象：${'label' in object ? object.label : object.title}` : '先在画布选择一个节点或容器' }}</Text>
        <Button :disabled="!object" variant="primary" @click="bind"><Icon name="connect" />{{ linked ? '更新对象来源区域' : '关联到当前对象' }}</Button>
        <Button v-if="linked" variant="quiet" @click="editor.clearEvidence">解除对象来源关联</Button>
      </Box>
      <Box class="library-tip"><Icon name="info" /><Text>原图用于重建与核对，来源和区域随图元入库；SVG 和 draw.io 仅导出重绘结果。</Text></Box>
      <Button variant="danger" @click="editor.removeReference(image.id)"><Icon name="trash" />移除当前参考图</Button>
    </template>
    <Box v-else class="empty-state"><Icon name="image" /><Text>先导入一张图，再从组件库搭建可编辑结构。</Text></Box>
    </template>
  </Box>
</template>
