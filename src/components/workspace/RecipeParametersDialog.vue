<script setup lang="ts">
import {computed,ref} from 'vue'
import {Box,Button,Field,Footer,Header,Heading,Modal,ModalBody,Select,Text,TextField} from '@fastrd/ui-vue'
import IconButton from '../ui/IconButton.vue'
import FigureRenderer from '../figure/FigureRenderer'
import {useEditor} from '../../composables/useEditor'
import {clone} from '../../core/model'
import {componentRecipes,visibleRecipeFields,recipeFieldValue} from '../../data/recipes'
import {updateRecipeInstance,type RecipeUpdateLayout} from '../../core/recipeUpdate'
import {routeFigure} from '../../core/routing'
import {checkFigureText} from '../../core/figureTextCheck'
const editor=useEditor(),id=editor.recipeDialogId.value!,base=clone(editor.figure.value),baseline=JSON.stringify(base),root=base.containers.find(c=>c.id===id)!,state=root.parametric!
const recipe=componentRecipes.find(recipe=>recipe.id===state.recipe.id),parameters=ref({...state.recipe.parameters}),layout=ref<RecipeUpdateLayout>('scale'),keepEdits=ref(true),view=ref('after')
const stale=computed(()=>JSON.stringify(editor.figure.value)!==baseline),preview=computed(()=>{try{return{result:updateRecipeInstance(base,id,parameters.value,layout.value,keepEdits.value),error:''}}catch(error){return{result:null,error:error instanceof Error&&!('issues'in error)?error.message:'参数结果超出配方、尺寸或图元限制'}}})
const display=computed(()=>view.value==='before'?base:preview.value.result?.document??base),routes=computed(()=>routeFigure(display.value)),viewport=computed(()=>{const after=preview.value.result?.document.containers.find(c=>c.id===id)??root;return{x:root.x-16,y:root.y-16,width:Math.max(root.width,after.width)+32,height:Math.max(root.height,after.height)+32}})
const beforeChecks={text:checkFigureText(base).total,blocked:[...routeFigure(base).values()].filter(route=>route.status==='blocked').length},checks=computed(()=>({text:checkFigureText(display.value).total,blocked:[...routes.value.values()].filter(route=>route.status==='blocked').length}))
function close(){editor.recipeDialogId.value=null}
function apply(){const result=preview.value.result;if(result&&!stale.value)editor.applyRecipePreview(result)}
</script>
<template>
  <Modal :open="true" label="调整组合参数" size="xl" class="recipe-parameters-dialog" @close="close">
    <Header><Box><Heading>调整组合参数 · {{ root.title }}</Heading><Text class="muted-caption">生成图元的位置、形状与内部连接会按新参数重绘。另加对象保留；应用前可切换预览，整次更新可撤销。</Text></Box><IconButton icon="close" label="关闭组合参数" @click="close" /></Header>
    <ModalBody>
<Box class="recipe-parameters-grid">
      <Box class="recipe-parameters-preview"><Box class="material-actions"><Button size="xs" :aria-pressed="view==='before'" @click="view='before'">当前组合</Button><Button size="xs" :aria-pressed="view==='after'" @click="view='after'">更新预览</Button></Box><Box class="recipe-parameters-canvas"><FigureRenderer :figure="display" :routes="routes" :viewport="viewport" :show-document-title="false" /></Box><Text class="muted-caption">同一视野比较尺寸与结构；工程文字提示 {{ checks.text }} 项（原 {{ beforeChecks.text }}），受阻连接 {{ checks.blocked }} 条（原 {{ beforeChecks.blocked }}）。</Text></Box>
      <Box class="component-settings"><Text class="panel-description">{{ recipe?.description }}</Text><Field v-for="field in recipe?visibleRecipeFields(recipe,parameters):[]" :key="field.key"><Text>{{ field.label }}</Text><Select :value="String(recipeFieldValue(field,parameters))" :options="field.options" :aria-label="`更新${field.label}`" @change="parameters[field.key]=$event" /></Field><Field><Text>更新范围</Text><Select :value="layout" :options="[{value:'scale',label:'保持绘制比例，按内容调整外框'},{value:'frame',label:'适配原外框，内部等比缩放'}]" aria-label="组合参数更新范围" @change="layout=$event as RecipeUpdateLayout" /></Field><Field class="checkbox-field"><TextField v-model="keepEdits" type="checkbox" aria-label="保留组合改字与外观" /><Text>保留手工改字与外观</Text></Field><Text class="muted-caption">保留项包括文字格式、颜色和命名接口的手工设置；生成图元的手动位置、曲线及内部连线仍按参数重绘。来源与另加注释保持。</Text></Box>
    </Box><Text v-if="preview.result?.changed" class="placement-message">重绘 {{ preview.result.generated }} 个图元 · 保留 {{ preview.result.retainedIds }} 个对象 ID · 新增 {{ preview.result.added }} / 移除 {{ preview.result.removed }} 个生成对象 · 保留 {{ preview.result.preserved }} 个另加对象 · {{ preview.result.overrides }} 项手工文字 / 外观设置</Text><Text v-else-if="!preview.error" class="muted-caption">修改参数后显示更新预览。</Text><Text v-if="root.reconstructionReuse" class="muted-caption">素材辅助重建记录保留初次复用信息；本次参数调整后的外观请重新对照原图。</Text><Text v-if="stale" role="alert" class="error-text">画布已变化，请关闭并重新打开组合参数。</Text><Text v-if="preview.error" role="alert" class="error-text">{{ preview.error }}</Text>
</ModalBody>
    <Footer><Button @click="close">取消</Button><Button variant="primary" :disabled="stale||!preview.result?.changed" @click="apply">应用组合参数</Button></Footer>
  </Modal>
</template>
