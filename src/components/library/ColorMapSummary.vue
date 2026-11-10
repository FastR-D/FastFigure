<script setup lang="ts">
import {Box,Text} from '@fastrd/ui-vue'
import {paletteById} from '../../data/materials'
import {sourceSlotColor,colorSlotKey,type ColorMapping} from '../../core/colorMappingContract'
withDefaults(defineProps<{rows?:ColorMapping[]}>(),{rows:undefined})
</script>
<template>
  <Box v-if="rows?.length" class="color-map-summary"><Box v-for="row in rows" :key="colorSlotKey(row)" class="color-map-summary-row"><Box :style="{backgroundColor:sourceSlotColor(row)}" /><Text>{{ sourceSlotColor(row) }} →</Text><Box :style="{backgroundColor:paletteById.get(row.targetPaletteId)?.colors[row.targetIndex]}" /><Text>{{ paletteById.get(row.targetPaletteId)?.colors[row.targetIndex] }}{{ row.role?` · ${row.role}`:'' }}</Text></Box></Box>
</template>
