<script setup lang="ts">
import {computed,defineAsyncComponent,onBeforeUnmount,ref,shallowRef,watch} from 'vue'
import { Box,Button,Field,Footer,Header,Heading,Image,Modal,ModalBody,Select,Text,TextField} from '@fastrd/ui-vue'
import { ErrorMessage } from '../ui'
import IconButton from '../ui/IconButton.vue'
import AssetPreview from '../library/AssetPreview.vue'
import {useEditor} from '../../composables/useEditor'
import type {Harness} from '../../composables/useHarness'
import {referencePurposeLabels,type ReferencePurpose,type ReferenceSelection} from '../../core/referenceInputs'
import {importPaperReference,type PaperFigure} from '../../core/paperGallery'
const props=defineProps<{harness:Harness;components:boolean;references:boolean}>(),editor=useEditor()
const PaperGallery=defineAsyncComponent(()=>import('../references/PaperGallery.vue'))
const picker=ref<'components'|'gallery'|'references'|null>(null),keys=ref<string[]>([]),images=ref<ReferenceSelection[]>([]),paper=shallowRef<PaperFigure|null>(null),group=ref('all'),page=ref(0),error=ref(''),importing=ref(false)
let request:AbortController|undefined
const disabled=computed(()=>props.harness.locked.value||props.harness.loading.value)
const chosenComponents=computed(()=>props.harness.catalogueMode.value==='selected'?props.harness.referenceComponents.value:[])
const chosenImages=computed(()=>editor.figure.value.references.filter(ref=>props.harness.selectedReferences.value.some(choice=>choice.id===ref.id)))
const purposes=computed(()=>Object.entries(referencePurposeLabels).filter(([value])=>!editor.assistantDataset.value||value!=='content').map(([value,label])=>({value,label})))
const matches=computed(()=>props.harness.componentOptions.value.filter(item=>(group.value==='all'||item.entry.kind===group.value)&&(!props.harness.catalogueQuery.value.trim()||item.score>0)))
const items=computed(()=>matches.value.slice(page.value*16,(page.value+1)*16)),pages=computed(()=>Math.max(1,Math.ceil(matches.value.length/16)))
const title=computed(()=>picker.value==='components'?'选择参考组件':picker.value==='gallery'?'从论文图库选择':'选择参考图')
const count=computed(()=>picker.value==='components'?keys.value.length:picker.value==='gallery'?Number(!!paper.value):images.value.length)
watch([group,()=>props.harness.catalogueQuery.value],()=>{page.value=0})
watch(()=>editor.activePanel.value,value=>{if(value!=='assistant')close()})
function open(kind:NonNullable<typeof picker.value>){
  if(disabled.value)return
  keys.value=chosenComponents.value.map(item=>item.key);images.value=props.harness.selectedReferences.value.map(item=>({...item}));paper.value=null;error.value='';picker.value=kind
}
function close(){request?.abort();request=undefined;importing.value=false;picker.value=null;error.value=''}
function queryChange(harness:Harness,event:Event){harness.catalogueQuery.value=(event.target as HTMLInputElement).value}
function toggleComponent(key:string){if(keys.value.includes(key))keys.value=keys.value.filter(value=>value!==key);else if(keys.value.length<6)keys.value.push(key)}
function toggleImage(id:string){if(images.value.some(choice=>choice.id===id))images.value=images.value.filter(choice=>choice.id!==id);else if(images.value.length<3)images.value.push({id,purpose:'style'})}
function setPurpose(id:string,purpose:ReferencePurpose){const item=images.value.find(choice=>choice.id===id);if(item)item.purpose=purpose}
function removeComponent(key:string){props.harness.setComponentSelection(chosenComponents.value.filter(item=>item.key!==key).map(item=>item.key))}
function removeImage(id:string){props.harness.setReferenceSelection(props.harness.selectedReferences.value.filter(choice=>choice.id!==id))}
async function apply(){
  if(disabled.value||importing.value)return
  if(picker.value==='components'){if(props.harness.setComponentSelection(keys.value))close();else error.value=props.harness.error.value;return}
  if(picker.value==='references'){if(props.harness.setReferenceSelection(images.value))close();else error.value=props.harness.error.value;return}
  const selected=paper.value;if(!selected)return
  const baseline=editor.figure.value,controller=new AbortController();request=controller;importing.value=true;error.value=''
  try{
    const existing=baseline.references.find(ref=>ref.fileName===`${selected.id}.jpg`),image=existing??await importPaperReference(selected,editor.currentContainer.value,controller.signal)
    if(controller.signal.aborted)return
    if(editor.figure.value!==baseline||disabled.value)throw new Error('当前图件或任务已变化，请重新选择图库图片')
    const duplicate=baseline.references.find(ref=>ref.sha256===image.sha256)
    if(!duplicate){const mode=editor.referenceMode.value;if(!editor.addReference(image))throw new Error(editor.notice.value);editor.referenceMode.value=mode}
    const id=duplicate?.id??image.id,next=props.harness.selectedReferences.value.map(choice=>({...choice}))
    if(!next.some(choice=>choice.id===id))next.push({id,purpose:'layout'})
    if(!props.harness.setReferenceSelection(next))throw new Error(props.harness.error.value)
    close()
  }catch(e){if(!controller.signal.aborted)error.value=e instanceof Error?e.message:'图库图片加入失败'}finally{if(request===controller){request=undefined;importing.value=false}}
}
onBeforeUnmount(()=>request?.abort())
</script>

