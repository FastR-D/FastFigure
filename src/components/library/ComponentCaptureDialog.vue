<script setup lang="ts">
import {computed,onBeforeUnmount,ref,shallowRef,watch} from 'vue'
import {Box,Button,Disclosure,DisclosureTrigger,Field,Footer,Header,Heading,Modal,ModalBody,Select,Text,TextArea,TextField} from '../ui'
import IconButton from '../ui/IconButton.vue'
import AssetPreview from './AssetPreview.vue'
import ComponentSourceDetails from './ComponentSourceDetails.vue'
import FigureRenderer from '../figure/FigureRenderer'
import {useEditor} from '../../composables/useEditor'
import {allObjects,ancestors,topLevelSelection} from '../../core/geometry'
import {captureObjectSelection,componentCapturePresets,captureFigureJson} from '../../core/componentCapture'
import {clone,nodeKindLabels,parseDocument} from '../../core/model'
import {downloadFile} from '../../core/export'
const editor=useEditor(),context=editor.componentCapture.value!,source=context.figure,queue=editor.repository.imports
const objects=allObjects(source),presets=componentCapturePresets(source),selected=ref(context.selectedIds.filter(id=>objects.some(object=>object.id===id))),preset=ref('manual'),query=ref('')
const name=ref(`${source.title} · 片段`.slice(0,100)),description=ref(''),tags=ref(''),extraTitle=ref(''),extraReference=ref(''),error=ref(''),preparing=ref(false),staging=ref(false),queued=ref(false)
const prepared=shallowRef<Awaited<ReturnType<typeof captureObjectSelection>>|null>(null),locked=computed(()=>preparing.value||staging.value),roots=computed(()=>topLevelSelection(source,selected.value).map(object=>object.id))
const choices=computed(()=>objects.filter(object=>`${'kind'in object?object.name||object.label||nodeKindLabels[object.kind]:object.title} ${object.id}`.toLowerCase().includes(query.value.toLowerCase())))
let epoch=0,automaticName=name.value;onBeforeUnmount(()=>epoch++)
watch([selected,name,description,tags,extraTitle,extraReference],()=>{epoch++;prepared.value=null;queued.value=false;error.value=''}, {deep:true})
function clearSelection(){if(!locked.value){selected.value=[];preset.value='manual'}}
function inherited(id:string){return ancestors(source,id).some(parent=>selected.value.includes(parent))}
function choose(id:string,additive=false){
  if(locked.value)return
  preset.value='manual'
  if(!additive){selected.value=[id];return}
  selected.value=selected.value.includes(id)?selected.value.filter(value=>value!==id):[...selected.value.filter(value=>!ancestors(source,id).includes(value)&&!ancestors(source,value).includes(id)),id]
}
function quick(value:string){
  preset.value=value;const choice=presets.find(preset=>preset.id===value);if(!choice)return
  selected.value=[...choice.objectIds];if(name.value===automaticName){automaticName=choice.name.slice(0,100);name.value=automaticName}
}
async function prepare(){
  const token=++epoch;preparing.value=true;error.value=''
  try{const result=await captureObjectSelection(source,[...selected.value],{name:name.value,description:description.value,tags:tags.value,sources:extraTitle.value.trim()||extraReference.value.trim()?[{title:extraTitle.value,reference:extraReference.value}]:[]},context.origin);if(token===epoch){prepared.value=result;queued.value=false}}
  catch(reason){if(token===epoch)error.value=reason instanceof Error&&!('issues'in reason)?reason.message:'采集超出图件尺寸、层级或来源限制，请减少范围并核对引用'}finally{preparing.value=false}
}
async function stage(){
  if(!prepared.value||locked.value||queue.locked.value||queued.value)return
  const item=prepared.value,token=epoch;staging.value=true;error.value=''
  try{const rows=await queue.addCaptured([clone(item.asset)]);if(token!==epoch)return;if(!rows.length)throw new Error(queue.error.value||'队列未接收素材');queued.value=true;error.value=rows.find(row=>row.error)?.error??'';editor.notice.value='素材已加入待入库队列，尚未保存到本机库'}catch(reason){if(token===epoch)error.value=(reason as Error).message}finally{staging.value=false}
}
function showQueue(){editor.componentCapture.value=null;editor.activePanel.value='components';editor.libraryTab.value='repository';editor.repository.importOpen.value=true}
function backupSource(){downloadFile(`${source.title}.capture-source.fastfigure.json`,captureFigureJson(parseDocument(clone(source))),'application/json')}
function backup(){if(prepared.value)downloadFile(`${prepared.value.asset.name}.fastfigure-component.json`,JSON.stringify(prepared.value.asset,null,2),'application/json')}
</script>
<template>
  <Modal :open="true" label="从原生图件采集素材" size="xl" class="component-capture-dialog" @close="editor.componentCapture.value=null">
    <Header><Box><Heading>{{ context.origin.kind==='candidate'?'从候选图采集素材':'从当前图件采集素材' }}</Heading><Text class="muted-caption">来源已冻结。点击对象，Shift / Ctrl 多选，或选择容器与描摹分区；预览和入队均不修改画布，候选仍按原状态保留。</Text></Box><IconButton icon="close" label="关闭采集素材" @click="editor.componentCapture.value=null" /></Header>
    <ModalBody>
