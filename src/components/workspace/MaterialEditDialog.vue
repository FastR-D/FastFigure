<script setup lang="ts">
import {computed,ref,watch,onMounted,onBeforeUnmount} from 'vue'
import {Box,Button,Field,Footer,Header,Heading,Modal,ModalBody,Select,Text,TextArea,TextField} from '../ui'
import IconButton from '../ui/IconButton.vue'
import FigureRenderer from '../figure/FigureRenderer'
import TextCheckReport from '../figure/TextCheckReport.vue'
import {checkFigureText} from '../../core/figureTextCheck'
import {useEditor} from '../../composables/useEditor'
import {fontStack} from '../../data/materials'
import {anchor,clone} from '../../core/model'
import {edgeWaypointPoints,edgeRouteContainer} from '../../core/edgeWaypoints'
import {routeEdge} from '../../core/routing'
import {allObjects,contentBounds,descendants,findObject,topLevelSelection,resolveStyle} from '../../core/geometry'
import {pathPoints} from '../../core/paths'
import {applyMaterialEdits,type MaterialEdit} from '../../core/materialEditing'
import {lineStyleTargets,resolvedEdgeAppearance,describeLineStyle,type LineStylePatch} from '../../core/lineAppearance'
import LineStyleControls from './LineStyleControls.vue'
import {createLineStyleDraft,lineStyleFromDraft} from './lineStyleDraft'
import {figurePaint} from '../../core/paint'

