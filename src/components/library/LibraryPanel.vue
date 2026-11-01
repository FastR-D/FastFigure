<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import { Aside, Box, Text, Heading, TextField, Button, Icon, Select, Field } from '../ui'
import { useEditor } from '../../composables/useEditor'
import { ancestors } from '../../core/geometry'
import { componentSeeds as seeds } from '../../data/components'
import { buildRecipe, componentRecipes } from '../../data/recipes'
import AssetPreview from './AssetPreview.vue'
import ComponentPreview from './ComponentPreview'
import StyleGallery from './StyleGallery.vue'
import StyleAssetLibrary from './StyleAssetLibrary.vue'
import ReferencePanel from '../references/ReferencePanel.vue'
import IconLibrary from './IconLibrary.vue'
import PaletteLibrary from './PaletteLibrary.vue'
import { materialIcons, colorPalettes } from '../../data/materials'
import { nodeKindLabels } from '../../core/model'
const PaperGallery=defineAsyncComponent(()=>import('../references/PaperGallery.vue'))
const FigureforgeLibrary=defineAsyncComponent(()=>import('./FigureforgeLibrary.vue'))
const DataChartLibrary=defineAsyncComponent(()=>import('../charts/DataChartLibrary.vue'))
const ComponentRepositoryPanel=defineAsyncComponent(()=>import('./ComponentRepositoryPanel.vue'))
const editor = useEditor()
const query = ref(''), category = ref('all')
const error = ref('')
const filtered = computed(() => seeds.filter(s => (category.value === 'all' || s.category === category.value) && `${s.name} ${s.label} ${s.note} ${s.kind}`.toLowerCase().includes(query.value.toLowerCase())))
const recipes = componentRecipes.map(r => ({ ...r, asset: buildRecipe(r.id, r.defaults) }))
const filteredRecipes = computed(() => recipes.filter(r => (category.value === 'all' || r.category === category.value) && `${r.name} ${r.description} ${r.tags.join(' ')}`.toLowerCase().includes(query.value.toLowerCase())))
const myAssets = computed(() => editor.library.assets.value.filter(a => `${a.name} ${a.description} ${a.tags.join(' ')}`.toLowerCase().includes(query.value.toLowerCase())))
async function importAsset(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  if (!file) return
  try {
    if (file.size > 2_000_000) throw new Error('组件文件不能超过 2 MB')
    const asset = editor.library.importFile(await file.text())
    editor.libraryTab.value = 'mine'; query.value = ''; error.value = ''; editor.notice.value = `已导入${asset.name}`
  } catch (e) { error.value = e instanceof Error && !('issues' in e) && !(e instanceof SyntaxError) ? e.message : '请选择有效的 FastFigure 组件 JSON。当前组件库未改变。' }
  input.value = ''
}
function restore() { try { editor.library.restore(); error.value = '' } catch (e) { error.value = (e as Error).message } }
const layers = computed(() => {
  const doc = editor.figure.value
  const result: { id: string; label: string; isContainer: boolean; depth: number }[] = []
  function visit(parentId: string) {
    for (const child of [...doc.containers, ...doc.nodes].filter(o => o.parentId === parentId)) {
      if('interfaceFor' in child&&child.interfaceFor)continue
      result.push({ id: child.id, label: 'label' in child ? child.name||child.label||nodeKindLabels[child.kind] : child.title, isContainer: !('kind' in child), depth: ancestors(doc, child.id).length })
      if (!('kind' in child)) visit(child.id)
    }
  }
  visit('stage'); return result
})
</script>

