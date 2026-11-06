<script setup lang="ts">
import {createSharedColorbar,updateSharedColorbar,chartColorbarTargets,sharedColorbarEditTargets,detachSharedColorbar} from '../../core/sharedColorbar'
import SharedColorbarControls from '../charts/SharedColorbarControls.vue'
import SharedColorbarEditControls from '../charts/SharedColorbarEditControls.vue'
import type {SharedColorbarUpdateRequest} from '../../core/sharedColorbarContract'
import SharedColorbarSummary from '../charts/SharedColorbarSummary.vue' 
import {alignChartPlots,chartPlotTargets} from '../../core/chartPlotAlignment'
import PlotAlignmentControls from '../charts/PlotAlignmentControls.vue'
import PlotAlignmentSummary from '../charts/PlotAlignmentSummary.vue' 
import { computed, ref, watch } from 'vue'
import { Box, Button, Field, Footer, Header, Heading, Modal, ModalBody, Select, Text, TextField } from '../ui'
import IconButton from '../ui/IconButton.vue'
import FigureRenderer from '../figure/FigureRenderer'
import { useEditor } from '../../composables/useEditor'
import {createSharedLegend,updateSharedLegend,chartLegendTargets,sharedLegendEditTargets,detachSharedLegend} from '../../core/sharedLegend'
import {fontOptions} from '../../data/materials'
import SharedLegendControls from '../charts/SharedLegendControls.vue'
import SharedLegendEditControls from '../charts/SharedLegendEditControls.vue'
import type {SharedLegendUpdateRequest} from '../../core/sharedLegendContract'
import SharedLegendSummary from '../charts/SharedLegendSummary.vue'
import { clone } from '../../core/model'
import { ancestors, childrenOf } from '../../core/geometry'
import { defaultPanelOptions, layoutPanels } from '../../core/panelLayout'
import { routeFigure } from '../../core/routing'
import {chartYAxisTargets,shareChartYAxis} from '../../core/sharedYAxis'
import SharedYAxisControls from '../charts/SharedYAxisControls.vue'
import SharedYAxisSummary from '../charts/SharedYAxisSummary.vue'

