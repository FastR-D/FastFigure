<script setup lang="ts">
import {computed} from 'vue'
import {Box,Field,Select,Text,TextField} from '../ui'
import {useEditor} from '../../composables/useEditor'
import type {FigureNode} from '../../core/model'
import {canBindPathTarget} from '../../core/paths'
const props=defineProps<{node:FigureNode}>(),editor=useEditor(),ends=['start','end'] as const
const targets=computed(()=>editor.figure.value.nodes.filter(n=>n.id!==props.node.id&&canBindPathTarget(n)).map((n,i)=>({value:n.id,label:`${i+1}. ${n.name||n.label||n.kind}`})))
function target(end:'start'|'end'){return editor.figure.value.nodes.find(n=>n.id===props.node.path?.[end]?.nodeId)}
function anchors(end:'start'|'end'){return target(end)?.path?.points.map((p,i)=>({value:String(i),label:`锚点 ${i+1} · ${Math.round(p.x*100)}%, ${Math.round(p.y*100)}%`}))??[]}
function select(end:'start'|'end',id:string){if(editor.selectedId.value===props.node.id)editor.bindPathEndpoint(end,id||undefined)}
function anchor(end:'start'|'end',index:string){const id=props.node.path?.[end]?.nodeId;if(id&&editor.selectedId.value===props.node.id)editor.bindPathEndpoint(end,id,Number(index))}
function position(end:'start'|'end',axis:'x'|'y',event:Event){const value=Number((event.target as HTMLInputElement).value);if(!Number.isFinite(value))return;editor.update(doc=>{const binding=doc.nodes.find(n=>n.id===props.node.id)?.path?.[end];if(binding&&binding.anchorIndex===undefined)binding[axis]=Math.max(0,Math.min(1,value/100))})}
</script>
<template>
  <Box v-if="node.path&&!node.chart?.key&&!node.path.points.some(p=>p.move||p.close)" class="path-bindings">
    <Text class="muted-caption">引线可附着到闭合片层的明确锚点；这只约束几何位置。拖动端点会解除该端绑定。</Text>
    <Box v-for="end in ends" :key="end" class="path-binding-end">
      <Field><Text>{{ end==='start'?'起点附着':'终点附着' }}</Text><Select :value="node.path[end]?.nodeId??''" :options="[{value:'',label:'自由端点'},...targets]" :aria-label="`${end==='start'?'起点':'终点'}绑定对象`" @change="select(end,$event)" /></Field>
      <Field v-if="target(end)?.path"><Text>目标几何锚点</Text><Select :value="String(node.path[end]?.anchorIndex??0)" :options="anchors(end)" :aria-label="`${end==='start'?'起点':'终点'}目标锚点`" @change="anchor(end,$event)" /></Field>
      <Box v-else-if="node.path[end]" class="position-grid"><Field v-for="axis in ['x','y'] as const" :key="axis"><Text>{{ axis.toUpperCase() }} %</Text><TextField type="number" min="0" max="100" :value="Math.round((node.path[end]?.[axis]??.5)*100)" :aria-label="`${end==='start'?'起点':'终点'}绑定${axis.toUpperCase()}百分比`" @change="position(end,axis,$event)" /></Field></Box>
      <Text v-if="node.path[end]?.note" class="muted-caption">{{ node.path[end]?.note }}</Text>
    </Box>
  </Box>
  <Text v-else-if="node.path&&node.chart?.key" class="muted-caption">数据图表路径不提供引线附着；请用独立注释路径标注。</Text>
</template>
