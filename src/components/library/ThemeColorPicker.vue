<script setup lang="ts">
import {computed} from 'vue'
import {Box,Button,Text} from '../ui'
import {defaultPaletteId,paletteById} from '../../data/materials'
const props=withDefaults(defineProps<{paletteId?:string;modelValue?:number;effectiveIndex?:number;label:string;inherit?:boolean;disabled?:boolean}>(),{paletteId:undefined,modelValue:undefined,effectiveIndex:undefined,inherit:false,disabled:false})
const emit=defineEmits<{'update:modelValue':[value:number|undefined]}>()
const colors=computed(()=>paletteById.get(props.paletteId??defaultPaletteId)!.colors)
</script>
<template>
  <Box class="theme-color-picker" :aria-label="label">
    <Box class="theme-color-swatches"><Button v-for="(color,index) in colors" :key="index" size="xs" variant="quiet" :disabled="disabled" :aria-label="`${label} ${index+1} ${color}`" :aria-pressed="modelValue!==undefined&&modelValue%colors.length===index" :title="`${index+1} · ${color}`" @click="emit('update:modelValue',index)"><Box :style="{backgroundColor:color}" /></Button></Box>
    <Box class="theme-color-value"><Button size="xs" variant="quiet" :disabled="disabled" :aria-label="`${label}恢复默认`" @click="emit('update:modelValue',undefined)">{{ inherit?'继承父级':'默认首色' }}</Button><Text>{{ colors[(modelValue??effectiveIndex??0)%colors.length] }}</Text></Box>
  </Box>
</template>