<Box class="component-capture-grid">
      <Box class="component-capture-preview"><Heading :level="3">冻结来源 · {{ source.title }}</Heading><Box class="component-capture-canvas" aria-label="选择采集源对象"><FigureRenderer :figure="source" :selected-ids="roots" interactive selection-only :show-document-title="false" @select="choose" @background-down="clearSelection" /></Box><Text class="muted-caption">已选 {{ selected.length }} 项；选中容器会包含后代与命名接口。内部语义边保留，路由会按新范围计算；外部边不进入素材。</Text><template v-if="prepared"><AssetPreview :asset="prepared.asset" /><Text class="muted-caption">采集预览 · {{ prepared.report.nodes }} 图元 / {{ prepared.report.containers }} 容器 / {{ prepared.report.internalEdges }} 连接 · {{ prepared.report.scopeIds.length }} 个样式层</Text><Text v-if="prepared.report.omittedEdgeIds.length||prepared.report.detachedEndpoints.length" class="placement-message">本次忽略 {{ prepared.report.omittedEdgeIds.length }} 条外部连接，解除 {{ prepared.report.detachedEndpoints.length }} 个指向未选图元的路径绑定；现有曲线几何保留。</Text></template><Text v-else class="muted-caption">准备后显示实际原生组件；数据图表须选择完整图表容器。</Text><Text v-for="warning in prepared?.report.warnings??[]" :key="warning" class="placement-message">{{ warning }}</Text></Box>
      <Box class="component-capture-controls">
<Field><Text>快速选择</Text><Select :value="preset" :disabled="locked" :options="[{value:'manual',label:'手动选择对象'},...presets.map(item=>({value:item.id,label:item.name}))]" aria-label="采集范围预设" @change="quick($event)" /></Field><Text v-if="preset!=='manual'" class="muted-caption">{{ presets.find(item=>item.id===preset)?.note }}</Text>
        <Box><TextField v-model="query" :disabled="locked" aria-label="搜索采集对象" placeholder="名称、图元类型或 ID" /><Button size="xs" :disabled="locked" @click="clearSelection">清空采集选择</Button></Box>
        <Box class="component-capture-objects" role="group" aria-label="采集对象列表"><Field v-for="object in choices" :key="object.id" class="checkbox-field" :style="{paddingLeft:`${ancestors(source,object.id).length*12}px`}"><TextField type="checkbox" :checked="selected.includes(object.id)||inherited(object.id)" :disabled="locked||inherited(object.id)||'interfaceFor'in object&&!!object.interfaceFor" :aria-label="`采集对象 ${'kind'in object?object.name||object.label||object.id:object.title}`" @change="choose(object.id,true)" /><Text>{{ 'kind'in object?object.name||object.label||nodeKindLabels[object.kind]:object.title }}<Text class="muted-caption"> · {{ object.id }}</Text></Text></Field></Box>
        <Field><Text>组件名称</Text><TextField v-model="name" :disabled="locked" maxlength="100" aria-label="采集组件名称" /></Field><Field><Text>检索说明</Text><TextArea v-model="description" :disabled="locked" maxlength="300" rows="2" aria-label="采集组件说明" /></Field><Field><Text>标签 · 逗号分隔</Text><TextField v-model="tags" :disabled="locked" aria-label="采集组件标签" /></Field><Disclosure><DisclosureTrigger size="xs">补充来源</DisclosureTrigger><TextField v-model="extraTitle" :disabled="locked" maxlength="100" aria-label="采集补充来源名称" placeholder="来源名称" /><TextArea v-model="extraReference" :disabled="locked" maxlength="500" rows="2" aria-label="采集补充来源引用" placeholder="引用或位置" /></Disclosure>
        <Disclosure v-if="prepared"><DisclosureTrigger size="xs">来源与采集记录 · {{ prepared.asset.sources.length }}</DisclosureTrigger><ComponentSourceDetails v-for="(item,index) in prepared.asset.sources" :key="index" :source="item" /></Disclosure>
      </Box>
    </Box><Text v-if="queued" class="placement-message">已加入待入库队列，尚未写库；可继续采集其他片段或打开队列核对后保存。</Text><Text v-if="error" class="error-text" role="alert">{{ error }}</Text>
</ModalBody>
    <Footer><Button @click="backupSource">导出来源快照</Button><Button :disabled="!queue.rows.value.length||locked" @click="showQueue">查看待入库队列（{{ queue.rows.value.length }}）</Button><Box class="header-spacer" /><Button :disabled="!prepared||locked" @click="backup">导出采集组件</Button><Button :disabled="locked||!selected.length||!name.trim()" @click="prepare">{{ preparing?'正在准备…':'准备采集预览' }}</Button><Button variant="primary" :disabled="!prepared||locked||queue.locked.value||queued" @click="stage">{{ staging?'正在入队…':queued?'已加入队列':'加入待入库队列' }}</Button></Footer>
  </Modal>
</template>
