import {xmlChildren,type DrawioPage,type DrawioXmlOptions,drawioXml} from './drawioDocument.ts'
import {drawioEscape as esc,drawioNumber as number,drawioLabelSvg,drawioEdgeLabelPoint,type DrawioEdgeLabel} from './drawioLabels.ts'
import {transform,parseTransform,type Affine,type Point} from './affine.ts'
import type {Rect} from './geometry.ts'
import type {MeasureText} from './textGeometry.ts'
import {inspectSvg} from './svgImport.ts'
import {drawioGradientVector} from './drawioGradient.ts'
export interface DrawioCell {id:string;alias:string;label:string;style:Record<string,string>;geometry:Element|null;parent?:DrawioCell;parentId?:string;children:DrawioCell[];box:Rect;vertex:boolean;edge:boolean;visible:boolean;rotation:number;source?:string;target?:string;anchor:string;shape:string;matrix:Affine}
export interface DrawioConnection {alias:string;source?:{alias:string;point:Point};target?:{alias:string;point:Point};automatic:boolean;curved:boolean;label?:{geometry:DrawioEdgeLabel;point:Point}}
export interface DrawioSvg {source:string;page:DrawioPage;cells:DrawioCell[];connections:DrawioConnection[];warnings:string[];fonts:string[]}
function cellStyle(raw:string){
  const result:Record<string,string>={}
  const tokens=raw.split(';')
  for(let i=0;i<tokens.length;i++){let token=tokens[i]!;if(token.startsWith('image=data:image/svg+xml')&&tokens[i+1]?.startsWith('base64,'))token+=`;${tokens[++i]}`;if(!token.trim())continue;const index=token.indexOf('=');if(index<0){if(['ellipse','rhombus','rectangle','text','group','swimlane','triangle','hexagon','parallelogram','trapezoid','cylinder'].includes(token))result.shape=token;else if(!['defaultVertex','defaultEdge'].includes(token))throw new Error(`不支持 draw.io 命名样式 ${token.slice(0,80)}`)}else result[token.slice(0,index)]=token.slice(index+1)}
  for(const key of ['shadow','glass','sketch','flipH','flipV','multiple','placeholder','placeholders'])if(result[key]==='1')throw new Error(`draw.io ${key} 效果暂不支持，请先导出展开后的 SVG`)
  if(result.opacityGroup==='1')throw new Error('draw.io 整体合成透明度请先展开为 SVG')
  if(result.imageBackground&&result.imageBackground!=='none')throw new Error('draw.io 图片背景暂不支持')
  return result
}
const point=(element:Element|undefined):Point=>({x:number(element?.getAttribute('x')??undefined),y:number(element?.getAttribute('y')??undefined)})
const center=(box:Rect)=>({x:box.x+box.width/2,y:box.y+box.height/2})
function terminal(cell:DrawioCell|undefined,other:Point,style:Record<string,string>,prefix:'exit'|'entry'){
  if(!cell)return undefined
  const box=cell.box,explicit=style[`${prefix}X`]!==undefined||style[`${prefix}Y`]!==undefined
  if(explicit&&(style[`${prefix}X`]===undefined||style[`${prefix}Y`]===undefined))throw new Error('draw.io 连接比例坐标必须成对提供')
  const cx=box.x+box.width/2,cy=box.y+box.height/2
  let p=explicit?{x:box.x+number(style[`${prefix}X`])*box.width,y:box.y+number(style[`${prefix}Y`])*box.height}:transform(other,parseTransform(`rotate(${-cell.rotation} ${cx} ${cy})`))
  const dx=p.x-cx,dy=p.y-cy
  if((!explicit||style[`${prefix}Perimeter`]!=='0')&&(dx||dy)){
    const factor=cell.shape==='ellipse'?1/Math.hypot(dx/(box.width/2),dy/(box.height/2)):cell.shape==='rhombus'?1/(Math.abs(dx)/(box.width/2)+Math.abs(dy)/(box.height/2)):1/Math.max(Math.abs(dx)/(box.width/2),Math.abs(dy)/(box.height/2))
    p={x:cx+dx*factor,y:cy+dy*factor}
  }
  p.x+=number(style[`${prefix}Dx`]);p.y+=number(style[`${prefix}Dy`])
  return transform(p,cell.matrix)
}
function paint(style:Record<string,string>,fillOverride?:string){
  const width=number(style.strokeWidth,1),fill=fillOverride??(style.fillColor||'#ffffff'),stroke=width===0?'none':style.strokeColor||'#000000',alpha=number(style.opacity,100)/100
  if(width<0)throw new Error('draw.io 线宽不能为负数')
  const dash=style.dashed==='1'?(style.dashPattern||'3 3').split(/[ ,]+/).map(value=>number(value)*width).join(' '):''
  return` fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="${width}" fill-opacity="${alpha*number(style.fillOpacity,100)/100}" stroke-opacity="${alpha*number(style.strokeOpacity,100)/100}"${dash?` stroke-dasharray="${dash}"`:''}`
}
function embeddedSvg(raw:string,cell:DrawioCell,options:DrawioXmlOptions){
  if(!raw.startsWith('data:image/svg+xml,' )&&!raw.startsWith('data:image/svg+xml;base64,'))throw new Error('draw.io 图片只支持内嵌 SVG；位图和外部图片请作为参考图导入')
  let source:string
  try{const comma=raw.indexOf(',');source=raw.slice(0,comma).endsWith(';base64')?new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(raw.slice(comma+1)),char=>char.charCodeAt(0))):decodeURIComponent(raw.slice(comma+1))}catch{throw new Error('draw.io 内嵌 SVG 编码无效')}
  inspectSvg(source,options.parseXml)
  const doc=drawioXml(source,options),root=doc.documentElement
  if(root.localName!=='svg'||doc.getElementsByTagName('style').length)throw new Error('draw.io 内嵌 SVG 须使用展示属性或行内样式，不支持独立样式表')
  // Empty caption clips emitted by vector exporters carry no visible content.
  // Keep rejecting every clip that actually contains graphics or text.
  for(const el of Array.from(doc.getElementsByTagName('text')))if(el.textContent==='')el.parentNode?.removeChild(el)
  for(const el of Array.from(doc.getElementsByTagName('g')).reverse())if(el.hasAttribute('clip-path')&&xmlChildren(el).every(child=>['title','desc','defs'].includes(child.localName)))el.parentNode?.removeChild(el)
  const ids=new Map<string,string>();for(const el of Array.from(doc.getElementsByTagName('*'))){const id=el.getAttribute('id');if(id){if(ids.has(id))throw new Error('内嵌 SVG 对象 ID 重复');ids.set(id,`${cell.alias}-svg-${ids.size}`)}}
  for(const el of Array.from(doc.getElementsByTagName('*'))){const id=el.getAttribute('id');if(id)el.setAttribute('id',ids.get(id)!);for(const attr of Array.from(el.attributes)){let value=attr.value;if((attr.name==='href'||attr.name==='xlink:href')&&value.startsWith('#'))value=`#${ids.get(value.slice(1))??value.slice(1)}`;value=value.replace(/url\(\s*#([^\s)]+)\s*\)/g,(_,id:string)=>`url(#${ids.get(id)??id})`);if(value!==attr.value)el.setAttribute(attr.name,value)}}
  for(const [key,value]of Object.entries({x:cell.box.x,y:cell.box.y,width:cell.box.width,height:cell.box.height,preserveAspectRatio:cell.style.imageAspect==='0'?'none':'xMidYMid meet'}))root.setAttribute(key,String(value))
  if(cell.rotation)root.setAttribute('transform',`rotate(${cell.rotation} ${center(cell.box).x} ${center(cell.box).y})`)
  const svg=options.serializeXml?options.serializeXml(root):new XMLSerializer().serializeToString(root),opacity=number(cell.style.opacity,100)/100
  return opacity===1?svg:`<g opacity="${opacity}">${svg}</g>`
}
export function drawioPageSvg(page:DrawioPage,options:DrawioXmlOptions&{measure?:MeasureText}={}):DrawioSvg{
  const graphRoot=xmlChildren(page.model).find(element=>element.localName==='root')!,cells:DrawioCell[]=[],map=new Map<string,DrawioCell>(),warnings=new Set<string>(),connections:DrawioConnection[]=[],markers:string[]=[]
  for(const element of xmlChildren(graphRoot)){
    const wrapped=element.localName==='mxCell'?null:element
    if(wrapped&&!['object','UserObject'].includes(wrapped.localName))throw new Error(`不支持 draw.io 对象包装 ${wrapped.localName}`)
    const el=wrapped?xmlChildren(wrapped).find(child=>child.localName==='mxCell'):element
    if(!el)throw new Error('draw.io 对象缺少 mxCell')
    const id=wrapped?.getAttribute('id')||el.getAttribute('id')||'';if(!id||id.length>200||map.has(id))throw new Error('draw.io 对象 ID 缺失、重复或过长')
    const style=cellStyle(el.getAttribute('style')??''),geometry=xmlChildren(el).find(child=>child.localName==='mxGeometry')??null
    const cell:DrawioCell={id,alias:`drawio-cell-${cells.length}`,label:wrapped?.getAttribute('label')??el.getAttribute('value')??'',style,geometry,children:[],box:{x:0,y:0,width:0,height:0},vertex:el.getAttribute('vertex')==='1',edge:el.getAttribute('edge')==='1',visible:el.getAttribute('visible')!=='0',rotation:number(style.rotation),source:el.getAttribute('source')||undefined,target:el.getAttribute('target')||undefined,anchor:'',shape:style.shape??'rectangle',matrix:[1,0,0,1,0,0]}
    if(el.hasAttribute('parent'))cell.parentId=el.getAttribute('parent')!
    if(cell.vertex&&cell.edge)throw new Error('draw.io 对象不能同时是图形与连线')
    if(cell.edge&&style.shape&&!['connector','line'].includes(style.shape))throw new Error('draw.io 宽箭头等特殊连接形状请先展开为 SVG')
    if(wrapped?.getAttribute('placeholders')==='1'||el.getAttribute('placeholders')==='1')throw new Error('draw.io 数据占位标签请先转为实际文字')
    if(style.noLabel==='1')cell.label=''
    if(style.image&&cell.shape!=='image')throw new Error('draw.io 带图片的标签形状暂不支持，请先拆成独立 SVG 图像')
    if(el.getAttribute('collapsed')==='1')throw new Error('draw.io 折叠容器请先展开后导入')
    cells.push(cell);map.set(id,cell)
  }
  if(cells.length>4096)throw new Error('draw.io 对象超过 4096 个，请选择较小文件')
  for(const cell of cells){if(cell.parentId!==undefined){const parent=map.get(cell.parentId);if(!parent)throw new Error(`draw.io 父对象不存在：${cell.id}`);cell.parent=parent;parent.children.push(cell)}}
  const resolved=new Set<string>(),active=new Set<string>()
  function resolve(cell:DrawioCell,depth=0){
    if(resolved.has(cell.id))return;if(active.has(cell.id)||depth>16)throw new Error('draw.io 容器引用循环或层级过深');active.add(cell.id);if(cell.parent)resolve(cell.parent,depth+1)
    cell.visible=cell.visible&&(cell.parent?.visible??true)
    if(cell.vertex&&cell.parent?.edge)throw new Error('draw.io 独立连线标签请先改为连线文字或普通独立文字')
    const g=cell.geometry,parent=cell.parent?.box??{x:0,y:0,width:0,height:0},relative=g?.getAttribute('relative')==='1',offset=point(g?xmlChildren(g).find(el=>el.localName==='mxPoint'&&el.getAttribute('as')==='offset'):undefined)
    cell.box={x:parent.x+number(g?.getAttribute('x')??undefined)*(relative&&cell.vertex?parent.width:1)+(relative&&cell.vertex?offset.x:0),y:parent.y+number(g?.getAttribute('y')??undefined)*(relative&&cell.vertex?parent.height:1)+(relative&&cell.vertex?offset.y:0),width:number(g?.getAttribute('width')??undefined),height:number(g?.getAttribute('height')??undefined)}
    if(cell.vertex&&(!g||cell.box.width<=0||cell.box.height<=0))throw new Error(`draw.io 图形尺寸无效：${cell.id}`)
    const mid=center(cell.box);cell.matrix=parseTransform(`rotate(${cell.rotation} ${mid.x} ${mid.y})`);active.delete(cell.id);resolved.add(cell.id)
  }
  cells.forEach(cell=>resolve(cell))
  if(cells.filter(cell=>!cell.parent).length!==1)throw new Error('draw.io 必须只有一个根对象')
  const terminals=new Set(cells.filter(cell=>cell.edge).flatMap(cell=>[cell.source,cell.target].filter((id):id is string=>!!id)))
  function gradientFill(cell:DrawioCell,box:Rect){
    const s=cell.style,fill=s.fillColor||'#ffffff'
    if(!s.gradientColor||s.gradientColor==='none'||fill==='none')return fill
    if(['group','text','image'].includes(cell.shape))return fill
    const vector=drawioGradientVector(s.gradientDirection,s.direction),id=`${cell.alias}-gradient`,horizontal=vector[0]!==0,reverse=vector[2]===1
    const start={x:box.x+(horizontal&&reverse?box.width:0),y:box.y+(!horizontal&&reverse?box.height:0)},end={x:box.x+(horizontal&&!reverse?box.width:0),y:box.y+(!horizontal&&!reverse?box.height:0)}
    markers.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}"><stop offset="0" stop-color="${esc(fill)}"/><stop offset="1" stop-color="${esc(s.gradientColor)}"/></linearGradient>`)
    return`url(#${id})`
  }
  function vertex(cell:DrawioCell){
    const b=cell.box,s=cell.style,mid=center(b),rotation=cell.rotation?`rotate(${cell.rotation} ${mid.x} ${mid.y})`:'',transformAttr=rotation?` transform="${rotation}"`:'',id=`${cell.alias}-shape`,start=Math.min(b.height,Math.max(0,number(s.startSize,40))),gradientBox=cell.shape==='swimlane'?{...b,height:start}:b,attrs=` id="${id}"${paint(s,gradientFill(cell,gradientBox))}${transformAttr}`
    let body='',custom=false
    if(cell.shape==='group'){custom=true}
    else if(cell.shape==='swimlane'&&s.gradientColor&&s.gradientColor!=='none'&&s.fillColor!=='none'){
      if(s.horizontal==='0'||s.direction&&s.direction!=='east')throw new Error('draw.io 纵向或改变方向的渐变泳道请先展开为 SVG')
      if(s.separatorColor&&s.separatorColor!=='none')throw new Error('draw.io 泳道分隔线请先展开为 SVG')
      const raw=s.absoluteArcSize==='1'?Math.min(b.width/2,b.height/2,number(s.arcSize,20)/2):start*number(s.arcSize,15)/100*3,r=s.rounded==='1'?Math.max(0,Math.min(b.height-start,start,raw)):0,x=b.x,y=b.y,w=b.width,h=b.height
      body=`<path${attrs} d="M${x+w} ${y+start}V${y+r}Q${x+w} ${y} ${x+w-Math.min(w/2,r)} ${y}H${x+Math.min(w/2,r)}Q${x} ${y} ${x} ${y+r}V${y+start}"/>`
      if(start<h)body+=`<path id="${cell.alias}-body" d="M${x} ${y+start}V${y+h-r}Q${x} ${y+h} ${x+Math.min(w/2,r)} ${y+h}H${x+w-Math.min(w/2,r)}Q${x+w} ${y+h} ${x+w} ${y+h-r}V${y+start}"${paint({...s,fillColor:s.swimlaneFillColor||'none'})}${transformAttr}/>`
      if(s.swimlaneLine!=='0')body+=`<path d="M${x} ${y+start}H${x+w}"${paint({...s,fillColor:'none'})}${transformAttr}/>`
      custom=true
    }else if(['rectangle','label'].includes(cell.shape)||cell.shape==='swimlane'){
      const radius=s.rounded==='1'?(s.absoluteArcSize==='1'?number(s.arcSize,20)/2:Math.min(b.width,b.height)*number(s.arcSize,15)/100):0
      body=`<rect${attrs} x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${radius}"/>`
      if(cell.shape==='swimlane'){const start=number(s.startSize,30);if(s.horizontal==='0')throw new Error('draw.io 纵向泳道请先展开为普通形状');body+=`<path d="M${b.x} ${b.y+start}H${b.x+b.width}"${paint({...s,fillColor:'none'})}${transformAttr}/>`}
    }else if(cell.shape==='ellipse')body=`<ellipse${attrs} cx="${mid.x}" cy="${mid.y}" rx="${b.width/2}" ry="${b.height/2}"/>`
    else if(cell.shape==='text'){/* Text cells render their label below without a surrounding shape. */}
    else if(cell.shape==='image'){body=embeddedSvg(s.image??'',cell,options);custom=true}
    else{
      const points=cell.shape==='rhombus'?[[.5,0],[1,.5],[.5,1],[0,.5]]:cell.shape==='triangle'?[[0,0],[1,.5],[0,1]]:cell.shape==='hexagon'?[[.25,0],[.75,0],[1,.5],[.75,1],[.25,1],[0,.5]]:cell.shape==='parallelogram'?[[.2,0],[1,0],[.8,1],[0,1]]:cell.shape==='trapezoid'?[[.2,0],[.8,0],[1,1],[0,1]]:undefined
      if(points){if(s.direction&&s.direction!=='east')throw new Error('draw.io 此形状的 direction 暂不支持，请先旋转为明确几何');body=`<polygon${attrs} points="${points.map(([x,y])=>`${b.x+x!*b.width},${b.y+y!*b.height}`).join(' ')}"/>`;custom=cell.shape!=='rhombus'}
      else if(cell.shape==='cylinder'){
        const ry=Math.min(12,b.height/6);body=`<path${attrs} d="M${b.x} ${b.y+ry}C${b.x} ${b.y-ry/3} ${b.x+b.width} ${b.y-ry/3} ${b.x+b.width} ${b.y+ry}V${b.y+b.height-ry}C${b.x+b.width} ${b.y+b.height+ry/3} ${b.x} ${b.y+b.height+ry/3} ${b.x} ${b.y+b.height-ry}Z"/><path d="M${b.x} ${b.y+ry}C${b.x} ${b.y+ry*7/3} ${b.x+b.width} ${b.y+ry*7/3} ${b.x+b.width} ${b.y+ry}"${paint({...s,fillColor:'none'})}${transformAttr}/>`;custom=true
      }else throw new Error(`暂不支持 draw.io 形状 ${cell.shape}（${cell.id}），请先在源编辑器展开为 SVG`)
    }
    const labelBox={...b,...(cell.shape==='swimlane'?{height:number(s.startSize,30)}:{})},offset=cell.geometry?point(xmlChildren(cell.geometry).find(el=>el.getAttribute('as')==='offset')):{x:0,y:0}
    if(cell.geometry?.getAttribute('relative')!=='1'){labelBox.x+=offset.x;labelBox.y+=offset.y}
    const label=drawioLabelSvg(cell.label,s,labelBox,`${cell.alias}-label`,options,rotation)
    if((cell.rotation||custom||cell.shape==='text')&&(cell.shape==='group'||terminals.has(cell.id))){
      const corners=[[b.x,b.y],[b.x+b.width,b.y],[b.x+b.width,b.y+b.height],[b.x,b.y+b.height]].map(([x,y])=>transform({x:x!,y:y!},cell.matrix)),xs=corners.map(p=>p.x),ys=corners.map(p=>p.y)
      cell.anchor=`${cell.alias}-anchor`;body+=`<rect id="${cell.anchor}" x="${Math.min(...xs)}" y="${Math.min(...ys)}" width="${Math.max(...xs)-Math.min(...xs)}" height="${Math.max(...ys)-Math.min(...ys)}" fill="none" stroke="none" opacity="0"/>`
    }else cell.anchor=id
    return body+label
  }
  function edge(cell:DrawioCell){
    if(!cell.geometry)throw new Error('draw.io 连线缺少几何')
    if(cell.style.startArrow&&cell.style.startArrow!=='none')throw new Error('draw.io 起点 / 双向箭头暂不支持，请先拆分或展开为 SVG')
    const s=cell.style,parent=cell.parent?.box??{x:0,y:0,width:0,height:0},source=cell.source?map.get(cell.source):undefined,target=cell.target?map.get(cell.target):undefined
    if(cell.source&&!source||cell.target&&!target||source&&!source.vertex||target&&!target.vertex)throw new Error(`draw.io 连线引用了不存在的图形：${cell.id}`)
    const points=xmlChildren(cell.geometry),rawStart=points.find(el=>el.getAttribute('as')==='sourcePoint'),rawEnd=points.find(el=>el.getAttribute('as')==='targetPoint'),origin=(el:Element|undefined)=>{const p=point(el);return{x:parent.x+p.x,y:parent.y+p.y}}
    if(!source&&!rawStart||!target&&!rawEnd)throw new Error('draw.io 未绑定的连线须给定两个端点')
    const controls=points.find(el=>el.localName==='Array'&&el.getAttribute('as')==='points'),middle=controls?xmlChildren(controls).map(el=>origin(el)):[]
    if(source===target&&source&&!middle.length)throw new Error('draw.io 自环请先添加明确的控制点')
    const from=source?terminal(source,middle[0]??(target?transform(center(target.box),target.matrix):origin(rawEnd)),s,'exit')!:origin(rawStart),to=target?terminal(target,middle.at(-1)??(source?transform(center(source.box),source.matrix):origin(rawStart)),s,'entry')!:origin(rawEnd)
    const automatic=s.noEdgeStyle!=='1'&&!middle.length&&['orthogonalEdgeStyle','elbowEdgeStyle'].includes(s.edgeStyle??''),curved=s.curved==='1'
    if(s.edgeStyle&&!['orthogonalEdgeStyle','elbowEdgeStyle','segmentEdgeStyle','none'].includes(s.edgeStyle))throw new Error(`draw.io 自动路由 ${s.edgeStyle} 暂不支持`)
    if(curved&&!middle.length)throw new Error('draw.io 自动曲线请先给定控制点或展开为 SVG')
    const route=[from,...middle,to];let d=`M${from.x} ${from.y}`
    if(curved&&middle.length){for(let i=1;i<route.length-1;i++){const p=route[i]!,next=route[i+1]!,end=i===route.length-2?next:{x:(p.x+next.x)/2,y:(p.y+next.y)/2};d+=`Q${p.x} ${p.y} ${end.x} ${end.y}`}}
    else d+=route.slice(1).map(p=>`L${p.x} ${p.y}`).join('')
    const arrow=s.endArrow??'classic';if(!['none','classic','classicThin','block','blockThin','open','openThin'].includes(arrow))throw new Error(`draw.io 箭头 ${arrow} 暂不支持`)
    let marker=''
    if(arrow!=='none'){const id=`${cell.alias}-arrow`,open=arrow.startsWith('open')||s.endFill==='0';markers.push(`<marker id="${id}" markerWidth="8" markerHeight="8" viewBox="0 0 8 8" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8${open?'':'Z'}" fill="${open?'none':esc(s.strokeColor||'#000000')}" stroke="${esc(s.strokeColor||'#000000')}"/></marker>`);marker=` marker-end="url(#${id})"`}
    const connection:DrawioConnection={alias:cell.alias,...(source?{source:{alias:source.alias,point:from}}:{}),...(target?{target:{alias:target.alias,point:to}}:{}),automatic,curved};connections.push(connection)
    let label=''
    if(cell.label){
      if(curved)throw new Error('draw.io 曲线上的文字位置暂不支持，请先转为独立文字')
      const geometry:DrawioEdgeLabel={relative:cell.geometry.getAttribute('relative')==='1',x:number(cell.geometry.getAttribute('x')??undefined),y:number(cell.geometry.getAttribute('y')??undefined),offset:point(points.find(el=>el.getAttribute('as')==='offset'))},p=drawioEdgeLabelPoint(route,geometry),width=number(s.labelWidth,200)
      if(width<=0)throw new Error('draw.io 连线文字宽度须为正数')
      connection.label={geometry,point:p}
      label=drawioLabelSvg(cell.label,{...s,align:'center',verticalAlign:'middle',whiteSpace:s.whiteSpace??'nowrap'},{x:p.x-width/2,y:p.y-10,width,height:20},`${cell.alias}-label`,options)
    }
    return`<path id="${cell.alias}-edge" d="${d}"${paint({...s,fillColor:'none'})}${marker}/>${label}`
  }
  // Resolve shape anchor aliases before edges, regardless of XML declaration order.
  const bodies=new Map(cells.filter(cell=>cell.vertex&&cell.visible).map(cell=>[cell.id,vertex(cell)]))
  // Cached bodies keep embedded SVG parsing and text measurement deterministic.
  function renderCached(cell:DrawioCell):string{
    if(!cell.visible)return''
    if(cell.rotation&&cell.children.length)throw new Error('draw.io 旋转容器暂不支持，请先解除该组合旋转')
    const body=cell.edge?edge(cell):cell.vertex?bodies.get(cell.id)!:'',nested=cell.children.map(renderCached).join('')
    if(!body&&!nested)return''
    // Root/default layers and one-object cells are structural XML wrappers;
    // retaining all of them doubles groups on each editable round trip.
    if(!cell.vertex&&!cell.edge&&(!cell.parent||!cell.label)||!nested&&!cell.label&&(!cell.vertex||!terminals.has(cell.id)))return body+nested
    if(cell.shape==='image'&&!nested&&!cell.label&&!terminals.has(cell.id))return body
    return`<g id="${cell.alias}" aria-label="${esc(cell.label.replace(/<[^>]*>/g,' ').trim().slice(0,70)||cell.id)}">${body}${nested}</g>`
  }
  const content=cells.filter(cell=>!cell.parent).map(renderCached).join(''),width=number(page.model.getAttribute('pageWidth')??undefined,1000),height=number(page.model.getAttribute('pageHeight')??undefined,620)
  if(width<=0||height<=0)throw new Error('draw.io 页面尺寸无效')
  if(cells.some(cell=>!cell.visible))warnings.add('隐藏的层与对象未绘制；连接到其边界的端点仍保留位置')
  const source=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${markers.join('')}</defs>${content}</svg>`
  return{source,page,cells,connections,warnings:[...warnings],fonts:[...new Set(cells.filter(cell=>cell.label).map(cell=>cell.style.fontFamily||'Helvetica'))]}
}
