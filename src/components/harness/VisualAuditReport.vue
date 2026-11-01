<script setup lang="ts">
import { computed,onBeforeUnmount,ref,useTemplateRef,watch } from 'vue'
import { Box,Button,Field,Heading,Image,Text,TextField } from '../ui'
import type { Harness } from '../../composables/useHarness'
import type { HarnessTurn } from '../../core/harness'
const props=defineProps<{turn:HarnessTurn;harness:Harness}>(),selected=ref(''),chosen=ref<string[]>([]),mode=ref('candidate'),sourceUrl=ref(''),candidateUrl=ref(''),imageError=ref(''),loading=ref(false),preview=useTemplateRef<HTMLElement>('preview')
const report=computed(()=>props.turn.auditReport!),audit=computed(()=>props.turn.visualAudit!),finding=computed(()=>report.value.findings.find(f=>f.id===selected.value)),parent=computed(()=>props.harness.turns.value.find(t=>t.id===audit.value.parentRunId))
const blocked=computed(()=>props.harness.locked.value||props.harness.loading.value||props.harness.stale.value||!parent.value?.available||parent.value.review!=='pending'),repairable=computed(()=>report.value.findings.filter(f=>f.repairable)),allChosen=computed(()=>repairable.value.length>0&&repairable.value.every(f=>chosen.value.includes(f.id)))
const kinds={text:'文字',missing:'缺漏',connection:'连接',geometry:'几何',color:'颜色',layout:'排版',uncertain:'不确定'},severities={major:'主要',minor:'次要',uncertain:'待确认'}
let request:AbortController|undefined
function release(){if(sourceUrl.value)URL.revokeObjectURL(sourceUrl.value);if(candidateUrl.value)URL.revokeObjectURL(candidateUrl.value);sourceUrl.value='';candidateUrl.value=''}
async function load(){request?.abort();const controller=new AbortController();request=controller;release();loading.value=true;imageError.value=''
  try{
    const get=async(suffix:string)=>{const response=await fetch(`/api/harness/runs/${props.turn.id}/${suffix}`,{signal:controller.signal});if(!response.ok)throw new Error('本轮实际审阅图片已清理或暂不可读，问题报告仍保留');const blob=await response.blob();let bitmap:ImageBitmap;try{bitmap=await createImageBitmap(blob)}catch{throw new Error('本轮审阅图片无法解码，报告仍保留')}try{if(bitmap.width!==audit.value.sourceImage.width||bitmap.height!==audit.value.sourceImage.height)throw new Error('本轮审阅图片尺寸不符')}finally{bitmap.close()}return blob}
    const [source,candidate]=await Promise.all([get('input-image'),get('candidate-image')]);if(!controller.signal.aborted){sourceUrl.value=URL.createObjectURL(source);candidateUrl.value=URL.createObjectURL(candidate)}
  }catch(e){if(!controller.signal.aborted)imageError.value=(e as Error).message}finally{if(request===controller)loading.value=false}
}
watch(()=>props.turn.id,()=>{selected.value='';chosen.value=[];void load()},{immediate:true})
onBeforeUnmount(()=>{request?.abort();release()})
function locate(id:string){selected.value=id;mode.value='candidate';preview.value?.scrollIntoView({block:'nearest'})}
function toggle(id:string){chosen.value=chosen.value.includes(id)?chosen.value.filter(value=>value!==id):[...chosen.value,id]}
</script>

