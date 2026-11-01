<script setup lang="ts">
import { Box, Button, Disclosure, DisclosureTrigger, Field, Icon, Select, Text, TextField } from '../ui'
import AssetPreview from '../library/AssetPreview.vue'
import type { Harness } from '../../composables/useHarness'
defineProps<{ harness: Harness }>()
function setMode(harness: Harness, value: string) { harness.catalogueMode.value = value as 'auto' | 'selected' | 'none' }
function queryChange(harness: Harness, event: Event) { harness.catalogueQuery.value = (event.target as HTMLInputElement).value }
function libraryChange(harness:Harness,event:Event){harness.librarySearch.value=(event.target as HTMLInputElement).checked}
function reviewChange(harness:Harness,event:Event){harness.libraryReview.value=(event.target as HTMLInputElement).checked}
</script>

<template>
  <Disclosure class="harness-catalogue">
    <DisclosureTrigger size="xs">参考组件（{{ harness.referenceComponents.value.length }}）</DisclosureTrigger>
    <Field><Text>组件选择方式</Text><Select :value="harness.catalogueMode.value" :disabled="harness.busy.value" :options="[{value:'auto',label:'按要求自动检索'}, {value:'selected',label:'指定参考组件'}, {value:'none',label:'不使用组件'}]" aria-label="组件选择方式" @change="setMode(harness, $event)" /></Field>
    <Text v-if="harness.catalogueMode.value === 'auto'" class="muted-caption">按名称、标签和内部节点关键词匹配工作组件与内置配方，每轮最多 6 个。</Text>
    <Field v-if="harness.catalogueMode.value==='auto'&&!harness.reconstructionTask.value" class="checkbox-field"><TextField :checked="harness.librarySearch.value" type="checkbox" :disabled="harness.locked.value" aria-label="自动检索本机素材库" @change="libraryChange(harness,$event)" /><Text>发送时自动检索本机素材库</Text></Field>
    <Text v-if="harness.catalogueMode.value==='auto'&&harness.librarySearch.value&&!harness.reconstructionTask.value" class="muted-caption">服务按本轮文字召回快照并合并至多 6 项，实际清单与命中词记录在本轮详情；不占浏览器名额。</Text>
    <Field v-if="harness.catalogueMode.value==='auto'&&harness.librarySearch.value&&!harness.reconstructionTask.value" class="checkbox-field"><TextField :checked="harness.libraryReview.value" type="checkbox" :disabled="harness.locked.value" aria-label="先由助手筛选素材" @change="reviewChange(harness,$event)" /><Text>先由助手筛选素材</Text></Field>
    <Text v-if="harness.catalogueMode.value==='auto'&&harness.librarySearch.value&&harness.libraryReview.value&&!harness.reconstructionTask.value" class="muted-caption">增加一次模型调用，按文字要求与原生目录筛选至多 24 项，保留至多 6 项并说明否定 / 参数依据；与绘图共用本轮时限。筛选阶段不看参考图。</Text>
    <template v-if="harness.catalogueMode.value === 'selected'">
      <TextField :value="harness.catalogueQuery.value" aria-label="检索参考组件" placeholder="搜索配方、基础或我的组件" @input="queryChange(harness, $event)" />
      <Box class="harness-catalogue-options" role="group" aria-label="可选参考组件">
        <Button v-for="item in harness.catalogueResults.value.filter(i => !harness.catalogueQuery.value.trim() || i.score > 0)" :key="item.key" variant="quiet" :disabled="harness.busy.value || !harness.selectedComponentKeys.value.includes(item.key) && harness.referenceComponents.value.length >= 6" :aria-pressed="harness.selectedComponentKeys.value.includes(item.key)" :aria-label="`参考组件 ${item.asset.name}`" @click="harness.toggleComponent(item.key)">
          <AssetPreview :asset="item.asset" /><Box><Text>{{ item.asset.name }}</Text><Text class="muted-caption">{{ item.entry.kind === 'asset' ? '我的组件' : item.entry.kind === 'recipe' ? '组合配方' : '基础组件' }}</Text></Box><Icon v-if="harness.selectedComponentKeys.value.includes(item.key)" name="check" />
        </Button>
      </Box>
    </template>
    <Box v-if="harness.referenceComponents.value.length" class="harness-reference-list"><Text v-for="item in harness.referenceComponents.value" :key="item.key">{{ item.asset.name }} · {{ item.asset.figure.nodes.length }} 节点</Text></Box>
    <Text v-if="harness.catalogueMode.value !== 'none'" class="muted-caption">{{ harness.catalogueMode.value==='auto'&&harness.librarySearch.value&&!harness.reconstructionTask.value?'以上是发送前候选，最终清单见本轮召回记录。':'发送所列组件的快照。' }}模型可选择复用或直接绘制，来源保持可追溯。</Text>
    <Text v-if="harness.referenceComponents.value.some(item=>item.asset.figure.containers.some(c=>c.id==='stage'&&c.dataChart))" class="muted-caption">图表可按源数据重绘表现，保留输入与误差；重绘会覆盖生成图元的手工改动，额外对象保留。</Text>
  </Disclosure>
</template>
