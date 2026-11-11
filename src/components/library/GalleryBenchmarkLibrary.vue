<script setup lang="ts">
import {computed,ref} from 'vue'
import {Box,Text,TextField,Select,Button} from '@fastrd/ui-vue'
import {useEditor} from '../../composables/useEditor'
import {galleryBenchmarkSpecs,galleryBenchmark} from '../../data/galleryBenchmarks'
import AssetPreview from './AssetPreview.vue'
const editor=useEditor(),query=ref(''),topic=ref('all')
const entries=galleryBenchmarkSpecs.map(spec=>({spec,asset:galleryBenchmark(spec.id)}))
const topics=[{value:'all',label:'全部主题'},...Array.from(new Set(entries.map(e=>e.spec.topic))).map(value=>({value,label:value}))]
const filtered=computed(()=>entries.filter(({spec,asset})=>(topic.value==='all'||topic.value===spec.topic)&&`${asset.name} ${asset.description} ${asset.tags.join(' ')}`.toLowerCase().includes(query.value.trim().toLowerCase())))
</script>

<template>
  <Box class="gallery-benchmark-library">
    <TextField v-model="query" aria-label="搜索标杆主题" placeholder="检索、训练部署、图像对照…" />
    <Select :value="topic" :options="topics" aria-label="标杆主题分类" @change="topic=$event" />
    <Box class="section-eyebrow"><Text>标杆主题</Text><Text>{{ filtered.length }} 个</Text></Box>
    <Box class="asset-grid">
      <Button v-for="{spec,asset} in filtered" :key="asset.id" class="asset-card" variant="quiet" draggable="true" :aria-label="`查看标杆主题 ${asset.name}`" @dragstart="editor.libraryDrag.start($event,{kind:'asset',asset})" @click="editor.assetDialog.value={mode:'template',asset}">
        <AssetPreview :asset="asset" />
        <Box><Text class="asset-name">{{ asset.name }}</Text><Text class="component-note">{{ spec.id==='training-deployment'?'监督学习示例':'布局骨架' }} · {{ asset.figure.nodes.length }} 个可编辑图元</Text><Text class="component-note">{{ spec.fits }}</Text></Box>
      </Button>
    </Box>
    <Text v-if="!filtered.length" class="empty-state">没有匹配的标杆主题，请调整关键词或分类。</Text>
    <Text class="muted-caption">证据面板保留为空，等待你的图像和数据。来源与适用说明随组件保存。</Text>
  </Box>
</template>

<style scoped>
.gallery-benchmark-library{display:grid;gap:12px}
</style>
