import {createSharedColorbar,updateSharedColorbar,sharedColorbarEditTargets,sharedColorbarStates,sharedColorbarVisibility,detachSharedColorbar,chartColorbarTargets} from './sharedColorbar'
import {moveObjects} from './geometry'
import {pathPoints} from './paths'
import {scaleSubtree} from './scaling'
import {addComponentPort} from './componentPorts'
import {instantiateComponentAt} from './assets'
import {exportDrawio} from './export'
import { describe,expect,it } from 'vitest'
import { createHash } from 'node:crypto'
import { DOMParser } from '@xmldom/xmldom'
import { buildDataChart,replaceDataChart } from './dataChart'
import { chartExample,chartTableText,parseChartTable } from './dataChartTable'
import { heatmapScale } from './heatmap'
import { clone,createBlank,parseDocument,rootContainer } from './model'
import { captureComponent,componentDocument,scaleComponent } from './assets'
import { recolorChartSeries } from './paint'
import { mixColor } from './paint'
import { exportSvg } from './svg'
import { importSvg } from './svgImport'
import { configureChartAsset } from './chartTool'
import { parseChartDataset } from './chartDataset'
import { parseChartRecommendationResponse } from './chartRecommendation'
import { describeCatalogue } from './catalogue'
import { parseHarnessResponse } from './harness'

function heatmapPair(diverging=false){
  let figure=createBlank();Object.assign(figure.containers[0]!,{x:0,y:0,width:1000,height:620})
  const base={...chartExample('heatmap'),paletteId:diverging?'heat-figureforge-diverging':'heat-blue',valueLabel:'Score (a.u.)',series:[{name:'A',values:diverging?[-2,0,null]:[0,10,null]},{name:'B',values:diverging?[1,2,3]:[5,15,20]}]}
  const other={...base,title:'Matrix B',fontSize:12,series:[{name:'A',values:diverging?[-6,0,null]:[20,30,null]},{name:'B',values:diverging?[3,4,8]:[10,25,40]}]}
  figure=instantiateComponentAt(figure,scaleComponent(buildDataChart({...base,title:'Matrix A'}),.42),'stage',{x:35,y:120},'first',true).document
  return instantiateComponentAt(figure,scaleComponent(buildDataChart(other),.42),'stage',{x:540,y:120},'second',true).document
}

