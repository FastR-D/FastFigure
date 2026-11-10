<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { Box } from '@fastrd/ui-vue'
import { useEditor } from '../../composables/useEditor'
import LibraryPanel from '../library/LibraryPanel.vue'
import HarnessPanel from '../harness/HarnessPanel.vue'

const editor = useEditor()
const minWidth=264,maxWidth=560,defaultWidth=264,storageKey='fastfigure.workspace.sidebar-width'
const clamp=(value:number)=>Math.max(minWidth,Math.min(maxWidth,Math.round(value)))
function readWidth(){
  try{const stored=localStorage.getItem(storageKey);if(stored?.trim()&&Number.isFinite(Number(stored)))return clamp(Number(stored))}catch{ /* Optional layout preference. */ }
  return defaultWidth
}
const width=ref(readWidth())
let drag:{pointerId:number;startX:number;startWidth:number;target:HTMLElement}|undefined
function persist(){try{localStorage.setItem(storageKey,String(width.value))}catch{ /* Keep resizing available without storage. */ }}
function startResize(event:PointerEvent){
  if(event.button!==0||!event.isPrimary||drag)return
  event.preventDefault()
  const target=event.currentTarget as HTMLElement
  target.focus({preventScroll:true})
  drag={pointerId:event.pointerId,startX:event.clientX,startWidth:width.value,target}
  target.setPointerCapture(event.pointerId)
  document.body.classList.add('resizing-workspace')
}
function moveResize(event:PointerEvent){if(drag&&event.pointerId===drag.pointerId)width.value=clamp(drag.startWidth+event.clientX-drag.startX)}
function finishResize(cancel=false){
  if(!drag)return
  const active=drag;drag=undefined
  if(cancel)width.value=active.startWidth
  document.body.classList.remove('resizing-workspace')
  if(active.target.hasPointerCapture(active.pointerId))active.target.releasePointerCapture(active.pointerId)
  persist()
}
function resizeKey(event:KeyboardEvent){
  if(event.key==='Escape'&&drag){event.preventDefault();event.stopPropagation();finishResize(true);return}
  if(drag||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
  event.preventDefault();event.stopPropagation()
  width.value=event.key==='Home'?minWidth:event.key==='End'?maxWidth:clamp(width.value+(event.key==='ArrowRight'?1:-1)*(event.shiftKey?32:16))
  persist()
}
function resetWidth(){width.value=defaultWidth;persist()}
onBeforeUnmount(()=>finishResize())
</script>

<template>
  <Box id="workspace-sidebar" class="workspace-sidebar" :style="{width:`${width}px`}" :data-active-panel="editor.activePanel.value">
    <LibraryPanel v-show="editor.activePanel.value !== 'assistant'" />
    <HarnessPanel />
    <Box class="sidebar-resize-handle" role="separator" tabindex="0" aria-label="调整左侧栏宽度" aria-orientation="vertical" aria-controls="workspace-sidebar" :aria-valuemin="minWidth" :aria-valuemax="maxWidth" :aria-valuenow="width" :aria-valuetext="`${width} 像素`" title="拖动调整宽度 · 双击恢复默认 · 方向键微调" @pointerdown="startResize" @pointermove="moveResize" @pointerup="finishResize()" @pointercancel="finishResize(true)" @lostpointercapture="finishResize()" @keydown="resizeKey" @dblclick="resetWidth" />
  </Box>
</template>
