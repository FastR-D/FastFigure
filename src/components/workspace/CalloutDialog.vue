<script setup lang="ts">
import {computed,ref} from 'vue'
import {Box,Button,Field,Footer,Header,Heading,Modal,ModalBody,Select,Text,TextArea,TextField} from '@fastrd/ui-vue'
import IconButton from '../ui/IconButton.vue'
import FigureRenderer from '../figure/FigureRenderer'
import CalloutSummary from '../figure/CalloutSummary.vue'
import CalloutReflowSummary from '../figure/CalloutReflowSummary.vue'
import {reflowCallouts,existingCalloutTargets} from '../../core/calloutReflow'
import {useEditor} from '../../composables/useEditor'
import {createCallouts,calloutTargets} from '../../core/callouts'
import {clone} from '../../core/model'
import {fontOptions} from '../../data/materials'

const editor=useEditor(),base=clone(editor.figure.value),baseline=JSON.stringify(base),targets=calloutTargets(base,editor.selectedIds.value)
const operation=ref<'new'|'adjust'>('new'),existing=existingCalloutTargets(base,editor.selectedIds.value),picked=ref<string[]>(existing.filter(row=>!row.error&&editor.selectedIds.value.includes(row.labelId)).slice(0,8).map(row=>row.key)),reflowMode=ref('route'),reflowSide=ref('auto'),anchorPolicy=ref('preserve')
const sides=[{value:'auto',label:'自动选择'},{value:'right',label:'右侧'},{value:'left',label:'左侧'},{value:'top',label:'上方'},{value:'bottom',label:'下方'}]
function toggleExisting(key:string){
  if(picked.value.includes(key)){picked.value=picked.value.filter(id=>id!==key);return}
  const row=existing.find(row=>row.key===key)!
  picked.value=picked.value.filter(id=>{const item=existing.find(row=>row.key===id)!;return item.leaderId!==row.leaderId&&item.labelId!==row.labelId})
  if(picked.value.length<8)picked.value.push(key)
}
const adjusted=computed(()=>{if(!picked.value.length)return{result:null,error:''};try{return{result:reflowCallouts(base,picked.value.map(key=>{const row=existing.find(row=>row.key===key)!;return{leaderId:row.leaderId,labelId:row.labelId,mode:reflowMode.value,anchorPolicy:anchorPolicy.value,side:reflowMode.value==='route'?'auto':reflowSide.value,reason:'作者选择调整已有引线注释'}})),error:''}}catch(error){return{result:null,error:(error as Error).message}}})
const targetId=ref(targets.find(t=>t.selected&&!t.error)?.targetId??targets.find(t=>!t.error)?.targetId??''),text=ref(''),size=ref(12),width=ref(180),side=ref('auto'),family=ref(editor.activeStyle.value.fontFamily??'MiSans'),before=ref(false)
const target=computed(()=>targets.find(t=>t.targetId===targetId.value)),parentId=ref(target.value?.parentIds[0]??'stage')
const parents=computed(()=>target.value?.parentIds.map(id=>({value:id,label:base.containers.find(c=>c.id===id)!.title}))??[])
const stale=computed(()=>baseline!==JSON.stringify(editor.figure.value))
const preview=computed(()=>{if(!text.value.trim())return{result:null,error:''};try{return{result:createCallouts(base,[{targetId:targetId.value,parentId:parentId.value,text:text.value,fontFamily:family.value,fontSize:size.value,maxWidth:width.value,side:side.value,reason:'作者填写的引线说明'}]),error:''}}catch(error){return{result:null,error:error instanceof Error&&'issues'in error?'请检查完整注释、字体、字号与宽度':(error as Error).message}}})
const display=computed(()=>before.value?base:operation.value==='new'?preview.value.result?.figure??base:adjusted.value.result?.figure??base)
const error=computed(()=>operation.value==='new'?preview.value.error:adjusted.value.error)
const canApply=computed(()=>!stale.value&&(operation.value==='new'?!!preview.value.result:!!adjusted.value.result?.changed))
function selectTarget(id:string){targetId.value=id;parentId.value=targets.find(t=>t.targetId===id)?.parentIds[0]??'stage'}
function close(){editor.calloutOpen.value=false}
function apply(){
  if(!canApply.value)return
  const result=operation.value==='new'?preview.value.result:adjusted.value.result
  if(!result)return
  if(editor.update(doc=>Object.assign(doc,result.figure))){editor.select(result.reports[0]!.labelId);editor.notice.value=operation.value==='new'?'已添加可编辑引线注释；可撤销':'已调整已有注释，原文、样式与关联对象保持；可撤销';close()}
}

