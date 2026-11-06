<script setup lang="ts">
import { nextTick,onBeforeUnmount, ref,watch } from 'vue'
import { Box, Image } from '../ui'
import { useEditor } from '../../composables/useEditor'
import { findObject, type Rect } from '../../core/geometry'
import FigureRenderer from './FigureRenderer'
import ReferenceGuide from '../references/ReferenceGuide.vue'
import InlineTextEditor from './InlineTextEditor.vue'
import FigureTextCheckDialog from './FigureTextCheckDialog.vue'
import {edgeWaypointPoints} from '../../core/edgeWaypoints'
import { pathPoints } from '../../core/paths'
import {snapSelection,selectionBounds,type AlignmentGuide} from '../../core/alignmentSnap'
import {useArrowDrawing} from '../../composables/useArrowDrawing'
const editor = useEditor()
const arrowDrawing=useArrowDrawing(editor)
function arrowDown(event:PointerEvent){const svg=(event.currentTarget as HTMLElement).querySelector<SVGSVGElement>('[data-testid="figure-canvas"]');if(svg)arrowDrawing.down(event,svg)}
function arrowHover(event:PointerEvent){if(panning.value)return;const svg=(event.currentTarget as HTMLElement).querySelector<SVGSVGElement>('[data-testid="figure-canvas"]');if(svg)arrowDrawing.hover(event,svg)}
function arrowFinish(event:MouseEvent){if(editor.arrowDrawMode.value){event.preventDefault();event.stopPropagation();arrowDrawing.finish()}}
const { figure, selectedIds, zoom, showGrid, connectMode, connectionSource } = editor
const selectionRect = ref<Rect | null>(null)
const guides=ref<AlignmentGuide[]>([]),pan=ref({x:0,y:0}),panning=ref(false)
const dropPoint=ref<{x:number;y:number}|null>(null)
watch(editor.libraryDrag.active,value=>{if(!value)dropPoint.value=null})
watch(editor.viewReset,()=>{pan.value={x:0,y:0}})
let wheelFrame=0,wheelDelta=0,wheelPosition={x:0,y:0}
let cancelActive: (() => void) | undefined
function zoomWheel(event:WheelEvent){
  event.preventDefault();if(cancelActive)return
  const viewport=event.currentTarget as HTMLElement
  wheelDelta+=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1);wheelPosition={x:event.clientX,y:event.clientY}
  if(wheelFrame)return
  wheelFrame=requestAnimationFrame(async()=>{
    wheelFrame=0;const paper=viewport.querySelector<HTMLElement>('.figure-paper');if(!paper)return
    const before=paper.getBoundingClientRect(),at={x:(wheelPosition.x-before.left)/before.width,y:(wheelPosition.y-before.top)/before.height},cursor={...wheelPosition}
    editor.setZoom(zoom.value*Math.exp(-wheelDelta*.0015));wheelDelta=0;await nextTick()
    const after=paper.getBoundingClientRect();pan.value={x:pan.value.x+cursor.x-after.left-at.x*after.width,y:pan.value.y+cursor.y-after.top-at.y*after.height}
  })
}
function startPan(event:PointerEvent){
  if(event.button!==2)return
  event.preventDefault();event.stopImmediatePropagation();cancelActive?.();panning.value=true
  const target=event.currentTarget as HTMLElement,start={x:event.clientX,y:event.clientY},origin={...pan.value}
  target.setPointerCapture(event.pointerId)
  const nativeEvents=['mousedown','mousemove','mouseup','auxclick','contextmenu','dragstart','selectstart'] as const
  const suppress=(e:Event)=>{e.preventDefault();e.stopImmediatePropagation()}
  const move=(e:PointerEvent)=>{if(e.pointerId===event.pointerId){suppress(e);pan.value={x:origin.x+e.clientX-start.x,y:origin.y+e.clientY-start.y}}}
  const cleanup=()=>{window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',cancel,true);window.removeEventListener('keydown',key);window.removeEventListener('blur',cancel);target.removeEventListener('lostpointercapture',cancel);nativeEvents.forEach(type=>window.removeEventListener(type,suppress,true));if(target.hasPointerCapture(event.pointerId))target.releasePointerCapture(event.pointerId);panning.value=false;cancelActive=undefined}
  const up=(e:PointerEvent)=>{if(e.pointerId===event.pointerId)cleanup()},cancel=()=>{pan.value=origin;cleanup()},key=(e:KeyboardEvent)=>{if(e.key==='Escape')cancel()}
  nativeEvents.forEach(type=>window.addEventListener(type,suppress,{capture:true,passive:false}))
  window.addEventListener('pointermove',move,{capture:true,passive:false});window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',cancel,true);window.addEventListener('keydown',key);window.addEventListener('blur',cancel);target.addEventListener('lostpointercapture',cancel);cancelActive=cancel
}
function suppressRightMouse(event:MouseEvent){if(event.button===2||(event.buttons&2)||panning.value){event.preventDefault();event.stopImmediatePropagation()}}
function libraryPoint(event:DragEvent){
  const svg=(event.currentTarget as HTMLElement).querySelector<SVGSVGElement>('[data-testid="figure-canvas"]'),matrix=svg?.getScreenCTM()
  if(!matrix)return null
  const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse())
  return point.x>=0&&point.y>=0&&point.x<=figure.value.canvas.width&&point.y<=figure.value.canvas.height?{x:point.x,y:point.y}:null
}
function libraryOver(event:DragEvent){
  if(!editor.libraryDrag.accepts(event)||panning.value||cancelActive)return
  event.preventDefault();event.stopPropagation();event.dataTransfer!.dropEffect='copy';dropPoint.value=libraryPoint(event)
}
function libraryLeave(event:DragEvent){if(!(event.relatedTarget instanceof Node)||(event.currentTarget as HTMLElement).contains(event.relatedTarget)===false)dropPoint.value=null}
function libraryDrop(event:DragEvent){
  event.preventDefault();event.stopPropagation();dropPoint.value=null
  if(panning.value||cancelActive)return
  const point=libraryPoint(event),item=editor.libraryDrag.take(event)
  if(point&&item)void editor.dropLibraryItem(item,point)
}
function track(event: PointerEvent, move: (point: DOMPoint, start: DOMPoint,event:PointerEvent) => void, done: () => void, cancel: () => void) {
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
  const onMove = (e: PointerEvent) => { if (e.pointerId === event.pointerId) move(point(e), start,e) }
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
  const target=event.currentTarget as SVGElement;(target instanceof SVGSVGElement?target:target.ownerSVGElement)?.focus({preventScroll:true})
  editor.beginDrag()
  const origin=selectionBounds(figure.value,selectedIds.value),svg=target instanceof SVGSVGElement?target:target.ownerSVGElement,scale=Math.abs(svg?.getScreenCTM()?.a??1)
  track(event, (point,start,e) => {
    const wanted={...origin,x:origin.x+point.x-start.x,y:origin.y+point.y-start.y},snapped=e.altKey?{...wanted,guides:[]}:snapSelection(figure.value,selectedIds.value,wanted,5/scale),current=selectionBounds(figure.value,selectedIds.value)
    editor.moveSelection(snapped.x-current.x,snapped.y-current.y);const actual=selectionBounds(figure.value,selectedIds.value)
    guides.value=Math.abs(actual.x-snapped.x)<.01&&Math.abs(actual.y-snapped.y)<.01?snapped.guides:[]
  },()=>{guides.value=[];editor.endDrag()},()=>{guides.value=[];editor.cancelDrag()})
}
function startResize(event: PointerEvent) {
  if (event.button !== 0 || cancelActive) return
  const object = findObject(figure.value, editor.selectedId.value)
  if (!object) return
  const width = object.width, height = object.height
  editor.beginDrag()
  track(event, (point, start,e) => editor.resize(width + point.x - start.x, height + point.y - start.y,e.shiftKey?undefined:{width,height}), editor.endDrag, editor.cancelDrag)
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
onBeforeUnmount(() => { cancelActive?.();cancelAnimationFrame(wheelFrame); editor.cancelDrag();editor.libraryDrag.clear() })
</script>

<template>
  <Box class="canvas-stage" :class="{ 'with-grid': showGrid, 'is-connecting': connectMode }">
    <Box class="canvas-comparison" :class="{ 'has-reference': editor.activeReference.value && editor.referenceMode.value === 'side' }">
      <ReferenceGuide v-if="editor.referenceMode.value === 'side' && editor.activeReference.value" />
      <Box class="canvas-viewport" :class="{'is-panning':panning}" @wheel="zoomWheel" @pointerdown.capture="startPan" @mousedown.capture="suppressRightMouse" @mousemove.capture="suppressRightMouse" @mouseup.capture="suppressRightMouse" @auxclick.capture="suppressRightMouse" @contextmenu.capture.prevent.stop @dragover="libraryOver" @dragleave="libraryLeave" @drop="libraryDrop">
      <Box class="figure-paper" :class="{'is-drawing':editor.arrowDrawMode.value&&!panning,'is-component-drop':!!dropPoint}" :style="{ width: `${zoom}%`,aspectRatio:`${figure.canvas.width} / ${figure.canvas.height}`,transform:`translate(${pan.x}px,${pan.y}px)` }" @pointerdown.capture="arrowDown" @pointermove.capture="arrowHover" @dblclick.capture="arrowFinish">
        <FigureRenderer :figure="figure" :routes="editor.routes.value" :selected-ids="selectedIds" :alignment-guides="guides" :arrow-draft="arrowDrawing.points.value" :arrow-preview="arrowDrawing.preview.value" :selection-rect="selectionRect" :selected-path-point="editor.selectedPathPoint.value" :selected-edge-point="editor.selectedEdgePoint.value" @edge-point-down="startEdgePoint" @edge-point-key="edgePointKey" @edge-point-remove="editor.removeEdgePoint" :source-id="connectionSource ?? ''" :connect-mode="connectMode" interactive @object-down="startDrag" @select="editor.select" @background-down="startRegion" @resize-down="startResize" @resize-key="resizeKey" @edit="editor.beginTextEdit" @path-point-down="startPathPoint" @path-point-key="pathPointKey" @path-point-remove="pathPointRemove" @path-control-down="startPathControl" @path-control-key="pathControlKey" @named-port-down="startNamedPort" @named-port-key="namedPortKey" />
        <Box v-if="dropPoint" class="component-drop-marker" data-component-drop aria-hidden="true" :style="{left:`${dropPoint.x/figure.canvas.width*100}%`,top:`${dropPoint.y/figure.canvas.height*100}%`}" />
        <InlineTextEditor />
        <Box v-if="editor.referenceMode.value === 'overlay' && editor.activeReference.value" class="reference-overlay" data-testid="reference-overlay" aria-hidden="true">
          <Image :src="editor.activeReference.value.dataUrl" alt="" :style="{ left: `${editor.activeReference.value.placement.x / figure.canvas.width*100}%`, top: `${editor.activeReference.value.placement.y / figure.canvas.height*100}%`, width: `${editor.activeReference.value.placement.width / figure.canvas.width*100}%`, height: `${editor.activeReference.value.placement.height / figure.canvas.height*100}%`, opacity: editor.referenceOpacity.value }" />
        </Box>
      </Box>
      </Box>
    </Box>
    <FigureTextCheckDialog :open="editor.textCheckOpen.value" @close="editor.textCheckOpen.value=false" />
  </Box>
</template>
