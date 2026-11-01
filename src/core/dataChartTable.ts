import { dataChartSpecSchema,type DataChartSpec } from './dataChartSchema.ts'
import { boxplotRules } from './boxplotContract.ts'

import { parseDelimitedTable } from './delimitedTable.ts'
export { parseDelimitedTable } from './delimitedTable.ts'

/** Empty numeric cells remain missing, never zero. */
export function parseChartTable(text:string,xMode:DataChartSpec['xMode'],kind:DataChartSpec['kind']='line'):Pick<DataChartSpec,'x'|'series'|'pointLabels'>{
  const rows=parseDelimitedTable(text,kind==='scatter'||kind==='boxplot'?80:kind==='heatmap'?12:20)
  const header=rows[0]!,body=rows.slice(1)
  if(header.length<2||header.length>(kind==='heatmap'?13:10)||header.some(h=>!h)||new Set(header).size!==header.length)throw new Error('表头需有行标识与不同的数值列；热图最多 12 列，点线 / 柱状最多 4 个系列')
  if(body.some(r=>r.length!==header.length))throw new Error('数据列数与表头不一致，请检查分隔符或引号')
  const numeric=(raw:string,line:number):number|null=>{
    if(raw==='')return null
    if(!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)||!Number.isFinite(Number(raw)))throw new Error(`第 ${line} 行包含无效数值「${raw.slice(0,30)}」；缺失值请留空`)
    return Number(raw)
  }
  if(kind==='heatmap'||kind==='boxplot'){
    if(kind==='boxplot'&&header.length>7)throw new Error('箱线图最多 6 个原始样本组')
    return{x:body.map((r,i)=>{if(!r[0])throw new Error(`第 ${i+2} 行缺少${kind==='boxplot'?'样本标识':'行标签'}`);return r[0]}),series:header.slice(1).map((name,j)=>({name,values:body.map((r,i)=>numeric(r[j+1]!,i+2))})),pointLabels:undefined}
  }
  const indexes=header.slice(1).map((name,i)=>({name,index:i+1})).filter(c=>c.name!=='_label'),values=indexes.filter(c=>!c.name.endsWith('_err'))
  if(values.length<1||values.length>4)throw new Error('需要 1–4 个数值系列；误差列使用同名 _err 后缀')
  if(indexes.filter(c=>c.name.endsWith('_err')).some(c=>!values.some(v=>v.name===c.name.slice(0,-4))))throw new Error('每个 _err 列都必须有对应的数值系列')
  const x=body.map((r,i)=>{if(!r[0])throw new Error(`第 ${i+2} 行缺少横轴值`);return xMode==='numeric'?numeric(r[0],i+2)!:r[0]})
  const series=values.map(c=>{const err=header.indexOf(`${c.name}_err`);return{name:c.name,values:body.map((r,i)=>numeric(r[c.index]!,i+2)),...(err>=0?{errors:body.map((r,i)=>numeric(r[err]!,i+2))}:{})}})
  const labelIndex=header.indexOf('_label')
  return{x,series,...(labelIndex>0?{pointLabels:body.map(row=>row[labelIndex]!)}:{pointLabels:undefined})}
}
export function chartTableText(spec:DataChartSpec){
  const quote=(v:string|number|null)=>v===null?'':/[\t\r\n"]/.test(String(v))?`"${String(v).replaceAll('"','""')}"`:String(v)
  const header=[spec.kind==='heatmap'?'Row':spec.kind==='boxplot'?'Sample':'X',...spec.series.flatMap(s=>[s.name,...(s.errors?[`${s.name}_err`]:[])]),...(spec.pointLabels?['_label']:[])]
  return[header,...spec.x.map((x,i)=>[x,...spec.series.flatMap(s=>[s.values[i]!,...(s.errors?[s.errors[i]!]:[])]),...(spec.pointLabels?[spec.pointLabels[i]!]:[])])].map(row=>row.map(quote).join('\t')).join('\n')
}
export function chartExample(kind:DataChartSpec['kind']):DataChartSpec{
  if(kind==='boxplot')return dataChartSpecSchema.parse({version:1,kind,xMode:'category',title:'Repeated-run distributions',xLabel:'Method',yLabel:'Accuracy (%)',x:Array.from({length:12},(_,i)=>`Run ${i+1}`),series:[{name:'Baseline',values:[76,78,77,79,80,78,77,76,79,78,77,93]},{name:'Ours',values:[82,84,83,85,84,83,82,84,85,83,84,null]},{name:'Variant',values:[79,80,81,79,82,81,80,79,81,82,80,81]}],boxplot:boxplotRules,showSamples:true,showValues:false,grid:true,errorLabel:'',note:'Self-authored raw observations',dataSource:'',origin:'example',paletteId:'figureforge-publication-soft'})
  if(kind==='heatmap')return dataChartSpecSchema.parse({version:1,kind,xMode:'category',title:'Confusion matrix',xLabel:'Predicted class',yLabel:'Actual class',valueLabel:'Count',x:['Class A','Class B','Class C'],series:[{name:'Class A',values:[82,6,0]},{name:'Class B',values:[8,73,null]},{name:'Class C',values:[0,9,91]}],showValues:true,grid:true,errorLabel:'',note:'Raw counts; not normalized',dataSource:'',origin:'example',paletteId:'heat-blue'})
  return dataChartSpecSchema.parse({version:1,kind,xMode:kind==='bar'?'category':'numeric',title:kind==='bar'?'Benchmark comparison':kind==='scatter'?'Latency and accuracy':'Learning curves',xLabel:kind==='bar'?'Dataset':kind==='scatter'?'Latency (ms)':'Training epoch',yLabel:'Accuracy (%)',x:kind==='bar'?['Dataset A','Dataset B','Dataset C']:[10,30,60,100],series:kind==='bar'?[{name:'Baseline',values:[76,70,65],errors:[1.2,1.4,1.3]},{name:'Ours',values:[83,78,74],errors:[.8,1,.9]}]:[{name:'Baseline',values:[68,73,77,80],errors:[1.1,.9,.8,.7]},{name:'Ours',values:[72,78,83,86],errors:[.9,.8,.7,.6]}],showValues:false,grid:true,errorLabel:'Mean ± SD',note:'',dataSource:'',origin:'example',paletteId:'figureforge-tableau10'})
}

export function chartScaleExample(kind:'line'|'scatter'):DataChartSpec{
  return dataChartSpecSchema.parse({version:1,kind,xMode:'numeric',xScale:'log10',yScale:'log10',title:'Scale and inference latency',xLabel:'Parameters (M)',yLabel:'Latency (ms)',x:[1,10,100,1000],pointLabels:['Tiny','Small','Medium','Large'],series:[{name:'Baseline',values:[.2,2,20,200]},{name:'Ours',values:[.1,1,10,100]}],showValues:false,grid:true,errorLabel:'',note:'Self-authored scale example',dataSource:'',origin:'example',paletteId:'figureforge-publication-soft'})
}
