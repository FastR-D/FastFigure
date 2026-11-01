<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {Box,Button,Field,Select,Text,TextField} from '../ui'
import LineStyleControls from '../workspace/LineStyleControls.vue'
import {createLineStyleDraft,lineStyleFromDraft} from '../workspace/lineStyleDraft'
import {captureLineStyle,lineStyleTargets} from '../../core/lineAppearance'
import {lineStylePatchSchema,type LinePreset} from '../../core/lineStyleContract'
import type {FigureDocument} from '../../core/model'
const props=defineProps<{modelValue?:LinePreset;figure:FigureDocument;containerId:string}>(),emit=defineEmits<{'update:modelValue':[value:LinePreset|undefined]}>()
const enabled=ref(!!props.modelValue),scope=ref<LinePreset['scope']>(props.modelValue?.scope??'edges'),sampleId=ref(''),error=ref('')
const choices=computed(()=>{const targets=lineStyleTargets(props.figure,[props.containerId],true,scope.value),name=(id:string)=>props.figure.nodes.find(n=>n.id===id)?.label||id;return[...targets.edges.map(e=>({value:e.id,label:`${name(e.source)} → ${name(e.target)} · ${e.id}`})),...targets.paths.map(p=>({value:p.id,label:`${p.label||p.name||'开放路径'} · ${p.id}`}))]})
sampleId.value=choices.value[0]?.value??''
function initial(){try{return sampleId.value?captureLineStyle(props.figure,sampleId.value):undefined}catch{return undefined}}
const draft=ref(createLineStyleDraft(props.modelValue?.style??initial())),patch=computed(()=>lineStyleFromDraft(draft.value)),valid=computed(()=>lineStylePatchSchema.safeParse(patch.value).success)
watch(choices,items=>{if(!items.some(o=>o.value===sampleId.value))sampleId.value=items[0]?.value??''})
watch([enabled,scope,draft],()=>{emit('update:modelValue',enabled.value?{scope:scope.value,style:patch.value}:undefined)},{deep:true})
function capture(){try{draft.value=createLineStyleDraft(captureLineStyle(props.figure,sampleId.value));error.value=''}catch(e){error.value=(e as Error).message}}
</script>
<template>
  <Box class="panel-layout-controls" aria-label="风格连线规范">
    <Field class="checkbox-field"><TextField v-model="enabled" type="checkbox" aria-label="保存连线规范" /><Text>保存连线规范</Text></Field>
    <template v-if="enabled">
      <Field><Text>应用范围</Text><Select :value="scope" :options="[{value:'edges',label:'仅节点连接'},{value:'all-lines',label:'节点连接与开放路径'}]" aria-label="风格连线范围" @change="scope=$event as typeof scope" /></Field>
      <Box v-if="choices.length"><Field><Text>从当前连线取格式</Text><Select :value="sampleId" :options="choices" aria-label="风格连线格式样本" @change="sampleId=$event" /></Field><Button size="xs" @click="capture">采用所选连线格式</Button></Box>
      <LineStyleControls v-model="draft" />
      <Text class="muted-caption">只应用勾选项；未选项保持。样本未自定义大小时，各自采用默认大小。保留端口、路由和折点，图表管理对象保持；规范不保存渐变或透明度，修改虚线时偏移重置，变换描边保持。</Text>
      <Text v-if="!valid" role="alert" class="error-text">连线规范至少选择一项；线宽为 0.01–64，箭头大小为 0.1–256，虚线间隔不能全为零。</Text>
      <Text v-if="error" role="alert" class="error-text">{{ error }}</Text>
    </template>
  </Box>
</template>