<template>
  <Aside class="library-panel" aria-label="素材与图层">
    <Box class="panel-title"><Heading>{{ editor.activePanel.value === 'gallery' ? '顶会图库' : editor.activePanel.value === 'components' ? '组件库' : editor.activePanel.value === 'icons' ? '图标' : editor.activePanel.value === 'palettes' ? '配色' : editor.activePanel.value === 'layers' ? '图层结构' : editor.activePanel.value === 'references' ? '参考图重绘' : '容器样式' }}</Heading><Text class="count-badge">{{ editor.activePanel.value === 'gallery' ? '3449' : editor.activePanel.value === 'components' ? seeds.length + recipes.length + editor.library.assets.value.length : editor.activePanel.value === 'icons' ? materialIcons.length : editor.activePanel.value === 'palettes' ? colorPalettes.length : editor.activePanel.value === 'styles' ? '4 主题 + 6 样式' : editor.activePanel.value === 'references' ? editor.figure.value.references.length : editor.nodeCount.value }}</Text></Box>
    <IconLibrary v-if="editor.activePanel.value === 'icons'" /><PaletteLibrary v-else-if="editor.activePanel.value === 'palettes'" />
    <PaperGallery v-else-if="editor.activePanel.value==='gallery'" />
    <ReferencePanel v-else-if="editor.activePanel.value === 'references'" />
    <Box v-else-if="editor.activePanel.value === 'components'" class="library-body">
      <Box class="library-tabs" role="group" aria-label="组件来源"><Button :aria-pressed="editor.libraryTab.value === 'basic'" variant="quiet" @click="editor.libraryTab.value = 'basic'">基础</Button><Button :aria-pressed="editor.libraryTab.value === 'recipes'" variant="quiet" @click="editor.libraryTab.value = 'recipes'">参数化组合</Button><Button :aria-pressed="editor.libraryTab.value === 'templates'" variant="quiet" @click="editor.libraryTab.value = 'templates'">论文模板</Button><Button :aria-pressed="editor.libraryTab.value === 'charts'" variant="quiet" @click="editor.libraryTab.value = 'charts'">实验图表</Button><Button :aria-pressed="editor.libraryTab.value === 'mine'" variant="quiet" @click="editor.libraryTab.value = 'mine'">我的组件</Button><Button :aria-pressed="editor.libraryTab.value === 'repository'" variant="quiet" @click="editor.libraryTab.value='repository'">本机素材库</Button></Box>
      <FigureforgeLibrary v-if="editor.libraryTab.value==='templates'" />
      <DataChartLibrary v-else-if="editor.libraryTab.value==='charts'" />
      <ComponentRepositoryPanel v-else-if="editor.libraryTab.value==='repository'" />
      <template v-else>
      <Box class="library-search"><Icon name="search" /><TextField v-model="query" aria-label="搜索组件" placeholder="搜索组件..." /></Box>
      <Select v-if="editor.libraryTab.value !== 'mine'" :value="category" :options="[{value:'all',label:'全部组件'}, {value:'basic',label:'基础形状'}, {value:'model',label:'模型与计算'}, {value:'system',label:'系统与数据'}, {value:'structure',label:'论文结构图'}]" aria-label="组件分类" @change="category = $event" />
      <Text v-if="editor.libraryTab.value==='recipes'" class="panel-description">支持分层、层级、辐射、双循环、泳道、集合交叠和圈层等论文结构。配置预览后插入，内部图元可独立编辑。</Text>
      <Box class="section-eyebrow"><Text>{{ editor.libraryTab.value === 'basic' ? '基础科研组件' : editor.libraryTab.value === 'recipes' ? '可调参数的组合' : '当前浏览器的组件' }}</Text><Text>{{ editor.libraryTab.value === 'basic' ? filtered.length : editor.libraryTab.value === 'recipes' ? filteredRecipes.length : myAssets.length }} 个</Text></Box>
      <Box v-if="editor.libraryTab.value === 'basic'" class="component-grid">
        <Button v-for="seed in filtered" :key="seed.id" variant="quiet" class="component-card" :title="seed.reference?.description ?? seed.note" :aria-label="`添加${seed.name}`" @click="editor.addNode(seed.kind, seed.label, {visual:seed.visual,structure:seed.structure,path:seed.path})">
          <Box class="component-thumbnail"><ComponentPreview :kind="seed.kind" :label="seed.label" :radius="seed.visual?.radius" :structure="seed.structure" /><Icon name="plus" /></Box>
          <Text class="component-name">{{ seed.name }}</Text><Text class="component-note">{{ seed.note }}</Text>
        </Button>
      </Box>
      <Box v-else-if="editor.libraryTab.value === 'recipes'" class="asset-grid"><Button v-for="r in filteredRecipes" :key="r.id" class="asset-card" variant="quiet" :aria-label="`配置${r.name}`" @click="editor.assetDialog.value = {mode:'recipe',recipeId:r.id}"><AssetPreview :asset="r.asset" /><Box><Text class="asset-name">{{ r.name }}</Text><Text class="component-note">{{ r.asset.figure.nodes.length }} 个节点 · 点击配置</Text></Box></Button></Box>
      <Box v-else class="asset-grid"><Button v-for="asset in myAssets" :key="asset.id" class="asset-card" variant="quiet" :aria-label="`查看组件 ${asset.name}`" @click="editor.assetDialog.value = {mode:'asset',assetId:asset.id}"><AssetPreview :asset="asset" /><Box><Text class="asset-name">{{ asset.name }}</Text><Text class="component-note">{{ asset.figure.nodes.length }} 个节点 · {{ asset.tags.slice(0,2).join(' / ') || '自定义组件' }}</Text></Box></Button></Box>
      <Text v-if="editor.libraryTab.value === 'basic' && !filtered.length || editor.libraryTab.value === 'recipes' && !filteredRecipes.length" class="empty-state">没有匹配的组件，试试其他关键词。</Text>
      <Text v-if="editor.libraryTab.value === 'mine' && !myAssets.length" class="empty-state">{{ query ? '没有匹配的组件。' : '选中画布中的容器，点击“存为我的组件”。' }}</Text>
      <template v-if="editor.libraryTab.value === 'mine'"><Field><Text>导入组件文件</Text><TextField type="file" accept=".json,application/json" aria-label="导入组件文件" @change="importAsset" /></Field><Text v-if="editor.library.error.value || error" role="alert" class="error-text">{{ error || editor.library.error.value }}</Text><Button v-if="editor.library.deleted.value" @click="restore"><Icon name="undo" />恢复刚移除的组件</Button></template>
      <Box class="library-tip"><Icon name="info" /><Text>{{ editor.libraryTab.value === 'basic' ? '点击添加到画布，选中后可修改标签和位置。' : editor.libraryTab.value === 'recipes' ? '组合会展开为原生节点和连接，每个对象仍可编辑。' : '组件库独立于工程保存，可导出组件 JSON 备份或分享。' }}</Text></Box>
      <Button size="xs" @click="editor.vectorImportOpen.value=true">导入 SVG / draw.io</Button>
      <Box class="library-source"><Icon name="book" /><Text>图元 · 组合配方 · 自定义组件</Text></Box>
      </template>
    </Box>
    <Box v-else-if="editor.activePanel.value === 'layers'" class="library-body layer-list">
      <Button variant="quiet" :aria-pressed="editor.selectedId.value === 'stage'" @click="editor.select('stage')"><Icon name="panel" /><Text>主容器</Text><Text class="layer-type">GROUP</Text></Button>
      <Button v-for="item in layers" :key="item.id" class="child-layer" :style="{paddingLeft: `${12 + item.depth * 12}px`}" variant="quiet" :aria-pressed="editor.selectedIds.value.includes(item.id)" @click="editor.select(item.id, $event.shiftKey)"><Icon :name="item.isContainer ? 'panel' : 'diagram'" /><Text>{{ item.label }}</Text><Text v-if="item.isContainer" class="layer-type">GROUP</Text></Button>
      <Box class="section-eyebrow"><Text>连接</Text><Text>{{ editor.figure.value.edges.length }}</Text></Box>
      <Button v-for="(edge, i) in editor.figure.value.edges" :key="edge.id" variant="quiet" :aria-pressed="editor.selectedId.value === edge.id" @click="editor.select(edge.id)"><Icon name="connect" /><Text>连接 {{ i + 1 }}</Text><Text class="layer-type" :class="{'error-text':editor.routes.value.get(edge.id)?.status === 'blocked'}">{{ editor.routes.value.get(edge.id)?.status === 'blocked' ? '受阻' : 'EDGE' }}</Text></Button>
    </Box>
    <Box v-else class="library-body"><Text class="panel-description">为同一图结构切换视觉风格，保留模块和连接。</Text><StyleGallery /><StyleAssetLibrary /><Box class="library-tip"><Icon name="info" /><Text>手绘笔触使用固定种子，修改和移动时保持风格稳定。</Text></Box></Box>
  </Aside>
</template>
