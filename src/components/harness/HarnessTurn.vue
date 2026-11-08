<script setup lang="ts">
import CalloutSummary from '../figure/CalloutSummary.vue'
import CalloutReflowSummary from '../figure/CalloutReflowSummary.vue'
import SharedColorbarSummary from '../charts/SharedColorbarSummary.vue'
import PlotAlignmentSummary from '../charts/PlotAlignmentSummary.vue'
import ColorMapSummary from '../library/ColorMapSummary.vue'
import StyleAssetSummary from '../library/StyleAssetSummary.vue'
import { computed, ref } from 'vue'
import { ErrorMessage, Article, Box, BrandMark, Button, Disclosure, DisclosureTrigger, Header, Icon, Text, TextArea } from '../ui'
import type { Harness } from '../../composables/useHarness'
import type { HarnessTurn } from '../../core/harness'
import FigureReview from './FigureReview.vue'
import ReconstructionReview from './ReconstructionReview.vue'
import CatalogueInputPreview from './CatalogueInputPreview.vue'
import CandidateRepair from './CandidateRepair.vue'
import DesignReviewReport from './DesignReviewReport.vue'
import VisualAuditReport from './VisualAuditReport.vue'
import ReferenceUseSummary from './ReferenceUseSummary.vue'
import ChartToolSummary from './ChartToolSummary.vue'
import ChartPreparationPreview from '../charts/ChartPreparationPreview.vue'
import ChartRecommendation from './ChartRecommendation.vue'
import CompositionPlanView from './CompositionPlanView.vue'
import RepositoryRecall from './RepositoryRecall.vue'
import RecipeUpdateSummary from './RecipeUpdateSummary.vue'
import SharedLegendSummary from '../charts/SharedLegendSummary.vue'
import SharedYAxisSummary from '../charts/SharedYAxisSummary.vue'
import {useEditor} from '../../composables/useEditor'
import type { ReconstructionTask } from '../../core/reconstructionContract'
const props = defineProps<{ turn: HarnessTurn; harness: Harness; provider: string; number: number }>()
const emit = defineEmits<{ retry: [content: string,task?:ReconstructionTask]; inspect: [id: string] }>()
const editor=useEditor()
function capture(){if(props.harness.reviewFigure.value)editor.openComponentCapture(props.harness.reviewFigure.value,{kind:'candidate',runId:props.turn.id,review:props.turn.review},[])}
const current = computed(() => props.turn.id === props.harness.runId.value)
const cumulative=ref(false)
const reviewLabels = { none: '', pending: '待审阅', applied: '已应用', discarded: '已丢弃' }
const badge = computed(() => props.turn.status === 'running' ? props.turn.designReview?'审阅中':'生成中' : props.turn.status === 'failed' ? '失败' : props.turn.status === 'cancelled' ? '已停止' : reviewLabels[props.turn.review] || '已完成')
</script>

