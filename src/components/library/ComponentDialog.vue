<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { Box, Button, Disclosure, DisclosureTrigger, Field, Footer, Header, Heading, Modal, ModalBody, Select, Text, TextField } from '@fastrd/ui-vue'
import { ErrorMessage, Icon } from '../ui'
import IconButton from '../ui/IconButton.vue'
import AssetPreview from './AssetPreview.vue'
import { useEditor } from '../../composables/useEditor'
import { instantiateComponent, parseAsset, scaleComponent, type ComponentAsset } from '../../core/assets'
import { clone, rootContainer } from '../../core/model'
import { buildRecipe, componentRecipes,visibleRecipeFields,recipeFieldValue } from '../../data/recipes'
import { directionLabels, namedPorts } from '../../core/componentPorts'
import { downloadFile } from '../../core/export'
import {componentFromSnapshot,type ComponentSnapshot} from '../../core/componentRepository'
import ComponentMetadataRevision from './ComponentMetadataRevision.vue'
import ComponentSourceDetails from './ComponentSourceDetails.vue'

const editor = useEditor(), context = editor.assetDialog
const recipe = computed(() => { const value = context.value; return value?.mode === 'recipe' ? componentRecipes.find(r => r.id === value.recipeId) : undefined })
const draft = shallowRef<ComponentAsset | null>(null), parameters = ref<Record<string, string | number>>({})
const error = ref(''), appearance = ref('keep')
const percent=ref(100),editingInfo=ref(false),openingParent=ref(false)
let parentEpoch=0;onBeforeUnmount(()=>parentEpoch++)
watch(context, value => {
  editingInfo.value=false;openingParent.value=false;parentEpoch++
  error.value = ''; draft.value = null; appearance.value = 'keep';percent.value=100
  if (!value) return
  if(value.mode==='template')percent.value=(value.asset.id.startsWith('paper-')||value.asset.id.startsWith('image-')||value.asset.id.startsWith('gallery-'))?100:150
  if (value.mode === 'recipe') { parameters.value = { ...recipe.value!.defaults }; return }
  try {
    draft.value = clone(value.asset)
  } catch (e) { error.value = e instanceof Error && !('issues' in e) ? e.message : '组件读取失败，请确认容器至少包含一个节点' }
})
const unscaled=computed(()=>{try{return{asset:recipe.value?buildRecipe(recipe.value.id,parameters.value):draft.value,error:''}}catch(error){return{asset:null,error:(error as Error).message}}})
const scaled=computed(()=>{if(unscaled.value.error)return unscaled.value;try{const asset=unscaled.value.asset;return{asset:asset?editingInfo.value?asset:scaleComponent(asset,Number(percent.value)/100):null,error:''}}catch(error){return{asset:null,error:(error as Error).message}}})
const preview = computed(() => scaled.value.asset??unscaled.value.asset)
const insertionProblem = computed(() => {
  if (!scaled.value.asset) return ''
  try { instantiateComponent(editor.figure.value, scaled.value.asset, editor.currentContainer.value.id, appearance.value === 'keep'); return '' }
  catch (e) { return e instanceof Error && !('issues' in e) ? e.message : '当前容器层级或尺寸不允许插入，请选择较浅的父容器。' }
})
function close() { context.value = null }
function metadataSaved(asset:ComponentAsset,record:ComponentSnapshot){context.value={mode:'repository',asset,record};editingInfo.value=false}
async function changeArchive(){
  const active=context.value
  if(active?.mode!=='repository'||editor.repository.publishing.value)return
  error.value=''
  try{
    const result=await editor.repository.setState(active.record.id,!active.record.archivedAt)
    if(context.value===active)active.record=result.record
    editor.notice.value=result.record.archivedAt?'快照已归档，图件和工作副本保留':'快照已恢复，可参与本机库自动召回'
  }catch(e){if(context.value===active)error.value=(e as Error).message}
}
async function openParent(id:string){
  if(openingParent.value||editingInfo.value||editor.repository.publishing.value||!/^snapshot-[a-f0-9]{64}$/.test(id))return
  const request=++parentEpoch;openingParent.value=true;error.value=''
  try{const snapshotId=id.slice(9),{asset,record}=await editor.repository.read(snapshotId);if(request===parentEpoch)context.value={mode:'repository',asset,record}}
  catch(e){if(request===parentEpoch)error.value=e instanceof Error?e.message:'本机来源快照不可用，来源记录仍保留'}finally{if(request===parentEpoch)openingParent.value=false}
}
function configuredAsset(): ComponentAsset {
  if(!scaled.value.asset)throw new Error(scaled.value.error||'请选择有效的组件')
  const asset = clone(scaled.value.asset)
  return context.value?.mode==='repository'?componentFromSnapshot(asset,context.value.record.id):parseAsset(asset)
}
function insert(newCanvas = false) {
  try {
    if (editor.insertComponent(configuredAsset(), appearance.value === 'keep', newCanvas)) close()
    else error.value = editor.notice.value
  } catch { error.value = '组件内容无效，请检查参数。' }
}
function backup() {
  try { const asset = context.value?.mode==='repository'?parseAsset(context.value.asset):configuredAsset(); downloadFile(`${asset.name}.fastfigure-component.json`, JSON.stringify(asset, null, 2), 'application/json') }
  catch { error.value = '请填写有效的组件名称和标签后再导出。' }
}
</script>

