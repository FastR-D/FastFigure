<script setup lang="ts">
import { computed,ref } from 'vue'
import { Box,Button,Field,Footer,Header,Heading,Modal,ModalBody,Select,Text,TextArea,TextField } from '../ui'
import IconButton from '../ui/IconButton.vue'
import AssetPreview from '../library/AssetPreview.vue'
import FigureRenderer from '../figure/FigureRenderer'
import { useEditor } from '../../composables/useEditor'
import { clone } from '../../core/model'
import { captureComponent,instantiateComponent,scaleComponent } from '../../core/assets'
import { buildDataChart,replaceDataChart } from '../../core/dataChart'
import { chartExample,chartScaleExample,chartTableText,parseChartTable } from '../../core/dataChartTable'
import { dataChartSpecSchema,type DataChartSpec } from '../../core/dataChartSchema'
import { colorPalettes,fontOptions } from '../../data/materials'
import {checkPublication} from '../../core/publication'
import { heatmapPalettes,heatmapPaletteById } from '../../data/heatmapPalettes'
import { boxplotRules } from '../../core/boxplotContract'
import { boxplotReport } from '../../core/boxplotStats'
import { chartAxesReport } from '../../core/chartAxes'
import ChartPreparationPreview from './ChartPreparationPreview.vue'
import ChartAxesSummary from './ChartAxesSummary.vue'
import BoxplotSummary from './BoxplotSummary.vue'

