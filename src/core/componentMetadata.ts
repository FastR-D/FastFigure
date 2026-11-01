import {z} from 'zod'
import {parseAsset,type ComponentAsset} from './assets'
import {componentFromSnapshot,componentSnapshotHash} from './componentRepository'

export interface ComponentMetadataDraft{name:string;description:string;tags:string;sources:{title:string;reference:string}[]}
const textSource=z.object({title:z.string().trim().min(1).max(100),reference:z.string().trim().min(1).max(500)}).strict()
const metadataSchema=z.object({name:z.string().trim().min(1).max(100),description:z.string().trim().max(300),tags:z.array(z.string().trim().min(1).max(30)).max(12),sources:z.array(textSource).max(12)}).strict()
export function componentMetadataDraft(asset:ComponentAsset):ComponentMetadataDraft{return{name:asset.name,description:asset.description,tags:asset.tags.join(', '),sources:[]}}
export function normalizeComponentMetadata(draft:ComponentMetadataDraft){
  const parsed=metadataSchema.safeParse({name:draft.name,description:draft.description,tags:[...new Set(draft.tags.split(/[,，\n]/).map(value=>value.trim()).filter(Boolean))],sources:draft.sources.filter(source=>source.title.trim()||source.reference.trim())})
  if(!parsed.success)throw new Error('请填写名称；说明最多 300 字，标签最多 12 个且各不超过 30 字；补充来源须同时填写名称和引用')
  return parsed.data
}
/** Metadata-only derivation: graphical labels, source evidence and recipe records remain untouched. */
export async function reviseComponentMetadata(input:ComponentAsset,draft:ComponentMetadataDraft,options:{snapshotId?:string;revisionAt:string}){
  const base=parseAsset(input),metadata=normalizeComponentMetadata(draft),sources=metadata.sources.filter((source,index,all)=>!base.sources.some(old=>old.title===source.title&&old.reference===source.reference)&&all.findIndex(other=>other.title===source.title&&other.reference===source.reference)===index),changed=metadata.name!==base.name||metadata.description!==base.description||JSON.stringify(metadata.tags)!==JSON.stringify(base.tags)||!!sources.length
  const normalized:ComponentMetadataDraft={name:metadata.name,description:metadata.description,tags:metadata.tags.join(', '),sources:metadata.sources}
  if(!changed)return{asset:base,changed:false,draft:normalized}
  const revision=z.iso.datetime().parse(options.revisionAt),sourceHash=await componentSnapshotHash(base)
  if(options.snapshotId&&sourceHash!==options.snapshotId)throw new Error('整理来源与原快照指纹不符')
  const asset=options.snapshotId?componentFromSnapshot(base,options.snapshotId):base
  if(!options.snapshotId){
    const assetId=`source-${sourceHash}`
    if(!asset.lineage.some(origin=>origin.assetId===assetId)){
      if(asset.lineage.length>=16)throw new Error('组件来源链已满，无法追加整理来源；原文件仍可保存')
      asset.lineage.push({assetId,name:base.name,revision:base.updatedAt,...(base.recipe?{recipe:base.recipe}:{})})
    }
  }
  if(asset.sources.length+sources.length>12)throw new Error('组件来源最多 12 条，已有来源保持，请减少补充引用')
  Object.assign(asset,{name:metadata.name,description:metadata.description,tags:metadata.tags,sources:[...asset.sources,...sources],updatedAt:revision})
  return{asset:parseAsset(asset),changed:true,draft:normalized}
}
