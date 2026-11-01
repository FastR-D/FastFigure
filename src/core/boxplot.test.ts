import { describe,expect,it } from 'vitest'
import { createHash } from 'node:crypto'
import { DOMParser } from '@xmldom/xmldom'
import oracle from './fixtures/boxplot-oracle.json'
import { summarizeBoxSamples,boxplotReport } from './boxplotStats'
import { boxplotRules } from './boxplotContract'
import { buildDataChart,replaceDataChart } from './dataChart'
import { chartExample,chartTableText,parseChartTable } from './dataChartTable'
import { clone,createBlank,parseDocument,rootContainer,type FigureNode } from './model'
import { captureComponent,componentDocument,scaleComponent } from './assets'
import { recolorChartSeries } from './paint'
import { exportSvg } from './svg'
import { importSvg } from './svgImport'
import { configureChartAsset } from './chartTool'
import { parseChartDataset,profileChartDataset } from './chartDataset'
import { parseChartRecommendationResponse } from './chartRecommendation'
import { describeCatalogue } from './catalogue'

describe('boxplot statistics against an offline NumPy linear-quantile oracle',()=>{
  for(const row of oracle.cases)it(row.name,()=>{
    const before=[...row.values],actual=summarizeBoxSamples(row.values)
    for(const key of ['n','missing','min','max','whiskerLow','whiskerHigh','outlierIndices'] as const)expect(actual[key]).toEqual(row.expected[key])
    for(const key of ['q1','median','q3'] as const)expect(Math.abs(actual[key]-row.expected[key])).toBeLessThanOrEqual(Math.max(1e-24,Math.abs(row.expected[key])*2e-15))
    expect(row.values).toEqual(before)
  })
  it('keeps inclusive fence observations as whiskers, and rejects absent, nonfinite or oversized samples',()=>{
    expect(summarizeBoxSamples([0,1,2,3,4,5,6,10.5])).toMatchObject({q1:1.75,q3:5.25,whiskerHigh:10.5,outlierIndices:[]})
    for(const values of [[1],[null,1],[NaN,2],[Infinity,2],[1e13,2],Array(81).fill(1)])expect(()=>summarizeBoxSamples(values)).toThrow()
  })
})

const absolute=(node:FigureNode)=>node.path!.points.map(p=>({x:node.x+p.x*node.width,y:node.y+p.y*node.height}))
const data=()=>parseChartDataset('Run,Baseline,Ours,Variant,Latency\nr1,0,2,4,12\nr2,1,3,4,15\nr3,2,4,4,18\nr4,3,5,4,20\nr5,4,6,4,24\nr6,5,7,4,27\nr7,6,8,4,30\nr8,20,,4,40',{name:'Repeated runs',origin:'example',sampleMeaning:'raw-observations',errorLabel:'',note:'Development raw observations',dataSource:'Authored'})
const recommendation=()=>({status:'ready',kind:'boxplot',xColumn:'c0',series:[{column:'c1'},{column:'c2'},{column:'c3'}],title:'Accuracy distributions',xLabel:'Method',yLabel:'Accuracy (%)',paletteId:'figureforge-publication-soft',grid:true,showValues:false,showSamples:true,reason:'比较重复实验的分布及离群点。',alternatives:[{kind:'原始点图',reason:'样本较少，保留原始点有助于审阅。'}],cautions:['不据此声称显著性。']})
const response=(r:unknown)=>JSON.stringify({message:'Use a descriptive boxplot',recommendation:r})

