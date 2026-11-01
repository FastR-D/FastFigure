import {parseAsset,type ComponentAsset} from '../core/assets'
import {computed,ref,shallowRef,type Ref} from 'vue'
import {componentSnapshotHash,type ContentMatchResult,type repositoryPublishSchema} from '../core/componentRepository'
import {importLimits,readComponentImportFile,parseComponentImportFile,type ComponentImportFile} from '../core/componentImport'
import {prepareComponentPublish,type PreparedComponentPublish} from './componentSnapshotPreview'
import {componentMetadataDraft,reviseComponentMetadata,type ComponentMetadataDraft} from '../core/componentMetadata'

type Receipt=ReturnType<typeof repositoryPublishSchema.parse>
export interface ComponentImportRow{
  sourceKind?:'file'|'capture'|'vector';id:string;fileName:string;bytes:number;status:'pending'|'preparing'|'ready'|'saving'|'stored'|'exists'|'error';selected:boolean;warnings:string[];error:string
  sourceSha256?:string;format?:'json'|'svg'|'drawio';mode?:'component'|'metadata'|'svg'|'drawio';pageKey?:string;originalFileName?:string;payload?:PreparedComponentPublish;receipt?:Receipt;duplicateOf?:string
  contentReview?:ContentMatchResult;contentError?:string;contentBatchOf?:string
  basePayload?:PreparedComponentPublish;metadataDraft?:ComponentMetadataDraft;appliedMetadata?:ComponentMetadataDraft;metadataDirty?:boolean;metadataEdited?:boolean;metadataRevisionAt?:string;attemptedAt?:string
}
/** A page-owned queue. Closing a preview never changes the frozen payload of an in-flight write. */
export function createComponentImport(publishing:Ref<boolean>,send:(payload:PreparedComponentPublish)=>Promise<Receipt>,refresh:()=>void,lookup:(asset:ComponentAsset)=>Promise<ContentMatchResult>){
  const rows=shallowRef<ComponentImportRow[]>([]),preparing=ref(false),saving=ref(false),pauseRequested=ref(false),error=ref(''),batchId=ref(''),createdAt=ref(''),lastSubmittedAt=ref('')
  const readCache=new Map<File,Promise<ComponentImportFile>>()
  const files=new Map<string,File>(),busy=computed(()=>preparing.value||saving.value),locked=computed(()=>busy.value||publishing.value),selected=computed(()=>rows.value.filter(row=>row.selected&&row.payload&&(row.status==='ready'||row.status==='error'))),pendingMetadata=computed(()=>selected.value.some(row=>row.metadataDirty))
  const patch=(id:string,change:Partial<ComponentImportRow>)=>{rows.value=rows.value.map(row=>row.id===id?{...row,...change}:row)}
  function ready(payload:PreparedComponentPublish){const draft=componentMetadataDraft(payload.asset);return{payload,basePayload:payload,metadataDraft:draft,appliedMetadata:draft,metadataDirty:false,metadataEdited:false}}
  const message=(e:unknown)=>e instanceof Error&&!('issues'in e)?e.message:'文件内容或几何超出组件限制，请先拆分素材'
  const contentComplete=(row:ComponentImportRow)=>!!row.contentReview&&row.contentReview.assetSha256===row.payload?.thumbnail.assetSha256&&!row.contentReview.index.remaining&&!row.contentReview.index.unreadable&&!row.contentError
  const contentCaution=(row:ComponentImportRow)=>!contentComplete(row)||!!row.contentReview?.total||!!row.contentBatchOf
  function updateBatchMatches(){
    const hashes=new Map<string,string>(),contents=new Map<string,{name:string;hash:string}>()
    rows.value=rows.value.map(row=>{
      const hash=row.payload?.thumbnail.assetSha256,content=row.contentReview?.contentSha256
      if(!hash)return row
      const duplicateOf=hashes.get(hash),previous=content?contents.get(content):undefined
      if(!duplicateOf)hashes.set(hash,row.fileName)
      if(content&&!previous)contents.set(content,{name:row.fileName,hash})
      return{...row,duplicateOf,contentBatchOf:previous&&previous.hash!==hash?previous.name:undefined}
    })
  }
  async function reviewContent(id:string){
    const row=rows.value.find(row=>row.id===id);if(!row?.payload)return
    patch(id,{contentError:''})
    try{
      for(;;){
        const review=await lookup(row.payload.asset)
        patch(id,{contentReview:review});updateBatchMatches()
        if(!review.index.remaining||pauseRequested.value)break
        await new Promise<void>(resolve=>setTimeout(resolve,0))
      }
    }catch(e){patch(id,{contentError:message(e)})}
    const updated=rows.value.find(row=>row.id===id)!;if(contentCaution(updated))patch(id,{selected:false})
  }
  async function recheckContent(id:string){if(locked.value)return;preparing.value=true;pauseRequested.value=false;try{await reviewContent(id)}finally{preparing.value=false}}
  async function preparePending(){
    if(locked.value)return
    preparing.value=true;pauseRequested.value=false;error.value=''
    try{for(;;){
      const pending=rows.value.find(row=>row.status==='pending');if(!pending)break
      await new Promise<void>(resolve=>setTimeout(resolve,0))
      if(pauseRequested.value)break
      patch(pending.id,{status:'preparing',error:''})
      try{
        const file=files.get(pending.id)!;if(!readCache.has(file))readCache.set(file,readComponentImportFile(file))
        const input=await readCache.get(file)!;patch(pending.id,{sourceSha256:input.sha256,format:input.format})
        if(input.drawing&&input.drawing.pages.length>1&&!pending.pageKey){
          if(rows.value.length+input.drawing.pages.length-1>importLimits.files)throw new Error('展开 draw.io 页面后超过 50 项，请通过单图导入选择页面')
          const expanded=input.drawing.pages.map((page,index)=>{const id=index?crypto.randomUUID():pending.id;files.set(id,file);return{...pending,id,fileName:`${input.name} · ${page.name}`,originalFileName:input.name,pageKey:page.key,sourceSha256:input.sha256,format:input.format,status:'pending' as const}})
          rows.value=rows.value.flatMap(row=>row.id===pending.id?expanded:[row]);continue
        }
        const same=rows.value.find(row=>row.id!==pending.id&&row.payload&&row.sourceSha256===input.sha256&&row.format===input.format&&row.pageKey===pending.pageKey&&(input.format==='json'||(row.originalFileName??row.fileName)===input.name))
        if(same){const payload=same.basePayload??same.payload!,duplicate=rows.value.find(row=>row.id!==pending.id&&row.payload?.thumbnail.assetSha256===payload.thumbnail.assetSha256);patch(pending.id,{status:'ready',...ready(payload),warnings:same.warnings,mode:same.mode,duplicateOf:duplicate?.fileName,selected:!same.warnings.length&&!duplicate});await reviewContent(pending.id);continue}
        const parsed=await parseComponentImportFile(input,pending.pageKey),hash=await componentSnapshotHash(parsed.asset),cached=rows.value.find(row=>row.id!==pending.id&&(row.basePayload??row.payload)?.thumbnail.assetSha256===hash),duplicate=rows.value.find(row=>row.id!==pending.id&&row.payload?.thumbnail.assetSha256===hash),payload=(cached?.basePayload??cached?.payload)??await prepareComponentPublish(parsed.asset)
        const warnings=[...parsed.warnings,...(pending.sourceKind==='capture'?(await import('../core/componentCapture')).inspectCapturedFigure(parsed.asset.figure).warnings:[])]
        patch(pending.id,{status:'ready',...ready(payload),warnings,mode:parsed.mode,...(duplicate?{duplicateOf:duplicate.fileName}:{}),selected:!warnings.length&&!duplicate});await reviewContent(pending.id)
      }catch(e){patch(pending.id,{status:'error',error:message(e),selected:false})}
    }}finally{preparing.value=false}
  }
  async function addFiles(input:File[],sourceKind:'file'|'capture'|'vector'='file'){
    if(locked.value)return
    error.value=''
    if(rows.value.length+input.length>importLimits.files||[...new Set([...files.values(),...input])].reduce((sum,file)=>sum+file.size,0)>importLimits.totalBytes){error.value='每批最多 50 项（含 draw.io 页面）、原文件合计 50 MB，请拆分后导入';return}
    if(!input.length)return
    if(!batchId.value){batchId.value=crypto.randomUUID();createdAt.value=new Date().toISOString()}
    const added=input.map(file=>{const id=crypto.randomUUID();files.set(id,file);return{id,sourceKind,fileName:file.name,bytes:file.size,status:'pending' as const,selected:false,warnings:[],error:''}})
    rows.value=[...rows.value,...added];await preparePending()
  }
  async function addAssetFiles(assets:ComponentAsset[],sourceKind:'capture'|'vector',warnings:string[]=[]){
    if(locked.value)return[]
    const before=new Set(rows.value.map(row=>row.id)),input=assets.map(value=>{const asset=parseAsset(value);return new File([JSON.stringify(asset)],`${asset.name}.fastfigure-component.json`,{type:'application/json'})})
    await addFiles(input,sourceKind)
    const added=rows.value.filter(row=>!before.has(row.id));if(warnings.length)for(const row of added)patch(row.id,{warnings:[...new Set([...row.warnings,...warnings])],selected:false})
    return rows.value.filter(row=>!before.has(row.id))
  }
  const addCaptured=(assets:ComponentAsset[])=>addAssetFiles(assets,'capture')
  const addVector=(assets:ComponentAsset[],warnings:string[])=>addAssetFiles(assets,'vector',warnings)
  function choose(id:string,value:boolean){if(!locked.value){const row=rows.value.find(row=>row.id===id);if(row?.payload&&(row.status==='ready'||row.status==='error'))patch(id,{selected:value})}}
  function selectClean(){if(locked.value)return;const seen=new Set<string>();rows.value=rows.value.map(row=>{const hash=row.payload?.thumbnail.assetSha256,eligible=!!hash&&(row.status==='ready'||row.status==='error')&&!row.warnings.length&&!contentCaution(row)&&!seen.has(hash);if(hash)seen.add(hash);return{...row,selected:eligible}})}
  function deselect(){if(!locked.value)rows.value=rows.value.map(row=>({...row,selected:false}))}
  function remove(id:string){if(!locked.value){const file=files.get(id);files.delete(id);if(file&&![...files.values()].includes(file))readCache.delete(file);rows.value=rows.value.filter(row=>row.id!==id);updateBatchMatches()}}
  function clear(){if(!locked.value){files.clear();readCache.clear();rows.value=[];error.value='';batchId.value='';createdAt.value='';lastSubmittedAt.value=''}}
  function pause(){if(busy.value)pauseRequested.value=true}
  function editMetadata(id:string,draft:ComponentMetadataDraft){const row=rows.value.find(row=>row.id===id);if(!locked.value&&row?.payload&&!row.attemptedAt&&row.status==='ready')patch(id,{metadataDraft:draft,metadataDirty:JSON.stringify(draft)!==JSON.stringify(row.appliedMetadata),error:''})}
  async function applyMetadata(id:string){
    const row=rows.value.find(row=>row.id===id);if(locked.value||!row?.basePayload||!row.metadataDraft||row.attemptedAt||row.status!=='ready')return
    preparing.value=true
    try{
      const revisionAt=row.metadataRevisionAt??new Date().toISOString(),revision=await reviseComponentMetadata(row.basePayload.asset,row.metadataDraft,{revisionAt}),payload=revision.changed?await prepareComponentPublish(revision.asset):row.basePayload,duplicate=rows.value.find(other=>other.id!==id&&other.payload?.thumbnail.assetSha256===payload.thumbnail.assetSha256)
      patch(id,{payload:duplicate?.payload??payload,contentReview:undefined,contentBatchOf:undefined,contentError:'',metadataDraft:revision.draft,appliedMetadata:revision.draft,metadataDirty:false,metadataEdited:revision.changed,metadataRevisionAt:revisionAt,duplicateOf:duplicate?.fileName,error:'',...(duplicate?{selected:false}:{})});await reviewContent(id)
    }catch(e){patch(id,{error:message(e)})}finally{preparing.value=false}
  }
  function resetMetadata(id:string){const row=rows.value.find(row=>row.id===id);if(!locked.value&&row?.basePayload&&!row.attemptedAt&&row.status==='ready'){const duplicate=rows.value.find(other=>other.id!==id&&other.payload?.thumbnail.assetSha256===row.basePayload!.thumbnail.assetSha256);patch(id,{...ready(row.basePayload),contentReview:undefined,contentError:'检索信息已恢复，请重新核对相同图形',contentBatchOf:undefined,selected:false,metadataRevisionAt:undefined,duplicateOf:duplicate?.fileName,error:''})}}
  async function submit(){
    if(locked.value||!selected.value.length)return
    if(pendingMetadata.value){error.value='请先应用选中项的检索信息，或恢复原始信息';return}
    const queue=[...selected.value],known=new Map(rows.value.flatMap(row=>row.receipt&&row.payload&&['stored','exists'].includes(row.status)?[[row.payload.thumbnail.assetSha256,row.receipt] as const]:[]))
    publishing.value=true;saving.value=true;pauseRequested.value=false;error.value=''
    try{for(const row of queue){
      if(pauseRequested.value)break
      patch(row.id,{status:'saving',error:'',attemptedAt:row.attemptedAt??new Date().toISOString()})
      try{
        const hash=row.payload!.thumbnail.assetSha256,previous=known.get(hash),receipt=previous??await send(row.payload!)
        if(receipt.record.id!==hash)throw new Error('入库回执与冻结内容不符，请重试核对')
        known.set(hash,receipt);patch(row.id,{status:previous||receipt.duplicate?'exists':'stored',receipt,error:'',selected:false})
      }catch(e){patch(row.id,{status:'error',error:message(e),selected:true})}
    }}finally{lastSubmittedAt.value=new Date().toISOString();saving.value=false;publishing.value=false;refresh()}
  }
  function report(){return{format:'fastfigure.import-report',version:1,batchId:batchId.value,createdAt:createdAt.value,lastSubmittedAt:lastSubmittedAt.value,running:busy.value,rows:rows.value.map(row=>({...Object.fromEntries(Object.entries(row).filter(([key])=>!['payload','basePayload','receipt','metadataDraft','appliedMetadata','contentReview'].includes(key))),...(row.contentReview?{contentReview:{...row.contentReview,records:row.contentReview.records.map(({id,name,archivedAt})=>({id,name,archivedAt}))}}:{}),...(row.basePayload?{baseAssetSha256:row.basePayload.thumbnail.assetSha256}:{}),...(row.payload?{assetName:row.payload.asset.name,assetSha256:row.payload.thumbnail.assetSha256}:{}),...(row.receipt?{receipt:{id:row.receipt.record.id,revision:row.receipt.record.revision,savedAt:row.receipt.record.savedAt,...(row.receipt.record.archivedAt?{archivedAt:row.receipt.record.archivedAt}:{})}}:{})}))}}
  return{rows,recheckContent,contentComplete,preparing,saving,pauseRequested,busy,locked,error,selected,pendingMetadata,editMetadata,applyMetadata,resetMetadata,addFiles,addCaptured,addVector,preparePending,choose,selectClean,deselect,remove,clear,pause,submit,report}
}
