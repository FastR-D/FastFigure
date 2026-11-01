<script setup lang="ts">
import type { ComponentAsset } from '../../core/assets'
import { rootContainer } from '../../core/model'
import { Box } from '../ui'
import FigureRenderer from '../figure/FigureRenderer'
defineProps<{ asset: ComponentAsset }>()
</script>

<template>
  <Box class="asset-preview"><FigureRenderer :figure="asset.figure" :viewport="{ x:-8, y:-8, width:rootContainer(asset.figure).width+16, height:rootContainer(asset.figure).height+16 }" :show-document-title="false" /></Box>
</template>
