import { createBlank, parseDocument, rootContainer, type FigureContainer, type FigureNode } from './model.ts'
import { captureComponent, parseAsset, type ComponentAsset } from './assets.ts'
import { bounds } from './geometry.ts'
import { parseSvgPath } from './svgPath.ts'
import { multiply, parseTransform, transform, type Affine, type Linear } from './affine.ts'
import { pathCoordinates, setPathPoints } from './paths.ts'
import { cssRules, fontStyle, length, numberList, svgColor, svgStyle, type SvgRule } from './svgStyles.ts'
import { measureText, textBox, type MeasureText } from './textGeometry.ts'
import {svgPaintResolver,svgPathBounds} from './svgGradient.ts'

const svgNamespace='http://www.w3.org/2000/svg',limit=2_000_000
const children=(element:Element)=>Array.from(element.childNodes).filter((n):n is Element=>n.nodeType===1)
const tag=(element:Element)=>element.localName??element.tagName.replace(/^.*:/,'')
function chartMark(element:Element,paint:NonNullable<FigureNode['visual']>,text=false):FigureNode['chart'] {
  const raw=element.getAttribute('data-role'),series=element.getAttribute('data-series')
  if(!raw)return undefined
  const role=['bar','line','area','marker','series'].includes(raw)?'series':['axis','grid','stat','heat','band','annotation','frame'].includes(raw)?raw as NonNullable<FigureNode['chart']>['role']:undefined
  if(!role)return undefined
  const index=series!==null&&/^\d{1,2}$/.test(series)?Number(series):undefined
  const hasSeries=role==='series'&&index!==undefined&&index<=11
  return {role,...(hasSeries?{series:index}:{}),channels:hasSeries?(text?['text']:[...(paint.fill!=='none'?['fill' as const]:[]),...(paint.stroke!=='none'?['stroke' as const]:[])]):[]}
}
export interface SvgImportOptions {fileName:string;sha256:string;group?:string;keepGroups?:boolean;preferMetadata?:boolean;parseXml?:(source:string)=>Document;measure?:MeasureText}
export interface SvgInventory {groups:{key:string;name:string;elements:number}[];hasMetadata:boolean;fonts:string[]}
export interface SvgImportResult {asset:ComponentAsset;report:{mode:'metadata'|'svg';nodes:number;groups:number;paths:number;curves:number;texts:number;scale:number;warnings:string[];fonts:string[];sourceTransform?:Affine}}
function documentOf(source:string,parse?:SvgImportOptions['parseXml']) {
  if(new TextEncoder().encode(source).length>limit)throw new Error('SVG 文件不能超过 2 MB')
  if(/<!DOCTYPE|<!ENTITY/i.test(source)||source.includes('\0'))throw new Error('SVG 含有不支持的文档声明或无效字符')
  const doc=parse?parse(source):new DOMParser().parseFromString(source,'image/svg+xml'),root=doc.documentElement
  if(!root||tag(root)!=='svg'||root.namespaceURI&&root.namespaceURI!==svgNamespace||doc.getElementsByTagName('parsererror').length)throw new Error('请选择完整且格式正确的 SVG 文件')
  const elements=[root,...Array.from(root.getElementsByTagName('*'))]
  if(elements.length>4096)throw new Error('SVG 元素超过 4096 个，请先拆分源文件')
  for(const el of elements){
    const name=tag(el)
    if(['script','foreignObject','image','animate','animateMotion','animateTransform','set','iframe','audio','video'].includes(name))throw new Error(`SVG 含有不支持的 ${name} 内容`)
    for(const attr of Array.from(el.attributes))if(/^on/i.test(attr.localName??attr.name))throw new Error('SVG 事件处理器不能导入')
    for(const attr of ['href','xlink:href']){const ref=el.getAttribute(attr);if(ref&&name!=='a'&&!ref.startsWith('#'))throw new Error('SVG 外部资源引用不能导入')}
  }
  return {doc,root,elements}
}
export function inspectSvg(source:string,parse?:SvgImportOptions['parseXml']):SvgInventory {
  const {elements}=documentOf(source,parse)
  const fonts=new Set<string>()
  for(const el of elements){const values=[el.getAttribute('font-family')??'',...[...(tag(el)==='style'?el.textContent??'':el.getAttribute('style')??'').matchAll(/font-family\s*:\s*([^;}]+)/g)].map(m=>m[1]!)];for(const value of values){const font=value.split(',')[0]!.trim().replace(/^['"]|['"]$/g,'');if(/^[\p{L}\p{N} _.-]{1,80}$/u.test(font))fonts.add(font)}}
  return {groups:elements.flatMap((e,i)=>['g','svg','symbol'].includes(tag(e))&&i>0?[{key:`group-${i}`,name:e.getAttribute('aria-label')||e.getAttribute('id')||`分组 ${i}`,elements:e.getElementsByTagName('*').length}]:[]),hasMetadata:elements.some(e=>tag(e)==='metadata'&&e.textContent?.trim().startsWith('{')),fonts:[...fonts]}
}
function opacity(value:string|undefined) {return Math.max(0,Math.min(1,length(value,1,1,1)))}
function viewport(el:Element,parent:{width:number;height:number},override?:{width:number;height:number}):{matrix:Affine;width:number;height:number} {
  const values=el.hasAttribute('viewBox')?numberList(el.getAttribute('viewBox')!):[]
  if(values.length&&values.length!==4)throw new Error('SVG viewBox 需要 4 个数')
  const width=override?.width??length(el.getAttribute('width'),parent.width,16,values[2]??parent.width),height=override?.height??length(el.getAttribute('height'),parent.height,16,values[3]??parent.height)
  if(width<=0||height<=0||values.length&&(values[2]!<=0||values[3]!<=0))throw new Error('SVG 视图尺寸必须为正数')
  const x=length(el.getAttribute('x'),parent.width),y=length(el.getAttribute('y'),parent.height)
  if(!values.length)return {matrix:[1,0,0,1,x,y],width,height}
  const preserve=(el.getAttribute('preserveAspectRatio')??'xMidYMid meet').trim()
  if(preserve.includes('slice'))throw new Error('暂不支持需要裁剪的 slice 视图，请先改为 meet')
  let sx=width/values[2]!,sy=height/values[3]!,dx=0,dy=0
  if(preserve!=='none'){
    if(!/^x(Min|Mid|Max)Y(Min|Mid|Max)(\s+meet)?$/.test(preserve))throw new Error('SVG preserveAspectRatio 无效')
    sx=sy=Math.min(sx,sy);dx=(width-values[2]!*sx)*(preserve.includes('xMax')?1:preserve.includes('xMid')?.5:0);dy=(height-values[3]!*sy)*(preserve.includes('YMax')?1:preserve.includes('YMid')?.5:0)
  }
  return {matrix:[sx,0,0,sy,x+dx-values[0]!*sx,y+dy-values[1]!*sy],width:values[2]!,height:values[3]!}
}

export function importSvg(source:string,options:SvgImportOptions):SvgImportResult {
  if(!/^[a-f\d]{64}$/.test(options.sha256)||!options.fileName.trim()||options.fileName.length>200)throw new Error('SVG 来源名称或指纹无效')
  const {root,elements}=documentOf(source,options.parseXml),name=options.fileName.replace(/\.svg$/i,'').slice(0,100)||'SVG 素材'
  const evidence={title:options.fileName.slice(0,100),reference:`SVG 源文件 · SHA-256 ${options.sha256}`,file:{format:'svg' as const,fileName:options.fileName,sha256:options.sha256}}
  const warnings=new Set<string>(),measure=options.measure??measureText
  if(options.preferMetadata!==false&&!options.group){
    for(const metadata of elements.filter(e=>tag(e)==='metadata')){
      const text=metadata.textContent?.trim();if(!text?.startsWith('{'))continue
      try{
        const value=JSON.parse(text);if(value?.version!=='0.2')continue
        const valid=(() => {try{return parseDocument({...value,references:[]})}catch{return null}})();if(!valid){warnings.add('工程元数据不可恢复，改用 SVG 图元解析');continue}
        const asset=captureComponent(valid,'stage',name)
        // The file name identifies the library entry; it must not replace labels in the figure.
        asset.figure.title=valid.title;rootContainer(asset.figure).title=rootContainer(valid).title
        if(!asset.sources.some(s=>s.file?.sha256===options.sha256&&s.file.fileName===options.fileName))asset.sources.push(evidence)
        if(asset.sources.length>12)throw new Error('SVG 工程来源超过 12 条，请先精简来源或关闭元数据恢复')
        const result=parseAsset(asset)
        return {asset:result,report:{mode:'metadata',nodes:result.figure.nodes.length,groups:result.figure.containers.length-1,paths:result.figure.nodes.filter(n=>n.path).length,curves:result.figure.nodes.filter(n=>n.path?.points.some(p=>p.c1)).length,texts:result.figure.nodes.filter(n=>n.kind==='text').length,scale:1,warnings:['按 FastFigure 元数据恢复可编辑结构；外观以恢复后的预览为准'],fonts:[...new Set(result.figure.nodes.map(n=>n.textStyle?.family).filter((s):s is string=>!!s))]}}
      }catch(error){if(error instanceof SyntaxError){warnings.add('工程元数据不可恢复，改用 SVG 图元解析');continue}throw error}
    }
  }
  const rules:SvgRule[]=elements.filter(e=>tag(e)==='style').flatMap(e=>cssRules(e.textContent??''))
  const ids=new Map<string,Element>();for(const e of elements){const id=e.getAttribute('id');if(id){if(ids.has(id))throw new Error(`SVG 对象 ID 重复：${id.slice(0,60)}`);ids.set(id,e)}}
  const selected=options.group?elements[Number(options.group.replace(/^group-/,''))]:undefined
  if(options.group&&(!/^group-\d+$/.test(options.group)||!selected||!['g','svg','symbol'].includes(tag(selected))))throw new Error('选择的 SVG 分组已不存在')
  const doc=createBlank();doc.title=name;doc.style.preset='precise';doc.containers=[{id:'stage',parentId:null,role:'component',title:name,x:0,y:0,width:920,height:500,visual:{fill:'none',stroke:'none'},evidence}]
  const groups=new Map<string,FigureContainer>(),nodes:FigureNode[]=[],nativeShapes=new Map<string,{kind:'rectangle'|'ellipse';radius?:number}>(),sourceViewport=viewport(root,{width:300,height:150}),rootMatrix=multiply(parseTransform(root.getAttribute('transform')??''),sourceViewport.matrix)
  let count=0,allPoints=0
  const makeId=(prefix:string)=>`svg-${prefix}-${++count}`
  const rootStyle=svgStyle(root,{},rules),rootFont=fontStyle(rootStyle);rootStyle['font-size']=String(rootFont.size);rootStyle['letter-spacing']=String(rootFont.letterSpacing)
  function addGroup(parentId:string,title:string,alpha:number,keep:boolean):string {
    if(!keep&&alpha===1)return parentId
    if(groups.size>=20)throw new Error('SVG 分组超过 20 个，请选择子图或关闭“保留分组”')
    const id=makeId('group'),container:FigureContainer={id,parentId,role:'component',title:title.slice(0,100)||'SVG 分组',x:0,y:0,width:5,height:5,visual:{fill:'none',stroke:'none'},...(alpha!==1?{opacity:alpha}:{})}
    groups.set(id,container);return id
  }
  const resolvePaint=svgPaintResolver(ids,rules)
  function visual(style:Record<string,string>,matrix:Affine,isLine=false,context?:{box:FigureNode;sourceBox:ReturnType<typeof svgPathBounds>;view:{width:number;height:number}}) {
    const paint=(value:string):ReturnType<typeof resolvePaint>=>context?resolvePaint(value,style.color!,matrix,context.box,context.sourceBox,context.view):svgColor(value,style.color)
    const fill=paint(isLine?'none':style.fill!),stroke=paint(style.stroke!),size=Math.sqrt(Math.abs(matrix[0]*matrix[3]-matrix[1]*matrix[2]))
    const strokeSize=style['vector-effect']==='non-scaling-stroke'?1:size
    if(!size||!Number.isFinite(size))throw new Error('SVG 变换退化')
    if(style['vector-effect']&&!['none','non-scaling-stroke'].includes(style['vector-effect']))throw new Error('暂不支持该 SVG vector-effect')
    const miterLimit=length(style['stroke-miterlimit'],1,16,4);if(miterLimit<1)throw new Error('SVG 尖角限值至少为 1')
    const dashOffset=length(style['stroke-dashoffset'],Math.hypot(sourceViewport.width,sourceViewport.height)/Math.SQRT2)*strokeSize
    const lineWidth=length(style['stroke-width'],Math.hypot(sourceViewport.width,sourceViewport.height)/Math.SQRT2,16,1)*strokeSize
    if(lineWidth<0)throw new Error('SVG 线宽不能为负数')
    const dash=style['stroke-dasharray']&&style['stroke-dasharray']!=='none'?style['stroke-dasharray'].trim().split(/[ ,]+/).map(v=>length(v,Math.hypot(sourceViewport.width,sourceViewport.height)/Math.SQRT2)*strokeSize):undefined
    if(dash&&dash.some(n=>n<0)||dash&&dash.length>16)throw new Error('SVG 虚线参数无效')
    const normalized=[matrix[0]/size,matrix[1]/size,matrix[2]/size,matrix[3]/size] as Linear
    const nonUniform=Math.abs(Math.hypot(normalized[0],normalized[1])-1)>1e-6||Math.abs(normalized[0]*normalized[2]+normalized[1]*normalized[3])>1e-6
    const lineCap=style['stroke-linecap']??'butt',lineJoin=style['stroke-linejoin']??'miter'
    if(!['butt','round','square'].includes(lineCap)||!['miter','round','bevel'].includes(lineJoin))throw new Error('SVG 线端或转角样式无效')
    return {fill:fill.color,stroke:lineWidth===0?'none':stroke.color,...('gradient'in fill?{fillGradient:fill.gradient}:{}),...('gradient'in stroke&&lineWidth?{strokeGradient:stroke.gradient}:{}),strokeWidth:Math.max(.01,lineWidth),opacity:opacity(style.opacity),fillOpacity:fill.alpha*opacity(style['fill-opacity']),strokeOpacity:stroke.alpha*opacity(style['stroke-opacity']),lineCap:lineCap as 'butt'|'round'|'square',lineJoin:lineJoin as 'miter'|'round'|'bevel',miterLimit,dashOffset,...(dash&&dash.some(v=>v>0)?{dash}:{}),...(nonUniform&&style['vector-effect']!=='non-scaling-stroke'?{strokeMatrix:normalized}:{}),handDrawn:false,padding:0}
  }
  function addPath(data:string,element:Element,parentId:string,style:Record<string,string>,matrix:Affine,view:{width:number;height:number},isLine=false) {
    const points=parseSvgPath(data,matrix)
    if(points.length<2)return
    allPoints+=pathCoordinates(points).length;if(allPoints>4096)throw new Error('路径锚点和控制点超过 4096 个，请选择子图')
    const sourceName=(element.getAttribute('aria-label')||element.getAttribute('id')||tag(element)).slice(0,100)
    const node:FigureNode={id:makeId('path'),kind:'path',label:sourceName||'SVG 路径',name:sourceName,parentId,x:0,y:0,width:1,height:1,path:{points:[{x:0,y:0},{x:1,y:1}],arrow:'none',fillRule:style['fill-rule']==='evenodd'?'evenodd':'nonzero'}}
    setPathPoints(node,points)
    node.visual=visual(style,matrix,isLine,{box:node,sourceBox:svgPathBounds(parseSvgPath(data,[1,0,0,1,0,0])),view})
    node.chart=chartMark(element,node.visual!)
    const marker=style['marker-end']??''
    if(marker&&marker!=='none'){
      const ref=/^url\(\s*['"]?#([^'"\s)]+)['"]?\s*\)$/.exec(marker),definition=ref&&ids.get(ref[1]!)
      if(!definition||tag(definition)!=='marker'||children(definition).length!==1||!['path','polygon','polyline'].includes(tag(children(definition)[0]!)))throw new Error('暂不支持该 SVG 箭头定义')
      if(points.some(p=>p.move||p.close))throw new Error('闭合或复合路径的箭头暂不支持')
      const shape=children(definition)[0]!,markerStyle=svgStyle(shape,svgStyle(definition,rootStyle,rules),rules)
      node.path!.arrow=markerStyle.fill==='none'?'open':'filled';warnings.add('SVG 标记箭头转换为标准可编辑箭头，尺寸采用图元线宽')
    }
    if(style['marker-start']&&style['marker-start']!=='none'||style['marker-mid']&&style['marker-mid']!=='none')throw new Error('起点或中间箭头暂不支持，请先转为普通图形')
    setPathPoints(node,points);if(node.width+node.height<1e-8)return
    nodes.push(node)
    return node
  }
  function textRuns(element:Element,parentId:string,style:Record<string,string>,matrix:Affine,view:{width:number;height:number}) {
    type Run={label:string;style:Record<string,string>;parentId:string;position:Record<string,number>;hidden:boolean;preserve:boolean}
    const runs:Run[]=[]
    function collect(el:Element,current:Record<string,string>,parent:string,preserve=false) {
      if(current.display==='none')return
      if(el!==element&&el.hasAttribute('transform'))throw new Error('暂不支持 tspan 独立变换，请拆为独立 text 对象')
      if(['rotate','textLength','lengthAdjust'].some(k=>el.hasAttribute(k)))throw new Error('暂不支持逐字旋转或强制文字伸缩')
      const size=Number(current['font-size']),position:Record<string,number>={}
      for(const key of ['x','y','dx','dy'])if(el.hasAttribute(key))position[key]=length(el.getAttribute(key),key.endsWith('x')?view.width:view.height,size)
      const id=addGroup(parent,'SVG 文字',opacity(current.opacity),false),space=el.getAttribute('xml:space')??(preserve?'preserve':'default')
      let pending=position
      for(const child of Array.from(el.childNodes)){
        if(child.nodeType===1){
          const span=child as Element;if(['title','desc'].includes(tag(span)))continue
          if(tag(span)!=='tspan')throw new Error(`暂不支持文字子元素 ${tag(span)}`)
          // Preserve a parent's positioning even when its first content lives in a tspan.
          if(Object.keys(pending).length){runs.push({label:'',style:current,parentId:id,position:pending,hidden:true,preserve:space==='preserve'});pending={}}
          const next=svgStyle(span,current,rules),font=fontStyle(next,size);next['font-size']=String(font.size);next['letter-spacing']=String(font.letterSpacing)
          collect(span,next,id,space==='preserve');continue
        }
        if(child.nodeType!==3&&child.nodeType!==4)continue
        const raw=(child.textContent??'').replace(/[\r\n\t]/g,' '),label=space==='preserve'?raw:raw.replace(/ +/g,' ')
        runs.push({label,style:current,parentId:id,position:pending,hidden:current.visibility==='hidden'||current.visibility==='collapse',preserve:space==='preserve'});pending={}
      }
    }
    collect(element,style,parentId)
    // SVG default whitespace collapses across style runs, then trims the text element.
    if(element.getAttribute('xml:space')!=='preserve'){
      let precedingSpace=true
      for(const run of runs){if(precedingSpace&&!run.preserve)run.label=run.label.replace(/^ +/,'');if(run.label)precedingSpace=run.label.endsWith(' ')}
      const last=[...runs].reverse().find(r=>r.label);if(last&&!last.preserve)last.label=last.label.replace(/ +$/,'')
    }
    const cursor={x:0,y:0};let chunk:{run:Run;x:number;y:number;width:number}[]=[],chunkAnchor='start'
    function flush(){
      const width=chunk.length?chunk.at(-1)!.x+chunk.at(-1)!.width-chunk[0]!.x:0,offset=chunkAnchor==='middle'?width/2:chunkAnchor==='end'?width:0
      for(const part of chunk){
        const {run}=part;if(!run.label||run.hidden)continue
        if(run.label.length>240)throw new Error('单段 SVG 文字超过 240 字，请先分段')
        const font=fontStyle(run.style),scale=Math.hypot(matrix[0],matrix[1]),linear=[matrix[0]/scale,matrix[1]/scale,matrix[2]/scale,matrix[3]/scale] as Linear,paint=visual({...run.style,opacity:'1'},matrix)
        const baseline=(run.style['dominant-baseline']==='auto'?run.style['alignment-baseline']??'alphabetic':run.style['dominant-baseline']) as NonNullable<FigureNode['textLayout']>['baseline']
        if(!['auto','alphabetic','middle','central','hanging','text-before-edge','text-after-edge','ideographic'].includes(baseline!))throw new Error('暂不支持该 SVG 文字基线')
        const textStyle={...font,align:'left' as const,size:font.size!*scale,letterSpacing:(font.letterSpacing??0)*scale,...(paint.fill!=='none'?{color:paint.fill}:{})}
        const box=textBox(run.label,textStyle,transform({x:part.x-offset,y:part.y},matrix),linear,measure,baseline)
        const strokeRatio=scale/Math.sqrt(Math.abs(matrix[0]*matrix[3]-matrix[1]*matrix[2]))
        nodes.push({id:makeId('text'),kind:'text',label:run.label,name:element.getAttribute('id')||undefined,parentId:run.parentId,...box,textStyle,chart:chartMark(element,paint,true),visual:{...paint,strokeMatrix:undefined,...(paint.dash?{dash:paint.dash.map(v=>v*strokeRatio)}:{}),dashOffset:paint.dashOffset*strokeRatio,strokeWidth:paint.strokeWidth*strokeRatio}})
      }
      chunk=[]
    }
    for(const run of runs){
      const p=run.position,reset=p.x!==undefined||p.y!==undefined
      if(reset)flush()
      if(p.x!==undefined)cursor.x=p.x;if(p.y!==undefined)cursor.y=p.y
      cursor.x+=p.dx??0;cursor.y+=p.dy??0
      if(!run.label)continue
      if(!chunk.length)chunkAnchor=run.style['text-anchor']??'start'
      else if((run.style['text-anchor']??'start')!==chunkAnchor)throw new Error('同一文字块内变更对齐需要显式 x / y 定位')
      const width=measure(run.label,fontStyle(run.style)).width
      chunk.push({run,x:cursor.x,y:cursor.y,width});cursor.x+=width
    }
    flush()
  }
  function walk(el:Element,parentId:string,parentStyle:Record<string,string>,parentMatrix:Affine,view:{width:number;height:number},reference:string[]=[],inScope=!selected) {
    const name=tag(el)
    if(el.namespaceURI&&el.namespaceURI!==svgNamespace)return
    if(name==='defs'){if(selected&&Array.from(el.getElementsByTagName('*')).includes(selected))for(const child of children(el))walk(child,parentId,parentStyle,parentMatrix,view,reference,false);return}
    if(['style','metadata','title','desc','marker','clipPath','linearGradient','radialGradient','pattern'].includes(name))return
    const style=svgStyle(el,parentStyle,rules),font=fontStyle(style,Number(parentStyle['font-size'])||16);style['font-size']=String(font.size);style['letter-spacing']=String(font.letterSpacing)
    if(style.display==='none')return
    let matrix=multiply(parentMatrix,parseTransform(el.getAttribute('transform')??'')),currentView=view
    if(name==='svg'||name==='symbol'){const v=viewport(el,view);matrix=multiply(matrix,v.matrix);currentView={width:v.width,height:v.height}}
    const active=inScope||el===selected
    if(!active&&!Array.from(el.getElementsByTagName('*')).includes(selected!))return
    if(['g','svg','a','symbol'].includes(name)){
      if(name==='a')warnings.add('链接仅保留图形内容，不导入交互跳转')
      const id=active||opacity(style.opacity)!==1?addGroup(parentId,el.getAttribute('aria-label')||el.getAttribute('id')||'SVG 分组',opacity(style.opacity),active&&options.keepGroups!==false):parentId
      for(const child of children(el))walk(child,id,style,matrix,currentView,reference,active)
      return
    }
    if(name==='use'){
      if(!active)return
      const href=el.getAttribute('href')||el.getAttribute('xlink:href')||'',key=href.slice(1),target=ids.get(key)
      if(!href.startsWith('#')||!target)throw new Error('SVG use 必须引用文件内已有对象')
      if(reference.includes(key)||reference.length>=16)throw new Error('SVG use 引用循环或层级过深')
      const translated=multiply(matrix,[1,0,0,1,length(el.getAttribute('x'),view.width),length(el.getAttribute('y'),view.height)])
      if(tag(target)==='symbol'){
        const v=viewport(target,view,{width:length(el.getAttribute('width'),view.width,16,view.width),height:length(el.getAttribute('height'),view.height,16,view.height)}),id=addGroup(parentId,key,opacity(style.opacity),options.keepGroups!==false)
        const next=svgStyle(target,style,rules),font=fontStyle(next,Number(style['font-size']));next['font-size']=String(font.size);next['letter-spacing']=String(font.letterSpacing)
        const symbolId=addGroup(id,key,opacity(next.opacity),false),symbolMatrix=multiply(multiply(translated,parseTransform(target.getAttribute('transform')??'')),v.matrix)
        for(const child of children(target))walk(child,symbolId,next,symbolMatrix,{width:v.width,height:v.height},[...reference,key],true)
      }else walk(target,addGroup(parentId,key,opacity(style.opacity),false),style,translated,view,[...reference,key],true)
      return
    }
    if(!active||name!=='text'&&(style.visibility==='hidden'||style.visibility==='collapse'))return
    const n=(key:string,basis=view.width,fallback=0)=>length(el.getAttribute(key),basis,Number(style['font-size']),fallback)
    if(name==='text')textRuns(el,parentId,style,matrix,view)
    else if(name==='path')addPath(el.getAttribute('d')??'',el,parentId,style,matrix,view)
    else if(name==='line')addPath(`M${n('x1')} ${n('y1',view.height)}L${n('x2')} ${n('y2',view.height)}`,el,parentId,style,matrix,view,true)
    else if(name==='polyline'||name==='polygon'){
      const list=numberList(el.getAttribute('points')??'');if(list.length<4||list.length%2)throw new Error('SVG 折线 / 多边形坐标无效')
      addPath(list.reduce((s,v,i)=>s+(i%2?` ${v}`:`${i?'L':'M'}${v}`),'')+(name==='polygon'?'Z':''),el,parentId,style,matrix,view)
    }else if(name==='rect'){
      if(n('rx')<0||n('ry',view.height)<0)throw new Error('SVG 圆角半径不能为负数')
      const x=n('x'),y=n('y',view.height),w=n('width'),h=n('height',view.height),rx=Math.min(w/2,Math.max(0,n('rx',view.width,el.hasAttribute('ry')?n('ry',view.height):0))),ry=Math.min(h/2,Math.max(0,n('ry',view.height,rx)))
      if(w<0||h<0)throw new Error('SVG 矩形尺寸不能为负数');if(!w||!h)return
      const node=addPath(rx&&ry?`M${x+rx} ${y}H${x+w-rx}A${rx} ${ry} 0 0 1 ${x+w} ${y+ry}V${y+h-ry}A${rx} ${ry} 0 0 1 ${x+w-rx} ${y+h}H${x+rx}A${rx} ${ry} 0 0 1 ${x} ${y+h-ry}V${y+ry}A${rx} ${ry} 0 0 1 ${x+rx} ${y}Z`:`M${x} ${y}H${x+w}V${y+h}H${x}Z`,el,parentId,style,matrix,view)
      if(node&&Math.abs(matrix[1])+Math.abs(matrix[2])+Math.abs(matrix[0]-matrix[3])<1e-8&&matrix[0]>0&&Math.abs(rx-ry)<1e-8)nativeShapes.set(node.id,{kind:'rectangle',radius:rx*matrix[0]})
    }else if(name==='circle'||name==='ellipse'){
      const cx=n('cx'),cy=n('cy',view.height),rx=name==='circle'?n('r',Math.hypot(view.width,view.height)/Math.SQRT2):n('rx'),ry=name==='circle'?rx:n('ry',view.height)
      if(rx<0||ry<0)throw new Error('SVG 椭圆半径不能为负数');if(!rx||!ry)return
      const node=addPath(`M${cx+rx} ${cy}A${rx} ${ry} 0 1 1 ${cx-rx} ${cy}A${rx} ${ry} 0 1 1 ${cx+rx} ${cy}Z`,el,parentId,style,matrix,view)
      if(node&&Math.abs(matrix[1])+Math.abs(matrix[2])+Math.abs(matrix[0]-matrix[3])<1e-8&&matrix[0]>0)nativeShapes.set(node.id,{kind:'ellipse'})
    }else throw new Error(`暂不支持 SVG 元素 ${name}`)
    if(nodes.length>240)throw new Error('SVG 图元超过 240 个，请选择子图')
  }
  const rootParent=opacity(rootStyle.opacity)!==1?addGroup('stage','SVG 整体',opacity(rootStyle.opacity),false):'stage'
  for(const child of children(root))walk(child,rootParent,rootStyle,rootMatrix,sourceViewport)
  if(!nodes.length)throw new Error('所选 SVG 范围内没有可导入的图形或文字')
  const geometry=bounds(nodes),margin=16
  const strokeMax=Math.max(0,...nodes.filter(n=>n.visual?.stroke!=='none').map(n=>(n.visual?.strokeWidth??1)*Math.max(1,...(n.visual?.strokeMatrix??[1,0,0,1]).map(Math.abs))))
  const fontMax=Math.max(0,...nodes.filter(n=>n.kind==='text').map(n=>n.textStyle?.size??1)),fontMin=Math.min(...nodes.filter(n=>n.kind==='text').map(n=>n.textStyle!.size!))
  const scale=Math.min(1,(880-margin*2)/(geometry.width||1),(420-margin*2)/(geometry.height||1),64/strokeMax,256/fontMax)
  if(fontMin*scale<1)throw new Error('SVG 文字适配后小于 1，请选择更小范围的子图')
  const dx=margin-geometry.x*scale,dy=margin-geometry.y*scale
  for(const node of nodes){
    node.x=node.x*scale+dx;node.y=node.y*scale+dy;node.width*=scale;node.height*=scale
    if(node.visual){node.visual.strokeWidth=node.visual.stroke==='none'?1:Math.max(.01,(node.visual.strokeWidth??1)*scale);if(node.visual.dash)node.visual.dash=node.visual.dash.map(n=>n*scale);if(node.visual.dashOffset)node.visual.dashOffset*=scale}
    if(node.textStyle?.size)node.textStyle.size*=scale
    if(node.textStyle?.letterSpacing)node.textStyle.letterSpacing*=scale
    node.evidence={...evidence}
    const shape=nativeShapes.get(node.id)
    if(shape&&node.width>=1&&node.height>=1&&(shape.radius??0)*scale<=40){node.kind=shape.kind;node.label='';delete node.path;if(shape.radius!==undefined)node.visual!.radius=shape.radius*scale}
  }
  doc.nodes=nodes
  const ordered=[...groups.values()]
  doc.containers.push(...ordered)
  for(const group of [...ordered].reverse()){
    const nested=doc.nodes.filter(n=>n.parentId===group.id),sub=doc.containers.filter(c=>c.parentId===group.id)
    if(!nested.length&&!sub.length){doc.containers=doc.containers.filter(c=>c.id!==group.id);continue}
    const box=bounds([...nested,...sub]);Object.assign(group,{x:box.x-2,y:box.y-2,width:Math.max(5,box.width+4),height:Math.max(5,box.height+4)})
  }
  const box=bounds([...doc.nodes,...doc.containers.filter(c=>c.id!=='stage')]);Object.assign(doc.containers[0]!,{width:Math.max(5,box.x+box.width+margin),height:Math.max(5,box.y+box.height+margin)})
  if(doc.containers[0]!.width>1000||doc.containers[0]!.height>620)throw new Error('SVG 适配后的范围超出画布，请选择子图')
  warnings.add('按完整几何等比适配到素材预览，不保留 SVG 视框裁切和原始物理尺寸')
  if(nodes.some(n=>n.path?.points.some(p=>p.c1)))warnings.add('曲线保留为可编辑贝塞尔路径；圆弧已转换为贝塞尔曲线')
  const figure=parseDocument(doc),asset=captureComponent(figure,'stage',name,'从 SVG 源文件解析的可编辑素材',['SVG'])
  asset.sources=[evidence]
  return {asset:parseAsset(asset),report:{mode:'svg',nodes:nodes.length,groups:figure.containers.length-1,paths:nodes.filter(n=>n.path).length,curves:nodes.filter(n=>n.path?.points.some(p=>p.c1)).length,texts:nodes.filter(n=>n.kind==='text').length,scale,sourceTransform:[scale,0,0,scale,dx,dy],warnings:[...warnings],fonts:[...new Set(nodes.map(n=>n.textStyle?.family).filter((s):s is string=>!!s))]}}
}
