<script setup lang="ts">
import {visualRoleLabels,textRoleLabels,type visualRoles,type textRoles} from '../../core/paperStyle'
import {snapshotEdgeWaypoints,reframeEdgeWaypoints} from '../../core/edgeWaypoints'
import TextRunsEditor from './TextRunsEditor.vue'
import GradientControls from './GradientControls.vue'
import {supportsGradient} from '../../core/gradient'
import ImageDraftOriginView from '../references/ImageDraftOriginView.vue'
import ReconstructionReuseSummary from '../references/ReconstructionReuseSummary.vue'
import PathBindings from './PathBindings.vue'
import { computed, defineAsyncComponent } from 'vue'
import { Aside, Box, Text, Heading, Field, TextField, TextArea, Button, Select } from '@fastrd/ui-vue'
import { Icon } from '../ui'
import { useEditor } from '../../composables/useEditor'
import { nodeKinds, nodeKindLabels, containerRoles,edgeRoutingSchema, type NodeKind, type Port } from '../../core/model'
import { ancestors,findObject, resolveStyle } from '../../core/geometry'
import ReferenceUseSummary from '../harness/ReferenceUseSummary.vue'
import CompositionPlanView from '../harness/CompositionPlanView.vue'
import ComponentPorts from './ComponentPorts.vue'
import ContainerConnections from './ContainerConnections.vue'
import SelectionTools from '../workspace/SelectionTools.vue'
import { nodeStructure, structureLabels, structurePresets, structurePreset, type StructureType } from '../../core/structures'
import { pathPoints } from '../../core/paths'
import { figurePaint } from '../../core/paint'
const ReconstructionInspector=defineAsyncComponent(()=>import('./ReconstructionInspector.vue'))
const editor = useEditor()
const recipeOwner=computed(()=>[editor.selectedId.value,...ancestors(editor.figure.value,editor.selectedId.value)].map(id=>editor.figure.value.containers.find(c=>c.id===id)).find(container=>container?.parametric))
const node = editor.selectedNode, edge = editor.selectedEdge
const container = editor.selectedContainer
const multiple = computed(() => editor.selectedIds.value.length > 1)
const object = computed(() => !multiple.value ? findObject(editor.figure.value, editor.selectedId.value) : undefined)
function changeVisualRole(role:string){editor.update(doc=>{const o=findObject(doc,editor.selectedId.value);if(!o)return;o.visual={...o.visual,role:(role||undefined) as typeof visualRoles[number]|undefined};for(const key of ['fill','stroke','fillGradient','strokeGradient','radius','padding','dash'] as const)delete o.visual[key]})}
function changeTextRole(role:string){editor.update(doc=>{const n=doc.nodes.find(n=>n.id===editor.selectedId.value);if(!n)return;n.textRole=(role||undefined) as typeof textRoles[number]|undefined;if(n.textStyle)for(const key of ['family','bold','weight','color'] as const)delete n.textStyle[key]})}
const selectedLabel = computed(() => node.value?.label ?? container.value?.title ?? '')
const nodeOptions = computed(() => editor.figure.value.nodes.filter(n=>n.kind!=='path').map(n=>({value:n.id,label:n.socket?`${editor.figure.value.containers.find(c=>c.id===n.interfaceFor)?.title} · ${n.label}`:n.label||nodeKindLabels[n.kind]})))
const portOptions = [{ value: 'left', label: '左侧' }, { value: 'right', label: '右侧' }, { value: 'top', label: '顶部' }, { value: 'bottom', label: '底部' }]
const sourceFixed=computed(()=>!!editor.figure.value.nodes.find(n=>n.id===edge.value?.source)?.socket)
const targetFixed=computed(()=>!!editor.figure.value.nodes.find(n=>n.id===edge.value?.target)?.socket)
const kindOptions = nodeKinds.filter(kind=>!['path','port','image'].includes(kind)).map(kind => ({ value: kind, label: nodeKindLabels[kind] }))
const points=computed(()=>node.value?.path?pathPoints(editor.figure.value,node.value):[])
const pathColor=computed(()=>node.value?.visual?.stroke&&node.value.visual.stroke!=='none'?node.value.visual.stroke:figurePaint(resolveStyle(editor.figure.value,node.value?.parentId??'stage'),node.value?.visual?.colorIndex).ink)
function pointChange(index:number,axis:'x'|'y',event:Event) {
  const input=event.target as HTMLInputElement,point=points.value[index]
  if(point)editor.setPathPoint(index,{...point,[axis]:Number(input.value)})
  input.value=String(Math.round(points.value[index]?.[axis]??0))
}
function pathWidthChange(event:Event) {
  const input=event.target as HTMLInputElement
  editor.update(doc=>{const n=doc.nodes.find(n=>n.id===editor.selectedId.value);if(n)n.visual={...n.visual,strokeWidth:Number(input.value)}})
  input.value=String(node.value?.visual?.strokeWidth??1.3)
}
const structure = computed(()=>node.value?nodeStructure(node.value):undefined)
const blockLabels = computed(()=>structure.value?structureLabels(structure.value):[])
function setBlockLabel(index:number,event:Event) {
  editor.beginTextEdit(editor.selectedId.value,`structure:${index}`)
  editor.finishTextEdit((event.target as HTMLInputElement).value)
}
function repeatsChange(event:Event) {
  const input=event.target as HTMLInputElement
  editor.update(doc=>{const n=doc.nodes.find(n=>n.id===editor.selectedId.value);if(n&&structure.value)n.structure={...structure.value,repeats:Number(input.value)}})
  input.value=String(structure.value?.repeats??1)
}
function value(e: Event) { return (e.target as HTMLInputElement).value }
function labelChange(e: Event) { const input = e.target as HTMLInputElement; editor.setLabel(input.value); input.value = selectedLabel.value }
function setKind(kind: string) { editor.update(doc => { const n = doc.nodes.find(n => n.id === editor.selectedId.value); if (n) n.kind = kind as NodeKind }) }
function edgeChange(key: 'source' | 'target' | 'sourcePort' | 'targetPort', v: string) {
  editor.update(doc => { const e = doc.edges.find(e => e.id === editor.selectedId.value); if (e) { const pins=snapshotEdgeWaypoints(doc,edge=>edge.id===e.id);if (key === 'sourcePort' || key === 'targetPort') e[key] = v as Port; else {e[key]=v;const socket=doc.nodes.find(n=>n.id===v)?.socket;if(socket)e[key==='source'?'sourcePort':'targetPort']=socket.side}reframeEdgeWaypoints(doc,pins) } })
}
function setEdgeRouting(value:string){if(value==='manual'){editor.materialEdit.value='edge-route';return}const routing=edgeRoutingSchema.parse(value);editor.update(doc=>{const selected=doc.edges.find(e=>e.id===editor.selectedId.value);if(selected){selected.routing=routing;delete selected.manualRoute}})}
function showEvidence() {
  const image = editor.figure.value.references.find(r => r.sha256 === object.value?.evidence?.image?.sha256)
  if (image) { editor.referenceId.value = image.id; editor.referenceMode.value = 'side' }
  editor.activePanel.value = 'references'
}
</script>

