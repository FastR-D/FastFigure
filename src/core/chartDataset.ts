import { z } from 'zod'
import { parseDelimitedTable } from './delimitedTable.ts'
import { rawChartDatasetShape,checkRawChartDataset,chartPreparationSchema,numericCell,type ChartPreparation } from './chartDatasetContract.ts'
import { pivotChartData } from './chartPivot.ts'
export { numericCell } from './chartDatasetContract.ts'

export const chartDatasetSchema=z.object({...rawChartDatasetShape,preparation:chartPreparationSchema.optional()}).strict().superRefine((data,ctx)=>{
  const{preparation,...raw}=data;checkRawChartDataset(raw,ctx)
  if(preparation){if(preparation.operation.errorColumn&&!data.errorLabel)ctx.addIssue({code:'custom',message:'已配对误差的附件须保留误差含义，或还原原表修改映射'});try{const result=pivotChartData(preparation);if(JSON.stringify([data.columns,data.rows])!==JSON.stringify([result.columns,result.rows]))throw new Error('整理附件与原始长表不一致，请还原或解除绑定后编辑')}catch(error){ctx.addIssue({code:'custom',message:(error as Error).message})}}
  if(JSON.stringify(data).length>48_000)ctx.addIssue({code:'custom',message:'含原始来源的数据附件最多 48,000 字符'})
})
export type ChartDataset=z.infer<typeof chartDatasetSchema>
export const datasetInfoSchema=z.object({name:z.string().max(80),visualizationGoal:rawChartDatasetShape.visualizationGoal,rows:z.number().int().min(2).max(480),columns:z.number().int().min(2).max(12),origin:z.enum(['example','user']),sampleMeaning:z.enum(['raw-observations','summaries']).optional()}).strict()
export const datasetInfo=(data:ChartDataset)=>({name:data.name,...(data.visualizationGoal?{visualizationGoal:data.visualizationGoal}:{}),rows:data.rows.length,columns:data.columns.length,origin:data.origin,...(data.sampleMeaning?{sampleMeaning:data.sampleMeaning}:{})})
export function parseChartDataset(text:string,metadata:Omit<ChartDataset,'version'|'columns'|'rows'>):ChartDataset{
  const [columns,...rows]=parseDelimitedTable(text,480)
  return chartDatasetSchema.parse({version:1,...metadata,columns,rows})
}
export function preparedChartDataset(preparation:ChartPreparation):ChartDataset{
  const result=pivotChartData(preparation)
  return chartDatasetSchema.parse({...result.preparation.source,columns:result.columns,rows:result.rows,preparation:result.preparation})
}
export function profileChartDataset(input:ChartDataset){
  const data=chartDatasetSchema.parse(input),prepared=data.preparation?pivotChartData(data.preparation):undefined
  return{...datasetInfo(data),...(prepared?{preparation:prepared.mapping}:{}),fields:data.columns.map((name,i)=>{
    const cells=data.rows.map(row=>row[i]!),present=cells.filter(cell=>cell!==''),numbers=present.map(numericCell),numeric=numbers.filter((value):value is number=>value!==null)
    const type:'empty'|'number'|'mixed'|'category'=!present.length?'empty':numeric.length===present.length?'number':numeric.length?'mixed':'category'
    const id=`c${i}`,group=prepared?.groups.find(group=>group.column===id),errorFor=prepared?.groups.find(group=>group.errorColumn===id)
    return{id,name,type,...(prepared?{role:i===0?'row-key':group?'value':'error',...(errorFor?{pairedValueColumn:errorFor.column}:{})}:{}),missing:cells.length-present.length,distinct:new Set(present).size,sample:[...new Set(present)].slice(0,5),...(type==='number'?{min:Math.min(...numeric),max:Math.max(...numeric),monotonic:numeric.every((value,j)=>j===0||value>=numeric[j-1]!)}:{})}
  })}
}