const editor=useEditor(),base=clone(editor.figure.value),baseline=JSON.stringify(base),action=editor.materialEdit.value!,mode=action==='path-arrow'?'arrow':action,before=ref(false),previewSelection=ref<string[]>([])
const selected=topLevelSelection(base,editor.selectedIds.value).filter(o=>o.parentId&&!('interfaceFor'in o&&o.interfaceFor)),objectIds=selected.map(o=>o.id)
const candidates=selected.flatMap(o=>[o,...descendants(base,o.id)])
const shape=(o:typeof candidates[number])=>'kind'in o&&!['path','text','icon','port'].includes(o.kind)
const initialSource=candidates.find(o=>shape(o)&&'label'in o&&o.label.trim())??candidates.find(o=>'kind'in o&&o.kind==='text'&&o.label.trim())??candidates.find(shape)??candidates.find(o=>'kind'in o&&o.kind!=='port')??selected[0]
const sourceId=ref(initialSource?.id??'')
const textPolicy=ref<'family'|'typeface'|'match'>('family'),includeDescriptions=ref(false),growFrames=ref(false),fitAnchor=ref<'center'|'top-left'>('center'),expandGroups=ref(true),fontEpoch=ref(0),fontsReady=ref(true)
const dimension=ref<'width'|'height'|'both'>('both'),sizeAnchor=ref<'center'|'top-left'>('top-left')
const requestedIds=[...editor.selectedIds.value]
const initialLines=mode==='line-style'?lineStyleTargets(base,requestedIds,true):undefined,firstEdge=initialLines?.edges[0],firstPath=initialLines?.paths[0]
const initialLine=firstEdge?resolvedEdgeAppearance(base,firstEdge):{stroke:firstPath?.visual?.stroke&&firstPath.visual.stroke!=='none'?firstPath.visual.stroke:figurePaint(resolveStyle(base,firstPath?.parentId??'stage')).ink,strokeWidth:firstPath?.visual?.strokeWidth??1.3,dash:firstPath?.visual?.dash??[],arrow:firstPath?.path?.arrow??'filled',startArrow:firstPath?.path?.startArrow??'none',arrowSize:firstPath?.path?.arrowSize??Math.max(3*(firstPath?.metricScale??1),3*(firstPath?.visual?.strokeWidth??1.3))}
const lineDraft=ref(createLineStyleDraft({stroke:initialLine.stroke,strokeWidth:initialLine.strokeWidth,dash:initialLine.dash,arrow:initialLine.arrow},initialLine))
const axis=ref<'both'|'horizontal'|'vertical'>('both'),typography=ref(!initialSource||!('kind'in initialSource)||!['path','port'].includes(initialSource.kind)),stroke=ref(!!initialSource&&'kind'in initialSource&&!['text','icon','port'].includes(initialSource.kind)),fill=ref(false),includeDescendants=ref(true),reflowPositioned=ref(false)
const edge=action==='edge-route'?base.edges.find(e=>e.id===editor.selectedId.value):undefined
const editPath=action==='path-arrow'?base.nodes.find(n=>n.id===editor.selectedId.value):undefined,existing=editPath?.path&&!editPath.path.points.some(p=>p.move||p.close)?editPath:undefined
const parentId=ref(edge?edgeRouteContainer(base,edge.source,edge.target):existing?.parentId??(editor.selectedContainer.value?.id??selected[0]?.parentId??'stage'))
const area=computed(()=>contentBounds(base.containers.find(c=>c.id===parentId.value)!))
const initial=area.value,autoPins=edge?routeEdge(base,edge).points.slice(1,-1):[],edgePins=edge?.manualRoute?edgeWaypointPoints(base,edge):autoPins.length?autoPins:edge?[{x:(anchor(base.nodes.find(n=>n.id===edge.source)!,edge.sourcePort)[0]+anchor(base.nodes.find(n=>n.id===edge.target)!,edge.targetPort)[0])/2,y:(anchor(base.nodes.find(n=>n.id===edge.source)!,edge.sourcePort)[1]+anchor(base.nodes.find(n=>n.id===edge.target)!,edge.targetPort)[1])/2}]:[]
const coordinates=ref((edge?edgePins:existing?pathPoints(base,existing):[{x:Math.round(initial.x+initial.width*.25),y:Math.round(initial.y+initial.height*.35)},{x:Math.round(initial.x+initial.width*.65),y:Math.round(initial.y+initial.height*.65)}]).map(p=>`${p.x}, ${p.y}`).join('\n'))
const direction=ref<'horizontal'|'vertical'|'strict'>(edge?.manualRoute?.direction??'horizontal'),arrow=ref<'none'|'open'|'filled'>(existing?.path?.arrow??'filled')
const startArrow=ref<'none'|'open'|'filled'>(existing?.path?.startArrow??'none'),customArrowSize=ref(existing?.path?.arrowSize!==undefined),arrowSize=ref(existing?.path?.arrowSize??8)
const title=mode==='match-size'?'统一素材尺寸':mode==='line-style'?'统一连线样式':mode==='fit-text'?'适配文字框':mode==='edge-route'?'指定连线折点':mode==='center'?'素材快速居中':mode==='format'?'统一素材格式':existing?'按点调整直角箭头':'按点绘制直角箭头'
const sampleOptions=allObjects(base).filter(o=>o.parentId&&!('interfaceFor'in o&&o.interfaceFor)).map(o=>({value:o.id,label:`${'kind'in o?o.label||o.kind:o.title} · ${o.id}`}))
function points(){
  if(mode==='edge-route'&&!coordinates.value.trim())return[]
  const lines=coordinates.value.trim().split(/\n/),minimum=mode==='edge-route'?1:2,maximum=mode==='edge-route'?32:64
  if(lines.length<minimum||lines.length>maximum)throw new Error(`请逐行填写 ${minimum}–${maximum} 个坐标点`)
  return lines.map((line,i)=>{const parts=line.trim().split(/[,，\s]+/);if(parts.length!==2||parts.some(p=>!p||!Number.isFinite(Number(p))))throw new Error(`第 ${i+1} 行请填写 X, Y 两个有限数值`);return{x:Number(parts[0]),y:Number(parts[1])}})
}
const fitting=computed(()=>mode==='fit-text'||mode==='format'&&growFrames.value)
const scopeIds=mode==='line-style'?requestedIds:mode==='fit-text'?requestedIds.filter(id=>!!findObject(base,id)):objectIds
function linePatch():LineStylePatch{return lineStyleFromDraft(lineDraft.value)}
function requests():MaterialEdit[]{
  const fit:MaterialEdit={kind:'fit-text',objectIds:scopeIds,includeDescendants:includeDescendants.value,anchor:fitAnchor.value,expandGroups:expandGroups.value,positionedText:reflowPositioned.value?'reflow':'preserve'}
  if(mode==='center')return[{kind:'center',objectIds,axis:axis.value}]
  if(mode==='fit-text')return[fit]
  if(mode==='match-size')return[{kind:'match-size',sourceId:sourceId.value,objectIds,dimension:dimension.value,anchor:sizeAnchor.value}]
  if(mode==='line-style')return[{kind:'line-style',objectIds:scopeIds,includeDescendants:includeDescendants.value,style:linePatch()}]
  if(mode==='format')return[{kind:'format',objectIds,sourceId:sourceId.value,includeDescendants:includeDescendants.value,positionedText:reflowPositioned.value?'reflow':'preserve',textPolicy:textPolicy.value,includeDescriptions:includeDescriptions.value,channels:[...(typography.value?['typography' as const]:[]),...(stroke.value?['stroke' as const]:[]),...(fill.value?['fill' as const]:[])]},...(growFrames.value?[fit]:[])]
  if(mode==='edge-route'){if(!edge)throw new Error('请选择连线');return[{kind:'edge-route',edgeId:edge.id,points:points(),direction:direction.value==='vertical'?'vertical':'horizontal'}]}
  return[{kind:'arrow',parentId:parentId.value,...(existing?{nodeId:existing.id}:{}),points:points(),direction:direction.value,arrow:arrow.value,startArrow:startArrow.value,arrowSize:customArrowSize.value?arrowSize.value:null}]
}
const preview=computed(()=>{const revision=fontEpoch.value;try{return{revision,result:applyMaterialEdits(base,requests()),error:''}}catch(error){return{revision,result:null,error:error instanceof Error&&'issues'in error?(mode==='line-style'?'连线样式无效：至少选择一项，线宽为 0.01–64，箭头大小为 0.1–256，虚线间隔须为非负数且不能全为零':'请选择编辑目标和格式项，坐标须在 1000 × 620 画板内'):(error as Error).message}}})
const fitRows=computed(()=>preview.value.result?.reports.flatMap(r=>r.textFit??[])??[])
let fontRequest=0,disposed=false
const faces=computed(()=>{
  const source=findObject(base,sourceId.value),families=base.nodes.filter(n=>scopeIds.some(id=>id===n.id||descendants(base,id).some(o=>o.id===n.id))).flatMap(n=>[n.textStyle?.family??resolveStyle(base,n.parentId).fontFamily??'Inter',n.descriptionStyle?.family??resolveStyle(base,n.parentId).fontFamily??'Inter'])
  if(source)families.push(source.textStyle?.family??resolveStyle(base,'kind'in source?source.parentId:source.id).fontFamily??'Inter')
  return[...new Set(families)].sort().join('|')
})
watch(faces,async names=>{
  if(!document.fonts)return
  const sequence=++fontRequest;fontsReady.value=false
  try{await Promise.all(names.split('|').filter(Boolean).flatMap(face=>['','bold ','italic '].map(style=>document.fonts.load(`${style}16px ${fontStack(face)}`,[...new Set(base.nodes.flatMap(n=>[...n.label,...(n.description??'')]))].join('').slice(0,4096)||'Paper 图 αβ'))));await document.fonts.ready}catch{/* The renderer and measurement both use the browser's available fallback. */}
  if(!disposed&&sequence===fontRequest){fontsReady.value=true;fontEpoch.value++}
},{immediate:true})
function fontsLoaded(){if(!disposed){fontsReady.value=document.fonts.status==='loaded';fontEpoch.value++}}
function fontsLoading(){fontsReady.value=false}
onMounted(()=>{document.fonts?.addEventListener('loading',fontsLoading);document.fonts?.addEventListener('loadingdone',fontsLoaded);document.fonts?.addEventListener('loadingerror',fontsLoaded)})
onBeforeUnmount(()=>{disposed=true;document.fonts?.removeEventListener('loading',fontsLoading);document.fonts?.removeEventListener('loadingdone',fontsLoaded);document.fonts?.removeEventListener('loadingerror',fontsLoaded)})