<template>
  <Box class="assistant-turn" :data-turn-id="turn.id">
    <Article class="assistant-message assistant-message-user"><Header><Icon name="cursor" /><Text>你 · 第 {{ turn.ordinal??number }} 轮</Text></Header><Text>{{ turn.content }}</Text></Article>
    <Article class="assistant-message assistant-message-agent">
      <Header><BrandMark /><Text>{{ provider }}</Text><Text class="assistant-run-badge">{{ badge }}</Text></Header>
      <Text class="muted-caption">{{ new Date(turn.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) }} · {{ turn.model || 'CLI 默认模型' }}</Text>
      <RepositoryRecall v-if="turn.repositoryRecall" :report="turn.repositoryRecall" :run-id="turn.id" :running="turn.status==='running'" />
      <Text v-if="turn.task" class="reconstruction-turn-label">{{ turn.task.kind==='reconstruct'?'参考图结构重建':'原图分区修复' }}</Text>
      <Text v-if="turn.chartData" class="reconstruction-turn-label">数据选图 · {{ turn.chartData.name }} · {{ turn.chartData.rows }} 行 × {{ turn.chartData.columns }} 列</Text>
      <Text v-if="turn.intent==='edit-recipes'" class="reconstruction-turn-label">调整已有组合参数</Text>
      <RecipeUpdateSummary v-if="turn.recipeUpdates?.length" :updates="turn.recipeUpdates" />
      <CalloutSummary v-if="turn.callouts?.length" :reports="turn.callouts" />
      <CalloutReflowSummary v-if="turn.calloutReflows?.length" :reports="turn.calloutReflows" />
      <SharedColorbarSummary v-if="turn.sharedColorbars?.length" :reports="turn.sharedColorbars" />
      <PlotAlignmentSummary v-if="turn.plotAlignments?.length" :reports="turn.plotAlignments" />
      <SharedLegendSummary v-if="turn.sharedLegends?.length" :reports="turn.sharedLegends" />
      <SharedYAxisSummary v-if="turn.sharedYAxes?.length" :reports="turn.sharedYAxes" />
      <Box v-if="turn.visualAudit" class="candidate-lineage"><Text>原图与候选视觉审阅</Text><Button size="xs" variant="quiet" :disabled="harness.locked.value||harness.loading.value||!harness.turns.value.some(t=>t.id===turn.visualAudit?.parentRunId&&t.available)" @click="emit('inspect',turn.visualAudit.parentRunId)">查看受审候选</Button></Box>
      <Box v-if="turn.refinement" class="candidate-lineage"><Text>候选继续修复 · 第 {{ turn.refinement.round }} 轮</Text><Button size="xs" variant="quiet" :disabled="harness.locked.value||harness.loading.value||!harness.turns.value.some(t=>t.id===turn.refinement?.parentRunId&&t.available)" @click="emit('inspect',turn.refinement.parentRunId)">查看上一版候选</Button></Box>
      <Box v-if="turn.auditRepair" class="audit-repair-summary"><Text>依据视觉问题修复 · {{ turn.auditRepair.findings.length }} 项</Text><Text v-for="item in turn.auditRepair.findings" :key="item.id" class="muted-caption">{{ item.title }}</Text><Button size="xs" variant="quiet" :disabled="harness.locked.value||harness.loading.value||!harness.turns.value.some(t=>t.id===turn.auditRepair?.auditRunId&&t.available)" @click="emit('inspect',turn.auditRepair.auditRunId)">查看问题报告</Button></Box>
      <Text v-if="turn.inputImage" class="muted-caption">{{ turn.inputImage.quality==='original'?'原图裁片':'预览裁片（本地原图缓存不可用）' }} · {{ turn.inputImage.width }} × {{ turn.inputImage.height }} 像素</Text>
      <CatalogueInputPreview v-if="turn.cataloguePreview" :info="turn.cataloguePreview" :run-id="turn.id" :available="turn.available" />
      <Box v-if="turn.status === 'running'" class="harness-result-status" role="status" aria-live="polite"><Icon name="refresh" /><Text>{{ turn.designReview?'正在审阅整图…':'正在生成…' }} 已接收 {{ current ? harness.output.value.length : 0 }} 字符</Text></Box>
      <Text v-if="turn.status === 'cancelled'" role="status">运行已停止</Text>
      <Text v-if="current && harness.connection.value" class="muted-caption">{{ harness.connection.value }}</Text>
      <Text v-if="turn.message && turn.status !== 'cancelled'" class="harness-answer">{{ turn.message }}</Text>
      <Text v-if="turn.textCheck" class="muted-caption">生成时文字检查：{{ turn.textCheck.total }} 项 · {{ turn.textCheck.engine }}</Text>
      <StyleAssetSummary v-if="turn.styleReference" :asset="turn.styleReference" /><CompositionPlanView v-if="turn.compositionRecord" :record="turn.compositionRecord" adoptable :disabled="harness.locked.value||harness.loading.value||!turn.available" @adopt="harness.adoptComposition(turn.id)" />
      <Text v-if="turn.adoptedComposition" class="muted-caption">依据方案：{{ turn.adoptedComposition.plan.title }}</Text>
      <ReferenceUseSummary :inputs="turn.referenceInputs" :uses="turn.referenceUse" :run-id="turn.id" :available="turn.available" /><ChartRecommendation v-if="turn.chartRecommendation" :report="turn.chartRecommendation" /><ChartPreparationPreview v-if="turn.chartRecommendation?.preparation" :preparation="turn.chartRecommendation.preparation" :read-only="turn.chartRecommendation.recommendation.status!=='prepare'" :disabled="harness.locked.value||harness.loading.value" @adopt="harness.resumeDataSelection(turn.content)" />
      <Text v-if="turn.status === 'completed' && !turn.hasProposal&&!turn.visualAudit&&!turn.designReview&&!turn.compositionRecord" class="muted-caption">本轮没有待应用的图件。</Text>
      <Text v-if="turn.designReview" class="muted-caption">整图设计审阅 · 建议供判断，未修改画布</Text>
      <DesignReviewReport v-if="current&&turn.designReviewReport&&turn.designReview" :key="turn.id" :turn="turn" :harness="harness" />
      <Disclosure v-if="!current&&turn.designReviewReport"><DisclosureTrigger size="xs">设计审阅（{{ turn.designReviewReport.findings.length }} 项建议）</DisclosureTrigger><Text>{{ turn.designReviewReport.firstRead }}</Text><Box v-for="item in turn.designReviewReport.findings" :key="item.id" class="visual-audit-finding"><Text>{{ item.title }}</Text><Text>{{ item.observation }}</Text><Text>影响：{{ item.impact }}</Text><Text>建议：{{ item.suggestion }}</Text></Box><Text class="muted-caption">查看本轮详情可回看实际受审图片。</Text></Disclosure>
      <VisualAuditReport v-if="current&&turn.auditReport&&turn.visualAudit" :turn="turn" :harness="harness" />
      <Disclosure v-if="!current&&turn.auditReport">
        <DisclosureTrigger size="xs">视觉问题列表（{{ turn.auditReport.findings.length }} 项）</DisclosureTrigger>
        <Text v-if="!turn.auditReport.findings.length" class="muted-caption">本区域未观察到明确问题，仍需人工核对。</Text>
        <Box v-for="item in turn.auditReport.findings" :key="item.id" class="visual-audit-finding"><Text>{{ item.title }}</Text><Text>{{ item.detail }}</Text><Text v-if="item.textEvidence" class="muted-caption">模型转录：原图「{{ item.textEvidence.sourceText }}」 · 候选「{{ item.textEvidence.candidateText }}」</Text><Text class="muted-caption">建议：{{ item.suggestion }}</Text><Text class="muted-caption">{{ item.repairNote }}</Text></Box>
        <Text v-for="(item,i) in turn.auditReport.uncertainties" :key="i" class="placement-message">不确定：{{ item }}</Text>
      </Disclosure>
      <Box v-if="turn.components.length" class="harness-used-components"><Text>复用组件</Text><Box v-for="item in turn.components" :key="item.instanceId"><Text>{{ item.name }} · {{ item.nodeCount }} 节点</Text><Text class="muted-caption">{{ item.componentKey }}<Text v-if="item.parameters"> · {{ Object.entries(item.parameters).map(([k,v]) => `${k}=${v}`).join(', ') }}</Text></Text><Text v-if="item.scale!==undefined" class="muted-caption"><Text v-if="item.fit">放置区域 {{ item.fit.width }} × {{ item.fit.height }} · </Text>等比缩放 {{ (item.scale*100).toFixed(1) }}%</Text><Text v-if="item.edgeRouting" class="muted-caption">内部连线：{{ item.edgeRouting==='straight'?'直线':'折线避障' }}</Text><ColorMapSummary :rows="item.colorMap" /><ChartToolSummary v-if="item.chart" :chart="item.chart" /></Box></Box>
      <Box v-if="turn.intent==='find-components'" class="assistant-adopted-plan"><Text>本轮只寻找素材，没有修改画布。采用后会恢复原来的重建范围，并在发送时附带冻结素材图谱。</Text><Button v-if="turn.status==='completed'" size="xs" :disabled="harness.locked.value||harness.loading.value||!turn.available||!turn.repositoryRecall?.catalogue.length" @click="harness.adoptReconstructionSearch(turn.id)">采用素材并准备重绘</Button><Button v-if="turn.status==='completed'&&!turn.repositoryRecall?.catalogue.length&&turn.task" size="xs" :disabled="harness.locked.value||harness.loading.value" @click="harness.prepareReconstruction(turn.task!,turn.content)">准备原图描摹</Button></Box>
      <Box v-if="current && harness.reviewFigure.value && harness.reviewBase.value" class="harness-proposal">
        <Box class="asset-stats"><Text>候选图</Text><Text>{{ harness.reviewFigure.value.nodes.length }} 节点 · {{ harness.reviewFigure.value.edges.length }} 连接</Text></Box>
        <ReconstructionReview v-if="turn.task" :key="turn.id" :run-id="turn.id" :input-image="turn.inputImage" :before="harness.reviewBase.value" :after="harness.reviewFigure.value" :task="turn.task" />
        <Box v-if="turn.task" class="reconstruction-review-summary"><Text>对象、曲线和文字均可单独编辑，来源区域会随图元保存。</Text><Text v-for="(warning,index) in harness.reviewFigure.value.containers.flatMap(c=>c.reconstruction?.warnings??[])" :key="index" class="placement-message">待核对：{{ warning }}</Text></Box>
        <Box v-if="turn.refinement" class="figure-review-switch"><Button size="xs" :aria-pressed="!cumulative" @click="cumulative=false">本轮修复改动</Button><Button size="xs" :aria-pressed="cumulative" @click="cumulative=true">累计画布改动</Button></Box>
        <Button size="xs" :disabled="harness.locked.value||harness.loading.value" @click="capture">从候选图采集素材</Button>
        <FigureReview :key="`${turn.id}-${cumulative}`" :before="cumulative&&harness.reviewBaseline.value?harness.reviewBaseline.value:harness.reviewBase.value" :after="harness.reviewFigure.value" />
        <CandidateRepair v-if="turn.task&&turn.review==='pending'" :key="turn.id" :harness="harness" :before="harness.reviewBase.value" :after="harness.reviewFigure.value" :task="turn.task" />
        <Box v-if="turn.auditRepair&&turn.review==='pending'" class="audit-repair-recheck"><Text class="muted-caption">修复完成不代表问题已解决，可重新对照原图审阅这版候选。</Text><Button size="xs" :disabled="harness.stale.value||harness.locked.value||harness.loading.value" @click="harness.reauditRepair">复审修复分区</Button></Box>
        <Text v-if="turn.review === 'pending' && harness.stale.value" role="alert" class="error-text">画布在运行期间已变化，请基于最新画布重新生成。</Text>
        <Text v-else-if="turn.review === 'pending'" class="muted-caption">确认改动后应用；应用后可单步撤销。</Text>
        <Text v-else class="muted-caption">{{ reviewLabels[turn.review] }} · 历史结果仅供查看，画布仍可继续编辑。</Text>
        <Box v-if="turn.review === 'pending'" class="assistant-proposal-actions"><Button size="xs" :disabled="harness.locked.value || harness.loading.value" @click="harness.discard">丢弃候选图</Button><Button size="xs" variant="primary" :disabled="harness.stale.value || harness.locked.value || harness.loading.value" @click="harness.apply">应用候选图</Button></Box>
      </Box>
      <ErrorMessage v-if="turn.error" class="error-text" :message="turn.error" />
      <Button v-if="!current && turn.available" size="xs" :disabled="harness.locked.value || harness.loading.value" @click="emit('inspect', turn.id)">查看本轮详情</Button>
      <Text v-if="!turn.available" class="muted-caption">此轮原始输出与预览已清理，消息仍保留。</Text>
      <Text v-if="turn.refinement&&(turn.status==='failed'||turn.status==='cancelled')" class="muted-caption">上一版候选仍保留。查看上一版后，可重新选择分区修复或应用那一版。</Text>
      <Text v-if="turn.chartData&&!harness.chartDataset.value&&(turn.status==='failed'||turn.status==='cancelled')" class="muted-caption">重新导入数据后可重试选图。</Text><Button v-if="!turn.refinement&&!turn.visualAudit&&(turn.status === 'failed' || turn.status === 'cancelled')" size="xs" :disabled="harness.locked.value || harness.loading.value || !!turn.chartData&&!harness.chartDataset.value" @click="turn.designReview?harness.prepareDesignReview(turn.content):emit('retry', turn.content,turn.task)"><Icon name="refresh" />{{ turn.designReview?'重新准备整图审阅':turn.intent==='find-components'?'重新准备看图检索':turn.task?'重新准备重建':turn.chartData?'基于当前数据重试':'基于当前画布重试' }}</Button>
      <Disclosure v-if="current && harness.activities.value.length"><DisclosureTrigger size="xs">运行活动（{{ harness.activities.value.length }}）</DisclosureTrigger><Text v-for="(activity,i) in harness.activities.value" :key="i" class="harness-activity">{{ activity }}</Text></Disclosure>
      <Disclosure v-if="current && harness.output.value"><DisclosureTrigger size="xs">模型原始输出</DisclosureTrigger><TextArea :value="harness.output.value" readonly rows="6" aria-label="模型原始输出" /></Disclosure>
    </Article>
  </Box>
</template>
