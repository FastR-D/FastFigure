<script setup lang="ts">
import {computed,ref} from 'vue'
import { Box,Button,Disclosure,DisclosureTrigger,Field,Footer,Header,Heading,Image,Modal,ModalBody,Text,TextField} from '@fastrd/ui-vue'
import { ErrorMessage } from '../ui'
import IconButton from '../ui/IconButton.vue'
import ComponentContentReview from './ComponentContentReview.vue'
import ComponentMetadataFields from './ComponentMetadataFields.vue'
import ComponentSourceDetails from './ComponentSourceDetails.vue'
import {useEditor} from '../../composables/useEditor'
import {downloadFile} from '../../core/export'
defineProps<{open:boolean}>()
const emit=defineEmits<{close:[]}>(),editor=useEditor(),queue=editor.repository.imports,active=ref('')
const current=computed(()=>queue.rows.value.find(row=>row.id===active.value)??queue.rows.value[0]),counts=computed(()=>({pending:queue.rows.value.filter(row=>row.status==='pending').length,stored:queue.rows.value.filter(row=>row.status==='stored').length,exists:queue.rows.value.filter(row=>row.status==='exists').length,errors:queue.rows.value.filter(row=>row.status==='error').length})),states={pending:'待解析',preparing:'正在解析',ready:'可入库',saving:'正在入库',stored:'已入库',exists:'相同内容已存在',error:'失败'}
async function choose(event:Event){const input=event.target as HTMLInputElement,files=Array.from(input.files??[]);input.value='';await queue.addFiles(files)}
function select(id:string,event:Event){queue.choose(id,(event.target as HTMLInputElement).checked)}
function exportReport(){downloadFile('fastfigure-import-report.json',JSON.stringify(queue.report(),null,2),'application/json')}
</script>
<template>
  <Modal :open="open" label="批量导入本机素材" size="xl" class="component-batch-dialog" @close="emit('close')">
    <Header><Box><Heading>批量导入本机素材</Heading><Text class="muted-caption">JSON 保留完整组件；SVG / draw.io 转为原生图元，多页文件逐页预览、选择后入库。</Text></Box><IconButton icon="close" label="收起批量导入" @click="emit('close')" /></Header>
    <ModalBody>
      <Field><Text>JSON / SVG / draw.io · 最多 50 项（含页面），原文件单个 2 MB、合计 50 MB</Text><TextField type="file" multiple accept=".json,.svg,.drawio,.xml,application/json,image/svg+xml,application/xml" :disabled="queue.locked.value" aria-label="批量选择素材文件" @change="choose" /></Field>
      <Box class="component-batch-actions"><Button size="xs" :disabled="queue.locked.value||!queue.rows.value.length" @click="queue.selectClean">选择无提示项</Button><Button size="xs" variant="quiet" :disabled="queue.locked.value" @click="queue.deselect">取消选择</Button><Button v-if="counts.pending" size="xs" :disabled="queue.locked.value" @click="queue.preparePending">继续解析 {{ counts.pending }} 项</Button><Button size="xs" variant="quiet" :disabled="queue.locked.value||!queue.rows.value.length" @click="queue.clear">清空队列</Button><Button size="xs" variant="quiet" :disabled="!queue.rows.value.length" @click="exportReport">导出入库记录</Button></Box>
      <Text class="muted-caption" aria-live="polite">共 {{ queue.rows.value.length }} 项 · 待提交 {{ queue.selected.value.length }} 项 · 已入库 {{ counts.stored }} 项 · 相同内容 {{ counts.exists }} 项 · 失败 {{ counts.errors }} 项{{ queue.pauseRequested.value&&queue.busy.value?' · 当前项完成后暂停':'' }}</Text>
      <ErrorMessage v-if="queue.error.value" class="error-text" :message="queue.error.value" />
      <Box v-if="queue.rows.value.length" class="component-batch-grid">
        <Box class="component-batch-list" role="group" aria-label="批量素材文件列表">
          <Box v-for="row in queue.rows.value" :key="row.id" class="component-batch-row" :class="{active:current?.id===row.id}" :data-import-file="row.fileName">
            <TextField type="checkbox" :checked="row.selected" :disabled="queue.locked.value||!row.payload||!['ready','error'].includes(row.status)" :aria-label="`选择入库 ${row.fileName}`" @change="select(row.id,$event)" />
            <Button variant="quiet" :aria-label="`预览导入 ${row.fileName}`" :aria-pressed="current?.id===row.id" @click="active=row.id"><Image v-if="row.payload" :src="row.payload.thumbnail.dataUrl" :alt="`${row.fileName} 原生预览`" /><Box><Text>{{ row.fileName }}</Text><Text class="muted-caption">{{ states[row.status] }}{{ row.warnings.length?` · ${row.warnings.length} 条解析提示`:'' }}{{ row.duplicateOf?' · 批内相同快照':'' }}{{ row.contentReview?.total||row.contentBatchOf?' · 相同图形待核对':'' }}</Text><ErrorMessage v-if="row.error" class="error-text" :message="row.error" /></Box></Button>
          </Box>
        </Box>
        <Box v-if="current" class="component-batch-detail" aria-label="当前导入素材详情">
          <Heading :level="3">{{ current.payload?.asset.name||current.fileName }}</Heading><Text>{{ states[current.status] }}</Text>
          <ComponentContentReview v-if="current.payload" :key="current.id" :asset="current.payload.asset" :review="current.contentReview" :error="current.contentError" :batch-of="current.contentBatchOf" :busy="queue.locked.value" :selected="current.selected" :editable="['ready','error'].includes(current.status)" @check="queue.recheckContent(current.id)" @keep="queue.choose(current.id,true)" /><ErrorMessage v-else-if="current.error" :message="current.error" /><Text v-else class="empty-state">等待解析，可暂停后先处理已完成的文件。</Text>
          <template v-if="current.payload">
