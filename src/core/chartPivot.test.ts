import { describe,expect,it } from 'vitest'
import { createHash } from 'node:crypto'
import { DOMParser } from '@xmldom/xmldom'
import oracle from './fixtures/pivot-oracle.json'
import { pivotChartData } from './chartPivot'
import { chartDatasetSchema,parseChartDataset,preparedChartDataset,profileChartDataset } from './chartDataset'
import {chartPreparationSchema,type ChartPreparation } from './chartDatasetContract'
import { parseChartRecommendationResponse } from './chartRecommendation'
import { buildDataChart,replaceDataChart } from './dataChart'
import { clone,createBlank,rootContainer } from './model'
import { captureComponent,componentDocument,scaleComponent } from './assets'
import { configureChartAsset } from './chartTool'
import { exportSvg } from './svg'
import { importSvg } from './svgImport'

const metadata={name:'Repeated runs',origin:'example' as const,sampleMeaning:'raw-observations' as const,errorLabel:'',note:'Development data',dataSource:'Authored'}
const source=()=>parseChartDataset('Run,Method,Accuracy (%),Dataset\nr2,Ours,82,A\nr1,Baseline,0,A\nr2,Baseline,,A\nr1,Ours,81,A\nr3,Baseline,78,A\nr4,Ours,8.3e1,A\nr4,Baseline,79,A',metadata)
const operation={kind:'pivot' as const,rowColumns:['c0'],groupColumns:['c1'],valueColumn:'c2'}
const trace=():ChartPreparation=>({source:source(),operation})
const response=(recommendation:unknown)=>JSON.stringify({message:'Prepare or plot',recommendation})
const prepare=()=>({status:'prepare',operation,reason:'每个 Run / Method 唯一，将同一准确率指标展开为组列。',alternatives:[],cautions:['核对 Run 是否在同一数据集内唯一。']})
const ready=()=>({status:'ready',kind:'boxplot',xColumn:'c0',series:[{column:'c1'},{column:'c2'}],title:'Repeated-run distributions',xLabel:'Method',yLabel:'Accuracy (%)',paletteId:'figureforge-publication-soft',grid:true,showValues:false,showSamples:true,reason:'比较原始样本分布。',alternatives:[],cautions:[]})

