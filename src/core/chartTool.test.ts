import { describe,expect,it } from 'vitest'
import { buildDataChart } from './dataChart'
import { chartExample } from './dataChartTable'
import { configureChartAsset } from './chartTool'
import { chartOptionsSchema } from './dataChartSchema'
import { clone,createBlank,rootContainer } from './model'
import { parseAsset,scaleComponent } from './assets'
import { addComponentPort } from './componentPorts'
import { componentInstanceSchema,composeCatalogue,describeCatalogue,type CatalogueEntry } from './catalogue'
import { harnessEventSchema,harnessPrompt,parseHarnessResponse } from './harness'
import { buildRecipe } from '../data/recipes'

function source(){
  const spec=chartExample('line');Object.assign(spec,{x:[1,3,10],series:[{name:'Base',values:[70,null,90],errors:[.5,null,1]},{name:'Ours',values:[75,83,95],errors:[.7,.5,.6]}],title:'Fixed observations',yMin:60,yMax:100,errorLabel:'Mean ± SE',note:'Fixed source note',dataSource:'Controlled development data'})
  const asset=scaleComponent(buildDataChart(spec),.7);asset.id='source-chart'
  asset.figure.nodes.push({id:'owner-note',parentId:'stage',kind:'text',label:'Owner annotation',x:24,y:296,width:130,height:18,textStyle:{size:12,color:'#334155'}})
  asset.figure.nodes.find(n=>n.chart?.key==='title')!.label='Manually edited generated title'
  addComponentPort(asset.figure,'stage','input','chart-in');addComponentPort(asset.figure,'stage','output','chart-out')
  return parseAsset(asset)
}
describe('assistant data chart compiler tool',()=>{
  it('replots presentation while freezing observations, uncertainty statements and the original component',()=>{
    const asset=source(),before=clone(asset),result=configureChartAsset(asset,{fontFamily:'MiSans',fontSize:16,kind:'bar',title:'Bar comparison',yMin:null,yMax:null,paletteId:'figureforge-publication-soft',grid:false,showValues:false}),root=rootContainer(result.asset.figure),old=rootContainer(asset.figure)
    expect(asset).toEqual(before);expect(root.dataChart!.spec.series).toEqual(old.dataChart!.spec.series);expect(root.dataChart!.spec.x).toEqual(['1','3','10']);expect(root.metricScale).toBe(.7)
    expect(root.dataChart!.spec).toMatchObject({fontFamily:'MiSans',fontSize:16});expect(result.use.typography).toEqual({fontFamily:'MiSans',fontSize:16});expect(result.asset.figure.nodes.filter(node=>node.chart?.key&&node.kind==='text').every(node=>node.textStyle?.family==='MiSans'&&node.textStyle.size!>=16*.7)).toBe(true)
    for(const field of ['errorLabel','note','dataSource','origin'] as const)expect(root.dataChart!.spec[field]).toEqual(old.dataChart!.spec[field])
    for(const id of ['owner-note','chart-in','chart-out'])expect(result.asset.figure.nodes.find(n=>n.id===id)).toEqual(asset.figure.nodes.find(n=>n.id===id))
    expect(result.asset.figure.nodes.find(n=>n.chart?.key==='title')!.label).toBe('Bar comparison');expect(result.asset.figure.nodes.some(n=>n.label==='Illustrative data')).toBe(true)
    expect(result.use).toMatchObject({sourceKind:'line',kind:'bar',sourceChartRevision:1,chartRevision:2,seriesCount:2,conditionCount:3,origin:'example',dataPreserved:true,preserved:3,options:{yMin:null,yMax:null,grid:false}})
    expect(result.asset.sources).toEqual(expect.arrayContaining(asset.sources));expect(result.asset.sources.some(s=>s.title.includes('Publication Soft'))).toBe(true)
  })
  it('refuses model-supplied data or statistical reinterpretations and rejects the tool on ordinary assets',()=>{
    const asset=source(),saved=clone(asset)
    for(const key of ['series','x','values','errors','origin','errorLabel','note','dataSource','xMode'])expect(()=>configureChartAsset(asset,{[key]:key==='origin'?'user':[]})).toThrow()
    expect(()=>configureChartAsset(buildRecipe('pipeline',{stages:2,direction:'row'}),{})).toThrow('根组合不是数据图表')
    expect(()=>configureChartAsset(asset,{title:'Wrapped\ntitle'})).toThrow('单行')
    expect(asset).toEqual(saved)
  })
  it('distinguishes zero and false from missing options and explicitly resets either bound to automatic',()=>{
    const result=configureChartAsset(source(),{kind:undefined,yMin:0,yMax:null,grid:false,showValues:false}),spec=rootContainer(result.asset.figure).dataChart!.spec
    expect(spec).toMatchObject({kind:'line',yMin:0,grid:false,showValues:false});expect(spec.yMax).toBeUndefined();expect(result.use.options).not.toHaveProperty('kind');expect(result.use.options.yMax).toBeNull()
    expect(chartOptionsSchema.safeParse({yMin:NaN}).success).toBe(false)
  })
  it('enforces zero baselines, data/error bounds and category limits without truncating a source',()=>{
    const asset=source(),saved=clone(asset)
    expect(()=>configureChartAsset(asset,{kind:'bar'})).toThrow('零基线');expect(()=>configureChartAsset(asset,{yMax:94})).toThrow('截断');expect(()=>configureChartAsset(asset,{paletteId:'invented'})).toThrow('配色')
    const spec=chartExample('line');spec.x=Array.from({length:13},(_,i)=>i);spec.series=[{name:'A',values:spec.x.map(Number)}]
    expect(()=>configureChartAsset(buildDataChart(spec),{kind:'bar'})).toThrow('最多 12');expect(asset).toEqual(saved)
    const bar=chartExample('bar'),converted=configureChartAsset(buildDataChart(bar),{kind:'line'})
    expect(rootContainer(converted.asset.figure).dataChart!.spec.xMode).toBe('category');expect(rootContainer(converted.asset.figure).dataChart!.spec.x).toEqual(bar.x)
  })
  it('composes regenerated and unchanged siblings deterministically with stable named interfaces and derived run records',()=>{
    const asset=source(),entries:CatalogueEntry[]=[{kind:'asset',asset}],base=createBlank(),saved=clone(entries),instances=[componentInstanceSchema.parse({id:'bar',componentKey:'asset:source-chart',parentId:'stage',x:60,y:150,scale:.5,keepAppearance:true,chartOptions:{kind:'bar',yMin:0,yMax:100}}),componentInstanceSchema.parse({id:'original',componentKey:'asset:source-chart',parentId:'stage',x:400,y:150,scale:.5,keepAppearance:true})]
    const links=[{id:'chart-bridge',source:{scope:'port' as const,instanceId:'bar',port:'output' as const,key:'output-1',index:0},target:{scope:'port' as const,instanceId:'original',port:'input' as const,key:'input-1',index:0},sourcePort:'right' as const,targetPort:'left' as const}],result=composeCatalogue(base,entries,instances,links)
    expect(entries).toEqual(saved);expect(result.figure.containers.find(c=>c.id==='bar')?.dataChart?.spec.kind).toBe('bar');expect(result.figure.containers.find(c=>c.id==='original')?.dataChart?.spec.kind).toBe('line')
    expect(result.used[0]!.chart?.dataPreserved).toBe(true);expect(result.used[1]!.chart).toBeUndefined();expect(result.figure.edges).toHaveLength(1)
    expect(composeCatalogue(base,entries,instances,links)).toEqual(result)
    const event=harnessEventSchema.parse({type:'run.completed',sequence:1,runId:crypto.randomUUID(),sessionId:crypto.randomUUID(),timestamp:new Date().toISOString(),components:result.used,proposal:result.figure})
    expect(event.components![0]!.chart!.options).toEqual(instances[0]!.chartOptions)
  })
  it('advertises only source-backed chart capabilities and rejects an invalid second tool invocation atomically',()=>{
    const asset=source(),entries:CatalogueEntry[]=[{kind:'asset',asset}],description=describeCatalogue(entries)[0]!,base=createBlank(),before=clone(base),saved=clone(asset)
    expect(description.chartOptions?.fields).toContain('yMin');expect(description.dataChart?.spec.series).toEqual(rootContainer(asset.figure).dataChart!.spec.series)
    const prompt=harnessPrompt({sessionId:crypto.randomUUID(),content:'Replot',figure:base,selectedIds:[],catalogue:entries})
    const context=JSON.parse(prompt.split('以下是当前工程快照（最新状态优先于历史会话）：\n')[1]!.split('\n')[0]!)
    expect(context.materials.palettes).toContainEqual(expect.objectContaining({id:'figureforge-publication-soft',name:'Publication Soft'}))
    expect(context.materials.palettes.some((p:{id:string})=>p.id===rootContainer(asset.figure).dataChart!.spec.paletteId)).toBe(true)
    expect(new Set(context.materials.palettes.map((p:{id:string})=>p.id)).size).toBe(context.materials.palettes.length)
    const instance={id:'chart',componentKey:'asset:source-chart',parentId:'stage',x:60,y:150,keepAppearance:true,scale:.5,chartOptions:{kind:'bar' as const,yMin:0}}
    expect(()=>composeCatalogue(base,entries,[instance,{...instance,id:'bad',x:400,chartOptions:{yMax:94}}],[])).toThrow('截断');expect(base).toEqual(before);expect(asset).toEqual(saved)
    const raw={message:'Test',figure:base,instances:[{...instance,chartOptions:{series:[]}}],instanceLinks:[]};expect(()=>parseHarnessResponse(JSON.stringify(raw),base,entries)).toThrow('绘图契约')
    expect(()=>composeCatalogue(base,entries,[{...instance,labels:{[asset.figure.nodes.find(n=>n.chart?.key==='title')!.id]:'Fake title'}}],[])).toThrow('不能只覆盖文字')
  })
})
