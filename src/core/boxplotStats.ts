import type { DataChartSpec } from './dataChartSchema.ts'
import { boxplotReportSchema,boxplotRulesSchema,type BoxplotReport } from './boxplotContract.ts'

/** Type-7 linear sample quantiles. Input is sorted privately, never altered or resampled. */
export function summarizeBoxSamples(values:readonly(number|null)[]){
  if(values.length<2||values.length>80||values.some(v=>v!==null&&(!Number.isFinite(v)||Math.abs(v)>1e12)))throw new Error('箱线图需 2–80 行有限原始观测，空值请留白')
  const sorted=values.filter((v):v is number=>v!==null).sort((a,b)=>a-b),n=sorted.length
  if(n<2)throw new Error('每组至少需要 2 个有效原始样本，不能用汇总统计量替代')
  const quantile=(p:number)=>{const h=(n-1)*p,index=Math.floor(h),fraction=h-index,a=sorted[index]!,b=sorted[Math.min(index+1,n-1)]!;return fraction<.5?a+(b-a)*fraction:b-(b-a)*(1-fraction)}
  const q1=quantile(.25),median=quantile(.5),q3=quantile(.75),iqr=q3-q1,lower=q1-1.5*iqr,upper=q3+1.5*iqr,inside=sorted.filter(v=>v>=lower&&v<=upper),outlierIndices=values.flatMap((v,i)=>v!==null&&(v<lower||v>upper)?[i]:[])
  return{n,missing:values.length-n,min:sorted[0]!,q1,median,q3,max:sorted[n-1]!,whiskerLow:inside[0]!,whiskerHigh:inside.at(-1)!,outlierIndices}
}
export function boxplotReport(spec:DataChartSpec):BoxplotReport{
  if(spec.kind!=='boxplot'||!spec.boxplot||spec.showSamples===undefined)throw new Error('请选择声明为原始观测的箱线图数据')
  return boxplotReportSchema.parse({rules:boxplotRulesSchema.parse(spec.boxplot),rawPointsShown:spec.showSamples,outliersShown:true,groups:spec.series.map(row=>{const{outlierIndices,...summary}=summarizeBoxSamples(row.values);return{name:row.name,...summary,outliers:outlierIndices.length}})})
}
