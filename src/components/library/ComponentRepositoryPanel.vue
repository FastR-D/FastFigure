<script setup lang="ts">
import {defineAsyncComponent,onBeforeUnmount,onMounted,ref} from 'vue'
import { Box,Button,Disclosure,DisclosureTrigger,Image,Select,Text,TextField} from '@fastrd/ui-vue'
import { ErrorMessage } from '../ui'
import {repositoryScopeSchema} from '../../core/componentRepository'
import {useEditor} from '../../composables/useEditor'
import ComponentBatchImport from './ComponentBatchImport.vue'
const RetrievalFeedbackHistory=defineAsyncComponent(()=>import('./RetrievalFeedbackHistory.vue'))
const editor=useEditor(),repository=editor.repository,q=ref(repository.query.value),error=ref(''),opening=ref(''),feedbackOpen=ref(false)
let epoch=0
onMounted(()=>void repository.refresh())
onBeforeUnmount(()=>epoch++)
async function open(id:string){const request=++epoch;opening.value=id;error.value='';try{const {asset,record}=await repository.read(id);if(request===epoch)editor.assetDialog.value={mode:'repository',asset,record}}catch(e){if(request===epoch)error.value=(e as Error).message}finally{if(request===epoch)opening.value=''}}
function changeScope(value:string){void repository.refresh(q.value,0,repositoryScopeSchema.parse(value))}
</script>
<template>
  <Box class="repository-panel" aria-label="本机持久素材库">
    <Text class="panel-description">保存到本机目录，跨工程与浏览器页面取用。快照保留可编辑结构和来源，旧版本不会被覆盖。</Text>
    <Button size="xs" @click="editor.openComponentCapture()">从当前图件采集</Button>
    <Button size="xs" :aria-label="'批量导入本机素材'" @click="repository.importOpen.value=true">批量导入 JSON / SVG{{ repository.imports.busy.value?' · 处理中':repository.imports.rows.value.length?` · ${repository.imports.rows.value.length} 个文件`:'' }}</Button>
    <Button size="xs" @click="feedbackOpen=true">素材反馈记录</Button>
    <Box class="repository-search"><TextField v-model="q" maxlength="200" aria-label="检索本机素材" placeholder="名称、标签、论文来源" @keydown.enter="repository.refresh(q,0)" /><Button size="xs" :disabled="repository.loading.value" @click="repository.refresh(q,0)">检索</Button></Box>
    <Select :value="repository.scope.value" :options="[{value:'active',label:'当前素材'},{value:'archived',label:'已归档'},{value:'all',label:'全部版本'}]" aria-label="素材快照范围" @change="changeScope" />
    <Box class="section-eyebrow"><Text>{{ repository.page.value.total }} 项匹配</Text><Button size="xs" variant="quiet" :disabled="repository.loading.value" @click="repository.refresh(q,repository.page.value.offset)">刷新素材库</Button></Box>
    <Text v-if="repository.loading.value" class="muted-caption">正在读取本机素材…</Text>
    <ErrorMessage v-if="error||repository.error.value" class="error-text" :message="error||repository.error.value" />
    <Box class="asset-grid"><Button v-for="record in repository.page.value.records" :key="record.id" class="asset-card" variant="quiet" :disabled="!!opening" draggable="true" @dragstart="editor.libraryDrag.start($event,{kind:'asset',asset:()=>repository.read(record.id).then(result=>result.asset)})" :aria-label="`查看本机素材 ${record.name}`" @click="open(record.id)"><Image v-if="record.thumbnail" :src="record.thumbnail" :draggable="false" :alt="`${record.name} 快照预览`" class="repository-thumbnail" /><Box v-else class="repository-preview-placeholder"><Text>{{ record.nodes }} 个原生图元</Text></Box><Box><Text class="asset-name">{{ record.name }}</Text><Text v-if="record.archivedAt" class="repository-archive-badge">已归档</Text><Text class="component-note">{{ record.tags.slice(0,3).join(' / ')||'可编辑组件' }} · {{ record.nodes }} 节点</Text><Text class="component-note">{{ record.sources[0]?.title||'未补充论文来源' }}</Text><Text class="component-note">快照 {{ record.id.slice(0,12) }}</Text></Box></Button></Box>
    <Text v-if="!repository.loading.value&&!repository.page.value.total&&!repository.error.value" class="empty-state">{{ q?'没有匹配的快照。':repository.scope.value==='archived'?'没有已归档的快照。':repository.status.value?.archivedCount?'当前没有未归档素材，可切换“已归档”恢复。':'在组件详情或采集窗口点击“存入本机素材库”。' }}</Text>
    <Box v-if="repository.page.value.total>repository.page.value.limit" class="repository-pagination"><Button size="xs" :disabled="repository.loading.value||repository.page.value.offset===0" @click="repository.refresh(q,Math.max(0,repository.page.value.offset-repository.page.value.limit))">上一页</Button><Text>{{ Math.floor(repository.page.value.offset/repository.page.value.limit)+1 }} / {{ Math.ceil(repository.page.value.total/repository.page.value.limit) }}</Text><Button size="xs" :disabled="repository.loading.value||repository.page.value.offset+repository.page.value.limit>=repository.page.value.total" @click="repository.refresh(q,repository.page.value.offset+repository.page.value.limit)">下一页</Button></Box>
    <Disclosure v-if="repository.status.value"><DisclosureTrigger size="xs">本机存储 · {{ repository.status.value.activeCount }} 当前 / {{ repository.status.value.archivedCount }} 归档</DisclosureTrigger><Text class="repository-directory">{{ repository.status.value.directory }}</Text><Text class="muted-caption">共 {{ repository.status.value.count }} 项，组件内容 {{ (repository.status.value.bytes/1_000_000).toFixed(1) }} MB；上限 {{ repository.status.value.maxEntries }} 项。归档保留原快照，不释放存储。</Text></Disclosure>
    <Text class="muted-caption">归档项不参与本机库自动召回；已有图件、工作副本和任务快照保持。可切换范围查看、恢复或明确取用。</Text>
    <Text class="muted-caption">直接预览和插入不占浏览器组件名额。“用于助手”会取为当前浏览器的工作组件，每轮仍冻结完整快照。</Text>
    <ComponentBatchImport :open="repository.importOpen.value" @close="repository.importOpen.value=false" />
    <RetrievalFeedbackHistory v-if="feedbackOpen" :open="true" @close="feedbackOpen=false" />
  </Box>
</template>
