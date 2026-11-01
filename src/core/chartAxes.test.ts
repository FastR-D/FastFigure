import {alignChartPlots,chartPlotTargets,chartPlotBounds} from './chartPlotAlignment'
import {createSharedColorbar,sharedColorbarStates} from './sharedColorbar'
import {calloutTargets,createCallouts} from './callouts'
import {pathPoints} from './paths'
import {createSharedLegend,updateSharedLegend,sharedLegendEditTargets,sharedLegendStates,sharedLegendVisibility,detachSharedLegend} from './sharedLegend'
import {exportDrawio} from './export'
import {layoutPanels,defaultPanelOptions} from './panelLayout'
import { describe,expect,it } from 'vitest'
import { createHash } from 'node:crypto'
import { DOMParser } from '@xmldom/xmldom'
import { numericChartDomain,chartDomains,chartAxesReport } from './chartAxes'
import { buildDataChart,replaceDataChart } from './dataChart'
import { chartDomain } from './chartDomain'
import { chartExample,chartScaleExample } from './dataChartTable'
import { clone,createBlank,parseDocument,rootContainer,type FigureNode } from './model'
import { boxplotReport } from './boxplotStats'
import { configureChartAsset } from './chartTool'
import { captureComponent,componentDocument,scaleComponent,instantiateComponentAt } from './assets'
import { describeCatalogue } from './catalogue'
import { parseHarnessResponse } from './harness'
import {shareChartYAxis,applySharedYAxes,chartYAxisTargets} from './sharedYAxis'
import {addComponentPort} from './componentPorts'
import { parseChartDataset } from './chartDataset'
import { parseChartRecommendationResponse } from './chartRecommendation'
import { exportSvg } from './svg'
import { importSvg } from './svgImport'

const absolute=(node:FigureNode)=>node.path!.points.map(p=>({x:node.x+p.x*node.width,y:node.y+p.y*node.height}))
const center=(node:FigureNode)=>({x:node.x+node.width/2,y:node.y+node.height/2})
const raw=()=>parseChartDataset('Model,Parameters (M),Latency (ms),Latency_err,Memory (GB)\nTiny,1,0.1,0.02,1\nSmall,10,1,0.2,2\nMedium,100,,,4\nLarge,1000,100,20,8',{name:'Orders of magnitude',origin:'example',errorLabel:'Mean ± SD',note:'Authored data; not measured',dataSource:'Authored'})
const ready=()=>({status:'ready',kind:'scatter',xColumn:'c1',labelColumn:'c0',series:[{column:'c2',errorColumn:'c3'}],title:'Size and latency',xLabel:'Parameters (M)',yLabel:'Latency (ms)',xScale:'log10',yScale:'log10',paletteId:'figureforge-publication-soft',grid:true,showValues:false,reason:'比较跨数量级的模型大小和延迟，等距表示相同倍数变化。',alternatives:[],cautions:['对数轴不代表数据做过单位换算。']})
const response=(r:unknown)=>JSON.stringify({message:'Use logarithmic axes',recommendation:r})
function compared(scale:'linear'|'log10'='linear'){
  const left={...chartExample('line'),title:'First',yLabel:'Accuracy (%)',x:[1,2,3,4],series:[{name:'First',values:[70,80,null,90],errors:[.5,.6,null,.8]}],yMin:60,yMax:100,yScale:scale},kind=scale==='linear'?'bar':'line',right={...chartExample(kind),title:'Second',yLabel:'Accuracy (%)',x:kind==='bar'?['A','B','C']:[1,2,3],series:[{name:'Second',values:[10,20,30]}],yMin:scale==='linear'?0:1,yMax:100,yScale:scale}
  let figure=createBlank();figure=instantiateComponentAt(figure,scaleComponent(buildDataChart(left),.45),'stage',{x:70,y:200},'first').document;return instantiateComponentAt(figure,scaleComponent(buildDataChart(right),.45),'stage',{x:540,y:200},'second').document
}

function legendFigure(kind:'line'|'bar'|'scatter'='line'){
  let figure=createBlank();Object.assign(figure.containers[0]!,{x:0,y:0,width:1000,height:620})
  const spec=chartExample(kind),asset=buildDataChart(spec)
  figure=instantiateComponentAt(figure,scaleComponent(asset,.35),'stage',{x:60,y:200},'first',true).document
  return instantiateComponentAt(figure,scaleComponent(asset,.4),'stage',{x:560,y:200},'second',true).document
}

