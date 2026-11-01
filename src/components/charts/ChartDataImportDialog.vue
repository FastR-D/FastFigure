<script setup lang="ts">
import { computed,ref } from 'vue'
import { Box,Button,Disclosure,DisclosureTrigger,Field,Footer,Header,Heading,Modal,ModalBody,Select,Table,TableBody,TableCell,TableHead,TableHeader,TableRow,Text,TextArea,TextField } from '../ui'
import IconButton from '../ui/IconButton.vue'
import { useEditor } from '../../composables/useEditor'
import ChartPreparationPreview from './ChartPreparationPreview.vue'
import ChartKeyColumns from './ChartKeyColumns.vue'
import type { ChartPreparation } from '../../core/chartDatasetContract'
import { parseChartDataset,profileChartDataset,type ChartDataset } from '../../core/chartDataset'
const editor=useEditor(),previous=editor.assistantDataset.value
const quote=(cell:string)=>/[\t\n"]/.test(cell)?`"${cell.replaceAll('"','""')}"`:cell
const table=ref(previous?[previous.columns,...previous.rows].map(row=>row.map(quote).join('\t')).join('\n'):''),name=ref(previous?.name??'导入数据'),origin=ref<ChartDataset['origin']>(previous?.origin??'user'),errorLabel=ref(previous?.errorLabel??''),note=ref(previous?.note??''),dataSource=ref(previous?.dataSource??''),fileError=ref('')
const visualizationGoal=ref(previous?.visualizationGoal??'')
const preparation=ref<ChartPreparation|undefined>(previous?.preparation),rowColumns=ref(['c0']),groupColumns=ref(['c1']),valueColumn=ref('c2'),errorColumn=ref('none'),unbound=ref(false)
const sampleMeaning=ref(previous?.sampleMeaning??'unspecified')
const message=(error:unknown)=>error instanceof Error&&'issues' in error?(error.issues as {message:string}[]).slice(0,3).map(issue=>issue.message).join('；'):error instanceof Error?error.message:'数据格式无效'
const state=computed(()=>{try{const data=parseChartDataset(table.value,{name:name.value,origin:origin.value,...(visualizationGoal.value.trim()?{visualizationGoal:visualizationGoal.value}:{}),...(preparation.value?{preparation:preparation.value}:{}),...(sampleMeaning.value==='raw-observations'||sampleMeaning.value==='summaries'?{sampleMeaning:sampleMeaning.value}:{}),errorLabel:errorLabel.value,note:note.value,dataSource:dataSource.value});return{data,profile:profileChartDataset(data),error:''}}catch(error){return{data:null,profile:null,error:message(error)}}})
const columnOptions=computed(()=>state.value.data?.columns.map((label,i)=>({value:`c${i}`,label}))??[])
const manualPreparation=computed(()=>{if(!state.value.data||state.value.data.preparation)return null;const source={...state.value.data};delete source.preparation;return{source,operation:{kind:'pivot' as const,rowColumns:rowColumns.value,groupColumns:groupColumns.value,valueColumn:valueColumn.value,...(errorColumn.value==='none'?{}:{errorColumn:errorColumn.value})}}})
function unlink(){preparation.value=undefined;unbound.value=true}
function adopted(){editor.chartDataImportOpen.value=false;editor.openAssistant()}
function restore(){const source=preparation.value?.source;if(!source)return;table.value=[source.columns,...source.rows].map(row=>row.map(quote).join('\t')).join('\n');name.value=source.name;visualizationGoal.value=source.visualizationGoal??'';origin.value=source.origin;sampleMeaning.value=source.sampleMeaning??'unspecified';errorLabel.value=source.errorLabel;note.value=source.note;dataSource.value=source.dataSource;preparation.value=undefined;unbound.value=false}
const labels={number:'数值',category:'文本 / 分类',mixed:'混合值，需核对',empty:'全空'}
function changeTable(value:unknown){table.value=String(value);origin.value='user';sampleMeaning.value='unspecified'}
async function file(event:Event){const input=event.target as HTMLInputElement,selected=input.files?.[0];if(!selected)return;try{if(selected.size>60_000)throw new Error('数据文件最多 60 KB');changeTable(await selected.text());sampleMeaning.value='unspecified';name.value=selected.name.slice(0,80);if(!dataSource.value)dataSource.value=`用户导入文件：${selected.name}`;fileError.value=''}catch(error){fileError.value=message(error)}finally{input.value=''}}
function attach(){if(!state.value.data)return;editor.assistantDataset.value=state.value.data;editor.chartDataImportOpen.value=false;editor.openAssistant();editor.notice.value='数据已附到左侧助手，请填写绘图目标后发送'}
</script>
<template>
  <Modal :open="true" size="xl" label="导入数据与选图" class="chart-data-import-dialog" @close="editor.chartDataImportOpen.value=false">
    <Header><Box><Heading>导入数据，让助手选择图表</Heading><Text class="muted-caption">保留原始表；结合研究问题与可选参考图，分析形式、字段和视觉样式。</Text></Box><IconButton icon="close" label="关闭数据导入" @click="editor.chartDataImportOpen.value=false" /></Header>
    <ModalBody>
<Box class="chart-data-import-grid">
<Box class="data-chart-fields">
      <Field><Text>数据名称</Text><TextField v-model="name" maxlength="80" aria-label="选图数据名称" /></Field>
      <Field><Text>图要回答什么问题？</Text><TextArea v-model="visualizationGoal" rows="3" maxlength="2000" aria-label="选图表达目标" placeholder="例如：比较各模型在准确率与推理延迟之间的取舍，标明模型名称。无需先选图型。" /></Field><Text class="muted-caption">可说明多个互补问题，例如“展示延迟与准确率关系，并比较内存用量”；助手可选单图或多视图。请提供对象与单位，必要时会先提问。</Text>
      <Field><Text>CSV / TSV 数据（首行为列名）</Text><TextArea :model-value="table" :readonly="!!preparation" rows="12" maxlength="20000" spellcheck="false" aria-label="选图原始数据" placeholder="Model,Latency (ms),Accuracy (%)&#10;A,12,76&#10;B,25,83" @update:model-value="changeTable" /></Field>
      <Field><Text>导入 CSV / TSV 文件</Text><TextField :disabled="!!preparation" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" aria-label="导入选图数据文件" @change="file" /></Field>
      <Box v-if="preparation"><ChartPreparationPreview :preparation="preparation" read-only /><Box class="material-actions"><Button size="xs" @click="restore">还原原始附件</Button><Button size="xs" @click="unlink">解除附件原表绑定</Button></Box><Text class="muted-caption">整理后的表格保持来源绑定；数值含义等使用者声明仍可填写。</Text></Box><Text v-if="unbound" class="placement-message">已解除原表绑定，后续按手工数据保存。</Text>
      <Text class="muted-caption">原始附件最多 480 行、12 列（直接绘图仍受各图型行数限制）。空值留白；百分号、单位、缺失标记和不同量纲请先明确，程序不自动换算、聚合或补值；可预览确认不聚合的复合键长表展开，按原行配对已给定的误差半宽。</Text>
      <Box class="data-chart-two-fields"><Field><Text>数据标记</Text><Select :value="origin" aria-label="选图数据标记" :options="[{value:'user',label:'用户填写的数据'},{value:'example',label:'示例 / 示意数据'}]" @change="origin=$event as ChartDataset['origin']" /></Field><Field><Text>误差含义（如已提供）</Text><TextField v-model="errorLabel" maxlength="80" aria-label="选图误差含义" placeholder="例如 Mean ± SE" /></Field></Box>
      <Field><Text>数值含义（分布图需要明确）</Text><Select :value="sampleMeaning" aria-label="选图数值含义" :options="[{value:'unspecified',label:'尚未确认'},{value:'raw-observations',label:'逐次原始观测'},{value:'summaries',label:'已汇总的均值 / 统计量'}]" @change="sampleMeaning=$event" /></Field><Text class="muted-caption">箱线图需要原始样本；不会从均值、误差棒或图片还原样本分布。该选项记录使用者声明。</Text>
      <Disclosure v-if="manualPreparation"><DisclosureTrigger size="xs">手动设置长表展开</DisclosureTrigger><Box class="data-chart-fields"><ChartKeyColumns v-model="rowColumns" :options="columnOptions" label="行标识键" /><ChartKeyColumns v-model="groupColumns" :options="columnOptions" label="组别键" /><Field><Text>数值列</Text><Select :value="valueColumn" :options="columnOptions" aria-label="长表数值列" @change="valueColumn=$event" /></Field><Field><Text>配对误差半宽列（需填写误差含义）</Text><Select :value="errorColumn" :options="[{value:'none',label:'不含误差列'},...columnOptions]" aria-label="长表误差半宽列" @change="errorColumn=$event" /></Field><ChartPreparationPreview :preparation="manualPreparation" replace-attachment @adopt="adopted" /></Box></Disclosure>
      <Field><Text>数据来源</Text><TextArea v-model="dataSource" rows="2" maxlength="500" aria-label="选图数据来源" /></Field><Field><Text>图下注释</Text><TextField v-model="note" maxlength="100" aria-label="选图数据注释" /></Field>
      <Text v-if="fileError" role="alert" class="error-text">{{ fileError }}</Text><Text v-if="table.trim()&&state.error" role="alert" class="error-text">{{ state.error }}</Text>
    </Box><Box class="chart-data-profile"><Heading>导入检查</Heading><template v-if="state.profile&&state.data"><Text>{{ state.profile.rows }} 行 × {{ state.profile.columns }} 列 · {{ origin==='example'?'示例数据':'用户填写' }}</Text><Box class="chart-data-table-scroll"><Table aria-label="导入数据列概况"><TableHead><TableRow><TableHeader>列名</TableHeader><TableHeader>类型</TableHeader><TableHeader>缺失</TableHeader><TableHeader>不同值</TableHeader></TableRow></TableHead><TableBody><TableRow v-for="field in state.profile.fields" :key="field.id"><TableCell>{{ field.name }}</TableCell><TableCell>{{ labels[field.type] }}</TableCell><TableCell>{{ field.missing }}</TableCell><TableCell>{{ field.distinct }}</TableCell></TableRow></TableBody></Table></Box><Text class="section-eyebrow">前 5 行预览</Text><Box class="chart-data-table-scroll"><Table aria-label="选图数据预览"><TableHead><TableRow><TableHeader v-for="column in state.data.columns" :key="column">{{ column }}</TableHeader></TableRow></TableHead><TableBody><TableRow v-for="(row,index) in state.data.rows.slice(0,5)" :key="index"><TableCell v-for="(cell,i) in row" :key="i">{{ cell||'（空）' }}</TableCell></TableRow></TableBody></Table></Box></template><Text v-else class="panel-description">粘贴或导入数据后，查看列类型与缺失情况，再附给助手。</Text><Text class="placement-message">助手会说明推荐理由、字段映射、未绘制的列与备选方案。可编译折线、分组柱状、散点、同量纲矩阵热图及明确声明为原始观测的箱线图；需要汇总、其他图型或含义不明时先返回待确认问题。候选应用后替换当前图件，可单步撤销。</Text><Text class="muted-caption">参考图从工作台“参考图”Tab 导入，在助手中勾选附带；只用其构图与样式，不把图片中的数值当作本次输入。</Text></Box>
</Box>
</ModalBody>
    <Footer><Button @click="editor.chartDataImportOpen.value=false">取消</Button><Button variant="primary" :disabled="!state.data" @click="attach">附到左侧助手</Button></Footer>
  </Modal>
</template>
