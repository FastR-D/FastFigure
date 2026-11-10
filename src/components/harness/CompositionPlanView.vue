<script setup lang="ts">
import {Box,Button,Disclosure,DisclosureTrigger,Heading,Text} from '@fastrd/ui-vue'
import {compositionRoles,compositionStructures,compositionConnectionLabels,type CompositionRecord} from '../../core/compositionPlanContract'
import {paletteById} from '../../data/materials'
import {containerSurfaceLabels} from '../../core/containerSurface'
import {styles} from '../../core/model'
import {componentRecipes} from '../../data/recipes'
import ColorMapSummary from '../library/ColorMapSummary.vue'
import ReferenceUseSummary from './ReferenceUseSummary.vue'
import {useEditor} from '../../composables/useEditor'
const editor=useEditor()
withDefaults(defineProps<{record:CompositionRecord;adoptable?:boolean;disabled?:boolean;removable?:boolean}>(),{adoptable:false,disabled:false,removable:false})
const emit=defineEmits<{adopt:[];remove:[]}>()
const directions={'left-to-right':'从左到右','top-to-bottom':'从上到下',panels:'多面板',radial:'环绕布局'}
const componentName=(record:CompositionRecord,key:string)=>record.components.find(source=>source.key===key)?.name??key
const componentColor=(record:CompositionRecord,index:number)=>paletteById.get(record.plan.style.paletteId)!.colors[index]
const sectionName=(record:CompositionRecord,id:string)=>record.plan.sections.find(section=>section.id===id)?.title??id
function parameterSummary(key:string,parameters:Record<string,string|number>){
  const recipe=componentRecipes.find(item=>key===`recipe:${item.id}`)
  return Object.entries(parameters).map(([name,value])=>{const field=recipe?.fields.find(item=>item.key===name);return`${field?.label??name} ${field?.options.find(option=>option.value===String(value))?.label??value}`}).join(' · ')
}
</script>
<template>
  <Box class="composition-plan" aria-label="绘图方案">
    <Text class="selection-title">{{ record.plan.title }} · {{ record.plan.status==='ready'?'可采用':'待补充' }}</Text><Text>{{ record.plan.goal }}</Text>
    <Disclosure>
      <DisclosureTrigger size="xs">分区与绘制思路</DisclosureTrigger><Text>{{ directions[record.plan.readingOrder] }} · {{ record.plan.layout }}</Text>
      <Box v-for="section in record.plan.sections" :key="section.id" class="composition-section"><Heading>{{ section.title }}</Heading><Text>{{ section.purpose }}</Text><Text>图示：{{ section.visual }}</Text><template v-if="section.design"><Text>{{ section.design.emphasis==='primary'?'主视觉':'辅助分区' }} · {{ compositionRoles[section.design.role] }} · {{ compositionStructures[section.design.structure] }}</Text><Text>选择理由：{{ section.design.rationale }}</Text><Text>版面：左 {{ Math.round(section.design.frame.x*100) }}% · 上 {{ Math.round(section.design.frame.y*100) }}% · 宽 {{ Math.round(section.design.frame.width*100) }}% · 高 {{ Math.round(section.design.frame.height*100) }}%（根内容区）</Text></template><Box v-for="component in section.components" :key="component.id"><Text>复用素材：{{ componentName(record,component.key) }}{{ component.parameters?` · ${parameterSummary(component.key,component.parameters)}`:'' }}</Text><Box v-if="component.colorIndex!==undefined" class="composition-color-binding"><Box :style="{backgroundColor:componentColor(record,component.colorIndex)}" /><Text>默认主题色 {{ componentColor(record,component.colorIndex) }}</Text></Box><ColorMapSummary :rows="component.colorMap" /></Box><Text v-if="section.referenceImages.length">参考图：{{ section.referenceImages.join('、') }}</Text><Text v-for="(note,i) in section.annotations" :key="i">注释：{{ note }}</Text></Box>
      <Text v-for="(link,i) in record.plan.connections" :key="i">{{ sectionName(record,link.from) }} {{ link.kind==='detail'||link.kind==='comparison'||link.kind==='membership'?'↔':'→' }} {{ sectionName(record,link.to) }}：{{ link.kind?`[${compositionConnectionLabels[link.kind]}] `:'' }}{{ link.meaning }}</Text>
    </Disclosure>
    <Disclosure><DisclosureTrigger size="xs">风格与核对项</DisclosureTrigger><Text>{{ paletteById.get(record.plan.style.paletteId)?.title }} · {{ record.plan.style.fontFamily }} · {{ styles.find(style=>style.id===record.plan.style.preset)?.name }} · {{ containerSurfaceLabels[record.plan.style.surface??'plain'] }}</Text><Text>全图默认色：{{ componentColor(record,record.plan.style.colorIndex??0) }}</Text><ColorMapSummary :rows="record.plan.style.colorMap" /><Text>{{ record.plan.style.usage }}</Text><Text class="muted-caption">组件色槽由程序绑定到对应实例，手工颜色和局部覆盖保持；采用前请核对上方色样。</Text><Text v-for="(item,i) in record.plan.checks" :key="`check-${i}`">核对：{{ item }}</Text><Text v-for="(item,i) in record.plan.uncertainties" :key="`uncertain-${i}`">不确定：{{ item }}</Text></Disclosure>
    <Text v-for="(question,i) in record.plan.questions" :key="i" class="placement-message">待补充：{{ question }}</Text>
    <Disclosure><DisclosureTrigger size="xs">规划输入来源</DisclosureTrigger><Text>{{ record.userGoal }}</Text><Text v-for="source in record.components" :key="source.key">{{ source.name }} · {{ source.revision }} · {{ source.nodeCount }} 节点</Text><ReferenceUseSummary :uses="record.references" /><Text class="muted-caption">来源与观察属于规划阶段输入；实际绘图采用情况另行记录。</Text></Disclosure>
    <Text class="muted-caption">方案由模型提出，请核对科学内容与图示关系。</Text>
    <Button v-if="record.plan.status==='ready'&&record.plan.sections.every(s=>s.design)" size="xs" :disabled="disabled" @click="editor.requestImageDraft(record)">用此方案准备图像草稿</Button>
    <Button v-if="adoptable" size="xs" :disabled="disabled||record.plan.status!=='ready'" @click="emit('adopt')">采用绘图方案</Button>
    <Button v-if="adoptable&&record.plan.status==='ready'" size="xs" :disabled="disabled" @click="editor.styleDialog.value={kind:'plan',record}">存为风格素材</Button>
    <Button v-if="removable" size="xs" variant="quiet" :disabled="disabled" @click="emit('remove')">移除此方案记录</Button>
  </Box>
</template>
