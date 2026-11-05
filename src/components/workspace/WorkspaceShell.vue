<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { Box, Main, Text, Button, Icon, Heading } from '../ui'
import { createEditor, editorKey } from '../../composables/useEditor'
import WorkspaceHeader from './WorkspaceHeader.vue'
import ActivityRail from './ActivityRail.vue'
import CanvasToolbar from './CanvasToolbar.vue'
import WorkspaceSidebar from './WorkspaceSidebar.vue'
import InspectorPanel from '../inspector/InspectorPanel.vue'
import FigureCanvas from '../figure/FigureCanvas.vue'
import ExportDialog from './ExportDialog.vue'
import ProjectDialog from './ProjectDialog.vue'
import ComponentDialog from '../library/ComponentDialog.vue'
import LayoutDialog from './LayoutDialog.vue'
import TextToolbar from './TextToolbar.vue'
import StructureExpandDialog from './StructureExpandDialog.vue'
import ScaleDialog from './ScaleDialog.vue'
const MaterialEditDialog=defineAsyncComponent(()=>import('./MaterialEditDialog.vue'))
const CalloutDialog=defineAsyncComponent(()=>import('./CalloutDialog.vue'))
const ComponentCaptureDialog=defineAsyncComponent(()=>import('../library/ComponentCaptureDialog.vue'))
const RecipeParametersDialog=defineAsyncComponent(()=>import('./RecipeParametersDialog.vue'))
const VectorImportDialog=defineAsyncComponent(()=>import('../library/VectorImportDialog.vue'))
const DataChartDialog=defineAsyncComponent(()=>import('../charts/DataChartDialog.vue'))
const ChartDataImportDialog=defineAsyncComponent(()=>import('../charts/ChartDataImportDialog.vue'))
const StyleAssetDialog=defineAsyncComponent(()=>import('../library/StyleAssetDialog.vue'))
const PanelLayoutDialog=defineAsyncComponent(()=>import('./PanelLayoutDialog.vue'))
const PublicationDialog=defineAsyncComponent(()=>import('./PublicationDialog.vue'))
const DetailInsetDialog=defineAsyncComponent(()=>import('./DetailInsetDialog.vue'))
const editor = createEditor()
provide(editorKey, editor)
const exportOpen = ref(false), projectOpen = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | undefined
watch(editor.notice, message => { if (message) { clearTimeout(toastTimer); toastTimer = setTimeout(() => { editor.notice.value = '' }, 4000) } })
function keyboard(e: KeyboardEvent) {
  if (e.defaultPrevented || exportOpen.value || projectOpen.value || editor.publicationOpen.value || editor.detailInsetOpen.value || editor.assetDialog.value || editor.recipeDialogId.value || editor.componentCapture.value || editor.styleDialog.value || editor.chartDialog.value||editor.chartDataImportOpen.value||editor.vectorImportOpen.value||editor.layoutDialogOpen.value||editor.panelLayoutOpen.value||editor.structureExpandId.value||editor.scaleDialogId.value) return
  const target = e.target as HTMLElement
  if(target.closest('[aria-modal="true"]'))return
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); editor.save() }
  else if (target.closest('[data-assistant-panel]')) return
  else if (target.closest('input,textarea,select,[contenteditable="true"],[role="listbox"]')) return
  else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) editor.redo(); else editor.undo() }
  else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); editor.redo() }
  else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); editor.selectAll() }
  else if (mod && e.key.toLowerCase() === 'g') { e.preventDefault(); if (e.shiftKey) editor.ungroupSelection(); else editor.groupSelection() }
  else if (e.key === 'Escape') { editor.connectMode.value = false; editor.connectionSource.value = null }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); editor.removeSelected() }
  else if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
    if (!target.closest('[data-testid="figure-canvas"]')) return
    e.preventDefault(); const step = e.shiftKey ? 10 : 1
    editor.beginDrag(); editor.moveSelection(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0); editor.endDrag()
  }
}
function beforeUnload(e: BeforeUnloadEvent) { if (!editor.saved.value) e.preventDefault() }
onMounted(() => { window.addEventListener('keydown', keyboard); window.addEventListener('beforeunload', beforeUnload) })
onBeforeUnmount(() => { window.removeEventListener('keydown', keyboard); window.removeEventListener('beforeunload', beforeUnload); clearTimeout(toastTimer) })
</script>

<template>
  <Box class="workspace-shell">
    <RecipeParametersDialog v-if="editor.recipeDialogId.value" :key="editor.recipeDialogId.value" />
    <WorkspaceHeader @export="exportOpen = true" @project="projectOpen = true" />
    <Box class="workspace-body">
      <ActivityRail />
      <WorkspaceSidebar />
      <Main class="workbench">
        <Box class="document-heading"><Box><Box class="document-eyebrow"><Text>科研绘图</Text><Icon name="chevron" /><Text>方法与系统架构</Text></Box><Heading>{{ editor.figure.value.title }}</Heading></Box><Button variant="quiet" class="rename-button" title="编辑工程名称" aria-label="编辑工程名称" @click="projectOpen = true"><Icon name="edit" /></Button><Text class="draft-tag">本地工程</Text></Box>
        <Box class="canvas-workspace"><CanvasToolbar /><TextToolbar /><FigureCanvas /></Box>
      </Main>
      <InspectorPanel />
    </Box>
    <Box v-if="editor.notice.value && !exportOpen && !projectOpen && !editor.publicationOpen.value && !editor.assetDialog.value&&!editor.componentCapture.value && !editor.layoutDialogOpen.value&&!editor.structureExpandId.value&&!editor.vectorImportOpen.value&&!editor.chartDataImportOpen.value&&!editor.chartDialog.value" class="workspace-toast" role="status" aria-live="polite"><Icon name="info" /><Text>{{ editor.notice.value }}</Text></Box>
    <ExportDialog :open="exportOpen" @close="exportOpen = false" />
    <ProjectDialog :open="projectOpen" @close="projectOpen = false" />
    <ComponentDialog />
    <ComponentCaptureDialog v-if="editor.componentCapture.value" :key="editor.componentCapture.value.id" />
    <MaterialEditDialog v-if="editor.materialEdit.value" />
    <CalloutDialog v-if="editor.calloutOpen.value" />
    <DetailInsetDialog v-if="editor.detailInsetOpen.value" />
    <LayoutDialog />
    <PanelLayoutDialog v-if="editor.panelLayoutOpen.value" />
    <PublicationDialog v-if="editor.publicationOpen.value" />
    <StructureExpandDialog />
    <ScaleDialog v-if="editor.scaleDialogId.value" />
    <VectorImportDialog v-if="editor.vectorImportOpen.value" />
    <DataChartDialog v-if="editor.chartDialog.value" />
    <ChartDataImportDialog v-if="editor.chartDataImportOpen.value" />
    <StyleAssetDialog v-if="editor.styleDialog.value" />
  </Box>
</template>
