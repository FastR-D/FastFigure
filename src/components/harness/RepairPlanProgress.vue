<script setup lang="ts">
import { computed } from 'vue'
import { Box, Button, Text } from '../ui'
import type { Harness } from '../../composables/useHarness'
const props=defineProps<{harness:Harness}>()
const plan=computed(()=>props.harness.repairPlan.value)
const visible=computed(()=>plan.value&&(plan.value.status==='running'||plan.value.parentRunId===props.harness.runId.value||plan.value.steps.some(s=>s.runId===props.harness.runId.value)))
const labels={pending:'等待',running:'核对中',changed:'有内容改动',unchanged:'无内容改动',failed:'失败',cancelled:'已停止',skipped:'未执行'}
</script>
<template>
  <Box v-if="plan&&visible" class="repair-plan-progress" role="region" aria-label="分区核对进度">
    <Box class="repair-plan-heading"><Text>分区核对 · {{ plan.status==='running'?'进行中':plan.status==='completed'?'已完成':'已停止' }}</Text><Button v-if="plan.status==='running'" size="xs" variant="quiet" :disabled="plan.stopping" @click="harness.cancelRepairPlan()">{{ plan.stopping?'正在停止…':'停止分区核对' }}</Button></Box>
    <Text class="repair-plan-message" role="status">{{ plan.message }}</Text>
    <Box class="repair-plan-steps"><Box v-for="(step,i) in plan.steps" :key="step.regionId"><Text>{{ i+1 }}. {{ step.title }}</Text><Text>{{ labels[step.status] }}</Text></Box></Box>
    <Button v-if="plan.status!=='running'&&harness.runId.value!==plan.latestCandidateRunId" size="xs" :disabled="harness.locked.value||harness.loading.value||!harness.turns.value.some(t=>t.id===plan?.latestCandidateRunId&&t.available)" @click="harness.inspectTurn(plan.latestCandidateRunId)">查看最近候选</Button>
    <Text class="muted-caption">内容有变化仍需核对，候选未自动应用。</Text>
  </Box>
</template>
