<script setup lang="ts">
import {Box,Button,Field,Select,Text,TextField} from '../ui'
import type {LineStyleDraft} from './lineStyleDraft'
const props=defineProps<{modelValue:LineStyleDraft}>(),emit=defineEmits<{'update:modelValue':[value:LineStyleDraft]}>()
const arrows=[{value:'none',label:'无箭头'},{value:'open',label:'开放箭头'},{value:'filled',label:'实心箭头'}]
function set<K extends keyof LineStyleDraft>(key:K,value:LineStyleDraft[K]){emit('update:modelValue',{...props.modelValue,[key]:value})}
</script>
<template>
  <Box class="panel-layout-controls" aria-label="连线格式项目">
    <Field class="checkbox-field"><TextField :model-value="modelValue.colorEnabled" type="checkbox" aria-label="修改连线颜色" @update:model-value="set('colorEnabled',$event as boolean)" /><Text>统一颜色</Text></Field>
    <Box v-if="modelValue.colorEnabled"><Field class="checkbox-field"><TextField :model-value="modelValue.inheritColor" type="checkbox" aria-label="连线颜色跟随主题" @update:model-value="set('inheritColor',$event as boolean)" /><Text>跟随所在容器的主题色</Text></Field><TextField v-if="!modelValue.inheritColor" :model-value="modelValue.color" type="color" aria-label="统一连线颜色" @update:model-value="set('color',$event as string)" /></Box>
    <Field class="checkbox-field"><TextField :model-value="modelValue.widthEnabled" type="checkbox" aria-label="修改连线线宽" @update:model-value="set('widthEnabled',$event as boolean)" /><Text>统一线宽</Text></Field>
    <Box v-if="modelValue.widthEnabled"><Field class="checkbox-field"><TextField :model-value="modelValue.defaultWidth" type="checkbox" aria-label="恢复默认连线线宽" @update:model-value="set('defaultWidth',$event as boolean)" /><Text>恢复各自默认线宽</Text></Field><TextField v-if="!modelValue.defaultWidth" :model-value="modelValue.width" type="number" min="0.01" max="64" step="0.25" aria-label="统一连线线宽" @update:model-value="set('width',$event as number)" /></Box>
    <Field class="checkbox-field"><TextField :model-value="modelValue.dashEnabled" type="checkbox" aria-label="修改连线虚实" @update:model-value="set('dashEnabled',$event as boolean)" /><Text>统一虚实</Text></Field>
    <Box v-if="modelValue.dashEnabled"><Box class="material-actions"><Button size="xs" @click="set('dash','')">实线</Button><Button size="xs" @click="set('dash','7, 4')">虚线</Button><Button size="xs" @click="set('dash','1, 4')">点线</Button></Box><Field><Text>线段与空隙（留空为实线）</Text><TextField :model-value="modelValue.dash" aria-label="统一连线虚线间隔" placeholder="7, 4" @update:model-value="set('dash',$event as string)" /></Field></Box>
    <Field class="checkbox-field"><TextField :model-value="modelValue.arrowEnabled" type="checkbox" aria-label="修改连线箭头" @update:model-value="set('arrowEnabled',$event as boolean)" /><Text>统一终点箭头</Text></Field>
    <Select v-if="modelValue.arrowEnabled" :value="modelValue.arrow" :options="arrows" aria-label="统一连线箭头" @change="set('arrow',$event as LineStyleDraft['arrow'])" />
    <Field class="checkbox-field"><TextField :model-value="modelValue.startEnabled" type="checkbox" aria-label="修改连线起点箭头" @update:model-value="set('startEnabled',$event as boolean)" /><Text>统一起点箭头</Text></Field>
    <Select v-if="modelValue.startEnabled" :value="modelValue.startArrow" :options="arrows" aria-label="统一连线起点箭头" @change="set('startArrow',$event as LineStyleDraft['startArrow'])" />
    <Field class="checkbox-field"><TextField :model-value="modelValue.sizeEnabled" type="checkbox" aria-label="修改连线箭头大小" @update:model-value="set('sizeEnabled',$event as boolean)" /><Text>统一两端箭头大小</Text></Field>
    <Box v-if="modelValue.sizeEnabled"><Field class="checkbox-field"><TextField :model-value="modelValue.defaultSize" type="checkbox" aria-label="恢复默认箭头大小" @update:model-value="set('defaultSize',$event as boolean)" /><Text>随线宽采用默认大小</Text></Field><TextField v-if="!modelValue.defaultSize" :model-value="modelValue.arrowSize" type="number" min="0.1" max="256" step="1" aria-label="统一连线箭头大小" @update:model-value="set('arrowSize',$event as number)" /></Box>
  </Box>
</template>
