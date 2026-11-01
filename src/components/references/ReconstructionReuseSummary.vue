<script setup lang="ts">
import {Box,Heading,Text} from '../ui'
import type {ReconstructionReuseRecord} from '../../core/reconstructionContract'
defineProps<{record:ReconstructionReuseRecord}>()
</script>
<template>
  <Box class="reconstruction-reuse-summary"><Heading>素材辅助重建 · {{ record.assetName }}</Heading><Text>{{ record.reason }}</Text><Text>原图区域 {{ (record.region.x*100).toFixed(1) }}%, {{ (record.region.y*100).toFixed(1) }}% · {{ (record.region.width*100).toFixed(1) }}% × {{ (record.region.height*100).toFixed(1) }}%</Text><Text v-for="(difference,index) in record.differences" :key="index">待核对：{{ difference }}</Text><Text v-if="record.cataloguePreview" class="muted-caption">实际组件图谱 · 第 {{ record.cataloguePreview.tile }} 格 · {{ record.cataloguePreview.sha256 }}</Text><Text class="muted-caption">源版本 {{ record.revision }} · 等比近似匹配，需核对科学含义与连接。</Text></Box>
</template>
