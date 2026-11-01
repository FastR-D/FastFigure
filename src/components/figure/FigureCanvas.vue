<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { Box, Text, Icon, Button, Image } from '../ui'
import { useEditor } from '../../composables/useEditor'
import { findObject, type Rect } from '../../core/geometry'
import FigureRenderer from './FigureRenderer'
import ReferenceGuide from '../references/ReferenceGuide.vue'
import InlineTextEditor from './InlineTextEditor.vue'
import FigureTextCheckDialog from './FigureTextCheckDialog.vue'
import {edgeWaypointPoints} from '../../core/edgeWaypoints'
import { pathPoints } from '../../core/paths'
const editor = useEditor()
const { figure, selectedIds, zoom, showGrid, connectMode, connectionSource } = editor
const selectionRect = ref<Rect | null>(null)
const textCheckOpen=ref(false)
let cancelActive: (() => void) | undefined
function track(event: PointerEvent, move: (point: DOMPoint, start: DOMPoint) => void, done: () => void, cancel: () => void) {
  cancelActive?.()
  const target = event.currentTarget as SVGElement
  const svg = target instanceof SVGSVGElement ? target : target.ownerSVGElement
  if (!svg || event.button !== 0) return
  event.preventDefault()
  const point = (e: PointerEvent) => { const matrix = svg.getScreenCTM(); return matrix ? new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse()) : new DOMPoint() }
  const start = point(event)
  const cleanup = () => {
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel); window.removeEventListener('keydown', onKey)
    cancelActive = undefined
  }
  const onMove = (e: PointerEvent) => { if (e.pointerId === event.pointerId) move(point(e), start) }
  const onUp = (e: PointerEvent) => { if (e.pointerId === event.pointerId) { cleanup(); done() } }
  const onCancel = () => { cleanup(); cancel() }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
  window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel); window.addEventListener('keydown', onKey)
  cancelActive = onCancel
}
function startDrag(id: string, event: PointerEvent) {
  if (event.button !== 0 || cancelActive) return
  const wasConnecting = connectMode.value
  if (wasConnecting || event.shiftKey || !selectedIds.value.includes(id)) editor.select(id, event.shiftKey)
  if (wasConnecting || event.shiftKey) return
  editor.beginDrag()
  let previous: DOMPoint | undefined
  track(event, (point, start) => { const last = previous ?? start; editor.moveSelection(point.x - last.x, point.y - last.y); previous = point }, editor.endDrag, editor.cancelDrag)
}
function startResize(event: PointerEvent) {
  if (event.button !== 0 || cancelActive) return
  const object = findObject(figure.value, editor.selectedId.value)
  if (!object) return
  const width = object.width, height = object.height
  editor.beginDrag()
  track(event, (point, start) => editor.resize(width + point.x - start.x, height + point.y - start.y), editor.endDrag, editor.cancelDrag)
}
function startRegion(event: PointerEvent) {
  if (event.button !== 0 || connectMode.value || cancelActive) return
  let region: Rect | null = null
  track(event, (point, start) => {
    region = { x: Math.min(point.x, start.x), y: Math.min(point.y, start.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) }
    selectionRect.value = region
  }, () => {
    if (region && region.width > 3 && region.height > 3) editor.selectRegion(region, event.shiftKey)
    else if (!event.shiftKey) editor.select('stage')
    selectionRect.value = null
  }, () => { selectionRect.value = null })
}
function startNamedPort(id:string,event:PointerEvent) {
  if(event.button!==0||cancelActive)return
  if(connectMode.value){editor.select(id);return}
  const node=figure.value.nodes.find(n=>n.id===id);if(!node?.socket)return
  editor.select(id);editor.beginDrag()
  const {x,y,width,height}=node,{side}=node.socket
  track(event,point=>editor.dragNamedPort(id,side==='left'||side==='right'?(point.y-y)/height:(point.x-x)/width),editor.endDrag,editor.cancelDrag)
}
function namedPortKey(id:string,delta:number){const node=figure.value.nodes.find(n=>n.id===id);if(node?.socket){editor.select(id);editor.setNamedPort(id,{position:Math.max(0,Math.min(1,node.socket.position+delta))})}}
function startEdgePoint(id:string,index:number,event:PointerEvent){
  if(event.button!==0||cancelActive)return
  const edge=figure.value.edges.find(e=>e.id===id),origin=edge&&edgeWaypointPoints(figure.value,edge)[index]
  if(!origin)return
  editor.select(id);editor.selectedEdgePoint.value=index;editor.beginDrag()
  track(event,(point,start)=>editor.dragEdgePoint(id,index,{x:origin.x+point.x-start.x,y:origin.y+point.y-start.y}),editor.endDrag,editor.cancelDrag)
}
function edgePointKey(id:string,index:number,dx:number,dy:number){
  const edge=figure.value.edges.find(e=>e.id===id),point=edge&&edgeWaypointPoints(figure.value,edge)[index]
  if(point){editor.select(id);editor.selectedEdgePoint.value=index;editor.setEdgePoint(id,index,{x:point.x+dx,y:point.y+dy})}
}
function startPathPoint(id:string,index:number,event:PointerEvent) {
  if(event.button!==0||cancelActive)return
  const node=figure.value.nodes.find(n=>n.id===id),origin=node&&pathPoints(figure.value,node)[index]
  if(!origin)return
  editor.select(id);editor.selectedPathPoint.value=index;editor.beginDrag()
  track(event,(point,start)=>editor.dragPathPoint(id,index,{x:origin.x+point.x-start.x,y:origin.y+point.y-start.y}),editor.endDrag,editor.cancelDrag)
}
function startPathControl(id:string,index:number,key:'c1'|'c2',event:PointerEvent) {
  if(event.button!==0||cancelActive)return
  const node=figure.value.nodes.find(n=>n.id===id),origin=node&&pathPoints(figure.value,node)[index]?.[key]
  if(!origin)return
  editor.select(id);editor.selectedPathPoint.value=index;editor.beginDrag()
  track(event,(point,start)=>editor.dragPathControl(id,index,key,{x:origin.x+point.x-start.x,y:origin.y+point.y-start.y}),editor.endDrag,editor.cancelDrag)
}
function pathControlKey(id:string,index:number,key:'c1'|'c2',dx:number,dy:number) {
  const node=figure.value.nodes.find(n=>n.id===id),point=node&&pathPoints(figure.value,node)[index]?.[key]
  if(point){editor.select(id);editor.selectedPathPoint.value=index;editor.setPathControl(index,key,{x:point.x+dx,y:point.y+dy})}
}
function pathPointKey(id:string,index:number,dx:number,dy:number) {
  const node=figure.value.nodes.find(n=>n.id===id),point=node&&pathPoints(figure.value,node)[index]
  if(point){editor.select(id);editor.selectedPathPoint.value=index;editor.setPathPoint(index,{x:point.x+dx,y:point.y+dy})}
}
function pathPointRemove(id:string,index:number){editor.select(id);editor.selectedPathPoint.value=index;editor.removePathBend()}
function resizeKey(dx: number, dy: number) {
  const object = findObject(figure.value, editor.selectedId.value)
  if (!object) return
  if (dx) editor.setSize('width', object.width + dx)
  if (dy) editor.setSize('height', object.height + dy)
}
onBeforeUnmount(() => { cancelActive?.(); editor.cancelDrag() })
</script>

