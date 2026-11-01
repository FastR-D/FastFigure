import {ref,shallowRef} from 'vue'
import type {ComponentAsset} from '../core/assets'
import {componentContentHash} from '../core/componentContent'
import {componentSnapshotHash,repositoryPageSchema,repositoryPublishSchema,repositoryReadSchema,repositoryStateSchema,repositoryStatusSchema,contentMatchResultSchema,type RepositoryScope} from '../core/componentRepository'
import {prepareComponentPublish,type PreparedComponentPublish} from './componentSnapshotPreview'
import {createComponentImport} from './useComponentImport'

async function api(path:string,body?:unknown){
  let response:Response
  try{response=await fetch(`/api/component-library${path}`,{signal:AbortSignal.timeout(20_000),...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})})}catch(e){if(e instanceof Error&&e.name==='TimeoutError')throw new Error(body===undefined?'本机素材读取超时，请稍后重试':'本机素材请求超时，写入结果未知；可用同一份冻结内容重试',{cause:e});throw e}
  let result:unknown;try{result=await response.json()}catch{throw new Error('本机素材接口不可用，请通过 pnpm dev 或 pnpm preview 运行')}
  if(!response.ok)throw new Error(result&&typeof result==='object'&&'error'in result?String(result.error):'本机素材请求失败')
  return result
}
export function createComponentRepository(){
  const importOpen=ref(false)
  const page=shallowRef<ReturnType<typeof repositoryPageSchema.parse>>({records:[],total:0,offset:0,limit:12,scope:'active'}),status=shallowRef<ReturnType<typeof repositoryStatusSchema.parse>|null>(null),query=ref(''),scope=ref<RepositoryScope>('active'),loading=ref(false),publishing=ref(false),changingState=ref(''),error=ref('')
  let epoch=0
  async function refresh(q=query.value,offset=0,nextScope=scope.value){
    const request=++epoch;loading.value=true;error.value='';query.value=q;scope.value=nextScope
    const list=(position:number)=>api(`/snapshots?${new URLSearchParams({q,offset:String(position),limit:'12',scope:nextScope})}`)
    try{
      const [records,info]=await Promise.all([list(offset),api('/status')]);let result=repositoryPageSchema.parse(records)
      if(request!==epoch)return
      if(result.total>0&&result.offset>=result.total)result=repositoryPageSchema.parse(await list(Math.floor((result.total-1)/result.limit)*result.limit))
      if(request===epoch){page.value=result;status.value=repositoryStatusSchema.parse(info)}
    }catch(e){if(request===epoch)error.value=(e as Error).message}finally{if(request===epoch)loading.value=false}
  }
  async function read(id:string){const value=repositoryReadSchema.parse(await api(`/snapshots/${id}`));if(value.record.id!==id||await componentSnapshotHash(value.asset)!==id)throw new Error('素材指纹不符，未载入组件');return value}
  async function publishPrepared(payload:PreparedComponentPublish){const value=repositoryPublishSchema.parse(await api('/snapshots',payload));if(value.record.id!==payload.thumbnail.assetSha256)throw new Error('保存回执与素材指纹不符，请重试核对');return value}
  async function persist(prepare:()=>Promise<PreparedComponentPublish>){
    if(publishing.value||changingState.value)throw new Error('正在保存素材或更新归档状态，请稍候')
    publishing.value=true;error.value=''
    try{
      const value=await publishPrepared(await prepare())
      void refresh(query.value,0);return value
    }catch(e){error.value=(e as Error).message;throw e}finally{publishing.value=false}
  }
  const publish=(input:ComponentAsset)=>persist(()=>prepareComponentPublish(input)),publishFrozen=(payload:PreparedComponentPublish)=>persist(async()=>payload)
  async function setState(id:string,archived:boolean){
    if(changingState.value||publishing.value)throw new Error('正在保存素材或更新归档状态，请稍候')
    changingState.value=id;publishing.value=true;error.value=''
    try{
      const result=repositoryStateSchema.parse(await api(`/snapshots/${id}/state`,{archived}))
      if(result.record.id!==id||!!result.record.archivedAt!==archived)throw new Error('归档状态回执不符，请刷新素材库核对')
      void refresh(query.value,page.value.offset);return result
    }catch(e){error.value=(e as Error).message;throw e}finally{changingState.value='';publishing.value=false}
  }
  async function contentMatches(asset:ComponentAsset){const value=contentMatchResultSchema.parse(await api('/content-matches',{asset}));if(value.assetSha256!==await componentSnapshotHash(asset)||value.contentSha256!==await componentContentHash(asset))throw new Error('图形核对结果与当前素材不符，请重试');return value}
  const imports=createComponentImport(publishing,publishPrepared,()=>{void refresh(query.value,0)},contentMatches)
  return{page,status,query,scope,contentMatches,loading,publishing,changingState,error,refresh,read,publish,publishFrozen,setState,imports,importOpen}
}