describe('native raw-value matrix heatmaps',()=>{
  it('resynchronizes changed source data and palettes through the same scaled editable colorbar, preserving fonts, notes, source identity and external bindings',()=>{
    let doc=createSharedColorbar(heatmapPair(),{containerIds:['first','second']}).document
    const group=doc.containers.find(c=>c.sharedColorbar)!,first=doc.containers.find(c=>c.id==='first')!,spec=clone(first.dataChart!.spec);spec.series[0]!.values[1]=60;spec.colorMin=undefined;spec.colorMax=undefined;spec.paletteId='heat-teal';doc=replaceDataChart(doc,'first',spec).document
    const owner=doc.containers.find(c=>c.id===group.id)!,record=owner.sharedColorbar!,title=doc.nodes.find(n=>n.id===record.parts[32]!.nodeId)!,tick=doc.nodes.find(n=>n.id===record.parts[33]!.nodeId)!
    title.textStyle={...title.textStyle,family:'MiSans',size:18,bold:true,italic:true};tick.textStyle={...tick.textStyle,family:'Comic Sans MS'};owner.evidence={title:'Author source',reference:'Keep this reference'}
    moveObjects(doc,[owner.id],0,-60);const oldHeight=owner.height;owner.height+=28
    doc.nodes.push({id:'bar-note',parentId:owner.id,kind:'text',label:'Owner note',x:owner.x+8,y:owner.y+oldHeight+8,width:90,height:14,textStyle:{size:10}},{id:'bar-leader',parentId:'stage',kind:'path',label:'',x:owner.x+owner.width+20,y:owner.y-20,width:80,height:30,path:{points:[{x:0,y:0},{x:1,y:1}],arrow:'open',start:{nodeId:title.id,x:1,y:.5}}})
    addComponentPort(doc,owner.id,'output','bar-port');const sourceTitle=doc.nodes.find(n=>n.parentId==='first'&&n.chart?.key==='title')!;sourceTitle.label='Owner matrix';sourceTitle.textStyle={...sourceTitle.textStyle,bold:true}
    doc=parseDocument(doc);const before=clone(doc),request={containerId:owner.id,paletteId:'heat-teal',range:'data',reason:'Use current source observations'},result=updateSharedColorbar(doc,request),after=result.document,next=after.containers.find(c=>c.id===owner.id)!,target=sharedColorbarEditTargets(doc,[title.id])[0]!
    expect(target).toMatchObject({selected:true,active:false,editable:true});expect(doc).toEqual(before);expect(result.report).toMatchObject({operation:'update',changed:true,min:0,max:60,before:{paletteId:'heat-blue',max:40},after:{paletteId:'heat-teal',max:60}});expect(sharedColorbarStates(after)[0]!.active).toBe(true)
    expect(after.nodes.map(n=>n.id)).toEqual(before.nodes.map(n=>n.id));expect(next.sharedColorbar!.parts.map(p=>p.nodeId)).toEqual(record.parts.map(p=>p.nodeId));expect(next.evidence).toEqual(owner.evidence)
    for(const root of after.containers.filter(c=>c.dataChart)){const old=before.containers.find(c=>c.id===root.id)!;expect(root.dataChart!.spec.series).toEqual(old.dataChart!.spec.series);expect(root.dataChart!.spec.x).toEqual(old.dataChart!.spec.x);expect(root.dataChart!.spec).toMatchObject({paletteId:'heat-teal',colorMin:0,colorMax:60});expect({...root,dataChart:undefined}).toEqual({...old,dataChart:undefined})}
    for(const id of [title.id,tick.id])expect(after.nodes.find(n=>n.id===id)!.textStyle).toEqual(before.nodes.find(n=>n.id===id)!.textStyle)
    for(const id of ['bar-note',sourceTitle.id])expect(after.nodes.find(n=>n.id===id)).toEqual(before.nodes.find(n=>n.id===id));expect(after.nodes.find(n=>n.id==='bar-leader')!.path!.start).toEqual(before.nodes.find(n=>n.id==='bar-leader')!.path!.start);expect(pathPoints(after,after.nodes.find(n=>n.id==='bar-leader')!)[0]!.x).toBeCloseTo(after.nodes.find(n=>n.id===title.id)!.x+after.nodes.find(n=>n.id===title.id)!.width)
    const idle=updateSharedColorbar(after,request);expect(idle.report.changed).toBe(false);expect(idle.document).toEqual(after)
    const raw={message:'Synchronize',figure:null,sharedColorbars:[request]};expect(parseHarnessResponse(JSON.stringify(raw),after).figure).toBeNull();expect(parseHarnessResponse(JSON.stringify(raw),doc).sharedColorbars![0]!.changed).toBe(true)
    const saved=captureComponent(after,'stage','Compared sources');expect(saved.sources.some(s=>s.title==='FastFigure 顺序青绿数值色阶')).toBe(true);const scaled=scaleComponent(saved,.5).figure,scaledGroup=scaled.containers.find(c=>c.sharedColorbar)!,restyled=updateSharedColorbar(scaled,{containerId:scaledGroup.id,fontSize:8,reason:'Read scaled labels'});expect(sharedColorbarStates(restyled.document)[0]!.active).toBe(true);expect(restyled.document.nodes.map(n=>n.id)).toEqual(scaled.nodes.map(n=>n.id));expect(updateSharedColorbar(restyled.document,{containerId:scaledGroup.id,fontSize:8,reason:'Already current'}).report.changed).toBe(false)
  })
  it.each([false,true])('shares a complete editable numeric scale (diverging=%s), keeps raw and hand content, and restores local scales after incompatible edits',diverging=>{
    const doc=heatmapPair(diverging),title=doc.nodes.find(n=>n.parentId==='first'&&n.chart?.key==='title')!
    title.label='Owner title';title.textStyle={...title.textStyle,family:'MiSans',bold:true};doc.nodes.push({id:'owner-note',parentId:'first',kind:'text',label:'Owner note',x:120,y:290,width:100,height:16,textStyle:{size:10}});const port=addComponentPort(doc,'first','output','output-port'),snapshot=clone(doc)
    const result=createSharedColorbar(doc,{containerIds:['first','second'],fontSize:14}),after=result.document,record=after.containers.find(c=>c.sharedColorbar)!.sharedColorbar!,visibility=sharedColorbarVisibility(after)
    expect(doc).toEqual(snapshot);expect(sharedColorbarStates(after)[0]!.active).toBe(true);expect(visibility.hidden.size).toBeGreaterThanOrEqual(72);expect(after.nodes.length).toBe(doc.nodes.length+36)
    expect(result.report).toMatchObject({min:diverging?-8:0,max:diverging?8:40,valueLabel:'Score (a.u.)',charts:[{beforeRevision:1,afterRevision:2,changed:true},{beforeRevision:1,afterRevision:2,changed:true}]})
    for(const root of after.containers.filter(c=>c.dataChart)){const old=snapshot.containers.find(c=>c.id===root.id)!,spec=clone(root.dataChart!.spec);delete spec.colorMin;delete spec.colorMax;expect(spec).toEqual(old.dataChart!.spec);expect({...root,dataChart:undefined}).toEqual({...old,dataChart:undefined})}
    expect(after.nodes.slice(0,doc.nodes.length).map(n=>n.id)).toEqual(doc.nodes.map(n=>n.id));expect(after.nodes.find(n=>n.id===title.id)).toMatchObject({label:'Owner title',textStyle:{family:'MiSans',bold:true}})
    for(const id of ['owner-note',port.id])expect(after.nodes.find(n=>n.id===id)).toEqual(doc.nodes.find(n=>n.id===id))
    if(!diverging){const a=after.nodes.find(n=>n.parentId==='first'&&n.chart?.key==='series-0-point-1')!,b=after.nodes.find(n=>n.parentId==='second'&&n.chart?.key==='series-1-point-0')!;expect(a.visual!.fill).toBe(b.visual!.fill)}
    const svg=exportSvg(after);for(const id of visibility.hidden){expect(svg).not.toContain(`data-object-id="${id}"`);expect(exportDrawio(after)).not.toContain(`id="${id}"`)}
    const standalone=captureComponent(after,after.containers.find(c=>c.sharedColorbar)!.id,'Standalone');expect(standalone.figure.containers[0]!.sharedColorbar).toBeUndefined();expect(standalone.sources).toContainEqual(heatmapScale(doc.containers.find(c=>c.id==='first')!.dataChart!.spec).palette.source)
    const placed=instantiateComponentAt(createBlank(),scaleComponent(captureComponent(after,'stage','Compared heatmaps'),.45),'stage',{x:80,y:180},'copied',true).document;expect(sharedColorbarStates(placed)[0]!.active).toBe(true)
    const scaled=scaleSubtree(after,after.containers.find(c=>c.sharedColorbar)!.id,.8,'top-left').document;expect(sharedColorbarStates(scaled)[0]!.active).toBe(true)
    const modified=clone(after),cell=modified.nodes.find(n=>n.parentId==='second'&&n.chart?.key==='series-0-point-0')!;cell.visual!.fill='#ff0000';expect(sharedColorbarStates(modified)[0]!.active).toBe(false)
    const fallback=exportSvg(modified);for(const id of visibility.hidden)expect(fallback).toContain(`data-object-id="${id}"`);for(const part of record.parts)expect(fallback).not.toContain(`data-object-id="${part.nodeId}"`);expect(fallback).toContain('共享色标已停用')
    const moved=clone(after);moved.nodes.find(n=>n.id===record.parts[0]!.nodeId)!.x+=1;expect(sharedColorbarStates(moved)[0]!.active).toBe(false)
    const detached=detachSharedColorbar(after,after.containers.find(c=>c.sharedColorbar)!.id);expect(sharedColorbarVisibility(detached).hidden.size).toBe(0);expect(detached.containers.find(c=>c.id==='first')!.dataChart).toEqual(after.containers.find(c=>c.id==='first')!.dataChart)
  })
  it('rejects incompatible units, palettes, centers, hand colors, hidden cells, bound scales and capacity without changing the input',()=>{
    const doc=heatmapPair(),before=clone(doc),request={containerIds:['first','second']}
    for(const patch of [{valueLabel:'Latency (ms)'},{paletteId:'heat-teal'}]){const changed=replaceDataChart(doc,'second',{...doc.containers.find(c=>c.id==='second')!.dataChart!.spec,...patch}).document;expect(()=>createSharedColorbar(changed,request)).toThrow(/单位|色阶/)}
    const changedCenter=heatmapPair(true),root=changedCenter.containers.find(c=>c.id==='second')!;expect(()=>createSharedColorbar(replaceDataChart(changedCenter,'second',{...root.dataChart!.spec,colorCenter:1}).document,request)).toThrow('中心')
    const hand=clone(doc);hand.nodes.find(n=>n.parentId==='first'&&n.chart?.key==='series-0-point-0')!.visual!.fill='#ff0000';expect(()=>createSharedColorbar(hand,request)).toThrow('手工改色')
    const hidden=clone(doc);hidden.containers.find(c=>c.id==='first')!.opacity=.5;expect(()=>createSharedColorbar(hidden,request)).toThrow('透明度')
    const background=clone(doc);background.containers.find(c=>c.id==='first')!.visual!.opacity=0;expect(sharedColorbarStates(createSharedColorbar(background,request).document)[0]!.active).toBe(true)
    const bound=clone(doc),bar=bound.nodes.find(n=>n.chart?.key==='colorbar-0')!;bound.edges.push({id:'bound',source:bar.id,target:bound.nodes.find(n=>n.chart?.key==='series-0-point-0')!.id,sourcePort:'left',targetPort:'right'});expect(()=>createSharedColorbar(bound,request)).toThrow('外部连接')
    const dense=clone(doc);while(dense.nodes.length<205)dense.nodes.push({id:`extra-${dense.nodes.length}`,parentId:'stage',kind:'text',label:'Note',x:20,y:360,width:20,height:10});expect(()=>createSharedColorbar(dense,request)).toThrow('240')
    const result=createSharedColorbar(doc,request);expect(()=>createSharedColorbar(result.document,request)).toThrow('已关联');expect(doc).toEqual(before)
    const group=result.document.containers.find(c=>c.sharedColorbar)!,update={containerId:group.id,reason:'Synchronize'},snapshot=clone(result.document)
    for(const patch of [{range:'fixed',min:1,max:40},{range:'union',min:0,max:40},{paletteId:'invented'},{values:[999]}])expect(()=>updateSharedColorbar(result.document,{...update,...patch})).toThrow()
    const moved=clone(result.document);moved.nodes.find(n=>n.id===group.sharedColorbar!.parts[0]!.nodeId)!.x+=1;expect(sharedColorbarEditTargets(moved)[0]!.editable).toBe(false);expect(()=>updateSharedColorbar(moved,update)).toThrow('改变');const handColor=clone(result.document);handColor.nodes.find(n=>n.parentId==='first'&&n.chart?.key==='series-0-point-0')!.visual!.fill='#ff0000';expect(()=>updateSharedColorbar(handColor,update)).toThrow('手工改色');expect(result.document).toEqual(snapshot)
  })
  it('preserves row/column order, square geometry, exact zero and distinct missing-cell marks',()=>{
    const spec=chartExample('heatmap'),saved=clone(spec),asset=buildDataChart(spec),nodes=asset.figure.nodes,cell=(j:number,i:number)=>nodes.find(n=>n.chart?.key===`series-${j}-point-${i}`)!
    expect(spec).toEqual(saved);expect(rootContainer(asset.figure).dataChart!.spec).toEqual(spec)
    expect(cell(0,0).width).toBe(cell(0,0).height);expect(cell(1,0).x).toBeCloseTo(cell(0,0).x+cell(0,0).width);expect(cell(0,1).y).toBeCloseTo(cell(0,0).y+cell(0,0).height)
    expect(cell(0,2).visual!.fill).toBe(heatmapScale(spec).color(0));expect(nodes.find(n=>n.chart?.key==='series-0-value-2')?.label).toBe('0')
    expect(cell(1,2).visual!.fill).toBe('#f1f5f9');expect(nodes.some(n=>n.chart?.key==='series-1-missing-2')).toBe(true);expect(nodes.some(n=>n.label==='× Missing values')).toBe(true)
    expect(nodes.filter(n=>n.chart?.key?.startsWith('colorbar-')&&n.kind==='rectangle')).toHaveLength(32);expect(nodes.some(n=>n.label==='Illustrative data')).toBe(true)
  })
  it('compiles controlled shared-colorbar requests, real multi-view ranges and native metadata consistently',()=>{
    const doc=heatmapPair(),snapshot=clone(doc),raw={message:'Compare color values',figure:null,sharedColorbars:[{containerIds:['first','second'],reason:'Identical measured units'}]},result=parseHarnessResponse(JSON.stringify(raw),doc)
    expect(chartColorbarTargets(doc).every(t=>!t.error)).toBe(true);expect(result.sharedColorbars).toHaveLength(1);expect(doc).toEqual(snapshot)
    expect(()=>parseHarnessResponse(JSON.stringify({...raw,plotAlignments:[{containerIds:['first','second'],columns:2,reason:'Mix'}]}),doc)).toThrow('单独')
    const svg=exportSvg(result.figure!),recovered=importSvg(svg,{fileName:'colorbar.svg',sha256:createHash('sha256').update(svg).digest('hex'),parseXml:source=>new DOMParser().parseFromString(source,'image/svg+xml') as unknown as Document}).asset.figure;expect(sharedColorbarStates(recovered)[0]!.active).toBe(true)
    const data=parseChartDataset('Method,Run A,Run B\nM1,0,10\nM2,10,\nM3,20,40',{name:'Compared runs',origin:'example',errorLabel:'',note:'Raw data',dataSource:'Authored'}),chart={status:'ready',kind:'heatmap',xColumn:'c0',series:[{column:'c1'}],title:'Run A',xLabel:'Run',yLabel:'Method',valueLabel:'Score (a.u.)',paletteId:'heat-blue',showValues:true,grid:true,reason:'Same quantity',alternatives:[],cautions:[]},recommendation={status:'multi-view',title:'Compared matrices',columns:2,gap:24,alignPlots:true,sharedColorbar:true,views:[{caption:'First run',chart},{caption:'Second run',chart:{...chart,title:'Run B',series:[{column:'c2'}]}}],reason:'Compare unnormalized raw values',alternatives:[],cautions:[]},compiled=parseChartRecommendationResponse(JSON.stringify({message:'Compare',recommendation}),createBlank(),data)
    expect(sharedColorbarStates(compiled.figure!)[0]!.active).toBe(true);expect(compiled.chartRecommendation.panelLayout!.sharedColorbar).toMatchObject({min:0,max:40});expect(compiled.chartRecommendation.views!.map(v=>v.scale)).toEqual([expect.objectContaining({min:0,max:40}),expect.objectContaining({min:0,max:40})]);expect(compiled.figure!.containers.filter(c=>c.dataChart).map(c=>c.dataChart!.spec.series[0]!.values)).toEqual([[0,10,20],[10,null,40]])
  })
  it('encodes declared numeric bounds with a linear sequential scale and handles constant fields without changing values',()=>{
    const spec=chartExample('heatmap');spec.series=[{name:'A',values:[0,50,100]}];spec.colorMin=0;spec.colorMax=100
    const scale=heatmapScale(spec);expect(scale.color(0)).toBe('#eff6ff');expect(scale.color(100)).toBe('#1d4ed8');expect(scale.color(50)).toBe(mixColor('#eff6ff','#1d4ed8',.5))
    delete spec.colorMin;delete spec.colorMax;spec.series=[{name:'Zero',values:[0,0,0]}];const constant=heatmapScale(spec);expect(constant.min).toBeLessThan(0);expect(constant.max).toBeGreaterThan(0);expect(rootContainer(buildDataChart(spec).figure).dataChart!.spec.series[0]!.values).toEqual([0,0,0])
    const thin={...spec,x:['A','B'],xLabel:'',yLabel:'',showValues:false,series:[{name:'One',values:[0,1]}],plotArea:{left:200,right:260,top:140,bottom:260}},fixed=buildDataChart(thin)
    expect(fixed.figure.nodes.find(n=>n.chart?.key==='matrix-frame')).toMatchObject({x:200,y:140,width:60,height:120});expect(rootContainer(fixed.figure).dataChart!.spec.series).toEqual(thin.series)
  })
  it('uses the upstream diverging endpoints around an explicit center without normalization or clipping',()=>{
    const spec=chartExample('heatmap');spec.paletteId='heat-figureforge-diverging';spec.series=[{name:'Delta',values:[-3,0,2]}];const scale=heatmapScale(spec)
    expect(scale).toMatchObject({min:-3,max:3,center:0});expect(scale.color(-3)).toBe('#2166ac');expect(scale.color(0)).toBe('#f7f7fa');expect(scale.color(3)).toBe('#b2182b')
    expect(heatmapScale({...spec,colorCenter:1,colorMin:-3,colorMax:5}).color(1)).toBe('#f7f7fa')
    for(const change of [{colorMin:-2},{colorMax:1},{colorMin:0},{paletteId:'figureforge-tableau10'}])expect(()=>buildDataChart({...spec,...change})).toThrow()
    expect(()=>buildDataChart({...spec,paletteId:'heat-blue',colorCenter:0})).toThrow('顺序色阶')
    expect(()=>buildDataChart({...spec,series:[{name:'Tiny',values:[-1e-12,0,1e-12]}],colorMin:0})).toThrow()
  })
  it('retains wholly missing rows/columns and rejects an entirely missing matrix or incompatible statistical fields',()=>{
    const spec=chartExample('heatmap');spec.series=[{name:'Empty',values:[null,null,null]},{name:'Observed',values:[1,null,3]}]
    expect(rootContainer(buildDataChart(spec).figure).dataChart!.spec.series).toEqual(spec.series)
    expect(()=>buildDataChart({...spec,series:[spec.series[0]!]})).toThrow('至少需要一个有效数值')
    for(const change of [{errorLabel:'Mean ± SE'},{pointLabels:['A','B','C']},{yMin:0},{xMode:'numeric' as const},{series:[{name:'A',values:[1,2,3],errors:[.1,.2,.3]}]}])expect(()=>buildDataChart({...spec,...change})).toThrow()
  })
  it('supports twelve by twelve within capacity and refuses oversize or over-annotated output without dropping cells',()=>{
    const spec=chartExample('heatmap');spec.x=Array.from({length:12},(_,i)=>`R${i}`);spec.series=Array.from({length:12},(_,j)=>({name:`C${j}`,values:spec.x.map((_,i)=>i+j)}));spec.showValues=false
    const asset=buildDataChart(spec);expect(asset.figure.nodes.filter(n=>/^series-\d+-point-\d+$/.test(n.chart?.key??''))).toHaveLength(144);expect(asset.figure.nodes.length).toBeLessThanOrEqual(240)
    expect(()=>buildDataChart({...spec,showValues:true})).toThrow('240');expect(()=>buildDataChart({...spec,x:[...spec.x,'Overflow'],series:spec.series.map(s=>({...s,values:[...s.values,0]}))})).toThrow('最多 12')
  })
  it('parses literal matrix column names and empty cells through CSV/TSV, with no special treatment of _err or _label',()=>{
    const table='Row,Score_err,_label\nB,0,2\nA,,3',parsed=parseChartTable(table,'category','heatmap'),spec={...chartExample('heatmap'),...parsed}
    expect(parsed).toMatchObject({x:['B','A'],series:[{name:'Score_err',values:[0,null]},{name:'_label',values:[2,3]}]})
    expect(parseChartTable(chartTableText(spec),'category','heatmap')).toEqual(parsed)
    expect(()=>parseChartTable('Row,A\n,1\nB,2','category','heatmap')).toThrow('行标签')
  })
  it('keeps cell and axis-label identity across reorder and refuses deleting a still-connected cell atomically',()=>{
    const spec=chartExample('heatmap'),doc=componentDocument(buildDataChart(spec)),cell=doc.nodes.find(n=>n.chart?.key==='series-0-point-0')!,other=doc.nodes.find(n=>n.chart?.key==='series-1-point-0')!,row=doc.nodes.find(n=>n.chart?.key==='row-0')!,col=doc.nodes.find(n=>n.chart?.key==='column-0')!
    doc.edges.push({id:'link',source:cell.id,target:other.id,sourcePort:'right',targetPort:'left'});const saved=clone(doc),changed=clone(spec);changed.x.reverse();changed.series.reverse();changed.series.forEach(s=>s.values.reverse())
    const result=replaceDataChart(doc,'stage',changed).document
    expect(result.nodes.find(n=>n.id===cell.id)?.chart?.key).toBe('series-2-point-2');expect(result.nodes.find(n=>n.id===row.id)?.label).toBe('Class A');expect(result.nodes.find(n=>n.id===col.id)?.label).toBe('Class A');expect(result.edges).toEqual(doc.edges)
    expect(()=>replaceDataChart(doc,'stage',{...spec,x:spec.x.slice(1),series:spec.series.map(s=>({...s,values:s.values.slice(1)}))})).toThrow('外部连接');expect(doc).toEqual(saved)
  })
  it('preserves hand-added objects and heat scale under canvas palette changes, capture, scaling and SVG metadata round trips',()=>{
    const doc=componentDocument(scaleComponent(buildDataChart(chartExample('heatmap')),.75)),root=rootContainer(doc);doc.nodes.push({id:'note',parentId:'stage',kind:'text',label:'Owner note',x:root.x+12,y:root.y+root.height-20,width:100,height:14})
    const heat=clone(doc.nodes.filter(n=>n.chart?.role==='heat')),spec=clone(root.dataChart!.spec);recolorChartSeries(doc,'figureforge-publication-soft');expect(doc.nodes.filter(n=>n.chart?.role==='heat')).toEqual(heat);expect(root.dataChart!.spec).toEqual(spec)
    const changed=replaceDataChart(doc,'stage',{...spec,paletteId:'heat-teal'}).document;expect(changed.nodes.find(n=>n.id==='note')).toEqual(doc.nodes.find(n=>n.id==='note'));expect(()=>parseDocument(changed)).not.toThrow()
    const asset=captureComponent(changed,'stage','Saved heatmap'),svg=exportSvg(changed),roundtrip=importSvg(svg,{fileName:'heatmap.svg',sha256:createHash('sha256').update(svg).digest('hex'),parseXml:s=>new DOMParser().parseFromString(s,'image/svg+xml') as unknown as Document}).asset.figure
    expect(rootContainer(asset.figure).dataChart!.spec.paletteId).toBe('heat-teal');expect(rootContainer(roundtrip).dataChart).toEqual(rootContainer(changed).dataChart)
  })
  it('lets the assistant restyle a heatmap from its immutable source but rejects cross-kind reinterpretation',()=>{
    const asset=buildDataChart(chartExample('heatmap')),saved=clone(asset),result=configureChartAsset(asset,{paletteId:'heat-figureforge-diverging',colorMin:null,colorMax:null,colorCenter:0,showValues:false,grid:false})
    expect(rootContainer(result.asset.figure).dataChart!.spec.series).toEqual(rootContainer(saved.figure).dataChart!.spec.series);expect(asset).toEqual(saved);expect(result.use).toMatchObject({sourceKind:'heatmap',kind:'heatmap',dataPreserved:true})
    expect(()=>configureChartAsset(asset,{kind:'bar'})).toThrow('行列含义不同');expect(()=>configureChartAsset(asset,{colorMax:80})).toThrow('截断')
    expect(()=>scaleComponent(result.asset,.5)).not.toThrow()
    const entry={kind:'asset' as const,asset};expect(describeCatalogue([entry])[0]!.chartOptions!.kind).toEqual(['heatmap'])
  })
  it('selects matrix columns from original data, reports the actual scale, and rejects guessed errors or normalization fields',()=>{
    const data=parseChartDataset('Method,Set A,Set B,Latency\nB,0,82,12\nA,,91,20',{name:'Scores',origin:'example',errorLabel:'',note:'Raw accuracy',dataSource:'Authored'}),recommendation={status:'ready',kind:'heatmap',xColumn:'c0',series:[{column:'c1'},{column:'c2'}],title:'Accuracy matrix',xLabel:'Dataset',yLabel:'Method',valueLabel:'Accuracy (%)',paletteId:'heat-blue',grid:true,showValues:true,reason:'比较同量纲的矩阵模式。',alternatives:[],cautions:[]},text=(r:unknown)=>JSON.stringify({message:'Use heatmap',recommendation:r}),result=parseChartRecommendationResponse(text(recommendation),createBlank(),data)
    expect(rootContainer(result.figure!).dataChart!.spec).toMatchObject({kind:'heatmap',x:['B','A'],series:[{name:'Set A',values:[0,null]},{name:'Set B',values:[82,91]}],origin:'example',note:'Raw accuracy'})
    expect(result.chartRecommendation).toMatchObject({mapping:{x:'Method',unusedColumns:['Latency']},scale:{mode:'sequential',min:0,max:91,valueLabel:'Accuracy (%)'}})
    for(const patch of [{labelColumn:'c3'},{normalize:true},{series:[{column:'c1',errorColumn:'c2'}]},{colorMax:80},{paletteId:'figureforge-tableau10'}])expect(()=>parseChartRecommendationResponse(text({...recommendation,...patch}),createBlank(),data)).toThrow()
    expect(()=>parseChartRecommendationResponse(text(recommendation),createBlank(),{...data,errorLabel:'Mean ± SE'})).toThrow('误差棒')
  })
  it('wraps the full Chinese colorbar title observed in a real call without altering units or shrinking text',()=>{
    const spec=chartExample('heatmap');spec.valueLabel='准确率改变量（百分点）'
    const asset=buildDataChart(spec),titles=asset.figure.nodes.filter(n=>n.chart?.key?.startsWith('colorbar-title'))
    expect(titles.map(n=>n.label)).toEqual(['准确率改变量','（百分点）']);expect(titles.map(n=>n.label).join('')).toBe(spec.valueLabel);expect(titles.every(n=>n.textStyle?.size===10)).toBe(true);expect(rootContainer(asset.figure).dataChart!.spec.valueLabel).toBe(spec.valueLabel)
    expect(titles.at(-1)!.y+titles.at(-1)!.height).toBeLessThan(asset.figure.nodes.find(n=>n.chart?.key==='matrix-frame')!.y)
  })
})