<template>
  <Box class="canvas-stage" :class="{ 'with-grid': showGrid, 'is-connecting': connectMode }">
    <Box class="canvas-guidance">
      <Text class="canvas-label">FIGURE 01</Text>
      <Text>{{ connectMode ? '依次点击起点和终点，建立连接' : '双击文字编辑 · Shift 多选 · Alt 单击选路径' }}</Text>
    </Box>
    <Box class="canvas-comparison" :class="{ 'has-reference': editor.activeReference.value && editor.referenceMode.value === 'side' }">
      <ReferenceGuide v-if="editor.referenceMode.value === 'side' && editor.activeReference.value" />
      <Box class="canvas-viewport">
      <Box class="figure-paper" :style="{ width: `${zoom}%` }">
        <FigureRenderer :figure="figure" :routes="editor.routes.value" :selected-ids="selectedIds" :selection-rect="selectionRect" :selected-path-point="editor.selectedPathPoint.value" :selected-edge-point="editor.selectedEdgePoint.value" @edge-point-down="startEdgePoint" @edge-point-key="edgePointKey" @edge-point-remove="editor.removeEdgePoint" :source-id="connectionSource ?? ''" :connect-mode="connectMode" interactive @object-down="startDrag" @select="editor.select" @background-down="startRegion" @resize-down="startResize" @resize-key="resizeKey" @edit="editor.beginTextEdit" @path-point-down="startPathPoint" @path-point-key="pathPointKey" @path-point-remove="pathPointRemove" @path-control-down="startPathControl" @path-control-key="pathControlKey" @named-port-down="startNamedPort" @named-port-key="namedPortKey" />
        <InlineTextEditor />
        <Box v-if="editor.referenceMode.value === 'overlay' && editor.activeReference.value" class="reference-overlay" data-testid="reference-overlay" aria-hidden="true">
          <Image :src="editor.activeReference.value.dataUrl" alt="" :style="{ left: `${editor.activeReference.value.placement.x / 10}%`, top: `${editor.activeReference.value.placement.y / 6.2}%`, width: `${editor.activeReference.value.placement.width / 10}%`, height: `${editor.activeReference.value.placement.height / 6.2}%`, opacity: editor.referenceOpacity.value }" />
        </Box>
      </Box>
      </Box>
    </Box>
    <Box class="canvas-bottom">
      <Text><Icon name="check" />{{ selectedIds.length > 1 ? `已选择 ${selectedIds.length} 个对象` : '文字与连接可独立编辑' }}</Text>
      <Button v-if="editor.blockedRoutes.value.length" variant="quiet" size="xs" class="routing-warning" @click="editor.select(editor.blockedRoutes.value[0]![0]); editor.activePanel.value = 'layers'">{{ editor.blockedRoutes.value.length }} 条连线受阻</Button>
      <Button variant="quiet" size="xs" @click="textCheckOpen=true">检查文字</Button>
      <Button variant="quiet" size="xs" @click="editor.selectedId.value = 'stage'">容器样式 <Icon name="arrow" /></Button>
    </Box>
    <FigureTextCheckDialog :open="textCheckOpen" @close="textCheckOpen=false" />
  </Box>
</template>
