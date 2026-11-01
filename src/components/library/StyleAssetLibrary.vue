<script setup lang="ts">
import {computed,ref} from 'vue'
import {Article,Box,Button,Field,Heading,Text,TextField} from '../ui'
import {useEditor} from '../../composables/useEditor'
import {paletteById} from '../../data/materials'
import {downloadFile} from '../../core/export'
import StyleAssetSummary from './StyleAssetSummary.vue'
const editor=useEditor(),query=ref(''),typography=ref(true),error=ref('')
const items=computed(()=>{const terms=query.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);return editor.styleLibrary.assets.value.filter(a=>terms.every(t=>[a.name,a.description,a.guide,...a.tags,a.fontFamily,a.origin.title,...a.references.map(r=>r.title)].join(' ').toLocaleLowerCase().includes(t)))})
async function importFile(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;try{if(file.size>60_000)throw new Error('风格文件最多 60 KB');const asset=editor.styleLibrary.importFile(await file.text());editor.notice.value=`已导入${asset.name}`;error.value=''}catch(e){error.value=(e as Error).message}finally{input.value=''}}
function remove(id:string){try{editor.styleLibrary.remove(id);error.value=''}catch(e){error.value=(e as Error).message}}
function restore(){try{editor.styleLibrary.restore();error.value=''}catch(e){error.value=(e as Error).message}}
</script>
<template>
  <Box class="saved-style-library" aria-label="我的风格素材">
    <Box><Heading>我的风格</Heading><Text class="muted-caption">保存配色、字体、容器样式、连线规范与使用说明；几何和科学数据保持。</Text></Box><Button size="xs" @click="editor.styleDialog.value={kind:'capture'}">保存当前风格</Button><TextField v-model="query" type="search" aria-label="搜索风格素材" placeholder="搜索名称、标签、字体或参考来源…" /><Field class="checkbox-field"><TextField v-model="typography" type="checkbox" aria-label="应用风格时统一字体" /><Text>应用时统一原生文字字体，保留字号；图表和定位字形保持</Text></Field>
    <Article v-for="asset in items" :key="asset.id" class="saved-style-card"><Box class="style-asset-colors"><Box v-for="(color,i) in paletteById.get(asset.paletteId)?.colors" :key="i" :style="{backgroundColor:color}" :title="color" /></Box><StyleAssetSummary :asset="asset" /><Box class="material-actions"><Button size="xs" :aria-label="`预览编辑风格 ${asset.name}`" @click="editor.styleDialog.value={kind:'edit',id:asset.id}">预览编辑</Button><Button size="xs" :aria-label="`应用风格 ${asset.name}`" @click="editor.applySavedStyle(asset,typography)">应用当前容器</Button><Button size="xs" :aria-label="`风格用于助手 ${asset.name}`" @click="editor.useSavedStyle(asset)">用于助手</Button><Button size="xs" :aria-label="`备份风格 ${asset.name}`" @click="downloadFile(`${asset.name}.fastfigure-style.json`,JSON.stringify(asset,null,2),'application/json')">备份</Button><Button size="xs" variant="quiet" :aria-label="`移除风格 ${asset.name}`" @click="remove(asset.id)">移除</Button></Box></Article>
    <Text v-if="!items.length" class="muted-caption">{{ query?'没有匹配的风格。':'从当前画布或可采用的绘图方案保存一份风格。' }}</Text><Field><Text>导入风格备份</Text><TextField type="file" accept=".json,application/json" aria-label="导入风格文件" @change="importFile" /></Field><Button v-if="editor.styleLibrary.deleted.value" size="xs" @click="restore">恢复刚移除的风格</Button><Text v-if="error||editor.styleLibrary.error.value" role="alert" class="error-text">{{ error||editor.styleLibrary.error.value }}</Text>
  </Box>
</template>
