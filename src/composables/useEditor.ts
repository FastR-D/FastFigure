import {canvasNodeTextStyle,canvasContainerTextStyle} from '../core/typography'
import {moveEdgeWaypoint,removeEdgeWaypoint} from '../core/edgeWaypoints'
import {applyFigureTheme} from '../core/figureThemes'
import type {SketchStyle} from '../core/sketchStyle'
import type {ComponentCaptureOrigin} from '../core/componentCaptureContract'
import {publicationSettingsSchema,type PublicationSettings} from '../core/publicationContract'
import { computed, inject, ref, shallowRef, watch, type InjectionKey } from 'vue'
import { clone, createBlank, createExample, isPrimitive, parseDocument, rootContainer, type AccentId, type EvidenceRegion, type FigureDocument, type FigureNode, type NodeKind, type ReferenceImage, type StyleId } from '../core/model'
import { alignObjects, allObjects, arrangeObjects, childrenOf, contains, descendants, findObject, fitTransparentAncestors, groupObjects, moveObjects, parentOf, resizeObject, resolveStyle, topLevelSelection, ungroupObject, type AlignMode, type Rect } from '../core/geometry'
import { componentDocument, instantiateComponent, type ComponentAsset } from '../core/assets'
import type {RecipeUpdateResult} from '../core/recipeUpdate'
import { createComponentLibrary } from './useComponentLibrary'
import {createComponentRepository} from './useComponentRepository'
import type {ComponentSnapshot} from '../core/componentRepository'
import {createStyleLibrary} from './useStyleLibrary'
import {applyStyleAsset,type StyleAsset} from '../core/styleAsset'
import {mergeImageDrafts,type ImageDraftOrigin} from '../core/imageDraftContract'
import {imageDraftCompositionSchema} from '../core/imageDraftContract'
import {imageDraftPlanReferences} from '../core/imageDraftDesign'
import type {CompositionRecord} from '../core/compositionPlanContract'
import { routeFigure } from '../core/routing'
import { layoutContainer, type LayoutOptions } from '../core/layout'
import { layoutPanels, type PanelItem, type PanelOptions } from '../core/panelLayout'
import { iconById, paletteById } from '../data/materials'
import { textStyleSchema, type TextStyle } from '../core/model'
import { fitReference, referenceSource, wholeImage } from '../core/references'
import { nodeStructure, structureLabels, structurePreset, type StructureType } from '../core/structures'
import { expandStructure } from '../core/expandStructure'
import { addComponentPort, updateComponentPort, removeComponentPort, namedPorts } from '../core/componentPorts'
import type { ComponentPort } from '../core/model'
import {setPathEndpointBinding,remapPathAnchorBindings, movePathControl, movePathPoint, pathPoints, setPathPoints, setPathSegment, splitPathSegment, type PathPoint } from '../core/paths'
import { reflowText } from '../core/textGeometry'
import { recolorChartSeries } from '../core/paint'
import type { ReconstructionTask } from '../core/reconstructionContract'
import { scaleSubtree, type ScaleAnchor } from '../core/scaling'
import type { ChartDataset } from '../core/chartDataset'

export type TextEditField = 'label' | 'description' | `structure:${number}`
type MaterialPanel = 'components' | 'layers' | 'styles' | 'references' | 'icons' | 'palettes' | 'gallery'

