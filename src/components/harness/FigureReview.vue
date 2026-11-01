<script setup lang="ts">
import { computed, ref } from 'vue'
import { Box, Button, Disclosure, DisclosureTrigger, Select, Text } from '../ui'
import FigureRenderer from '../figure/FigureRenderer'
import TextCheckReport from '../figure/TextCheckReport.vue'
import {checkFigureText} from '../../core/figureTextCheck'
import PublicationReport from '../figure/PublicationReport.vue'
import {checkPublication} from '../../core/publication'
import { changeActionLabels, changeKindLabels, diffFigures, type ChangeAction, type FigureChange } from '../../core/figureDiff'
import type { FigureDocument } from '../../core/model'
const props = defineProps<{ before: FigureDocument; after: FigureDocument }>()
const mode = ref<'before' | 'after'>('after'), filter = ref<'all' | ChangeAction>('all'), selected = ref(''), highlightedId = ref('')
const diff = computed(() => diffFigures(props.before, props.after))
const visibleChanges = computed(() => diff.value.changes.filter(change => filter.value === 'all' || change.action === filter.value))
const figure = computed(() => mode.value === 'before' ? props.before : props.after)
const textCheck=computed(()=>checkFigureText(figure.value))
const publicationCheck=computed(()=>figure.value.publication?checkPublication(figure.value,figure.value.publication):null)
function highlight(change: FigureChange) {
  selected.value = `${change.kind}:${change.id}`
  highlightedId.value = change.kind === 'document' ? 'stage' : change.kind === 'reference' ? '' : change.id
  mode.value = change.action === 'removed' ? 'before' : 'after'
}
</script>

<template>
  <Box class="figure-review" aria-label="候选图改动审阅">
    <Box class="figure-review-switch" role="group" aria-label="图件对照"><Button size="xs" :aria-pressed="mode === 'before'" @click="mode = 'before'">生成前</Button><Button size="xs" :aria-pressed="mode === 'after'" @click="mode = 'after'">候选结果</Button></Box>
    <FigureRenderer :figure="figure" :highlighted-id="highlightedId" />
    <TextCheckReport :report="textCheck" @locate="highlightedId=$event" />
    <PublicationReport v-if="publicationCheck&&figure.publication" :report="publicationCheck" :settings="figure.publication" @locate="highlightedId=$event" />
    <Text class="figure-diff-counts">新增 {{ diff.added }} · 删除 {{ diff.removed }} · 修改 {{ diff.modified }}</Text>
    <Disclosure class="figure-diff">
      <DisclosureTrigger size="xs">改动清单 · {{ diff.changes.length }} 项</DisclosureTrigger>
      <Select :value="filter" size="xs" aria-label="筛选候选图改动" :options="[{value:'all',label:'全部改动'}, {value:'added',label:'新增'}, {value:'removed',label:'删除'}, {value:'modified',label:'修改'}]" @change="filter = $event as typeof filter" />
      <Box class="figure-diff-list">
        <Box v-for="change in visibleChanges" :key="`${change.kind}:${change.id}`" class="figure-diff-entry" :data-change-action="change.action">
        <Button size="xs" variant="quiet" :aria-pressed="selected === `${change.kind}:${change.id}`" :aria-label="`定位改动 ${changeKindLabels[change.kind]} ${change.id}`" @click="highlight(change)"><Text class="figure-diff-action">{{ changeActionLabels[change.action] }}</Text><Text>{{ changeKindLabels[change.kind] }} · {{ change.label }}</Text></Button>
        <Disclosure><DisclosureTrigger size="xs">{{ change.id }} · {{ change.fields.length }} 项字段</DisclosureTrigger><Box v-for="field in change.fields" :key="field.name" class="figure-diff-field"><Text>{{ field.name }}</Text><Text class="figure-diff-before">{{ field.before }}</Text><Text class="figure-diff-after">{{ field.after }}</Text></Box></Disclosure>
        </Box><Text v-if="!visibleChanges.length" class="muted-caption">没有这类改动</Text>
      </Box>
    </Disclosure>
  </Box>
</template>
