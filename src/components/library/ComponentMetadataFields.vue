<script setup lang="ts">
import {Box,Button,Field,Text,TextArea,TextField} from '@fastrd/ui-vue'
import type {ComponentMetadataDraft} from '../../core/componentMetadata'
const props=withDefaults(defineProps<{modelValue:ComponentMetadataDraft;disabled?:boolean;inheritedSources:number}>(),{disabled:false}),emit=defineEmits<{'update:modelValue':[value:ComponentMetadataDraft]}>()
function field(key:'name'|'description'|'tags',event:Event){emit('update:modelValue',{...props.modelValue,[key]:(event.target as HTMLInputElement).value})}
function source(index:number,key:'title'|'reference',event:Event){emit('update:modelValue',{...props.modelValue,sources:props.modelValue.sources.map((row,i)=>i===index?{...row,[key]:(event.target as HTMLInputElement).value}:row)})}
function add(){emit('update:modelValue',{...props.modelValue,sources:[...props.modelValue.sources,{title:'',reference:''}]})}
function remove(index:number){emit('update:modelValue',{...props.modelValue,sources:props.modelValue.sources.filter((_,i)=>i!==index)})}
</script>
<template>
  <Box class="component-metadata-fields">
    <Text class="muted-caption">仅整理检索信息，图中文字和图形保持。已有来源保留，可补充引用。</Text>
    <Field><Text>检索名称</Text><TextField :value="modelValue.name" :disabled="disabled" maxlength="100" aria-label="素材检索名称" @input="field('name',$event)" /></Field>
    <Field><Text>说明</Text><TextArea :value="modelValue.description" :disabled="disabled" maxlength="300" rows="3" aria-label="素材检索说明" @input="field('description',$event)" /></Field>
    <Field><Text>标签 · 逗号分隔，最多 12 个</Text><TextField :value="modelValue.tags" :disabled="disabled" aria-label="素材检索标签" placeholder="编码器, Encoder, 时序模型" @input="field('tags',$event)" /></Field>
    <Text class="muted-caption">原有 {{ inheritedSources }} 条来源；补充引用由填写者提供，不推断论文或科学关系。</Text>
    <Box v-for="(row,index) in modelValue.sources" :key="index" class="component-metadata-source"><Field><Text>补充来源名称</Text><TextField :value="row.title" :disabled="disabled" maxlength="100" :aria-label="`补充来源名称 ${index+1}`" @input="source(index,'title',$event)" /></Field><Field><Text>引用位置</Text><TextArea :value="row.reference" :disabled="disabled" maxlength="500" rows="2" :aria-label="`补充来源引用 ${index+1}`" @input="source(index,'reference',$event)" /></Field><Button size="xs" variant="quiet" :disabled="disabled" @click="remove(index)">移除此补充引用</Button></Box>
    <Button size="xs" variant="quiet" :disabled="disabled||inheritedSources+modelValue.sources.length>=12" @click="add">补充一条引用</Button>
  </Box>
</template>