const editor = useEditor(), base = clone(editor.figure.value), baseline = JSON.stringify(base)
const current = editor.currentContainer.value
const useCurrent = !(current.parentId && current.role==='component') && !current.dataChart && !current.reconstruction && !current.structureOrigin && childrenOf(base,current.id).filter(o => !('kind' in o)).length >= 2
const mode=ref<'layout'|'axes'|'legend'|'plots'|'colorbar'>('layout'),beforeAxes=ref(false),axisIds=ref<string[]>([])
const barIds=ref<string[]>([]),barSize=ref(14),barFamily=ref(editor.activeStyle.value.fontFamily??'MiSans'),barPlacement=ref<'top'|'bottom'>('bottom'),barInventory=chartColorbarTargets(base,editor.selectedIds.value),barGroups=sharedColorbarEditTargets(base,editor.selectedIds.value)
const barAction=ref<'create'|'update'>(barGroups.some(group=>group.selected)?'update':'create'),barEditRequest=ref<SharedColorbarUpdateRequest|null>(null)
const scopedBars=(id:string)=>barInventory.filter(t=>t.kind==='heatmap'&&ancestors(base,t.containerId).includes(id))
const plotIds=ref<string[]>([]),plotColumns=ref(2),plotInventory=chartPlotTargets(base,editor.selectedIds.value)
const scopedPlots=(id:string)=>plotInventory.filter(t=>ancestors(base,t.containerId).includes(id))
const legendIds=ref<string[]>([]),legendPlacement=ref<'top'|'bottom'>('bottom'),legendSize=ref(14),legendFamily=ref(editor.activeStyle.value.fontFamily??'MiSans')
const legendInventory=chartLegendTargets(base,editor.selectedIds.value),legendGroups=sharedLegendEditTargets(base,editor.selectedIds.value)
const legendAction=ref<'create'|'update'>(legendGroups.some(group=>group.selected)?'update':'create'),legendEditRequest=ref<SharedLegendUpdateRequest|null>(null),legendColumns=ref(0),legendGap=ref(20)
const scopedLegends=(id:string)=>legendInventory.filter(target=>ancestors(base,target.containerId).includes(id))
const inventory=chartYAxisTargets(base,editor.selectedIds.value),selected = new Set(editor.selectedObjects.value.map(o => o.id))
const scopedAxes=(id:string)=>inventory.filter(target=>ancestors(base,target.containerId).includes(id))
let initial=useCurrent?current:base.containers.find(container=>container.id===current.parentId)??current
while(initial.parentId&&base.containers.filter(container=>container.parentId===initial.id&&container.role!=='panel').length<2&&scopedAxes(initial.id).filter(target=>!target.error).length<2)initial=base.containers.find(container=>container.id===initial.parentId)!
const parentId = ref(initial.id)
const options = ref({...defaultPanelOptions}), rows = ref<{containerId:string;caption:string;enabled:boolean;title:string}[]>([])
function reset() {
  const candidates = base.containers.filter(c => c.parentId === parentId.value && c.role !== 'panel'&&!c.sharedLegend&&!c.sharedColorbar).sort((a,b) => a.y-b.y || a.x-b.x)
  const selectedCount = candidates.filter(c => selected.has(c.id)).length
  rows.value = candidates.map(c => ({containerId:c.id,title:c.title,caption:'',enabled:selectedCount >= 2 ? selected.has(c.id) : true}))
  const targets=scopedAxes(parentId.value).filter(target=>!target.error),chosen=targets.filter(target=>selected.has(target.containerId));axisIds.value=(chosen.length>=2?chosen:targets).map(target=>target.containerId)
  const legendTargets=scopedLegends(parentId.value).filter(target=>!target.error),selectedLegends=legendTargets.filter(target=>target.selected);legendIds.value=(selectedLegends.length>=2?selectedLegends:legendTargets).map(target=>target.containerId)
  const plots=scopedPlots(parentId.value).filter(t=>!t.error).sort((a,b)=>{const x=base.containers.find(c=>c.id===a.containerId)!,y=base.containers.find(c=>c.id===b.containerId)!;return Math.abs(x.y-y.y)<8?x.x-y.x:x.y-y.y}),chosenPlots=plots.filter(t=>t.selected);plotIds.value=(chosenPlots.length>=2?chosenPlots:plots).map(t=>t.containerId)
  const bars=scopedBars(parentId.value).filter(t=>!t.error),chosenBars=bars.filter(t=>t.selected);barIds.value=(chosenBars.length>=2?chosenBars:bars).map(t=>t.containerId)
  mode.value=candidates.length<2&&targets.length>=2?'axes':'layout'
}
watch(parentId,reset,{immediate:true})
const scopes = computed(() => base.containers.filter(c => !c.dataChart && !c.sharedLegend && !c.sharedColorbar && !c.reconstruction && !c.structureOrigin).map(c => ({value:c.id,label:`${'· '.repeat(ancestors(base,c.id).length)}${c.title}`})))
const items = computed(() => rows.value.filter(row => row.enabled).map(({containerId,caption}) => ({containerId,caption})))
const stale = computed(() => JSON.stringify(editor.figure.value) !== baseline)
const preview = computed(() => {
  try { return {result:layoutPanels(base,parentId.value,items.value,options.value),error:''} }
  catch(error) { return {result:null,error:(error as Error).message} }
})
const axisPreview=computed(()=>{try{return{result:shareChartYAxis(base,axisIds.value),error:''}}catch(error){return{result:null,error:error instanceof Error&&'issues'in error?'请选择 2–8 张可用原生图表':(error as Error).message}}})
const legendPreview=computed(()=>{try{if(legendAction.value==='update'){if(!legendEditRequest.value)throw new Error('请选择已有图例并完成源系列匹配');return{result:updateSharedLegend(base,legendEditRequest.value),error:''}}return{result:createSharedLegend(base,{containerIds:legendIds.value,parentId:parentId.value,placement:legendPlacement.value,fontFamily:legendFamily.value,fontSize:legendSize.value,columns:legendColumns.value,gap:legendGap.value}),error:''}}catch(error){return{result:null,error:error instanceof Error&&'issues'in error?(error.issues as {message:string}[]).slice(0,2).map(issue=>issue.message).join('；'):(error as Error).message}}})
const plotPreview=computed(()=>{try{return{result:alignChartPlots(base,{containerIds:plotIds.value,columns:plotColumns.value,reason:'对齐已有子图绘图区'}),error:''}}catch(error){return{result:null,error:error instanceof Error&&'issues'in error?'请选择 2–8 张原生图表，列数不超过图表数':(error as Error).message}}})
const barPreview=computed(()=>{try{if(barAction.value==='update'){if(!barEditRequest.value)throw new Error('请选择已有共享色标');return{result:updateSharedColorbar(base,barEditRequest.value),error:''}}return{result:createSharedColorbar(base,{containerIds:barIds.value,parentId:parentId.value,placement:barPlacement.value,fontFamily:barFamily.value,fontSize:barSize.value}),error:''}}catch(error){return{result:null,error:error instanceof Error&&'issues'in error?'请核对热图、范围、中心与字号；指定范围须同时填写递增的上下界':(error as Error).message}}})
const display=computed(()=>mode.value==='colorbar'?(beforeAxes.value?base:barPreview.value.result?.document??base):mode.value==='plots'?(beforeAxes.value?base:plotPreview.value.result?.document??base):mode.value==='legend'?(beforeAxes.value?base:legendPreview.value.result?.document??base):mode.value==='axes'?(beforeAxes.value?base:axisPreview.value.result?.document??base):preview.value.result?.document??base)
const errorMessage=computed(()=>mode.value==='colorbar'?barPreview.value.error:mode.value==='plots'?plotPreview.value.error:mode.value==='legend'?legendPreview.value.error:mode.value==='axes'?axisPreview.value.error:preview.value.error)
const routes = computed(() => routeFigure(display.value))
const blocked = computed(() => [...routes.value?.values() ?? []].filter(r => r.status === 'blocked').length)
const viewport = computed(() => {const c=base.containers.find(c => c.id === parentId.value)!;return{x:c.x-16,y:c.y-16,width:c.width+32,height:c.height+32}})
function move(index:number,delta:number) { const target=index+delta;if(target<0||target>=rows.value.length)return;[rows.value[index],rows.value[target]]=[rows.value[target]!,rows.value[index]!] }
function close() { editor.panelLayoutOpen.value=false }
function toggleAxis(id:string,checked:boolean){axisIds.value=checked?[...axisIds.value.filter(value=>value!==id),id]:axisIds.value.filter(value=>value!==id)}
function locateAxis(id:string){editor.connectMode.value=false;editor.connectionSource.value=null;editor.select(id);close()}
function toggleLegend(id:string,checked:boolean){legendIds.value=checked?[...legendIds.value,id]:legendIds.value.filter(value=>value!==id)}
function detachLegend(id:string){if(stale.value)return;try{const next=detachSharedLegend(base,id);if(editor.update(doc=>Object.assign(doc,next))){editor.notice.value='已恢复各图原图例，原共享图例保留为普通可编辑副本；可撤销';close()}}catch(error){editor.notice.value=(error as Error).message}}
function togglePlot(id:string,checked:boolean){plotIds.value=checked?[...plotIds.value,id]:plotIds.value.filter(value=>value!==id)}
function movePlot(id:string,delta:number){const index=plotIds.value.indexOf(id),target=index+delta;if(index<0||target<0||target>=plotIds.value.length)return;[plotIds.value[index],plotIds.value[target]]=[plotIds.value[target]!,plotIds.value[index]!]}
function toggleBar(id:string,checked:boolean){barIds.value=checked?[...barIds.value,id]:barIds.value.filter(value=>value!==id)}
function detachBar(id:string){if(stale.value)return;try{const next=detachSharedColorbar(base,id);if(editor.update(doc=>Object.assign(doc,next))){editor.notice.value='已恢复各图色标，统一范围和可编辑副本保留；可撤销';close()}}catch(error){editor.notice.value=(error as Error).message}}
function apply() { if(stale.value)return;if(mode.value==='colorbar'){if(barPreview.value.result?.report.changed&&editor.update(doc=>Object.assign(doc,barPreview.value.result!.document))){editor.notice.value=barAction.value==='update'?'已同步关联热图与原共享色标；原始值、ID 和连接保留，可撤销':'已统一热图数值范围并创建共享色标；原始值保留，可撤销';close()}return;}if(mode.value==='plots'){if(plotPreview.value.result?.report.changed&&editor.update(doc=>Object.assign(doc,plotPreview.value.result!.document))){editor.notice.value='已对齐绘图区，保留原数据、外框与字号；可撤销';close()}return;}if(mode.value==='legend'){if(legendPreview.value.result?.report.changed&&editor.update(doc=>Object.assign(doc,legendPreview.value.result!.document))){editor.notice.value=legendAction.value==='update'?(legendPreview.value.result.report.sourceSync?'已同步当前源系列；对应图例 ID、原数据与连接保留，可撤销':'已调整共享图例，原 ID、关联与源图表保留；可撤销'):'已创建共享图例，重复项保留在工程中；可撤销';close()}}else if(mode.value==='axes'){if(axisPreview.value.result?.report.changed&&editor.update(doc=>Object.assign(doc,axisPreview.value.result!.document))){editor.notice.value='已统一纵轴范围，原值与手工内容保留，可撤销';close()}}else if(preview.value.result && editor.applyPanels(parentId.value,items.value,options.value))close() }
</script>

