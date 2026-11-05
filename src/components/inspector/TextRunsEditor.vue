<script setup lang="ts">
import {ref,watch,computed} from 'vue'
import {Box,Button,Disclosure,DisclosureTrigger,Field,Select,Text,TextArea,TextField} from '../ui'
import {clone} from '../../core/model'
import {useEditor} from '../../composables/useEditor'
import {fontOptions} from '../../data/materials'
import {textRunsSchema,type TextRun} from '../../core/richTextContract'
const editor=useEditor(),draft=ref<TextRun[]>([])
watch(()=>editor.selectedNode.value,n=>{draft.value=n?.textRuns?clone(n.textRuns):[{text:n?.label??''}]},{immediate:true,deep:true})
const valid=computed(()=>textRunsSchema.safeParse(draft.value).success)
function apply(){if(!valid.value)return;editor.update(doc=>{const n=doc.nodes.find(n=>n.id===editor.selectedId.value);if(n?.kind==='text'){n.textRuns=textRunsSchema.parse(draft.value);n.label=n.textRuns.map(r=>r.text).join('')}})}
function clear(){editor.update(doc=>{const n=doc.nodes.find(n=>n.id===editor.selectedId.value);if(n)delete n.textRuns})}
</script>
<template>
  <Disclosure>
    <DisclosureTrigger size="xs">混合字体、上下标与局部配色</DisclosureTrigger><Box class="structure-settings">
    <Box v-for="(run,index) in draft" :key="index" class="structure-settings"><Field><Text>文字片段 {{ index+1 }}</Text><TextArea v-model="run.text" rows="2" maxlength="240" :aria-label="`文字片段 ${index+1}`" /></Field><Select :value="run.family??''" :options="[{value:'',label:'继承文字字体'},...fontOptions]" :aria-label="`片段字体 ${index+1}`" @change="run.family=($event||undefined) as typeof run.family" /><Select :value="run.script??'normal'" :options="[{value:'normal',label:'正常位置'},{value:'super',label:'上标'},{value:'sub',label:'下标'}]" :aria-label="`片段位置 ${index+1}`" @change="run.script=$event as TextRun['script']" /><Field><Text>片段颜色</Text><TextField type="color" :value="run.color??editor.selectedNode.value?.textStyle?.color??'#202020'" :aria-label="`片段颜色 ${index+1}`" @change="run.color=($event.target as HTMLInputElement).value" /></Field><Box class="material-actions"><Button size="xs" :aria-pressed="!!run.bold" @click="run.bold=!run.bold">粗体</Button><Button size="xs" :aria-pressed="!!run.italic" @click="run.italic=!run.italic">斜体</Button><Button size="xs" :disabled="draft.length===1" @click="draft.splice(index,1)">移除片段</Button></Box></Box>
    <Button size="xs" :disabled="draft.length>=24" @click="draft.push({text:''})">增加文字片段</Button><Text v-if="!valid" role="alert" class="error-text">最多 24 个片段、合计 240 字。</Text><Box class="material-actions"><Button size="xs" @click="clear">合并为普通文字</Button><Button size="xs" variant="primary" :disabled="!valid" @click="apply">应用混合排版</Button></Box>
  </Box>
  </Disclosure>
</template>