<template>
  <Aside class="inspector-panel" aria-label="对象属性">
    <Box class="panel-title"><Heading>属性</Heading><Text class="type-badge">{{ multiple ? '多选' : node ? '组件' : edge ? '连接' : '容器' }}</Text></Box>
    <Box class="inspector-body">
      <Box class="selection-description"><Box class="selection-icon"><Icon :name="multiple ? 'group' : node ? 'diagram' : edge ? 'connect' : 'panel'" /></Box><Box><Text class="selection-title">{{ multiple ? `已选择 ${editor.selectedIds.value.length} 个对象` : node ? node.label : edge ? '节点连接' : container?.title }}</Text><Text class="muted-caption">{{ multiple ? '批量设置格式、排列图元或删除' : node ? '可独立编辑的科研组件' : edge ? '端口绑定随节点移动' : '移动容器时带动内部对象' }}</Text></Box></Box>
      <template v-if="object&&!multiple&&!node?.chart&&!container?.dataChart&&editor.activeStyle.value.designSystem==='paper'&&!['path','port','image'].includes(node?.kind??'')"><Field><Text>视觉角色</Text><Select :value="object.visual?.role??''" :options="[{value:'',label:'随主题与色槽'},...Object.entries(visualRoleLabels).map(([value,label])=>({value,label}))]" aria-label="视觉角色" @change="changeVisualRole" /></Field><Field v-if="node"><Text>文字角色</Text><Select :value="node.textRole??''" :options="[{value:'',label:'自动选择'},...Object.entries(textRoleLabels).map(([value,label])=>({value,label}))]" aria-label="文字角色" @change="changeTextRole" /></Field></template>
      <Field v-if="node && !multiple && !node.socket&&node.kind!=='image'"><Text>{{ node?.kind==='path'?'线段名称':node?.kind==='text'?'文字内容':'组件标签' }}</Text><TextField :key="editor.selectedId.value" :value="selectedLabel" :maxlength="node?.kind==='text'?240:100" aria-label="对象标签" @change="labelChange" /></Field>
      <Box v-if="node?.image&&!multiple" class="structure-settings"><Text>{{ node.image.pixelWidth }} × {{ node.image.pixelHeight }} · 图片插画</Text><Field><Text>图片适配</Text><Select :value="node.image.fit" :options="[{value:'contain',label:'完整显示'},{value:'cover',label:'填满边框（居中裁切）'}]" aria-label="图片适配" @change="editor.update(doc=>{const n=doc.nodes.find(n=>n.id===editor.selectedId.value);if(n?.image)n.image.fit=$event as 'contain'|'cover'})" /></Field><Text v-if="node.image.source" class="muted-caption">{{ node.image.source.provider==='user'?'用户导入':'AI 生成' }} · {{ node.image.source.provider }}</Text></Box>
      <TextRunsEditor v-if="node?.kind==='text'&&!node.textLayout&&!multiple" />
      <Button v-if="node && !multiple&&node.kind!=='path'&&node.kind!=='port'&&node.kind!=='image'" size="xs" @click="editor.beginTextEdit(node.id)">在画布中编辑文字</Button>
      <Field v-if="node && !multiple&&node.kind!=='path'&&node.kind!=='port'&&node.kind!=='image'"><Text>简洁注释</Text><TextArea :value="node.description ?? ''" rows="2" maxlength="240" aria-label="对象注释" placeholder="补充输入输出、动作或关键约束…" @change="editor.update(doc=>{const n=doc.nodes.find(n=>n.id===editor.selectedId.value);if(n)n.description=($event.target as HTMLTextAreaElement).value})" /></Field>
      <Box v-if="node && !multiple&&node.kind!=='path'&&node.kind!=='port'&&node.kind!=='image'" class="material-actions"><Button size="xs" @click="editor.activePanel.value='icons'">选择图示</Button><Button v-if="node.iconId && node.kind!=='icon'" size="xs" @click="editor.update(doc=>{const n=doc.nodes.find(n=>n.id===editor.selectedId.value);if(n)n.iconId='none'})">移除图示</Button></Box>
      <Field v-if="node && !multiple&&node.kind!=='path'&&node.kind!=='port'&&node.kind!=='image'"><Text>组件类型</Text><Select :value="node.kind" :options="kindOptions" aria-label="组件类型" @change="setKind" /></Field>
      <Box v-if="node?.path&&!multiple" class="structure-settings path-settings">
        <Heading>路径编辑</Heading><Text class="muted-caption">拖动蓝色端点或折点；方向键精调，Shift 加速。移动绑定的图元时端点随动；拖动端点会解除该端绑定；删除目标锚点也会解除相应附着，可撤销。</Text>
        <Field v-if="!node.path.points.some(p=>p.close)"><Text>终点箭头</Text><Select :value="node.path.arrow" :options="[{value:'none',label:'无箭头'},{value:'open',label:'开放箭头'},{value:'filled',label:'实心箭头'}]" aria-label="路径箭头" @change="editor.update(doc=>{const n=doc.nodes.find(n=>n.id===editor.selectedId.value);if(n?.path)n.path.arrow=$event as 'none'|'open'|'filled'})" /></Field>
        <Field v-if="!node.path.points.some(p=>p.close)"><Text>起点箭头</Text><Select :value="node.path.startArrow??'none'" :options="[{value:'none',label:'无箭头'},{value:'open',label:'开放箭头'},{value:'filled',label:'实心箭头'}]" aria-label="路径起点箭头" @change="editor.update(doc=>{const n=doc.nodes.find(n=>n.id===editor.selectedId.value);if(n?.path)n.path.startArrow=$event as 'none'|'open'|'filled'})" /></Field>
        <Button v-if="!node.path.points.some(p=>p.close)&&!node.visual?.strokeMatrix" size="xs" @click="editor.materialEdit.value='line-style'">调整路径连线样式</Button>
        <Field><Text>线宽</Text><TextField type="number" min="0.01" max="64" step="0.25" :value="node.visual?.strokeWidth??1.3" aria-label="路径线宽" @change="pathWidthChange" /></Field>
        <Field><Text>描边颜色</Text><TextField type="color" :value="pathColor" aria-label="路径描边颜色" @change="editor.paintSelection('stroke',value($event))" /></Field>
        <Text class="muted-caption">{{ node.path.start?'起点已绑定':'起点自由' }} · {{ node.path.end?'终点已绑定':'终点自由' }}</Text>
        <PathBindings :node="node" />
        <Button v-if="node.path.orthogonal" size="xs" @click="editor.arrowEditId.value=node.id;editor.arrowDrawMode.value=true">编辑箭头折点</Button>
        <Box class="material-actions"><Button size="xs" @click="editor.addPathBend">增加折点</Button><Button size="xs" :disabled="editor.selectedPathPoint.value===null||editor.selectedPathPoint.value===0||editor.selectedPathPoint.value===points.length-1||points[editor.selectedPathPoint.value]?.move||points[editor.selectedPathPoint.value]?.close" @click="editor.removePathBend">删除折点</Button><Button v-if="node.path.start||node.path.end" size="xs" @click="editor.detachPath">解除端点绑定</Button></Box>
        <Box v-for="(point,index) in points" :key="index" class="path-point-fields"><Button size="xs" :aria-pressed="editor.selectedPathPoint.value===index" @click="editor.selectedPathPoint.value=index">点 {{ index+1 }}</Button><TextField type="number" :value="Math.round(point.x)" :aria-label="`路径点 ${index+1} X`" @change="pointChange(index,'x',$event)" /><TextField type="number" :value="Math.round(point.y)" :aria-label="`路径点 ${index+1} Y`" @change="pointChange(index,'y',$event)" /></Box>
        <Field v-if="editor.selectedPathPoint.value!==null && editor.selectedPathPoint.value>0 && !points[editor.selectedPathPoint.value]?.move && !points[editor.selectedPathPoint.value-1]?.close"><Text>到选中点的线段</Text><Select :value="points[editor.selectedPathPoint.value]?.c2?'cubic':points[editor.selectedPathPoint.value]?.c1?'quadratic':'line'" :options="[{value:'line',label:'直线'}, {value:'quadratic',label:'二次贝塞尔'}, {value:'cubic',label:'三次贝塞尔'}]" aria-label="选中线段类型" @change="editor.changePathSegment(editor.selectedPathPoint.value!,$event as 'line'|'quadratic'|'cubic')" /></Field>
        <Text v-if="points.some(p=>p.c1)" class="muted-caption">圆点是锚点，黄色方点是控制点；可拖动或用方向键微调。增加折点按当前曲线精确拆分。</Text>
        <Text v-if="points.some(p=>p.close)" class="muted-caption">含闭合轮廓，子路径边界不可删除。</Text>
      </Box>
      <GradientControls v-if="node && !multiple && supportsGradient(node.kind)" :key="node.id" :node="node" />
      <Box v-if="node?.kind==='module' && !multiple" class="structure-settings">
        <Field><Text>论文组件结构</Text><Select :value="structure?.type??'none'" :options="structurePresets.map(p=>({value:p.type,label:p.name}))" aria-label="论文组件结构" @change="editor.setNodeStructure($event as StructureType)" /></Field>
        <template v-if="structure">
          <Text class="muted-caption">{{ structurePreset(structure.type).note }}。这是结构示意，可按具体方法修改。</Text>
          <Field v-if="['encoder','decoder'].includes(structure.type)"><Text>重复层数</Text><TextField type="number" min="1" max="12" :value="structure.repeats??1" aria-label="结构重复层数" @change="repeatsChange" /></Field>
          <Field v-for="(label,index) in blockLabels" :key="`${node.id}-${structure.type}-${index}`"><Text>内部标签 {{ index+1 }}</Text><TextField :value="label" maxlength="40" :aria-label="`结构内部标签 ${index+1}`" @change="setBlockLabel(index,$event)" /></Field>
          <Button size="xs" @click="editor.fitStructure">展开结构尺寸</Button>
          <Button size="xs" @click="editor.structureExpandId.value=node.id">转换为独立图元</Button>
          <Text class="muted-caption">放大组件显示内部标签；双击标签可直接修改。缩小后保留结构轮廓。</Text>
        </template>
      </Box>
      <Field v-if="container && !multiple"><Text>容器语义</Text><Select :value="container.role" :disabled="!container.parentId||container.role==='component'" :options="containerRoles.filter(role=>role!=='component'||container?.role==='component').map(role => ({value:role,label:({group:'分组',stage:'阶段',boundary:'语义边界',lane:'泳道',panel:'子图面板',component:'自由图元组合'})[role]}))" aria-label="容器语义" @change="editor.update(doc => { const c = doc.containers.find(c => c.id === editor.selectedId.value); if (c) c.role = $event as typeof c.role })" /></Field>
      <Field v-if="container?.role==='component' && container.visual?.fill==='none' && container.visual?.stroke==='none'"><Text>组合透明度 %</Text><TextField type="number" min="0" max="100" :value="(container.opacity??1)*100" aria-label="组合透明度" @change="editor.update(doc=>{const c=doc.containers.find(c=>c.id===editor.selectedId.value);if(c)c.opacity=Number(value($event))/100})" /></Field>
      <Text v-if="container?.role==='component'" class="muted-caption">点击外框选择整组；点击内部图元可独立编辑。外部连接随组合移动，内部图元可改字、调格式、拖动折点并再次入库。</Text>
      <ComponentPorts />
      <ReferenceUseSummary v-if="container?.id==='stage'&&!multiple" :uses="editor.figure.value.referenceUses" removable @remove="index=>editor.update(doc=>{doc.referenceUses?.splice(index,1);if(!doc.referenceUses?.length)delete doc.referenceUses})" />
      <Box v-if="container?.id==='stage'&&!multiple&&editor.figure.value.imageDrafts?.length"><Heading>AI 草稿来源</Heading><Box v-for="origin in editor.figure.value.imageDrafts" :key="origin.runId"><ImageDraftOriginView :origin="origin" /><Button size="xs" variant="quiet" :aria-label="`移除草稿完整记录 ${origin.title}`" @click="editor.update(doc=>{doc.imageDrafts=doc.imageDrafts?.filter(d=>d.runId!==origin.runId);if(!doc.imageDrafts?.length)delete doc.imageDrafts})">移除完整记录（保留 AI 来源标记）</Button></Box></Box>
      <Box v-if="container?.id==='stage'&&!multiple&&editor.figure.value.compositionPlans?.length"><Heading>绘图方案记录</Heading><CompositionPlanView v-for="record in editor.figure.value.compositionPlans" :key="record.runId" :record="record" removable @remove="editor.update(doc=>{doc.compositionPlans=doc.compositionPlans?.filter(p=>p.runId!==record.runId);if(!doc.compositionPlans?.length)delete doc.compositionPlans})" /></Box>
      <Box v-if="container?.dataChart&&!multiple" class="data-chart-inspector"><Heading>数据图表</Heading><Text class="muted-caption">{{ container.dataChart.spec.origin==='example'?'示例':'自填' }}数据 · {{ container.dataChart.spec.kind==='heatmap'?`${container.dataChart.spec.x.length} 行 × ${container.dataChart.spec.series.length} 列`:container.dataChart.spec.kind==='boxplot'?`${container.dataChart.spec.series.length} 组 · ${container.dataChart.spec.x.length} 行样本`:`${container.dataChart.spec.series.length} 个系列 · ${container.dataChart.spec.x.length} 个横轴值` }}</Text><Button size="xs" @click="editor.chartDialog.value={containerId:container.id}">编辑图表数据</Button><Text class="muted-caption">修改数据会重绘生成图元，另加的注释保留；可预览并撤销。</Text></Box>
      <ReconstructionReuseSummary v-if="container?.reconstructionReuse" :record="container.reconstructionReuse" />
    <ReconstructionInspector v-if="container?.reconstruction&&!multiple" :container-id="container.id" />
      <Button v-if="object?.parentId && !multiple" variant="quiet" class="parent-navigation" @click="editor.select(object.parentId!)"><Icon name="layers" />选择父容器</Button>
      <Button v-if="recipeOwner && !multiple" @click="editor.recipeDialogId.value=recipeOwner!.id"><Icon name="grid" />调整组合参数</Button>
      <Box v-if="object?.evidence" class="component-origin evidence-origin"><Text v-if="object.evidence.generated">AI 设计草稿来源 · 非实验依据</Text><Text>重绘来源：{{ object.evidence.title }}</Text><Text>{{ object.evidence.reference }}</Text><Text v-if="object.evidence.file">源文件：{{ object.evidence.file.fileName }}</Text><Text v-if="object.evidence.file?.page">原页面：{{ object.evidence.file.page.index+1 }} · {{ object.evidence.file.page.name }} · {{ object.evidence.file.page.id }}</Text><Text v-if="object.evidence.file?.objectId">源对象 ID：{{ object.evidence.file.objectId }}</Text><Text v-if="object.evidence.image">原图区域：{{ Math.round(object.evidence.image.region.x * 100) }}%, {{ Math.round(object.evidence.image.region.y * 100) }}% · {{ Math.round(object.evidence.image.region.width * 100) }}% × {{ Math.round(object.evidence.image.region.height * 100) }}%</Text><Button v-if="object.evidence.image" size="xs" @click="showEvidence"><Icon name="image" />查看原图区域</Button><Button variant="quiet" size="xs" @click="editor.clearEvidence">解除对象来源关联</Button></Box>
      <Box v-if="container?.component && !multiple" class="component-origin"><Text>来自组件：{{ container.component.name }}</Text><Text v-for="source in container.component.sources" :key="source.reference">{{ source.title }} · {{ source.reference }}</Text><Text v-if="container.component.lineage.length">保留 {{ container.component.lineage.length }} 条派生记录</Text></Box>
      <SelectionTools v-if="multiple || !edge && !node?.socket" />
      <ContainerConnections v-if="container&&!multiple" :container-id="container.id" />
      <Box v-if="edge&&!multiple" class="edge-fields">
        <Text v-if="editor.routes.value.get(edge.id)?.status === 'blocked'" class="error-text" role="status">{{ editor.routes.value.get(edge.id)?.reason }}</Text>
        <Field><Text>起点</Text><Select :value="edge.source" :options="nodeOptions.filter(n => n.value !== edge?.target && editor.figure.value.nodes.find(o=>o.id===n.value)?.socket?.direction!=='input')" aria-label="起点节点" @change="edgeChange('source', $event)" /></Field>
        <Field><Text>终点</Text><Select :value="edge.target" :options="nodeOptions.filter(n => n.value !== edge?.source && editor.figure.value.nodes.find(o=>o.id===n.value)?.socket?.direction!=='output')" aria-label="终点节点" @change="edgeChange('target', $event)" /></Field>
        <Field><Text>起点端口</Text><Select :value="edge.sourcePort" :disabled="sourceFixed" :options="portOptions" aria-label="起点端口" @change="edgeChange('sourcePort', $event)" /></Field>
        <Field><Text>终点端口</Text><Select :value="edge.targetPort" :disabled="targetFixed" :options="portOptions" aria-label="终点端口" @change="edgeChange('targetPort', $event)" /></Field>
        <Box class="material-actions"><Button size="xs" @click="editor.materialEdit.value='edge-route'">指定连线折点</Button><Button size="xs" @click="editor.materialEdit.value='line-style'">调整连线样式</Button></Box><Text v-if="edge.manualRoute" class="muted-caption">{{ edge.manualRoute.points.length }} 个指定折点；拖动蓝点或用方向键微调，Delete 删除。受阻时保留原指定路线。</Text>
        <Field><Text>连线方式</Text><Select :value="edge.routing??'orthogonal'" :options="[{value:'orthogonal',label:'折线避障'},{value:'straight',label:'直线'},{value:'manual',label:'指定折点'}]" aria-label="连线方式" @change="setEdgeRouting" /></Field>
      </Box>
      <Button v-if="editor.selectedIds.value.length && !node?.socket && (multiple || node || edge || container)" variant="danger" @click="editor.removeSelected"><Icon name="trash" />删除{{ multiple ? '所选对象' : node ? '组件' : edge ? '连接' : '容器' }}</Button>
    </Box>
  </Aside>
</template>
