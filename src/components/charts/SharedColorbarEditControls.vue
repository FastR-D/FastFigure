<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {Box,Field,Select,Text,TextField} from '../ui'
import {fontOptions} from '../../data/materials'
import {heatmapPalettes,heatmapPaletteById} from '../../data/heatmapPalettes'
import {formatChartValue} from '../../core/chartText'
import type {sharedColorbarEditTargets} from '../../core/sharedColorbar'
import type {SharedColorbarUpdateRequest} from '../../core/sharedColorbarContract'
const props=defineProps<{groups:ReturnType<typeof sharedColorbarEditTargets>}>(),emit=defineEmits<{change:[request:SharedColorbarUpdateRequest|null]}>()
const id=ref(''),placement=ref<'preserve'|'top'|'bottom'>('preserve'),palette=ref('preserve'),range=ref<'union'|'data'|'fixed'>('union'),min=ref<number|string>(''),max=ref<number|string>(''),centerMode=ref('preserve'),center=ref<number|string>(''),family=ref('preserve'),size=ref<number|string>('')
const group=computed(()=>props.groups.find(group=>group.containerId===id.value))
watch(()=>props.groups.map(group=>group.containerId).join(','),()=>{if(!props.groups.some(group=>group.containerId===id.value))id.value=props.groups.find(group=>group.selected)?.containerId??props.groups.find(group=>group.editable)?.containerId??props.groups[0]?.containerId??''},{immediate:true})
watch(id,()=>{placement.value='preserve';palette.value='preserve';range.value='union';min.value='';max.value='';centerMode.value='preserve';center.value='';family.value='preserve';size.value=''})
watch(palette,value=>{if(heatmapPaletteById.get(value)?.mode==='sequential')centerMode.value='none';else if(centerMode.value==='none')centerMode.value='preserve'})
const request=computed<SharedColorbarUpdateRequest|null>(()=>id.value?{containerId:id.value,placement:placement.value,range:range.value,...(palette.value==='preserve'?{}:{paletteId:palette.value}),...(range.value==='fixed'?{min:min.value===''?NaN:Number(min.value),max:max.value===''?NaN:Number(max.value)}:{}),...(centerMode.value==='none'?{center:null}:centerMode.value==='fixed'?{center:center.value===''?NaN:Number(center.value)}:{}),...(family.value==='preserve'?{}:{fontFamily:family.value as SharedColorbarUpdateRequest['fontFamily']}),...(size.value===''?{}:{fontSize:Number(size.value)}),reason:'同步当前源热图的色阶、范围与共享色标'}:null)
watch(request,value=>emit('change',value),{immediate:true})
</script>
<template>
  <Box class="shared-yaxis-controls" role="group" aria-label="调整已有共享色标">
    <Field><Text>已有色标</Text><Select :value="id" :options="groups.map(group=>({value:group.containerId,label:`${group.title} · ${group.valueLabel}${group.active?'':' · 已停用'}`}))" aria-label="已有共享色标" @change="id=$event" /></Field>
    <Text v-if="!groups.length" class="muted-caption">当前范围没有已有共享色标。</Text>
    <template v-if="group">
      <Text v-if="!group.editable" class="placement-message">{{ group.updateError }}</Text><Text v-else-if="!group.active" class="placement-message">{{ group.error }}；可预览重新统一当前源热图。</Text>
      <Text class="muted-caption">原色标：{{ group.paletteId }} · {{ formatChartValue(group.min) }} ～ {{ formatChartValue(group.max) }}。保留关联和原 ID，不修改数值或换算单位。</Text>
      <Text v-for="chart in group.charts" :key="chart.containerId" class="muted-caption">{{ chart.title }} · {{ chart.valueLabel }} · {{ chart.paletteId }} · {{ formatChartValue(chart.min) }} ～ {{ formatChartValue(chart.max) }}</Text>
      <Field><Text>统一后的色阶</Text><Select :value="palette" :options="[{value:'preserve',label:'保留共享色标的色阶'},...heatmapPalettes.map(p=>({value:p.id,label:p.title}))]" aria-label="已有色标色阶" @change="palette=$event" /></Field>
      <Field><Text>数值范围</Text><Select :value="range" :options="[{value:'union',label:'包含当前各图范围（并集）'},{value:'data',label:'按当前观测重新取范围'},{value:'fixed',label:'指定统一范围'}]" aria-label="已有色标范围方式" @change="range=$event as typeof range" /></Field>
      <template v-if="range==='fixed'"><Field><Text>统一下界</Text><TextField v-model.number="min" type="number" step="any" aria-label="已有色标下界" /></Field><Field><Text>统一上界</Text><TextField v-model.number="max" type="number" step="any" aria-label="已有色标上界" /></Field></template>
      <Field><Text>发散中心</Text><Select :value="centerMode" :options="[{value:'preserve',label:'保留原中心（未设置时按色阶默认）'},{value:'none',label:'清空中心（顺序色阶）'},{value:'fixed',label:'指定中心'}]" aria-label="已有色标中心方式" @change="centerMode=$event" /></Field><Field v-if="centerMode==='fixed'"><Text>中心值</Text><TextField v-model.number="center" type="number" step="any" aria-label="已有色标中心值" /></Field>
      <Field><Text>调整后位置</Text><Select :value="placement" :options="[{value:'preserve',label:'保留当前左上位置'},{value:'top',label:'顶部空白区'},{value:'bottom',label:'底部空白区'}]" aria-label="已有色标位置" @change="placement=$event as typeof placement" /></Field>
      <Field><Text>调整后字体</Text><Select :value="family" :options="[{value:'preserve',label:'保留各文字字体'},...fontOptions]" aria-label="已有色标字体" @change="family=$event" /></Field><Field><Text>调整后字号（留空保留）</Text><TextField v-model.number="size" type="number" min="8" max="24" aria-label="已有色标字号" placeholder="保留各文字字号" /></Field>
      <Text class="muted-caption">按观测重算会替换原固定范围；指定范围不能截断任何值。发散色阶范围须包含中心。手工改色、改刻度或移动色段需先整理，不会被此操作覆盖。</Text>
    </template>
  </Box>
</template>
