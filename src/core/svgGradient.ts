import {multiply,parseTransform,type Affine} from './affine.ts'
import {gradientFromSource,linearGradientSchema,type LinearGradient} from './gradient.ts'
import {length,svgColor,svgStyle,type SvgRule} from './svgStyles.ts'
import type {FigureNode} from './model.ts'
import type {PathPoint} from './paths.ts'

const tag=(e:Element)=>e.localName??e.tagName.replace(/^.*:/,'')
const children=(e:Element)=>Array.from(e.childNodes).filter((n):n is Element=>n.nodeType===1)
/** Exact Bézier extrema, not the control polygon bounds used by native path editing. */
export function svgPathBounds(points:PathPoint[]){
  const values=points.map(p=>({x:p.x,y:p.y}))
  for(let i=1;i<points.length;i++){
    const from=points[i-1]!,end=points[i]!;if(end.move||from.close||!end.c1)continue
    const controls=[from,end.c1,...(end.c2?[end.c2]:[]),end]
    for(const axis of ['x','y'] as const){
      const p=controls.map(v=>v[axis]),roots:number[]=[]
      if(p.length===3){const d=p[0]!-2*p[1]!+p[2]!;if(d)roots.push((p[0]!-p[1]!)/d)}
      else {const a=-p[0]!+3*p[1]!-3*p[2]!+p[3]!,b=2*(p[0]!-2*p[1]!+p[2]!),c=p[1]!-p[0]!,d=b*b-4*a*c;if(Math.abs(a)<1e-14){if(b)roots.push(-c/b)}else if(d>=0)roots.push((-b+Math.sqrt(d))/(2*a),(-b-Math.sqrt(d))/(2*a))}
      for(const t of roots.filter(t=>t>0&&t<1)){let row=controls.map(p=>({x:p.x,y:p.y}));while(row.length>1)row=row.slice(1).map((p,j)=>({x:row[j]!.x*(1-t)+p.x*t,y:row[j]!.y*(1-t)+p.y*t}));values.push(row[0]!)}
    }
  }
  const x=Math.min(...values.map(p=>p.x)),y=Math.min(...values.map(p=>p.y));return{x,y,width:Math.max(...values.map(p=>p.x))-x,height:Math.max(...values.map(p=>p.y))-y}
}
export function svgPaintResolver(ids:Map<string,Element>,rules:SvgRule[]){
  const cache=new Map<Element,Record<string,string>>()
  function computed(element:Element):Record<string,string>{const saved=cache.get(element);if(saved)return saved;const parent=element.parentNode;const style=svgStyle(element,parent?.nodeType===1?computed(parent as Element):{},rules);cache.set(element,style);return style}
  return function resolve(value:string,current:string,matrix:Affine,box:Pick<FigureNode,'x'|'y'|'width'|'height'>,sourceBox:ReturnType<typeof svgPathBounds>,view:{width:number;height:number}):{color:string;alpha:number;gradient?:LinearGradient}{
    if(!/^url\s*\(/i.test(value))return svgColor(value,current)
    const ref=/^url\(\s*['"]?#([^'"\s)]+)['"]?\s*\)$/.exec(value)
    if(!ref)throw new Error('渐变必须引用当前 SVG 文件内的定义，暂不支持外部资源或备用填色')
    let element=ids.get(ref[1]!),stops:Element[]|undefined;const attrs:Record<string,string>={},seen=new Set<Element>();const original=element
    while(element){
      if(tag(element)!=='linearGradient')throw new Error('暂只支持线性渐变，径向渐变与图案请先转换')
      if(seen.has(element)||seen.size>=16)throw new Error('SVG 渐变引用循环或层级过深');seen.add(element)
      for(const key of ['x1','y1','x2','y2','gradientUnits','gradientTransform','spreadMethod'])if(attrs[key]===undefined&&element.hasAttribute(key))attrs[key]=element.getAttribute(key)!
      const own=children(element).filter(e=>!['title','desc','metadata'].includes(tag(e)));if(own.some(e=>tag(e)!=='stop'))throw new Error('渐变定义只能包含颜色停靠点')
      if(!stops&&own.length)stops=own
      const href=element.getAttribute('href')||element.getAttribute('xlink:href');if(!href)break
      if(!href.startsWith('#')||!ids.has(href.slice(1)))throw new Error('SVG 渐变引用不存在或不是本地定义')
      element=ids.get(href.slice(1))
    }
    if(!original)throw new Error('SVG 渐变定义不存在')
    let previous=0
    const colors=(stops??[]).map(e=>{const style=computed(e),color=svgColor(style['stop-color']??'#000000',style.color),offset=Math.max(previous,Math.max(0,Math.min(1,length(e.getAttribute('offset'),1))));previous=offset;if(color.color==='none')throw new Error('渐变停靠点不能使用 none');return{offset,color:color.color,opacity:color.alpha*Math.max(0,Math.min(1,length(style['stop-opacity'],1,16,1)))}})
    if(colors.length>32)throw new Error('渐变停靠点超过 32 个，请先精简')
    if(!colors.length)return{color:'none',alpha:1}
    const object=attrs.gradientUnits===undefined||attrs.gradientUnits==='objectBoundingBox'
    if(!object&&attrs.gradientUnits!=='userSpaceOnUse')throw new Error('SVG 渐变坐标单位无效')
    if(object&&(!sourceBox.width||!sourceBox.height))return{color:'none',alpha:1}
    const x1=length(attrs.x1,object?1:view.width,16,0),y1=length(attrs.y1,object?1:view.height,16,0),x2=length(attrs.x2,object?1:view.width,16,object?1:view.width),y2=length(attrs.y2,object?1:view.height,16,0),dx=x2-x1,dy=y2-y1,d=dx*dx+dy*dy
    if(colors.length===1||!d){const last=colors.at(-1)!;return{color:last.color,alpha:last.opacity}}
    const transform=parseTransform(attrs.gradientTransform??''),local=object?multiply([sourceBox.width,0,0,sourceBox.height,sourceBox.x,sourceBox.y],transform):transform
    const vector=gradientFromSource([dx/d,dy/d,-(x1*dx+y1*dy)/d],multiply(matrix,local),box)
    const gradient=linearGradientSchema.parse({type:'linear',vector,stops:colors,spread:attrs.spreadMethod??'pad',interpolation:computed(original)['color-interpolation']??'sRGB'})
    return{color:colors[0]!.color,alpha:1,gradient}
  }
}
