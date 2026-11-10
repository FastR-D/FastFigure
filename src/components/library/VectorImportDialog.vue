<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { Box, Button, Field, Footer, Header, Heading, Modal, ModalBody, Select, Text, TextField } from '@fastrd/ui-vue'
import IconButton from '../ui/IconButton.vue'
import AssetPreview from './AssetPreview.vue'
import { useEditor } from '../../composables/useEditor'
import { importSvg,inspectSvg,type SvgImportResult,type SvgInventory } from '../../core/svgImport'
import {prepareDrawio,importPreparedDrawio,type DrawioPrepared} from '../../core/drawioImport'
import {readComponentImportFile,type ComponentImportFile} from '../../core/componentImport'
import { parseAsset } from '../../core/assets'
import { clone } from '../../core/model'
type ImportResult=SvgImportResult|ReturnType<typeof importPreparedDrawio>
const editor=useEditor(),file=shallowRef<ComponentImportFile|null>(null),result=shallowRef<ImportResult|null>(null),inventory=shallowRef<SvgInventory|null>(null)
const page=ref(''),group=ref('all'),keepGroups=ref(true),preferMetadata=ref(true),name=ref(''),citation=ref(''),busy=ref(false),error=ref('')
let generation=0
const asset=computed(()=>{
  if(!result.value)return null
  const asset=clone(result.value.asset),title=name.value.trim()
  if(!title)return null
  asset.name=title
  const reference=citation.value.trim()
  if(reference){
    const enrich=(source:typeof asset.sources[number])=>{if(source.file?.sha256===file.value?.sha256)source.reference=`${reference} · ${source.reference}`.slice(0,500)}
    asset.sources.forEach(enrich)
    for(const object of [...asset.figure.nodes,...asset.figure.containers])if(object.evidence)enrich(object.evidence)
  }
  try{return parseAsset(asset)}catch{return null}
})
async function parse(){
  const input=file.value,token=++generation
  result.value=null;error.value=''
  if(!input)return
  busy.value=true
  try{
    let prepared:DrawioPrepared|undefined
    if(input.format==='drawio'){
      if(!page.value){inventory.value=null;return}
      prepared=prepareDrawio(input.drawing!,page.value)
    }
    const inspected=prepared?.inventory??inspectSvg(input.source)
    await Promise.all(inspected.fonts.flatMap(font=>[400,700].map(weight=>document.fonts.load(`${weight} 16px "${font}"`))))
    if(token!==generation)return
    if(prepared)prepared=prepareDrawio(input.drawing!,page.value)
    inventory.value=prepared?.inventory??inspected
    const options={fileName:input.name,sha256:input.sha256,group:group.value==='all'?undefined:group.value,keepGroups:keepGroups.value,preferMetadata:preferMetadata.value}
    result.value=prepared?importPreparedDrawio(prepared,options):importSvg(input.source,options)
  }catch(e){if(token===generation)error.value=e instanceof Error&&!('issues' in e)?e.message:'解析结果超出图元、几何或容器层级限制，请选择较小的子图'}
  finally{if(token===generation)busy.value=false}
}
async function choose(event:Event){
  const input=event.target as HTMLInputElement,selected=input.files?.[0];input.value=''
  if(!selected)return
  const token=++generation;busy.value=true;error.value='';result.value=null;inventory.value=null;file.value=null
  try{
    const read=await readComponentImportFile(selected);if(token!==generation)return
    if(read.format==='json')throw new Error('此处仅支持 SVG 或 draw.io 文件')
    file.value=read;name.value=selected.name.replace(/(?:\.drawio)?\.(svg|drawio|xml)$/i,'').slice(0,100);group.value='all';page.value=read.drawing?.pages.length===1?read.drawing.pages[0]!.key:''
    await parse()
  }catch(e){if(token===generation){error.value=e instanceof Error?e.message:'矢量文件读取失败';busy.value=false}}
}
watch([group,keepGroups,preferMetadata],()=>{void parse()})
watch(page,()=>{inventory.value=null;group.value='all';void parse()})
function close(){generation++;editor.vectorImportOpen.value=false}
function insert(newCanvas=false){if(asset.value&&editor.insertComponent(asset.value,true,newCanvas))close();else error.value=editor.notice.value}
onBeforeUnmount(()=>{generation++})
</script>
<template>
  <Modal :open="editor.vectorImportOpen.value" label="导入可编辑绘图素材" size="lg" class="svg-import-dialog" @close="close">
    <Header><Box><Heading>导入 SVG / draw.io</Heading><Text class="muted-caption">转为可编辑形状、文字和曲线，保留来源后复用。</Text></Box><IconButton icon="close" label="关闭矢量导入" @click="close" /></Header>
    <ModalBody>
      <Field><Text>SVG / draw.io / XML · 最大 2 MB</Text><TextField type="file" accept=".svg,.drawio,.xml,image/svg+xml,application/xml" aria-label="选择矢量素材文件" @change="choose" /></Field>
      <Box v-if="file" class="svg-import-grid">
        <Box class="svg-import-preview"><AssetPreview v-if="asset" :asset="asset" /><Text v-else>{{ busy?'正在解析图元…':file.drawing&&!page?'请选择要导入的页面':'请检查解析报告' }}</Text></Box>
        <Box class="component-settings">
          <Field><Text>素材名称</Text><TextField v-model="name" maxlength="100" aria-label="矢量素材名称" /></Field>
          <Field><Text>论文 / 来源引用（可选）</Text><TextField v-model="citation" maxlength="300" aria-label="矢量来源引用" placeholder="论文标题、作者或来源链接" /></Field>
          <Field v-if="file.drawing"><Text>draw.io 页面</Text><Select :value="page" :options="[{value:'',label:'请选择页面'},...file.drawing.pages.map(item=>({value:item.key,label:item.name}))]" aria-label="draw.io 导入页面" @change="page=$event" /></Field>
          <Field v-if="inventory"><Text>导入范围</Text><Select :value="group" :disabled="busy" :options="[{value:'all',label:'整个图件'},...inventory.groups.map(g=>({value:g.key,label:`${g.name} · ${g.elements} 项`}))]" aria-label="矢量导入范围" @change="group=$event" /></Field>
          <Field class="checkbox-field"><TextField v-model="keepGroups" type="checkbox" aria-label="保留矢量分组" /><Text>保留分组</Text></Field>
          <Field v-if="file.format==='svg'&&inventory?.hasMetadata" class="checkbox-field"><TextField v-model="preferMetadata" type="checkbox" aria-label="优先恢复 FastFigure 元数据" /><Text>优先恢复 FastFigure 元数据</Text></Field>
          <Text v-if="result" class="svg-import-summary">{{ result.report.nodes }} 个图元 · {{ result.report.groups }} 个分组 · {{ result.report.texts }} 段文字 · {{ result.report.curves }} 条曲线</Text>
          <Text v-if="result" class="muted-caption">{{ result.report.mode==='metadata'?'已恢复工程结构':result.report.mode==='drawio'?'已从 draw.io 页面重建原生图元':'已解析 SVG 图元' }}。导入后可逐个改字、移动锚点和控制点。</Text>
          <Text v-if="result?.report.mode==='drawio'" class="muted-caption">{{ result.report.connections }} 条连接 · {{ result.report.boundEnds }} 个端点已绑定{{ result.report.unboundEnds?` · ${result.report.unboundEnds} 个端点需手工核对`:'' }}</Text>
          <Text v-if="result?.report.fonts.length" class="muted-caption">字体：{{ result.report.fonts.join('、') }}。未安装的字体由浏览器回退，预览以当前设备为准。</Text>
          <Text class="muted-caption svg-fingerprint">{{ file.name }} · SHA-256 {{ file.sha256 }}</Text>
        </Box>
      </Box>
      <Text v-for="warning in result?.report.warnings??[]" :key="warning" class="muted-caption">{{ warning }}</Text>
      <Text v-if="error" class="error-text" role="alert">{{ error }}</Text>
      <Text v-if="!file" class="muted-caption">支持常见矢量形状、曲线、文字与分组；draw.io 可读取压缩和多页文件。复杂模板形状、渐变、裁剪、滤镜和外部图片需先展开；解析失败不更改工程。</Text>
    </ModalBody>
    <Footer><Button @click="close">取消</Button><Button :disabled="!asset||busy" @click="insert(true)">新建图件并插入</Button><Button variant="primary" :disabled="!asset||busy" @click="insert(false)">插入当前容器</Button></Footer>
  </Modal>
</template>
