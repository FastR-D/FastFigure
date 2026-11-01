import {snapshotEdgeWaypoints,reframeEdgeWaypoints} from './edgeWaypoints.ts'
import {routeFigure} from './routing.ts'
import {checkFigureText} from './figureTextCheck.ts'
import {captureComponent,parseAsset} from './assets.ts'
import {normalizeComponentMetadata,type ComponentMetadataDraft} from './componentMetadata.ts'
import {componentCollectionSchema,collectionSelectionJson,type ComponentCaptureOrigin} from './componentCaptureContract.ts'
import {allObjects,ancestors,bounds,childrenOf,descendants,resolveStyle,topLevelSelection} from './geometry.ts'
import {clone,parseDocument,type FigureDocument,type FigureContainer} from './model.ts'
import {syncBindings} from './paths.ts'
const digest=async(text:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(value=>value.toString(16).padStart(2,'0')).join('')
export const captureFigureJson=(figure:FigureDocument)=>JSON.stringify(figure,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).filter(([,value])=>value!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0)):value)

export function inspectCapturedFigure(figure:FigureDocument){
  const blockedEdgeIds=[...routeFigure(figure)].filter(([,route])=>route.status==='blocked').map(([id])=>id),textCheck=checkFigureText(figure)
  return{blockedEdgeIds,textCheck,warnings:[...(blockedEdgeIds.length?[`程序发现 ${blockedEdgeIds.length} 条连接无法完整避障，请核对端口与留白。`]:[]),...(textCheck.issues.length?[`程序发现 ${textCheck.issues.length} 项文字适配问题，请对照原生预览检查。`]:[])]}
}

/** Extract frozen native objects. Unselected ancestors carry styles, never their old frames or managed graph records. */
export function prepareObjectSelection(input:FigureDocument,requestedIds:string[],draft:ComponentMetadataDraft){
  const source=parseDocument(clone(input)),metadata=normalizeComponentMetadata(draft),objects=allObjects(source),requested=[...new Set(requestedIds)]
  if(!requested.length||requested.some(id=>!objects.some(object=>object.id===id)))throw new Error('请选择存在的原生对象；连线由两端选择自动保留')
  const roots=topLevelSelection(source,requested),kept=new Set(roots.flatMap(object=>[object.id,...('kind'in object?[]:descendants(source,object.id).map(child=>child.id))]))
  for(const node of source.nodes)if(node.interfaceFor&&kept.has(node.interfaceFor))kept.add(node.id)
  for(const node of source.nodes.filter(node=>kept.has(node.id))){
    if(node.interfaceFor&&!kept.has(node.interfaceFor))throw new Error('命名接口请连同所属容器一起采集')
    const chart=ancestors(source,node.id).find(id=>source.containers.find(container=>container.id===id)?.dataChart)
    if(chart&&!kept.has(chart))throw new Error('数据图表请采集完整图表容器，保留原始数据与统计口径')
  }
  if(!source.nodes.some(node=>kept.has(node.id)&&node.kind!=='port'))throw new Error('采集范围至少需要一个可见图元')
  const common=roots.length===1&&!('kind'in roots[0]!)?roots[0]!.id:ancestors(source,roots[0]!.id).find(id=>roots.every(object=>ancestors(source,object.id).includes(id)))!
  const below=(id:string)=>id===common||ancestors(source,id).includes(common),scopeIds=source.containers.filter(container=>!kept.has(container.id)&&below(container.id)&&[...kept].some(id=>ancestors(source,id).includes(container.id))).map(container=>container.id)
  const scopes=new Set(scopeIds),containerIds=new Set([...kept,...scopeIds,...ancestors(source,common)]),work=clone(source)
  const pins=snapshotEdgeWaypoints(work)
  syncBindings(work)
  const detachedEndpoints:{nodeId:string;end:'start'|'end'}[]=[]
  for(const node of work.nodes.filter(node=>kept.has(node.id)))for(const end of ['start','end'] as const)if(node.path?.[end]&&!kept.has(node.path[end]!.nodeId)){detachedEndpoints.push({nodeId:node.id,end});delete node.path[end]}
  const omittedEdgeIds=source.edges.filter(edge=>(kept.has(edge.source)||kept.has(edge.target))&&!(kept.has(edge.source)&&kept.has(edge.target))).map(edge=>edge.id)
  work.nodes=work.nodes.filter(node=>kept.has(node.id));work.edges=work.edges.filter(edge=>kept.has(edge.source)&&kept.has(edge.target));work.containers=work.containers.filter(container=>containerIds.has(container.id))
  work.containers=work.containers.map(container=>{
    if(!scopes.has(container.id))return container
    const {id,parentId,title,x,y,width,height,appearance,opacity,metricScale,evidence,component}=container
    return{id,parentId,title,x,y,width,height,role:'component',visual:{fill:'none',stroke:'none'},...(appearance?{appearance}:{}),...(opacity!==undefined?{opacity}:{}),...(metricScale?{metricScale}:{}),...(evidence?{evidence}:{}),...(component?{component}:{})} as FigureContainer
  })
  for(const container of [...work.containers].sort((a,b)=>ancestors(source,b.id).length-ancestors(source,a.id).length))if(scopes.has(container.id)){
    const items=childrenOf(work,container.id).filter(object=>!('interfaceFor'in object&&object.interfaceFor===container.id)),routePoints=work.edges.filter(e=>e.manualRoute?.containerId===container.id).flatMap(e=>pins.get(e.id)?.points??[]),box=bounds([...items,...routePoints.map(p=>({...p,width:0,height:0}))]),scale=container.metricScale??1,padding=2*scale
    Object.assign(container,{x:box.x-padding,y:box.y-padding,width:Math.max(5*scale,box.width+padding*2),height:Math.max(5*scale,box.height+padding*2)})
  }
  const root=work.containers.find(container=>container.id===common)!,outerOpacity=ancestors(source,common).reduce((opacity,id)=>opacity*(source.containers.find(container=>container.id===id)?.opacity??1),1)
  let captureId=common
  if(outerOpacity!==1){
    if(root.role==='component'&&root.visual?.fill==='none'&&root.visual.stroke==='none')root.opacity=(root.opacity??1)*outerOpacity
    else{const padding=2*(root.metricScale??1),wrapper:FigureContainer={id:`capture-${crypto.randomUUID()}`,parentId:root.parentId,title:metadata.name,role:'component',x:root.x-padding,y:root.y-padding,width:root.width+padding*2,height:root.height+padding*2,visual:{fill:'none',stroke:'none'},opacity:outerOpacity,...(root.metricScale?{metricScale:root.metricScale}:{})};work.containers.push(wrapper);root.parentId=wrapper.id;captureId=wrapper.id}
  }
  // The scope root inherits the complete old style, including palette-role mappings.
  root.appearance=source.containers.find(container=>container.id===common)?.appearance
  reframeEdgeWaypoints(work,pins)
  const asset=captureComponent(work,captureId,metadata.name,metadata.description,metadata.tags)
  asset.figure.style=resolveStyle(source,common)
  for(const container of asset.figure.containers)if(scopes.has(container.id)||container.id==='stage'&&scopes.has(common)){delete container.component;delete container.evidence}
  // Selected evidence supplies the fragment's aggregate ROI; style-only ancestors are citation context.
  for(const citation of asset.sources)if(citation.image&&!citation.collection&&!citation.purpose){
    const regions=objects.filter(object=>kept.has(object.id)&&object.evidence?.image?.sha256===citation.image!.sha256).flatMap(object=>object.evidence?.image?[object.evidence.image.region]:[])
    if(regions.length){const x=Math.min(...regions.map(region=>region.x)),y=Math.min(...regions.map(region=>region.y));citation.image.region={x,y,width:Math.max(...regions.map(region=>region.x+region.width))-x,height:Math.max(...regions.map(region=>region.y+region.height))-y}}
  }
  const inspection=inspectCapturedFigure(asset.figure)
  const selection={blockedEdgeIds:inspection.blockedEdgeIds,requestedIds:requested.sort(),objectIds:[...kept].sort(),scopeIds:scopeIds.sort(),omittedEdgeIds:omittedEdgeIds.sort(),detachedEndpoints}
  return{asset,source,metadata,selection,inspection}
}