const editor=useEditor(),context=editor.chartDialog.value!,container=editor.figure.value.containers.find(c=>c.id===context.containerId),baseline=JSON.stringify(editor.figure.value)
const form=ref<DataChartSpec>(clone(container?.dataChart?.spec??{...chartExample(context.kind??'line'),...(editor.activeStyle.value.fontFamily?{fontFamily:editor.activeStyle.value.fontFamily}:{})})),table=ref(chartTableText(form.value)),percent=ref(100),error=ref(''),yMin=ref<string|number>(form.value.yMin?.toString()??''),yMax=ref<string|number>(form.value.yMax?.toString()??'')
const heatmap=computed(()=>form.value.kind==='heatmap'),colorMin=ref<string|number>(form.value.colorMin?.toString()??''),colorMax=ref<string|number>(form.value.colorMax?.toString()??''),colorCenter=ref<string|number>(form.value.colorCenter?.toString()??'')
const xMin=ref<string|number>(form.value.xMin?.toString()??''),xMax=ref<string|number>(form.value.xMax?.toString()??''),scaleOptions=[{value:'linear',label:'线性'},{value:'log10',label:'log10 对数'}]
const boxplot=computed(()=>form.value.kind==='boxplot'),rawConfirmed=ref(form.value.boxplot?.sampleMeaning==='raw-observations')
const stale=computed(()=>!!context.containerId&&JSON.stringify(editor.figure.value)!==baseline)
const palettes=computed(()=>heatmap.value?heatmapPalettes.map(p=>({value:p.id,label:p.title})):colorPalettes.filter(p=>p.source==='FigureForge'||p.id===form.value.paletteId).map(p=>({value:p.id,label:p.title})))
const kinds=computed(()=>boxplot.value?[{value:'boxplot',label:'原始样本箱线图'}]:heatmap.value?[{value:'heatmap',label:'矩阵热图'}]:[{value:'line',label:'多系列折线'},{value:'bar',label:'分组柱状'},{value:'scatter',label:'数值散点'}])
const unbound=ref(false)
function unbind(){form.value.dataPreparation=undefined;unbound.value=true}
const numberOption=(value:string|number)=>String(value).trim()?Number(value):undefined
function message(e:unknown){return e instanceof Error&&'issues' in e?(e.issues as {message:string}[]).slice(0,3).map(i=>i.message).join('；'):e instanceof Error?e.message:'图表数据无效'}
const state=computed(()=>{
  try{
    if(boxplot.value&&!rawConfirmed.value)throw new Error('请确认这些列是逐次原始观测，不能将均值、误差或分位数当作样本')
    const spec=dataChartSpecSchema.parse({...form.value,...parseChartTable(table.value,form.value.xMode,form.value.kind),...(boxplot.value?{boxplot:boxplotRules}:{}),xScale:heatmap.value?undefined:form.value.xScale,yScale:heatmap.value?undefined:form.value.yScale,xMin:form.value.xMode==='numeric'?numberOption(xMin.value):undefined,xMax:form.value.xMode==='numeric'?numberOption(xMax.value):undefined,yMin:heatmap.value?undefined:numberOption(yMin.value),yMax:heatmap.value?undefined:numberOption(yMax.value),colorMin:heatmap.value?numberOption(colorMin.value):undefined,colorMax:heatmap.value?numberOption(colorMax.value):undefined,colorCenter:heatmap.value?numberOption(colorCenter.value):undefined,valueLabel:heatmap.value?form.value.valueLabel:undefined}),asset=scaleComponent(buildDataChart(spec),context.containerId?1:Number(percent.value)/100)
    const replacement=context.containerId&&!stale.value?replaceDataChart(editor.figure.value,context.containerId,spec):undefined
    return{asset,spec,replacement,axes:chartAxesReport(spec),boxplot:boxplot.value?boxplotReport(spec):undefined,error:''}
  }catch(e){return{asset:null,spec:null,replacement:undefined,axes:undefined,boxplot:undefined,error:message(e)}}
})
const previewRoot=computed(()=>state.value.replacement?.document.containers.find(c=>c.id===context.containerId)),insertionProblem=computed(()=>{if(!state.value.asset)return '';try{instantiateComponent(editor.figure.value,state.value.asset,editor.currentContainer.value.id);return ''}catch(e){return message(e)}})
const publication=computed(()=>state.value.asset&&editor.figure.value.publication?checkPublication(scaleComponent(state.value.asset,context.containerId?container?.metricScale??1:1).figure,editor.figure.value.publication):null)
function close(){editor.chartDialog.value=null}
function changeKind(value:string){form.value.kind=value as DataChartSpec['kind'];if(value==='bar'){form.value.xMode='category';form.value.xScale='linear';form.value.yScale='linear';xMin.value='';xMax.value='';yMin.value='';yMax.value=''};if(value==='scatter')form.value.xMode='numeric'}
function changeTable(value:unknown){if(boxplot.value&&form.value.origin==='example')rawConfirmed.value=false;table.value=String(value);form.value.origin='user'}
function changeXMode(value:string){form.value.xMode=value as DataChartSpec['xMode'];if(value==='category'){form.value.xScale='linear';xMin.value='';xMax.value=''}}
function loadExample(next:DataChartSpec){next={...next,fontFamily:form.value.fontFamily,fontSize:form.value.fontSize};form.value=next;table.value=chartTableText(next);rawConfirmed.value=next.boxplot?.sampleMeaning==='raw-observations';xMin.value='';xMax.value='';yMin.value='';yMax.value='';colorMin.value='';colorMax.value='';colorCenter.value='';error.value=''}
function example(){loadExample(chartExample(form.value.kind))}
function scaleExample(){if(form.value.kind==='line'||form.value.kind==='scatter')loadExample(chartScaleExample(form.value.kind))}
function changePalette(value:string){form.value.paletteId=value;if(heatmapPaletteById.get(value)?.mode==='sequential')colorCenter.value=''}
async function file(event:Event){const input=event.target as HTMLInputElement,f=input.files?.[0];if(!f)return;try{if(f.size>60_000)throw new Error('数据文件最多 60 KB');changeTable(await f.text());if(boxplot.value)rawConfirmed.value=false;if(!form.value.dataSource)form.value.dataSource=`用户导入文件：${f.name}`;error.value=''}catch(e){error.value=message(e)}finally{input.value=''}}
function configured(){const result=state.value.replacement,asset=context.containerId&&result?captureComponent(result.document,context.containerId,form.value.title,state.value.asset!.description,state.value.asset!.tags):clone(state.value.asset!);asset.id=`asset-${crypto.randomUUID()}`;asset.createdAt=new Date().toISOString();asset.updatedAt=asset.createdAt;return asset}
function save(toAssistant=false){try{if(!state.value.asset||context.containerId&&!state.value.replacement)return;const asset=editor.library.save(configured());editor.libraryTab.value='mine';editor.activePanel.value='components';editor.notice.value=`已保存图表「${asset.name}」`;close();if(toAssistant){editor.assistantAssetId.value=asset.id;editor.useMaterialPrompt(`复用刚保存的图表「${asset.name}」。保持其输入数据、缺失值、误差说明与示例标记，仅根据我的后续要求调整图件。`)}}catch(e){error.value=message(e)}}
function insert(newCanvas:boolean){if(state.value.asset&&editor.insertComponent(state.value.asset,true,newCanvas))close();else error.value=editor.notice.value}
function apply(){if(stale.value){error.value='工程已变化，请关闭后重新编辑数据';return}const result=state.value.replacement;if(!result)return;if(editor.update(doc=>Object.assign(doc,result.document))){editor.selectedId.value=context.containerId!;editor.notice.value=`已重绘 ${result.generated} 个图元，保留 ${result.preserved} 个额外对象，可撤销`;close()}else error.value=editor.notice.value}
</script>

