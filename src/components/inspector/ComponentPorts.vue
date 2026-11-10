<script setup lang="ts">
import { computed } from 'vue'
import { Box, Button, Field, Heading, Select, Text, TextField } from '@fastrd/ui-vue'
import { useEditor } from '../../composables/useEditor'
import { directionLabels, namedPorts, sideLabels } from '../../core/componentPorts'
import type { ComponentPort } from '../../core/model'
const editor=useEditor()
const selected=computed(()=>editor.selectedNode.value?.socket?editor.selectedNode.value:undefined)
const owner=computed(()=>editor.selectedContainer.value?.role==='component'?editor.selectedContainer.value:selected.value?editor.figure.value.containers.find(c=>c.id===selected.value!.interfaceFor):undefined)
const ports=computed(()=>owner.value?namedPorts(editor.figure.value,owner.value.id):[])
const count=computed(()=>selected.value?editor.figure.value.edges.filter(e=>e.source===selected.value!.id||e.target===selected.value!.id).length:0)
function change(key:'key'|'label'|'position',event:Event){
  const input=event.target as HTMLInputElement,node=selected.value;if(!node)return
  const value=key==='position'?Number(input.value)/100:input.value
  editor.setNamedPort(node.id,{[key]:value})
  input.value=String(key==='label'?selected.value!.label:key==='position'?Math.round(selected.value!.socket!.position*10000)/100:selected.value!.socket!.key)
}
function connect(){if(!selected.value)return;editor.connectMode.value=true;editor.connectionSource.value=selected.value.id;editor.notice.value='已选输出接口，点击目标输入接口或节点'}
</script>
<template>
  <Box v-if="owner && editor.selectedIds.value.length===1" class="component-port-settings" data-testid="component-ports">
    <Box class="field-heading"><Heading>组件接口</Heading><Text>{{ ports.length }} / 16</Text></Box>
    <Text class="muted-caption">为可复用组件标记输入输出。接口固定在边界上，连线随组件移动；画布标记不进入论文导出。</Text>
    <Box class="component-port-actions"><Button size="xs" :disabled="ports.length>=16" @click="editor.addNamedPort(owner!.id,'input')">添加输入接口</Button><Button size="xs" :disabled="ports.length>=16" @click="editor.addNamedPort(owner!.id,'output')">添加输出接口</Button></Box>
    <Box v-if="ports.length" class="component-port-list">
      <Button v-for="port in ports" :key="port.id" variant="quiet" size="xs" :aria-pressed="port.id===selected?.id" :aria-label="`编辑接口 ${port.label}`" @click="editor.select(port.id)"><Text class="port-direction" :class="`port-direction-${port.socket!.direction}`">{{ directionLabels[port.socket!.direction] }}</Text><Text>{{ port.label }}</Text><Text class="muted-caption">{{ port.socket!.key }}</Text></Button>
    </Box>
    <template v-if="selected?.socket">
      <Field><Text>接口名称</Text><TextField :value="selected.label" maxlength="40" aria-label="接口名称" @change="change('label',$event)" /></Field>
      <Field><Text>接口标识</Text><TextField :value="selected.socket.key" maxlength="32" aria-label="接口标识" @change="change('key',$event)" /></Field>
      <Text class="muted-caption">标识供助手引用；同一组件内唯一，以字母开头。</Text>
      <Field><Text>方向</Text><Select :value="selected.socket.direction" :options="Object.entries(directionLabels).map(([value,label])=>({value,label}))" aria-label="接口方向" @change="editor.setNamedPort(selected!.id,{direction:$event as ComponentPort['direction']})" /></Field>
      <Field><Text>所在边界</Text><Select :value="selected.socket.side" :options="Object.entries(sideLabels).map(([value,label])=>({value,label}))" aria-label="接口边界" @change="editor.setNamedPort(selected!.id,{side:$event as ComponentPort['side']})" /></Field>
      <Field><Text>沿边位置 %</Text><TextField type="number" min="0" max="100" step="1" :value="Math.round(selected.socket.position*10000)/100" aria-label="接口沿边位置" @change="change('position',$event)" /></Field>
      <Text class="muted-caption">左 / 右边从上到下，顶 / 底边从左到右。可拖动画布上的圆点或用方向键微调。</Text>
      <Button v-if="selected.socket.direction!=='input'" size="xs" @click="connect">从此接口连接</Button>
      <Text v-if="count" class="muted-caption">已绑定 {{ count }} 条连线。移除接口将同时移除这些连线，可撤销。</Text>
      <Button size="xs" variant="danger" @click="editor.removeNamedPort(selected!.id)">{{ count?`移除接口及 ${count} 条连线`:'移除接口' }}</Button>
      <Button size="xs" @click="editor.select(owner!.id)">选择接口所属组件</Button>
    </template>
  </Box>
</template>
