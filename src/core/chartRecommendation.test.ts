import {sharedLegendStates} from './sharedLegend'
import { describe,expect,it } from 'vitest'
import { parseChartDataset,preparedChartDataset,profileChartDataset } from './chartDataset'
import { chartRecommendationPrompt,parseChartRecommendationResponse } from './chartRecommendation'
import { buildDataChart,replaceDataChart } from './dataChart'
import { chartExample,chartTableText,parseChartTable } from './dataChartTable'
import { clone,createExample,rootContainer } from './model'
import { harnessRunInputSchema } from './harness'
import { chartRecommendationReportSchema } from './chartRecommendationContract'
import { captureComponent,componentDocument } from './assets'

const metadata={name:'Model evaluation',origin:'example' as const,errorLabel:'Mean ± SE',note:'Self-authored values',dataSource:'Authored test data'}
const source=()=>parseChartDataset('Model,Latency (ms),Accuracy (%),Accuracy_err\nA,12,76,0.5\nB,12,83,0.6\nC,40,,\nD,64,90,1',metadata)
const ready=()=>({status:'ready' as const,kind:'scatter' as const,xColumn:'c1',series:[{column:'c2',errorColumn:'c3'}],title:'Accuracy and latency',xLabel:'Latency (ms)',yLabel:'Accuracy (%)',paletteId:'figureforge-publication-soft',grid:true,showValues:false,reason:'两个连续变量的关系，不假定样本间有序连接。',alternatives:[{kind:'折线图',reason:'模型不是有序轨迹，连线会暗示顺序。'}],cautions:['横轴单位由表头填写，需人工核对。']})
const styleRef={index:1,id:'ref',title:'Style guide',purpose:'style' as const,citation:'Authored',fileName:'style.png',sha256:'a'.repeat(64),width:800,height:400}
const refNote={image:1,decision:'use',observation:'A clear style',application:'Use whitespace',uncertainty:''}
const response=(recommendation:unknown)=>JSON.stringify({message:'选图分析',recommendation})
const multiSource=()=>parseChartDataset('Model,Latency (ms),Accuracy (%),Accuracy_err,Memory (GB)\nA,12,76,0.5,3\nB,12,83,0.6,4\nC,40,,,5\nD,64,90,1,6',metadata)
const multiple=()=>({status:'multi-view' as const,title:'Model trade-offs',columns:2 as const,gap:24,views:[{caption:'Accuracy trade-off',chart:{...ready(),labelColumn:'c0'}},{caption:'Memory footprint',chart:{...ready(),kind:'bar' as const,xColumn:'c0',series:[{column:'c4'}],title:'Peak memory',xLabel:'Model',yLabel:'Memory (GB)'}}],reason:'关系与不同单位的内存对比需要互补视图，分别使用坐标。',alternatives:[],cautions:[]})
describe('data-first chart selection and native scatter',()=>{
  it('compiles complementary views from the same frozen rows with per-view uncertainty, editable groups and portable chart data',()=>{
    const data=multiSource(),saved=clone(data),original=createExample(),before=clone(original),result=parseChartRecommendationResponse(JSON.stringify({message:'Two views',recommendation:multiple(),referenceNotes:[refNote]}),original,data,[styleRef]),figure=result.figure!,report=result.chartRecommendation
    const charts=figure.containers.filter(c=>c.dataChart),first=charts[0]!.dataChart!.spec,second=charts[1]!.dataChart!.spec
    expect(first).toMatchObject({kind:'scatter',x:[12,12,40,64],pointLabels:['A','B','C','D'],series:[{name:'Accuracy (%)',values:[76,83,null,90],errors:[.5,.6,null,1]}],errorLabel:'Mean ± SE'})
    expect(second).toMatchObject({kind:'bar',x:['A','B','C','D'],series:[{name:'Memory (GB)',values:[3,4,5,6]}],errorLabel:'',note:metadata.note,dataSource:metadata.dataSource,origin:'example'})
    expect(second.series[0]).not.toHaveProperty('errors');expect(figure.containers.filter(c=>c.role==='panel').map(c=>c.title)).toEqual(['(a) Accuracy trade-off','(b) Memory footprint'])
    expect(report).toMatchObject({compiled:true,declaredErrorLabel:'Mean ± SE',views:[{containerId:charts[0]!.id,panelId:charts[0]!.parentId,errorLabel:'Mean ± SE',mapping:{unusedColumns:['Memory (GB)']}},{containerId:charts[1]!.id,panelId:charts[1]!.parentId,errorLabel:'',mapping:{unusedColumns:['Latency (ms)','Accuracy (%)','Accuracy_err']}}],referenceUse:[{id:'ref'}],panelLayout:{columns:2,rows:1}})
    expect(()=>chartRecommendationReportSchema.parse({...report,views:report.views!.slice(0,1)})).toThrow()
    expect(()=>chartRecommendationReportSchema.parse({...report,views:[report.views![0],report.views![0]]})).toThrow('标识')
    const portable=componentDocument(captureComponent(figure,'stage','Saved views'));expect(portable.containers.filter(c=>c.dataChart).map(c=>c.dataChart!.spec)).toEqual(charts.map(c=>c.dataChart!.spec))
    expect(data).toEqual(saved);expect(original).toEqual(before);expect(figure.references).toEqual(original.references)
  })
  it('reserves space and compiles shared series legends and axis ranges for comparable views',()=>{
    const base=multiple(),second={caption:'Accuracy versus memory',chart:{...base.views[0]!.chart,xColumn:'c4',xLabel:'Memory (GB)',title:'Accuracy versus memory'}}
    const recommendation={...base,alignPlots:true,sharedLegend:true,sharedY:true,views:[base.views[0]!,second]},data=multiSource(),before=clone(data),result=parseChartRecommendationResponse(response(recommendation),createExample(),data),group=result.figure!.containers.find(c=>c.sharedLegend)!
    expect(result.chartRecommendation.panelLayout!.plotAlignment).toMatchObject({columns:2,rows:1,changed:true});expect(result.figure!.containers.filter(c=>c.dataChart).every(c=>c.dataChart!.spec.plotArea)).toBe(true)
    expect(sharedLegendStates(result.figure!)[0]!.active).toBe(true);expect(result.chartRecommendation.panelLayout!.sharedLegend).toMatchObject({containerId:group.id,entries:['Accuracy (%)'],hiddenLocalNodes:4});expect(data).toEqual(before)
    expect(result.figure!.containers.filter(c=>c.dataChart).map(c=>c.dataChart!.spec.series[0]!.values)).toEqual([[76,83,null,90],[76,83,null,90]])
    expect(()=>chartRecommendationReportSchema.parse({...result.chartRecommendation,panelLayout:{...result.chartRecommendation.panelLayout,sharedLegend:undefined}})).toThrow('不一致')
  })
  it('keeps explicitly adopted pivot observations and fixed boxplot statistics in every view without a second transformation',()=>{
    const source=parseChartDataset('Run,Method,Accuracy (%)\nr2,Ours,82\nr1,Baseline,0\nr2,Baseline,\nr1,Ours,81\nr3,Baseline,78\nr3,Ours,84',{...metadata,errorLabel:'',sampleMeaning:'raw-observations'}),preparation={source,operation:{kind:'pivot' as const,rowColumns:['c0'],groupColumns:['c1'],valueColumn:'c2'}},data=preparedChartDataset(preparation)
    const chart={...ready(),xColumn:'c0',series:[{column:'c1'},{column:'c2'}],xLabel:'Run',yLabel:'Accuracy (%)'}
    const recommendation={...multiple(),sharedY:true,views:[{caption:'Distributions',chart:{...chart,kind:'boxplot',title:'Raw observations',showSamples:true}},{caption:'Individual runs',chart:{...chart,kind:'bar',title:'Per-run accuracy'}}]},result=parseChartRecommendationResponse(response(recommendation),createExample(),data),specs=result.figure!.containers.filter(c=>c.dataChart).map(c=>c.dataChart!.spec)
    expect(result.chartRecommendation.panelLayout?.sharedY).toMatchObject({yLabel:'Accuracy (%)',scale:'linear',changed:true});expect(result.chartRecommendation.views![0]!.axes!.y).toEqual(result.chartRecommendation.views![1]!.axes!.y);expect(specs[0]!.yMin).toBe(specs[1]!.yMin);expect(specs[0]!.yMax).toBe(specs[1]!.yMax)
    for(const spec of specs){expect(spec.x).toEqual(['r2','r1','r3']);expect(spec.series).toEqual([{name:'Ours',values:[82,81,84]},{name:'Baseline',values:[null,0,78]}]);expect(spec.dataPreparation).toEqual({preparation,selection:{xColumn:'c0',series:[{column:'c1'},{column:'c2'}]}})}
    expect(result.chartRecommendation.preparation).toEqual(preparation);expect(result.chartRecommendation.views![0]!.boxplot!.groups).toMatchObject([{name:'Ours',n:3,missing:0},{name:'Baseline',n:2,missing:1}])
    const transformed=clone(recommendation);Object.assign(transformed.views[1]!.chart,{operation:{kind:'pivot',rowColumns:['c0'],groupColumns:['c1'],valueColumn:'c2'}});expect(()=>parseChartRecommendationResponse(response(transformed),createExample(),data)).toThrow('契约')
  })
  it('rejects one bad view or an excessive combined mark budget atomically, without dropping rows or keeping a partial candidate',()=>{
    const data=multiSource(),saved=clone(data),original=createExample(),before=clone(original)
    expect(()=>parseChartRecommendationResponse(response({...multiple(),sharedY:true}),original,data)).toThrow('标题与单位')
    for(const patch of [{xColumn:'c11'},{values:[9,9]},{series:[{column:'c0'}]},{yMax:4}]){const recommendation=multiple();Object.assign(recommendation.views[1]!.chart,patch);expect(()=>parseChartRecommendationResponse(response(recommendation),original,data)).toThrow()}
    const dense=parseChartDataset(`X,Y\n${Array.from({length:80},(_,i)=>`${i},${i+1}`).join('\n')}`,{...metadata,errorLabel:''}),chart={...ready(),xColumn:'c0',series:[{column:'c1'}]},oversized={...multiple(),views:Array.from({length:4},(_,i)=>({caption:String(i+1),chart}))}
    expect(()=>parseChartRecommendationResponse(response(oversized),original,dense)).toThrow('组合超过 240')
    expect(data).toEqual(saved);expect(original).toEqual(before)
  })
  it('profiles original fields and missing values without guessing units, coercing mixed values or reducing duplicate rows',()=>{
    const data=source(),before=clone(data),profile=profileChartDataset(data)
    expect(profile).toMatchObject({rows:4,columns:4,fields:[{id:'c0',type:'category',missing:0},{id:'c1',type:'number',distinct:3,min:12,max:64,monotonic:true},{id:'c2',type:'number',missing:1},{id:'c3',type:'number',missing:1}]})
    expect(data).toEqual(before)
    expect(parseChartDataset('A,B\nx,1\n,\ny,2',metadata).rows).toEqual([['x','1'],['',''],['y','2']])
    const mixed=parseChartDataset('Kind,Value\na,12\nb,15%\nc,',metadata);expect(profileChartDataset(mixed).fields[1]).toMatchObject({type:'mixed',missing:1})
    const quoted=parseChartDataset('"Model, name",Value\n"A,B",1\nC,2',metadata);expect(quoted.rows[0]![0]).toBe('A,B')
  })
  it('rejects malformed, oversized or ambiguous input tables rather than truncating them',()=>{
    for(const text of ['A,A\n1,2\n3,4','A,B\n1,2,3\n4,5','A,B\n"1,2\n3,4','A,B\n1,2'])expect(()=>parseChartDataset(text,metadata)).toThrow()
    expect(()=>parseChartDataset(`X,Y\n${Array.from({length:481},(_,i)=>`${i},${i}`).join('\n')}`,metadata)).toThrow('最多 480')
  })
  it('keeps the imported research goal in snapshots and reports while models only choose mappings',()=>{
    const visualizationGoal='比较准确率与推理延迟的取舍\n标明每个模型的名称',data={...source(),visualizationGoal},saved=clone(data)
    const prompt=chartRecommendationPrompt(data,'补充要求：使用参考图的配色'),result=parseChartRecommendationResponse(response(ready()),createExample(),data)
    expect(profileChartDataset(data).visualizationGoal).toBe(visualizationGoal);expect(prompt).toContain(JSON.stringify(data));expect(result.chartRecommendation.dataset.visualizationGoal).toBe(visualizationGoal)
    expect(()=>parseChartRecommendationResponse(response({...ready(),visualizationGoal:'模型改写目标'}),createExample(),data)).toThrow('契约');expect(data).toEqual(saved)
    expect(()=>parseChartDataset('X,Y\n1,2\n3,4',{...metadata,visualizationGoal:'x'.repeat(2001)})).toThrow()
  })
  it('compiles a selected numeric mapping from exact source rows and exposes unused columns and review scope',()=>{
    const data=source(),saved=clone(data),original=createExample(),before=clone(original),result=parseChartRecommendationResponse(JSON.stringify({message:'Select',recommendation:{...ready(),fontFamily:'MiSans',fontSize:16},referenceNotes:[refNote]}),original,data,[styleRef])
    const spec=rootContainer(result.figure!).dataChart!.spec
    expect(spec).toMatchObject({fontFamily:'MiSans',fontSize:16});expect(result.chartRecommendation?.typography).toEqual({fontFamily:'MiSans',fontSize:16})
    expect(spec).toMatchObject({kind:'scatter',x:[12,12,40,64],series:[{name:'Accuracy (%)',values:[76,83,null,90],errors:[.5,.6,null,1]}],origin:metadata.origin,errorLabel:metadata.errorLabel,note:metadata.note,dataSource:metadata.dataSource})
    expect(result.figure!.nodes.some(n=>n.chart?.key?.endsWith('-line'))).toBe(false)
    expect(result.chartRecommendation).toMatchObject({compiled:true,mapping:{x:'Latency (ms)',series:[{name:'Accuracy (%)',error:'Accuracy_err'}],unusedColumns:['Model']},referenceUse:[{id:'ref',title:'Style guide',purpose:'style',decision:'use'}]})
    expect(data).toEqual(saved);expect(original).toEqual(before);expect(result.figure!.references).toEqual(original.references)
  })
  it('accepts an unsupported best form or ambiguous statistics as analysis only, without manufacturing a candidate',()=>{
    const recommendation={status:'needs-input',suggestedKind:'箱线图',reason:'比较独立重复实验的分布更适合箱线图，需要明确分组与原始样本。',questions:['这些行是原始重复样本还是聚合均值？'],alternatives:[],cautions:['不能从均值推断四分位数。']},result=parseChartRecommendationResponse(response(recommendation),createExample(),source())
    expect(result.figure).toBeNull();expect(result.chartRecommendation.compiled).toBe(false);expect(result.chartRecommendation.recommendation).toEqual(recommendation)
  })
  it('rejects invented fields or values, overlapping mappings, missing X and undefined error meaning atomically',()=>{
    const data=source(),saved=clone(data)
    for(const change of [{xColumn:'c11'},{series:[{column:'c1'}]},{series:[{column:'c2'},{column:'c2'}]},{values:[1,2,3,4]},{origin:'user'},{kind:'bar'}])expect(()=>parseChartRecommendationResponse(response({...ready(),...change}),createExample(),data)).toThrow()
    const missing=clone(data);missing.rows[1]![1]='';expect(()=>parseChartRecommendationResponse(response(ready()),createExample(),missing)).toThrow('未自动删除该行')
    expect(()=>parseChartRecommendationResponse(response(ready()),createExample(),{...data,errorLabel:''})).toThrow('使用者填写误差棒含义')
    expect(data).toEqual(saved)
  })
  it('includes the frozen dataset and style while rejecting incompatible request modes',()=>{
    const data=source(),prompt=chartRecommendationPrompt(data,'表达延迟与准确率关系',[styleRef])
    expect(prompt).toContain(JSON.stringify(data))
    const input={sessionId:crypto.randomUUID(),content:'Choose a chart',figure:createExample(),selectedIds:[],catalogue:[],chartData:data}
    expect(harnessRunInputSchema.safeParse(input).success).toBe(true)
    expect(harnessRunInputSchema.safeParse({...input,catalogue:[{kind:'recipe',id:'mlp'}]}).success).toBe(false)
  })
  it('draws eighty repeated-X observations with true coordinates, no connecting line and bounded error paths',()=>{
    const spec=chartExample('scatter');spec.x=Array.from({length:80},(_,i)=>Math.floor(i/2));spec.series=[{name:'Accuracy',values:spec.x.map((_,i)=>i),errors:spec.x.map(()=>.5)}]
    const asset=buildDataChart(spec),marks=asset.figure.nodes.filter(n=>n.chart?.key?.match(/^series-0-point-/)),errors=asset.figure.nodes.filter(n=>n.chart?.key?.includes('-errors'))
    expect(marks).toHaveLength(80);expect(marks[0]!.x).toBe(marks[1]!.x);expect(marks[1]!.y).toBeLessThan(marks[0]!.y);expect(errors).toHaveLength(4);expect(errors.every(n=>n.path!.points.length<=128)).toBe(true)
    expect(asset.figure.nodes.some(n=>n.chart?.key==='series-0-line')).toBe(false)
    expect(parseChartTable(`X,Y\n${spec.x.map((x,i)=>`${x},${i}`).join('\n')}`,'numeric','scatter').x).toEqual(spec.x)
    expect(()=>buildDataChart({...spec,kind:'line'})).toThrow()
  })
  it('keeps identities of scatter observations after row reorder and rejects deleting a connected observation',()=>{
    const spec=chartExample('scatter');spec.x=[1,1,3];spec.series=[{name:'A',values:[3,7,5]}]
    const asset=buildDataChart(spec),original=clone(asset.figure),first=original.nodes.find(n=>n.chart?.key==='series-0-point-0')!,second=original.nodes.find(n=>n.chart?.key==='series-0-point-1')!
    const changed={...clone(spec),x:[1,3,1],series:[{name:'A',values:[7,5,3]}]},result=replaceDataChart(original,'stage',changed).document
    expect(result.nodes.find(n=>n.chart?.key==='series-0-point-2')!.id).toBe(first.id);expect(result.nodes.find(n=>n.chart?.key==='series-0-point-0')!.id).toBe(second.id)
    original.edges.push({id:'e',source:first.id,target:second.id,sourcePort:'right',targetPort:'left'})
    expect(()=>replaceDataChart(original,'stage',{...clone(spec),x:[1,3],series:[{name:'A',values:[7,5]}]})).toThrow('外部连接')
  })
  it('maps row names directly from the source and preserves their observation identity through CSV editing and reorder',()=>{
    const result=parseChartRecommendationResponse(response({...ready(),labelColumn:'c0'}),createExample(),source()),figure=result.figure!,spec=rootContainer(figure).dataChart!.spec
    expect(spec.pointLabels).toEqual(['A','B','C','D']);expect(result.chartRecommendation.mapping).toMatchObject({labels:'Model',unusedColumns:[]})
    expect(figure.nodes.filter(n=>/^series-0-label-/.test(n.chart?.key??'')).map(n=>n.label)).toEqual(['A','B','D'])
    expect(parseChartTable(chartTableText(spec),'numeric','scatter').pointLabels).toEqual(spec.pointLabels)
    const point=figure.nodes.find(n=>n.chart?.key==='series-0-point-0')!,changed=clone(spec);changed.x[0]=13;changed.series[0]!.values[0]=78
    expect(replaceDataChart(figure,'stage',changed).document.nodes.find(n=>n.chart?.key==='series-0-point-0')!.id).toBe(point.id)
    expect(()=>parseChartRecommendationResponse(response({...ready(),labelColumn:'c1'}),createExample(),source())).toThrow('不同的列')
  })
})
