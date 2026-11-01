import {collectionSelectionJson} from '../core/componentCaptureContract'
import {clone,rootContainer} from '../core/model'
import {parseAsset,type ComponentAsset} from '../core/assets'
import {componentSnapshotHash,componentSnapshotJson} from '../core/componentRepository'
import {rasterizeFigure} from '../core/figureRaster'

/** Freeze once. Retries reuse this exact asset and thumbnail rather than rerunning an importer. */
export async function prepareComponentPublish(input:ComponentAsset){
  const asset=clone(parseAsset(input))
  for(const source of asset.sources)if(source.collection){const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(collectionSelectionJson(source.collection))))].map(value=>value.toString(16).padStart(2,'0')).join('');if(hash!==source.collection.selectionSha256)throw new Error('采集选择指纹与来源记录不符')}
  if(new TextEncoder().encode(componentSnapshotJson(asset)).length>2_000_000)throw new Error('规范化组件超过 2 MB，请拆分素材')
  const assetSha256=await componentSnapshotHash(asset),root=rootContainer(asset.figure),{canvas}=await rasterizeFigure(asset.figure,{x:-8,y:-8,width:root.width+16,height:root.height+16},360,220)
  let dataUrl=canvas.toDataURL('image/webp',.82)
  if(dataUrl.length>80_000)dataUrl=canvas.toDataURL('image/webp',.6)
  if(dataUrl.length>80_000)throw new Error('素材缩略图超过容量，请简化预览后保存')
  return{asset,thumbnail:{assetSha256,dataUrl}}
}
export type PreparedComponentPublish=Awaited<ReturnType<typeof prepareComponentPublish>>
