import { describe,expect,it } from 'vitest'
import { DOMParser } from '@xmldom/xmldom'
import { createHash } from 'node:crypto'
import { clone,createBlank,parseDocument,rootContainer } from './model'
import { buildDataChart,chartDomain,replaceDataChart } from './dataChart'
import { dataChartSpecSchema } from './dataChartSchema'
import { chartExample,chartTableText,parseChartTable } from './dataChartTable'
import { captureComponent,componentDocument,instantiateComponent,scaleComponent } from './assets'
import { pathPoints } from './paths'
import { paletteById } from '../data/materials'
import { recolorChartSeries } from './paint'
import { composeCatalogue,describeCatalogue } from './catalogue'
import { diffFigures } from './figureDiff'
import { exportSvg } from './svg'
import { importSvg } from './svgImport'
import {checkPublication} from './publication'
import {defaultPublicationSettings} from './publicationContract'
import {wrapChartText} from './chartText'

describe('data-driven native experiment charts',()=>{
  it('reflows font-dependent chart labels across renderers without changing observations, and refuses unreadable density rather than shrinking text',()=>{
    for(const kind of ['line','heatmap','boxplot'] as const){
      const original=chartExample(kind),before=clone(original),asset=buildDataChart({...original,fontFamily:'MiSans',fontSize:16}),labels=asset.figure.nodes.filter(node=>node.kind==='text')
      expect(labels.length).toBeGreaterThan(0);expect(labels.every(node=>node.textStyle?.family==='MiSans')).toBe(true);expect(Math.min(...labels.map(node=>node.textStyle!.size!))).toBe(16);expect(rootContainer(asset.figure).dataChart!.spec.series).toEqual(original.series);expect(rootContainer(asset.figure).dataChart!.spec.x).toEqual(original.x);expect(original).toEqual(before)
    }
    const source=chartExample('line'),before=clone(source),settings={...defaultPublicationSettings,widthMm:182},small=buildDataChart(source),larger=buildDataChart({...source,fontSize:20})
    expect(checkPublication(small.figure,settings).smallText).toBeGreaterThan(0);expect(checkPublication(larger.figure,settings)).toMatchObject({smallText:0,minFontPt:expect.any(Number)});expect(checkPublication(larger.figure,settings).minFontPt).toBeCloseTo(20*182/1000*72/25.4)
    expect(()=>buildDataChart({...source,fontSize:36})).toThrow();expect(dataChartSpecSchema.safeParse({...source,fontFamily:'invented'}).success).toBe(false);expect(source).toEqual(before)
    const lines=wrapChartText('A𝓛) next',10,18);expect(lines.join(' ').replaceAll(' ','')).toBe('A𝓛)next');expect(lines.every(line=>[...line].every(char=>char.codePointAt(0)!<0xD800||char.codePointAt(0)!>0xDFFF))).toBe(true)
  })
  it('parses quoted CSV and TSV, preserving empty cells and exact declared errors across round trips',()=>{
    const data=parseChartTable('Dataset,"Base, v1","Base, v1_err",Ours\r\n"A, small",1,0.2,2\r\nB,,,-3\r\nC,0,0,','category')
    expect(data.x).toEqual(['A, small','B','C']);expect(data.series[0]).toEqual({name:'Base, v1',values:[1,null,0],errors:[.2,null,0]});expect(data.series[1]!.values).toEqual([2,-3,null])
    const spec={...chartExample('bar'),...data};expect(parseChartTable(chartTableText(spec),'category')).toEqual(data)
    expect(parseChartTable('X\tA\tA_err\n0\t1\t\n1\t\t','numeric').series[0]).toEqual({name:'A',values:[1,null],errors:[null,null]})
  })
  it('rejects ambiguous tables, invented missing-value spellings, bad errors and unlabeled statistics',()=>{
    for(const table of ['X,A,A\n0,1,2\n1,2,3','X,A_err\n0,1\n1,2','X,A\n0,10%\n1,20','X,A\n0,NaN\n1,2','X,A\n0,"1\n1,2','X,A\n0,1,2\n1,2'])expect(()=>parseChartTable(table,'numeric')).toThrow()
    const spec=chartExample('line');expect(()=>dataChartSpecSchema.parse({...spec,errorLabel:''})).toThrow('误差棒含义');expect(()=>dataChartSpecSchema.parse({...spec,x:[10,10,60,100]})).toThrow('不能重复')
    expect(()=>dataChartSpecSchema.parse({...spec,series:[{name:'A',values:[1,null,2,3],errors:[.1,.2,.1,.1]}]})).toThrow('缺失值')
    expect(()=>dataChartSpecSchema.parse({...spec,series:[{name:'A',values:[1,2,3,4],errors:[1,-2,3,4]}]})).toThrow()
  })
  it('places numeric x by their real distances, sorts without changing data, and never bridges missing values',()=>{
    const spec={...chartExample('line'),x:[10,0,1,5],series:[{name:'A',values:[4,1,null,3]}],errorLabel:''},asset=buildDataChart(spec),nodes=asset.figure.nodes
    const marker=(i:number)=>nodes.find(n=>n.chart?.key===`series-0-point-${i}`)!,a=marker(1),b=marker(3),c=marker(0)
    expect(b.x-a.x).toBeCloseTo(c.x-b.x);expect(nodes.some(n=>n.chart?.key==='series-0-point-2')).toBe(false)
    const line=nodes.find(n=>n.chart?.key==='series-0-line')!;expect(pathPoints(asset.figure,line).map(p=>p.move??false)).toEqual([false,true,false])
    expect(rootContainer(asset.figure).dataChart!.spec.x).toEqual([10,0,1,5]);expect(spec.x).toEqual([10,0,1,5])
  })
  it('keeps zero as the bar baseline, supports signed values and uses supplied uncertainty without clipping',()=>{
    const spec={...chartExample('bar'),x:['A','B'],series:[{name:'A',values:[2,4],errors:[.5,1]}]},asset=buildDataChart(spec),a=asset.figure.nodes.find(n=>n.chart?.key==='series-0-point-0')!,b=asset.figure.nodes.find(n=>n.chart?.key==='series-0-point-1')!
    expect(b.height/a.height).toBeCloseTo(2);expect(a.y+a.height).toBeCloseTo(b.y+b.height)
    const errors=asset.figure.nodes.find(n=>n.chart?.key==='series-0-errors')!;expect(errors.path!.points).toHaveLength(12)
    const signed=buildDataChart({...spec,series:[{name:'A',values:[-2,0]}]});expect(signed.figure.nodes.find(n=>n.chart?.key==='series-0-point-1')!.kind).toBe('path')
    expect(()=>buildDataChart({...spec,yMin:1})).toThrow('零基线');expect(()=>buildDataChart({...spec,yMax:4.5})).toThrow('截断')
    expect(()=>buildDataChart({...spec,yMin:0,series:[{name:'A',values:[-1e-12,2e-12]}]})).toThrow('截断')
    expect(chartDomain([0,0]).max).toBeGreaterThan(chartDomain([0,0]).min)
  })
  it('compiles the maximum numeric sample within native limits and rejects misleading dense labels',()=>{
    const spec={...chartExample('line'),x:Array.from({length:20},(_,i)=>i),series:Array.from({length:4},(_,j)=>({name:`Series ${j+1}`,values:Array.from({length:20},(_,i)=>i+j+2),errors:Array(20).fill(.5)}))}
    const asset=buildDataChart(spec);expect(asset.figure.nodes.length).toBeLessThanOrEqual(240);expect(()=>parseDocument(asset.figure)).not.toThrow()
    expect(asset.figure.nodes.findIndex(n=>n.chart?.key==='series-3-line')).toBeLessThan(asset.figure.nodes.findIndex(n=>n.chart?.key==='series-3-point-0'))
    expect(()=>buildDataChart({...spec,kind:'bar',xMode:'category',x:spec.x.slice(0,12),series:spec.series.map(s=>({...s,values:s.values.slice(0,12),errors:s.errors.slice(0,12)})),showValues:true})).toThrow('柱形过密')
    expect(()=>buildDataChart({...spec,xMode:'category'})).toThrow('最多 12')
    expect(()=>buildDataChart({...spec,title:'W'.repeat(60)})).toThrow('标题过长')
  })
  it('rebuilds only managed marks after scaling, preserving manual notes, surviving IDs and one candidate snapshot',()=>{
    const asset=scaleComponent(buildDataChart(chartExample('line')),.75),placed=instantiateComponent(createBlank(),asset,'stage'),doc=placed.document,root=doc.containers.find(c=>c.id===placed.containerId)!
    doc.nodes.push({id:'manual',parentId:root.id,kind:'text',label:'Manual annotation',x:root.x+12,y:root.y+root.height-24,width:150,height:14})
    const before=clone(doc),key='series-0-point-0',old=doc.nodes.find(n=>n.parentId===root.id&&n.chart?.key===key)!,spec=clone(root.dataChart!.spec);spec.series[0]!.values[0]=70;spec.origin='user'
    const result=replaceDataChart(doc,root.id,spec),next=result.document,changed=next.nodes.find(n=>n.chart?.key===key)!
    expect(doc).toEqual(before);expect(next.nodes.find(n=>n.id==='manual')).toEqual(before.nodes.find(n=>n.id==='manual'));expect(changed.id).toBe(old.id);expect(changed.metricScale).toBe(.75);expect(result.preserved).toBe(1)
    expect(next.containers.find(c=>c.id===root.id)!.dataChart).toMatchObject({revision:2,spec:{origin:'user'}});expect(diffFigures(before,next).changes.some(c=>c.fields.some(f=>f.name==='实验图表数据'))).toBe(true)
    const captured=captureComponent(next,root.id,'Saved chart');expect(captured.figure.nodes.some(n=>n.label==='Manual annotation')).toBe(true);expect(rootContainer(captured.figure).dataChart?.spec.series[0]!.values[0]).toBe(70)
  })
  it('refuses to remove still-connected marks without partially changing the chart',()=>{
    const doc=componentDocument(buildDataChart(chartExample('line'))),root=rootContainer(doc),target=doc.nodes.find(n=>n.chart?.key==='series-0-point-0')!,other=doc.nodes.find(n=>n.chart?.key==='series-1-point-0')!
    doc.edges.push({id:'manual-link',source:target.id,target:other.id,sourcePort:'right',targetPort:'left'});const saved=clone(doc),spec=clone(root.dataChart!.spec);spec.series[0]!.values[0]=null;spec.series[0]!.errors![0]=null
    expect(()=>replaceDataChart(doc,'stage',spec)).toThrow('外部连接');expect(doc).toEqual(saved)
  })
  it('keeps connected point identity by series name and x value when columns and rows are reordered',()=>{
    const doc=componentDocument(buildDataChart(chartExample('line'))),root=rootContainer(doc),target=doc.nodes.find(n=>n.chart?.key==='series-0-point-0')!,other=doc.nodes.find(n=>n.chart?.key==='series-1-point-0')!
    doc.edges.push({id:'manual-link',source:target.id,target:other.id,sourcePort:'right',targetPort:'left'})
    const spec=clone(root.dataChart!.spec);spec.x.reverse();spec.series.reverse();for(const series of spec.series){series.values.reverse();series.errors?.reverse()}
    const result=replaceDataChart(doc,'stage',spec).document
    expect(result.nodes.find(n=>n.id===target.id)?.chart?.key).toBe('series-1-point-3');expect(result.nodes.find(n=>n.id===target.id)?.name).toBe(target.name);expect(result.edges).toEqual(doc.edges)
    const categorical=replaceDataChart(result,'stage',{...spec,xMode:'category',x:spec.x.map(String)}).document
    expect(categorical.nodes.some(n=>n.id===target.id)).toBe(true);expect(categorical.edges).toEqual(doc.edges)
  })
  it('keeps series/legend recoloring, immutable assistant reuse, data metadata and SVG round trips',()=>{
    const asset=scaleComponent(buildDataChart(chartExample('bar')),.5),doc=componentDocument(asset),paletteId='figureforge-publication-soft',axes=doc.nodes.filter(n=>n.chart?.role==='axis').map(n=>clone(n))
    recolorChartSeries(doc,paletteId);expect(rootContainer(doc).dataChart!.spec.paletteId).toBe(paletteId)
    const color=paletteById.get(paletteId)!.colors[0]!;expect(doc.nodes.filter(n=>n.chart?.role==='series'&&n.chart.series===0&&n.chart.channels.includes('fill')).every(n=>n.visual?.fill===color)).toBe(true);expect(doc.nodes.filter(n=>n.chart?.role==='axis')).toEqual(axes)
    expect(describeCatalogue([{kind:'asset',asset}])[0]!.dataChart?.spec).toEqual(rootContainer(asset.figure).dataChart!.spec)
    const composition=composeCatalogue(createBlank(),[{kind:'asset',asset}],[{id:'chart-instance',componentKey:`asset:${asset.id}`,parentId:'stage',x:60,y:150,keepAppearance:true}],[])
    expect(composition.figure.containers.find(c=>c.id==='chart-instance')?.dataChart?.spec).toEqual(rootContainer(asset.figure).dataChart!.spec)
    const svg=exportSvg(doc);expect(svg).not.toContain('<image');const restored=importSvg(svg,{fileName:'data-chart.svg',sha256:createHash('sha256').update(svg).digest('hex'),parseXml:s=>new DOMParser().parseFromString(s,'image/svg+xml') as unknown as Document})
    expect(rootContainer(restored.asset.figure).dataChart?.spec).toEqual(rootContainer(doc).dataChart!.spec)
  })
})
