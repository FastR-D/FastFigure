import type { TextStyle } from './model.ts'

export interface SvgColor {color:string;alpha:number}
const inherited=['fill','stroke','stroke-width','fill-opacity','stroke-opacity','fill-rule','stroke-linecap','stroke-linejoin','stroke-dasharray','stroke-dashoffset','stroke-miterlimit','color','font-family','font-size','font-weight','font-style','letter-spacing','text-anchor','dominant-baseline','alignment-baseline','visibility','marker-end','marker-start','marker-mid']
const defaults:Record<string,string>={fill:'#000000',stroke:'none','stroke-width':'1','fill-opacity':'1','stroke-opacity':'1','fill-rule':'nonzero','stroke-linecap':'butt','stroke-linejoin':'miter','color':'#000000','font-family':'serif','font-size':'16','font-weight':'400','font-style':'normal','letter-spacing':'0','text-anchor':'start','dominant-baseline':'auto',opacity:'1',visibility:'visible',display:'inline'}
inherited.push('color-interpolation')
const supported=new Set([...inherited,'opacity','display','vector-effect','stop-color','stop-opacity'])
export interface SvgRule {selector:string;values:Record<string,string>;specificity:number;order:number}
export function declarations(text:string):Record<string,string> {
  const result:Record<string,string>={}
  for(const declaration of text.split(';')){
    if(!declaration.trim())continue
    const index=declaration.indexOf(':');if(index<0)throw new Error('SVG 样式声明无效')
    const key=declaration.slice(0,index).trim().toLowerCase(),value=declaration.slice(index+1).trim()
    if(key==='filter'||key==='clip-path'||key==='mask'){if(value!=='none')throw new Error(`暂不支持 ${key}，请先展开或移除该效果`);continue}
    if(key==='transform'||key==='transform-origin')throw new Error('暂不支持 CSS transform；请使用 SVG transform 属性')
    if(key==='baseline-shift'&&!['0','baseline'].includes(value))throw new Error('暂不支持文字基线偏移，请先展开文字样式')
    if(!supported.has(key)){if(['mix-blend-mode','isolation','paint-order'].includes(key)&&!['normal','auto','none'].includes(value))throw new Error(`暂不支持样式 ${key}`);if(['white-space','font-variant','font-stretch','text-decoration'].includes(key)&&!['normal','none'].includes(value))throw new Error(`暂不支持样式 ${key}`);continue}
    if(/!important/i.test(value))throw new Error('暂不支持 !important 样式优先级')
    result[key]=value
  }
  return result
}
export function cssRules(text:string):SvgRule[] {
  const clean=text.replace(/\/\*[\s\S]*?\*\//g,'')
  if(/@/.test(clean))throw new Error('SVG 样式表中的 @ 规则暂不支持')
  const rules:SvgRule[]=[];let end=0
  for(const match of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    if(clean.slice(end,match.index).trim())throw new Error('SVG 样式表无效')
    for(const selector of match[1]!.split(',').map(s=>s.trim())){
      if(!/^(?:[\w*.-]+|#[\w.-]+)(?:[.#][\w-]+)*(?:\s+(?:[\w*.-]+|#[\w.-]+)(?:[.#][\w-]+)*)*$/.test(selector))throw new Error(`暂不支持 CSS 选择器 ${selector.slice(0,60)}`)
      rules.push({selector,values:declarations(match[2]!),specificity:(selector.match(/#/g)?.length??0)*100+(selector.match(/\./g)?.length??0)*10+selector.split(/\s+/).filter(t=>/^[a-zA-Z]/.test(t)).length,order:rules.length})
    }
    end=match.index!+match[0].length
  }
  if(clean.slice(end).trim())throw new Error('SVG 样式表无效')
  return rules
}
function simpleMatch(element:Element,selector:string) {
  const tag=/^[\w*-]+/.exec(selector)?.[0],id=/#([\w-]+)/.exec(selector)?.[1],classes=[...selector.matchAll(/\.([\w-]+)/g)].map(m=>m[1]!)
  return (!tag||tag==='*'||element.localName===tag)&&(!id||element.getAttribute('id')===id)&&classes.every(c=>(element.getAttribute('class')??'').split(/\s+/).includes(c))
}
function matches(element:Element,selector:string) {
  const parts=selector.split(/\s+/);if(!simpleMatch(element,parts.at(-1)!))return false
  let ancestor=element.parentNode as Element|null
  for(let i=parts.length-2;i>=0;i--){while(ancestor&&ancestor.nodeType===1&&!simpleMatch(ancestor,parts[i]!))ancestor=ancestor.parentNode as Element|null;if(!ancestor||ancestor.nodeType!==1)return false;ancestor=ancestor.parentNode as Element|null}
  return true
}
export function svgStyle(element:Element,parent:Record<string,string>,rules:SvgRule[]) {
  const result={...defaults}
  for(const key of inherited)if(parent[key]!==undefined)result[key]=parent[key]!
  for(const key of [...supported,'filter','clip-path','mask','baseline-shift']){const value=element.getAttribute(key);if(value!==null&&value!=='')Object.assign(result,declarations(`${key}:${value}`))}
  for(const rule of rules.filter(r=>matches(element,r.selector)).sort((a,b)=>a.specificity-b.specificity||a.order-b.order))Object.assign(result,rule.values)
  Object.assign(result,declarations(element.getAttribute('style')??''))
  for(const key of Object.keys(result))if(result[key]==='inherit')result[key]=parent[key]??defaults[key]??''
  return result
}
export function length(value:string|null|undefined,basis=1,fontSize=16,fallback=0):number {
  if(value===null||value===undefined||value==='')return fallback
  const match=/^([+-]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?)(px|pt|pc|mm|cm|in|em|ex|rem|%)?$/.exec(value.trim())
  if(!match)throw new Error(`SVG 长度无效：${value.slice(0,40)}`)
  const units:Record<string,number>={'':1,px:1,pt:96/72,pc:16,mm:96/25.4,cm:96/2.54,in:96,em:fontSize,ex:fontSize/2,rem:16,'%':basis/100}
  const result=Number(match[1])*units[match[2]??'']!
  if(!Number.isFinite(result)||Math.abs(result)>1e7)throw new Error('SVG 几何数值超限')
  return result
}
export function numberList(text:string):number[] {
  const values=[...text.matchAll(/[+-]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?/g)];let end=0
  for(const value of values){if(text.slice(end,value.index).trim().replaceAll(',',''))throw new Error('SVG 数列无效');end=value.index!+value[0].length}
  if(text.slice(end).trim().replaceAll(',',''))throw new Error('SVG 数列无效')
  const result=values.map(v=>Number(v[0]));if(result.some(v=>!Number.isFinite(v)||Math.abs(v)>1e7))throw new Error('SVG 数列超限');return result
}
let colorCanvas:OffscreenCanvas|HTMLCanvasElement|undefined
export function svgColor(value:string,current='#000000'):SvgColor {
  value=value.trim();if(value==='currentColor')value=current
  if(value==='none')return {color:'none',alpha:1}
  const hex=/^#([a-f\d]{3,4}|[a-f\d]{6}|[a-f\d]{8})$/i.exec(value)
  if(hex){const h=hex[1]!,full=h.length<5?[...h].map(c=>c+c).join(''):h;return{color:'#'+full.slice(0,6).toLowerCase(),alpha:full.length===8?parseInt(full.slice(6),16)/255:1}}
  const common:Record<string,string>={black:'#000000',white:'#ffffff',red:'#ff0000',green:'#008000',blue:'#0000ff',gray:'#808080',grey:'#808080',orange:'#ffa500',yellow:'#ffff00',purple:'#800080',transparent:'#00000000'}
  if(common[value.toLowerCase()])return svgColor(common[value.toLowerCase()]!)
  const rgb=/^rgba?\(\s*([\d.+-]+%?)\s*,\s*([\d.+-]+%?)\s*,\s*([\d.+-]+%?)(?:\s*,\s*([\d.+-]+%?))?\s*\)$/i.exec(value)
  if(rgb){const channel=(v:string,max:number)=>Math.max(0,Math.min(max,parseFloat(v)*(v.endsWith('%')?max/100:1)));return {color:'#'+rgb.slice(1,4).map(v=>Math.round(channel(v!,255)).toString(16).padStart(2,'0')).join(''),alpha:rgb[4]===undefined?1:channel(rgb[4],1)}}
  if(/url\s*\(/i.test(value))throw new Error('此绘制位置不支持渐变或图案引用，文字渐变请先展开为路径')
  if(/var\s*\(/i.test(value))throw new Error('暂不支持 CSS 变量填充')
  if(!colorCanvas){if(typeof OffscreenCanvas!=='undefined')colorCanvas=new OffscreenCanvas(1,1);else if(typeof document!=='undefined')colorCanvas=document.createElement('canvas')}
  const ctx=colorCanvas?.getContext('2d') as CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D|undefined|null
  if(ctx){ctx.fillStyle='#010203';ctx.fillStyle=value;const first=ctx.fillStyle;ctx.fillStyle='#020304';ctx.fillStyle=value;if(first===ctx.fillStyle){ctx.clearRect(0,0,1,1);ctx.fillRect(0,0,1,1);const data=ctx.getImageData(0,0,1,1).data;return{color:'#'+[data[0]!,data[1]!,data[2]!].map(n=>n.toString(16).padStart(2,'0')).join(''),alpha:data[3]!/255}}}
  throw new Error(`无法解析 SVG 颜色：${value.slice(0,50)}`)
}
export function fontStyle(style:Record<string,string>,parentSize=16):TextStyle {
  const family=(style['font-family']??'serif').split(',')[0]!.trim().replace(/^['"]|['"]$/g,'')
  if(!/^[\p{L}\p{N} _.-]{1,80}$/u.test(family))throw new Error('SVG 字体名称无效')
  const size=length(style['font-size'],parentSize,parentSize,16),weight=style['font-weight']==='bold'?700:style['font-weight']==='normal'?400:Number(style['font-weight'])
  if(size<=0||!Number.isFinite(weight)||weight<1||weight>1000)throw new Error('SVG 字体字号或字重无效')
  if(!['start','middle','end'].includes(style['text-anchor']??'start'))throw new Error('SVG 文字对齐无效')
  if(!['normal','italic'].includes(style['font-style']??'normal'))throw new Error('暂不支持斜体以外的字体倾斜样式')
  return {family,size,weight:Math.round(weight),italic:style['font-style']==='italic',letterSpacing:style['letter-spacing']==='normal'?0:length(style['letter-spacing'],size,size),align:style['text-anchor']==='middle'?'center':style['text-anchor']==='end'?'right':'left'}
}