describe('native boxplots from human-declared raw observations',()=>{
  it('maps exact quartiles, whiskers, medians and every sample to a common numeric axis without vertical jitter',()=>{
    const spec=chartExample('boxplot');spec.x=Array.from({length:8},(_,i)=>`r${i}`);spec.series=[{name:'A',values:[0,1,2,3,4,5,6,20]}];spec.yMin=0;spec.yMax=20;spec.showValues=true
    const saved=clone(spec),asset=buildDataChart(spec),node=(key:string)=>asset.figure.nodes.find(n=>n.chart?.key===key)!,axis=absolute(node('axis-y')),top=axis[0]!.y,bottom=axis[1]!.y,y=(value:number)=>bottom-value/20*(bottom-top),box=node('series-0-box')
    expect(spec).toEqual(saved);expect(rootContainer(asset.figure).dataChart!.spec).toEqual(spec)
    expect(box.y).toBeCloseTo(y(5.25));expect(box.y+box.height).toBeCloseTo(y(1.75));expect(absolute(node('series-0-median')).every(p=>Math.abs(p.y-y(3.5))<1e-10)).toBe(true)
    expect(absolute(node('series-0-whiskers')).map(p=>p.y)).toEqual(expect.arrayContaining([y(0),y(6)]))
    for(let i=0;i<8;i++){const point=node(`series-0-sample-${i}`);expect(point.y+point.height/2).toBeCloseTo(y(spec.series[0]!.values[i]!))}
    expect(node('series-0-sample-7').name).toContain('outlier');expect(node('series-0-n').label).toBe('n=8');expect(node('series-0-median-value').label).toBe('3.5')
    expect(asset.figure.nodes.some(n=>n.label==='Quartiles: linear (type 7); whiskers: 1.5 IQR; outliers shown.')).toBe(true)
  })
  it('preserves nulls and all outliers when inlier overlays are hidden, with zero-IQR boxes at the true value',()=>{
    const spec=chartExample('boxplot');spec.x=Array.from({length:9},(_,i)=>`r${i}`);spec.series=[{name:'A',values:[0,0,0,0,0,0,0,6,null]}];spec.showSamples=false
    const asset=buildDataChart(spec),box=asset.figure.nodes.find(n=>n.chart?.key==='series-0-box')!
    expect(box.kind).toBe('path');expect(box.height).toBe(0);expect(asset.figure.nodes.filter(n=>n.chart?.key?.includes('-sample-')).map(n=>n.chart!.key)).toEqual(['series-0-sample-7'])
    expect(rootContainer(asset.figure).dataChart!.spec.series[0]!.values).toEqual(spec.series[0]!.values)
    expect(boxplotReport(spec)).toMatchObject({rules:boxplotRules,rawPointsShown:false,outliersShown:true,groups:[{n:8,missing:1,q1:0,median:0,q3:0,whiskerLow:0,whiskerHigh:0,outliers:1}]})
  })
  it('never clips outliers or infers samples from errors, summaries or incompatible fields',()=>{
    const spec=chartExample('boxplot'),saved=clone(spec)
    for(const change of [{yMax:90},{yMin:77},{boxplot:undefined},{showSamples:undefined},{xMode:'numeric'},{errorLabel:'Mean ± SD'},{pointLabels:spec.x.map(String)},{boxplot:{...boxplotRules,quartiles:'hinges'}},{series:[{name:'A',values:spec.x.map(()=>null)}]},{series:[{...spec.series[0]!,errors:spec.x.map(()=>1)}]}])expect(()=>buildDataChart({...spec,...change} as typeof spec)).toThrow()
    expect(()=>buildDataChart({...chartExample('line'),showSamples:true})).toThrow('仅用于箱线图');expect(spec).toEqual(saved)
  })
  it('supports 80 rows and 6 groups without truncation, and explicitly rejects an over-capacity overlay',()=>{
    const spec=chartExample('boxplot');spec.x=Array.from({length:80},(_,i)=>`r${i}`);spec.series=Array.from({length:6},(_,j)=>({name:`Group ${j}`,values:spec.x.map((_,i)=>i+j)}));spec.showSamples=false
    const asset=buildDataChart(spec);expect(asset.figure.nodes.length).toBeLessThanOrEqual(240);expect(boxplotReport(spec).groups.every(g=>g.n===80)).toBe(true)
    expect(()=>buildDataChart({...spec,showSamples:true})).toThrow('240');expect(()=>buildDataChart({...spec,series:[...spec.series,{name:'Overflow',values:spec.series[0]!.values}]})).toThrow('最多 6')
    expect(()=>parseChartTable(`Sample,A\n${Array.from({length:81},(_,i)=>`r${i},${i}`).join('\n')}`,'category','boxplot')).toThrow('80')
  })
  it('round-trips literal sample/group names and missing cells without interpreting _err or _label as statistics',()=>{
    const parsed=parseChartTable('Run,Raw_err,_label\nz,0,1\na,,3\nb,2,4','category','boxplot'),spec={...chartExample('boxplot'),...parsed}
    expect(parsed).toMatchObject({x:['z','a','b'],series:[{name:'Raw_err',values:[0,null,2]},{name:'_label',values:[1,3,4]}]});expect(parseChartTable(chartTableText(spec),'category','boxplot')).toEqual(parsed)
    expect(()=>buildDataChart({...spec,x:['z','z','b']})).toThrow('不能重复');expect(()=>parseChartTable('Run,A\n,1\nb,2','category','boxplot')).toThrow('样本标识')
  })
  it('keeps sample/group identities and horizontal jitter after reordered rows and columns, protecting connected marks',()=>{
    const spec=chartExample('boxplot');spec.showValues=true
    const doc=componentDocument(buildDataChart(spec)),point=doc.nodes.find(n=>n.chart?.key==='series-0-sample-0')!,box=doc.nodes.find(n=>n.chart?.key==='series-1-box')!,medianLabel=doc.nodes.find(n=>n.chart?.key==='series-0-median-value')!,changed=clone(spec);changed.x.reverse();changed.series.reverse();changed.series.forEach(s=>s.values.reverse())
    const result=replaceDataChart(doc,'stage',changed).document
    expect(result.nodes.find(n=>n.chart?.key==='series-2-sample-11')!.id).toBe(point.id);expect(result.nodes.find(n=>n.chart?.key==='series-2-median-value')!.id).toBe(medianLabel.id)
    const reordered=replaceDataChart(doc,'stage',{...spec,x:[...spec.x].reverse(),series:spec.series.map(s=>({...s,values:[...s.values].reverse()}))}).document
    expect(reordered.nodes.find(n=>n.id===point.id)!.x).toBe(point.x)
    doc.edges.push({id:'e',source:point.id,target:box.id,sourcePort:'right',targetPort:'left'});const saved=clone(doc)
    expect(()=>replaceDataChart(doc,'stage',{...spec,showSamples:false})).toThrow('外部连接');expect(doc).toEqual(saved)
  })
  it('protects a connected box from conversion to a zero-height path',()=>{
    const spec=chartExample('boxplot'),doc=componentDocument(buildDataChart(spec)),box=doc.nodes.find(n=>n.chart?.key==='series-0-box')!,point=doc.nodes.find(n=>n.chart?.key==='series-0-sample-0')!
    doc.edges.push({id:'e',source:box.id,target:point.id,sourcePort:'right',targetPort:'left'});const saved=clone(doc)
    expect(()=>replaceDataChart(doc,'stage',{...spec,series:spec.series.map(s=>({...s,values:s.values.map(v=>v===null?null:0)}))})).toThrow('变为路径');expect(doc).toEqual(saved)
  })
  it('preserves added notes, raw input and statistical rules through recoloring, scaling, capture and SVG round trips',()=>{
    const doc=componentDocument(scaleComponent(buildDataChart(chartExample('boxplot')),.75)),root=rootContainer(doc);doc.nodes.push({id:'note',parentId:'stage',kind:'text',label:'Owner note',x:root.x+12,y:root.y+root.height-20,width:100,height:14})
    const raw=clone(root.dataChart!.spec);recolorChartSeries(doc,'figureforge-tableau10');expect(root.dataChart!.spec.series).toEqual(raw.series);expect(root.dataChart!.spec.boxplot).toEqual(boxplotRules)
    const changed=replaceDataChart(doc,'stage',{...root.dataChart!.spec,showSamples:false,showValues:true}).document;expect(changed.nodes.find(n=>n.id==='note')).toEqual(doc.nodes.find(n=>n.id==='note'));expect(()=>parseDocument(changed)).not.toThrow()
    const asset=captureComponent(changed,'stage','Saved boxplot'),svg=exportSvg(changed),roundtrip=importSvg(svg,{fileName:'boxplot.svg',sha256:createHash('sha256').update(svg).digest('hex'),parseXml:s=>new DOMParser().parseFromString(s,'image/svg+xml') as unknown as Document}).asset.figure
    expect(rootContainer(asset.figure).dataChart!.spec.series).toEqual(raw.series);expect(rootContainer(roundtrip).dataChart).toEqual(rootContainer(changed).dataChart)
  })
  it('exposes only source-backed boxplot styling and computes a trustworthy run report from the unchanged samples',()=>{
    const asset=buildDataChart(chartExample('boxplot')),saved=clone(asset),result=configureChartAsset(asset,{kind:'boxplot',showSamples:false,showValues:true,yMin:70,yMax:100,paletteId:'figureforge-tableau10'})
    expect(asset).toEqual(saved);expect(rootContainer(result.asset.figure).dataChart!.spec.series).toEqual(rootContainer(asset.figure).dataChart!.spec.series);expect(result.use.boxplot).toMatchObject({rules:boxplotRules,rawPointsShown:false,groups:[{n:12,outliers:1},{n:11,missing:1},{n:12}]})
    for(const patch of [{kind:'bar'},{kind:'heatmap'},{yMax:90},{boxplot:boxplotRules},{quartiles:'hinges'},{median:90},{outliersShown:false},{series:[]}])expect(()=>configureChartAsset(asset,patch)).toThrow()
    expect(()=>configureChartAsset(buildDataChart(chartExample('line')),{kind:'boxplot'})).toThrow('分布含义不同')
    const entry={kind:'asset' as const,asset},capability=describeCatalogue([entry])[0]!.chartOptions!;expect(capability.kind).toEqual(['boxplot']);expect(capability.fields).toContain('showSamples');expect(capability.fields).not.toContain('boxplot')
  })
  it('maps only selected raw columns and reports program-derived n, missing, quantiles and outliers',()=>{
    const raw=data(),before=clone(raw),result=parseChartRecommendationResponse(response(recommendation()),createBlank(),raw),spec=rootContainer(result.figure!).dataChart!.spec
    expect(raw).toEqual(before);expect(spec).toMatchObject({kind:'boxplot',x:raw.rows.map(r=>r[0]),boxplot:boxplotRules,showSamples:true,note:raw.note,origin:'example',dataSource:'Authored'})
    expect(spec.series).toEqual(raw.columns.slice(1,4).map((name,j)=>({name,values:raw.rows.map(row=>row[j+1]===''?null:Number(row[j+1]))})))
    expect(result.chartRecommendation).toMatchObject({compiled:true,dataset:{sampleMeaning:'raw-observations'},mapping:{x:'Run',unusedColumns:['Latency']},boxplot:{rules:boxplotRules,outliersShown:true,groups:[{name:'Baseline',n:8,q1:1.75,median:3.5,q3:5.25,whiskerHigh:6,outliers:1},{name:'Ours',n:7,missing:1},{name:'Variant',n:8,q1:4,q3:4}]}})
  })
  it('requires the human raw-sample declaration and rejects model statistical or filtering fields atomically',()=>{
    const raw=data(),saved=clone(raw),r=recommendation()
    for(const meaning of [undefined,'summaries'] as const)expect(()=>parseChartRecommendationResponse(response(r),createBlank(),{...raw,sampleMeaning:meaning})).toThrow('使用者确认')
    for(const patch of [{showSamples:undefined},{sampleMeaning:'raw-observations'},{q1:70},{median:80},{quartiles:'hinges'},{dropOutliers:true},{values:[1,2]},{labelColumn:'c4'},{series:[{column:'c1',errorColumn:'c2'}]},{series:[{column:'c1'},{column:'c1'}]}])expect(()=>parseChartRecommendationResponse(response({...r,...patch}),createBlank(),raw)).toThrow()
    expect(()=>parseChartRecommendationResponse(response(r),createBlank(),{...raw,errorLabel:'Mean ± SD'})).toThrow('误差');expect(raw).toEqual(saved)
    expect(profileChartDataset(raw).sampleMeaning).toBe('raw-observations')
    const needs=parseChartRecommendationResponse(response({status:'needs-input',suggestedKind:'箱线图',reason:'需要确认原始样本。',questions:['是否为逐次原始观测？'],alternatives:[],cautions:[]}),createBlank(),{...raw,sampleMeaning:undefined});expect(needs.figure).toBeNull();expect(needs.chartRecommendation.compiled).toBe(false)
  })
})
