import type { FigureNode } from './model.ts'
import type {DataChartSpec} from './dataChartSchema.ts'

export type ChartRole=NonNullable<FigureNode['chart']>['role']
export type ChartAdd=(key:string,node:Omit<FigureNode,'id'|'parentId'>,role:ChartRole,series?:number,channels?:NonNullable<FigureNode['chart']>['channels'])=>FigureNode
export const textWidth=(text:string,size:number,family='MiSans')=>[...text].reduce((sum,c)=>sum+size*(c.codePointAt(0)!>255?1:family==='JetBrains Mono'?.6:/[ilI .,:;'!]/.test(c)?.34:/[MW@%]/.test(c)?1.05:/[mw]/.test(c)?.9:/[A-Z]/.test(c)?.8:.65),0)
export const formatChartValue=(v:number)=>Object.is(v,-0)?'0':Math.abs(v)>=1e6||v!==0&&Math.abs(v)<1e-4?v.toExponential(3).replace(/\.?0+e/,'e'):String(Number(v.toPrecision(12)))
export function wrapChartText(text:string,size:number,width:number,family='MiSans'){
  const lines:string[]=[];let remaining=text.trim()
  while(textWidth(remaining,size,family)>width){
    const chars=[...remaining];let end=1
    while(end<chars.length&&textWidth(chars.slice(0,end+1).join(''),size,family)<=width)end++
    const prefix=chars.slice(0,end).join(''),space=prefix.lastIndexOf(' ')
    let split=space>prefix.length/2?space:prefix.length
    for(const [open,close] of [['(',')'],['（','）'],['[',']'],['【','】']]){const start=remaining.lastIndexOf(open!,split-1),finish=remaining.indexOf(close!,start+1);if(start>0&&finish>=split&&textWidth(remaining.slice(start,finish+1),size,family)<=width)split=Math.min(split,start)}
    const before=[...remaining.slice(0,split)]
    if(/^[)）\]】,，.。:：;]/.test(remaining.slice(split))&&before.length>1)split-=before.at(-1)!.length
    lines.push(remaining.slice(0,split).trim());remaining=remaining.slice(split).trimStart()
  }
  if(remaining)lines.push(remaining)
  return lines
}
/** One text geometry implementation for all native chart compilers. */
export function chartText(add:ChartAdd,family='MiSans',scale=1){
  return(key:string,text:string,x:number,y:number,size=11,align:'left'|'center'|'right'='left',role:ChartRole='axis',angle=0,series?:number,color='#253447')=>{
    if(!text)return
    size*=scale
    const width=Math.max(2,textWidth(text,size,family)),start=align==='center'?-width/2:align==='right'?-width:0,c=Math.cos(angle),s=Math.sin(angle)
    const corners=[[start,-size],[start+width,-size],[start,size*.3],[start+width,size*.3]].map(([a,b])=>({x:x+c*a!-s*b!,y:y+s*a!+c*b!})),left=Math.min(...corners.map(p=>p.x))-1,top=Math.min(...corners.map(p=>p.y))-1,w=Math.max(...corners.map(p=>p.x))-left+1,h=Math.max(...corners.map(p=>p.y))-top+1
    return add(key,{kind:'text',label:text,x:left,y:top,width:w,height:h,textStyle:{family,size,align,color,weight:role==='annotation'&&key==='title'?600:400},textLayout:{x:(x-left)/w,y:(y-top)/h,matrix:[c,s||0,-s||0,c],baseline:'alphabetic'},visual:{fill:'none',stroke:'none'}},role,series,[])
  }
}

/** Deterministic layout estimates shared by browser and compiler; never measure with host fonts. */
export function chartTypographyMetrics(spec:Pick<DataChartSpec,'fontFamily'|'fontSize'>){
  const family=spec.fontFamily??'MiSans',base=spec.fontSize??10,scale=base/10,size=(value:number)=>value*scale,width=(text:string,value:number)=>textWidth(text,size(value),family),wrap=(text:string,value:number,available:number)=>wrapChartText(text,size(value),available,family)
  const footer=(values:string[],available:number)=>values.flatMap((text,index)=>wrap(text,10,available).map((text,line)=>({key:`note-${index}${line?`-line-${line}`:''}`,text})))
  // A vertical title occupies its own left strip; it may extend past the plot without touching the heading or notes.
  const axisFits=(text:string,center:number,rows:number,height=460)=>{const half=width(text,12)/2+1,upper=size(17)+8+size(17)*.3+8,lower=rows?height-Math.max(10,size(10)*.3+4)-(rows-1)*size(14)-size(10)-8:height-12;return center-half>=upper&&center+half<=lower}
  return{family,base,size,width,wrap,footer,axisFits,lineStep:size(14),titleY:size(17)+8,tickOffset:size(11)+7,axisX:size(12)+6}
}
export function chartTypography(spec:Pick<DataChartSpec,'fontFamily'|'fontSize'>,add:ChartAdd){const metrics=chartTypographyMetrics(spec);return{...metrics,label:chartText(add,metrics.family,metrics.base/10)}}
