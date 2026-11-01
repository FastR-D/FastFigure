import { z } from 'zod'

const line=z.string().trim().regex(/^[^\r\n\t]*$/,'字段须为单行文字')
export const rawChartDatasetShape={version:z.literal(1),name:line.min(1).max(80),visualizationGoal:z.string().trim().min(1).max(2000).optional(),columns:z.array(line.min(1).max(40)).min(2).max(12),rows:z.array(z.array(line.max(160)).min(2).max(12)).min(2).max(480),origin:z.enum(['example','user']),sampleMeaning:z.enum(['raw-observations','summaries']).optional(),errorLabel:line.max(80),note:line.max(100),dataSource:z.string().trim().max(500)}
export function checkRawChartDataset(data:{columns:string[];rows:string[][]},ctx:z.RefinementCtx){
  if(new Set(data.columns).size!==data.columns.length)ctx.addIssue({code:'custom',message:'数据列名不能重复'})
  if(data.rows.some(row=>row.length!==data.columns.length))ctx.addIssue({code:'custom',message:'每行列数须与表头一致'})
  if(JSON.stringify(data).length>24_000)ctx.addIssue({code:'custom',message:'原始数据最多 24,000 字符'})
}
export const rawChartDatasetSchema=z.object(rawChartDatasetShape).strict().superRefine(checkRawChartDataset)
export type RawChartDataset=z.infer<typeof rawChartDatasetSchema>
export const chartColumnSchema=z.string().regex(/^c(?:[0-9]|1[01])$/)
export const chartPivotOperationSchema=z.object({kind:z.literal('pivot'),rowColumns:z.array(chartColumnSchema).min(1,'至少选择一列行标识').max(3,'行标识最多三列'),groupColumns:z.array(chartColumnSchema).min(1,'至少选择一列组别').max(3,'组别最多三列'),valueColumn:chartColumnSchema,errorColumn:chartColumnSchema.optional()}).strict().refine(operation=>{const columns=[...operation.rowColumns,...operation.groupColumns,operation.valueColumn,...(operation.errorColumn?[operation.errorColumn]:[])];return new Set(columns).size===columns.length},'行标识、组别、数值与误差映射列须互不重复')
export type ChartPivotOperation=z.infer<typeof chartPivotOperationSchema>
export const chartPreparationSchema=z.object({source:rawChartDatasetSchema,operation:chartPivotOperationSchema}).strict()
export type ChartPreparation=z.infer<typeof chartPreparationSchema>
export const chartDataSelectionSchema=z.object({xColumn:chartColumnSchema,labelColumn:chartColumnSchema.optional(),series:z.array(z.object({column:chartColumnSchema,errorColumn:chartColumnSchema.optional()}).strict()).min(1).max(12)}).strict()
export const chartPreparedSourceSchema=z.object({preparation:chartPreparationSchema,selection:chartDataSelectionSchema}).strict()
export type ChartPreparedSource=z.infer<typeof chartPreparedSourceSchema>
export function numericCell(raw:string):number|null{
  if(!raw||!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw))return null
  const value=Number(raw);return Number.isFinite(value)&&Math.abs(value)<=1e12?value:null
}
