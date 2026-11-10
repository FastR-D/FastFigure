<script setup lang="ts">
import {computed} from 'vue'
import {Box,Field,Select,Text,TextField} from '@fastrd/ui-vue'
import {defaultPaletteId,paletteById} from '../../data/materials'
import {colorSlotInventory} from '../../core/colorMapping'
import {colorSlotKey,sourceSlotColor,type ColorMapping} from '../../core/colorMappingContract'
import type {FigureDocument} from '../../core/model'
const props=withDefaults(defineProps<{figure:FigureDocument;containerId?:string;modelValue?:ColorMapping[];targetPaletteId?:string}>(),{containerId:'stage',modelValue:undefined,targetPaletteId:defaultPaletteId})
const emit=defineEmits<{'update:modelValue':[value:ColorMapping[]]}>()
const slots=computed(()=>{
  const found=colorSlotInventory(props.figure,props.containerId)
  for(const row of props.modelValue??[])if(!found.some(slot=>colorSlotKey(slot)===colorSlotKey(row)))found.push({...row,sourceColor:sourceSlotColor(row),objects:0,edges:0,examples:[],currentColors:[]})
  return found
})
const mapping=(slot:{sourcePaletteId:string;sourceIndex:number})=>props.modelValue?.find(row=>colorSlotKey(row)===colorSlotKey(slot))
const value=(slot:{sourcePaletteId:string;sourceIndex:number})=>{const row=mapping(slot);return row?`${row.targetPaletteId}|${row.targetIndex}`:'inherit'}
function options(slot:{sourcePaletteId:string;sourceIndex:number}){
  const palette=paletteById.get(props.targetPaletteId)!,row=mapping(slot),found=palette.colors.map((color,index)=>({value:`${palette.id}|${index}`,label:`${index+1} · ${color}`}))
  if(row&&row.targetPaletteId!==palette.id)found.unshift({value:`${row.targetPaletteId}|${row.targetIndex}`,label:`当前 · ${paletteById.get(row.targetPaletteId)!.colors[row.targetIndex]}`})
  return[{value:'inherit',label:'不映射'},...found]
}
function change(slot:{sourcePaletteId:string;sourceIndex:number},selection:string){
  const previous=mapping(slot),rows=(props.modelValue??[]).filter(row=>colorSlotKey(row)!==colorSlotKey(slot))
  if(selection!=='inherit'){const [targetPaletteId,targetIndex]=selection.split('|');rows.push({sourcePaletteId:slot.sourcePaletteId,sourceIndex:slot.sourceIndex,targetPaletteId:targetPaletteId!,targetIndex:Number(targetIndex),role:previous?.role??''})}
  emit('update:modelValue',rows)
}
function role(slot:{sourcePaletteId:string;sourceIndex:number},text:string){emit('update:modelValue',(props.modelValue??[]).map(row=>colorSlotKey(row)===colorSlotKey(slot)?{...row,role:text}:row))}
</script>
<template>
  <Box class="color-map-editor">
    <Text class="muted-caption">按原色槽同时映射，最多 12 项。角色由你填写；固定 RGB 颜色和内部局部映射保持。</Text>
    <Box v-for="slot in slots" :key="colorSlotKey(slot)" class="color-map-row">
      <Box class="color-map-source"><Box :style="{backgroundColor:slot.sourceColor}" /><Text>{{ paletteById.get(slot.sourcePaletteId)?.title??slot.sourcePaletteId.replace('legacy:','原色系 ') }} · {{ slot.sourceIndex+1 }} · {{ slot.sourceColor }}</Text></Box>
      <Text class="muted-caption">{{ slot.objects }} 个图元引用 · {{ slot.edges }} 条连接引用{{ slot.examples.length?` · ${slot.examples.join('、')}`:'' }}</Text>
      <Field><Text>目标色槽</Text><Select :value="value(slot)" :options="options(slot)" :aria-label="`映射目标 ${colorSlotKey(slot)}`" @change="change(slot,$event)" /></Field>
      <TextField :value="mapping(slot)?.role??''" :disabled="!mapping(slot)" maxlength="60" :aria-label="`颜色角色 ${colorSlotKey(slot)}`" placeholder="可选：输入、编码、输出…" @input="role(slot,($event.target as HTMLInputElement).value)" />
    </Box>
    <Text v-if="!slots.length" class="placement-message">当前范围没有可映射的语义色槽；固定 RGB 颜色需逐个编辑。</Text><Text v-if="(modelValue?.length??0)>12" role="alert" class="error-text">颜色映射最多 12 项。</Text>
  </Box>
</template>