const textReport=computed(()=>{const result=preview.value.result;if(!['format','fit-text','match-size'].includes(mode)||!result)return null;const ids=new Set(result.reports.flatMap(r=>r.objectIds));return checkFigureText({...result.figure,nodes:result.figure.nodes.filter(n=>ids.has(n.id))},20)})
const stale=computed(()=>baseline!==JSON.stringify(editor.figure.value))
function close(){editor.materialEdit.value=null}
function apply(){
  const result=preview.value.result
  if(stale.value||!result?.changed||(fitting.value||reflowPositioned.value)&&(!fontsReady.value||document.fonts?.status==='loading'))return
  if(editor.update(doc=>Object.assign(doc,result.figure))){if(mode==='arrow'||mode==='edge-route')editor.select(result.reports[0]!.objectIds[0]!);editor.notice.value=result.reports.map(r=>r.summary).join('；');close()}
}
function askAssistant(){
  const source=findObject(base,sourceId.value),sample=source?`「${'kind'in source?source.label||source.id:source.title}（${source.id}）」`:''
  let content:string
  if(mode==='edge-route'&&edge){try{content=`请调整选中连线，依次经过以下中间坐标：${points().map(p=>`${p.x}, ${p.y}`).join('；')||'清除全部指定折点并恢复自动避障'}。${direction.value==='vertical'?'先垂直再水平':'先水平再垂直'}，保留节点和端口绑定。`}catch(error){editor.notice.value=(error as Error).message;return}}
  else if(mode==='center')content=`请把选中素材作为整体相对父容器${axis.value==='both'?'水平与垂直':axis.value==='horizontal'?'水平':'垂直'}居中，保留内部布局。`
  else if(mode==='fit-text')content='请在保持原文、已设字号、结构和绑定的前提下适配选中文字框；只利用空白区域，不移走邻居，空间不足时报告。'
  else if(mode==='match-size')content=`请按 ${sample} 统一所选素材的${{width:'宽度',height:'高度',both:'宽高'}[dimension.value]}，保持${sizeAnchor.value==='center'?'中心':'左上角'}；只改外框，不缩放内部结构或字号，空间不足时报告。`
  else if(mode==='line-style')content=`请统一选区${includeDescendants.value?'及其内部':'中'}开放路径与节点连接的样式：${describeLineStyle(linePatch())}。保留路由方式、给定折点、路径控制点和端点绑定，跳过图表管理对象。`
  else content=`请以 ${sample} 为样本统一选中素材格式：${typography.value?({family:'只统一字体，保留字号、字重、颜色和对齐',typeface:'统一字形，保留字号、颜色和对齐',match:'主文字完全匹配样本'})[textPolicy.value]:'主文字格式保持'}；${stroke.value?'统一描边':'描边保持'}；${fill.value?'统一填充':'填充保持'}；${includeDescriptions.value?'注释仅统一字体，保留其字号和字重':'注释格式保持'}；${includeDescendants.value?'包含内部图元':'只处理所选对象'}。${growFrames.value?'保留已设字号，适配文字框；不移动邻居，空间不足时报告。':''}保留原文和科学结构。`
  close();editor.useMaterialPrompt(content)
}