<template>
  <Modal open label="多子图编排" class="panel-layout-dialog" @close="close">
    <Header><Box><Heading>多子图编排</Heading><Text class="muted-caption">编排图件、对齐绘图区、统一纵轴、共享图例与数值色标。</Text></Box><IconButton icon="close" label="关闭子图编排" @click="close" /></Header>
    <ModalBody>
    <Box class="panel-layout-grid">
      <Box class="panel-layout-preview">
        <Box v-if="mode!=='layout'" class="material-actions" role="group" aria-label="图件对照"><Button size="xs" :aria-pressed="beforeAxes" @click="beforeAxes=true">原图</Button><Button size="xs" :aria-pressed="!beforeAxes" @click="beforeAxes=false">{{ mode==='colorbar'?'共享色标':mode==='plots'?'对齐结果':mode==='legend'?'共享图例':'统一范围' }}</Button></Box>
        <FigureRenderer :figure="display" :viewport="viewport" :routes="routes" :show-document-title="false" />
        <Text v-if="mode==='layout'&&preview.result" class="placement-message">{{ items.length }} 张子图 · {{ preview.result.rows }} 行 × {{ preview.result.columns }} 列 · 统一比例 {{ (preview.result.factor*100).toFixed(1) }}%<Text v-if="preview.result.minimumLabelSize!==null"> · 最小主标签 / 注释字号 {{ preview.result.minimumLabelSize.toFixed(1) }}</Text></Text>
        <Text v-else class="placement-message">{{ mode==='colorbar'&&!beforeAxes&&barPreview.result?'共享色标预览':mode==='plots'&&!beforeAxes&&plotPreview.result?'绘图区对齐预览':mode==='legend'&&!beforeAxes&&legendPreview.result?'共享图例预览':mode==='axes'&&!beforeAxes&&axisPreview.result?'统一范围预览':'原图预览' }} · 尚未应用</Text>
        <Text v-if="mode==='layout'&&preview.result?.minimumLabelSize!==null && preview.result?.minimumLabelSize!==undefined && preview.result.minimumLabelSize<8" class="placement-message">缩小后有文字小于 8 个画布单位，请检查实际出版尺寸，或减少子图数量。内部小标签与定位字形仍需人工查看。</Text>
        <Text v-if="blocked" class="placement-message">{{ blocked }} 条语义连线受阻，请检查预览，应用后可修改端口。</Text>
        <Text class="muted-caption">标号是面板标题，可双击或用右侧属性修改。移动外层面板会带上图件；后续用“自动布局”重新排列。原始数据、手工注释、命名接口和来源继续保存在内部图件中。</Text>
      </Box>
      <Box class="panel-layout-controls">
        <Box class="material-actions" role="group" aria-label="子图工具模式"><Button size="xs" :aria-pressed="mode==='layout'" @click="mode='layout'">面板编排</Button><Button size="xs" :aria-pressed="mode==='axes'" @click="mode='axes'">统一纵轴</Button><Button size="xs" :aria-pressed="mode==='legend'" @click="mode='legend'">共享图例</Button><Button size="xs" :aria-pressed="mode==='plots'" @click="mode='plots'">绘图区对齐</Button><Button size="xs" :aria-pressed="mode==='colorbar'" @click="mode='colorbar'">共享色标</Button></Box>
        <Field><Text>共同外层容器</Text><Select :value="parentId" :options="scopes" aria-label="子图共同容器" @change="parentId=$event" /></Field>
        <template v-if="mode==='colorbar'"><Box class="material-actions" role="group" aria-label="共享色标操作"><Button size="xs" :aria-pressed="barAction==='create'" @click="barAction='create'">新建共享色标</Button><Button size="xs" :aria-pressed="barAction==='update'" @click="barAction='update'">调整已有色标</Button></Box><SharedColorbarEditControls v-if="barAction==='update'" :groups="barGroups.filter(group=>ancestors(base,group.containerId).includes(parentId))" @change="barEditRequest=$event" /><template v-else><SharedColorbarControls :targets="scopedBars(parentId)" :selected-ids="barIds" :groups="barGroups.filter(group=>ancestors(base,group.containerId).includes(parentId))" @toggle="toggleBar" @detach="detachBar" /><Field><Text>色标位置</Text><Select :value="barPlacement" :options="[{value:'bottom',label:'底部空白区'},{value:'top',label:'顶部空白区'}]" aria-label="共享色标位置" @change="barPlacement=$event as 'top'|'bottom'" /></Field><Field><Text>色标字体</Text><Select :value="barFamily" :options="fontOptions" aria-label="共享色标字体" @change="barFamily=$event as typeof barFamily" /></Field><Field><Text>色标字号</Text><TextField v-model.number="barSize" type="number" min="8" max="24" aria-label="共享色标字号" /></Field></template><SharedColorbarSummary v-if="barPreview.result" :reports="[barPreview.result.report]" /></template>
        <template v-if="mode==='plots'"><PlotAlignmentControls :targets="scopedPlots(parentId)" :selected-ids="plotIds" :columns="plotColumns" @toggle="togglePlot" @move="movePlot" @columns="plotColumns=$event" /><PlotAlignmentSummary v-if="plotPreview.result" :reports="[plotPreview.result.report]" /></template>
        <template v-if="mode==='legend'">
          <Box class="material-actions" role="group" aria-label="共享图例操作"><Button size="xs" :aria-pressed="legendAction==='create'" @click="legendAction='create'">新建共享图例</Button><Button size="xs" :aria-pressed="legendAction==='update'" @click="legendAction='update'">调整已有图例</Button></Box>
          <SharedLegendEditControls v-if="legendAction==='update'" :groups="legendGroups.filter(group=>ancestors(base,group.containerId).includes(parentId))" @change="legendEditRequest=$event" />
          <template v-else><SharedLegendControls :targets="scopedLegends(parentId)" :selected-ids="legendIds" :groups="legendGroups.filter(group=>ancestors(base,group.containerId).includes(parentId))" @toggle="toggleLegend" @detach="detachLegend" /><Field><Text>图例位置</Text><Select :value="legendPlacement" :options="[{value:'bottom',label:'底部空白区'},{value:'top',label:'顶部空白区'}]" aria-label="共享图例位置" @change="legendPlacement=$event as 'top'|'bottom'" /></Field><Field><Text>图例字体</Text><Select :value="legendFamily" :options="fontOptions" aria-label="共享图例字体" @change="legendFamily=$event as typeof legendFamily" /></Field><Field><Text>图例字号</Text><TextField v-model.number="legendSize" type="number" min="8" max="36" aria-label="共享图例字号" /></Field><Field><Text>条目列数</Text><Select :value="String(legendColumns)" :options="[{value:'0',label:'自动换行'},...[1,2,3,4].map(n=>({value:String(n),label:`${n} 列`}))]" aria-label="共享图例列数" @change="legendColumns=Number($event)" /></Field><Field><Text>条目间距</Text><TextField v-model.number="legendGap" type="number" min="0" max="120" aria-label="共享图例间距" /></Field></template>
          <SharedLegendSummary v-if="legendPreview.result" :reports="[legendPreview.result.report]" />
        </template>
        <SharedYAxisControls v-if="mode==='axes'" :targets="scopedAxes(parentId)" :selected-ids="axisIds" @toggle="toggleAxis" @locate="locateAxis" />
        <SharedYAxisSummary v-if="mode==='axes'&&axisPreview.result" :reports="[axisPreview.result.report]" />
        <template v-if="mode==='layout'">
        <Box class="panel-layout-options">
          <Field><Text>列数</Text><Select :value="String(options.columns)" :options="[1,2,3,4].map(n=>({value:String(n),label:String(n)}))" aria-label="子图网格列数" @change="options.columns=Number($event)" /></Field>
          <Field><Text>面板间距</Text><Select :value="String(options.gap)" :options="[16,24,32,48,64].map(n=>({value:String(n),label:String(n)}))" aria-label="子图面板间距" @change="options.gap=Number($event)" /></Field>
          <Field><Text>外侧留白</Text><Select :value="String(options.margin)" :options="[0,12,24,36,48].map(n=>({value:String(n),label:String(n)}))" aria-label="子图外侧留白" @change="options.margin=Number($event)" /></Field>
          <Field><Text>底部图例留白</Text><Select :value="String(options.bottomSpace??0)" :options="[0,40,64,80,100].map(n=>({value:String(n),label:String(n)}))" aria-label="底部图例留白" @change="options.bottomSpace=Number($event)" /></Field>
          <Field><Text>标号字号</Text><Select :value="String(options.fontSize)" :options="[12,14,16,18,20,24].map(n=>({value:String(n),label:String(n)}))" aria-label="子图标号字号" @change="options.fontSize=Number($event)" /></Field>
          <Field><Text>起始标号</Text><Select :value="String(options.start)" :options="Array.from({length:26},(_,i)=>({value:String(i+1),label:`(${String.fromCharCode(97+i)})`}))" aria-label="子图起始标号" @change="options.start=Number($event)" /></Field>
        </Box>
        <Field class="checkbox-field"><TextField v-model="options.shrinkToFit" type="checkbox" aria-label="统一等比缩小子图" /><Text>需要时统一等比缩小，保持图件之间的相对尺寸</Text></Field>
        <Box class="panel-layout-items" role="group" aria-label="子图顺序与说明">
          <Text class="muted-caption">先将每张图组合成容器，再选择同层图件；顺序按从左到右、从上到下。</Text>
          <Box v-for="(row,index) in rows" :key="row.containerId" class="panel-layout-item">
            <Field class="checkbox-field"><TextField v-model="row.enabled" type="checkbox" :aria-label="`编排子图 ${row.title}`" /><Text>{{ row.title }}</Text></Field>
            <Box><Button size="xs" :disabled="index===0" :aria-label="`上移子图 ${row.title}`" @click="move(index,-1)">上移</Button><Button size="xs" :disabled="index===rows.length-1" :aria-label="`下移子图 ${row.title}`" @click="move(index,1)">下移</Button></Box>
            <TextField v-model="row.caption" :disabled="!row.enabled" maxlength="70" :aria-label="`子图说明 ${row.title}`" placeholder="可选说明，与 (a) 一起显示" />
          </Box>
          <Text v-if="!rows.length" class="muted-caption">此层没有可编排的独立图件。已有面板可直接编辑标号，并使用“自动布局”排列。</Text>
        </Box>
        </template>
      </Box>
    </Box><Text v-if="stale" class="error-text" role="alert">画布已变化，请关闭后重新打开编排。</Text><Text v-else-if="errorMessage" class="error-text" role="alert">{{ errorMessage }}</Text>
    </ModalBody>
    <Footer><Text class="muted-caption">预览不修改画布，应用后可单步撤销</Text><Button @click="close">取消</Button><Button variant="primary" :disabled="stale || (mode==='colorbar'?!barPreview.result||!barPreview.result.report.changed:mode==='plots'?!plotPreview.result?.report.changed:mode==='legend'?!legendPreview.result?.report.changed:mode==='axes'?!axisPreview.result?.report.changed:!preview.result)" @click="apply">{{ mode==='colorbar'?(barAction==='update'?'应用色标同步':'应用共享色标'):mode==='plots'?'应用绘图区对齐':mode==='legend'?(legendAction==='update'?(legendPreview.result?.report.sourceSync?'应用图例同步':'应用图例调整'):'应用共享图例'):mode==='axes'?'应用统一纵轴':'应用子图编排' }}</Button></Footer>
  </Modal>
</template>
