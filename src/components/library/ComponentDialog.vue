<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { Box, Button, Disclosure, DisclosureTrigger, Field, Footer, Header, Heading, Modal, ModalBody, Select, Text, TextArea, TextField, Icon } from '../ui'
import IconButton from '../ui/IconButton.vue'
import AssetPreview from './AssetPreview.vue'
import { useEditor } from '../../composables/useEditor'
import { captureComponent, instantiateComponent, parseAsset, scaleComponent, type ComponentAsset } from '../../core/assets'
import { clone, rootContainer } from '../../core/model'
import { buildRecipe, componentRecipes,visibleRecipeFields,recipeFieldValue } from '../../data/recipes'
import { directionLabels, namedPorts } from '../../core/componentPorts'
import { downloadFile } from '../../core/export'
import {componentFromSnapshot,componentSnapshotJson,type ComponentSnapshot} from '../../core/componentRepository'
import ComponentMetadataRevision from './ComponentMetadataRevision.vue'
import ComponentSourceDetails from './ComponentSourceDetails.vue'

const editor = useEditor(), context = editor.assetDialog
const recipe = computed(() => { const value = context.value; return value?.mode === 'recipe' ? componentRecipes.find(r => r.id === value.recipeId) : undefined })
const draft = shallowRef<ComponentAsset | null>(null), parameters = ref<Record<string, string | number>>({})
const name = ref(''), description = ref(''), tags = ref(''), error = ref(''), appearance = ref('keep')
const sourceName = ref(''), sourceReference = ref('')
const percent=ref(100),editingInfo=ref(false),openingParent=ref(false)
let parentEpoch=0;onBeforeUnmount(()=>parentEpoch++)
watch(context, value => {
  editingInfo.value=false;openingParent.value=false;parentEpoch++
  error.value = ''; draft.value = null; appearance.value = 'keep'; sourceName.value = ''; sourceReference.value = '';percent.value=100
  if (!value) return
  if(value.mode==='template')percent.value=150
  if (value.mode === 'recipe') { parameters.value = { ...recipe.value!.defaults }; return }
  try {
    draft.value = value.mode === 'capture'
      ? captureComponent(editor.figure.value, value.containerId, editor.figure.value.containers.find(c => c.id === value.containerId)!.title)
      : value.mode==='template'||value.mode==='repository'?clone(value.asset):clone(editor.library.assets.value.find(a => a.id === value.assetId)!)
    name.value = draft.value.name; description.value = draft.value.description; tags.value = draft.value.tags.join(', ')
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
  if (context.value?.mode === 'capture') {
    asset.name = name.value.trim(); asset.figure.title = asset.name; rootContainer(asset.figure).title = asset.name
    asset.description = description.value.trim(); asset.tags = tags.value.split(/[,，]/).map(t => t.trim()).filter(Boolean)
    if (!!sourceName.value.trim() !== !!sourceReference.value.trim()) throw new Error('补充来源请同时填写名称和引用位置')
    if (sourceName.value.trim()) {
      const source = { title: sourceName.value.trim(), reference: sourceReference.value.trim() }
      if (!asset.sources.some(s => s.title === source.title && s.reference === source.reference)) asset.sources.push(source)
    }
    asset.updatedAt = new Date().toISOString()
  }
  return context.value?.mode==='repository'?componentFromSnapshot(asset,context.value.record.id):parseAsset(asset)
}
function save() {
  try {
    const input=configuredAsset(),asset = context.value?.mode==='repository'?editor.library.importFile(JSON.stringify(input)):editor.library.save(input)
    editor.libraryTab.value = 'mine'; editor.activePanel.value = 'components'
    editor.notice.value = `已保存${asset.name}到我的组件`; close()
  } catch (e) { error.value = e instanceof Error && !('issues' in e) ? e.message : '请填写组件名称；标签最多 12 个，每个不超过 30 字。' }
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
function remove() {
  try { editor.library.remove(context.value?.mode === 'asset' ? context.value.assetId : ''); editor.notice.value = '已移除组件，可在我的组件面板中恢复'; close() }
  catch (e) { error.value = (e as Error).message }
}
async function publish(){
  const active=context.value
  try{const asset=clone(configuredAsset()),result=await editor.repository.publish(asset);editor.notice.value=result.record.archivedAt?'本机库已有相同快照且已归档，未自动恢复':result.duplicate?'本机素材库已有相同快照，未重复保存':`已将「${asset.name}」保存到本机素材库`;if(context.value===active){editor.libraryTab.value='repository';editor.activePanel.value='components';close()}}
  catch(e){if(context.value===active)error.value=e instanceof Error&&!('issues'in e)?e.message:'组件快照无效，未保存到本机素材库'}
}
function useForAssistant(){
  try{const input=configuredAsset(),existing=editor.library.assets.value.find(a=>a.id===input.id),asset=existing&&componentSnapshotJson(existing)===componentSnapshotJson(input)?existing:editor.library.importFile(JSON.stringify(input));close();editor.libraryTab.value='mine';editor.assistantAssetId.value=asset.id;editor.useMaterialPrompt(`复用已取回的组件「${asset.name}」。保留其可编辑结构、命名接口和来源，按我的后续要求组合，不推断未提供的实验值。`)}catch(e){error.value=(e as Error).message}
}
</script>

<template>
  <Modal :open="!!context" size="lg" :label="context?.mode === 'capture' ? '保存组件' : context?.mode === 'recipe' ? '配置组合组件' : '组件详情'" class="component-dialog" @close="close">
    <Header><Box><Heading>{{ context?.mode === 'capture' ? '存为我的组件' : preview?.name ?? '组件' }}<Text v-if="context?.mode==='repository'&&context.record.archivedAt" class="repository-archive-badge">已归档</Text></Heading><Text class="muted-caption">{{ context?.mode === 'capture' ? '保存选中容器及内部对象，外部连接保留在原图。' : context?.mode === 'recipe' ? '修改参数后预览，插入后可在属性栏调整组合参数，也可独立编辑各节点。' : '完整保留节点、容器层级、连接和来源。' }}</Text></Box><IconButton icon="close" label="关闭组件弹窗" @click="close" /></Header>
    <ModalBody>
      <Box v-if="preview" class="component-dialog-grid">
        <Box class="component-preview-pane"><AssetPreview :asset="preview" /><Box class="asset-stats"><Text>{{ preview.figure.nodes.length }} 个节点</Text><Text>{{ preview.figure.edges.length }} 条连接</Text><Text>{{ rootContainer(preview.figure).width }} × {{ rootContainer(preview.figure).height }}</Text></Box></Box>
        <Box class="component-settings">
          <ComponentMetadataRevision v-if="editingInfo&&context?.mode==='repository'" :asset="context.asset" :snapshot-id="context.record.id" @saved="metadataSaved" @cancel="editingInfo=false" />
          <template v-else-if="recipe">
            <Text class="panel-description">{{ recipe.description }}</Text>
            <Field v-for="field in visibleRecipeFields(recipe,parameters)" :key="field.key"><Text>{{ field.label }}</Text><Select :value="String(recipeFieldValue(field,parameters))" :options="field.options" :aria-label="field.label" @change="parameters[field.key] = $event" /></Field>
          </template>
          <template v-else-if="context?.mode === 'capture'">
            <Field><Text>组件名称</Text><TextField v-model="name" maxlength="100" aria-label="组件名称" /></Field>
            <Field><Text>说明</Text><TextArea v-model="description" maxlength="300" rows="3" aria-label="组件说明" /></Field>
            <Field><Text>标签（逗号分隔）</Text><TextField v-model="tags" aria-label="组件标签" placeholder="CNN, 特征融合" /></Field>
            <Field><Text>补充来源名称（可选）</Text><TextField v-model="sourceName" maxlength="100" aria-label="组件来源名称" placeholder="论文名称或素材集" /></Field>
            <Field><Text>引用位置（可选）</Text><TextArea v-model="sourceReference" maxlength="500" rows="2" aria-label="组件来源引用" placeholder="链接、图号或页码" /></Field>
          </template>
          <template v-else><Text class="panel-description">{{ preview.description || '保存自画布的可编辑组件。' }}</Text><Box class="asset-tags"><Text v-for="tag in preview.tags" :key="tag">{{ tag }}</Text></Box></template>
          <Field v-if="context?.mode !== 'capture'&&!editingInfo"><Text>插入时的容器样式</Text><Select :value="appearance" :options="[{value:'keep',label:'保留皮肤和配色'}, {value:'inherit',label:'继承目标容器样式'}]" aria-label="组件插入样式" @change="appearance = $event" /></Field>
        </Box>
      </Box>
      <Field v-if="context && context.mode !== 'capture'&&!editingInfo"><Text>组件缩放（%，含字号与描边）</Text><TextField v-model.number="percent" type="number" min="10" max="400" step="5" aria-label="组件插入缩放百分比" /></Field>
      <Text v-if="scaled.error" role="alert" class="error-text">{{ scaled.error }}</Text>
      <Text v-if="scaled.error&&preview" class="muted-caption">当前显示原尺寸预览；调整缩放比例后可插入或保存配置。</Text>
      <Box v-if="preview && (preview.sources.length || preview.lineage.length)" class="asset-provenance"><Heading>参考与派生来源</Heading><ComponentSourceDetails v-for="(source,i) in preview.sources" :key="i" :source="source" /><Text v-if="preview.lineage.length" class="muted-caption">派生自：{{ preview.lineage.map(a => a.name).join(' → ') }}</Text></Box>
      <Disclosure v-if="preview?.lineage.length"><DisclosureTrigger size="xs">派生详情 · {{ preview.lineage.length }} 项</DisclosureTrigger><Box v-for="(origin,index) in preview.lineage" :key="index" class="component-origin-detail"><Text>{{ origin.name }} · {{ origin.revision }}</Text><Text class="repository-directory">{{ origin.assetId }}</Text><Button v-if="/^snapshot-[a-f0-9]{64}$/.test(origin.assetId)" size="xs" variant="quiet" :aria-label="`查看本机来源 ${origin.assetId.slice(9)}`" :disabled="editingInfo||openingParent||editor.repository.publishing.value" @click="openParent(origin.assetId)">打开本机来源快照</Button></Box><Text class="muted-caption">便携来源不一定保存在当前本机库；输入组件指纹以 source- 开头，不表示已有本机快照。</Text></Disclosure>
      <Text v-if="preview && context?.mode !== 'capture'&&!editingInfo" class="panel-description">插入到「{{ editor.currentContainer.value.title }}」。新建图件并插入会替换当前画布，可通过撤销恢复。</Text>
      <Text v-if="insertionProblem && context?.mode !== 'capture'&&!editingInfo" class="placement-message">{{ insertionProblem }}</Text>
      <Text v-if="error" role="alert" class="error-text">{{ error }}</Text>
      <Box v-if="context?.mode==='repository'&&context.record.archivedAt" class="repository-state"><Text class="selection-title">已归档 · {{ new Date(context.record.archivedAt).toLocaleString() }}</Text><Text>不参与本机库自动召回；已有图件、工作副本和冻结任务保持。仍可导出、追溯或明确取用。</Text></Box>
      <Text v-if="context?.mode==='repository'" class="repository-directory">本机快照 SHA-256 · {{ context.record.id }}</Text>
      <Box v-if="preview && namedPorts(preview.figure,'stage').length" class="component-port-summary"><Text class="selection-title">可用接口</Text><Text v-for="port in namedPorts(preview.figure,'stage')" :key="port.id">{{ directionLabels[port.socket!.direction] }} · {{ port.label }} · {{ port.socket!.key }}</Text></Box>
    </ModalBody>
    <Footer v-if="!editingInfo">
      <Button v-if="context?.mode==='repository'" :disabled="editor.repository.publishing.value" @click="editingInfo=true">整理检索信息</Button>
      <Button v-if="context?.mode==='repository'" :disabled="editor.repository.publishing.value||openingParent" @click="changeArchive">{{ editor.repository.changingState.value?'正在更新状态…':context.record.archivedAt?'恢复快照':'归档快照' }}</Button>
      <Button v-if="preview" class="component-backup" :disabled="context?.mode!=='repository'&&!scaled.asset" @click="backup"><Icon name="export" />{{ context?.mode==='repository'?'导出原快照':'导出组件' }}</Button>
      <Button v-if="preview&&context?.mode!=='repository'" :disabled="editor.repository.publishing.value||!scaled.asset" @click="publish"><Icon name="save" />{{ editor.repository.publishing.value?'正在存入…':'存入本机素材库' }}</Button>
      <Button v-if="context?.mode==='repository'" :disabled="!scaled.asset" @click="save">取为我的组件</Button>
      <Button v-if="context?.mode==='repository'" :disabled="!scaled.asset" @click="useForAssistant">用于助手</Button>
      <Button v-if="context?.mode === 'asset'" variant="danger" @click="remove">移除</Button>
      <Button v-if="context?.mode === 'template'" :disabled="!scaled.asset" @click="save">存入我的组件</Button>
      <template v-if="context?.mode === 'capture'"><Button @click="close">取消</Button><Button variant="primary" :disabled="!preview" @click="save"><Icon name="save" />保存组件</Button></template>
      <template v-else><Button :disabled="!scaled.asset" @click="insert(true)">新建图件并插入</Button><Button variant="primary" :disabled="!scaled.asset || !!insertionProblem" @click="insert()"><Icon name="plus" />插入当前容器</Button></template>
    </Footer>
  </Modal>
</template>
