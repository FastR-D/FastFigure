import {importSvg,inspectSvg,type SvgImportOptions} from './svgImport.ts'
import {drawioPageSvg,type DrawioSvg,type DrawioCell} from './drawioSvg.ts'
import {inspectDrawio,type DrawioDocument,type DrawioXmlOptions} from './drawioDocument.ts'
import {transform} from './affine.ts'
import {clone,parseDocument,type FigureNode,type ComponentSource} from './model.ts'
import {parseAsset} from './assets.ts'
import {contentBounds,ancestors,bounds} from './geometry.ts'
import {pathPoints,setPathPoints} from './paths.ts'
import {routeEdge} from './routing.ts'
import {drawioEdgeLabelPoint} from './drawioLabels.ts'
export {inspectDrawio} from './drawioDocument.ts'
export interface DrawioPrepared {drawing:DrawioSvg;inventory:ReturnType<typeof inspectSvg>;pageIndex:number}
export function prepareDrawio(document:DrawioDocument,pageKey:string,options:DrawioXmlOptions={}){
  const index=document.pages.findIndex(page=>page.key===pageKey);if(index<0)throw new Error('请选择 draw.io 页面')
  const drawing=drawioPageSvg(document.pages[index]!,options)
  return{drawing,inventory:inspectSvg(drawing.source,options.parseXml),pageIndex:index}
}
export function importPreparedDrawio(prepared:DrawioPrepared,options:SvgImportOptions){
  const source=prepared.drawing,page=source.page,file={format:'drawio' as const,fileName:options.fileName,sha256:options.sha256,page:{index:prepared.pageIndex,id:page.id,name:page.name}},evidence:ComponentSource={title:options.fileName.slice(0,100),reference:`draw.io 源文件 · ${page.name} · SHA-256 ${options.sha256}`.slice(0,500),file}
  const converted=importSvg(source.source,{...options,preferMetadata:false}),doc=clone(converted.asset.figure),matrix=converted.report.sourceTransform!,warnings=new Set([...source.warnings,...converted.report.warnings.map(warning=>warning.replace('SVG 视框裁切和原始物理尺寸','原页面裁切和物理尺寸'))]),cells=new Map(source.cells.map(cell=>[cell.alias,cell]))
  const find=(name:string)=>doc.nodes.find(node=>node.name===name)
  for(const cell of source.cells){const node=find(`${cell.alias}-shape`);if(node&&cell.shape==='rhombus'&&!cell.rotation){node.kind='diamond';node.label='';delete node.path}}
  const sourceCell=(name:string|undefined):DrawioCell|undefined=>name?cells.get(name.match(/^drawio-cell-\d+/)?.[0]??''):undefined
  const selectedIds=new Set(doc.nodes.flatMap(node=>{const cell=sourceCell(node.name);return cell?[cell.id]:[]})),selectedCells=source.cells.filter(cell=>selectedIds.has(cell.id)),selectedConnections=source.connections.filter(connection=>find(`${connection.alias}-edge`))
  if(selectedCells.some(cell=>cell.label&&cell.style.html==='1'))warnings.add('HTML 标签已转换为独立原生文字；换行与字形位置按字体估算，请核对预览')
  if(selectedConnections.length)warnings.add('箭头采用标准原生样式；自动折线路由由 FastFigure 重算，手工控制点保留')
  if(selectedCells.some(cell=>cell.edge&&cell.style.rounded==='1'))warnings.add('圆角折线按直角折线导入；如需保留精确圆角，请使用展开后的 SVG')
  if(selectedCells.some(cell=>cell.vertex&&!['rectangle','label','ellipse','rhombus','text','group','image'].includes(cell.shape)))warnings.add('扩展形状使用原生轮廓近似；连接按其逻辑边界绑定，请核对预览')
  // SVG groups around an edge describe its paint, not a solid obstacle. Exclude
  // edge-only groups and labels while retaining every real vertex and its body.
  const visiblePaint=(node:FigureNode)=>node.visual?.opacity!==0&&ancestors(doc,node.id).every(id=>doc.containers.find(group=>group.id===id)?.opacity!==0)&&(node.kind==='text'?!!node.label&&node.textStyle?.color!=='none':node.visual?.fill!=='none'&&node.visual?.fillOpacity!==0||node.visual?.stroke!=='none'&&node.visual?.strokeOpacity!==0)
  const bodyNodes=doc.nodes.filter(node=>!sourceCell(node.name)?.edge&&visiblePaint(node))
  let boundEnds=0,unboundEnds=0,rerouted=0
  const side=(node:FigureNode,p:{x:number;y:number})=>{
    const x=(p.x-node.x)/node.width,y=(p.y-node.y)/node.height,directions=['left','right','top','bottom'] as const,distances=[Math.abs(x),Math.abs(1-x),Math.abs(y),Math.abs(1-y)]
    return directions.map((name,i)=>({name,distance:distances[i]!})).sort((a,b)=>a.distance-b.distance)[0]!.name
  }
  for(const connection of source.connections){
    const path=find(`${connection.alias}-edge`);if(!path?.path)continue
    const original=pathPoints(doc,path)
    const bind=(key:'start'|'end',endpoint:typeof connection.source)=>{
      if(!endpoint)return
      const cell=cells.get(endpoint.alias)!,target=find(cell.anchor)
      if(!target||target.kind==='path'||target.kind==='port'){unboundEnds++;return}
      const p=transform(endpoint.point,matrix),x=(p.x-target.x)/target.width,y=(p.y-target.y)/target.height
      if(x<-.000001||x>1.000001||y<-.000001||y>1.000001){unboundEnds++;return}
      path.path![key]={nodeId:target.id,x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y)),note:`draw.io ${key==='start'?'source':'target'} ${cell.id}`.slice(0,240)};boundEnds++
    }
    bind('start',connection.source);bind('end',connection.target)
    if(connection.automatic&&!connection.curved&&path.path.start&&path.path.end){
      const from=doc.nodes.find(node=>node.id===path.path!.start!.nodeId)!,to=doc.nodes.find(node=>node.id===path.path!.end!.nodeId)!,common=ancestors(doc,from.id).find(id=>ancestors(doc,to.id).includes(id))??'stage',parent=doc.containers.find(c=>c.id===common)!
      const nodes=[...bodyNodes,...[from,to].filter(node=>!bodyNodes.includes(node))],parents=new Set(nodes.flatMap(node=>ancestors(doc,node.id))),routingDoc={...doc,nodes,containers:doc.containers.filter(group=>parents.has(group.id))}
      const routed=routeEdge(routingDoc,{id:path.id,source:from.id,target:to.id,sourcePort:side(from,original[0]!),targetPort:side(to,original.at(-1)!),routing:'orthogonal'},{source:original[0]!,target:original.at(-1)!,area:contentBounds(parent)})
      if(routed.status==='clear'){
        setPathPoints(path,routed.points);rerouted++
        if(connection.label){
          const before=transform(connection.label.point,matrix),after=drawioEdgeLabelPoint(routed.points,connection.label.geometry,converted.report.scale)
          for(const label of doc.nodes.filter(node=>node.name?.startsWith(`${connection.alias}-label-`))){label.x+=after.x-before.x;label.y+=after.y-before.y}
        }
      }else warnings.add(`连接 ${cells.get(connection.alias)!.id} 的自动路线受阻，保留原端点直线供核对：${routed.reason??'空间不足'}`)
    }
  }
  if(unboundEnds)warnings.add(`${unboundEnds} 个端点未找到当前范围内可绑定的图形，保留实际位置，后续移动时需手工重绑`)
  if(!doc.nodes.some(visiblePaint))throw new Error('所选 draw.io 范围内没有可见图形或文字')
  for(const group of [...doc.containers].reverse())if(group.id!=='stage'){const objects=[...doc.nodes,...doc.containers].filter(object=>object.parentId===group.id);if(objects.length){const box=bounds(objects);Object.assign(group,{x:box.x-2,y:box.y-2,width:Math.max(5,box.width+4),height:Math.max(5,box.height+4)})}}
  const box=bounds([...doc.nodes,...doc.containers.filter(group=>group.id!=='stage')]);Object.assign(doc.containers[0]!,{width:Math.max(doc.containers[0]!.width,box.x+box.width+16),height:Math.max(doc.containers[0]!.height,box.y+box.height+16)})
  for(const node of doc.nodes){const cell=sourceCell(node.name);node.evidence={...evidence,...(cell?{file:{...file,objectId:cell.id}}:{})}}
  for(const group of doc.containers)group.evidence={...evidence}
  doc.title=`${options.fileName.replace(/\.(drawio|xml|svg)$/i,'')} · ${page.name}`.slice(0,100);doc.containers[0]!.title=doc.title
  const asset=parseAsset({...converted.asset,name:doc.title,figure:parseDocument(doc),description:`从 draw.io「${page.name}」解析的可编辑素材`,tags:['draw.io'],sources:[evidence]})
  return{asset,report:{...converted.report,mode:'drawio' as const,paths:doc.nodes.filter(node=>node.path).length,curves:doc.nodes.filter(node=>node.path?.points.some(point=>point.c1)).length,warnings:[...warnings],page:{index:prepared.pageIndex,id:page.id,name:page.name},sourceCells:selectedCells.filter(cell=>cell.vertex||cell.edge).length,connections:selectedConnections.length,boundEnds,unboundEnds,rerouted}}
}
export async function importDrawio(source:string,options:SvgImportOptions&DrawioXmlOptions&{pageKey?:string}){
  const document=await inspectDrawio(source,options)
  if(!options.pageKey&&document.pages.length!==1)throw new Error('draw.io 有多个页面，请明确选择页面后导入')
  return importPreparedDrawio(prepareDrawio(document,options.pageKey??document.pages[0]!.key,options),options)
}
