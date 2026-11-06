<script setup lang="ts">
import { computed,ref,watch } from 'vue'
import { Box, Text, TextField,Select,Button,Icon } from '../ui'
import IconButton from '../ui/IconButton.vue'
import { useEditor } from '../../composables/useEditor'
const editor = useEditor()
const dimensions=ref<{width:number|string;height:number|string}>({width:1000,height:620})
function resetDimensions(){dimensions.value={width:editor.figure.value.canvas.width,height:editor.figure.value.canvas.height}}
watch(()=>[editor.figure.value.canvas.width,editor.figure.value.canvas.height],resetDimensions,{immediate:true})
function changeDimension(axis:'width'|'height'){editor.setCanvasSize(axis,Number(dimensions.value[axis]));resetDimensions()}
const zoomOptions=computed(()=>[...new Set([25,50,75,100,125,150,200,300,editor.zoom.value])].sort((a,b)=>a-b).map(v=>({value:String(v),label:`${v}%`})))
</script>

<template>
  <Box class="canvas-toolbar" role="toolbar" aria-label="画布工具">
    <Box class="toolbar-group">
      <IconButton icon="undo" label="撤销 · Ctrl / ⌘ Z" :disabled="!editor.past.value.length" @click="editor.undo" />
      <IconButton icon="redo" label="重做 · Ctrl / ⌘ Shift Z" :disabled="!editor.future.value.length" @click="editor.redo" />
      <Box class="toolbar-divider" />
      <IconButton icon="cursor" label="选择工具" :active="!editor.connectMode.value" @click="editor.connectMode.value = false; editor.connectionSource.value = null" />
      <IconButton icon="connect" label="连接两个节点" :active="editor.connectMode.value" @click="editor.toggleConnect" />
      <IconButton icon="arrow" label="按点绘制直角箭头" :active="editor.arrowDrawMode.value" @click="editor.arrowEditId.value=null;editor.arrowDrawMode.value=!editor.arrowDrawMode.value" />
      <template v-if="editor.arrowDrawMode.value"><Button size="xs" :disabled="editor.arrowPointCount.value<2" @click="editor.arrowFinishRequest.value++">完成箭头</Button><Button size="xs" @click="editor.arrowDrawMode.value=false">取消绘制</Button></template>
      <IconButton icon="layers" label="自动布局" @click="editor.layoutDialogOpen.value = true" />
      <IconButton icon="grid" label="多子图编排" @click="editor.panelLayoutOpen.value = true" />
      <IconButton icon="chat" label="添加引线注释" @click="editor.calloutOpen.value=true" />
      <IconButton icon="search" label="放大选中局部" :disabled="!editor.selectedObjects.value.length||editor.selectedIds.value.length>24||editor.selectedObjects.value.some(o=>!o.parentId||'interfaceFor'in o&&o.interfaceFor)" @click="editor.detailInsetOpen.value=true" />
      <IconButton icon="ruler" label="论文尺寸与可读性" :active="!!editor.figure.value.publication" @click="editor.publicationOpen.value = true" />
      <Button size="xs" @click="editor.textCheckOpen.value=true"><Icon name="notes" /><Text>检查文字</Text></Button>
      <Button v-if="editor.blockedRoutes.value.length" size="xs" class="routing-warning" @click="editor.select(editor.blockedRoutes.value[0]![0]);editor.activePanel.value='layers'">{{ editor.blockedRoutes.value.length }} 条连线受阻</Button>
      <Box class="toolbar-divider" />
      <Button v-for="direction in [{name:'上',x:0,y:-1,angle:-90},{name:'下',x:0,y:1,angle:90},{name:'左',x:-1,y:0,angle:180},{name:'右',x:1,y:0,angle:0}]" :key="direction.name" size="xs" :aria-label="`向${direction.name}微调`" :title="`向${direction.name}微调 · Shift 为 10 单位`" :disabled="!editor.selectedObjects.value.length" @click="editor.nudgeSelection(direction.x*($event.shiftKey?10:1),direction.y*($event.shiftKey?10:1))"><Icon name="arrow" :style="{transform:`rotate(${direction.angle}deg)`}" /></Button>
    </Box>
    <Box class="toolbar-dimensions" role="group" aria-label="画布尺寸"><TextField v-model="dimensions.width" type="number" min="100" max="4096" step="1" aria-label="画布宽度" title="画布宽度" @change="changeDimension('width')" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" @keydown.esc.prevent.stop="resetDimensions" /><Text aria-hidden="true">×</Text><TextField v-model="dimensions.height" type="number" min="100" max="4096" step="1" aria-label="画布高度" title="画布高度" @change="changeDimension('height')" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" @keydown.esc.prevent.stop="resetDimensions" /></Box>
    <Box class="toolbar-group toolbar-right">
      <IconButton class="group-toolbar-button" icon="group" label="组合为容器 · Ctrl / ⌘ G" :disabled="!editor.canGroup.value" @click="editor.groupSelection" />
      <IconButton icon="grid" label="显示网格" :active="editor.showGrid.value" @click="editor.showGrid.value = !editor.showGrid.value" />
      <IconButton icon="minus" label="缩小画布" @click="editor.setZoom(editor.zoom.value-10)" />
      <Select aria-label="画布缩放" size="sm" :value="String(editor.zoom.value)" :options="zoomOptions" @change="editor.setZoom(Number($event))" />
      <IconButton icon="plus" label="放大画布" @click="editor.setZoom(editor.zoom.value+10)" />
      <IconButton icon="fit" label="适应画布" @click="editor.fitCanvas" />
    </Box>
  </Box>
</template>
