<script setup lang="ts">
import {computed,ref} from 'vue'
import {Box,Button,Field,Select,Text,TextField} from '@fastrd/ui-vue'
import {useEditor} from '../../composables/useEditor'
import {clone,type FigureNode} from '../../core/model'
import {defaultGradient,type LinearGradient} from '../../core/gradient'
import {figurePaint} from '../../core/paint'
const props=defineProps<{node:FigureNode}>(),editor=useEditor(),channel=ref<'fill'|'stroke'>('fill')
const field=computed(()=>channel.value==='fill'?'fillGradient':'strokeGradient')
const gradient=computed(()=>props.node.visual?.[field.value])
const name=computed(()=>channel.value==='fill'?'填充':'描边')
const solidColor=computed(()=>{const color=props.node.visual?.[channel.value];return color&&color!=='none'?color:figurePaint(editor.figure.value.style)[channel.value==='fill'?'fill':'ink']})
const angle=computed(()=>{const v=gradient.value?.vector;return v?Math.round(Math.atan2(v[1],v[0])*180/Math.PI):0})
function change(edit:(value:LinearGradient)=>void){editor.update(doc=>{const node=doc.nodes.find(n=>n.id===props.node.id);if(!node)return;const visual=node.visual??={},color=visual[channel.value],value=clone(visual[field.value]??defaultGradient(color&&color!=='none'?color:undefined));edit(value);node.visual={...visual,[field.value]:value,[channel.value]:value.stops[0]!.color}})}
function mode(value:string){if(value==='linear')change(()=>{});else editor.update(doc=>{const node=doc.nodes.find(n=>n.id===props.node.id);if(node)node.visual={...node.visual,[field.value]:null}})}
function direction(value:string){const radians=Number(value)*Math.PI/180,a=Math.cos(radians),b=Math.sin(radians),span=Math.abs(a)+Math.abs(b);if(!Number.isFinite(radians))return;change(g=>g.vector=[a/span,b/span,-(Math.min(0,a)+Math.min(0,b))/span])}
function stop(index:number,key:'offset'|'color'|'opacity',value:string){change(g=>{if(key==='color')g.stops[index]!.color=value;else g.stops[index]![key]=Number(value)/100;g.stops.sort((a,b)=>a.offset-b.offset)})}
function add(){change(g=>{let index=0;for(let i=1;i<g.stops.length-1;i++)if(g.stops[i+1]!.offset-g.stops[i]!.offset>g.stops[index+1]!.offset-g.stops[index]!.offset)index=i;g.stops.splice(index+1,0,{...g.stops[index]!,offset:(g.stops[index]!.offset+g.stops[index+1]!.offset)/2})})}
const value=(event:Event)=>(event.target as HTMLInputElement).value
</script>

<template>
  <Box class="gradient-controls" aria-label="渐变编辑">
    <Field><Text>绘制通道</Text><Select :value="channel" :options="[{value:'fill',label:'填充'},{value:'stroke',label:'描边'}]" aria-label="渐变绘制通道" @change="channel=$event as 'fill'|'stroke'" /></Field>
    <Field><Text>{{ name }}方式</Text><Select :value="gradient?'linear':'solid'" :options="[{value:'solid',label:'单色'},{value:'linear',label:'线性渐变'}]" :aria-label="`${name}方式`" @change="mode" /></Field>
    <Field v-if="!gradient"><Text>{{ name }}颜色</Text><TextField type="color" :value="solidColor" :aria-label="`${name}单色颜色`" @change="editor.paintSelection(channel,value($event))" /><Button size="xs" @click="editor.paintSelection(channel,'none')">无{{ name }}</Button></Field>
    <template v-if="gradient">
      <Field><Text>方向 °</Text><TextField type="number" min="-180" max="180" :value="angle" :aria-label="`${name}渐变角度`" @change="direction(value($event))" /></Field>
      <Text class="muted-caption">导入映射保持；修改角度会将渐变铺满形状边界。</Text>
      <Field><Text>边界外延</Text><Select :value="gradient.spread" :options="[{value:'pad',label:'延伸端点色'},{value:'reflect',label:'镜像重复'},{value:'repeat',label:'重复'}]" :aria-label="`${name}渐变外延`" @change="change(g=>g.spread=$event as LinearGradient['spread'])" /></Field>
      <Field><Text>颜色插值</Text><Select :value="gradient.interpolation" :options="[{value:'sRGB',label:'sRGB'},{value:'linearRGB',label:'线性 RGB'}]" :aria-label="`${name}渐变插值`" @change="change(g=>g.interpolation=$event as LinearGradient['interpolation'])" /></Field>
      <Text class="muted-caption">颜色 · 位置 % · 不透明度 %</Text>
      <Box v-for="(point,index) in gradient.stops" :key="index" class="gradient-stop">
        <TextField type="color" :value="point.color" :aria-label="`${name}停靠点 ${index+1} 颜色`" @change="stop(index,'color',value($event))" />
        <TextField type="number" min="0" max="100" step="1" :value="Math.round(point.offset*10000)/100" :aria-label="`${name}停靠点 ${index+1} 位置百分比`" title="位置 %" @change="stop(index,'offset',value($event))" />
        <TextField type="number" min="0" max="100" step="1" :value="Math.round(point.opacity*10000)/100" :aria-label="`${name}停靠点 ${index+1} 不透明度百分比`" title="不透明度 %" @change="stop(index,'opacity',value($event))" />
        <Button size="xs" :disabled="gradient.stops.length<=2" :aria-label="`删除${name}停靠点 ${index+1}`" @click="change(g=>{g.stops.splice(index,1)})">×</Button>
      </Box>
      <Button size="xs" :disabled="gradient.stops.length>=32" @click="add">添加停靠点</Button>
    </template>
  </Box>
</template>

<style scoped>
.gradient-controls{display:grid;gap:8px;padding:12px 0;border-top:1px solid var(--line,#e7e9ef)}
.gradient-stop{display:grid;grid-template-columns:32px 1fr 1fr 26px;gap:5px;align-items:center}
.gradient-stop :deep(input){min-width:0;width:100%}
</style>
