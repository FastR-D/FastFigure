import {onBeforeUnmount,onMounted,ref} from 'vue'
import {imageDraftRunSchema,imageDraftInputSchema,type ImageDraftInput,type ImageDraftRun} from '../core/imageDraftContract'
export function useImageDrafts(){
  const runs=ref<ImageDraftRun[]>([]),error=ref(''),busy=ref(false),pending=ref<ImageDraftInput|null>(null),status=ref('正在检查 Codex…');let timer:ReturnType<typeof setInterval>|undefined,loading=false,disposed=false
  async function request(path:string,body?:unknown){const response=await fetch(`/api/image-drafts/${path}`,body===undefined?undefined:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),value=await response.json() as unknown;if(!response.ok)throw new Error((value as {error?:string}).error??'草稿请求失败');return value}
  async function refresh(){if(loading||disposed)return;loading=true;try{const value=await request('runs');if(disposed)return;runs.value=imageDraftRunSchema.array().parse(value);if(pending.value&&runs.value.some(r=>r.requestId===pending.value!.requestId))pending.value=null}catch(e){error.value=(e as Error).message}finally{loading=false}}
  async function start(input:ImageDraftInput){if(busy.value)return;busy.value=true;error.value='';try{pending.value??=imageDraftInputSchema.parse(input);const result=imageDraftRunSchema.parse(await request('runs',pending.value));pending.value=null;runs.value=[result,...runs.value.filter(r=>r.id!==result.id)]}catch(e){error.value=(e as Error).message;await refresh()}finally{busy.value=false}}
  async function cancel(id:string){try{await request(`runs/${id}/cancel`,{});await refresh()}catch(e){error.value=(e as Error).message}}
  async function review(id:string,decision:'imported'|'discarded'){const result=imageDraftRunSchema.parse(await request(`runs/${id}/review`,{decision}));runs.value=runs.value.map(row=>row.id===id?result:row)}
  onMounted(()=>{void refresh();void request('status').then(value=>{const row=value as {message:string;version?:string};status.value=`${row.version??'Codex'} · ${row.message}`}).catch(e=>{status.value=(e as Error).message});timer=setInterval(()=>{if(runs.value.some(r=>r.status==='running'))void refresh()},1000)})
  onBeforeUnmount(()=>{disposed=true;clearInterval(timer)})
  return{runs,error,busy,pending,status,start,refresh,cancel,review}
}
