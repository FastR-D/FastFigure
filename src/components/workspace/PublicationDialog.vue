<script setup lang="ts">
import {outputFrame,outputFrameSchema} from '../../core/outputFrame'
import {computed,ref} from 'vue'
import {Box,Button,Field,Footer,Header,Heading,Link,Modal,ModalBody,Select,Text,TextField} from '../ui'
import IconButton from '../ui/IconButton.vue'
import FigureRenderer from '../figure/FigureRenderer'
import PublicationReport from '../figure/PublicationReport.vue'
import {useEditor} from '../../composables/useEditor'
import {checkPublication,publicationReportPacket} from '../../core/publication'
import {defaultPublicationSettings,publicationSettingsSchema,publicationSizeReferences,publicationSizeSource,publicationTypeSource} from '../../core/publicationContract'
import {downloadFile} from '../../core/export'
const editor=useEditor(),initial=editor.figure.value.publication??defaultPublicationSettings
const widthMm=ref(initial.widthMm),minFontPt=ref(initial.minFontPt),minStrokePt=ref(initial.minStrokePt),showTitle=ref(initial.showTitle),zoom=ref(100),error=ref(''),exporting=ref(false)
const customWidth=ref(false),cropped=ref(!!editor.figure.value.canvas.frame),frame=ref({...outputFrame(editor.figure.value)})
const cropValid=computed(()=>!cropped.value||outputFrameSchema.safeParse(frame.value).success)
function fitContent(){const nodes=editor.figure.value.nodes.filter(n=>n.kind!=='port');if(!nodes.length)return;const x=Math.max(0,Math.min(...nodes.map(n=>n.x))-12),y=Math.max(0,Math.min(...nodes.map(n=>n.y))-12);frame.value={x,y,width:Math.min(1000-x,Math.max(...nodes.map(n=>n.x+n.width))+12-x),height:Math.min(620-y,Math.max(...nodes.map(n=>n.y+n.height))+12-y)};cropped.value=true}
const parsed=computed(()=>publicationSettingsSchema.safeParse({version:1,widthMm:widthMm.value,minFontPt:minFontPt.value,minStrokePt:minStrokePt.value,showTitle:showTitle.value}))
const settings=computed(()=>parsed.value.success?parsed.value.data:null)
const figure=computed(()=>({...editor.figure.value,canvas:{...editor.figure.value.canvas,frame:cropped.value&&cropValid.value?frame.value:undefined},...(settings.value?{publication:settings.value}:{})}))
const report=computed(()=>settings.value&&cropValid.value?checkPublication(figure.value,settings.value):null)
const paperStyle=computed(()=>{const width=(settings.value?.widthMm??initial.widthMm)*96/25.4*zoom.value/100;return{width:`${width}px`,height:`${width*outputFrame(figure.value).height/outputFrame(figure.value).width}px`}})
const preset=computed(()=>!customWidth.value&&publicationSizeReferences.some(item=>item.widthMm===widthMm.value)?String(widthMm.value):'custom')
function choosePreset(value:string){customWidth.value=value==='custom';if(!customWidth.value)widthMm.value=Number(value)}
function close(){editor.publicationOpen.value=false}
function apply(){if(settings.value&&cropValid.value&&editor.update(doc=>{doc.publication=settings.value!;if(cropped.value)doc.canvas.frame=outputFrameSchema.parse(frame.value);else delete doc.canvas.frame}))close()}
function clear(){if(editor.setPublication())close()}
function locate(id:string){editor.connectMode.value=false;editor.connectionSource.value=null;editor.select(id);close()}
async function exportReport(){
  if(!settings.value||exporting.value)return
  error.value='';exporting.value=true
  try{const packet=await publicationReportPacket(figure.value,settings.value);downloadFile('publication-check.json',JSON.stringify(packet,null,2),'application/json')}
  catch(cause){error.value=cause instanceof Error?cause.message:'报告导出失败'}finally{exporting.value=false}
}
</script>
<template>
  <Modal open label="论文尺寸与可读性" class="publication-dialog" @close="close">
    <Header><Box><Heading>论文尺寸与可读性</Heading><Text class="muted-caption">按整图放入论文后的宽度检查，应用后同步 SVG 输出尺寸。</Text></Box><IconButton icon="close" label="关闭论文尺寸" @click="close" /></Header>
    <ModalBody>
      <Box class="publication-grid">
        <Box class="publication-preview">
          <Box class="publication-preview-toolbar"><Text>{{ settings?.widthMm??'—' }} mm 整图预览</Text><Select :value="String(zoom)" :options="[{value:'100',label:'100%'},{value:'200',label:'200%'}]" aria-label="论文预览缩放" size="sm" @change="zoom=Number($event)" /></Box>
          <Box class="publication-preview-viewport"><Box class="publication-paper" :style="paperStyle" data-testid="publication-preview"><FigureRenderer :figure="figure" /></Box></Box>
          <Text class="muted-caption">屏幕预览按 CSS 96dpi 换算，100% 不代表显示器实测物理尺寸。200% 只放大查看，不改变输出。</Text>
        </Box>
        <Box class="publication-controls">
          <Field class="checkbox-field"><TextField v-model="cropped" type="checkbox" aria-label="裁切出图区域" /><Text>裁切出图区域</Text></Field><Box v-if="cropped" class="position-grid"><Field v-for="key in (['x','y','width','height'] as const)" :key="key"><Text>{{ {x:'左边界',y:'上边界',width:'出图宽度',height:'出图高度'}[key] }}</Text><TextField v-model.number="frame[key]" type="number" min="0" :aria-label="`出图区域 ${key}`" /></Field></Box><Button size="xs" @click="fitContent">按图元边界裁切</Button><Text v-if="!cropValid" class="error-text" role="alert">出图区域须位于 1000×620 画板内。</Text>
          <Field><Text>版面宽度参考</Text><Select :value="preset" :options="[...publicationSizeReferences.map(item=>({value:String(item.widthMm),label:item.name})),{value:'custom',label:'自定义宽度'}]" aria-label="版面宽度参考" @change="choosePreset" /></Field>
          <Field><Text>最终整图宽度（mm）</Text><TextField v-model.number="widthMm" type="number" min="20" max="420" step="0.1" aria-label="最终整图宽度" @input="customWidth=true" /></Field>
          <Box class="publication-thresholds"><Field><Text>最小等效字号（pt）</Text><TextField v-model.number="minFontPt" type="number" min="1" max="24" step="0.5" aria-label="最小等效字号" /></Field><Field><Text>最小描边（pt）</Text><TextField v-model.number="minStrokePt" type="number" min="0.05" max="3" step="0.05" aria-label="最小描边" /></Field></Box>
          <Field class="publication-title-toggle"><TextField v-model="showTitle" type="checkbox" aria-label="显示工程标题" /><Text>图内显示工程标题</Text></Field>
          <Text class="muted-caption">只控制自动显示的工程名，图元、坐标轴与子图文字保持。宽度和阈值均可自定，0.25pt 线宽为工具默认参考。</Text>
          <Text class="muted-caption">IEEE 的 <Link :href="publicationSizeSource" target="_blank" rel="noreferrer">尺寸参考</Link>与 <Link :href="publicationTypeSource" target="_blank" rel="noreferrer">约 9–10pt 文字建议</Link>；具体投稿以目标刊会要求为准。</Text>
          <Text v-if="!settings" role="alert" class="error-text">宽度须为 20–420 mm，字号 1–24 pt，描边 0.05–3 pt。</Text>
          <PublicationReport v-if="report&&settings" :report="report" :settings="settings" expanded @locate="locate" />
        </Box>
      </Box>
      <Text v-if="error" role="alert" class="error-text">{{ error }}</Text>
    </ModalBody>
    <Footer><Button :disabled="!editor.figure.value.publication" @click="clear">移除尺寸设置</Button><Button :disabled="!settings||!cropValid||exporting" @click="exportReport">{{ exporting?'正在导出':'导出检查报告' }}</Button><Text class="muted-caption">预览不修改图元；应用可撤销</Text><Button @click="close">取消</Button><Button variant="primary" :disabled="!settings||!cropValid" @click="apply">应用论文尺寸</Button></Footer>
  </Modal>
</template>
