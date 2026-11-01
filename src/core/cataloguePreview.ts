import {catalogueAsset,catalogueKey,catalogueSchema,type CatalogueEntry} from './catalogue.ts'
import {rootContainer} from './model.ts'
import type {CataloguePreviewInfo} from './cataloguePreviewContract.ts'
import {attachmentAnchorInventory} from './paths.ts'

export function cataloguePreviewLayout(entries:CatalogueEntry[]){
  const valid=catalogueSchema.parse(entries);if(!valid.length)throw new Error('组件图谱至少需要一个素材')
  const columns=valid.length===1?1:2
  return{width:columns*800,height:Math.ceil(valid.length/columns)*480,tiles:valid.map((entry,index)=>{const asset=catalogueAsset(entry);return{index:index+1,key:catalogueKey(entry),name:asset.name,assetId:asset.id,revision:asset.updatedAt,x:index%columns*800,y:Math.floor(index/columns)*480,width:800 as const,height:480 as const}})}
}
export function catalogueSnapshotJson(entries:CatalogueEntry[]){
  return JSON.stringify(entries.map(entry=>({key:catalogueKey(entry),asset:catalogueAsset(entry)})),(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0)):value)
}
export function validateCataloguePreviewLayout(entries:CatalogueEntry[],info:CataloguePreviewInfo){
  const expected=cataloguePreviewLayout(entries)
  if(info.width!==expected.width||info.height!==expected.height||JSON.stringify(info.tiles)!==JSON.stringify(expected.tiles))throw new Error('组件图谱目录与本轮素材快照或顺序不符')
}
/** A bounded geometry supplement. Omitted details are explicit; the atlas shows default parameters only. */
export function describeReconstructionCatalogue(entries:CatalogueEntry[]){
  return entries.map((entry,index)=>{const asset=catalogueAsset(entry),root=rootContainer(asset.figure),nodes=asset.figure.nodes.slice(0,80),anchors=attachmentAnchorInventory(asset.figure)
    return{key:catalogueKey(entry),previewTile:index+1,configuration:asset.recipe?.parameters??'saved',root:{width:root.width,height:root.height},style:asset.figure.style,coverage:{totalNodes:asset.figure.nodes.length,detailedNodes:nodes.length,omittedNodes:asset.figure.nodes.length-nodes.length,paths:'anchor/control coordinates omitted; see raster appearance'},containers:asset.figure.containers.map(c=>({id:c.id,parentId:c.parentId,title:c.title,role:c.role,x:c.x,y:c.y,width:c.width,height:c.height,...(c.appearance?{appearance:c.appearance}:{})})),nodes:nodes.map(n=>({id:n.id,parentId:n.parentId,kind:n.kind,label:n.label,x:n.x,y:n.y,width:n.width,height:n.height,...(n.structure?{structure:n.structure}:{}),...(n.socket?{socket:n.socket,interfaceFor:n.interfaceFor}:{}),...(n.textStyle?{textStyle:n.textStyle}:{}),...(n.path?{path:{anchors:n.path.points.length,arrow:n.path.arrow,closed:n.path.points.some(p=>p.close),attachmentAnchors:anchors.get(n.id)??[],omittedAttachmentAnchors:anchors.has(n.id)?n.path.points.length-anchors.get(n.id)!.length:n.path.points.length}}:{})})),edges:asset.figure.edges}
  })
}
