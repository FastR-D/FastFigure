import { formatChartValue as format } from './chartText.ts'

export function chartDomain(values:number[],min?:number,max?:number,zero=false){
  let low=Math.min(...values,...(zero?[0]:[])),high=Math.max(...values,...(zero?[0]:[]))
  if(min!==undefined&&min>low||max!==undefined&&max<high)throw new Error('纵轴范围会截断数据或误差棒，请扩大范围')
  if(low===high){const pad=Math.abs(low)*.1||1;low-=pad;high+=pad}
  low=min??low;high=max??high
  if(!(high>low))throw new Error('坐标区间无效，请扩大范围')
  const raw=(high-low)/5,power=10**Math.floor(Math.log10(raw)),step=([1,2,2.5,5,10].find(v=>v*power>=raw)??10)*power
  low=min??Math.floor(low/step)*step;high=max??Math.ceil(high/step)*step
  const first=Math.ceil(low/step-1e-10)*step,ticks:number[]=[]
  if(first+step===first)throw new Error('坐标区间过窄，请扩大范围')
  for(let i=0;i<12;i++){const v=first+i*step;if(v>high+step*1e-8)break;ticks.push(Math.abs(v)<step*1e-8?0:v)}
  if(new Set(ticks.map(format)).size!==ticks.length)throw new Error('刻度精度不足，请扩大坐标范围')
  return{min:low,max:high,ticks}
}
