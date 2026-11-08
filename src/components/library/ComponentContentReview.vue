<script setup lang="ts">
import {onBeforeUnmount,ref,shallowRef,watch} from 'vue'
import { ErrorMessage,Box,Button,Text} from '../ui'
import AssetPreview from './AssetPreview.vue'
import ComponentSourceDetails from './ComponentSourceDetails.vue'
import type {ComponentAsset} from '../../core/assets'
import type {ContentMatchResult} from '../../core/componentRepository'
import {componentContentHash} from '../../core/componentContent'
import {useEditor} from '../../composables/useEditor'
const props=defineProps<{asset:ComponentAsset;review?:ContentMatchResult;error?:string;batchOf?:string;busy:boolean;selected:boolean;editable:boolean}>()
const emit=defineEmits<{check:[];keep:[]}>(),editor=useEditor(),candidate=shallowRef<Awaited<ReturnType<typeof editor.repository.read>>|null>(null),loading=ref(''),readError=ref('')
let epoch=0
onBeforeUnmount(()=>{epoch++})
watch(()=>props.review?.assetSha256,()=>{epoch++;candidate.value=null;readError.value='';loading.value=''})
async function inspect(id:string){
  const current=++epoch,expected=props.review?.assetSha256,contentHash=props.review?.contentSha256;loading.value=id;readError.value=''
  try{const result=await editor.repository.read(id);if(current!==epoch||props.review?.assetSha256!==expected)return;if(await componentContentHash(result.asset)!==contentHash)throw new Error('候选图形与本次核对结果不符，请重新核对');if(current===epoch)candidate.value=result}
  catch(error){if(current===epoch)readError.value=(error as Error).message}finally{if(current===epoch)loading.value=''}
}
</script>
<template>
  <Box class="component-content-review" aria-label="相同图形核对">
    <Box class="component-content-previews" :class="{'has-candidate':!!candidate}">
      <Box><Text v-if="candidate" class="muted-caption">本次导入 · {{ asset.name }}</Text><AssetPreview :asset="asset" /></Box>
      <Box v-if="candidate"><Text class="muted-caption">已有快照 · {{ candidate.asset.name }}</Text><AssetPreview :asset="candidate.asset" /><Text class="repository-directory">快照 {{ candidate.record.id }}</Text><ComponentSourceDetails v-for="(source,index) in candidate.asset.sources" :key="index" :source="source" /></Box>
    </Box>
    <Text v-if="review?.total" class="muted-caption">找到 {{ review.total }} 个相同图形候选，展示最多 6 个。来源与检索信息可能不同，仍可保留独立快照。</Text>
    <Box v-if="review?.records.length" class="component-content-options">
      <Button v-for="record in review.records" :key="record.id" size="xs" :disabled="!!loading" :aria-pressed="candidate?.record.id===record.id" :aria-label="`对比相同图形 ${record.name}`" @click="inspect(record.id)">{{ record.name }} · {{ record.archivedAt?'已归档':'当前素材' }}</Button>
    </Box>
    <Text v-if="batchOf" class="muted-caption">与本批「{{ batchOf }}」的图形内容相同，快照身份各自保留。</Text>
    <Text v-if="review?.index.remaining" class="muted-caption" aria-live="polite">本机图形索引核对进度：{{ review.index.total-review.index.remaining }} / {{ review.index.total }}。尚未核对的快照不计入当前结果。</Text>
    <Text v-if="review?.index.unreadable" class="error-text">{{ review.index.unreadable }} 个快照暂不可读，本次核对未覆盖全部素材。</Text>
    <ErrorMessage v-if="error||readError" class="error-text" :message="error||readError" />
    <Text v-if="review&&!review.total&&!batchOf&&!review.index.remaining&&!review.index.unreadable&&!error" class="muted-caption">核对时未发现其他相同图形快照。</Text>
    <Box class="component-metadata-actions"><Button size="xs" variant="quiet" :disabled="busy" @click="emit('check')">重新核对相同图形</Button><Button v-if="editable&&!selected&&(review?.total||batchOf)" size="xs" :disabled="busy" @click="emit('keep')">保留为独立快照</Button></Box>
  </Box>
</template>