</script>
<template>
  <Modal open :label="title" class="panel-layout-dialog" @close="close">
    <Header><Box><Heading>{{ title }}</Heading><Text class="muted-caption">{{ mode==='arrow'||mode==='edge-route'?'按画板坐标生成可编辑的水平、垂直线段。':'检查原图与预览，确认后单步应用。' }}</Text></Box><IconButton icon="close" :label="`关闭${title}`" @click="close" /></Header>
    <ModalBody>
      <Box class="panel-layout-grid">
        <Box class="panel-layout-preview">
          <Box class="material-actions"><Button size="xs" :aria-pressed="before" @click="before=true">原图</Button><Button size="xs" :aria-pressed="!before" @click="before=false">编辑预览</Button></Box>
          <FigureRenderer :figure="before?base:preview.result?.figure??base" :show-document-title="false" :selected-ids="previewSelection" />
          <Text v-for="report in preview.result?.reports??[]" :key="report.kind" class="muted-caption" role="status">{{ report.summary }}</Text>
        </Box>
        <Box class="panel-layout-controls">
          <template v-if="mode==='center'">
            <Text>选中 {{ selected.length }} 个同层对象；整组选区相对父容器的可用区域居中。</Text>
            <Field><Text>居中方向</Text><Select :value="axis" :options="[{value:'both',label:'水平与垂直居中'},{value:'horizontal',label:'仅水平居中'},{value:'vertical',label:'仅垂直居中'}]" aria-label="素材居中方向" @change="axis=$event as typeof axis" /></Field>
            <Text class="muted-caption">素材内的节点、连接和注释随组移动；连接到其他对象的线会随端点更新。</Text>
          </template>
          <template v-else-if="mode==='format'">
            <Field><Text>格式样本</Text><Select :value="sourceId" :options="sampleOptions" aria-label="统一格式样本" @change="sourceId=$event" /></Field>
            <Field v-if="typography"><Text>文字统一方式</Text><Select :value="textPolicy" :options="[{value:'family',label:'只统一字体，保留文字层级'},{value:'typeface',label:'统一字形，保留字号、颜色、对齐'},{value:'match',label:'主文字完全匹配样本'}]" aria-label="文字统一方式" @change="textPolicy=$event as typeof textPolicy" /></Field>
            <Box role="group" aria-label="统一格式项目" class="panel-layout-controls">
              <Field class="checkbox-field"><TextField v-model="typography" type="checkbox" aria-label="统一主文字" /><Text>主文字：按所选方式统一</Text></Field>
              <Field class="checkbox-field"><TextField v-model="stroke" type="checkbox" aria-label="统一描边" /><Text>描边：颜色、渐变、线宽、虚线、端点</Text></Field>
              <Field class="checkbox-field"><TextField v-model="fill" type="checkbox" aria-label="统一填充" /><Text>填充：颜色、渐变与填充透明度</Text></Field>
              <Field class="checkbox-field"><TextField v-model="includeDescendants" type="checkbox" aria-label="统一包含所选素材的内部图元" /><Text>包含所选素材的内部图元</Text></Field>
              <Field v-if="typography" class="checkbox-field"><TextField v-model="includeDescriptions" type="checkbox" aria-label="注释也统一字体" /><Text>注释也统一字体，保留字号、字重和颜色</Text></Field>
              <Field class="checkbox-field"><TextField v-model="growFrames" type="checkbox" aria-label="统一格式后适配文字框" /><Text>统一后适配文字框，保留已设字号</Text></Field>
              <Field class="checkbox-field"><TextField v-model="reflowPositioned" type="checkbox" aria-label="重新排版导入文字" /><Text>重新排版导入文字（保留基点和旋转，更新字形框）</Text></Field>
            </Box>
            <Text class="muted-caption">样本自身保持。保留原文、科学结构和端点绑定；按所选方式保留文字层级。定位文字默认保持，可勾选重新排版；图表管理对象和变换描边按项目跳过。</Text>
          </template>
          <template v-else-if="mode==='fit-text'">
            <Text>检查选区内现有文字，扩大有空白空间的文字框，保留已设字号和原文。</Text>
            <Field class="checkbox-field"><TextField v-model="includeDescendants" type="checkbox" aria-label="适配包含内部图元" /><Text>包含内部图元</Text></Field>
            <Field class="checkbox-field"><TextField v-model="reflowPositioned" type="checkbox" aria-label="适配时重新排版导入文字" /><Text>重新排版导入文字，保留基点和旋转</Text></Field>
          </template>
          <template v-else-if="mode==='match-size'">
            <Field><Text>尺寸样本</Text><Select :value="sourceId" :options="sampleOptions" aria-label="统一尺寸样本" @change="sourceId=$event" /></Field>
            <Field><Text>匹配项目</Text><Select :value="dimension" :options="[{value:'both',label:'相同宽高'},{value:'width',label:'相同宽度'},{value:'height',label:'相同高度'}]" aria-label="统一尺寸项目" @change="dimension=$event as typeof dimension" /></Field>
            <Field><Text>固定基点</Text><Select :value="sizeAnchor" :options="[{value:'top-left',label:'左上角不变'},{value:'center',label:'中心不变'}]" aria-label="统一尺寸基点" @change="sizeAnchor=$event as typeof sizeAnchor" /></Field>
            <Text>按样本精确匹配外框；样本自身保持。容器中的独立图元、字号、路径与绑定不缩放。</Text>
            <Text class="muted-caption">内部结构会随所属形状的外框重新排布；定位文字、路径、接口和图表管理对象保持。放不下内容或会阻塞连接时不能应用，不自动挪动邻居。需要整体缩放素材时，请使用组合的“整体缩放”。</Text>
          </template>
          <template v-else-if="mode==='line-style'">
            <Field class="checkbox-field"><TextField v-model="includeDescendants" type="checkbox" aria-label="连线样式包含内部图元" /><Text>包含内部路径与两端均在选区内的连接</Text></Field>
            <LineStyleControls v-model="lineDraft" />
            <Text class="muted-caption">保留节点与端口绑定、指定折点、路由模式和路径控制点。闭合图形、图表管理路径及变换描边保持。受阻连接继续显示红色虚线提示；恢复畅通后显示设置的样式。</Text>
          </template>
          <template v-else-if="mode==='arrow'">
            <Field><Text>放置容器</Text><Select :value="parentId" :disabled="!!existing" :options="base.containers.map(c=>({value:c.id,label:c.title}))" aria-label="按点箭头放置容器" @change="parentId=$event" /></Field>
            <Text class="muted-caption">可用坐标：X {{ Number(area.x.toFixed(2)) }}–{{ Number((area.x+area.width).toFixed(2)) }}，Y {{ Number(area.y.toFixed(2)) }}–{{ Number((area.y+area.height).toFixed(2)) }}</Text>
            <Field><Text>给定点（每行 X, Y）</Text><TextArea v-model="coordinates" rows="7" maxlength="4000" aria-label="箭头给定坐标点" spellcheck="false" /></Field>
            <Field><Text>斜向两点之间的折线</Text><Select :value="direction" :options="[{value:'horizontal',label:'先水平，再垂直'},{value:'vertical',label:'先垂直，再水平'},{value:'strict',label:'严格按输入：每段须水平或垂直'}]" aria-label="给定点连线方向" @change="direction=$event as typeof direction" /></Field>
            <Field><Text>终点箭头</Text><Select :value="arrow" :options="[{value:'filled',label:'实心箭头'},{value:'open',label:'开放箭头'},{value:'none',label:'无箭头'}]" aria-label="按点箭头样式" @change="arrow=$event as typeof arrow" /></Field>
            <Field><Text>起点箭头</Text><Select :value="startArrow" :options="[{value:'none',label:'无箭头'},{value:'filled',label:'实心箭头'},{value:'open',label:'开放箭头'}]" aria-label="按点起点箭头样式" @change="startArrow=$event as typeof startArrow" /></Field>
            <Field class="checkbox-field"><TextField v-model="customArrowSize" type="checkbox" aria-label="自定义按点箭头大小" /><Text>自定义两端箭头大小</Text></Field>
            <TextField v-if="customArrowSize" v-model="arrowSize" type="number" min="0.1" max="256" step="1" aria-label="按点箭头大小" />
            <Text v-if="existing?.path?.points.some(p=>p.c1)" class="muted-caption">当前路径含曲线；应用后改为连接原锚点的直角折线，控制点会移除。</Text>
            <Text class="muted-caption">保留每个给定点及顺序；斜向点间补一个直角折点。不自动避障。生成后可编辑各点；移动绑定对象后如需恢复直角，可重新按点调整。</Text>
          </template>
          <template v-else-if="edge">
            <Text>起点：{{ base.nodes.find(n=>n.id===edge?.source)?.label||edge.source }} · {{ edge.sourcePort }}</Text><Text>终点：{{ base.nodes.find(n=>n.id===edge?.target)?.label||edge.target }} · {{ edge.targetPort }}</Text>
            <Text class="muted-caption">两端自动跟随节点和端口，只填写中间必须经过的点；整组移动和缩放时折点随组保持。</Text>
            <Field><Text>指定折点（每行 X, Y）</Text><TextArea v-model="coordinates" rows="7" maxlength="2400" aria-label="连线指定折点坐标" spellcheck="false" /></Field>
            <Field><Text>斜向点之间的方向</Text><Select :value="direction" :options="[{value:'horizontal',label:'先水平，再垂直'},{value:'vertical',label:'先垂直，再水平'}]" aria-label="连线折点优先方向" @change="direction=$event as typeof direction" /></Field>
            <Button size="sm" @click="coordinates=''">清除折点，恢复自动避障</Button>
            <Text class="muted-caption">最多 32 个指定折点。程序补齐端口出线和直角段；相交、越界或立即折返时提示原因，保留给定点。移动端点后若受阻，可拖动画板折点修正或恢复自动避障。</Text>
          </template>
          <Box v-if="fitting" class="panel-layout-controls">
            <Field><Text>扩展基点</Text><Select :value="fitAnchor" :options="[{value:'center',label:'中心不变'},{value:'top-left',label:'左上角不变'}]" aria-label="文字框扩展基点" @change="fitAnchor=$event as typeof fitAnchor" /></Field>
            <Field class="checkbox-field"><TextField v-model="expandGroups" type="checkbox" aria-label="允许透明组合扩展" /><Text>允许透明组合随文字框扩展</Text></Field>
            <Text class="muted-caption">只利用空白，不移动邻居；保留既有清晰连接。空间不足的对象保持，并逐项列出。浏览器按当前字体测量，助手候选中的布局估算需对照预览。</Text>
            <Text v-if="!fontsReady" role="status" class="muted-caption">正在加载当前字体，随后更新测量预览。</Text>
            <Box v-for="row in fitRows.filter(r=>r.status==='fitted')" :key="row.nodeId" class="text-fit-row"><Text>{{ row.label||row.nodeId }} · 已适配文字框</Text><Text class="muted-caption">{{ Math.round(row.before.width) }} × {{ Math.round(row.before.height) }} → {{ Math.round(row.after.width) }} × {{ Math.round(row.after.height) }} · {{ row.engine==='canvas'?'浏览器字形测量':'布局估算' }}{{ row.expandedGroups.length?' · 透明组合边界已扩展':'' }}</Text></Box>
          </Box>
          <Box v-if="preview.result?.reports.some(r=>r.skipped.length)" class="material-edit-skipped"><Text>按格式项目保留：</Text><Text v-for="item in preview.result.reports.flatMap(r=>r.skipped)" :key="item" class="muted-caption">{{ item }}</Text></Box>
          <TextCheckReport v-if="textReport" :report="textReport" :expanded="!!textReport.total" @locate="previewSelection=[$event];before=false" />
          <Text v-if="stale" role="alert" class="error-text">画板已改变，请关闭后重新预览。</Text>
          <Text v-else-if="preview.error" role="alert" class="error-text">{{ preview.error }}</Text>
          <Button v-if="mode!=='arrow'" size="sm" @click="askAssistant">交给助手提出方案</Button>
        </Box>
      </Box>
    </ModalBody>
    <Footer><Text class="muted-caption">应用后可撤销</Text><Button @click="close">取消</Button><Button variant="primary" :disabled="stale||!preview.result?.changed||(fitting||reflowPositioned)&&!fontsReady" @click="apply">应用{{ mode==='center'?'居中':mode==='format'?'统一格式':mode==='edge-route'?'连线折点':mode==='fit-text'?'文字适配':mode==='match-size'?'统一尺寸':mode==='line-style'?'连线样式':'按点箭头' }}</Button></Footer>
  </Modal>
</template>
<style scoped>
.material-edit-skipped { max-height: 140px; overflow: auto; }
</style>
