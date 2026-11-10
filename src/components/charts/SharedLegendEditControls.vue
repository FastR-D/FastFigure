<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {Box,Field,Select,Text,TextField} from '@fastrd/ui-vue'
import {fontOptions} from '../../data/materials'
import type {sharedLegendEditTargets} from '../../core/sharedLegend'
import type {SharedLegendUpdateRequest} from '../../core/sharedLegendContract'
const props=defineProps<{groups:ReturnType<typeof sharedLegendEditTargets>}>()
const emit=defineEmits<{change:[request:SharedLegendUpdateRequest|null]}>()
const id=ref(''),placement=ref<'preserve'|'top'|'bottom'>('preserve'),family=ref('preserve'),size=ref<number|string>(''),columns=ref('preserve'),gap=ref<number|string>('')
const sync=ref(false),matches=ref<Record<string,string>>({})
const group=computed(()=>props.groups.find(group=>group.containerId===id.value))
watch(()=>props.groups.map(group=>group.containerId).join(','),()=>{if(!props.groups.some(group=>group.containerId===id.value))id.value=props.groups.find(group=>group.selected)?.containerId??props.groups.find(group=>group.active)?.containerId??props.groups[0]?.containerId??''},{immediate:true})
watch(id,()=>{placement.value='preserve';family.value='preserve';size.value='';columns.value='preserve';gap.value='';sync.value=!group.value?.active&&!!group.value?.syncReady;matches.value=Object.fromEntries((group.value?.sourceEntries??[]).map(entry=>[entry.name,entry.matchingLabelId??'']))},{immediate:true})
const complete=computed(()=>!!group.value&&group.value.sourceEntries.every(entry=>!!matches.value[entry.name]))
const removed=computed(()=>sync.value&&complete.value?group.value!.labels.filter(label=>!Object.values(matches.value).includes(label.id)):[])
const request=computed<SharedLegendUpdateRequest|null>(()=>id.value&&(!sync.value||complete.value)?{containerId:id.value,placement:placement.value,...(family.value==='preserve'?{}:{fontFamily:family.value as SharedLegendUpdateRequest['fontFamily']}),...(size.value===''?{}:{fontSize:Number(size.value)}),...(columns.value==='preserve'?{}:{columns:Number(columns.value)}),...(gap.value===''?{}:{gap:Number(gap.value)}),...(sync.value?{syncEntries:group.value!.sourceEntries.map(entry=>({seriesName:entry.name,previousLabelId:matches.value[entry.name]==='new'?null:matches.value[entry.name]!}))}:{}),reason:sync.value?'按明确对应关系同步当前源系列与原共享图例':'调整已有共享图例的文字与条目排布'}:null)
watch(request,value=>emit('change',value),{immediate:true})
</script>
<template>
  <Box class="shared-yaxis-controls" role="group" aria-label="调整已有共享图例">
    <Field><Text>已有图例</Text><Select :value="id" :options="groups.map(group=>({value:group.containerId,label:`${group.title} · ${group.labels.map(label=>label.name).join(' / ')}${group.active?'':' · 已停用'}`}))" aria-label="已有共享图例" @change="id=$event" /></Field>
    <Text v-if="!groups.length" class="muted-caption">当前范围没有已有共享图例。</Text>
    <template v-if="group">
      <Text v-if="!group.active" class="placement-message">{{ group.error }}；{{ group.syncReady?'可明确匹配后预览同步当前源系列。':group.syncError }}</Text><Text class="muted-caption">对应旧条目保留 ID、字体与手工格式。未填写的字体、字号和间距保留当前设置。</Text><Text v-for="label in group.labels" :key="label.id" class="muted-caption">{{ label.name }} · {{ label.fontFamily }} · {{ +label.fontSize.toFixed(2) }}</Text>
      <Field class="checkbox-field"><TextField :checked="sync" type="checkbox" :disabled="!group.syncReady" aria-label="同步当前源系列" @change="sync=($event.target as HTMLInputElement).checked" /><Text>同步当前源系列名称与图示</Text></Field>
      <template v-if="sync">
        <Text class="muted-caption">每个当前系列选择一个旧条目或明确新增；旧条目只能使用一次。保留旧条目次序，新系列追加。不会修改源图的数据或样式。</Text>
        <Field v-for="entry in group.sourceEntries" :key="entry.name"><Text>{{ entry.name }} 对应</Text><Select :value="matches[entry.name]??''" :options="[{value:'',label:'请选择对应关系'},{value:'new',label:'新增条目'},...group.labels.map(label=>({value:label.id,label:`保留旧条目 · ${label.name}`}))]" :aria-label="`源系列匹配 ${entry.name}`" @change="matches[entry.name]=$event" /></Field>
        <Text v-if="!complete" class="placement-message">请完成全部对应关系；程序不会猜测改名等价。</Text><Text v-if="removed.length" class="placement-message">将移除旧条目：{{ removed.map(label=>label.name).join(' / ') }}。有连接或引线引用时禁止移除。</Text>
        <Text class="muted-caption">图示按当前源图同步；新条目默认沿用旧第一条的字体和字号。手工改过的共享文字 / 图示不覆盖。</Text>
      </template>
      <Field><Text>调整后位置</Text><Select :value="placement" :options="[{value:'preserve',label:'保留当前左上位置'},{value:'top',label:'顶部空白区'},{value:'bottom',label:'底部空白区'}]" aria-label="已有图例位置" @change="placement=$event as typeof placement" /></Field>
      <Field><Text>调整后字体</Text><Select :value="family" :options="[{value:'preserve',label:'保留各条目字体'},...fontOptions]" aria-label="已有图例字体" @change="family=$event" /></Field>
      <Field><Text>调整后字号（留空保留）</Text><TextField v-model.number="size" type="number" min="8" max="36" aria-label="已有图例字号" placeholder="保留各条目字号" /></Field>
      <Field><Text>条目列数</Text><Select :value="columns" :options="[{value:'preserve',label:`保留当前 · ${group.columns||'自动换行'}`},{value:'0',label:'自动换行'},...[1,2,3,4].map(n=>({value:String(n),label:`${n} 列`}))]" aria-label="已有图例列数" @change="columns=$event" /></Field>
      <Field><Text>条目间距（留空保留）</Text><TextField v-model.number="gap" type="number" min="0" max="120" aria-label="已有图例间距" :placeholder="`当前 ${+group.gap.toFixed(2)}`" /></Field>
      <Text class="muted-caption">变大后需要足够空白。冲突时保留当前图件，请调整位置或预留空间。</Text>
    </template>
  </Box>
</template>
