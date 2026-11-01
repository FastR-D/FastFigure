import {measureText,type MeasureText} from './textGeometry.ts'
import type {TextStyle} from './model.ts'
import type {Rect} from './geometry.ts'
import type {DrawioXmlOptions} from './drawioDocument.ts'
import type {Point} from './affine.ts'
export const drawioEscape=(value:unknown)=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;')
export function drawioNumber(raw:string|undefined,fallback=0){if(raw===undefined||raw==='')return fallback;const value=Number(raw);if(!Number.isFinite(value)||Math.abs(value)>1e6)throw new Error('draw.io 坐标或样式数值无效 / 超限');return value}
export function drawioTextStyle(style:Record<string,string>):TextStyle{
  const flags=drawioNumber(style.fontStyle),size=drawioNumber(style.fontSize,12)
  if(flags&12)throw new Error('draw.io 下划线 / 删除线暂不能作为可编辑字形导入，请先展开该效果')
  if(size<=0)throw new Error('draw.io 字号必须为正数')
  const family=(style.fontFamily||'Helvetica').replace(/^['"]|['"]$/g,'')
  if(!/^[\p{L}\p{N} _.-]{1,80}$/u.test(family))throw new Error('draw.io 字体名称无效')
  return{family,size,bold:!!(flags&1),weight:flags&1?700:400,italic:!!(flags&2),color:style.fontColor||'#000000',align:'left'}
}
export interface DrawioEdgeLabel {relative:boolean;x:number;y:number;offset:Point}
/** mxGraph edge-label geometry: positive y is above a left-to-right segment. */
export function drawioEdgeLabelPoint(route:Point[],label:DrawioEdgeLabel,scale=1):Point{
  const first=route[0]!,last=route.at(-1)!
  if(!label.relative)return{x:(first.x+last.x)/2+label.offset.x*scale,y:(first.y+last.y)/2+label.offset.y*scale}
  const lengths=route.slice(1).map((p,i)=>Math.hypot(p.x-route[i]!.x,p.y-route[i]!.y)),total=lengths.reduce((sum,length)=>sum+length,0)
  let distance=total*(label.x+1)/2,index=0
  while(index<lengths.length-1&&distance>=lengths[index]!){distance-=lengths[index++]!}
  const a=route[index]!,b=route[index+1]!,length=lengths[index]||0,t=length?distance/length:0,dx=b.x-a.x,dy=b.y-a.y,normal=label.y*scale
  return{x:a.x+dx*t+(length?dy/length*normal:0)+label.offset.x*scale,y:a.y+dy*t-(length?dx/length*normal:0)+label.offset.y*scale}
}
type Run={text:string;style:TextStyle;shift:number}
function htmlRuns(value:string,base:TextStyle,options:DrawioXmlOptions,alignment:string){
  if(/<(?:script|style|img|iframe|svg|math|object|embed|link|video|audio)\b/i.test(value)||/\son\w+\s*=/i.test(value))throw new Error('draw.io HTML 标签含有不支持的活动或外部内容')
  const doc=options.parseHtml?options.parseHtml(`<html><body>${value}</body></html>`):new DOMParser().parseFromString(`<html><body>${value}</body></html>`,'text/html')
  const root=doc.getElementsByTagName('body')[0];if(!root)throw new Error('draw.io HTML 文字格式无效')
  const runs:Run[]=[]
  const newline=()=>{if(runs.length&&!runs.at(-1)!.text.endsWith('\n'))runs.push({text:'\n',style:base,shift:0})}
  function visit(node:Node,style:TextStyle,shift:number){
    if(node.nodeType===3){const text=node.textContent?.replace(/[\t\r\n ]+/g,' ')??'';if(text)runs.push({text,style,shift});return}
    if(node.nodeType!==1)return
    const el=node as Element,tag=el.localName.toLowerCase()
    if(tag==='br'){runs.push({text:'\n',style,shift});return}
    if(!['body','div','p','span','b','strong','i','em','font','a','sup','sub'].includes(tag))throw new Error(`暂不支持 draw.io HTML 文字元素 ${tag}`)
    if(['div','p'].includes(tag))newline()
    const next={...style};let delta=shift
    if(tag==='b'||tag==='strong'){next.bold=true;next.weight=700}
    if(tag==='i'||tag==='em')next.italic=true
    if(tag==='font'){if(el.getAttribute('face'))next.family=el.getAttribute('face')!;if(el.getAttribute('color'))next.color=el.getAttribute('color')!;if(el.hasAttribute('size'))throw new Error('请将 draw.io HTML 的旧式 font size 改为明确的 px 字号')}
    if(tag==='sup'||tag==='sub'){next.size=(style.size??12)*.75;delta+=(tag==='sup'?-.35:.2)*(style.size??12)}
    for(const item of(el.getAttribute('style')??'').split(';')){
      if(!item.trim())continue;const colon=item.indexOf(':');if(colon<0)throw new Error('draw.io HTML 文字样式无效')
      const key=item.slice(0,colon).trim().toLowerCase(),raw=item.slice(colon+1).trim()
      if(key==='color')next.color=raw
      else if(key==='font-family')next.family=raw.replace(/^['"]|['"]$/g,'')
      else if(key==='font-size'){if(!/^\d+(?:\.\d+)?(?:px|pt)?$/.test(raw))throw new Error('draw.io HTML 字号须使用明确的 px / pt');next.size=Number.parseFloat(raw)*(raw.endsWith('pt')?4/3:1)}
      else if(key==='font-weight'){const weight=raw==='bold'?700:raw==='normal'?400:drawioNumber(raw);if(weight<1||weight>1000)throw new Error('draw.io HTML 字重无效');next.weight=weight;next.bold=weight>=600}
      else if(key==='font-style'){if(!['normal','italic','oblique'].includes(raw))throw new Error('draw.io HTML 字体样式无效');next.italic=raw!=='normal'}
      else if(key==='text-align'){if(raw!=='inherit'&&raw!==alignment)throw new Error('draw.io HTML 段落内对齐暂不支持，请使用单元格对齐设置')}
      else if(key==='white-space'){if(raw!=='normal')throw new Error('draw.io HTML 自定义空白排版暂不支持')}
      else if(key==='line-height'){if(!['normal','1.2','120%'].includes(raw))throw new Error('draw.io HTML 自定义行距暂不支持')}
      else if(key==='display'){if(raw!=='inline'&&!(raw==='block'&&['div','p'].includes(tag)))throw new Error('不支持隐藏或特殊布局的 draw.io HTML 文字')}
      else if(key==='margin'||key.startsWith('margin-')||key==='padding'||key.startsWith('padding-')){if(!/^0(?:px)?$/.test(raw))throw new Error('draw.io HTML 自定义内外边距暂不支持')}
      else if(key==='text-decoration'){if(raw!=='none')throw new Error('draw.io HTML 下划线等装饰暂不支持')}
      else throw new Error(`暂不支持 draw.io HTML 文字样式 ${key}`)
    }
    if(!/^[\p{L}\p{N} _.-]{1,80}$/u.test(next.family??'')||!next.size||next.size<=0)throw new Error('draw.io HTML 字体或字号无效')
    for(const child of Array.from(el.childNodes))visit(child,next,delta)
    if(['div','p'].includes(tag))newline()
  }
  visit(root,base,0);while(runs.at(-1)?.text==='\n')runs.pop()
  return runs
}
/** Safe HTML-to-native text runs. Source HTML is never mounted in the workspace. */
export function drawioLabelSvg(value:string,style:Record<string,string>,box:Rect,id:string,options:DrawioXmlOptions&{measure?:MeasureText}={},transform=''){
  if(!value)return''
  if(value.length>12000)throw new Error('draw.io 单个文字过长，请先拆分')
  if(style.horizontal==='0'||style.textDirection==='rtl')throw new Error('draw.io 竖排 / 从右向左文字暂不支持，请先展开为 SVG')
  if(style.overflow&&style.overflow!=='visible')throw new Error('draw.io 文字裁剪 / 特殊溢出布局暂不支持，请先展开为独立文字')
  if(style.labelBackgroundColor&&style.labelBackgroundColor!=='none'||style.labelBorderColor&&style.labelBorderColor!=='none')throw new Error('draw.io 文字背景 / 边框暂不支持，请拆成独立图形后导入')
  if(style.labelPosition&&!['left','center','right'].includes(style.labelPosition)||style.verticalLabelPosition&&!['top','middle','bottom'].includes(style.verticalLabelPosition))throw new Error('draw.io 标签位置不支持')
  const base=drawioTextStyle(style),measure=options.measure??measureText,runs=style.html==='1'?htmlRuns(value,base,options,style.align??'center'):[{text:value,style:base,shift:0}],spacing=drawioNumber(style.spacing,2)
  const left=spacing+drawioNumber(style.spacingLeft),right=spacing+drawioNumber(style.spacingRight),top=spacing+drawioNumber(style.spacingTop),bottom=spacing+drawioNumber(style.spacingBottom),available=Math.max(1,box.width-left-right)
  const lines:Run[][]=[[]];let used=0
  const append=(text:string,run:Run)=>{if(!text)return;const line=lines.at(-1)!,last=line.at(-1);if(last&&last.style===run.style&&last.shift===run.shift)last.text+=text;else line.push({...run,text});used+=measure(text,run.style).width}
  for(const run of runs)for(const token of run.text.match(/\n|[^\S\n]+|[^\s]+/gu)??[]){
    if(token==='\n'){lines.push([]);used=0;continue}
    const width=measure(token,run.style).width
    if(style.whiteSpace==='wrap'&&used&&used+width>available){lines.push([]);used=0;if(/^\s+$/.test(token))continue}
    if(style.whiteSpace==='wrap'&&width>available){for(const char of token){if(used&&used+measure(char,run.style).width>available){lines.push([]);used=0}append(char,run)}}else append(token,run)
  }
  const heights=lines.map(line=>Math.max(base.size??12,...line.map(run=>(run.style.size??12)+Math.abs(run.shift)))*1.2),height=heights.reduce((sum,value)=>sum+value,0),align=style.align||'center',vertical=style.verticalAlign||'middle'
  if(!['left','center','right'].includes(align)||!['top','middle','bottom'].includes(vertical))throw new Error('draw.io 文字对齐方式不支持')
  const x=box.x+(style.labelPosition==='left'?-box.width:style.labelPosition==='right'?box.width:0),y=box.y+(style.verticalLabelPosition==='top'?-box.height:style.verticalLabelPosition==='bottom'?box.height:0)
  let baseline=y+(vertical==='top'?top:vertical==='bottom'?box.height-bottom-height:(box.height-height)/2),count=0;const output:string[]=[]
  for(const [index,line]of lines.entries()){
    const width=line.reduce((sum,run)=>sum+measure(run.text,run.style).width,0);let cursor=x+(align==='left'?left:align==='right'?box.width-right-width:(box.width-width)/2)
    const ascent=Math.max(base.size??12,...line.map(run=>run.style.size??12))*.8
    for(const run of line){if(!run.text)continue;const s=run.style;output.push(`<text id="${id}-${count++}" x="${cursor}" y="${baseline+ascent+run.shift}" xml:space="preserve" font-family="${drawioEscape(s.family)}" font-size="${s.size}" font-weight="${s.weight??400}" font-style="${s.italic?'italic':'normal'}" fill="${drawioEscape(s.color)}" opacity="${drawioNumber(style.textOpacity,100)/100}"${transform?` transform="${drawioEscape(transform)}"`:''}>${drawioEscape(run.text)}</text>`);cursor+=measure(run.text,s).width}
    baseline+=heights[index]!
  }
  return output.join('')
}
