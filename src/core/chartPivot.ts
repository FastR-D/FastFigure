import { chartPreparationSchema,numericCell,type ChartPreparation,type ChartPreparedSource } from './chartDatasetContract.ts'

// Escape the separator within each component; tuple identity always uses JSON.
const keyLabel=(values:string[])=>values.length===1?values[0]!:values.map(value=>value.replaceAll('\\','\\\\').replaceAll('·','\\·')).join(' · ')
/** Reshape only: one source record per tuple pair. No aggregation or imputation. */
export function pivotChartData(input:ChartPreparation){
  const preparation=chartPreparationSchema.parse(input),{source,operation}=preparation
  const field=(alias:string)=>{const index=Number(alias.slice(1));if(index>=source.columns.length)throw new Error('行标识、组别、数值与误差须引用存在的源列');return index}
  const rowIndexes=operation.rowColumns.map(field),groupIndexes=operation.groupColumns.map(field),valueIndex=field(operation.valueColumn),errorIndex=operation.errorColumn?field(operation.errorColumn):undefined,indexes=[...rowIndexes,...groupIndexes,valueIndex,...(errorIndex===undefined?[]:[errorIndex])]
  if(source.errorLabel&&errorIndex===undefined)throw new Error('原表已有误差含义，请明确选择配对的误差半宽列；不能丢弃误差说明')
  if(errorIndex!==undefined&&!source.errorLabel)throw new Error('请选择已给定的误差半宽，并先由使用者填写误差含义；不从列名推断')
  const rowKeys:string[][]=[],groupKeys:string[][]=[],rowIds=new Map<string,number>(),groupIds=new Map<string,number>(),cells=new Map<string,number>();let blankValues=0,blankErrors=0
  source.rows.forEach((row,i)=>{
    const rowKey=rowIndexes.map(index=>row[index]!),groupKey=groupIndexes.map(index=>row[index]!),value=row[valueIndex]!,error=errorIndex===undefined?undefined:row[errorIndex]!
    if([...rowKey,...groupKey].some(part=>!part))throw new Error(`源表第 ${i+2} 行缺少复合行标识或组别；未删除该行`)
    if(keyLabel(rowKey).length>24||keyLabel(groupKey).length>24)throw new Error('完整行标识和组名最多 24 字，请明确缩写；不会截断复合键')
    const key=JSON.stringify([rowKey,groupKey]),previous=cells.get(key)
    if(previous!==undefined)throw new Error(`源表第 ${previous+2}、${i+2} 行重复组合「${keyLabel(rowKey)} / ${keyLabel(groupKey)}」；不平均、求和或覆盖`)
    if(value!==''&&numericCell(value)===null)throw new Error(`源表第 ${i+2} 行「${source.columns[valueIndex]}」不是有效数值，缺失值请留空`)
    if(error!==undefined&&error!==''){
      const halfWidth=numericCell(error)
      if(halfWidth===null||halfWidth<0)throw new Error(`源表第 ${i+2} 行误差须为非负的已给定半宽`)
    }
    if(value===''&&error!==undefined&&error!=='')throw new Error(`源表第 ${i+2} 行只有误差、没有数值，不能丢弃误差或补值`)
    if(value==='')blankValues++;if(error==='')blankErrors++
    cells.set(key,i)
    const rowId=JSON.stringify(rowKey),groupId=JSON.stringify(groupKey)
    if(!rowIds.has(rowId)){rowIds.set(rowId,rowKeys.length);rowKeys.push(rowKey)}
    if(!groupIds.has(groupId)){groupIds.set(groupId,groupKeys.length);groupKeys.push(groupKey)}
  })
  const groupLimit=errorIndex===undefined?11:5
  if(rowKeys.length<2||rowKeys.length>80||groupKeys.length>groupLimit)throw new Error(`整理结果需要 2–80 个行标识、1–${groupLimit} 个组${errorIndex===undefined?'':'（每组含数值与误差两列）'}；不截断原始记录`)
  const rowNames=rowKeys.map(keyLabel),groupNames=groupKeys.map(keyLabel),rowFields=rowIndexes.map(i=>source.columns[i]!),groupFields=groupIndexes.map(i=>source.columns[i]!),combinedHeader=rowFields.join(' · '),rowHeader=combinedHeader.length<=40?combinedHeader:'组合行标识'
  if(groupNames.includes(rowHeader))throw new Error('组名与行标识列名重复，请先明确重命名')
  const columns=[rowHeader],sourceColumns:number[]=[],groups:{name:string;key:string[];column:string;errorColumn?:string}[]=[],reserved=new Set([rowHeader,...groupNames])
  for(const [i,name]of groupNames.entries()){
    const column=`c${columns.length}`;columns.push(name);sourceColumns.push(valueIndex)
    let errorColumn:string|undefined
    if(errorIndex!==undefined){let header=`${name} · err`,suffix=2;while(reserved.has(header))header=`${name} · err ${suffix++}`;reserved.add(header);errorColumn=`c${columns.length}`;columns.push(header);sourceColumns.push(errorIndex)}
    groups.push({name,key:groupKeys[i]!,column,...(errorColumn?{errorColumn}:{})})
  }
  const sourceRows=rowKeys.map(row=>groupKeys.flatMap(group=>{const index=cells.get(JSON.stringify([row,group]))??null;return errorIndex===undefined?[index]:[index,index]}))
  const rows=rowNames.map((name,i)=>[name,...sourceRows[i]!.map((index,j)=>index===null?'':source.rows[index]![sourceColumns[j]!]!)])
  return{preparation,columns,rows,groups,rowKeys,groupKeys,sourceRows,sourceColumns,mapping:{row:combinedHeader,group:groupFields.join(' · '),rowColumns:rowFields,groupColumns:groupFields,value:source.columns[valueIndex]!,...(errorIndex===undefined?{}:{error:source.columns[errorIndex]!}),series:groups},providedCells:source.rows.length,blankValues,blankErrors,absentCells:rowKeys.length*groupKeys.length-source.rows.length,unusedColumns:source.columns.filter((_,i)=>!indexes.includes(i))}
}

