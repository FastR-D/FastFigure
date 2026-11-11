<script setup lang="ts">
import {Box,Disclosure,DisclosureTrigger,Text} from '@fastrd/ui-vue'
import type {StyleAsset} from '../../core/styleAssetContract'
import {paletteById} from '../../data/materials'
import {containerSurfaceLabels} from '../../core/containerSurface'
import {sketchStyleLabels} from '../../core/sketchStyle'
import {styles} from '../../core/model'
import {describeLineStyle} from '../../core/lineAppearance'
import ColorMapSummary from './ColorMapSummary.vue'
import ReferenceUseSummary from '../harness/ReferenceUseSummary.vue'
defineProps<{asset:StyleAsset}>()
</script>
<template>
  <Disclosure class="style-asset-summary">
    <DisclosureTrigger size="xs">风格素材：{{ asset.name }}</DisclosureTrigger><Text>{{ asset.description }}</Text><Text>{{ asset.preset==='sketch'&&asset.sketchStyle?sketchStyleLabels[asset.sketchStyle]:styles.find(s=>s.id===asset.preset)?.name }} · {{ paletteById.get(asset.paletteId)?.title }} · {{ asset.fontFamily }} · {{ containerSurfaceLabels[asset.surface??'plain'] }}</Text><Box class="style-asset-colors"><Box v-for="(color,i) in paletteById.get(asset.paletteId)?.colors" :key="i" :style="{backgroundColor:color}" :title="color" /></Box><Text>默认主题色：{{ paletteById.get(asset.paletteId)?.colors[asset.colorIndex??0] }}</Text><ColorMapSummary :rows="asset.colorMap" /><Text v-if="asset.lineStyle">连线规范 · {{ asset.lineStyle.scope==='edges'?'仅节点连接':'节点连接与开放路径' }}：{{ describeLineStyle(asset.lineStyle.style) }}</Text><Text v-if="asset.paperTheme">主题尺寸：分区标题 {{ asset.paperTheme.containerHeadingSize }}，模块标题 {{ asset.paperTheme.headingSize }}，正文 {{ asset.paperTheme.bodySize }}，注释 {{ asset.paperTheme.captionSize }}；内边距 {{ asset.paperTheme.padding }}，描边 {{ asset.paperTheme.strokeWidth }}。</Text><Text>{{ asset.guide }}</Text><Text class="muted-caption">来源：{{ asset.origin.title }} · 修订 {{ asset.updatedAt }}</Text><ReferenceUseSummary v-if="asset.references.length" :uses="asset.references" /><Text v-if="asset.references.length" class="muted-caption">保存来源文字与指纹；未自动附带来源图片。</Text>
  </Disclosure>
</template>
