import {clone,parseDocument,rootContainer,type FigureDocument,type ReferenceImage} from './model.ts'
import {catalogueAsset,catalogueKey,composeCatalogue,type CatalogueEntry,type ComponentInstance} from './catalogue.ts'
import {referenceSource} from './references.ts'
import type {CataloguePreviewInfo} from './cataloguePreviewContract.ts'
import {reconstructionReuseRecordSchema,type ReconstructionRecord,type ReconstructionReuse} from './reconstructionContract.ts'

/** Fit frozen library structures to source-image boxes; pixel tracing stays a separate layer. */
export function composeReconstructionReuse(base:FigureDocument,reuse:ReconstructionReuse[],entries:CatalogueEntry[],reference:ReferenceImage,record:ReconstructionRecord,preview?:CataloguePreviewInfo){
  const selected=new Map(entries.map(entry=>[catalogueKey(entry),entry])),roi={x:record.region.x*record.sourceWidth,y:record.region.y*record.sourceHeight,w:record.region.width*record.sourceWidth,h:record.region.height*record.sourceHeight}
  if(new Set(reuse.map(row=>row.id)).size!==reuse.length)throw new Error('重建素材实例 ID 不能重复')
  const instances:ComponentInstance[]=reuse.map(row=>{
    const entry=selected.get(row.componentKey);if(!entry)throw new Error('重建素材未包含在本轮组件清单中')
    if(row.x<roi.x-.001||row.y<roi.y-.001||row.x+row.w>roi.x+roi.w+.001||row.y+row.h>roi.y+roi.h+.001)throw new Error('重建素材区域超出原图选区')
    const asset=catalogueAsset(entry,row.parameters),root=rootContainer(asset.figure)
    if(asset.figure.containers.some(c=>c.dataChart))throw new Error('素材辅助重建不能替换数据图表，请使用原始数据选图')
    const scale=Math.min(row.w*record.scale/root.width,row.h*record.scale/root.height)
    if(scale<.1||scale>4)throw new Error('重建素材等比放置比例超出 0.1–4，请调整原图区域或选择其他素材')
    const x=record.origin.x+(row.x-roi.x)*record.scale+(row.w*record.scale-root.width*scale)/2,y=record.origin.y+(row.y-roi.y)*record.scale+(row.h*record.scale-root.height*scale)/2
    return{id:row.id,componentKey:row.componentKey,parentId:'stage',x,y,scale,keepAppearance:true,...(row.parameters?{parameters:row.parameters}:{}),...(row.labels?{labels:row.labels}:{})}
  })
  const result=composeCatalogue(base,entries,instances,[])
  for(const row of reuse){
    const group=result.figure.containers.find(c=>c.id===row.id)!,entry=selected.get(row.componentKey)!,asset=catalogueAsset(entry,row.parameters)
    const region={x:row.x/record.sourceWidth,y:row.y/record.sourceHeight,width:row.w/record.sourceWidth,height:row.h/record.sourceHeight}
    group.evidence=referenceSource(reference,region)
    const tile=preview?.tiles.find(t=>t.key===row.componentKey);if(preview&&!tile)throw new Error('组件图谱没有本次复用的素材格')
    group.reconstructionReuse=reconstructionReuseRecordSchema.parse({version:1,...(preview&&tile?{cataloguePreview:{snapshotSha256:preview.snapshotSha256,sha256:preview.sha256,tile:tile.index}}:{}),componentKey:row.componentKey,assetId:asset.id,assetName:asset.name,revision:asset.updatedAt,referenceSha256:reference.sha256,region,reason:row.reason,differences:clone(row.differences)})
  }
  return{figure:parseDocument(result.figure),used:result.used,nodeAliases:result.nodeAliases}
}