describe('nonaggregating pivots against an offline pandas oracle',()=>{
  for(const row of oracle.cases)it(row.name,()=>{
    const raw=chartDatasetSchema.parse({version:1,...metadata,columns:['Run','Method','Value','Context'],rows:row.sourceRows}),saved=clone(raw),actual=pivotChartData({source:raw,operation})
    for(const key of ['columns','rows','sourceRows','blankValues','absentCells'] as const)expect(actual[key]).toEqual(row.expected[key])
    expect(actual.providedCells).toBe(raw.rows.length);expect(actual.unusedColumns).toEqual(['Context']);expect(raw).toEqual(saved)
    const recovered=actual.sourceRows.flatMap((r,i)=>r.flatMap((index,j)=>index===null?[]:[{index,row:[actual.rows[i]![0],actual.columns[j+1],actual.rows[i]![j+1]]}])).sort((a,b)=>a.index-b.index)
    expect(recovered.map(x=>x.row)).toEqual(raw.rows.map(r=>r.slice(0,3)))
  })
})
describe('reviewable long-table preparation with original-source binding',()=>{
  it('matches a pandas MultiIndex oracle and keeps each composite value/error pair through compilation, while rejecting re-pairing and source drift',()=>{
    const fixture=oracle.compositeCases[0]!,raw=chartDatasetSchema.parse({version:1,...metadata,sampleMeaning:'summaries',errorLabel:'Mean ± SE',columns:fixture.sourceColumns,rows:fixture.sourceRows}),preparation=chartPreparationSchema.parse({source:raw,operation:fixture.operation}),saved=clone(preparation),pivot=pivotChartData(preparation)
    for(const key of ['columns','rows','sourceRows','sourceColumns','blankValues','blankErrors','absentCells'] as const)expect(pivot[key]).toEqual(fixture.expected[key]);expect(pivot.unusedColumns).toEqual(['Note']);expect(preparation).toEqual(saved)
    const data=preparedChartDataset(preparation),recommendation={status:'ready',kind:'bar',xColumn:'c0',series:[{column:'c1',errorColumn:'c2'},{column:'c3',errorColumn:'c4'}],title:'Paired method comparison',xLabel:'Dataset / Model',yLabel:'Accuracy (%)',paletteId:'figureforge-publication-soft',grid:true,showValues:false,reason:'Compare provided summaries with their declared errors',alternatives:[],cautions:[]},compiled=parseChartRecommendationResponse(response(recommendation),createBlank(),data),spec=rootContainer(compiled.figure!).dataChart!.spec
    expect(spec.x).toEqual(['D1 · S','D2 · S','D1 · L']);expect(spec.series).toEqual([{name:'Base · fp16',values:[76,78,0],errors:[.5,.6,0]},{name:'Ours · fp16',values:[82,null,null],errors:[.4,null,null]}]);expect(spec.dataPreparation!.preparation).toEqual(preparation);expect(profileChartDataset(data).fields.map(f=>f.role)).toEqual(['row-key','value','error','value','error'])
    for(const series of [[{column:'c1'}],[{column:'c1',errorColumn:'c4'}],[{column:'c2',errorColumn:'c1'}]])expect(()=>parseChartRecommendationResponse(response({...recommendation,series}),createBlank(),data)).toThrow('配对')
    expect(()=>parseChartRecommendationResponse(response({...recommendation,kind:'scatter',xColumn:'c1',series:[{column:'c3',errorColumn:'c4'}]}),createBlank(),data)).toThrow('横向误差')
    expect(()=>chartDatasetSchema.parse({...data,errorLabel:''})).toThrow('保留误差含义')
    for(const [value,error] of [['','0.2'],['1','-1'],['1','bad']]){const invalid=clone(raw);invalid.rows[0]![4]=value!;invalid.rows[0]![5]=error!;expect(()=>pivotChartData({...preparation,source:invalid})).toThrow()}
    expect(()=>pivotChartData({...preparation,source:{...raw,rows:[...raw.rows,raw.rows[0]!]}})).toThrow('重复组合');expect(()=>pivotChartData({...preparation,source:{...raw,errorLabel:''}})).toThrow('误差含义')
    const copy=captureComponent(compiled.figure!,'stage','Saved paired chart');expect(rootContainer(copy.figure).dataChart!.spec.dataPreparation!.preparation).toEqual(preparation)
  })
  it('preserves first-seen order, exact numeric text, zeros, explicit blanks and absent combinations separately',()=>{
    const input=trace(),saved=clone(input),result=pivotChartData(input)
    expect(result.columns).toEqual(['Run','Ours','Baseline']);expect(result.rows).toEqual([['r2','82',''],['r1','81','0'],['r3','','78'],['r4','8.3e1','79']]);expect(result.sourceRows).toEqual([[0,2],[3,1],[null,4],[5,6]])
    expect(result).toMatchObject({providedCells:7,blankValues:1,absentCells:1,mapping:{row:'Run',group:'Method',value:'Accuracy (%)'},unusedColumns:['Dataset']});expect(input).toEqual(saved)
    const data=preparedChartDataset(input);expect(data.preparation).toEqual(input);expect(profileChartDataset(data)).toMatchObject({rows:4,columns:3,preparation:{value:'Accuracy (%)'}})
    expect(data.origin).toBe('example');expect(data.sampleMeaning).toBe('raw-observations')
  })
  it('rejects every duplicate pair, including equal values, blanks and hidden dataset differences',()=>{
    const input=trace(),saved=clone(input)
    for(const extra of [['r2','Ours','82','A'],['r2','Ours','83','B'],['r2','Ours','','A']])expect(()=>pivotChartData({...input,source:{...input.source,rows:[...input.source.rows,extra]}})).toThrow('不平均、求和或覆盖')
    expect(input).toEqual(saved)
  })
  it('does not collide when row/group labels contain separators',()=>{
    const data=parseChartDataset('Run,Group,Value\na|b,c,1\na,b|c,2',metadata),result=pivotChartData({source:data,operation})
    expect(result.rows).toEqual([['a|b','1',''],['a','','2']]);expect(result.absentCells).toBe(2)
    const raw=parseChartDataset('Dataset,Model,Method,Mode,Value\na · b,c,M,p,1\na,b · c,M,p,2',metadata),composite=pivotChartData({source:raw,operation:{kind:'pivot',rowColumns:['c0','c1'],groupColumns:['c2','c3'],valueColumn:'c4'}})
    expect(new Set(composite.rows.map(row=>row[0])).size).toBe(2);expect(composite.rowKeys).toEqual([['a · b','c'],['a','b · c']]);expect(composite.sourceRows).toEqual([[0],[1]])
  })
  it('rejects ambiguous aliases, missing identifiers, malformed values, error semantics and conflicting headers',()=>{
    const input=trace()
    expect(()=>pivotChartData({...input,operation:{...operation,valueColumn:'c11'}})).toThrow('存在的源列');expect(()=>pivotChartData({...input,operation:{...operation,groupColumns:['c0']}})).toThrow('互不重复')
    for(const [column,value] of [[0,''],[1,''],[2,'82%'],[2,'NaN'],[2,'1e13'],[1,'Run']] as const){const raw=clone(input.source);raw.rows[0]![column]=value;expect(()=>pivotChartData({source:raw,operation})).toThrow()}
    expect(()=>pivotChartData({...input,source:{...input.source,errorLabel:'Mean ± SD'}})).toThrow('配对的误差半宽列')
    expect(()=>pivotChartData({...input,source:{...input.source,rows:input.source.rows.map(r=>['same',...r.slice(1)])}})).toThrow()
  })
  it('keeps expanded and raw limits separate and never truncates an oversize result',()=>{
    const raw=parseChartDataset(`Run,Method,Value\n${Array.from({length:81},(_,i)=>`r${i},A,${i}`).join('\n')}`,metadata)
    expect(raw.rows).toHaveLength(81);expect(()=>pivotChartData({source:raw,operation})).toThrow('2–80')
    const groups=parseChartDataset(`Run,Method,Value\n${Array.from({length:24},(_,i)=>`r${i%2},g${Math.floor(i/2)},${i}`).join('\n')}`,metadata);expect(()=>pivotChartData({source:groups,operation})).toThrow('1–11')
    expect(()=>parseChartDataset(`A,B\n${Array.from({length:481},(_,i)=>`${i},${i}`).join('\n')}`,metadata)).toThrow('480')
  })
  it('validates prepared table/source consistency while allowing explicitly changed human metadata',()=>{
    const data=preparedChartDataset(trace()),saved=clone(data),changed=clone(data);changed.rows[0]![1]='999'
    expect(()=>chartDatasetSchema.parse(changed)).toThrow('原始长表不一致');expect(chartDatasetSchema.parse({...data,name:'Renamed',sampleMeaning:'summaries'})).toMatchObject({name:'Renamed',sampleMeaning:'summaries'});expect(data).toEqual(saved)
    expect(()=>preparedChartDataset({source:data,operation} as ChartPreparation)).toThrow()
  })
  it('returns only a program-computed preparation preview, leaving the canvas and source untouched',()=>{
    const data=source(),figure=createBlank(),saved=clone(figure),raw=clone(data),result=parseChartRecommendationResponse(response(prepare()),figure,data)
    expect(result.figure).toBeNull();expect(result.used).toEqual([]);expect(result.chartRecommendation).toMatchObject({compiled:false,recommendation:{status:'prepare'},preparation:trace()});expect(figure).toEqual(saved);expect(data).toEqual(raw)
    for(const patch of [{values:[1,2]},{aggregate:'mean'},{source:data},{rows:[['a','1']]},{operation:{...operation,filter:{Dataset:'A'}}}])expect(()=>parseChartRecommendationResponse(response({...prepare(),...patch}),figure,data)).toThrow('字段映射契约')
    expect(()=>parseChartRecommendationResponse(response(prepare()),figure,preparedChartDataset(trace()))).toThrow('已经整理')
  })
  it('compiles adopted data with source-bound selection and rejects numeric or source-selection drift',()=>{
    const data=preparedChartDataset(trace()),saved=clone(data),result=parseChartRecommendationResponse(response(ready()),createBlank(),data),spec=rootContainer(result.figure!).dataChart!.spec
    expect(spec.dataPreparation).toEqual({preparation:trace(),selection:{xColumn:'c0',series:[{column:'c1'},{column:'c2'}]}});expect(spec.series).toEqual([{name:'Ours',values:[82,81,null,83]},{name:'Baseline',values:[null,0,78,79]}]);expect(result.chartRecommendation.preparation).toEqual(trace());expect(data).toEqual(saved)
    const changed=clone(spec);changed.series[0]!.values[0]=999;expect(()=>buildDataChart(changed)).toThrow('原始长表不一致')
    expect(()=>buildDataChart({...spec,dataPreparation:{...spec.dataPreparation!,selection:{xColumn:'c0',series:[{column:'c2'},{column:'c1'}]}}})).toThrow('原始长表不一致')
    delete changed.dataPreparation;expect(()=>buildDataChart(changed)).not.toThrow()
  })
  it('preserves origin/raw declaration rules through preparation rather than allowing the model to assert them',()=>{
    const raw={...source(),sampleMeaning:undefined},data=preparedChartDataset({source:raw,operation});expect(data.sampleMeaning).toBeUndefined()
    expect(()=>parseChartRecommendationResponse(response(ready()),createBlank(),data)).toThrow('使用者确认')
    expect(()=>parseChartRecommendationResponse(response({...prepare(),sampleMeaning:'raw-observations'}),createBlank(),raw)).toThrow('字段映射契约')
  })
  it('retains raw long-table lineage through style tools, added notes, capture, scaling and SVG metadata',()=>{
    const result=parseChartRecommendationResponse(response(ready()),createBlank(),preparedChartDataset(trace())),spec=rootContainer(result.figure!).dataChart!.spec,asset=scaleComponent(buildDataChart(spec),.75)
    asset.figure.nodes.push({id:'owner-note',parentId:'stage',kind:'text',label:'Owner note',x:12,y:320,width:100,height:14});const saved=clone(asset),styled=configureChartAsset(asset,{showSamples:false,showValues:true,paletteId:'figureforge-tableau10'})
    expect(asset).toEqual(saved);expect(styled.use.preparation).toEqual(trace());expect(rootContainer(styled.asset.figure).dataChart!.spec.dataPreparation).toEqual(spec.dataPreparation);expect(styled.asset.figure.nodes.some(n=>n.label==='Owner note')).toBe(true)
    expect(()=>configureChartAsset(asset,{dataPreparation:undefined})).toThrow()
    const doc=componentDocument(styled.asset),captured=captureComponent(doc,'stage','Saved'),svg=exportSvg(doc),roundtrip=importSvg(svg,{fileName:'pivot.svg',sha256:createHash('sha256').update(svg).digest('hex'),parseXml:s=>new DOMParser().parseFromString(s,'image/svg+xml') as unknown as Document}).asset.figure
    expect(rootContainer(captured.figure).dataChart!.spec.dataPreparation).toEqual(spec.dataPreparation);expect(rootContainer(roundtrip).dataChart).toEqual(rootContainer(doc).dataChart)
    expect(replaceDataChart(doc,'stage',{...rootContainer(doc).dataChart!.spec,title:'Another title'}).document.nodes.some(n=>n.label==='Owner note')).toBe(true)
  })
})
