<script setup lang="ts">
import {computed} from 'vue'
import {Box,Button,Heading,Text} from '../ui'
import {useEditor} from '../../composables/useEditor'
import {internalContainerEdges,setContainerEdgeRouting} from '../../core/edgeRouting'
import type {AutomaticEdgeRouting} from '../../core/model'
const props=defineProps<{containerId:string}>(),editor=useEditor()
const edges=computed(()=>internalContainerEdges(editor.figure.value,props.containerId)),manual=computed(()=>edges.value.filter(e=>e.routing==='manual').length),straight=computed(()=>edges.value.filter(e=>e.routing==='straight').length),blocked=computed(()=>edges.value.filter(e=>editor.routes.value.get(e.id)?.status==='blocked').length)
function apply(routing:AutomaticEdgeRouting){let changed=0;if(editor.update(doc=>{changed=setContainerEdgeRouting(doc,props.containerId,routing).changed}))editor.notice.value=`已调整 ${changed} 条内部连线`}
</script>
<template>
  <Box v-if="edges.length" class="structure-settings" aria-label="组合内部连线">
    <Heading>内部连线</Heading><Text class="muted-caption">{{ edges.length }} 条 · 直线 {{ straight }} · 折线 {{ edges.length-straight-manual }} · 指定折点 {{ manual }}</Text>
    <Box class="material-actions"><Button size="xs" :aria-pressed="straight===edges.length" :disabled="straight===edges.length" aria-label="内部连线全部改为直线" @click="apply('straight')">全部直线</Button><Button size="xs" :aria-pressed="straight===0&&manual===0" :disabled="straight===0&&manual===0" aria-label="内部连线全部改为折线避障" @click="apply('orthogonal')">全部折线</Button></Box>
    <Button size="xs" @click="editor.materialEdit.value='line-style'">统一内部连线样式</Button>
    <Text v-if="manual" class="muted-caption">批量改为自动模式会清除指定折点，可撤销。</Text>
    <Text v-if="blocked" class="error-text" role="status">{{ blocked }} 条内部连接受阻</Text>
  </Box>
</template>