export function checkPreparedChart(target:{xMode:'numeric'|'category';x:(string|number)[];pointLabels?:string[];errorLabel?:string;series:{name:string;values:(number|null)[];errors?:(number|null)[]}[];dataPreparation?:ChartPreparedSource}){
  if(!target.dataPreparation)return
  const{preparation,selection}=target.dataPreparation,pivot=pivotChartData(preparation)
  const index=(id:string)=>{const i=Number(id.slice(1));if(i>=pivot.columns.length)throw new Error('整理后的图表引用了不存在的列');return i}
  const x=index(selection.xColumn),labels=selection.labelColumn?index(selection.labelColumn):undefined,used=[x,...selection.series.flatMap(s=>[index(s.column),...(s.errorColumn?[index(s.errorColumn)]:[])]),...(labels!==undefined?[labels]:[])]
  if(new Set(used).size!==used.length)throw new Error('整理后的列映射不能重复')
  if(preparation.operation.errorColumn&&!target.errorLabel)throw new Error('已配对的误差须保留使用者声明的含义')
  const valuesById=new Map(pivot.groups.map(group=>[group.column,group])),errorIds=new Set(pivot.groups.flatMap(group=>group.errorColumn?[group.errorColumn]:[]))
  if(errorIds.has(selection.xColumn))throw new Error('整理后的误差列不能当作横轴数值')
  if(valuesById.get(selection.xColumn)?.errorColumn)throw new Error('当前不支持横向误差；请使用行标识作横轴，不丢弃其配对误差')
  for(const series of selection.series){const group=valuesById.get(series.column);if(!group||group.errorColumn!==series.errorColumn)throw new Error('整理后的数值与误差须按原表一一配对，不能丢弃、互换或把误差当作数值系列')}
  const values=(i:number)=>pivot.rows.map(row=>{if(row[i]==='')return null;const v=numericCell(row[i]!);if(v===null)throw new Error('整理后的数值列不是有效数值');return v})
  const expected={x:target.xMode==='numeric'?values(x):pivot.rows.map(row=>row[x]),series:selection.series.map(s=>({name:pivot.columns[index(s.column)]!,values:values(index(s.column)),...(s.errorColumn?{errors:values(index(s.errorColumn))}:{})})),...(labels!==undefined?{pointLabels:pivot.rows.map(row=>row[labels])}:{})}
  const actual={x:target.x,series:target.series,...(target.pointLabels?{pointLabels:target.pointLabels}:{})}
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('图表数值与已确认的原始长表不一致；手动改数据须先解除原表绑定')
}