<template>
  <Box class="assistant-attachments">
    <Box class="assistant-attachment-actions">
      <Button v-if="components" size="xs" variant="quiet" :disabled="disabled" @click="open('components')"><Text>选组件</Text></Button>
      <Button v-if="references" size="xs" variant="quiet" :disabled="disabled" @click="open('gallery')"><Text>选图库</Text></Button>
      <Button v-if="references" size="xs" variant="quiet" :disabled="disabled" @click="open('references')"><Text>选参考图</Text></Button>
    </Box>
    <Box v-if="components&&harness.catalogueMode.value==='auto'" class="assistant-attachment-chip"><Text>自动推荐组件</Text><IconButton size="xs" icon="close" label="关闭自动推荐组件" :disabled="disabled" @click="harness.setComponentSelection([])" /></Box>
    <Box v-if="components" class="assistant-attachment-chips"><Box v-for="item in chosenComponents" :key="item.key" class="assistant-attachment-chip"><AssetPreview :asset="item.asset" /><Text :title="item.asset.name">{{ item.asset.name }}</Text><IconButton size="xs" icon="close" :label="`移除参考组件 ${item.asset.name}`" :disabled="disabled" @click="removeComponent(item.key)" /></Box></Box>
    <Box v-if="references" class="assistant-attachment-chips"><Box v-for="image in chosenImages" :key="image.id" class="assistant-attachment-chip"><Image :src="image.dataUrl" alt="" /><Text :title="image.title">{{ image.title }}</Text><Text class="attachment-purpose">{{ referencePurposeLabels[harness.selectedReferences.value.find(choice=>choice.id===image.id)!.purpose] }}</Text><IconButton size="xs" icon="close" :label="`移除参考图 ${image.title}`" :disabled="disabled" @click="removeImage(image.id)" /></Box></Box>
  </Box>
  <Modal :open="!!picker" :label="title" size="xl" class="assistant-attachment-dialog" @close="close">
    <Header><Heading>{{ title }}</Heading><IconButton icon="close" label="关闭参考选择" @click="close" /></Header>
    <ModalBody>
      <template v-if="picker==='components'">
        <Box class="attachment-picker-filters"><TextField :value="harness.catalogueQuery.value" @input="queryChange(harness,$event)" type="search" aria-label="搜索参考组件" placeholder="组件、配方、标杆主题…" /><Select :value="group" :options="[{value:'all',label:'全部组件'},{value:'recipe',label:'参数化组合'},{value:'seed',label:'基础图形'},{value:'asset',label:'内置图示'}]" size="sm" aria-label="参考组件分类" @change="group=$event" /></Box>
        <Box class="attachment-picker-grid"><Button v-for="item in items" :key="item.key" variant="quiet" class="attachment-picker-card" :aria-label="`选择组件 ${item.asset.name}`" :aria-pressed="keys.includes(item.key)" :disabled="disabled||!keys.includes(item.key)&&keys.length>=6" @click="toggleComponent(item.key)"><AssetPreview :asset="item.asset" /><Text>{{ item.asset.name }}</Text></Button></Box>
        <Text v-if="!matches.length" class="empty-state">没有匹配的组件。</Text>
        <Box class="material-actions"><Button size="xs" :disabled="page===0" @click="page--">上一页</Button><Text>{{ page+1 }} / {{ pages }}</Text><Button size="xs" :disabled="page+1>=pages" @click="page++">下一页</Button><Text class="muted-caption">最多选 6 个组件</Text></Box>
      </template>
      <PaperGallery v-else-if="picker==='gallery'" picker :picked-id="paper?.id" @pick="paper=$event" />
      <template v-else-if="picker==='references'">
        <Box class="attachment-picker-grid reference-picker-grid"><Box v-for="image in editor.figure.value.references" :key="image.id" class="reference-picker-item"><Button variant="quiet" class="attachment-picker-card" :aria-label="`选择参考图 ${image.title}`" :aria-pressed="images.some(choice=>choice.id===image.id)" :disabled="disabled" @click="toggleImage(image.id)"><Image :src="image.dataUrl" :alt="image.title" /><Text>{{ image.title }}</Text></Button><Field><Text>用途</Text><Select :value="images.find(choice=>choice.id===image.id)?.purpose??'style'" :options="purposes" size="sm" :disabled="disabled||!images.some(choice=>choice.id===image.id)" :aria-label="`参考用途 ${image.title}`" @change="setPurpose(image.id,$event as ReferencePurpose)" /></Field></Box></Box>
        <Text v-if="!editor.figure.value.references.length" class="empty-state">还没有导入的参考图。可从“参考图”面板导入，或从“选图库”加入论文图片。</Text>
      </template>
    </ModalBody>
    <ErrorMessage v-if="error" class="error-text attachment-picker-error" :message="error" />
    <Footer><Text class="muted-caption">{{ picker==='components'?'组件快照':picker==='gallery'?'图库图片 · 加入后默认参考构图':'参考图 · 按工程顺序发送' }} · 已选 {{ count }}</Text><Button :disabled="importing" @click="close">取消</Button><Button variant="primary" :disabled="disabled||importing||picker==='gallery'&&!paper" @click="apply">{{ importing?'正在导入…':'插入本轮' }}</Button></Footer>
  </Modal>
</template>
