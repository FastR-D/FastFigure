<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Article, Box, Button, Heading, Link, Select, Text, TextField } from '../ui'
import { colorPalettes, defaultPaletteId, searchPalettes } from '../../data/materials'
import { foreground } from '../../core/paint'
import { useEditor } from '../../composables/useEditor'
const editor = useEditor(), query = ref(''), source = ref('all'), kind = ref('all'), page = ref(0)
const sources = ['all',...new Set(colorPalettes.map(p=>p.source))].map(value=>({value,label:value==='all'?'全部来源':value}))
const types = [{value:'all',label:'全部类型'}, {value:'design',label:'设计配色'}, {value:'theme',label:'主题配色'}, {value:'categorical',label:'分类色'}, {value:'sequential',label:'连续色'}, {value:'diverging',label:'发散色'}, {value:'cyclical',label:'循环色'}]
const matches = computed(()=>searchPalettes(query.value,source.value).filter(p=>kind.value==='all'||p.kind===kind.value).sort((a,b)=>Number(b.id===defaultPaletteId)-Number(a.id===defaultPaletteId)||Number(b.source==='Color Hunt')-Number(a.source==='Color Hunt')))
const items = computed(()=>matches.value.slice(page.value*24,page.value*24+24))
watch([query,source,kind],()=>{page.value=0})
async function copy(value:string) { try { await navigator.clipboard.writeText(value); editor.notice.value='已复制配色' } catch { editor.notice.value='无法复制，请点击色号后手动复制' } }
</script>
<template>
  <Box class="library-body palette-library" aria-label="配色资源库">
    <Box><Text class="section-eyebrow">COLOR PALETTES</Text><Heading>画盘</Heading></Box>
    <TextField v-model="query" type="search" aria-label="搜索配色" placeholder="搜索色号、科研、柔和、蓝色…" />
    <Select :value="source" :options="sources" aria-label="配色来源" @change="source=$event" /><Select :value="kind" :options="types" aria-label="配色类型" @change="kind=$event" />
    <Box class="palette-quick"><Button v-for="term in ['科研','柔和','蓝色','自然']" :key="term" size="xs" variant="quiet" @click="query=term">{{ term }}</Button></Box>
    <Text class="muted-caption">搜索结果 · {{ matches.length }} 组</Text>
    <Box class="palette-cards">
<Article v-for="item in items" :key="item.id" class="palette-resource-card" :data-palette-id="item.id" :class="{'is-selected':editor.figure.value.style.paletteId===item.id}">
      <Box class="palette-strip"><Button v-for="(color,index) in item.colors" :key="index" variant="quiet" :style="{backgroundColor:color,color:foreground(color)}" :aria-label="`复制色号 ${color}`" :title="color" @click="copy(color)"><Text>{{ color }}</Text></Button></Box>
      <Box class="palette-resource-body"><Box><Text>{{ item.title }}</Text><Text>{{ item.colors.length }} 色</Text></Box><Link :href="item.sourceUrl" target="_blank" rel="noopener noreferrer">{{ item.source }}</Link><Box class="material-actions"><Button size="xs" @click="copy(item.colors.join(' '))">复制</Button><Button size="xs" @click="editor.applyPalette(item.id)">应用画布</Button><Button size="xs" @click="editor.useMaterialPrompt(`请使用配色 ${item.id}（${item.title}，${item.colors.join(' ')}）改进当前图件，按模块语义分配颜色，加入简洁注释与图示，避免每个框只有一行文字。`)">用于助手</Button></Box></Box>
    </Article>
</Box>
    <Box class="material-actions"><Button size="xs" :disabled="page===0" @click="page--">上一页</Button><Text>{{ page+1 }} / {{ Math.max(1,Math.ceil(matches.length/24)) }}</Text><Button size="xs" :disabled="(page+1)*24>=matches.length" @click="page++">下一页</Button></Box>
    <Text class="muted-caption">画布使用方案中的语义色；手动填充优先。颜色来源与授权随资源迁移保留。</Text>
  </Box>
</template>
