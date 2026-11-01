<script setup lang="ts">
import {computed,onBeforeUnmount,ref} from 'vue'
import {Box,Button,Header,Heading,Image,Modal,ModalBody,Text} from '../ui'
import IconButton from '../ui/IconButton.vue'
import type {CataloguePreviewInfo} from '../../core/cataloguePreviewContract'
const props=defineProps<{info:CataloguePreviewInfo;runId:string;available:boolean;selectionPage?:number}>(),open=ref(false),zoom=ref(false),loading=ref(false),source=ref(''),error=ref('');let request:AbortController|undefined
const imageTitle=computed(()=>props.selectionPage?`第 ${props.selectionPage} 页实际筛选图谱`:'本轮实际组件图谱')
function close(){request?.abort();open.value=false;if(source.value)URL.revokeObjectURL(source.value);source.value=''}
async function inspect(){
  close();zoom.value=false;open.value=true;loading.value=true;error.value='';const controller=new AbortController();request=controller
  try{
    const response=await fetch(`/api/harness/runs/${props.runId}/${props.selectionPage?`selection-previews/${props.selectionPage}`:'catalogue-image'}`,{signal:controller.signal});if(!response.ok)throw new Error('本轮组件图谱已清理或不可用，目录与指纹仍保留')
    const blob=await response.blob(),bytes=await blob.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');if(controller.signal.aborted)return
    if(digest!==props.info.sha256)throw new Error('组件图谱指纹不符，已停止显示')
    const bitmap=await createImageBitmap(blob),valid=bitmap.width===props.info.width&&bitmap.height===props.info.height;bitmap.close();if(!valid)throw new Error('组件图谱像素尺寸不符，已停止显示')
    if(!controller.signal.aborted)source.value=URL.createObjectURL(blob)
  }catch(e){if(!controller.signal.aborted)error.value=(e as Error).message}finally{if(request===controller)loading.value=false}
}
onBeforeUnmount(close)
</script>
<template>
  <Box class="catalogue-input-summary"><Text>{{ selectionPage?`筛选图谱 · 第 ${selectionPage} 页`:'本轮组件图谱' }} · {{ info.tiles.length }} 项 · 第 {{ selectionPage?selectionPage+1:2 }} 张输入</Text><Text class="muted-caption">实际默认 / 保存外观；参数变化后的结果须另行核对。</Text><Text v-for="tile in info.tiles" :key="tile.key" class="muted-caption">{{ tile.index }}. {{ tile.name }} · {{ tile.key }}</Text><Button size="xs" :disabled="!available" @click="inspect">{{ selectionPage?`查看筛选图谱第 ${selectionPage} 页`:'查看本轮组件图谱' }}</Button><Text class="reference-fingerprint">图谱 SHA-256：{{ info.sha256 }}</Text></Box>
  <Modal :open="open" label="本轮组件图谱" @close="close"><Header><Heading>{{ imageTitle }}</Heading><IconButton icon="close" label="关闭组件图谱" @click="close" /></Header><ModalBody><Text v-if="loading">正在读取本轮图片…</Text><Text v-if="error" role="alert">{{ error }}</Text><Button v-if="source" size="xs" :aria-pressed="zoom" @click="zoom=!zoom">{{ zoom?'适合窗口':'原始像素' }}</Button><Box class="catalogue-input-scroll"><Image v-if="source" :src="source" :alt="imageTitle" class="catalogue-input-image" :class="{'is-actual':zoom}" /></Box><Text class="muted-caption">{{ info.width }} × {{ info.height }} · {{ info.renderer }} · 素材快照 {{ info.snapshotSha256 }}</Text></ModalBody></Modal>
</template>