</script>
<template>
  <Modal open label="添加引线注释" class="panel-layout-dialog" @close="close">
    <Header><Box><Heading>引线注释</Heading><Text class="muted-caption">新增说明或调整已有注释，原文与样式保持。</Text></Box><IconButton icon="close" label="关闭引线注释" @click="close" /></Header>
    <ModalBody>
      <Box class="material-actions" role="group" aria-label="引线注释操作">
        <Button :aria-pressed="operation==='new'" @click="operation='new'">新建注释</Button><Button :aria-pressed="operation==='adjust'" @click="operation='adjust'">调整已有注释</Button>
      </Box>
      <Box class="panel-layout-grid">
        <Box class="panel-layout-preview">
          <Box class="material-actions"><Button size="xs" :aria-pressed="before" @click="before=true">原图</Button><Button size="xs" :aria-pressed="!before" @click="before=false">注释预览</Button></Box>
          <FigureRenderer :figure="display" :show-document-title="false" />
          <Text class="muted-caption">组合请选择内部图元；空间不足时可选更外层容器。生成后可移动文字、编辑折点和端点附着；移动只跟随两端，路径不会持续自动避让。</Text>
        </Box>
        <Box class="panel-layout-controls">
          <Box v-if="operation==='new'" class="panel-layout-controls">
          <Field><Text>关联对象</Text><Select :value="targetId" :options="targets.filter(t=>!t.error).map(t=>({value:t.targetId,label:`${t.label} · ${t.kind}`}))" aria-label="注释关联对象" @change="selectTarget" /></Field>
          <Field><Text>放置容器</Text><Select :value="parentId" :options="parents" aria-label="注释放置容器" @change="parentId=$event" /></Field>
          <Field><Text>完整注释</Text><TextArea v-model="text" rows="2" maxlength="160" aria-label="引线注释原文" placeholder="例如：冻结的检索编码器；不会作为实验结论自动补写" /></Field>
          <Box class="data-chart-two-fields">
            <Field><Text>字体</Text><Select :value="family" :options="fontOptions" aria-label="引线注释字体" @change="family=$event as typeof family" /></Field>
            <Field><Text>字号</Text><TextField v-model.number="size" type="number" min="8" max="32" aria-label="引线注释字号" /></Field>
            <Field><Text>最大宽度</Text><TextField v-model.number="width" type="number" min="40" max="300" aria-label="引线注释宽度" /></Field>
            <Field><Text>放置侧向</Text><Select :value="side" :options="sides" aria-label="引线注释侧向" @change="side=$event" /></Field>
          </Box>
          <CalloutSummary v-if="preview.result" :reports="preview.result.reports" />
          </Box>
          <Box v-else class="panel-layout-controls">
            <Field><Text>调整方式</Text><Select :value="reflowMode" :options="[{value:'route',label:'仅重排引线'},{value:'layout',label:'文字与引线一起调整'}]" aria-label="已有注释调整方式" @change="reflowMode=$event" /></Field>
            <Field><Text>附着点</Text><Select :value="anchorPolicy" :options="[{value:'preserve',label:'保留原附着点'},{value:'reselect',label:'重新选择附着点'}]" aria-label="已有注释附着点策略" @change="anchorPolicy=$event" /></Field>
            <Field v-if="reflowMode==='layout'"><Text>文字侧向</Text><Select :value="reflowSide" :options="sides" aria-label="已有注释放置侧向" @change="reflowSide=$event" /></Field>
            <Text class="muted-caption">选择最多 8 条注释。保留原文、尺寸、层级和关联对象；任何一项无可用空间时整批不应用。</Text>
            <Text v-if="anchorPolicy==='reselect'" class="muted-caption">在原对象的边缘或闭合路径已有锚点之间重选，偏移与绑定说明保持。请在预览中核对具体指向。</Text>
            <Box role="group" aria-label="选择已有注释" class="shared-yaxis-summary">
              <Button v-for="row in existing" :key="row.key" size="sm" :disabled="!!row.error||picked.length>=8&&!picked.includes(row.key)" :aria-pressed="picked.includes(row.key)" :aria-label="`选择已有注释 ${row.text} · ${row.leaderId}`" @click="toggleExisting(row.key)">{{ row.text }}<Text class="muted-caption">{{ row.error||`关联 ${row.targetLabel}` }}</Text></Button>
              <Text v-if="!existing.length" class="muted-caption">当前没有双端附着的无框文字引线。可先新建注释，或给现有开放路径绑定两个端点。</Text>
            </Box>
            <CalloutReflowSummary v-if="adjusted.result" :reports="adjusted.result.reports" />
          </Box>
          <Text v-if="stale" role="alert" class="error-text">画布已变化，请关闭后重新打开。</Text><Text v-else-if="error" role="alert" class="error-text">{{ error }}</Text>
        </Box>
      </Box>
    </ModalBody><Footer><Text class="muted-caption">预览不修改画布，应用可单步撤销</Text><Button @click="close">取消</Button><Button variant="primary" :disabled="!canApply" @click="apply">{{ operation==='new'?'应用引线注释':'应用已有注释调整' }}</Button></Footer>
  </Modal>
</template>
