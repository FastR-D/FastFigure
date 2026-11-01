<script setup lang="ts">
import {Box,Button,Field,Text,TextField} from '../ui'
const props=defineProps<{modelValue:string[];options:{value:string;label:string}[];label:string}>()
const emit=defineEmits<{'update:modelValue':[value:string[]]}>()
function choose(id:string,event:Event){const checked=(event.target as HTMLInputElement).checked;emit('update:modelValue',checked?[...props.modelValue,id]:props.modelValue.filter(value=>value!==id))}
function move(index:number,delta:number){const next=[...props.modelValue],target=index+delta;if(target<0||target>=next.length)return;[next[index],next[target]]=[next[target]!,next[index]!];emit('update:modelValue',next)}
</script>
<template>
  <Box class="chart-key-columns" role="group" :aria-label="label">
    <Text>{{ label }} · 选择 1–3 列</Text>
    <Box class="chart-key-options"><Field v-for="option in options" :key="option.value"><TextField type="checkbox" :checked="modelValue.includes(option.value)" :disabled="modelValue.length>=3&&!modelValue.includes(option.value)" :aria-label="`${label} ${option.label}`" @change="choose(option.value,$event)" /><Text>{{ option.label }}</Text></Field></Box>
    <Box v-for="(id,index) in modelValue" :key="id" class="material-actions"><Text>{{ index+1 }}. {{ options.find(option=>option.value===id)?.label||id }}</Text><Button size="xs" :disabled="index===0" :aria-label="`上移${label} ${options.find(option=>option.value===id)?.label||id}`" @click="move(index,-1)">上移</Button><Button size="xs" :disabled="index===modelValue.length-1" :aria-label="`下移${label} ${options.find(option=>option.value===id)?.label||id}`" @click="move(index,1)">下移</Button></Box>
  </Box>
</template>
