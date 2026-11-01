<script setup lang="ts">
import {ref,shallowRef,watch} from 'vue'
import {Box,Button,Text} from '../ui'
import ComponentMetadataFields from './ComponentMetadataFields.vue'
import type {ComponentAsset} from '../../core/assets'
import {componentMetadataDraft,reviseComponentMetadata} from '../../core/componentMetadata'
import {prepareComponentPublish,type PreparedComponentPublish} from '../../composables/componentSnapshotPreview'
import {useEditor} from '../../composables/useEditor'
import type {ComponentSnapshot} from '../../core/componentRepository'
const props=defineProps<{asset:ComponentAsset;snapshotId:string}>(),emit=defineEmits<{saved:[asset:ComponentAsset,record:ComponentSnapshot];cancel:[]}>(),editor=useEditor(),draft=ref(componentMetadataDraft(props.asset)),frozen=shallowRef<PreparedComponentPublish|null>(null),busy=ref(false),attempted=ref(false),error=ref('')
watch(()=>props.snapshotId,()=>{draft.value=componentMetadataDraft(props.asset);frozen.value=null;attempted.value=false;error.value=''})
async function save(){
  if(busy.value||editor.repository.publishing.value)return
  busy.value=true;error.value=''
  try{
    if(!frozen.value){const revision=await reviseComponentMetadata(props.asset,draft.value,{snapshotId:props.snapshotId,revisionAt:new Date().toISOString()});if(!revision.changed){error.value='检索信息没有变化';return}frozen.value=await prepareComponentPublish(revision.asset)}
    attempted.value=true
    const result=await editor.repository.publishFrozen(frozen.value)
    editor.notice.value=result.record.archivedAt?'整理后的快照已存在且已归档，可在详情恢复':'整理信息已另存新快照，原快照保留';emit('saved',frozen.value.asset,result.record)
  }catch(e){error.value=e instanceof Error&&!('issues'in e)?e.message:'整理信息无效，未保存新版本'}finally{busy.value=false}
}
function editAgain(){if(!busy.value){frozen.value=null;attempted.value=false;error.value=''}}
</script>
<template>
  <Box class="component-metadata-revision">
    <ComponentMetadataFields v-model="draft" :inherited-sources="asset.sources.length" :disabled="busy||attempted" />
    <Text v-if="frozen" class="repository-directory">本次新快照 · {{ frozen.thumbnail.assetSha256 }}</Text>
    <Text v-if="error" class="error-text" role="alert">{{ error }}</Text>
    <Text v-if="attempted&&error" class="muted-caption">本次内容已冻结，可重试同一快照。重新编辑会准备另一个版本，已提交内容不回滚。</Text>
    <Box class="component-metadata-actions"><Button size="xs" :disabled="busy" @click="emit('cancel')">返回原快照</Button><Button v-if="attempted&&error" size="xs" :disabled="busy" @click="editAgain">重新编辑草稿</Button><Button variant="primary" size="xs" :disabled="busy||editor.repository.publishing.value" @click="save">{{ busy?'正在保存…':attempted?'重试保存同一快照':'另存整理后的新快照' }}</Button></Box>
  </Box>
</template>
