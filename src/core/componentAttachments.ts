import {parseDocument,type FigureDocument} from './model.ts'
import {catalogueAsset,catalogueKey,type CatalogueEntry} from './catalogue.ts'
import {attachmentAnchorInventory,setPathEndpointBinding} from './paths.ts'
import type {ComponentAttachment} from './componentAttachmentContract.ts'

/** Resolve declared source aliases only; whole-candidate validation keeps attachment changes atomic. */
export function attachComponentLeaders(figure:FigureDocument,entries:CatalogueEntry[],instances:{id:string;componentKey:string}[],aliases:Record<string,Record<string,string>>,attachments:ComponentAttachment[],pathAliases:Record<string,string>){
  if(new Set(attachments.map(a=>`${a.pathId}:${a.end}`)).size!==attachments.length)throw new Error('同一个引线端点不能重复绑定')
  for(const attachment of attachments){
    const sourceId=pathAliases[attachment.pathId],node=sourceId&&figure.nodes.find(n=>n.id===sourceId),instance=instances.find(r=>r.id===attachment.instanceId),targetId=aliases[attachment.instanceId]?.[attachment.nodeId]
    if(!node||!node.path||node.chart?.key||!instance||!targetId)throw new Error('引线绑定须引用本轮底图路径和已复用组件的源图元')
    const entry=entries.find(e=>catalogueKey(e)===instance.componentKey)!,anchors=attachmentAnchorInventory(catalogueAsset(entry).figure).get(attachment.nodeId)
    if(!anchors?.some(a=>a.index===attachment.anchorIndex))throw new Error('引线绑定的目标锚点不在本轮可用目录中')
    setPathEndpointBinding(figure,node.id,attachment.end,targetId,attachment.anchorIndex,attachment.reason)
  }
  return parseDocument(figure)
}