const STORAGE_KEY = 'fastfigure.project.v2'
export function createEditor() {
  const figure = ref<FigureDocument>(createExample())
  const root = computed(() => rootContainer(figure.value))
  const selectedIds = ref<string[]>(['stage'])
  const selectedId = computed({ get: () => selectedIds.value.at(-1) ?? 'stage', set: (id: string) => { selectedIds.value = [id] } })
  const activePanel = ref<MaterialPanel | 'assistant'>('components')
  let previousMaterialPanel: MaterialPanel = 'components'
  const assistantSeed = ref(''), textTarget = ref<'label' | 'description'>('label')
  const assistantReferenceId=ref('')
  const assistantAssetId=ref('')
  const assistantStyle=ref<StyleAsset|null>(null)
  const assistantTask=ref<{task:ReconstructionTask;content:string}|null>(null)
  const imageDraftPlan=ref<CompositionRecord|null>(null)
  const textEdit = ref<{ id: string; field: TextEditField } | null>(null)
  const referenceId = ref(''), referenceMode = ref<'hidden' | 'side' | 'overlay'>('hidden'), referenceOpacity = ref(0.35)
  const activeReference = computed(() => figure.value.references.find(r => r.id === referenceId.value) ?? figure.value.references[0])
  const evidenceRegion = ref<EvidenceRegion>({ ...wholeImage })
  const library = createComponentLibrary()
  const repository=createComponentRepository()
  const styleLibrary=createStyleLibrary(),styleDialog=ref<{kind:'capture'}|{kind:'edit';id:string}|{kind:'plan';record:CompositionRecord}|null>(null)
  const libraryTab = ref<'basic' | 'recipes' | 'mine' | 'templates' | 'charts' | 'repository'>('basic')
  const chartDialog=ref<{kind?:'line'|'bar'|'scatter'|'heatmap'|'boxplot';containerId?:string}|null>(null)
  const chartDataImportOpen=ref(false),assistantDataset=ref<ChartDataset|null>(null)
  const componentCapture=shallowRef<{id:string;figure:FigureDocument;origin:ComponentCaptureOrigin;selectedIds:string[]}|null>(null)
  function openComponentCapture(source:FigureDocument=figure.value,origin:ComponentCaptureOrigin={kind:'project'},ids:string[]=selectedIds.value){componentCapture.value={id:crypto.randomUUID(),figure:clone(source),origin:clone(origin),selectedIds:[...ids]}}
  const assetDialog = ref<{ mode: 'recipe'; recipeId: string } | { mode: 'capture'; containerId: string } | { mode: 'asset'; assetId: string } | {mode:'template';asset:ComponentAsset} | {mode:'repository';asset:ComponentAsset;record:ComponentSnapshot} | null>(null)
  const recipeDialogId=ref<string|null>(null)
  const layoutDialogOpen = ref(false),vectorImportOpen=ref(false)
  const materialEdit=ref<'center'|'format'|'arrow'|'path-arrow'|'edge-route'|'fit-text'|'match-size'|'line-style'|null>(null)
  const calloutOpen=ref(false),panelLayoutOpen=ref(false),publicationOpen=ref(false),detailInsetOpen=ref(false)
  const scaleDialogId=ref<string|null>(null)
  const structureExpandId=ref<string|null>(null),selectedPathPoint=ref<number|null>(null),selectedEdgePoint=ref<number|null>(null)
  const routes = computed(() => routeFigure(figure.value))
  const blockedRoutes = computed(() => [...routes.value].filter(([, route]) => route.status === 'blocked'))
  const connectMode = ref(false), connectionSource = ref<string | null>(null)
  const zoom = ref(100), showGrid = ref(true), saved = ref(true)
  const storageError = ref(''), notice = ref('')
  const past = ref<FigureDocument[]>([]), future = ref<FigureDocument[]>([])
  const selectedNode = computed(() => figure.value.nodes.find(n => n.id === selectedId.value))
  const selectedEdge = computed(() => figure.value.edges.find(e => e.id === selectedId.value))
  const selectedContainer = computed(() => figure.value.containers.find(c => c.id === selectedId.value))
  const selectedObjects = computed(() => topLevelSelection(figure.value, selectedIds.value))
  const canGroup = computed(() => !selectedIds.value.some(id=>figure.value.edges.some(e=>e.id===id)) && selectedObjects.value.length > 0 && selectedObjects.value.every(o => o.parentId !== null&&!('interfaceFor' in o&&o.interfaceFor)) && new Set(selectedObjects.value.map(o => 'parentId' in o ? o.parentId : '')).size === 1)
  const nodeCount = computed(() => figure.value.nodes.length)
  const currentContainer = computed(() => selectedContainer.value ?? parentOf(figure.value, selectedId.value) ?? root.value)
  const activeStyle = computed(() => resolveStyle(figure.value, currentContainer.value.id))
  watch(()=>connectionSource.value?figure.value.nodes.find(n=>n.id===connectionSource.value):null,source=>{if(connectionSource.value&&(!source||source.socket?.direction==='input')){connectionSource.value=null;connectMode.value=false}},{deep:true,flush:'sync'})
  watch(selectedId,()=>{textTarget.value='label';selectedPathPoint.value=null;selectedEdgePoint.value=null}, {flush:'sync'})
  watch(() => JSON.stringify([activeReference.value?.id, selectedIds.value, findObject(figure.value, selectedId.value)?.evidence]), () => {
    const evidence = selectedIds.value.length === 1 ? findObject(figure.value, selectedId.value)?.evidence : undefined
    evidenceRegion.value = evidence?.image && evidence.image.sha256 === activeReference.value?.sha256 ? clone(evidence.image.region) : { ...wholeImage }
  })
  let dragBefore: FigureDocument | null = null
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) figure.value = parseDocument(JSON.parse(stored))
  } catch { storageError.value = '本地工程未能读取，已打开示例。原存储尚未覆盖。' }
  watch(figure, () => { saved.value = false }, { deep: true, flush: 'sync' })
  function commit(before: FigureDocument) {
    if (JSON.stringify(before) === JSON.stringify(figure.value)) return
    past.value = [...past.value.slice(-49), before]; future.value = []; saved.value = false
  }
  function update(action: (doc: FigureDocument) => void): boolean {
    const before = clone(figure.value), candidate = clone(figure.value)
    try {
      action(candidate); figure.value = parseDocument(candidate); commit(before); return true
    } catch (error) {
      notice.value = error instanceof Error ? ('issues' in error ? '操作超出容器或尺寸限制，请调整后重试' : error.message) : '操作未能完成'
      return false
    }
  }
  function setPublication(settings?:PublicationSettings){return update(doc=>{if(settings)doc.publication=publicationSettingsSchema.parse(settings);else delete doc.publication})}
  function select(id: string, additive = false) {
    if(connectMode.value&&figure.value.containers.some(c=>c.id===id)){
      const named=namedPorts(figure.value,id),direction=connectionSource.value?'input':'output'
      const candidates=named.filter(n=>n.socket!.direction===direction||n.socket!.direction==='both')
      if(named.length){if(candidates.length!==1){notice.value=candidates.length?'请选择具体的命名接口':'该组件没有匹配方向的接口';return}id=candidates[0]!.id}
      else {const legacy=figure.value.nodes.find(n=>n.interfaceFor===id);if(legacy)id=legacy.id}
    }
    if (connectMode.value && figure.value.nodes.some(n => n.id === id&&n.kind!=='path')) {
      const targetNode=figure.value.nodes.find(n=>n.id===id)!
      if (!connectionSource.value) { if(targetNode.socket?.direction==='input'){notice.value='输入接口作为终点，请先选择输出接口或起点节点';return}connectionSource.value = id; notice.value = '已选择起点，请点击目标节点'; return }
      const source = connectionSource.value
      if(targetNode.socket?.direction==='output'){notice.value='输出接口不能作为终点，请选择输入或双向接口';return}
      const sourceNode=figure.value.nodes.find(n=>n.id===source)
      if(!sourceNode||sourceNode.socket?.direction==='input'){connectionSource.value=null;connectMode.value=false;notice.value='起点已变化，请重新选择连接起点';return}
      if (source === id) { notice.value = '请选择另一个目标节点'; return }
      if (figure.value.edges.some(e => e.source === source && e.target === id)) { notice.value = '这两个节点已连接'; return }
      if (update(doc => doc.edges.push({ id: `e-${crypto.randomUUID()}`, source, target: id, sourcePort: sourceNode.socket?.side??'right', targetPort: targetNode.socket?.side??'left' }))) notice.value = '已添加连接'
      connectionSource.value = null; connectMode.value = false
    }
    const selectable=(key:string)=>!!findObject(figure.value,key)||figure.value.edges.some(e=>e.id===key)
    if (additive && id !== 'stage' && selectable(id)) {
      const previous = selectedIds.value.filter(x => x !== 'stage' && selectable(x))
      selectedIds.value = previous.includes(id) ? previous.filter(x => x !== id) : [...previous, id]
      if (!selectedIds.value.length) selectedIds.value = ['stage']
    } else selectedId.value = id
  }
  function selectRegion(rect: Rect, additive = false) {
    const ids = allObjects(figure.value).filter(o => o.id !== 'stage' && !('interfaceFor' in o&&o.interfaceFor) && contains(rect, o)).map(o => o.id)
    const merged = [...new Set([...(additive ? selectedIds.value.filter(x => x !== 'stage') : []), ...ids])]
    selectedIds.value = [...topLevelSelection(figure.value, merged).map(o => o.id),...merged.filter(id=>figure.value.edges.some(e=>e.id===id))]
    if (!selectedIds.value.length) selectedId.value = 'stage'
  }
  function selectAll() { selectedIds.value = childrenOf(figure.value, 'stage').filter(o=>!('interfaceFor' in o&&o.interfaceFor)).map(o => o.id); if (!selectedIds.value.length) selectedId.value = 'stage' }
  function addNode(kind: NodeKind, label: string, extras: Partial<Pick<FigureNode, 'iconId' | 'description' | 'textStyle' | 'visual' | 'structure'|'path'>> = {}) {
    if (nodeCount.value >= 240||!isPrimitive(kind)&&figure.value.nodes.filter(n=>!isPrimitive(n.kind)).length>=60) { notice.value = '当前工程最多支持 60 个科研节点、240 个图元'; return }
    const c = currentContainer.value
    const round = ['neuron','operator','ellipse','icon','diamond'].includes(kind), width = extras.structure ? 184 : round ? 80 : kind === 'text' ? 180 : 140, height = extras.structure ? structurePreset(extras.structure.type).height :kind==='path'?0: round ? 80 : kind === 'text' ? 44 : 66
    let position: { x: number; y: number } | undefined
    for (let y = c.y + 58; y <= c.y + c.height - height - 12 && !position; y += 20) {
      for (let x = c.x + 30; x <= c.x + c.width - width - 12; x += 20) {
        const intersects = childrenOf(figure.value, c.id).some(n => x < n.x + n.width + 16 && x + width + 16 > n.x && y < n.y + n.height + 16 && y + height + 16 > n.y)
        if (!intersects) { position = { x, y }; break }
      }
    }
    if(!position&&c.dataChart&&['text','icon'].includes(kind)&&c.width>=width+4&&c.height>=height+4)position={x:c.x+(c.width-width)/2,y:c.y+(c.height-height)/2}
    if (!position) { notice.value = '容器内没有足够空位，请先扩大容器或调整内部组件'; return }
    const node: FigureNode = { id: `n-${crypto.randomUUID()}`, parentId: c.id, kind, label, width, height, ...position, ...extras }
    if (update(doc => doc.nodes.push(node))) { selectedId.value = node.id; notice.value = `已添加${label}，可拖动调整位置` }
  }
  function insertComponent(asset: ComponentAsset, keepAppearance = true, newCanvas = false): boolean {
    try {
      const inserted = newCanvas ? { document: componentDocument(asset, keepAppearance, activeStyle.value), containerId: 'stage' }
        : instantiateComponent(figure.value, asset, currentContainer.value.id, keepAppearance)
      const before = clone(figure.value)
      figure.value = inserted.document; commit(before); selectedId.value = inserted.containerId
      connectMode.value = false; connectionSource.value = null
      notice.value = `已插入${asset.name}，内部节点和连接可继续编辑`
      return true
    } catch (error) { notice.value = error instanceof Error && !('issues' in error) ? error.message : '插入失败：请检查容器层级与尺寸限制'; return false }
  }
  function applyRecipePreview(result:RecipeUpdateResult){
    if(JSON.stringify(figure.value)!==result.baseKey){notice.value='画布已变化，请重新打开组合参数';return false}
    if(!result.changed)return false
    try{const next=parseDocument(clone(result.document)),before=clone(figure.value);figure.value=next;commit(before);selectedId.value=result.containerId;recipeDialogId.value=null;notice.value='已更新组合参数，外部连接和另加对象保留，可单步撤销';return true}
    catch{notice.value='参数预览无效，当前画布保持';return false}
  }
  function setAppearance(field: 'preset' | 'accent', value: StyleId | AccentId) {
    const id = currentContainer.value.id
    update(doc => {
      if (id === 'stage') {
        if (field === 'preset') doc.style.preset = value as StyleId
        else { doc.style.accent = value as AccentId; delete doc.style.paletteId }
      } else {
        const c = doc.containers.find(c => c.id === id)!
        c.appearance ??= { preset: 'inherit', accent: 'inherit' }
        if (field === 'preset') c.appearance.preset = value as StyleId
        else c.appearance.accent = value as AccentId
      }
    })
  }
  function setStyle(preset: StyleId) { update(doc=>{const c=doc.containers.find(c=>c.id===currentContainer.value.id)!;if(c.id==='stage'){doc.style.preset=preset;delete doc.style.sketchStyle}else{c.appearance??={preset:'inherit',accent:'inherit'};c.appearance.preset=preset;delete c.appearance.sketchStyle}}) }
  function applyTheme(id:SketchStyle){try{const result=applyFigureTheme(figure.value,id,currentContainer.value.id);if(update(doc=>Object.assign(doc,result.figure)))notice.value=`已应用 ${result.use.asset.name}，初始字体 ${result.use.asset.fontFamily}；可在画板工具栏修改${result.use.skippedTextNodes?'，图表与定位字形保留原格式':''}`}catch(error){notice.value=(error as Error).message}}
  function setAccent(accent: AccentId) { setAppearance('accent', accent) }
  function inheritAppearance() { update(doc => { const c = doc.containers.find(c => c.id === currentContainer.value.id); if (c) delete c.appearance }) }
  function setLabel(value: string) {
    update(doc => {
      const object = findObject(doc, selectedId.value)
      if (object) { if ('label' in object) {const structure=nodeStructure(object);if(structure&&!object.structure)object.structure=clone(structure);object.label = value;reflowText(object);fitTransparentAncestors(doc,object.id)} else object.title = value }
    })
  }
  function beginTextEdit(id: string, field: TextEditField = 'label') {
    const object = findObject(figure.value, id)
    if (!object||'kind' in object&&['path','port'].includes(object.kind)) return
    selectedId.value = id; textTarget.value = field==='description'?'description':'label'; textEdit.value = { id, field:'kind' in object?field:'label' }
    connectMode.value = false; connectionSource.value = null
  }
  function finishTextEdit(value: string, cancel = false) {
    const edit = textEdit.value; textEdit.value = null
    if (!edit || cancel) return
    update(doc => {
      const object = findObject(doc, edit.id)
      if (!object) return
      if ('kind' in object) {
        const inferred=nodeStructure(object);if(inferred&&!object.structure)object.structure=clone(inferred)
        if(edit.field.startsWith('structure:')) {
          const structure=nodeStructure(object), index=Number(edit.field.slice(10))
          if(!structure || !Number.isInteger(index) || index<0 || index>=structureLabels(structure).length) throw new Error('结构标签已不存在')
          const labels=structureLabels(structure);labels[index]=value;object.structure={...structure,labels}
        } else if (edit.field === 'description') object.description = value; else {object.label = value;reflowText(object);fitTransparentAncestors(doc,object.id)}
      }
      else object.title = value
    })
  }
  function textObjects() {
    const ids = new Set(selectedIds.value.flatMap(id => [id, ...descendants(figure.value, id).map(o => o.id)]))
    return [...figure.value.nodes, ...figure.value.containers].filter(o => ids.has(o.id))
  }
  function formatText(patch: TextStyle) {
    const style = textStyleSchema.safeParse(patch)
    if (!style.success) { notice.value = '文字格式无效，字号范围为 1–256'; return false }
    const ids = new Set(textObjects().map(o => o.id))
    return update(doc => {
      for (const object of [...doc.nodes, ...doc.containers].filter(o => ids.has(o.id))) {
        if (textTarget.value === 'description' && 'kind' in object){const current=canvasNodeTextStyle(object,true,resolveStyle(doc,object.parentId));object.descriptionStyle = { ...object.descriptionStyle,size:current.size, ...style.data };if(patch.bold!==undefined)delete object.descriptionStyle.weight}
        else {const current='kind'in object?canvasNodeTextStyle(object,false,resolveStyle(doc,object.parentId)):canvasContainerTextStyle(object,resolveStyle(doc,object.id));object.textStyle = { ...object.textStyle,size:current.size, ...style.data };if(patch.bold!==undefined)delete object.textStyle.weight;if('kind' in object){reflowText(object);fitTransparentAncestors(doc,object.id)}}
      }
    })
  }
  function paintSelection(field: 'fill' | 'stroke', color: string) {
    const ids = new Set(textObjects().map(o => o.id))
    return update(doc => { for (const node of doc.nodes.filter(n => ids.has(n.id))) {node.visual = { ...node.visual, [field]: color };delete node.visual[field==='fill'?'fillGradient':'strokeGradient']} })
  }
  function addIcon(id: string) { const icon = iconById.get(id); if (icon) addNode('icon', icon.name, { iconId: id }) }
  function applyPalette(id: string) { if (paletteById.has(id)) update(doc => { doc.style.paletteId = id;recolorChartSeries(doc,id) }) }
  function applySavedStyle(asset:StyleAsset,typography=true){try{const result=applyStyleAsset(figure.value,asset,currentContainer.value.id,typography);if(update(doc=>Object.assign(doc,result.figure)))notice.value=`已应用${asset.name}，调整 ${result.use.textNodes} 个文字对象，保留 ${result.use.skippedTextNodes} 个图表或定位文字对象${result.use.lines?`；连线规范调整 ${result.use.lines.changed} 条，保留 ${result.use.lines.skipped} 条`:""}；可撤销`}catch(e){notice.value=(e as Error).message}}
  function useSavedStyle(asset:StyleAsset){assistantStyle.value=clone(asset);openAssistant()}
  function useMaterialPrompt(content: string) { assistantSeed.value = content; openAssistant() }
  function requestReconstruction(task:ReconstructionTask,content:string){assistantTask.value={task:clone(task),content};openAssistant()}
  function requestImageDraft(record:CompositionRecord){try{const plan=imageDraftCompositionSchema.parse(record);imageDraftPlanReferences(plan,figure.value);imageDraftPlan.value=clone(plan);activePanel.value='references';notice.value='已准备方案草稿，请核对后生成'}catch(e){notice.value=(e as Error).message}}
  function setNodeStructure(type: StructureType) {
    const id=selectedId.value
    return update(doc=>{ const node=doc.nodes.find(n=>n.id===id);if(node) {node.kind='module';node.structure={type,...(['encoder','decoder'].includes(type)?{repeats:6}:{})}} })
  }
  function fitStructure() {
    const id=selectedId.value
    return update(doc=>{
      const node=doc.nodes.find(n=>n.id===id),structure=node&&nodeStructure(node)
      if(!node||!structure) return
      const rect={...node,width:Math.max(184*(node.metricScale??1),node.width),height:Math.max(structurePreset(structure.type).height*(node.metricScale??1),node.height)}
      const others=childrenOf(doc,node.parentId).filter(o=>o.id!==id)
      if(others.some(o=>rect.x<o.x+o.width+8&&rect.x+rect.width+8>o.x&&rect.y<o.y+o.height+8&&rect.y+rect.height+8>o.y)) throw new Error('展开空间不足，请先移动周边对象或扩大容器')
      Object.assign(node,{width:rect.width,height:rect.height})
    })
  }
  function expandSelectedStructure(id=selectedId.value) {
    try {
      const before=clone(figure.value),result=expandStructure(figure.value,id)
      figure.value=result.document;commit(before);selectedId.value=result.containerId;structureExpandId.value=null
      connectMode.value=false;connectionSource.value=null;activePanel.value='layers'
      notice.value=`已转换为 ${result.nodeCount} 个可编辑图元（${result.paths} 条线段），外部连接保留`
      return true
    } catch(error) {notice.value=error instanceof Error&&!('issues' in error)?error.message:'转换未通过图元与容器校验，当前工程未改变';return false}
  }
  function dragEdgePoint(id:string,index:number,point:{x:number;y:number}){moveEdgeWaypoint(figure.value,id,index,point)}
  function setEdgePoint(id:string,index:number,point:{x:number;y:number}){return update(doc=>moveEdgeWaypoint(doc,id,index,point))}
  function removeEdgePoint(id:string,index:number){if(update(doc=>removeEdgeWaypoint(doc,id,index)))selectedEdgePoint.value=null}
  function dragPathPoint(id:string,index:number,point:PathPoint) {movePathPoint(figure.value,id,index,point)}
  function setPathPoint(index:number,point:PathPoint) {return update(doc=>movePathPoint(doc,selectedId.value,index,point))}
  function dragPathControl(id:string,index:number,key:'c1'|'c2',point:PathPoint){movePathControl(figure.value,id,index,key,point)}
  function setPathControl(index:number,key:'c1'|'c2',point:PathPoint){return update(doc=>movePathControl(doc,selectedId.value,index,key,point))}
  function changePathSegment(index:number,type:'line'|'quadratic'|'cubic'){return update(doc=>setPathSegment(doc,selectedId.value,index,type))}
  function addPathBend() {
    return update(doc=>{
      const node=doc.nodes.find(n=>n.id===selectedId.value);if(!node?.path)throw new Error('请选择一条路径')
      const points=pathPoints(doc,node);if(points.length>=128)throw new Error('一条路径最多 128 个点')
      const selected=selectedPathPoint.value
      const eligible=points.slice(1).map((p,i)=>({i,length:Math.hypot(p.x-points[i]!.x,p.y-points[i]!.y),valid:!p.move&&!points[i]!.close})).filter(s=>s.valid)
      const index=selected!==null&&eligible.some(s=>s.i===selected)?selected:eligible.sort((a,b)=>b.length-a.length)[0]?.i
      if(index===undefined)throw new Error('没有可拆分的线段')
      remapPathAnchorBindings(doc,node.id,index+1,1);splitPathSegment(node,points,index);selectedPathPoint.value=index+1
    })
  }
  function removePathBend() {
    return update(doc=>{const node=doc.nodes.find(n=>n.id===selectedId.value),index=selectedPathPoint.value
      if(!node?.path||index===null||index<=0||index>=node.path.points.length-1||node.path.points[index]?.move||node.path.points[index]?.close)throw new Error('请选择一个非子路径边界的中间锚点')
      const points=pathPoints(doc,node);remapPathAnchorBindings(doc,node.id,index,-1);points.splice(index,1);setPathPoints(node,points);selectedPathPoint.value=null})
  }
  function bindPathEndpoint(end:'start'|'end',targetId?:string,anchorIndex?:number){return update(doc=>setPathEndpointBinding(doc,selectedId.value,end,targetId,anchorIndex))}
  function detachPath() {
    return update(doc=>{const node=doc.nodes.find(n=>n.id===selectedId.value);if(node?.path){const points=pathPoints(doc,node);delete node.path.start;delete node.path.end;setPathPoints(node,points)}})
  }
  function move(id: string, dx: number, dy: number) { moveObjects(figure.value, [id], dx, dy) }
  function moveSelection(dx: number, dy: number) { moveObjects(figure.value, selectedIds.value, dx, dy) }
  function beginDrag() { dragBefore = clone(figure.value) }
  function endDrag() {
    if (dragBefore) {
      try { parseDocument(figure.value); commit(dragBefore) }
      catch { figure.value = dragBefore; notice.value = '已恢复到拖动前的有效位置' }
    }
    dragBefore = null
  }
  function cancelDrag() { if (dragBefore) figure.value = dragBefore; dragBefore = null }
  function setPosition(axis: 'x' | 'y', value: number | null) {
    if (value === null || !Number.isFinite(value)) return
    const object = findObject(figure.value, selectedId.value)
    if (!object) return
    beginDrag(); move(selectedId.value, axis === 'x' ? value - object.x : 0, axis === 'y' ? value - object.y : 0); endDrag()
  }
  function setSize(axis: 'width' | 'height', value: number) {
    const object = findObject(figure.value, selectedId.value)
    if (!object || !Number.isFinite(value)) return
    update(doc => resizeObject(doc, object.id, axis === 'width' ? value : object.width, axis === 'height' ? value : object.height))
  }
  function resize(width: number, height: number) { resizeObject(figure.value, selectedId.value, width, height) }
  function alignSelection(mode: AlignMode) { update(doc => alignObjects(doc, selectedIds.value, mode)) }
  function arrangeSelection(direction: 'row' | 'column') { update(doc => arrangeObjects(doc, selectedIds.value, direction)) }
  function applyLayout(containerId: string, options: LayoutOptions): boolean {
    try {
      const result = layoutContainer(figure.value, containerId, options), before = clone(figure.value)
      figure.value = result.document; commit(before); selectedId.value = containerId
      notice.value = options.recursive ? `已整理 ${result.levels.length} 个容器、${result.count} 个对象${result.resized.length ? `，适配 ${result.resized.length} 个子容器尺寸` : ''}`
        : `已排列 ${result.count} 个同层对象${result.gap < options.gap ? `，间距已适配为 ${result.gap}` : ''}`
      return true
    } catch (e) { notice.value = e instanceof Error ? e.message : '布局未能完成'; return false }
  }
  function applyScale(id:string,factor:number,anchor:ScaleAnchor) {
    try {
      const result=scaleSubtree(figure.value,id,factor,anchor),before=clone(figure.value)
      figure.value=result.document;commit(before);selectedId.value=id
      notice.value=`已将组合等比缩放至 ${Math.round(factor*100)}%${result.overlaps?'，请检查同层重叠':''}`
      return true
    }catch(error){notice.value=error instanceof Error?error.message:'缩放未能完成';return false}
  }
  function applyPanels(parentId:string,items:PanelItem[],options:PanelOptions) {
    try {
      const result=layoutPanels(figure.value,parentId,items,options),before=clone(figure.value)
      figure.value=result.document;commit(before);selectedIds.value=result.panelIds
      notice.value=`已编排 ${result.panelIds.length} 张子图，原生标号可继续编辑；可单步撤销`
      return true
    }catch(error){notice.value=error instanceof Error?error.message:'子图编排未能完成';return false}
  }
  function addNamedPort(ownerId:string,direction:ComponentPort['direction']) {
    const id=`port-${crypto.randomUUID()}`
    if(update(doc=>{addComponentPort(doc,ownerId,direction,id)})){selectedId.value=id;notice.value='已添加接口；可拖动圆点沿边调整位置'}
  }
  function setNamedPort(id:string,patch:Partial<ComponentPort>&{label?:string}) {return update(doc=>updateComponentPort(doc,id,patch))}
  function dragNamedPort(id:string,position:number) {updateComponentPort(figure.value,id,{position:Math.max(0,Math.min(1,position))})}
  function removeNamedPort(id:string) {const parent=figure.value.nodes.find(n=>n.id===id)?.parentId;if(update(doc=>removeComponentPort(doc,id)))selectedId.value=parent??'stage'}
  function groupSelection() {
    const id = `group-${crypto.randomUUID()}`
    if (update(doc => groupObjects(doc, selectedIds.value, id))) { selectedId.value = id; activePanel.value = 'layers'; notice.value = '已创建子容器，移动时包含内部对象' }
  }
  function ungroupSelection() {
    let ids: string[] = []
    if (update(doc => { ids = ungroupObject(doc, selectedId.value) })) selectedIds.value = ids.length ? ids : ['stage']
  }
  function removeSelected() {
    if (selectedIds.value.includes('stage')) { notice.value = '保留主容器，可以删除内部节点、子容器与连接'; return }
    const ids = new Set(selectedIds.value)
    for (const id of selectedIds.value) descendants(figure.value, id).forEach(o => ids.add(o.id))
    for(const node of figure.value.nodes) if(node.path&&[node.path.start,node.path.end].some(b=>b&&ids.has(b.nodeId))) ids.add(node.id)
    update(doc => {
      doc.nodes = doc.nodes.filter(n => !ids.has(n.id)); doc.containers = doc.containers.filter(c => !ids.has(c.id))
      doc.edges = doc.edges.filter(e => !ids.has(e.id) && !ids.has(e.source) && !ids.has(e.target))
    })
    selectedId.value = 'stage'
  }
  function undo() {
    const previous = past.value.at(-1)
    if (!previous) return
    future.value.push(clone(figure.value)); figure.value = previous; past.value = past.value.slice(0, -1); selectedId.value = 'stage'
  }
  function redo() {
    const next = future.value.at(-1)
    if (!next) return
    past.value.push(clone(figure.value)); figure.value = next; future.value = future.value.slice(0, -1); selectedId.value = 'stage'
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(figure.value)); saved.value = true; storageError.value = ''; notice.value = '工程已保存到当前浏览器' }
    catch { storageError.value = '本地保存失败，请导出工程文件保存。'; notice.value = storageError.value }
  }
  function importProject(text: string) {
    if (text.length > 2_000_000) throw new Error('工程文件过大，限制为 2 MB')
    const imported = parseDocument(JSON.parse(text)), before = clone(figure.value)
    figure.value = imported; imageDraftPlan.value=null; commit(before); selectedId.value = 'stage'; notice.value = '已导入工程'
  }
  function newProject(kind: 'blank' | 'example' = 'example') { const before = clone(figure.value); figure.value = kind === 'blank' ? createBlank() : createExample();imageDraftPlan.value=null; commit(before); selectedId.value = 'stage' }
  function toggleConnect() { connectMode.value = !connectMode.value; connectionSource.value = null }
  function openAssistant() {
    if (activePanel.value !== 'assistant') previousMaterialPanel = activePanel.value
    activePanel.value = 'assistant'
  }
  function closeAssistant() { activePanel.value = previousMaterialPanel }
  function addReference(image: ReferenceImage): boolean {
    if (figure.value.references.some(r => r.sha256 === image.sha256)) { notice.value = '这张图片已在参考图中'; return false }
    if (figure.value.references.length >= 3) { notice.value = '每个工程最多保存 3 张参考图'; return false }
    if (figure.value.references.reduce((sum, r) => sum + r.dataUrl.length, image.dataUrl.length) > 1_200_000) { notice.value = '参考图总容量超过限制，请先移除其他参考图'; return false }
    if (!update(doc => {const origin=doc.imageDrafts?.find(d=>d.sha256===image.sha256);doc.references.push(clone({...image,...(!image.generated&&origin?{generated:{runId:origin.runId,sha256:origin.sha256,provider:origin.provider,illustrative:true as const}}:{})})) })) return false
    referenceId.value = image.id; referenceMode.value = 'side'; notice.value = '已导入参考图，可开始对照重绘'; return true
  }
  function addDraftReference(image:ReferenceImage,origin:ImageDraftOrigin){
    if(image.generated?.runId!==origin.runId||image.sha256!==origin.sha256){notice.value='AI 草稿图片与来源不符';return false}
    if(figure.value.references.length>=3||figure.value.references.some(r=>r.sha256===image.sha256)){notice.value='参考图已存在或数量已满，请先调整参考图';return false}
    if(!update(doc=>{doc.imageDrafts=mergeImageDrafts(doc.imageDrafts,[origin]);doc.references.push(clone(image))}))return false
    referenceId.value=image.id;referenceMode.value='side';notice.value='已导入 AI 草稿，可核对后重绘';return true
  }
  function editReference(id: string, patch: Partial<Pick<ReferenceImage, 'title' | 'citation' | 'placement'>>): boolean {
    return update(doc => {
      const image = doc.references.find(r => r.id === id)
      if (!image) throw new Error('参考图已移除')
      Object.assign(image, patch)
      for (const object of [...doc.nodes, ...doc.containers]) if (object.evidence?.image?.sha256 === image.sha256) {
        object.evidence.title = image.title; object.evidence.reference = image.citation || image.fileName
      }
    })
  }
  function fitActiveReference() {
    const image = activeReference.value
    if (image) editReference(image.id, { placement: fitReference(image, currentContainer.value) })
  }
  function removeReference(id: string) {
    if (update(doc => { doc.references = doc.references.filter(r => r.id !== id) })) notice.value = '已移除参考图；对象上记录的来源和证据区域仍保留，可撤销恢复'
  }
  function bindEvidence(region: EvidenceRegion): boolean {
    const image = activeReference.value, object = findObject(figure.value, selectedId.value)
    if (!image || !object || selectedIds.value.length !== 1) { notice.value = '请先选择一个节点或容器'; return false }
    if (!update(doc => { findObject(doc, object.id)!.evidence = referenceSource(image, region) })) return false
    notice.value = '已关联原图区域，存为组件时会保留来源'; return true
  }
  function clearEvidence() { update(doc => { const object = findObject(doc, selectedId.value); if (object) delete object.evidence }) }
  return { selectedEdgePoint,dragEdgePoint,setEdgePoint,removeEdgePoint,figure, root, currentContainer, activeStyle, selectedId, selectedIds, selectedNode, selectedEdge, selectedContainer, selectedObjects, canGroup, activePanel, library,repository,styleLibrary,styleDialog,assistantStyle,applySavedStyle,useSavedStyle, libraryTab, assetDialog,recipeDialogId,applyRecipePreview,componentCapture,openComponentCapture, chartDialog,chartDataImportOpen,assistantDataset,assistantAssetId,layoutDialogOpen, vectorImportOpen, routes, blockedRoutes,
    connectMode, connectionSource, zoom, showGrid, saved, storageError, notice, past, future, nodeCount, select, selectAll, selectRegion,
    addNode, insertComponent, setStyle,applyTheme, setAccent, inheritAppearance, setLabel, update, move, moveSelection, beginDrag, endDrag, cancelDrag, setPosition, setSize, resize, alignSelection,
    arrangeSelection, applyLayout, materialEdit,calloutOpen,panelLayoutOpen,detailInsetOpen, applyPanels, publicationOpen, setPublication, scaleDialogId, applyScale, groupSelection, ungroupSelection, removeSelected, undo, redo, save, importProject, newProject, toggleConnect,
    referenceId, referenceMode, referenceOpacity, evidenceRegion, activeReference, addReference,addDraftReference, editReference, fitActiveReference, removeReference, bindEvidence, clearEvidence,
    openAssistant, closeAssistant, assistantSeed, assistantReferenceId, assistantTask, requestReconstruction, imageDraftPlan, requestImageDraft, textTarget, textEdit, beginTextEdit, finishTextEdit, formatText, paintSelection, addIcon, applyPalette, useMaterialPrompt, setNodeStructure, fitStructure,
    structureExpandId,selectedPathPoint,expandSelectedStructure,dragPathPoint,setPathPoint,addPathBend,removePathBend,detachPath,bindPathEndpoint,dragPathControl,setPathControl,changePathSegment,addNamedPort,setNamedPort,dragNamedPort,removeNamedPort }
}
export type Editor = ReturnType<typeof createEditor>
export const editorKey: InjectionKey<Editor> = Symbol('FastFigureEditor')
export function useEditor() {
  const editor = inject(editorKey)
  if (!editor) throw new Error('Editor provider is missing')
  return editor
}
