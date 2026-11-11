<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { Box, Button, Image, Link, Text, TextField } from '@fastrd/ui-vue'
import { ErrorMessage } from '../ui'
import { useEditor } from '../../composables/useEditor'
import { convertFigureforgeTemplate, figureforgeResources, figureforgeUrl, type FigureforgeTemplate } from '../../core/figureforge'
const editor=useEditor(),templates=shallowRef<FigureforgeTemplate[]>([]),error=ref(''),busy=ref(''),query=ref('')
const loading=ref(true)
const abort=new AbortController()
const available=computed(()=>templates.value.filter(t=>!t.unavailable&&`${t.id} ${t.name}`.toLowerCase().includes(query.value.toLowerCase())))
onMounted(async()=>{try{const r=await fetch('/resources/figureforge/templates.json',{signal:abort.signal});if(!r.ok)throw new Error('模板资源读取失败');templates.value=figureforgeResources.parse(await r.json()).templates}catch(e){if(!abort.signal.aborted)error.value=e instanceof Error&&!('issues' in e)?e.message:'模板资源格式不符'}finally{loading.value=false}})
onBeforeUnmount(()=>abort.abort())
async function choose(template:FigureforgeTemplate){
  if(busy.value)return
  busy.value=template.id;error.value=''
  try{
    const asset=await loadTemplate(template)
    if(!abort.signal.aborted)editor.assetDialog.value={mode:'template',asset}
  }catch(e){if(!abort.signal.aborted)error.value=e instanceof Error&&!('issues' in e)?e.message:'模板转换超出当前图元限制'}finally{busy.value=''}
}
async function loadTemplate(template:FigureforgeTemplate){
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(template.svg)),hex=[...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('')
  if(hex!==template.sha256)throw new Error('模板指纹不符，请重新构建资源')
  await Promise.all([400,700].map(weight=>document.fonts.load(`${weight} 16px MiSans`)))
  return convertFigureforgeTemplate(template)
}
</script>
<template>
  <Box class="figureforge-library">
    <TextField v-model="query" type="search" aria-label="搜索论文模板" placeholder="折线、柱状、面板、scatter…" />
    <Box class="section-eyebrow"><Text>{{ loading?'正在加载模板…':`可编辑模板 · ${available.length}` }}</Text><Text>示例数据</Text></Box>
    <Box class="asset-grid"><Button v-for="template in available" :key="template.id" variant="quiet" class="asset-card" :disabled="!!busy" draggable="true" @dragstart="editor.libraryDrag.start($event,{kind:'asset',asset:()=>loadTemplate(template)})" :aria-label="`配置模板 ${template.name}`" @click="choose(template)"><Image class="template-thumbnail" :draggable="false" :src="`data:image/svg+xml;charset=utf-8,${encodeURIComponent(template.svg)}`" :alt="`${template.name}示例预览`" loading="lazy" /><Box><Text class="asset-name">{{ template.name }}</Text><Text class="component-note">{{ busy===template.id?'正在转换…':'原生图元 · 拖拽插入 / 点击配置' }}</Text></Box></Button></Box>
    <ErrorMessage v-if="error" class="error-text" :message="error" />
    <Text class="muted-caption">数值、误差线和显著性均为示例。{{ templates.filter(t=>t.unavailable).length }} 个模板待渐变支持或上游几何校正。</Text>
    <Box class="material-actions"><Link :href="figureforgeUrl" target="_blank" rel="noopener noreferrer">FigureForge 来源</Link><Link href="/resources/figureforge/LICENSE" target="_blank" rel="noopener noreferrer">MIT 许可</Link></Box>
  </Box>
</template>