<template>
  <Box class="visual-audit-report" aria-label="视觉审阅问题清单">
    <Heading>视觉审阅 · {{ report.findings.length }} 项待核对</Heading><Text class="muted-caption">会话独立，模型与本轮选择相同。问题清单不是自动验收或修改。</Text>
    <Box class="figure-review-switch"><Button size="xs" :aria-pressed="mode==='source'" @click="mode='source'">原图裁片</Button><Button size="xs" :aria-pressed="mode==='candidate'" @click="mode='candidate'">受审候选</Button><Button size="xs" :aria-pressed="mode==='both'" @click="mode='both'">并排</Button></Box>
    <Box ref="preview" class="visual-audit-images" :class="{'visual-audit-pair':mode==='both'}">
      <Box v-if="sourceUrl&&mode!=='candidate'" class="visual-audit-image"><Text>原图 · {{ audit.sourceImage.quality==='original'?'原文件裁片':'预览裁片' }}</Text><Image :src="sourceUrl" alt="视觉审阅原图" /></Box>
      <Box v-if="candidateUrl&&mode!=='source'" class="visual-audit-image"><Text>实际发送的候选渲染</Text><Box class="visual-audit-raster"><Image :src="candidateUrl" alt="视觉审阅候选" /><Box v-if="finding" class="visual-audit-location" :style="{left:`${finding.box.x*100}%`,top:`${finding.box.y*100}%`,width:`${finding.box.width*100}%`,height:`${finding.box.height*100}%`}" aria-hidden="true" /></Box></Box>
    </Box>
    <Text v-if="loading" class="muted-caption">正在读取本轮两张实际输入…</Text><Box v-if="imageError"><Text class="muted-caption">{{ imageError }}</Text><Button size="xs" @click="load">重新读取审阅图片</Button></Box>
    <Text class="muted-caption">{{ audit.sourceImage.width }} × {{ audit.sourceImage.height }} 像素 · 报告针对这版候选</Text>
    <Text v-if="audit.recheck" class="muted-caption">修复后的新一轮审阅：图片来自这版候选，问题是否解决仍需对照核对。</Text>
    <Text v-if="!report.findings.length" class="muted-caption">本区域未观察到明确问题，仍请人工核对小字、连接与语义。</Text>
    <Box v-if="report.findings.length" class="visual-audit-selection" role="group" aria-label="合并视觉问题修复"><Text>已选择 {{ chosen.length }} / {{ repairable.length }} 个可修复问题</Text><Button size="xs" variant="quiet" :disabled="blocked||!repairable.length" @click="chosen=allChosen?[]:repairable.map(f=>f.id)">{{ allChosen?'取消全选':'全选可修复问题' }}</Button><Text class="muted-caption">多选后从这份报告对应的版本合并修复。继续较新的版本，请在新候选上复审。</Text><Button size="xs" :disabled="blocked||!chosen.length" @click="harness.prepareAuditRepair(turn.id,chosen)">准备合并修复（{{ chosen.length }} 项）</Button></Box>
    <Box v-for="item in report.findings" :key="item.id" class="visual-audit-finding" :data-finding-id="item.id" :class="{selected:selected===item.id,'chosen-for-repair':chosen.includes(item.id)}"><Button size="xs" variant="quiet" :aria-label="`定位问题 ${item.title}`" @click="locate(item.id)">{{ item.title }}</Button><Field class="checkbox-field visual-audit-checkbox"><TextField type="checkbox" :model-value="chosen.includes(item.id)" :aria-label="`选择问题 ${item.title}`" :disabled="blocked||!item.repairable" @update:model-value="toggle(item.id)" /><Text>加入本次修复</Text></Field><Text class="muted-caption">{{ kinds[item.type] }} · {{ severities[item.severity] }}</Text><Text>{{ item.detail }}</Text><Text v-if="item.textEvidence" class="muted-caption">模型转录：原图「{{ item.textEvidence.sourceText }}」 · 候选「{{ item.textEvidence.candidateText }}」{{ item.candidateTextVerified===false?' · 与候选图元不一致':'' }}</Text><Text class="muted-caption">建议：{{ item.suggestion }}</Text><Text class="muted-caption">{{ item.repairNote }}</Text><Button size="xs" :disabled="!item.repairable||blocked" @click="harness.prepareAuditRepair(turn.id,[item.id])">准备修复此问题</Button></Box>
    <Text v-for="(item,i) in report.uncertainties" :key="i" class="placement-message">不确定：{{ item }}</Text>
    <Text v-if="harness.stale.value" role="alert" class="error-text">画布已变化，报告仍可回看；修复前请基于当前画布重新核对。</Text>
  </Box>
</template>
