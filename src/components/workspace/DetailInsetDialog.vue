<script setup lang="ts">
import {computed,ref} from 'vue'
import {Box,Button,Field,Footer,Header,Heading,Modal,ModalBody,Select,Text,TextField} from '@fastrd/ui-vue'
import IconButton from '../ui/IconButton.vue'
import FigureRenderer from '../figure/FigureRenderer'
import {useEditor} from '../../composables/useEditor'
import {clone} from '../../core/model'
import {ancestors,contentBounds,topLevelSelection} from '../../core/geometry'
import {applyMaterialEdits} from '../../core/materialEditing'
const editor=useEditor(),base=clone(editor.figure.value),baseline=JSON.stringify(base),objectIds=[...editor.selectedIds.value],roots=topLevelSelection(base,objectIds),parents=base.containers.filter(c=>roots.length&&roots.every(o=>ancestors(base,o.id).includes(c.id))).sort((a,b)=>ancestors(base,a.id).length-ancestors(base,b.id).length),parentId=ref(parents.at(-1)?.id??'stage'),scale=ref(2),caption=ref('局部详情'),guides=ref(true),manual=ref(false),area=contentBounds(parents.at(-1)??base.containers[0]!),x=ref(Math.round(area.x)),y=ref(Math.round(area.y))
const stale=computed(()=>JSON.stringify(editor.figure.value)!==baseline),preview=computed(()=>{try{return{result:applyMaterialEdits(base,[{kind:'detail-inset',objectIds,parentId:parentId.value,scale:Number(scale.value),caption:caption.value,guides:guides.value,...(manual.value?{position:{x:Number(x.value),y:Number(y.value)}}:{})}]),error:''}}catch(error){return{result:null,error:error instanceof Error&&'issues'in error?'请选择 1–24 个原生对象，倍率为 1–4，标题为 1–60 字，位置须在画板内':(error as Error).message}}})
function close(){editor.detailInsetOpen.value=false}
function apply(){const result=preview.value.result;if(!result||stale.value)return;if(editor.update(doc=>Object.assign(doc,result.figure))){editor.select(result.reports[0]!.objectIds[0]!);editor.notice.value=result.reports[0]!.summary;close()}}
</script>
<template>
  <Modal open size="xl" label="放大选中局部" class="layout-dialog" @close="close">
    <Header><Box><Heading>放大选中局部</Heading><Text class="muted-caption">复制选中的真实原生对象、文字和内部关系。原图保持，放大副本可独立编辑。</Text></Box><IconButton icon="close" label="关闭局部放大" @click="close" /></Header>
    <ModalBody>
<Box class="layout-dialog-grid">
<Box class="layout-preview"><FigureRenderer :figure="preview.result?.figure??base" :show-document-title="false" :highlighted-id="preview.result?.reports[0]?.objectIds[0]" /></Box><Box class="component-settings">
      <Text class="panel-description">这是当前快照；源图后续编辑不自动同步。源框表示选择范围，框内未选对象不复制，外部连接保持在原图。</Text>
      <Field><Text>放置容器</Text><Select :value="parentId" :options="parents.map(c=>({value:c.id,label:c.title}))" aria-label="局部放大容器" @change="parentId=$event" /></Field>
      <Field><Text>相对当前尺寸（倍）</Text><TextField v-model.number="scale" type="number" min="1" max="4" step="0.25" aria-label="局部放大倍率" /></Field>
      <Field><Text>快照标题</Text><TextField v-model="caption" maxlength="60" aria-label="局部放大标题" /></Field>
      <Field class="checkbox-field"><TextField v-model="guides" type="checkbox" aria-label="显示局部对应引线" /><Text>显示对应引线</Text></Field>
      <Field class="checkbox-field"><TextField v-model="manual" type="checkbox" aria-label="手动指定局部放大位置" /><Text>手动指定位置；默认寻找空白</Text></Field>
      <template v-if="manual"><Field><Text>X</Text><TextField v-model.number="x" type="number" min="0" max="1000" aria-label="局部放大 X" /></Field><Field><Text>Y</Text><TextField v-model.number="y" type="number" min="0" max="620" aria-label="局部放大 Y" /></Field></template>
      <Text v-if="preview.result" class="muted-caption">{{ preview.result.reports[0]?.summary }}</Text><Text v-if="stale||preview.error" role="alert" class="error-text">{{ stale?'画布已变化，请关闭后重新打开局部放大':preview.error }}</Text>
    </Box>
</Box>
</ModalBody>
    <Footer><Text class="muted-caption">预览不修改画布，应用后可单步撤销</Text><Button @click="close">取消</Button><Button variant="primary" :disabled="stale||!preview.result" @click="apply">应用局部放大</Button></Footer>
  </Modal>
</template>
