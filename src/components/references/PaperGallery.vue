<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { ErrorMessage, Article, Box, Button, Footer, Header, Heading, Image, Link, Modal, ModalBody, Select, Text, TextField } from '../ui'
import IconButton from '../ui/IconButton.vue'
import { useEditor } from '../../composables/useEditor'
import { createPaperGallery, defaultGalleryFilters, importPaperReference, paperCitation, paperImageUrl, paperReferencePrompt, patternNames, searchPaperGallery, topconfUrl, type PaperFigure, type PaperGallery } from '../../core/paperGallery'
const props=defineProps<{picker?:boolean;pickedId?:string}>(),emit=defineEmits<{pick:[figure:PaperFigure]}>()
const editor=useEditor(),gallery=shallowRef<PaperGallery|null>(null),query=ref(''),filters=ref({...defaultGalleryFilters}),page=ref(0)
const selected=shallowRef<PaperFigure|null>(null),error=ref(''),busy=ref(false),imageFailed=ref(false),loading=ref(true)
const abort=new AbortController();let request:AbortController|undefined
const matches=computed(()=>gallery.value?searchPaperGallery(gallery.value,query.value,filters.value):[])
const items=computed(()=>matches.value.slice(page.value*12,(page.value+1)*12)),pages=computed(()=>Math.max(1,Math.ceil(matches.value.length/12)))
const venues=['iclr','icml','neurips','cvpr','acl','aaai'].map(value=>({value,label:value.toUpperCase()}))
const years=computed(()=>[...new Set(gallery.value?.figures.map(f=>f.year))].sort((a,b)=>b-a).map(year=>({value:String(year),label:String(year)})))
watch([query,filters],()=>{page.value=0},{deep:true});watch(selected,()=>{error.value='';imageFailed.value=false})
onMounted(async()=>{try{const r=await fetch('/resources/topconf/figures.json',{signal:abort.signal});if(!r.ok)throw new Error('图库索引读取失败');gallery.value=createPaperGallery(await r.json())}catch(e){if(!abort.signal.aborted)error.value=e instanceof Error&&!('issues' in e)?e.message:'图库索引格式不符'}finally{loading.value=false}})
onBeforeUnmount(()=>{abort.abort();request?.abort()})
function close(){request?.abort();selected.value=null}
async function useFigure(assistant=false){
  const figure=selected.value;if(!figure||busy.value)return
  busy.value=true;error.value='';const document=editor.figure.value;request=new AbortController()
  try{
    const existing=editor.figure.value.references.find(r=>r.fileName===`${figure.id}.jpg`),image=existing??await importPaperReference(figure,editor.currentContainer.value,request.signal)
    if(request.signal.aborted)return
    if(editor.figure.value!==document)throw new Error('画布已变化，请重新选择参考图')
    const duplicate=editor.figure.value.references.find(r=>r.sha256===image.sha256)
    if(duplicate){editor.referenceId.value=duplicate.id;editor.referenceMode.value='side'}
    else if(!editor.addReference(image))throw new Error(editor.notice.value)
    if(assistant){editor.assistantReferenceId.value=duplicate?.id??image.id;editor.useMaterialPrompt(paperReferencePrompt(figure))}
    else editor.activePanel.value='references'
    close()
  }catch(e){if(!request.signal.aborted)error.value=e instanceof Error&&!('issues' in e)?e.message:'图片处理失败，请使用来源链接查看'}finally{busy.value=false}
}
</script>
<template>
  <Box class="library-body paper-gallery" aria-label="顶会图件检索">
    <TextField v-model="query" type="search" aria-label="搜索顶会图件" placeholder="中文主题、英文标题或作者…" />
    <Box class="gallery-filters"><Select :value="filters.venue" :options="[{value:'all',label:'全部会议'},...venues]" aria-label="图库会议" @change="filters.venue=$event" /><Select :value="filters.year" :options="[{value:'all',label:'全部年份'},...years]" aria-label="图库年份" @change="filters.year=$event" /><Select :value="filters.pattern" :options="[{value:'all',label:'全部结构'},...Object.entries(patternNames).map(([value,label])=>({value,label}))]" aria-label="图库结构" @change="filters.pattern=$event" /><Select :value="filters.tier" :options="[{value:'all',label:'全部展示类型'},{value:'oral',label:'Oral'},{value:'spotlight',label:'Spotlight'}]" aria-label="图库展示类型" @change="filters.tier=$event" /></Box>
    <Box class="gallery-query-hints"><Button v-for="term in ['多模态','扩散','图神经网络','检索增强']" :key="term" size="xs" variant="quiet" @click="query=term">{{ term }}</Button></Box>
    <Box class="paper-gallery-cards"><Button v-for="{figure,hits} in items" :key="figure.id" class="paper-gallery-card" variant="quiet" :aria-label="`${picker?'选择论文图':'查看论文图'} ${figure.title}`" :aria-pressed="picker?pickedId===figure.id:undefined" @click="props.picker?emit('pick',figure):selected=figure"><Box class="paper-gallery-thumbnail"><Image :src="paperImageUrl(figure)" :alt="`${figure.title} Figure 1 / Teaser`" loading="lazy" referrerpolicy="no-referrer" /></Box><Box class="paper-gallery-info"><Box class="paper-gallery-tags"><Text>{{ figure.venue.toUpperCase() }} {{ figure.year }}</Text><Text>{{ patternNames[figure.pattern] }}</Text><Text v-if="figure.tier">{{ figure.tier }}</Text></Box><Text class="paper-gallery-title">{{ figure.title }}</Text><Text class="component-note">{{ figure.authors.slice(0,3).join(', ') }}{{ figure.authors.length>3?' et al.':'' }}</Text><Text v-if="hits.length" class="component-note">命中：{{ hits.slice(0,4).join(' · ') }}</Text></Box></Button></Box>
    <Text v-if="!loading&&!matches.length" class="empty-state">没有匹配图件，试试英文关键词或减少筛选条件。</Text>
    <Box class="material-actions"><Button size="xs" :disabled="page===0" @click="page--">上一页</Button><Text>{{ page+1 }} / {{ pages }}</Text><Button size="xs" :disabled="page+1>=pages" @click="page++">下一页</Button></Box>
    <ErrorMessage v-if="error&&!selected" class="error-text" :message="error" />
    <Box class="library-source"><Link :href="topconfUrl" target="_blank" rel="noopener noreferrer">Top-Conf Figure Gallery 来源</Link><Link href="/resources/topconf/IMAGES_POLICY.md" target="_blank" rel="noopener noreferrer">原图来源与许可说明</Link><Text class="muted-caption">保留论文与作者署名。原图权利归作者 / 出版方；引用与复用以原文许可为准。</Text></Box>
  </Box>
  <Modal :open="!!selected" label="论文图件参考" size="lg" class="paper-reference-dialog" @close="close">
    <Header><Box><Heading>论文图件参考</Heading><Text class="muted-caption">{{ selected?.venue.toUpperCase() }} {{ selected?.year }} · {{ selected?patternNames[selected.pattern]:'' }}</Text></Box><IconButton icon="close" label="关闭论文图件参考" @click="close" /></Header>
    <ModalBody><template v-if="selected"><Box class="paper-reference-image"><Image v-if="!imageFailed" :src="paperImageUrl(selected)" :alt="`${selected.title} Figure 1 / Teaser`" referrerpolicy="no-referrer" @error="imageFailed=true" /><Text v-else>原图暂时无法加载，可打开原论文或图库来源。</Text></Box><Article class="paper-reference-details"><Heading>{{ selected.title }}</Heading><Text>{{ selected.authors.join(', ') }}</Text><Box class="material-actions"><Link :href="selected.paper" target="_blank" rel="noopener noreferrer">阅读原论文</Link><Link :href="topconfUrl" target="_blank" rel="noopener noreferrer">图库来源</Link></Box><Text class="muted-caption">{{ paperCitation(selected) }}</Text></Article><Text class="muted-caption">“交给助手”会导入此图并勾选图片附件，将版式分析要求放入输入框；发送后由你审阅候选图。</Text></template><ErrorMessage v-if="error" class="error-text" :message="error" /></ModalBody>
    <Footer><Button @click="close">关闭</Button><Button :disabled="!selected||busy" @click="useFigure(false)">{{ busy?'正在导入…':'导入对照' }}</Button><Button variant="primary" :disabled="!selected||busy" @click="useFigure(true)">交给助手</Button></Footer>
  </Modal>
</template>