describe('native chart axes and scientific panel comparison',()=>{
  it('aligns physical plot edges across unequal typography while preserving source data, hand styles, ports and annotations',()=>{
    let doc=compared();const second=doc.containers.find(c=>c.id==='second')!
    doc=replaceDataChart(doc,'second',{...second.dataChart!.spec,fontFamily:'MiSans',fontSize:14}).document
    const title=doc.nodes.find(n=>n.parentId==='first'&&n.chart?.key==='title')!,curve=doc.nodes.find(n=>n.parentId==='first'&&n.chart?.key==='series-0-line')!
    title.label='Hand title';title.textStyle={...title.textStyle,bold:true};curve.visual={...curve.visual,stroke:'#754099',dash:[3,2]}
    doc.nodes.push({id:'owner-note',parentId:'first',kind:'text',label:'Owner annotation',x:120,y:370,width:100,height:18});const port=addComponentPort(doc,'first','output','my-port')
    const before=clone(doc),targets=chartPlotTargets(doc);expect(targets.every(t=>!t.error)).toBe(true);expect(targets[0]!.bounds!.top).not.toBe(targets[1]!.bounds!.top)
    const request={containerIds:['first','second'],columns:2,reason:'Compare physically aligned plotting areas'},result=alignChartPlots(doc,request),after=result.document
    expect(doc).toEqual(before);expect(result.report.changed).toBe(true);expect(after.style).toEqual(doc.style);expect(after.edges).toEqual(doc.edges)
    const bounds=chartPlotTargets(after).map(t=>t.bounds!);expect(bounds[0]!.top).toBeCloseTo(bounds[1]!.top,8);expect(bounds[0]!.bottom).toBeCloseTo(bounds[1]!.bottom,8)
    for(const root of after.containers.filter(c=>c.dataChart)){const old=before.containers.find(c=>c.id===root.id)!,spec=clone(root.dataChart!.spec);delete spec.plotArea;expect(spec).toEqual(old.dataChart!.spec);expect({...root,dataChart:undefined}).toEqual({...old,dataChart:undefined})}
    expect(after.nodes.map(n=>n.id)).toEqual(before.nodes.map(n=>n.id));expect(after.nodes.find(n=>n.id===title.id)).toMatchObject({label:'Hand title',textStyle:{bold:true}});expect(after.nodes.find(n=>n.id===curve.id)!.visual).toEqual(curve.visual)
    for(const id of ['owner-note',port.id])expect(after.nodes.find(n=>n.id===id)).toEqual(before.nodes.find(n=>n.id===id))
    const point=after.nodes.find(n=>n.parentId==='first'&&n.chart?.key==='series-0-point-0')!,domain=chartDomains(doc.containers.find(c=>c.id==='first')!.dataChart!.spec).y
    expect(center(point).y).toBeCloseTo(bounds[0]!.bottom-domain.position(70)*(bounds[0]!.bottom-bounds[0]!.top),7)
    const again=alignChartPlots(after,request);expect(again.report.changed).toBe(false);expect(again.document).toEqual(after)
    const recovered=importSvg(exportSvg(after),{fileName:'aligned.svg',sha256:'b'.repeat(64),parseXml:source=>new DOMParser().parseFromString(source,'image/svg+xml') as unknown as Document}).asset.figure
    expect(recovered.containers.filter(c=>c.dataChart).map(c=>c.dataChart!.spec.plotArea)).toEqual(after.containers.filter(c=>c.dataChart).map(c=>c.dataChart!.spec.plotArea))
  })
  it('aligns a mixed four-chart grid by row and column without altering box statistics or raw samples',()=>{
    let doc=createBlank();Object.assign(doc.containers[0]!,{x:0,y:0,width:1000,height:620});const ids=['line','bar','scatter','boxplot'] as const
    ids.forEach((kind,i)=>{const spec={...chartExample(kind),fontSize:i%2?11:10};doc=instantiateComponentAt(doc,scaleComponent(buildDataChart(spec),.35),'stage',{x:60+i%2*460,y:100+Math.floor(i/2)*240},kind,true).document})
    const before=clone(doc),result=alignChartPlots(doc,{containerIds:ids,columns:2,reason:'Row and column alignment'}),areas=result.report.charts.map(c=>c.after)
    for(const [a,b] of [[0,1],[2,3]]){expect(areas[a!]!.top).toBeCloseTo(areas[b!]!.top,8);expect(areas[a!]!.bottom).toBeCloseTo(areas[b!]!.bottom,8)}
    for(const [a,b] of [[0,2],[1,3]]){expect(areas[a!]!.left).toBeCloseTo(areas[b!]!.left,8);expect(areas[a!]!.right).toBeCloseTo(areas[b!]!.right,8)}
    const old=before.containers.find(c=>c.id==='boxplot')!.dataChart!.spec,next=result.document.containers.find(c=>c.id==='boxplot')!.dataChart!.spec
    expect(boxplotReport(next)).toEqual(boxplotReport(old));expect(next.series).toEqual(old.series);expect(doc).toEqual(before)
  })
  it('aligns a coupled grid of square-cell matrices and a numeric chart while keeping the existing shared colorbar, data, hand content and bindings',()=>{
    let doc=createBlank();Object.assign(doc.containers[0]!,{x:0,y:0,width:1000,height:620})
    const base={...chartExample('heatmap'),origin:'user' as const,note:'',xLabel:'',yLabel:'',valueLabel:'Score',showValues:false},heat=(rows:number,columns:number)=>({...base,x:Array.from({length:rows},(_,i)=>`R${i}`),series:Array.from({length:columns},(_,j)=>({name:`C${j}`,values:Array.from({length:rows},(_,i)=>i+j*10)}))})
    const specs=[heat(3,2),heat(3,3),heat(2,2),{...chartExample('line'),origin:'user' as const,note:'',xLabel:'',yLabel:'',showValues:false,x:[0,1],series:[{name:'Loss',values:[0,1]}]}],ids=['a','b','c','d']
    specs.forEach((spec,i)=>{doc=instantiateComponentAt(doc,scaleComponent(buildDataChart({...spec,title:ids[i]!}),.35),'stage',{x:35+i%2*500,y:70+Math.floor(i/2)*230},ids[i],true).document})
    doc=createSharedColorbar(doc,{containerIds:['a','b']}).document
    doc.nodes.push({id:'owner-note',parentId:'a',kind:'text',label:'Keep this note',x:45,y:214,width:90,height:12})
    const port=addComponentPort(doc,'a','output','matrix-out'),target=doc.nodes.find(n=>n.parentId==='b'&&n.chart?.key==='series-0-point-0')!;doc.edges.push({id:'external',source:port.id,target:target.id,sourcePort:'right',targetPort:'left'})
    const title=doc.nodes.find(n=>n.parentId==='a'&&n.chart?.key==='title')!;title.label='Hand matrix';title.textStyle={...title.textStyle,bold:true}
    const before=clone(doc),request={containerIds:ids,columns:2,reason:'Compare aligned matrices and a numeric view'},result=alignChartPlots(doc,request),after=result.document,areas=result.report.charts.map(c=>c.after)
    for(const[a,b]of [[0,1],[2,3]]){expect(areas[a!]!.top).toBeCloseTo(areas[b!]!.top,8);expect(areas[a!]!.bottom).toBeCloseTo(areas[b!]!.bottom,8)}
    for(const[a,b]of [[0,2],[1,3]]){expect(areas[a!]!.left).toBeCloseTo(areas[b!]!.left,8);expect(areas[a!]!.right).toBeCloseTo(areas[b!]!.right,8)}
    for(const root of after.containers.filter(c=>c.dataChart)){const old=before.containers.find(c=>c.id===root.id)!,spec=clone(root.dataChart!.spec);delete spec.plotArea;expect(spec).toEqual(old.dataChart!.spec);if(spec.kind==='heatmap')for(const cell of after.nodes.filter(n=>n.parentId===root.id&&/^series-\d+-point-\d+$/.test(n.chart?.key??''))){expect(cell.width).toBeCloseTo(cell.height,8);expect(cell.visual).toEqual(before.nodes.find(n=>n.id===cell.id)!.visual)}}
    expect(after.nodes.map(n=>n.id)).toEqual(before.nodes.map(n=>n.id));expect(after.edges).toEqual(before.edges);expect(after.nodes.find(n=>n.id==='owner-note')).toEqual(before.nodes.find(n=>n.id==='owner-note'));expect(after.nodes.find(n=>n.id===port.id)).toEqual(port);expect(after.nodes.find(n=>n.id===title.id)).toMatchObject({label:'Hand matrix',textStyle:{bold:true}});expect(sharedColorbarStates(after)[0]!.active).toBe(true);expect(after.containers.find(c=>c.sharedColorbar)).toEqual(before.containers.find(c=>c.sharedColorbar));expect(doc).toEqual(before)
    expect(alignChartPlots(after,request)).toMatchObject({document:clone(after),report:{changed:false}})
    const restored=importSvg(exportSvg(after),{fileName:'matrices.svg',sha256:'a'.repeat(64),parseXml:s=>new DOMParser().parseFromString(s,'image/svg+xml') as unknown as Document}).asset.figure
    expect(sharedColorbarStates(restored)[0]!.active).toBe(true);expect(chartPlotTargets(restored).map(t=>t.bounds)).toEqual(chartPlotTargets(after).map(t=>t.bounds))
    const inconsistent=replaceDataChart(doc,'d',heat(2,2)).document,snapshot=clone(inconsistent);expect(()=>alignChartPlots(inconsistent,request)).toThrow('宽高比例');expect(inconsistent).toEqual(snapshot)
  })
  it('rejects incorrect slots, hand-moved data and crowded fixed plots atomically, and compiles only controlled requests',()=>{
    const doc=compared(),snapshot=clone(doc),request={containerIds:['first','second'],columns:2,reason:'Align existing plots'},raw={message:'Align',figure:null,plotAlignments:[request]},parsed=parseHarnessResponse(JSON.stringify(raw),doc)
    expect(parsed.plotAlignments).toHaveLength(1);expect(parsed.figure!.containers.filter(c=>c.dataChart).every(c=>c.dataChart!.spec.plotArea)).toBe(true)
    expect(()=>parseHarnessResponse(JSON.stringify({...raw,sharedYAxes:[{containerIds:request.containerIds,reason:'Mix'}]}),doc)).toThrow('单独')
    expect(()=>alignChartPlots(doc,{...request,columns:1})).toThrow('共同绘图区')
    const moved=clone(doc);moved.nodes.find(n=>n.chart?.key==='series-0-point-0')!.x+=2;expect(()=>alignChartPlots(moved,request)).toThrow('手工移动')
    const heat=replaceDataChart(doc,'second',chartExample('heatmap')).document;heat.nodes.find(n=>n.parentId==='second'&&n.chart?.key==='matrix-frame')!.width+=1;expect(()=>alignChartPlots(heat,request)).toThrow('手工移动')
    expect(()=>buildDataChart({...chartExample('heatmap'),plotArea:{left:100,right:400,top:100,bottom:300}})).toThrow('正方形')
    const fixed=parsed.figure!.containers.find(c=>c.id==='first')!.dataChart!.spec
    expect(()=>buildDataChart({...fixed,fontSize:24})).toThrow('固定绘图区')
    const auto=clone(fixed);delete auto.plotArea;expect(buildDataChart(auto).figure.nodes.length).toBeGreaterThan(0);expect(doc).toEqual(snapshot)
    expect(chartPlotBounds(parsed.figure!.nodes.filter(n=>n.parentId==='first')).bottom).toBe(parsed.plotAlignments![0]!.charts[0]!.after.bottom)
  })

  it.each(['line','bar','scatter'] as const)('shares %s legends without deleting observations, keeps bindings on capture, and safely restores local legends after incompatible edits',kind=>{
    const doc=legendFigure(kind),before=clone(doc),result=createSharedLegend(doc,{containerIds:['first','second'],fontFamily:'Comic Sans MS',fontSize:14}),group=result.document.containers.find(c=>c.sharedLegend)!,visibility=sharedLegendVisibility(result.document),entry=group.sharedLegend!.entries[0]!
    expect(doc).toEqual(before);expect(result.document.nodes.filter(n=>n.parentId!==group.id)).toEqual(before.nodes);expect(result.document.containers.filter(c=>c.id!==group.id)).toEqual(before.containers);expect(visibility.warnings).toEqual([]);expect(visibility.hidden.size).toBe(doc.containers.find(c=>c.dataChart)!.dataChart!.spec.series.length*4)
    const hiddenLabel=doc.nodes.find(n=>visibility.hidden.has(n.id)&&n.kind==='text')!;expect(calloutTargets(result.document).find(t=>t.targetId===hiddenLabel.id)!.error).toBe('目标已隐藏');expect(()=>createCallouts(result.document,[{targetId:hiddenLabel.id,text:'Hidden target',reason:'Must not bind invisible labels'}])).toThrow('可见')
    const svg=exportSvg(result.document);for(const id of visibility.hidden)expect(svg).not.toContain(`data-object-id="${id}"`);expect(svg).toContain(`data-object-id="${entry.markId}"`);expect(exportDrawio(result.document)).not.toContain(`id="${[...visibility.hidden][0]}"`)
    const captured=captureComponent(result.document,'stage','Compared charts'),placed=instantiateComponentAt(createBlank(),scaleComponent(captured,.45),'stage',{x:65,y:150},'all',true).document
    expect(sharedLegendStates(placed)[0]!.active).toBe(true)
    expect(captureComponent(result.document,group.id,'Standalone legend').figure.containers[0]!.sharedLegend).toBeUndefined()
    const recovered=importSvg(svg,{fileName:'shared.svg',sha256:'a'.repeat(64),parseXml:source=>new DOMParser().parseFromString(source,'image/svg+xml') as unknown as Document}).asset.figure;expect(sharedLegendStates(recovered)[0]!.active).toBe(true)
    const changed=clone(result.document),legend=changed.nodes.find(n=>n.parentId==='second'&&n.chart?.key==='series-0-legend')!;legend.visual={...legend.visual,stroke:'#cc5500',fill:'#cc5500'}
    expect(sharedLegendStates(changed)[0]!.active).toBe(false);const restored=exportSvg(changed);for(const id of visibility.hidden)expect(restored).toContain(`data-object-id="${id}"`);expect(restored).not.toContain(`data-object-id="${entry.markId}"`);expect(exportDrawio(changed)).toContain('共享图例已停用')
    const pointOnly=clone(result.document);pointOnly.nodes.find(n=>n.parentId==='second'&&n.chart?.key==='series-0-point-0')!.visual!.stroke='#ff0000';expect(sharedLegendStates(pointOnly)[0]!.active).toBe(false)
    expect(sharedLegendVisibility(detachSharedLegend(result.document,group.id)).hidden.size).toBe(0)
    const renamed=clone(result.document);renamed.nodes.find(n=>n.id===entry.labelId)!.label='Other method';expect(sharedLegendStates(renamed)[0]!.active).toBe(false)
    expect(()=>createSharedLegend(result.document,{containerIds:['first','second']})).toThrow('已关联')
  })
  it('reflows an existing scaled legend with stable IDs, mixed manual fonts, extra notes and external bindings, refusing collisions and inactive sources atomically',()=>{
    const initial=createSharedLegend(legendFigure(),{containerIds:['first','second']}).document,root=initial.containers.find(c=>c.sharedLegend)!,entries=root.sharedLegend!.entries
    initial.nodes.find(n=>n.id===entries[0]!.labelId)!.textStyle={...initial.nodes.find(n=>n.id===entries[0]!.labelId)!.textStyle,family:'MiSans',size:16,bold:true,weight:700,italic:true,color:'#654321'}
    initial.nodes.find(n=>n.id===entries[1]!.labelId)!.textStyle!.family='Comic Sans MS'
    initial.nodes.push({id:'owner-note',parentId:root.id,kind:'text',label:'Owner note',x:root.x+root.width+4,y:root.y+5,width:80,height:16,textStyle:{size:11,color:'#234567'}});root.width+=90;addComponentPort(initial,root.id,'output','legend-output')
    const doc=instantiateComponentAt(createBlank(),scaleComponent(captureComponent(initial,'stage','Legend source'),.6),'stage',{x:80,y:150},'all',true).document,group=doc.containers.find(c=>c.sharedLegend)!,record=group.sharedLegend!,label=doc.nodes.find(n=>n.id===record.entries[0]!.labelId)!,note=doc.nodes.find(n=>n.label==='Owner note')!,port=doc.nodes.find(n=>n.socket?.direction==='output'&&n.interfaceFor===group.id)!
    doc.edges.push({id:'legend-link',source:port.id,target:doc.nodes.find(n=>n.chart?.key==='series-0-point-0')!.id,sourcePort:'right',targetPort:'left'})
    doc.nodes.push({id:'external-leader',parentId:'stage',kind:'path',label:'',x:60,y:150,width:100,height:1,path:{points:[{x:0,y:0},{x:1,y:1}],arrow:'open',end:{nodeId:label.id,x:0,y:.5,offsetX:2,note:'Keep attachment'}}})
    Object.assign(doc,parseDocument(doc))
    const before=clone(doc),command={containerId:group.id,placement:'top',columns:1,gap:6,reason:'Read methods vertically'},result=updateSharedLegend(doc,command),next=result.document,updated=next.containers.find(c=>c.id===group.id)!,managed=new Set(record.entries.flatMap(entry=>[entry.markId,entry.labelId])),owned=new Set([...managed,note.id,port.id,'external-leader'])
    expect(doc).toEqual(before);expect(next.nodes.map(n=>n.id)).toEqual(before.nodes.map(n=>n.id));expect(next.nodes.filter(n=>!owned.has(n.id))).toEqual(before.nodes.filter(n=>!owned.has(n.id)));expect(next.containers.filter(c=>c.id!==group.id)).toEqual(before.containers.filter(c=>c.id!==group.id));expect(next.edges).toEqual(before.edges)
    expect(next.nodes.find(n=>n.id===port.id)).toMatchObject({x:updated.x,y:updated.y,width:updated.width,height:updated.height,socket:port.socket,interfaceFor:group.id})
    expect(updated.sharedLegend!.entries).toEqual(record.entries);expect(updated.sharedLegend!.chartIds).toEqual(record.chartIds);expect(sharedLegendStates(next)[0]!.active).toBe(true);expect(result.report).toMatchObject({operation:'update',changed:true,after:{columns:1,gap:6}});expect(result.report.fontFamily).toBeUndefined();expect(result.report.fontSize).toBeUndefined()
    for(const entry of record.entries){const old=before.nodes.find(n=>n.id===entry.labelId)!,changed=next.nodes.find(n=>n.id===entry.labelId)!;expect(changed.textStyle).toEqual(old.textStyle);expect(changed.label).toBe(old.label)}
    const oldLeader=before.nodes.find(n=>n.id==='external-leader')!,newLeader=next.nodes.find(n=>n.id==='external-leader')!;expect(newLeader.path!.end).toEqual(oldLeader.path!.end);expect(pathPoints(next,newLeader)[0]).toEqual(pathPoints(before,oldLeader)[0]);expect(pathPoints(next,newLeader).at(-1)).not.toEqual(pathPoints(before,oldLeader).at(-1))
    const svgDoc=new DOMParser().parseFromString(exportSvg(next),'image/svg+xml'),renderedLabel=Array.from(svgDoc.getElementsByTagName('g')).find(node=>node.getAttribute('data-object-id')===label.id)!.getElementsByTagName('text')[0]!;expect(renderedLabel.getAttribute('font-weight')).toBe('700');expect(renderedLabel.getAttribute('font-style')).toBe('italic')
    const movedNote=next.nodes.find(n=>n.id===note.id)!;expect(movedNote.x-updated.x).toBeCloseTo(note.x-group.x);expect(movedNote.y-updated.y).toBeCloseTo(note.y-group.y);expect(movedNote.textStyle).toEqual(note.textStyle)
    const noChange=updateSharedLegend(next,{...command,placement:'preserve'});expect(noChange.document).toEqual(next);expect(noChange.report.changed).toBe(false);expect(noChange.report.updatedNodes).toBe(0)
    const shifted=clone(next);shifted.nodes.find(n=>n.id===label.id)!.x+=3;const restored=updateSharedLegend(shifted,{...command,placement:'preserve'});expect(restored.report.changed).toBe(true);expect(restored.document.nodes.find(n=>n.id===label.id)!.x).toBeCloseTo(next.nodes.find(n=>n.id===label.id)!.x)
    const response=JSON.stringify({message:'Adjust existing legend',figure:null,sharedLegends:[command]}),parsed=parseHarnessResponse(response,before);expect(parsed.figure).toEqual(next);expect(parsed.sharedLegends![0]).toEqual(result.report);expect(parseHarnessResponse(JSON.stringify({message:'Keep current layout',figure:null,sharedLegends:[{...command,placement:'preserve'}]}),next).figure).toBeNull()
    const blocked=clone(before);blocked.nodes.push({id:'obstacle',parentId:group.parentId!,kind:'rectangle',label:'',x:updated.x+4,y:updated.y+4,width:12,height:12});const blockedBefore=clone(blocked);expect(()=>updateSharedLegend(blocked,command)).toThrow('重叠');expect(blocked).toEqual(blockedBefore)
    const inactive=clone(before);inactive.nodes.find(n=>n.id===label.id)!.label='Other method';expect(()=>updateSharedLegend(inactive,command)).toThrow('已停用')
    const removed=clone(before);removed.nodes=removed.nodes.filter(n=>n.id!==label.id&&n.id!=='external-leader');expect(sharedLegendEditTargets(removed)[0]!.active).toBe(false)
    const inner=clone(before),innerNote=inner.nodes.find(n=>n.id===note.id)!;innerNote.x=group.x+6;innerNote.y=group.y+6;expect(()=>updateSharedLegend(inner,command)).toThrow('手工对象')
    const rotated=clone(before);rotated.nodes.find(n=>n.id===label.id)!.textLayout!.matrix=[0,1,-1,0];expect(()=>updateSharedLegend(rotated,command)).toThrow('变换')
    for(const patch of [{columns:4},{gap:121},{fontSize:0},{entries:[]},{values:[999]},{containerId:'missing'}])expect(()=>updateSharedLegend(before,{...command,...patch})).toThrow()
  })
  it('synchronizes explicitly matched source changes with retained legend identity, typography and bindings, and safely adds or removes complete entries',()=>{
    let doc=createSharedLegend(legendFigure(),{containerIds:['first','second'],placement:'top'}).document
    const group=doc.containers.find(c=>c.sharedLegend)!,old=clone(group.sharedLegend!.entries),label=doc.nodes.find(n=>n.id===old[0]!.labelId)!
    label.textStyle={...label.textStyle,family:'MiSans',size:16,bold:true,weight:700,italic:true,color:'#654321'};doc.nodes.find(n=>n.id===old[1]!.labelId)!.textStyle!.family='Comic Sans MS'
    doc.nodes.push({id:'owner-note',parentId:group.id,kind:'text',label:'Keep note',x:group.x+8,y:group.y+group.height+6,width:90,height:14},{id:'external-leader',parentId:'stage',kind:'path',label:'',x:100,y:110,width:150,height:1,path:{points:[{x:0,y:0},{x:1,y:1}],arrow:'open',end:{nodeId:label.id,x:0,y:.5,offsetX:2,note:'Keep this binding'}}});group.height+=26;addComponentPort(doc,group.id,'output','legend-port');doc=parseDocument(doc)
    const edit=(input:typeof doc,change:(spec:ReturnType<typeof chartExample>)=>ReturnType<typeof chartExample>)=>{let result=input;for(const id of ['first','second'])result=replaceDataChart(result,id,change(clone(result.containers.find(c=>c.id===id)!.dataChart!.spec))).document;return result}
    doc=edit(doc,spec=>({...spec,paletteId:'figureforge-publication-soft',series:spec.series.map((s,i)=>({...s,name:i===0?'Reference':s.name})).reverse()}))
    const before=clone(doc),command={containerId:group.id,reason:'Reference is the renamed Baseline',syncEntries:[{seriesName:'Ours',previousLabelId:old[1]!.labelId},{seriesName:'Reference',previousLabelId:old[0]!.labelId}]},result=updateSharedLegend(doc,command),after=result.document,current=after.containers.find(c=>c.id===group.id)!
    expect(sharedLegendStates(doc)[0]!.active).toBe(false);expect(sharedLegendEditTargets(doc)[0]).toMatchObject({syncReady:true});expect(sharedLegendStates(after)[0]!.active).toBe(true);expect(current.sharedLegend!.entries.map(e=>[e.name,e.markId,e.labelId])).toEqual([['Reference',old[0]!.markId,old[0]!.labelId],['Ours',old[1]!.markId,old[1]!.labelId]])
    expect(after.nodes.map(n=>n.id)).toEqual(before.nodes.map(n=>n.id));expect(after.containers.filter(c=>c.id!==group.id)).toEqual(before.containers.filter(c=>c.id!==group.id));expect(after.nodes.filter(n=>n.parentId!==group.id&&n.id!=='external-leader')).toEqual(before.nodes.filter(n=>n.parentId!==group.id&&n.id!=='external-leader'));expect(after.nodes.find(n=>n.id==='external-leader')!.path!.end).toEqual(before.nodes.find(n=>n.id==='external-leader')!.path!.end);expect(after.nodes.find(n=>n.id==='owner-note')).toEqual(before.nodes.find(n=>n.id==='owner-note'));expect(after.nodes.find(n=>n.id==='legend-port')!.socket).toEqual(before.nodes.find(n=>n.id==='legend-port')!.socket);expect(after.edges).toEqual(before.edges);expect(current.sharedLegend!.layout).toEqual(group.sharedLegend!.layout)
    for(const entry of old)expect(after.nodes.find(n=>n.id===entry.labelId)!.textStyle).toEqual(before.nodes.find(n=>n.id===entry.labelId)!.textStyle)
    expect(result.report.sourceSync).toMatchObject({entries:[{name:'Reference',previousName:'Baseline',action:'renamed',encodingChanged:true},{name:'Ours',action:'kept',encodingChanged:true}],removed:[]});expect(doc).toEqual(before);expect(updateSharedLegend(after,command)).toMatchObject({document:clone(after),report:{changed:false}})
    expect(parseHarnessResponse(JSON.stringify({message:'Sync',figure:null,sharedLegends:[command]}),doc).sharedLegends![0]).toEqual(result.report)
    let added=edit(after,spec=>({...spec,series:[...spec.series,{name:'Variant',values:spec.x.map(()=>65)}]}));const addCommand={...command,syncEntries:[...command.syncEntries,{seriesName:'Variant',previousLabelId:null}]},expanded=updateSharedLegend(added,addCommand),entry=expanded.document.containers.find(c=>c.id===group.id)!.sharedLegend!.entries.find(e=>e.name==='Variant')!
    expect(expanded.document.nodes.length).toBe(added.nodes.length+2);expect(expanded.report.sourceSync!.entries.at(-1)).toMatchObject({name:'Variant',action:'added',labelId:entry.labelId});expect(sharedLegendStates(expanded.document)[0]!.active).toBe(true)
    added=edit(expanded.document,spec=>({...spec,series:spec.series.filter(s=>s.name!=='Variant')}));const removed=updateSharedLegend(added,command);expect(removed.report.sourceSync!.removed).toEqual([{name:'Variant',markId:entry.markId,labelId:entry.labelId}]);expect(removed.document.nodes.length).toBe(added.nodes.length-2)
    const referenced=edit(after,spec=>({...spec,series:spec.series.filter(s=>s.name!=='Reference')})),snapshot=clone(referenced);expect(()=>updateSharedLegend(referenced,{...command,syncEntries:[command.syncEntries[0]]})).toThrow('仍有连接');expect(referenced).toEqual(snapshot)
    const hand=clone(doc);hand.nodes.find(n=>n.id===label.id)!.label='Hand name';expect(sharedLegendEditTargets(hand)[0]!.syncReady).toBe(false);expect(()=>updateSharedLegend(hand,command)).toThrow('手工改变')
    for(const patch of [{label:'Hand glyph note'},{iconId:'mdi:chip'},{visual:{...doc.nodes.find(n=>n.id===old[0]!.markId)!.visual,handDrawn:true}}]){const altered=clone(doc);Object.assign(altered.nodes.find(n=>n.id===old[0]!.markId)!,patch);expect(sharedLegendEditTargets(altered)[0]!.syncReady).toBe(false);expect(()=>updateSharedLegend(altered,command)).toThrow('手工改变')}
    for(const id of ['first',group.id,'stage']){const faded=clone(doc);faded.containers.find(c=>c.id===id)!.opacity=.5;expect(sharedLegendEditTargets(faded)[0]!.syncReady).toBe(false);expect(()=>updateSharedLegend(faded,command)).toThrow('透明度')}
    const frameOnly=clone(doc);frameOnly.containers.find(c=>c.id===group.id)!.visual={opacity:0};expect(sharedLegendEditTargets(frameOnly)[0]!.syncReady).toBe(true);expect(sharedLegendStates(updateSharedLegend(frameOnly,command).document)[0]!.active).toBe(true)
    const mismatched=replaceDataChart(doc,'second',{...doc.containers.find(c=>c.id==='second')!.dataChart!.spec,paletteId:'figureforge-tableau10'}).document;expect(()=>updateSharedLegend(mismatched,command)).toThrow('不一致')
    for(const syncEntries of [[command.syncEntries[0]],[...command.syncEntries,{seriesName:'Invented',previousLabelId:null}],[{seriesName:'Ours',previousLabelId:old[0]!.labelId},{seriesName:'Reference',previousLabelId:old[0]!.labelId}],[{seriesName:'Ours',previousLabelId:'foreign'},{seriesName:'Reference',previousLabelId:old[0]!.labelId}]])expect(()=>updateSharedLegend(doc,{...command,syncEntries})).toThrow()
    const roundtrip=importSvg(exportSvg(after),{fileName:'synced.svg',sha256:'c'.repeat(64),parseXml:s=>new DOMParser().parseFromString(s,'image/svg+xml') as unknown as Document}).asset.figure;expect(sharedLegendStates(roundtrip)[0]!.active).toBe(true)
    const captured=scaleComponent(captureComponent(after,'stage','Synced legend'),.5).figure;expect(sharedLegendStates(captured)[0]!.active).toBe(true)
  })
  it('rejects ambiguous shared legends and compiles controlled requests and reserved multi-panel space atomically',()=>{
    const doc=legendFigure(),before=clone(doc),raw={message:'Share methods',figure:null,sharedLegends:[{containerIds:['first','second'],placement:'bottom',fontSize:14,reason:'Same declared methods'}]}
    const parsed=parseHarnessResponse(JSON.stringify(raw),doc);expect(parsed.sharedLegends).toHaveLength(1);expect(sharedLegendStates(parsed.figure!)[0]!.active).toBe(true);expect(doc).toEqual(before)
    expect(()=>parseHarnessResponse(JSON.stringify({...raw,sharedYAxes:[{containerIds:['first','second'],reason:'Mix'}]}),doc)).toThrow('单独')
    expect(()=>parseHarnessResponse(JSON.stringify({...raw,figure:doc}),doc)).toThrow('单独');expect(()=>parseHarnessResponse(JSON.stringify(raw),doc,[],[],undefined,true)).toThrow('单独')
    const mismatched=clone(doc);mismatched.containers.find(c=>c.id==='second')!.dataChart!.spec.series[0]!.name='Different';expect(()=>createSharedLegend(mismatched,{containerIds:['first','second']})).toThrow('改字')
    const linked=clone(doc),legend=linked.nodes.find(n=>n.chart?.key==='series-0-name')!;linked.nodes.push({id:'bound-line',kind:'path',parentId:'stage',label:'',x:20,y:100,width:1,height:1,path:{points:[{x:0,y:0},{x:1,y:1}],arrow:'none',end:{nodeId:legend.id,x:.5,y:.5}}});expect(()=>createSharedLegend(linked,{containerIds:['first','second']})).toThrow('绑定')
    const arranged=layoutPanels(doc,'stage',[{containerId:'first',caption:'First'},{containerId:'second',caption:'Second'}],{...defaultPanelOptions,bottomSpace:64}).document;expect(sharedLegendStates(createSharedLegend(arranged,{containerIds:['first','second']}).document)[0]!.active).toBe(true)
  })
  it.each(['linear','log10'] as const)('unifies %s ranges without changing raw values, manual presentation, source snapshots or connected mark identities',scale=>{
    const doc=compared(scale),root=doc.containers.find(container=>container.id==='first')!,title=doc.nodes.find(node=>node.parentId==='first'&&node.chart?.key==='title')!,curve=doc.nodes.find(node=>node.parentId==='first'&&node.chart?.key==='series-0-line')!,point=doc.nodes.find(node=>node.parentId==='first'&&node.chart?.key==='series-0-point-0')!
    root.title='Hand named frame';title.label='Hand title';title.description='Owner label note';title.descriptionStyle={size:5,family:'MiSans'};point.evidence={title:'Source note',reference:'Fig. A'};title.textStyle={...title.textStyle,family:'MiSans',size:12,bold:true};delete title.textStyle.weight;curve.visual={...curve.visual,stroke:'#734f96',strokeWidth:1.8,dash:[3,2]}
    doc.nodes.push({id:'owner-note',kind:'text',label:'Owner note',parentId:'first',x:root.x+180,y:root.y+155,width:100,height:16,textStyle:{size:8}},{id:'external-node',kind:'rectangle',label:'Context',parentId:'stage',x:430,y:240,width:80,height:40});const port=addComponentPort(doc,'first','output','source-port'),other=doc.nodes.find(node=>node.parentId==='second'&&node.chart?.key==='series-0-point-0')!;doc.edges.push({id:'port-external',source:port.id,target:other.id,sourcePort:'right',targetPort:'left'},{id:'mark-external',source:'external-node',target:point.id,sourcePort:'right',targetPort:'left'})
    const before=clone(doc),result=shareChartYAxis(doc,['first','second']),after=result.document,range=result.report,min=scale==='linear'?0:1
    expect(range).toMatchObject({scale,min,max:100,changed:true,charts:[{beforeRevision:1,afterRevision:2,changed:true},{beforeRevision:1,afterRevision:1,changed:false}]});expect(doc).toEqual(before);expect(after.style).toEqual(before.style);expect(after.edges).toEqual(before.edges)
    for(const id of ['first','second']){const old=before.containers.find(container=>container.id===id)!,next=after.containers.find(container=>container.id===id)!;expect(next.dataChart!.spec.series).toEqual(old.dataChart!.spec.series);expect(next.dataChart!.spec.x).toEqual(old.dataChart!.spec.x);expect(next.component).toEqual(old.component);expect(next.title).toBe(old.title)}
    expect(after.nodes.find(node=>node.id===title.id)).toMatchObject({label:'Hand title',textStyle:{family:'MiSans',size:12,bold:true}});expect(after.nodes.find(node=>node.id===curve.id)!.visual).toEqual(curve.visual);expect(after.nodes.find(node=>node.id==='owner-note')).toEqual(before.nodes.find(node=>node.id==='owner-note'));expect(after.nodes.find(node=>node.id===port.id)).toEqual(before.nodes.find(node=>node.id===port.id))
    expect(after.nodes.find(node=>node.id===point.id)!.evidence).toEqual(point.evidence);expect(after.nodes.find(node=>node.id===title.id)).toMatchObject({description:title.description,descriptionStyle:title.descriptionStyle})
    const axis=after.nodes.find(node=>node.parentId==='first'&&node.chart?.key==='axis-y')!,ys=absolute(axis).map(point=>point.y),expected=scale==='linear'?.7:Math.log10(70)/2
    expect(center(after.nodes.find(node=>node.id===point.id)!).y).toBeCloseTo(Math.max(...ys)-expected*(Math.max(...ys)-Math.min(...ys)));expect(shareChartYAxis(after,['first','second']).report.changed).toBe(false)
  })
  it('refuses mismatched units, manually changed axis titles and an invalid later group atomically',()=>{
    let doc=compared(),spec={...chartExample('line'),title:'Third',yLabel:'Accuracy (%)'};doc=instantiateComponentAt(doc,scaleComponent(buildDataChart(spec),.2),'stage',{x:70,y:440},'third').document;spec={...spec,title:'Fourth',yLabel:'Latency (ms)'};doc=instantiateComponentAt(doc,scaleComponent(buildDataChart(spec),.2),'stage',{x:300,y:440},'fourth').document
    const before=clone(doc);expect(()=>applySharedYAxes(doc,[{containerIds:['first','second'],reason:'Compare accuracy'},{containerIds:['third','fourth'],reason:'Invalid mixed units'}])).toThrow('标题与单位');expect(doc).toEqual(before)
    expect(()=>shareChartYAxis(doc,['first','missing'])).toThrow('原生数据图表');const edited=clone(doc);edited.nodes.find(node=>node.parentId==='first'&&node.chart?.key==='label-axis-y')!.label='Different metric';expect(chartYAxisTargets(edited).find(target=>target.containerId==='first')!.error).toContain('不一致');expect(()=>shareChartYAxis(edited,['first','second'])).toThrow('不一致')
  })
  it('compiles source-bound assistant axis groups and rejects mixed graph edits or invented range reports',()=>{
    const figure=compared(),before=clone(figure),request={containerIds:['first','second'],reason:'Compare the same quantity'},text=(patch={})=>JSON.stringify({message:'Uniform axes',figure:null,sharedYAxes:[request],...patch}),result=parseHarnessResponse(text(),figure)
    expect(result.figure!.containers.find(container=>container.id==='first')!.dataChart!.spec).toMatchObject({yMin:0,yMax:100});expect(result.sharedYAxes).toMatchObject([{min:0,max:100,yLabel:'Accuracy (%)',changed:true}]);expect(result.used).toEqual([]);expect(figure).toEqual(before)
    expect(()=>parseHarnessResponse(text({figure}),figure)).toThrow('单独提交');expect(()=>parseHarnessResponse(text({sharedYAxes:[{...request,min:-100}]}),figure)).toThrow('契约');expect(()=>parseHarnessResponse(text(),figure,[],[],undefined,true)).toThrow('单独提交');expect(parseHarnessResponse(text(),result.figure!).figure).toBeNull()
  })
  it('places equal ratios at equal distances and retains original-value ticks',()=>{
    const values=[1,10,100,1000],saved=[...values],d=numericChartDomain(values,'log10')
    expect(d.min).toBe(1);expect(d.max).toBe(1000);expect(d.ticks).toEqual([1,10,100,1000]);expect(values).toEqual(saved)
    for(let i=0;i<4;i++)expect(d.position(values[i]!)).toBeCloseTo(i/3,14)
    expect(d.position(Math.sqrt(10))).toBeCloseTo(1/6,14)
    const linear=numericChartDomain(values);expect({min:linear.min,max:linear.max,ticks:linear.ticks}).toEqual(chartDomain(values));expect(linear.position(10)).not.toBeCloseTo(1/3)
  })
  it('covers constants, subnormals and huge dynamic ranges with finite, distinct and bounded ticks',()=>{
    for(const values of [[10,10],[Number.MIN_VALUE,Number.MIN_VALUE],[Number.MIN_VALUE,1e12],[1e-300,1e-200,1e-100,1,1e12],[.09,110]]){
      const d=numericChartDomain(values,'log10');expect(d.min).toBeGreaterThan(0);expect(d.min).toBeLessThanOrEqual(Math.min(...values));expect(d.max).toBeGreaterThanOrEqual(Math.max(...values));expect(d.max).toBeGreaterThan(d.min)
      expect(d.ticks.length).toBeGreaterThanOrEqual(2);expect(d.ticks.length).toBeLessThanOrEqual(10);expect(new Set(d.ticks).size).toBe(d.ticks.length)
      for(const value of [...values,...d.ticks]){expect(Number.isFinite(d.position(value))).toBe(true);expect(d.position(value)).toBeGreaterThanOrEqual(-1e-12);expect(d.position(value)).toBeLessThanOrEqual(1+1e-12)}
    }
  })
  it('uses readable interior ticks for short log spans and honest endpoint labels when none exist',()=>{
    expect(numericChartDomain([2,20],'log10',2,20).ticks).toEqual([2,5,10,20])
    expect(numericChartDomain([3,4],'log10',3,4).ticks).toEqual([3,4])
    expect(()=>numericChartDomain([1,1+Number.EPSILON],'log10',1,1+Number.EPSILON)).toThrow('精度')
  })
  it('rejects zero, negative values, clipping and invalid bounds without masking or offsets',()=>{
    for(const values of [[0,1],[-1,-2],[-1,2],[],[NaN,1],[Infinity,1]])expect(()=>numericChartDomain(values,'log10')).toThrow()
    for(const [min,max] of [[0,10],[-1,10],[2,10],[1,9],[NaN,10],[1,Infinity]])expect(()=>numericChartDomain([1,10],'log10',min,max)).toThrow()
    expect(()=>numericChartDomain([1,10],'log10',undefined,undefined,true)).toThrow('大于 0')
    expect(()=>numericChartDomain([1,10],'linear',2,20,false,'横轴')).toThrow('横轴范围会截断')
  })
  it('compiles log-log geometry and explicit axis titles while freezing every raw observation',()=>{
    const spec=chartScaleExample('line'),saved=clone(spec),asset=buildDataChart(spec),node=(key:string)=>asset.figure.nodes.find(n=>n.chart?.key===key)!,points=spec.x.map((_,i)=>center(node(`series-1-point-${i}`)))
    expect(rootContainer(asset.figure).dataChart!.spec).toEqual(saved);expect(spec).toEqual(saved)
    for(let i=1;i<3;i++){expect(points[i+1]!.x-points[i]!.x).toBeCloseTo(points[i]!.x-points[i-1]!.x);expect(points[i]!.y-points[i+1]!.y).toBeCloseTo(points[i-1]!.y-points[i]!.y)}
    expect(node('label-axis-x').label).toBe('Parameters (M) · log10');expect(node('label-axis-y').label).toBe('Latency (ms) · log10');expect(asset.figure.nodes.some(n=>n.chart?.key==='zero-baseline')).toBe(false)
  })
  it('maps symmetric raw error endpoints separately, yielding asymmetric displayed log error bars',()=>{
    const spec=chartScaleExample('scatter');spec.x=[1,10,100];spec.series=[{name:'Latency',values:[10,100,1000],errors:[1,10,100]}];spec.pointLabels=['A','B','C'];spec.errorLabel='Mean ± SD';spec.yMin=1;spec.yMax=10000
    const asset=buildDataChart(spec),node=(key:string)=>asset.figure.nodes.find(n=>n.chart?.key===key)!,axis=absolute(node('axis-y')),bottom=axis[1]!.y,top=axis[0]!.y,y=(v:number)=>bottom-Math.log10(v)/4*(bottom-top),point=center(node('series-0-point-0')),errors=absolute(node('series-0-errors'))
    expect(point.y).toBeCloseTo(y(10));expect(errors[0]!.y).toBeCloseTo(y(11));expect(errors[3]!.y).toBeCloseTo(y(9));expect(errors[3]!.y-point.y).toBeGreaterThan(point.y-errors[0]!.y)
    expect(rootContainer(asset.figure).dataChart!.spec.series[0]!.errors).toEqual([1,10,100])
    for(const errors of [[10,10,100],[11,10,100]])expect(()=>buildDataChart({...spec,series:[{...spec.series[0]!,errors}]})).toThrow('误差下界大于 0')
  })
  it('keeps missing rows and refuses nonpositive X even when the corresponding Y is missing',()=>{
    const spec=chartScaleExample('scatter');spec.series=[{name:'Latency',values:[.1,null,10,100]}]
    const asset=buildDataChart(spec);expect(asset.figure.nodes.some(n=>n.chart?.key==='series-0-point-1')).toBe(false);expect(rootContainer(asset.figure).dataChart!.spec.x).toEqual(spec.x)
    expect(()=>buildDataChart({...spec,x:[1,0,100,1000]})).toThrow('横轴 log10');expect(()=>buildDataChart({...spec,series:[{name:'Latency',values:[.1,null,0,100]}]})).toThrow('纵轴 log10')
  })
  it('rejects log bars, log categories, irrelevant heatmap fields and truncated numeric X',()=>{
    for(const spec of [{...chartExample('bar'),yScale:'log10'},{...chartExample('bar'),xScale:'log10'},{...chartExample('bar'),xMin:0},{...chartExample('heatmap'),yScale:'linear'},{...chartExample('heatmap'),xMin:0},{...chartExample('boxplot'),xScale:'log10'}])expect(()=>buildDataChart(spec as ReturnType<typeof chartExample>)).toThrow()
    const spec=chartScaleExample('scatter');expect(()=>buildDataChart({...spec,xMin:2})).toThrow('横轴范围会截断');expect(()=>buildDataChart({...spec,xMin:10,xMax:1})).toThrow('横轴最小值')
  })
  it('computes boxplot statistics on raw samples before projecting quartiles onto log Y',()=>{
    const spec=chartExample('boxplot');spec.x=['a','b','c','d'];spec.series=[{name:'Raw',values:[1,10,100,1000]}];spec.yScale='log10'
    const before=boxplotReport({...spec,yScale:'linear'}),asset=buildDataChart(spec),node=(key:string)=>asset.figure.nodes.find(n=>n.chart?.key===key)!,axis=absolute(node('axis-y')),bottom=axis[1]!.y,top=axis[0]!.y,y=(v:number)=>bottom-Math.log10(v)/3*(bottom-top)
    expect(boxplotReport(spec)).toEqual(before);expect(before.groups[0]).toMatchObject({q1:7.75,median:55,q3:325,outliers:1});expect(node('series-0-box').y).toBeCloseTo(y(325));expect(node('series-0-box').y+node('series-0-box').height).toBeCloseTo(y(7.75));expect(absolute(node('series-0-median'))[0]!.y).toBeCloseTo(y(55))
    expect(node('series-0-sample-3').name).toContain('outlier');expect(node('label-axis-y').label).toContain('log10')
  })
  it('retains stable marks, added objects and scale settings through edit, capture, scaling and SVG round trips',()=>{
    const spec=chartScaleExample('scatter'),doc=componentDocument(scaleComponent(buildDataChart(spec),.75)),root=rootContainer(doc),point=doc.nodes.find(n=>n.chart?.key==='series-0-point-0')!
    doc.nodes.push({id:'note',parentId:'stage',kind:'text',label:'Owner note',x:root.x+12,y:root.y+root.height-20,width:100,height:14});const saved=clone(doc),changed=replaceDataChart(doc,'stage',{...spec,xScale:'linear',yScale:'linear',xMin:0,xMax:1000}).document
    expect(doc).toEqual(saved);expect(changed.nodes.find(n=>n.chart?.key==='series-0-point-0')!.id).toBe(point.id);expect(changed.nodes.find(n=>n.id==='note')).toEqual(doc.nodes.find(n=>n.id==='note'))
    const asset=captureComponent(changed,'stage','Saved chart'),svg=exportSvg(changed),roundtrip=importSvg(svg,{fileName:'log-chart.svg',sha256:createHash('sha256').update(svg).digest('hex'),parseXml:s=>new DOMParser().parseFromString(s,'image/svg+xml') as unknown as Document}).asset.figure
    expect(rootContainer(asset.figure).dataChart!.spec).toMatchObject({xScale:'linear',yScale:'linear',xMin:0,xMax:1000});expect(rootContainer(roundtrip).dataChart).toEqual(rootContainer(changed).dataChart)
  })
  it('provides actual compiled ranges and presentation-only tool overrides, including explicit resets',()=>{
    const spec=chartScaleExample('scatter'),asset=buildDataChart({...spec,xMin:.1,xMax:10000,yMin:.01,yMax:1000}),saved=clone(asset),result=configureChartAsset(asset,{xMin:null,xMax:null,yMin:null,yMax:null,xScale:'linear',yScale:'linear'})
    expect(asset).toEqual(saved);expect(result.use.axes).toEqual(chartAxesReport(rootContainer(result.asset.figure).dataChart!.spec));expect(result.use.axes!.x).toMatchObject({scale:'linear',min:0,max:1000});expect(rootContainer(result.asset.figure).dataChart!.spec.series).toEqual(spec.series)
    for(const field of ['xMin','xMax','yMin','yMax'] as const)expect(rootContainer(result.asset.figure).dataChart!.spec[field]).toBeUndefined()
    expect(()=>configureChartAsset(asset,{logValues:[1,2]})).toThrow();expect(()=>configureChartAsset(asset,{base:2})).toThrow();expect(()=>configureChartAsset(asset,{xMin:2})).toThrow('截断')
    const entry={kind:'asset' as const,asset};expect(describeCatalogue([entry])[0]!.chartOptions!.fields).toEqual(expect.arrayContaining(['xScale','yScale','xMin','xMax']))
  })
  it('requires clearing incompatible numeric ranges and log modes before a bar conversion',()=>{
    const asset=buildDataChart({...chartScaleExample('line'),xMin:1,xMax:1000})
    expect(()=>configureChartAsset(asset,{kind:'bar',yMin:0})).toThrow()
    const converted=configureChartAsset(asset,{kind:'bar',xScale:'linear',yScale:'linear',xMin:null,xMax:null,yMin:0,yMax:null}),spec=rootContainer(converted.asset.figure).dataChart!.spec
    expect(spec).toMatchObject({kind:'bar',xMode:'category',xScale:'linear',yScale:'linear',yMin:0});expect(spec.x).toEqual(['1','10','100','1000']);expect(spec.series).toEqual(rootContainer(asset.figure).dataChart!.spec.series)
  })
  it('selects log styles with source-backed mappings and exposes the real program-computed axes',()=>{
    const data=raw(),saved=clone(data),result=parseChartRecommendationResponse(response(ready()),createBlank(),data),spec=rootContainer(result.figure!).dataChart!.spec
    expect(data).toEqual(saved);expect(spec).toMatchObject({xScale:'log10',yScale:'log10',x:[1,10,100,1000],series:[{name:'Latency (ms)',values:[.1,1,null,100],errors:[.02,.2,null,20]}]})
    expect(result.chartRecommendation).toMatchObject({compiled:true,mapping:{unusedColumns:['Memory (GB)']},axes:{x:{scale:'log10',min:1,max:1000},y:{scale:'log10',min:.01,max:1000}}})
    const bounded=parseChartRecommendationResponse(response({...ready(),xMin:.1,xMax:10000,yMin:.05,yMax:200}),createBlank(),data);expect(bounded.chartRecommendation.axes).toMatchObject({x:{min:.1,max:10000},y:{min:.05,max:200}})
  })
  it('rejects model transforms, fabricated axes reports, nonpositive observations and error crossings atomically',()=>{
    const data=raw(),saved=clone(data),r=ready()
    for(const patch of [{xScale:'symlog'},{base:2},{offset:1},{logValues:[0,1]},{axes:{x:{scale:'log10',min:1,max:10}}},{xMin:2},{yMax:99}])expect(()=>parseChartRecommendationResponse(response({...r,...patch}),createBlank(),data)).toThrow()
    for(const [column,value] of [[1,'0'],[2,'0'],[3,'0.1']] as const){const changed=clone(data);changed.rows[0]![column]=value;expect(()=>parseChartRecommendationResponse(response(r),createBlank(),changed)).toThrow('大于 0')}
    expect(data).toEqual(saved)
    expect(chartDomains(chartScaleExample('scatter')).x!.position(10)).toBeCloseTo(1/3)
  })
})