<Text class="muted-caption">{{ current.payload.asset.figure.nodes.length }} 个原生图元 · {{ current.payload.asset.figure.edges.length }} 条语义边 · {{ current.payload.asset.sources.length }} 条来源</Text><Text v-if="current.sourceKind==='capture'" class="muted-caption">从冻结的原生图件选择采集，尚未入库；采集记录保留源对象、工程指纹和边界处理。</Text><Text v-else class="muted-caption">{{ current.sourceKind==='vector'?'从已预览的矢量素材转换，原文件和页面来源保留。':current.mode==='drawio'?'draw.io 页面已转为原生图元与路径绑定，请逐项核对。':current.mode==='component'?current.metadataEdited?'原生组件 JSON；已准备检索信息派生。':'原生组件 JSON；未改名、未重写来源。':current.mode==='metadata'?'按 SVG 内 FastFigure 元数据恢复；请核对原生预览。':'完整 SVG 解析；复杂源图可先用单图导入选择子图。' }}</Text><Text class="repository-directory">组件 SHA-256 · {{ current.payload.thumbnail.assetSha256 }}</Text>
            <Text v-if="current.metadataEdited" class="muted-caption">检索信息已整理，原生图形、图中文字与原来源保持。</Text>
            <Disclosure v-if="current.metadataDraft&&current.basePayload" class="component-batch-metadata"><DisclosureTrigger size="xs">整理检索信息{{ current.metadataDirty?' · 尚未应用':'' }}</DisclosureTrigger><ComponentMetadataFields :model-value="current.metadataDraft" :inherited-sources="current.basePayload.asset.sources.length" :disabled="queue.locked.value||!!current.attemptedAt" @update:model-value="queue.editMetadata(current.id,$event)" /><Text v-if="current.attemptedAt" class="muted-caption">此项已提交过，内容保持冻结；失败项可直接重试，已存项可在素材详情另存信息版本。</Text><Box class="component-metadata-actions"><Button size="xs" :disabled="queue.locked.value||!!current.attemptedAt" @click="queue.resetMetadata(current.id)">恢复原始信息</Button><Button size="xs" :disabled="queue.locked.value||!!current.attemptedAt||!current.metadataDirty" @click="queue.applyMetadata(current.id)">应用检索信息</Button></Box></Disclosure>
            <Disclosure><DisclosureTrigger size="xs">来源与派生 · {{ current.payload.asset.sources.length }} / {{ current.payload.asset.lineage.length }}</DisclosureTrigger><ComponentSourceDetails v-for="(source,index) in current.payload.asset.sources" :key="index" :source="source" /><Text v-for="(origin,index) in current.payload.asset.lineage" :key="`origin-${index}`" class="muted-caption">{{ origin.name }} · {{ origin.revision }} · {{ origin.assetId }}</Text></Disclosure>
          </template>
          <Text v-for="warning in current.warnings" :key="warning" class="muted-caption">{{ current.sourceKind==='capture'?'采集检查':'解析提示' }}：{{ warning }}</Text><Text v-if="current.warnings.length" class="muted-caption">有提示的项默认不勾选，可查看预览与提示后选择。</Text><Text v-if="current.duplicateOf" class="muted-caption">与本批「{{ current.duplicateOf }}」为同一规范内容；成功回执可复用。</Text>
          <Text v-if="current.sourceSha256" class="repository-directory">{{ current.sourceKind==='capture'||current.sourceKind==='vector'?'入队组件 JSON SHA-256':'原文件 SHA-256' }} · {{ current.sourceSha256 }}</Text><Text v-if="current.receipt" class="muted-caption">入库回执 · {{ current.receipt.record.id }} · {{ current.receipt.record.savedAt }}</Text><Text v-if="current.receipt?.record.archivedAt" class="muted-caption">回执时为已归档状态，重复入库未自动恢复。</Text>
          <Button size="xs" variant="quiet" :disabled="queue.locked.value" @click="queue.remove(current.id)">移出队列</Button>
        </Box>
      </Box>
      <Text v-else class="empty-state">可同时选择多份组件、SVG 与 draw.io 文件。预览不会修改当前画布或工作组件库。</Text>
      <Text class="muted-caption">每项独立保存，失败项保留同一份冻结内容供重试。队列在本页面继续处理；刷新会清空未提交队列。入库记录仅记录指纹与结果。</Text>
      <Text v-if="queue.pendingMetadata.value" class="muted-caption">选中项有尚未应用的检索信息，请先应用或恢复原始信息。</Text>
    </ModalBody>
    <Footer><Button @click="emit('close')">收起</Button><Button v-if="queue.busy.value" :disabled="queue.pauseRequested.value" @click="queue.pause">当前项完成后暂停</Button><Button variant="primary" :disabled="queue.locked.value||queue.pendingMetadata.value||!queue.selected.value.length" @click="queue.submit">将 {{ queue.selected.value.length }} 项入库</Button></Footer>
  </Modal>
</template>
