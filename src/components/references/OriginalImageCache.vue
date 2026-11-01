<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Box, Button, Disclosure, DisclosureTrigger, Field, Heading, Text, TextField } from '../ui'
import type { ReferenceImage } from '../../core/model'
import { originalImage, removeOriginalImage } from '../../core/originalImages'
import { readReferenceImage } from '../../core/references'
const props=defineProps<{image:ReferenceImage}>(),source=ref<{width:number;height:number;bytes:number}|null>(null),busy=ref(false),error=ref('')
let revision=0
async function refresh(){const token=++revision,row=await originalImage(props.image.sha256);if(token===revision)source.value=row?{width:row.width,height:row.height,bytes:row.blob.size}:null}
watch(()=>props.image.sha256,()=>{source.value=null;error.value='';void refresh()},{immediate:true})
onBeforeUnmount(()=>{revision++})
async function supplement(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file||busy.value)return;busy.value=true;error.value='';const sha=props.image.sha256
  try{if(file.size>12_000_000)throw new Error('原图不能超过 12 MB');const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==sha)throw new Error('文件与当前参考图的原文件指纹不符，请选择同一原图');await readReferenceImage(file,props.image.placement);if(props.image.sha256===sha){await refresh();if(!source.value)throw new Error('浏览器原图缓存不可用，将使用工程预览裁片')}}catch(e){if(props.image.sha256===sha)error.value=(e as Error).message}finally{busy.value=false;input.value=''}
}
async function clear(){await removeOriginalImage(props.image.sha256);await refresh()}
</script>
<template>
  <Box class="reference-original-cache"><Heading>局部图片输入</Heading><Text class="muted-caption">{{ source?`已缓存原图 ${source.width} × ${source.height} · ${(source.bytes/1_000_000).toFixed(1)} MB`:'本地原图缓存不可用，重建时使用工程预览裁片。' }}</Text><Text class="muted-caption">发送时裁取所选区域，优先使用原图像素；裁片最长边 2000。原图缓存不写入工程文件。</Text><Disclosure><DisclosureTrigger size="xs">管理原图缓存</DisclosureTrigger><Field><Text>补充对应的原文件</Text><TextField type="file" accept="image/png,image/jpeg,image/webp" :disabled="busy" aria-label="补充原图缓存" @change="supplement" /></Field><Button v-if="source" size="xs" :disabled="busy" @click="clear">清除此图原图缓存</Button><Text class="muted-caption">浏览器本地缓存最多 24 张 / 96 MB，自动清理较早使用的原图。工程预览和画布不受影响。</Text></Disclosure><Text v-if="error" role="alert" class="error-text">{{ error }}</Text></Box>
</template>
