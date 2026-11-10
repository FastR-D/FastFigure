<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Box, Button, Heading, Select, Text } from '@fastrd/ui-vue'
import { useEditor } from '../../composables/useEditor'
import { reconstructionGroup, reconstructionWorkers, sceneForReconstruction } from '../../core/reconstruction'
import ReferencePreview from '../references/ReferencePreview'
const props=defineProps<{containerId:string}>(),editor=useEditor(),selected=ref('')
const state=computed(()=>{try{const group=reconstructionGroup(editor.figure.value,props.containerId),scene=sceneForReconstruction(editor.figure.value,group.id);return {record:group.reconstruction,workers:reconstructionWorkers(group.reconstruction,scene),count:scene.nodes.filter(n=>n.owner!=='ff-protected').length,error:''}}catch(e){return{record:null,workers:[],count:0,error:(e as Error).message}}})
const reference=computed(()=>editor.figure.value.references.find(r=>r.sha256===state.value.record?.referenceSha256))
watch(()=>state.value.workers,workers=>{if(!workers.some(w=>w.id===selected.value))selected.value=workers[0]?.id??''},{immediate:true})
const worker=computed(()=>state.value.workers.find(w=>w.id===selected.value))
const region=computed(()=>{const w=worker.value,r=state.value.record;if(!w||!r)return null;return {x:w.x/r.sourceWidth,y:w.y/r.sourceHeight,width:w.w/r.sourceWidth,height:w.h/r.sourceHeight}})
function repair(){if(!worker.value)return;editor.requestReconstruction({kind:'repair',containerId:props.containerId,regionId:worker.value.id},'对照原图核对这个分区，修复误识别的文字、边界、曲线、颜色与层级，补充遗漏图元；保持其他分区和手工添加对象。')}
</script>
<template>
  <Box class="reconstruction-inspector">
<Heading>原图分区修复</Heading><Text class="muted-caption">{{ state.count }} 个重建对象 · 修订 {{ state.record?.revision ?? 0 }} · {{ state.workers.length }} 个可检查区域</Text>
    <Select :value="selected" :options="state.workers.map(w=>({value:w.id,label:`${w.title||w.id}${w.detailPass?' · 细节':''}`}))" aria-label="重建修复分区" @change="selected=$event" />
    <ReferencePreview v-if="reference&&region" :image="reference" :region="region" label="重建分区对照区域" />
    <Text v-if="!reference" class="muted-caption">修复需要原参考图，请导入对应来源图片。</Text><Text v-if="state.error" role="alert" class="error-text">{{ state.error }}</Text>
    <Button :disabled="!reference||!worker" @click="repair">交给助手修复此分区</Button>
    <Text v-for="(warning,index) in state.record?.warnings??[]" :key="index" class="placement-message">待核对：{{ warning }}</Text>
  </Box>
</template>