<template>
  <Modal :open="!!context" size="lg" :label="context?.mode === 'recipe' ? '配置组合组件' : '组件详情'" class="component-dialog" @close="close">
    <Header><Heading>{{ preview?.name ?? '组件' }}<Text v-if="context?.mode==='repository'&&context.record.archivedAt" class="repository-archive-badge">已归档</Text></Heading><IconButton icon="close" label="关闭组件弹窗" @click="close" /></Header>
    <ModalBody>
      <Box v-if="preview" class="component-dialog-grid">
        <Box class="component-preview-pane"><AssetPreview :asset="preview" /><Box class="asset-stats"><Text>{{ preview.figure.nodes.length }} 个节点</Text><Text>{{ preview.figure.edges.length }} 条连接</Text><Text>{{ rootContainer(preview.figure).width }} × {{ rootContainer(preview.figure).height }}</Text></Box></Box>
        <Box class="component-settings">
          <ComponentMetadataRevision v-if="editingInfo&&context?.mode==='repository'" :asset="context.asset" :snapshot-id="context.record.id" @saved="metadataSaved" @cancel="editingInfo=false" />
          <template v-else-if="recipe">
            <Text class="panel-description">{{ recipe.description }}</Text>
            <Field v-for="field in visibleRecipeFields(recipe,parameters)" :key="field.key"><Text>{{ field.label }}</Text><Select :value="String(recipeFieldValue(field,parameters))" :options="field.options" :aria-label="field.label" @change="parameters[field.key] = $event" /></Field>
          </template>
          <template v-else><Text class="panel-description">{{ preview.description || '保存自画布的可编辑组件。' }}</Text><Box class="asset-tags"><Text v-for="tag in preview.tags" :key="tag">{{ tag }}</Text></Box></template>
          <Field v-if="!editingInfo"><Text>插入时的容器样式</Text><Select :value="appearance" :options="[{value:'keep',label:'保留皮肤和配色'}, {value:'inherit',label:'继承目标容器样式'}]" aria-label="组件插入样式" @change="appearance = $event" /></Field>
          <Field v-if="context&&!editingInfo"><Text>组件缩放（%，含字号与描边）</Text><TextField v-model.number="percent" type="number" min="10" max="400" step="5" aria-label="组件插入缩放百分比" /></Field>
          <ErrorMessage v-if="scaled.error" class="error-text" :message="scaled.error" />
          <Text v-if="scaled.error&&preview" class="muted-caption">当前显示原尺寸预览；调整缩放比例后可插入或导出配置。</Text>
          <Box v-if="preview && (preview.sources.length || preview.lineage.length)" class="asset-provenance"><Heading>参考与派生来源</Heading><ComponentSourceDetails v-for="(source,i) in preview.sources" :key="i" :source="source" /><Text v-if="preview.lineage.length" class="muted-caption">派生自：{{ preview.lineage.map(a => a.name).join(' → ') }}</Text></Box>
          <Disclosure v-if="preview?.lineage.length"><DisclosureTrigger size="xs">派生详情 · {{ preview.lineage.length }} 项</DisclosureTrigger><Box v-for="(origin,index) in preview.lineage" :key="index" class="component-origin-detail"><Text>{{ origin.name }} · {{ origin.revision }}</Text><Text class="repository-directory">{{ origin.assetId }}</Text><Button v-if="/^snapshot-[a-f0-9]{64}$/.test(origin.assetId)" size="xs" variant="quiet" :aria-label="`查看本机来源 ${origin.assetId.slice(9)}`" :disabled="editingInfo||openingParent||editor.repository.publishing.value" @click="openParent(origin.assetId)">打开本机来源快照</Button></Box><Text class="muted-caption">便携来源不一定保存在当前本机库；输入组件指纹以 source- 开头，不表示已有本机快照。</Text></Disclosure>
          <Text v-if="preview && !editingInfo" class="panel-description">插入到「{{ editor.currentContainer.value.title }}」。新建图件并插入会替换当前画布，可通过撤销恢复。</Text>
          <Text v-if="insertionProblem && !editingInfo" class="placement-message">{{ insertionProblem }}</Text>
          <ErrorMessage v-if="error" class="error-text" :message="error" />
          <Box v-if="context?.mode==='repository'&&context.record.archivedAt" class="repository-state"><Text class="selection-title">已归档 · {{ new Date(context.record.archivedAt).toLocaleString() }}</Text><Text>不参与本机库自动召回；已有图件、工作副本和冻结任务保持。仍可导出、追溯或明确取用。</Text></Box>
          <Text v-if="context?.mode==='repository'" class="repository-directory">本机快照 SHA-256 · {{ context.record.id }}</Text>
          <Box v-if="preview && namedPorts(preview.figure,'stage').length" class="component-port-summary"><Text class="selection-title">可用接口</Text><Text v-for="port in namedPorts(preview.figure,'stage')" :key="port.id">{{ directionLabels[port.socket!.direction] }} · {{ port.label }} · {{ port.socket!.key }}</Text></Box>
        </Box>
      </Box>
    </ModalBody>
    <Footer v-if="!editingInfo">
      <Button v-if="context?.mode==='repository'" :disabled="editor.repository.publishing.value" @click="editingInfo=true">整理检索信息</Button>
      <Button v-if="context?.mode==='repository'" :disabled="editor.repository.publishing.value||openingParent" @click="changeArchive">{{ editor.repository.changingState.value?'正在更新状态…':context.record.archivedAt?'恢复快照':'归档快照' }}</Button>
      <Button v-if="preview" class="component-backup" :disabled="context?.mode!=='repository'&&!scaled.asset" @click="backup"><Icon name="export" />{{ context?.mode==='repository'?'导出原快照':'导出组件' }}</Button>
      <Button :disabled="!scaled.asset" @click="insert(true)">新建图件并插入</Button><Button variant="primary" :disabled="!scaled.asset || !!insertionProblem" @click="insert()"><Icon name="plus" />插入当前容器</Button>
    </Footer>
  </Modal>
</template>
