import {describe,expect,it} from 'vitest'
import {DOMParser} from '@xmldom/xmldom'
import {createHash} from 'node:crypto'
import {clone,createExample,parseDocument,type FigureDocument} from './model'
import {harnessPrompt,harnessRunInputSchema,parseHarnessResponse} from './harness'
import {selectedReferenceInputs,resolveReferenceNotes,mergeReferenceUses,type ReferenceInputInfo} from './referenceInputs'
import {captureComponent,componentDocument,scaleComponent} from './assets'
import {exportSvg} from './svg'
import {importSvg} from './svgImport'
import {parseChartDataset} from './chartDataset'
import {parseChartRecommendationResponse} from './chartRecommendation'

function source(){const figure=createExample();figure.references=Array.from({length:3},(_,i)=>({id:`ref-${i}`,title:`Authored ${i}`,citation:`Authored source ${i}`,fileName:`ref-${i}.png`,sha256:String(i+1).repeat(64),pixelWidth:800,pixelHeight:400,dataUrl:'data:image/png;base64,iVBORw0KGgo=',placement:{x:0,y:0,width:800,height:400}}));return figure}
const choices=[{id:'ref-2',purpose:'layout' as const},{id:'ref-0',purpose:'style' as const},{id:'ref-1',purpose:'content' as const}]
const notes=(inputs:ReferenceInputInfo[])=>inputs.map(r=>({image:r.index,decision:'use' as const,observation:`Observe ${r.index}`,application:`Use ${r.purpose}`,uncertainty:''}))
const input=(figure=source())=>({sessionId:crypto.randomUUID(),content:'Compose a new diagram',figure,selectedIds:[],catalogue:[],referenceInputs:choices})
const response=(figure:FigureDocument|null,referenceNotes:unknown)=>JSON.stringify({message:'A candidate',figure,referenceNotes,instances:[],instanceLinks:[]})
describe('multiple scoped reference image inputs and source ownership',()=>{
  it('preserves explicit order and purpose with no unselected image bytes or metadata in the model directory',()=>{
    const data=input(),saved=clone(data),refs=selectedReferenceInputs(data)
    expect(refs.map(r=>[r.index,r.id,r.purpose])).toEqual([[1,'ref-2','layout'],[2,'ref-0','style'],[3,'ref-1','content']]);expect(refs.every(r=>!('dataUrl'in r))).toBe(true);expect(data).toEqual(saved)
    const prompt=harnessPrompt(data),directory=JSON.parse(prompt.split('\n').find(line=>line.startsWith('实际参考图目录：'))!.slice('实际参考图目录：'.length));expect(directory).toEqual(refs);expect(prompt).not.toContain('data:image')
    expect(selectedReferenceInputs({...data,referenceInputs:undefined,referenceId:'ref-1'})).toMatchObject([{index:1,id:'ref-1',purpose:'style'}]);expect(selectedReferenceInputs({...data,referenceInputs:[]})).toEqual([])
  })
  it('rejects duplicate/unknown selections, conflicting entrances, task mixing and content roles on data charts',()=>{
    const data=input()
    for(const patch of [{referenceInputs:[choices[0],choices[0]]},{referenceInputs:[{id:'missing',purpose:'style'}]},{referenceInputs:[...choices,choices[0]]},{referenceId:'ref-0'},{referenceInputs:[],referenceId:'ref-0'},{referenceInputs:[{id:'ref-0',purpose:'fabricate'}]},{task:{kind:'reconstruct',referenceId:'ref-0',region:{x:0,y:0,width:1,height:1},destination:'new',parentId:'stage'}}])expect(harnessRunInputSchema.safeParse({...data,...patch}).success).toBe(false)
    const chartData=parseChartDataset('X,Y\n1,2\n3,4',{name:'Authored',origin:'example',errorLabel:'',note:'',dataSource:''});expect(()=>selectedReferenceInputs({...data,chartData})).toThrow('数据选图只借鉴样式或构图')
    expect(harnessRunInputSchema.safeParse({...data,chartData,referenceInputs:choices.map(c=>({...c,purpose:'style'}))}).success).toBe(true)
  })
  it('requires exactly one explanation per actual image and refuses fabricated source fields or aliases',()=>{
    const refs=selectedReferenceInputs(input()),valid=notes(refs),report=resolveReferenceNotes([...valid].reverse(),refs)
    expect(report.map(r=>r.index)).toEqual([1,2,3]);expect(report.map(r=>r.id)).toEqual(refs.map(r=>r.id))
    for(const raw of [undefined,valid.slice(0,2),[valid[0],valid[0],valid[2]],[{...valid[0],image:0},...valid.slice(1)],[{...valid[0],id:'fake'},...valid.slice(1)]])expect(()=>resolveReferenceNotes(raw,refs)).toThrow()
    expect(()=>resolveReferenceNotes(valid,[])).toThrow();expect(resolveReferenceNotes(undefined,[])).toEqual([])
  })
  it('checks image explanations for discussion-only responses and preserves a readable report without applying it',()=>{
    const data=input(),refs=selectedReferenceInputs(data),before=clone(data.figure),result=parseHarnessResponse(response(null,notes(refs)),data.figure,[],refs)
    expect(result.figure).toBeNull();expect(result.referenceUse).toHaveLength(3);expect(data.figure).toEqual(before)
    expect(()=>parseHarnessResponse(response(null,undefined),data.figure,[],refs)).toThrow('逐一对应');expect(()=>parseHarnessResponse(response(null,notes(refs)),data.figure)).toThrow()
  })
  it('stores only adopted uses as program-owned figure provenance, retaining prior sources and ignored-picture explanations in the report',()=>{
    const data=input(),refs=selectedReferenceInputs(data),n=notes(refs).map((note,i)=>i===2?{...note,decision:'omit' as const}:note);const prior=resolveReferenceNotes([{image:1,decision:'use',observation:'Prior source',application:'Prior colors',uncertainty:''}],[{...refs[0]!,id:'prior',sha256:'9'.repeat(64)}])[0]!
    data.figure.referenceUses=[prior];const before=clone(data.figure),raw=clone(data.figure);raw.nodes[0]!.label='New feature';raw.referenceUses=[]
    const result=parseHarnessResponse(response(raw,n),data.figure,[],refs)
    expect(result.referenceUse![2]!.decision).toBe('omit');expect(result.figure!.referenceUses?.map(r=>r.sha256)).toEqual([prior.sha256,refs[0]!.sha256,refs[1]!.sha256]);expect(data.figure).toEqual(before)
    const next=parseHarnessResponse(response(result.figure!,undefined),result.figure!);expect(next.figure!.referenceUses).toEqual(result.figure!.referenceUses)
  })
  it('deduplicates the same source/purpose while retaining distinct purposes and refuses an unreviewable source overflow',()=>{
    const refs=selectedReferenceInputs(input()),use=resolveReferenceNotes(notes(refs),refs)[0]!,other={...use,purpose:'style' as const},previous=Array.from({length:12},(_,i)=>({...use,id:`old-${i}`,sha256:i.toString(16).padStart(64,'0')}))
    expect(mergeReferenceUses([use],[{...use,application:'Latest'}])?.[0]?.application).toBe('Latest');expect(mergeReferenceUses([use],[other])).toHaveLength(2)
    expect(()=>mergeReferenceUses(previous,[{...use,sha256:'f'.repeat(64)}])).toThrow('超过 12');expect(mergeReferenceUses(undefined,[{...use,decision:'omit'}])).toBeUndefined()
    const invalid=source();invalid.referenceUses=[{...use,decision:'omit'}];expect(()=>parseDocument(invalid)).toThrow('只保存已采用');invalid.referenceUses=[use,use];expect(()=>parseDocument(invalid)).toThrow('不能重复')
  })
  it('preserves long source names, citations, purpose and actual-input fingerprints through capture, scale and SVG metadata',()=>{
    const data=input(),refs=selectedReferenceInputs(data);refs[0]!.title='A'.repeat(100);refs[0]!.citation='C'.repeat(500);refs[0]!.inputSha256='a'.repeat(64)
    const result=parseHarnessResponse(response(data.figure,notes(refs)),data.figure,[],refs),asset=captureComponent(result.figure!,'stage','From three references'),standalone=componentDocument(scaleComponent(asset,.5)),svg=exportSvg(standalone),roundtrip=importSvg(svg,{fileName:'multi.svg',sha256:createHash('sha256').update(svg).digest('hex'),parseXml:s=>new DOMParser().parseFromString(s,'image/svg+xml') as unknown as Document}).asset.figure
    expect(asset.sources).toHaveLength(3);expect(asset.sources[0]).toMatchObject({title:'A'.repeat(100),reference:'C'.repeat(500),purpose:'layout',image:{sha256:refs[0]!.sha256}});expect(asset.figure.referenceUses).toEqual(result.figure!.referenceUses);expect(roundtrip.referenceUses).toEqual(standalone.referenceUses)
    const extra=clone(result.figure!);extra.referenceUses!.push({...extra.referenceUses![0]!,purpose:'style'});expect(captureComponent(extra,'stage','Two purposes').sources).toHaveLength(4)
  })
  it('uses multiple style/layout inputs for data selection without changing original values, errors or reference identities',()=>{
    const figure=source(),refs=selectedReferenceInputs({figure,referenceInputs:choices.map(c=>({...c,purpose:'style' as const}))}),data=parseChartDataset('Model,Latency,Accuracy\nA,10,70\nB,100,80',{name:'Authored',origin:'example',errorLabel:'',note:'Authored values',dataSource:'Authored'}),recommendation={status:'ready',kind:'scatter',xColumn:'c1',labelColumn:'c0',series:[{column:'c2'}],title:'Relationship',xLabel:'Latency (ms)',yLabel:'Accuracy (%)',paletteId:'figureforge-publication-soft',grid:true,showValues:false,reason:'Two numeric variables',alternatives:[],cautions:[]},saved=clone(data)
    const result=parseChartRecommendationResponse(JSON.stringify({message:'Select',recommendation,referenceNotes:notes(refs)}),figure,data,refs)
    expect(result.chartRecommendation.referenceUse?.map(r=>r.id)).toEqual(refs.map(r=>r.id));expect(result.figure!.referenceUses).toHaveLength(3);expect(result.figure!.containers[0]!.dataChart!.spec.series[0]!.values).toEqual([70,80]);expect(data).toEqual(saved)
    expect(()=>parseChartRecommendationResponse(JSON.stringify({message:'Select',recommendation}),figure,data,refs)).toThrow('逐一对应')
  })
})