<template>
  <Modal :open="true" size="xl" label="实验图表数据" class="data-chart-dialog" @close="close">
    <Header><Box><Heading>{{ context.containerId?'编辑图表数据':'从实验数据绘图' }}</Heading><Text class="muted-caption">坐标轴、图例、点线与误差棒均为可编辑矢量图元。</Text></Box><IconButton icon="close" label="关闭图表编辑" @click="close" /></Header>
    <ModalBody>
      <Box class="data-chart-dialog-grid">
      <Box class="data-chart-preview"><Text class="section-eyebrow">{{ form.origin==='example'?'示例数据':'自填数据' }} · {{ state.asset?.figure.nodes.length??0 }} 个生成图元</Text><FigureRenderer v-if="state.replacement&&previewRoot" :figure="state.replacement.document" :viewport="previewRoot" :show-document-title="false" /><AssetPreview v-else-if="state.asset" :asset="state.asset" /><Text v-else class="panel-description">数据有效后显示预览。</Text><Text v-if="state.error" role="alert" class="error-text">{{ state.error }}</Text><Text v-if="context.containerId" class="placement-message">更新会重新绘制生成的轴、系列和文字，覆盖这些图元上的手动调整；额外添加的注释保留。预览包含保留对象，可撤销整个更新。</Text><Text v-if="state.replacement" class="muted-caption">重绘 {{ state.replacement.generated }} 个图元 · 保留 {{ state.replacement.preserved }} 个额外对象</Text><Text v-if="insertionProblem&&!context.containerId" class="placement-message">{{ insertionProblem }}</Text><ChartAxesSummary v-if="state.axes" :axes="state.axes" /><BoxplotSummary v-if="state.boxplot" :report="state.boxplot" /></Box>
      <Box class="data-chart-fields">
        <Box v-if="form.plotArea" class="material-actions"><Text class="muted-caption">此图已固定绘图区；改字号或标签后若放不下，可恢复自动布局再重新对齐。</Text><Button size="xs" @click="delete form.plotArea">恢复自动绘图区</Button></Box>
        <Box class="data-chart-two-fields"><Field><Text>图表字体</Text><Select :value="form.fontFamily??'Inter'" :options="fontOptions" aria-label="图表字体" @change="form.fontFamily=$event as DataChartSpec['fontFamily']" /></Field><Field><Text>基准字号</Text><TextField :model-value="form.fontSize??10" @update:model-value="form.fontSize=Number($event)" type="number" min="8" max="36" step="1" aria-label="图表基准字号" /></Field></Box>
        <Text class="muted-caption">统一调整生成文字；标题、轴标题和系列标签按比例排版，另加的手工注释保持。字号为画布基准，实例缩放和最终论文宽度会影响实际大小。</Text>
        <Text v-if="publication" class="muted-caption">按当前论文整图宽 {{ publication.widthMm }} mm，这个图表的生成文字最小等效字号 {{ publication.minFontPt===null?'—':Number(publication.minFontPt.toFixed(2)) }} pt。</Text>
        <Box class="data-chart-two-fields"><Field><Text>图表类型</Text><Select :value="form.kind" :disabled="heatmap||boxplot" aria-label="数据图表类型" :options="kinds" @change="changeKind" /></Field><Field><Text>{{ boxplot?'样本标识类型':heatmap?'行标签类型':'横轴类型' }}</Text><Select :value="form.xMode" :disabled="form.kind!=='line'" aria-label="图表横轴类型" :options="[{value:'numeric',label:'按真实数值间距'},{value:'category',label:'等距分类'}]" @change="changeXMode" /></Field></Box>
        <Field><Text>标题</Text><TextField v-model="form.title" maxlength="80" aria-label="图表标题" /></Field>
        <Box class="data-chart-two-fields"><Field><Text>横轴标题</Text><TextField v-model="form.xLabel" maxlength="40" aria-label="图表横轴标题" /></Field><Field><Text>纵轴标题</Text><TextField v-model="form.yLabel" maxlength="40" aria-label="图表纵轴标题" /></Field></Box>
        <Box v-if="form.dataPreparation"><ChartPreparationPreview :preparation="form.dataPreparation.preparation" read-only /><Button size="xs" @click="unbind">解除原表绑定以编辑数据</Button><Text class="muted-caption">当前数值绑定到已确认的原始长表；标题、坐标和样式仍可调整。</Text></Box><Text v-if="unbound" class="placement-message">已解除原表绑定。更新后按手工数据保存，原始长表仍可在助手历史回看。</Text><Field><Text>CSV / TSV 数据</Text><TextArea :model-value="table" :readonly="!!form.dataPreparation" rows="7" maxlength="20000" spellcheck="false" aria-label="实验图表数据表" @update:model-value="changeTable" /></Field><Text v-if="heatmap" class="muted-caption">首列为行标签，后列为同量纲矩阵值；最多 12 行 × 12 列。保留行列顺序，空格显示缺失，零仍为零；不归一化、聚类或推断误差。</Text><Text v-else-if="boxplot" class="muted-caption">首列为唯一的样本 / Run 标识，每个后续列是一组同量纲原始观测。最多 80 行、6 组；空值不补零，统计只使用非空样本，并保留离群点。</Text><Text v-else class="muted-caption">首列为横轴，后列为系列；可添加 Series_err 误差列和 _label 数据行标注列。空数值留白，折线在缺失处断开。数值折线按 X 排序，不自动平均重复行。</Text>
        <Box class="material-actions"><Field class="data-chart-import"><Text>导入 CSV / TSV</Text><TextField :disabled="!!form.dataPreparation" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" aria-label="导入图表数据文件" @change="file" /></Field><Button size="xs" variant="quiet" @click="example">载入当前类型示例</Button><Button v-if="form.kind==='line'||form.kind==='scatter'" size="xs" variant="quiet" @click="scaleExample">载入数量级示例</Button></Box>
        <Field v-if="!heatmap&&!boxplot"><Text>误差棒含义</Text><TextField v-model="form.errorLabel" maxlength="80" aria-label="误差棒含义" placeholder="例如 Mean ± SD，或 95% CI 半宽" /></Field>
        <Box v-if="!heatmap" class="chart-axis-settings"><Box class="data-chart-two-fields"><Field v-if="form.xMode==='numeric'"><Text>横轴刻度</Text><Select :value="form.xScale??'linear'" :options="scaleOptions" aria-label="图表横轴刻度" @change="form.xScale=$event as DataChartSpec['xScale']" /></Field><Field><Text>纵轴刻度</Text><Select :value="form.yScale??'linear'" :disabled="form.kind==='bar'" :options="scaleOptions" aria-label="图表纵轴刻度" @change="form.yScale=$event as DataChartSpec['yScale']" /></Field></Box><Text class="muted-caption">{{ form.kind==='bar'?'柱状图使用零基线；切换为柱状时恢复线性坐标与自动范围。':'log10 适合跨数量级与倍数比较；原值及误差端点必须大于 0，不删点、不加偏移量。' }}</Text><Box v-if="form.xMode==='numeric'" class="data-chart-two-fields"><Field><Text>横轴最小值（留空自动）</Text><TextField v-model="xMin" type="number" step="any" aria-label="图表横轴最小值" /></Field><Field><Text>横轴最大值（留空自动）</Text><TextField v-model="xMax" type="number" step="any" aria-label="图表横轴最大值" /></Field></Box></Box>
        <Box v-if="!heatmap" class="data-chart-two-fields"><Field><Text>纵轴最小值（留空自动）</Text><TextField v-model="yMin" type="number" step="any" aria-label="图表纵轴最小值" /></Field><Field><Text>纵轴最大值（留空自动）</Text><TextField v-model="yMax" type="number" step="any" aria-label="图表纵轴最大值" /></Field></Box>
        <template v-else><Field><Text>色标标题 / 单位</Text><TextField v-model="form.valueLabel" maxlength="40" aria-label="热图色标标题" /></Field><Box class="data-chart-two-fields"><Field><Text>色标最小值（留空自动）</Text><TextField v-model="colorMin" type="number" step="any" aria-label="热图色标最小值" /></Field><Field><Text>色标最大值（留空自动）</Text><TextField v-model="colorMax" type="number" step="any" aria-label="热图色标最大值" /></Field></Box><Field v-if="heatmapPaletteById.get(form.paletteId)?.mode==='diverging'"><Text>发散中心（留空为 0）</Text><TextField v-model="colorCenter" type="number" step="any" aria-label="热图色标中心" /></Field></template>
        <Box v-if="boxplot" class="boxplot-settings"><Field class="checkbox-field"><TextField v-model="rawConfirmed" type="checkbox" aria-label="确认箱线图原始观测" /><Text>这些列是逐次原始观测，未使用均值或分位数代替</Text></Field><Text class="muted-caption">固定采用 type 7 线性插值四分位数，须线取 1.5×IQR 范围内最远观测；不做置信区间或显著性检验。</Text><Field class="checkbox-field"><TextField v-model="form.showSamples" type="checkbox" aria-label="显示全部原始样本点" /><Text>叠加全部原始点（关闭后仍显示全部离群点）</Text></Field></Box><Box class="data-chart-two-fields"><Field class="checkbox-field"><TextField v-model="form.grid" type="checkbox" aria-label="图表辅助网格" /><Text>{{ heatmap?'单元格分隔':'辅助网格' }}</Text></Field><Field class="checkbox-field"><TextField v-model="form.showValues" type="checkbox" aria-label="图表数值标签" /><Text>{{ form.kind==='line'?'末点数值':form.kind==='scatter'?'各点数值':heatmap?'单元格数值':boxplot?'中位数标签':'柱形数值' }}</Text></Field></Box>
        <Field><Text>{{ heatmap?'数值色阶':'配色' }}</Text><Select :value="form.paletteId" :options="palettes" aria-label="图表配色" @change="changePalette" /></Field><Text class="muted-caption">{{ heatmap?'色阶与原始数值绑定，画板分类配色不会改变热图色值。':'也可插入后从左侧配色 Tab 换色，系列和图例同步。' }}</Text>
        <Field><Text>图下注释</Text><TextField v-model="form.note" maxlength="100" aria-label="图表注释" /></Field><Field><Text>数据来源（可选，随组件保存）</Text><TextArea v-model="form.dataSource" rows="2" maxlength="500" aria-label="实验数据来源" /></Field>
        <Field><Text>数据标记</Text><Select :value="form.origin" :options="[{value:'example',label:'示例 / 示意数据'},{value:'user',label:'用户填写的数据'}]" aria-label="图表数据标记" @change="form.origin=$event as DataChartSpec['origin']" /></Field>
        <Field v-if="!context.containerId"><Text>插入缩放 %</Text><TextField v-model.number="percent" type="number" min="10" max="125" step="5" aria-label="数据图表插入缩放" /></Field>
      </Box>
      </Box><Text v-if="stale" role="alert" class="error-text">工程已变化，请关闭后重新编辑数据。</Text><Text v-if="error" role="alert" class="error-text">{{ error }}</Text>
    </ModalBody>
    <Footer><Button :disabled="!state.asset||!!context.containerId&&!state.replacement" @click="save()">存为我的组件</Button><Button :disabled="!state.asset||!!context.containerId&&!state.replacement" @click="save(true)">存为组件并交给助手</Button><Box class="header-spacer" /><template v-if="context.containerId"><Button @click="close">取消</Button><Button variant="primary" :disabled="!state.replacement||stale" @click="apply">更新图表</Button></template><template v-else><Button :disabled="!state.asset||!!insertionProblem" @click="insert(false)">插入当前容器</Button><Button variant="primary" :disabled="!state.asset" @click="insert(true)">新建图件</Button></template></Footer>
  </Modal>
</template>