export async function captureObjectSelection(input:FigureDocument,requestedIds:string[],draft:ComponentMetadataDraft,origin:ComponentCaptureOrigin){
  const {asset,source,metadata,selection,inspection}=prepareObjectSelection(input,requestedIds,draft)
  const {omittedEdgeIds,detachedEndpoints,scopeIds}=selection
  const collection=componentCollectionSchema.parse({version:1,...origin,sourceTitle:source.title,figureSha256:await digest(captureFigureJson(source)),selectionSha256:await digest(collectionSelectionJson(selection)),capturedAt:new Date().toISOString(),...selection})
  const extra=metadata.sources.filter(value=>!asset.sources.some(source=>source.title===value.title&&source.reference===value.reference))
  asset.sources.push(...extra,{title:`${origin.kind==='candidate'?'候选采集':'工程采集'} · ${source.title}`.slice(0,100),reference:`FigureIR SHA-256: ${collection.figureSha256}; selection SHA-256: ${collection.selectionSha256}; ${origin.kind==='candidate'?`候选 ${origin.runId}（${origin.review}）`:'当前工程'}；对象 ${selection.objectIds.length}；忽略边 ${omittedEdgeIds.length}；解除绑定 ${detachedEndpoints.length}。`,collection})
  return{asset:parseAsset(asset),collection,report:{objects:selection.objectIds.length,nodes:asset.figure.nodes.length,containers:asset.figure.containers.length,internalEdges:asset.figure.edges.length,omittedEdgeIds,detachedEndpoints,scopeIds,...inspection}}
}

export function componentCapturePresets(source:FigureDocument){
  const result=source.containers.map(container=>({id:`container:${container.id}`,name:container.id==='stage'?'整张图件':container.title,objectIds:[container.id],note:'保留整个容器、内部对象与命名接口。'}))
  for(const container of source.containers)for(const region of container.reconstruction?.regions??[]){
    const ids=new Set([region.id]);let size=0
    while(size!==ids.size){size=ids.size;for(const child of container.reconstruction!.regions)if(child.parentId&&ids.has(child.parentId))ids.add(child.id)}
    const objectIds=source.nodes.filter(node=>ancestors(source,node.id).includes(container.id)&&node.reconstruction?.owner&&ids.has(node.reconstruction.owner)).map(node=>node.id)
    if(objectIds.length)result.push({id:`region:${container.id}:${region.id}`,name:`描摹分区 · ${region.title||region.id}`,objectIds,note:'选择该分区及子分区的描摹图元；原生复用组可另外选取。'})
  }
  return result
}
