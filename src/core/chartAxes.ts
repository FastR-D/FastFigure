import type { DataChartSpec } from './dataChartSchema.ts'
import type { ChartAxisScale,ChartAxesReport } from './chartAxisContract.ts'
import { chartDomain } from './chartDomain.ts'
import { formatChartValue } from './chartText.ts'

export function numericChartDomain(values:number[],scale:ChartAxisScale='linear',min?:number,max?:number,zero=false,axis='纵轴'){
  if(!values.length||values.some(v=>!Number.isFinite(v))||[min,max].some(v=>v!==undefined&&!Number.isFinite(v)))throw new Error(`${axis}需要有限数值`)
  if(scale==='linear'){
    let domain:ReturnType<typeof chartDomain>
    try{domain=chartDomain(values,min,max,zero)}catch(error){throw new Error((error as Error).message.replace('纵轴',axis),{cause:error})}
    return{...domain,scale,position:(value:number)=>(value-domain.min)/(domain.max-domain.min)}
  }
  if(zero||values.some(v=>v<=0)||min!==undefined&&min<=0||max!==undefined&&max<=0)throw new Error(`${axis} log10 对数坐标需要所有数值及误差下界大于 0；不会丢弃、截断或加偏移量`)
  const observedMin=Math.min(...values),observedMax=Math.max(...values)
  if(min!==undefined&&min>observedMin||max!==undefined&&max<observedMax)throw new Error(`${axis}范围会截断数据或误差棒，请扩大范围`)
  let low=min??10**Math.floor(Math.log10(observedMin)),high=max??10**Math.ceil(Math.log10(observedMax))
  if(min===undefined&&low>observedMin)low/=10
  if(max===undefined&&high<observedMax)high*=10
  if(low===0)low=observedMin
  if(low===high){if(min===undefined)low=Math.max(Number.MIN_VALUE,low/10);if(max===undefined)high*=10}
  const logMin=Math.log10(low),logMax=Math.log10(high),span=logMax-logMin
  if(!Number.isFinite(low)||!Number.isFinite(high)||!(high>low)||!(span>0))throw new Error(`${axis}对数坐标精度不足，请扩大范围`)
  const first=Math.ceil(logMin),last=Math.floor(logMax),powers=last-first+1
  let ticks:number[]=[]
  if(powers<=3){
    for(let power=Math.floor(logMin);power<=Math.ceil(logMax);power++)for(const multiple of [1,2,5]){const value=multiple*10**power;if(value>0&&value>=low&&value<=high)ticks.push(value)}
  }else{
    const stride=Math.max(1,Math.ceil(powers/8))
    for(let power=first;power<=last;power+=stride){const value=10**power;if(value>=low&&value<=high)ticks.push(value)}
    const end=10**last;if(end>0&&end>=low&&end<=high&&ticks.at(-1)!==end)ticks.push(end)
  }
  if(ticks.length<2)ticks=[low,high]
  ticks=[...new Set(ticks)].sort((a,b)=>a-b)
  if(new Set(ticks.map(formatChartValue)).size!==ticks.length)throw new Error(`${axis}对数刻度精度不足，请扩大范围`)
  return{scale,min:low,max:high,ticks,position:(value:number)=>(Math.log10(value)-logMin)/span}
}

/** Raw-value error endpoints are transformed individually; the input observations never change. */
export function chartDomains(spec:DataChartSpec){
  if(spec.kind==='heatmap')throw new Error('热图使用独立数值色标，不使用坐标变换')
  const extremes=spec.series.flatMap(s=>s.values.flatMap((v,i)=>v===null?[]:[v-(s.errors?.[i]??0),v+(s.errors?.[i]??0)]))
  return{y:numericChartDomain(extremes,spec.yScale,spec.yMin,spec.yMax,spec.kind==='bar'),x:spec.xMode==='numeric'?numericChartDomain(spec.x as number[],spec.xScale,spec.xMin,spec.xMax,false,'横轴'):undefined}
}
export function chartAxesReport(spec:DataChartSpec):ChartAxesReport|undefined{
  if(spec.kind==='heatmap')return
  const{x,y}=chartDomains(spec)
  return{x:x?{scale:x.scale,min:x.min,max:x.max}:{scale:'category'},y:{scale:y.scale,min:y.min,max:y.max}}
}
export const chartAxisTitle=(title:string,scale?:ChartAxisScale)=>scale==='log10'?`${title?`${title} · `:''}log10`:title
