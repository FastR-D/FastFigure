import { describe, expect, it } from 'vitest'
import { compileReconstruction, compileReconstructionRepair, parseReconstructionResponse, projectReconstructionNode, reconstructionWorkers, referenceForReconstruction, repairContext, sceneForReconstruction, validateReconstructionImage } from './reconstruction'
import { reconstructionSceneSchema, reconstructionTaskSchema, type ReconstructionImageInfo, type ReconstructionScene, type ReconstructionTask } from './reconstructionContract'
import { clone, createBlank, parseDocument, type ReferenceImage } from './model'
import { captureComponent, componentDocument, instantiateComponent, instantiateComponentAt, scaleComponent } from './assets'
import { moveObjects, resizeObject } from './geometry'
import { scaleSubtree } from './scaling'
import { defaultLayoutOptions, layoutContainer } from './layout'
import { exportSvg } from './svg'
import { exportDrawio } from './export'
import { harnessPrompt, parseHarnessResponse } from './harness'
import { diffFigures } from './figureDiff'
import {catalogueAsset,type CatalogueEntry} from './catalogue'
import {buildDataChart} from './dataChart'
import {chartExample} from './dataChartTable'
import {bindingPoint,pathPoints} from './paths'
const reference:ReferenceImage={id:'ref-a',title:'Architecture reference',citation:'Authored test fixture, Fig. 1',fileName:'fixture.png',sha256:'a'.repeat(64),pixelWidth:800,pixelHeight:400,dataUrl:'data:image/png;base64,iVBORw0KGgo=',placement:{x:100,y:150,width:800,height:400}}
const task:Extract<ReconstructionTask,{kind:'reconstruct'}>={kind:'reconstruct',referenceId:'ref-a',region:{x:0,y:0,width:1,height:1},destination:'new',parentId:'stage'}
function original(){const doc=createBlank();doc.references=[clone(reference)];return doc}
function scene():ReconstructionScene{return reconstructionSceneSchema.parse({canvas:{width:800,height:400},regions:[{id:'left',title:'Encoder',kind:'diagram',x:20,y:40,w:340,h:320},{id:'right',title:'Decoder',kind:'diagram',x:440,y:40,w:340,h:320}],nodes:[
  {id:'frame',owner:'left',type:'rect',x:40,y:70,w:280,h:220,fill:'#e9f1fb',stroke:'#4c78a8',rx:8},
  {id:'label',owner:'left',type:'text',x:70,y:90,w:210,h:24,text:'Encoder',fontSize:20,fill:'#233247'},
  {id:'curve',owner:'left',type:'path',d:'M80 210Q130 120 180 210C200 240 230 240 260 210',fill:'none',stroke:'#4c78a8',strokeWidth:2},
  {id:'output',owner:'right',type:'ellipse',x:520,y:150,w:140,h:70,fill:'#f2d8c7',stroke:'#9b6240'},
  {id:'arrow',type:'line',x:335,y:185,x2:500,y2:185,arrow:true,stroke:'#334155'},
]})}
function built(){return compileReconstruction(original(),task,{message:'Rebuilt test fixture',warnings:['Check the curve'],scene:scene()}).figure!}
const repairTask:Extract<ReconstructionTask,{kind:'repair'}>={kind:'repair',containerId:'stage',regionId:'left'}
function updateLabel(doc= built(),text='Encoder corrected'){const context=repairContext(doc,repairTask),row=context.catalog.nodes.find(n=>n.id==='label')!;return{message:'Corrected label',patch:{operations:[{op:'update',id:row.id,version:row.version,node:{...row,text}}]}}}
describe('reference image to native scene adapter',()=>{
  it('resolves image leader aliases into frozen component anchors atomically and retains attachment geometry after movement and capture',()=>{
    const entry:CatalogueEntry={kind:'recipe',id:'tensor-stack'},part=scene();part.nodes=part.nodes.filter(n=>n.owner!=='right')
    const reuse={id:'native-output',componentKey:'recipe:tensor-stack',x:440,y:40,w:330,h:310,reason:'Native stack',differences:['The annotation attachment changes the last path segment.']},attachment={pathId:'arrow',end:'end',instanceId:reuse.id,nodeId:'plane-0',anchorIndex:1,reason:'Geometric annotation attachment; scientific meaning requires review.'},payload={message:'Attach leader',scene:part,reuse:[reuse],attachments:[attachment]},originalDoc=original(),saved=clone(originalDoc)
    const doc=compileReconstruction(originalDoc,task,payload,[entry]).figure!,leader=doc.nodes.find(n=>n.reconstruction?.objectId==='arrow')!,binding=leader.path!.end!;expect(binding.anchorIndex).toBe(1);expect(binding.note).toBe(attachment.reason);expect(pathPoints(doc,leader).at(-1)).toMatchObject(bindingPoint(doc,binding)!);expect(originalDoc).toEqual(saved)
    const first=pathPoints(doc,leader)[0]!,end=pathPoints(doc,leader).at(-1)!;moveObjects(doc,[reuse.id],3,4);expect(pathPoints(doc,leader).at(-1)!.x).toBeCloseTo(end.x+3);expect(pathPoints(doc,leader)[0]).toMatchObject(first)
    const copy=componentDocument(scaleComponent(captureComponent(doc,'stage','Bound image'),.8)),copied=copy.nodes.find(n=>n.reconstruction?.objectId==='arrow')!;expect(pathPoints(copy,copied).at(-1)).toMatchObject(bindingPoint(copy,copied.path!.end!)!)
    for(const patch of [{instanceId:'unknown'},{nodeId:'input'},{anchorIndex:120},{pathId:'label'}])expect(()=>compileReconstruction(originalDoc,task,{...payload,attachments:[{...attachment,...patch}]},[entry])).toThrow()
    expect(()=>compileReconstruction(originalDoc,task,{...payload,attachments:[attachment,attachment]},[entry])).toThrow('重复');expect(originalDoc).toEqual(saved)
  })
  it('accepts explicit empty native label overrides without deleting geometry or loosening blank traced-text validation',()=>{
    const entry:CatalogueEntry={kind:'recipe',id:'tensor-stack'},asset=catalogueAsset(entry),saved=clone(asset),match={id:'native',componentKey:'recipe:tensor-stack',x:30,y:25,w:300,h:340,reason:'Reuse known source geometry, with original text drawn separately.',differences:['Native title and note are explicitly cleared; geometry and layout are unchanged.'],labels:{'tensor-label':'','schematic-note':''}},payload={message:'Clear native labels',scene:{...scene(),nodes:[]},reuse:[match]}
    const doc=compileReconstruction(original(),task,payload,[entry]).figure!,native=doc.nodes.filter(n=>n.parentId==='native');expect(native.filter(n=>n.kind==='text').map(n=>n.label)).toEqual(['','']);expect(native.filter(n=>n.path)).toHaveLength(asset.figure.nodes.filter(n=>n.path).length);expect(asset).toEqual(saved)
    expect(()=>compileReconstruction(original(),task,{...payload,reuse:[{...match,labels:{unknown:''}}]},[entry])).toThrow('不存在节点');expect(()=>compileReconstruction(original(),task,{...payload,scene:{...scene(),nodes:[{id:'blank',type:'text',text:'',x:10,y:10,w:100,h:30,fontSize:16}]}},[entry])).toThrow()
  })
  it('fits a frozen native library structure without stretching its topology, preserves both origins through capture, and protects it in pixel repair',()=>{
    const asset=catalogueAsset({kind:'recipe',id:'mlp'}),entries:CatalogueEntry[]=[{kind:'asset',asset}],saved=clone(asset),part=scene();part.nodes=part.nodes.filter(n=>n.owner!=='left')
    const match={id:'native-encoder',componentKey:`asset:${asset.id}`,x:30,y:45,w:300,h:300,reason:'Tests native component placement, not scientific equivalence.',differences:['The source picture shows a curve; the library network is a semantic replacement, not a traced copy.']}
    const before=original(),result=compileReconstruction(before,task,{message:'Hybrid candidate',scene:part,reuse:[match]},entries),doc=result.figure!,group=doc.containers.find(c=>c.id===match.id)!,native=doc.nodes.filter(n=>n.parentId===group.id),scale=result.used[0]!.scale!
    expect(asset).toEqual(saved);expect(before).toEqual(original());expect(native).toHaveLength(asset.figure.nodes.length);expect(doc.edges).toHaveLength(asset.figure.edges.length)
    for(const [index,node]of native.entries()){const source=asset.figure.nodes[index]!;expect(node.label).toBe(source.label);expect(node.width).toBeCloseTo(source.width*scale);expect(node.x-group.x).toBeCloseTo(source.x*scale)}
    expect(group.reconstructionReuse).toMatchObject({componentKey:match.componentKey,referenceSha256:reference.sha256,reason:match.reason,region:{x:30/800,y:45/400,width:300/800,height:300/400}});expect(group.component!.assetId).toBe(asset.id)
    const context=repairContext(doc,repairTask);expect(context.catalog.nodes.some(n=>n.id.startsWith('protected-'))).toBe(false);expect(context.catalog.readOnlyContext.some(n=>n.id.startsWith('protected-'))).toBe(true)
    const capture=captureComponent(doc,'stage','Hybrid'),scaled=scaleComponent(capture,.8),restored=componentDocument(scaled);expect(restored.containers.find(c=>c.reconstructionReuse)!.reconstructionReuse).toEqual(group.reconstructionReuse);expect(capture.sources.some(s=>s.image?.sha256===reference.sha256)).toBe(true);expect(exportSvg(restored)).toContain('reconstructionReuse')
    const response=JSON.stringify({message:'Keep the graph',figure:doc,instances:[],instanceLinks:[]}),preserved=parseHarnessResponse(response,doc).figure!;expect(preserved.containers.find(c=>c.id===group.id)!.reconstructionReuse).toEqual(group.reconstructionReuse)
    const forged=clone(doc);forged.containers.find(c=>c.id===group.id)!.reconstructionReuse!.reason='Invented rationale';expect(()=>parseHarnessResponse(JSON.stringify({message:'Forged',figure:forged}),doc)).toThrow('素材辅助重建来源')
  })
  it('maps native matches from a high-resolution crop to original reference regions and reports transplanted instance IDs',()=>{
    const entries:CatalogueEntry[]=[{kind:'seed',id:'encoder'}],crop={...task,region:{x:.025,y:.1,width:.425,height:.8}},image:ReconstructionImageInfo={referenceSha256:reference.sha256,width:1020,height:960,sourceRect:{x:20,y:40,w:340,h:320},quality:'original',originalWidth:2400,originalHeight:1200},match={id:'native',componentKey:'seed:encoder',x:30,y:30,w:900,h:840,reason:'Matching encoder layout',differences:['Layer repetition and residual semantics require author review.']}
    const text=JSON.stringify({message:'Crop',scene:{canvas:{width:1020,height:960},regions:[],nodes:[]},reuse:[match]}),result=parseReconstructionResponse(text,original(),crop,image,entries),group=result.figure!.containers.find(c=>c.reconstructionReuse)!
    expect(group.reconstructionReuse!.region).toEqual({x:30/800,y:50/400,width:300/800,height:280/400});expect(group.reconstructionReuse!.differences).toEqual(match.differences)
    const inserted=parseReconstructionResponse(text,original(),{...crop,destination:'current'},image,entries);expect(inserted.figure!.containers.find(c=>c.id===inserted.used[0]!.instanceId)?.reconstructionReuse?.componentKey).toBe('seed:encoder')
  })
  it('rejects unselected, out-of-crop, overlapping, missing-disclosure and data-chart substitutions atomically',()=>{
    const before=original(),saved=clone(before),entries:CatalogueEntry[]=[{kind:'seed',id:'encoder'}],match={id:'native',componentKey:'seed:encoder',x:30,y:45,w:300,h:300,reason:'Encoder',differences:['Scientific meaning still requires review.']},payload={message:'Reject invalid match',scene:{...scene(),nodes:[]},reuse:[match]}
    expect(()=>compileReconstruction(before,task,payload)).toThrow('本轮组件清单');expect(()=>compileReconstruction(before,task,{...payload,reuse:[{...match,x:750}]},entries)).toThrow('超出原图选区');expect(()=>compileReconstruction(before,task,{...payload,reuse:[match,{...match,id:'overlap'}]},entries)).toThrow('重叠')
    expect(()=>compileReconstruction(before,task,{...payload,reuse:[{...match,differences:[]}]},entries)).toThrow();expect(()=>compileReconstruction(before,task,{...payload,reuse:[{...match,parameters:{unknown:2}}]},entries)).toThrow('不接受配方参数')
    const chart=buildDataChart(chartExample('line')),key=`asset:${chart.id}`;expect(()=>compileReconstruction(before,task,{...payload,reuse:[{...match,componentKey:key}]},[{kind:'asset',asset:chart}])).toThrow('原始数据选图');expect(before).toEqual(saved)
  })
  it('maps a high-resolution cropped scene back to source registration instead of treating crop pixels as full-image pixels',()=>{
    const crop={...task,region:{x:.025,y:.1,width:.425,height:.8}},image:ReconstructionImageInfo={referenceSha256:reference.sha256,width:1020,height:960,sourceRect:{x:20,y:40,w:340,h:320},quality:'original',originalWidth:2400,originalHeight:1200}
    const part=scene();part.nodes=part.nodes.filter(n=>n.owner==='left').map(n=>projectReconstructionNode(n,3,3,-60,-120));part.regions=part.regions.filter(r=>r.id==='left').map(r=>({...r,x:0,y:0,w:1020,h:960}));part.canvas={width:1020,height:960}
    const doc=parseReconstructionResponse(JSON.stringify({message:'Crop pixels',scene:part}),original(),crop,image).figure!,rows=sceneForReconstruction(doc,'stage').nodes
    expect(rows.find(n=>n.id==='frame')).toMatchObject({type:'rect',x:40,y:70,w:280,h:220,rx:8});expect(rows.find(n=>n.id==='label')).toMatchObject({text:'Encoder',fontSize:20});expect(doc.containers[0]!.reconstruction!.region).toEqual(crop.region)
    expect(()=>parseReconstructionResponse(JSON.stringify({message:'wrong',scene:scene()}),original(),crop,image)).toThrow('裁片尺寸')
  })
  it('projects rotated curves and glyph bases through nonuniform raster rounding without losing their affine geometry',()=>{
    const text={id:'vertical',version:0,type:'text' as const,x:100,y:100,w:80,h:30,text:'Axis',fontSize:20,rotation:35,letterSpacing:1.2},forward=projectReconstructionNode(text,2.5,3.3,10,20),back=projectReconstructionNode(forward,.4,1/3.3,-4,-20/3.3)
    expect(back.type).toBe('text');if(back.type==='text'){expect(back.fontSize).toBeCloseTo(20);expect(back.letterSpacing).toBeCloseTo(1.2);expect(back.matrix![0]).toBeCloseTo(Math.cos(35*Math.PI/180));expect(back.matrix![1]).toBeCloseTo(Math.sin(35*Math.PI/180))}
    const rounded=projectReconstructionNode({id:'rounded',version:0,type:'rect',x:20,y:30,w:100,h:60,rx:8,rotation:10},2,3)
    expect(rounded.type).toBe('path');if(rounded.type==='path')expect(rounded.d).toContain('C')
  })
  it('rejects stale crop scope and source metadata before converting a result',()=>{
    const image:ReconstructionImageInfo={referenceSha256:reference.sha256,width:800,height:400,sourceRect:{x:0,y:0,w:800,h:400},quality:'preview',originalWidth:800,originalHeight:400}
    expect(()=>validateReconstructionImage(original(),task,image)).not.toThrow();expect(()=>validateReconstructionImage(original(),task,{...image,referenceSha256:'b'.repeat(64)})).toThrow('来源');expect(()=>validateReconstructionImage(original(),task,{...image,sourceRect:{...image.sourceRect,x:1}})).toThrow('范围')
  })
  it('creates editable text, shapes, curves and arrows in source paint order with per-object image evidence',()=>{
    const before=original(),saved=clone(before),doc=built();expect(before).toEqual(saved);expect(doc.nodes.map(n=>n.kind)).toEqual(['rectangle','text','path','ellipse','path']);expect(doc.nodes.map(n=>n.reconstruction!.objectId)).toEqual(scene().nodes.map(n=>n.id))
    expect(doc.containers[0]!.reconstruction).toMatchObject({referenceSha256:reference.sha256,sourceWidth:800,sourceHeight:400,revision:0});expect(doc.references).toEqual([reference]);expect(doc.nodes.every(n=>n.evidence?.image?.sha256===reference.sha256)).toBe(true);expect(doc.nodes[2]!.path!.points.some(p=>p.c1)).toBe(true);expect(doc.nodes.at(-1)!.path!.arrow).toBe('filled')
    expect(()=>parseDocument(doc)).not.toThrow();expect(exportSvg(doc)).not.toContain('<image');expect(exportDrawio(doc)).toContain('data-vector-fallback');expect(exportSvg(doc)).toContain('Encoder')
  })
  it('limits a crop to its actual source coordinates and retains source region attribution',()=>{
    const crop={...task,region:{x:.025,y:.1,width:.425,height:.8}},part=scene();part.nodes=part.nodes.filter(n=>n.owner==='left');part.regions=part.regions.filter(r=>r.id==='left')
    const doc=compileReconstruction(original(),crop,{message:'Left panel only',scene:part}).figure!;expect(doc.nodes).toHaveLength(3);expect(doc.containers[0]!.reconstruction!.region).toEqual(crop.region);expect(doc.nodes[0]!.evidence!.image!.region.x).toBeCloseTo(.05)
    expect(()=>compileReconstruction(original(),crop,{message:'Not cropped',scene:scene()})).toThrow('超出')
  })
  it('supports current-container insertion and keeps existing objects, references and source registration',()=>{
    const doc=original();doc.nodes.push({id:'custom',kind:'rectangle',label:'Existing',parentId:'stage',x:70,y:150,width:70,height:40});const before=clone(doc)
    expect(()=>compileReconstruction(doc,{...task,destination:'current'},{message:'Too crowded',scene:scene()})).toThrow('空位');expect(doc).toEqual(before)
    const inserted=compileReconstruction(original(),{...task,destination:'current'},{message:'Insert',scene:scene()}).figure!,group=inserted.containers.find(c=>c.reconstruction)!
    expect(group.id).not.toBe('stage');expect(group.reconstruction!.origin.x).toBeGreaterThan(group.x);expect(sceneForReconstruction(inserted,group.id).nodes.find(n=>n.id==='frame')).toMatchObject({type:'rect',x:40,y:70,w:280,h:220});expect(inserted.references).toEqual([reference])
  })
  it('preserves rotated rounded geometry, vertical text and thin fills without flattening into pixels',()=>{
    const s=scene();s.nodes=[{id:'rotated',owner:'left',version:0,type:'rect',x:100,y:120,w:80,h:60,rx:8,rotation:25,fill:'#aabbcc'},{id:'vertical',owner:'right',version:0,type:'text',x:540,y:140,w:100,h:24,text:'Axis',fontSize:20,rotation:-90},{id:'thin',version:0,type:'rect',x:400,y:160,w:.3,h:60,fill:'#112233'}]
    const doc=compileReconstruction(original(),task,{message:'Rotations',scene:s}).figure!;expect(doc.nodes[0]!.kind).toBe('path');expect(doc.nodes[0]!.path!.points.some(p=>p.c1)).toBe(true);expect(doc.nodes[1]!.textLayout!.matrix[1]).toBeCloseTo(-1);expect(doc.nodes[2]!.kind).toBe('path');expect(()=>parseDocument(doc)).not.toThrow()
  })
  it('rejects invalid source frames, geometry, external objects, malformed curves and oversized labels atomically',()=>{
    const base=original(),before=clone(base),bad=scene();bad.canvas.width=900;expect(()=>compileReconstruction(base,task,{message:'x',scene:bad})).toThrow('尺寸');bad.canvas.width=800;bad.nodes[0]={...bad.nodes[0]!,type:'rect',x:-100,y:50,w:30,h:30};expect(()=>compileReconstruction(base,task,{message:'x',scene:bad})).toThrow('超出')
    for(const row of [{id:'bad',type:'image',url:'https://example.org/image'},{id:'bad',type:'rect',x:1,y:1,w:-1,h:20},{id:'bad',type:'text',x:10,y:10,w:100,h:40,text:'Line 1\nLine 2',fontSize:12}])expect(()=>compileReconstruction(base,task,{message:'x',scene:{...scene(),nodes:[row]}})).toThrow()
    const malformed=scene();malformed.nodes=[{id:'path',version:0,type:'path',d:'M0 0W1 2'}];expect(()=>compileReconstruction(base,task,{message:'x',scene:malformed})).toThrow();expect(base).toEqual(before)
    expect(compileReconstruction(base,task,{message:'Cannot read this image',scene:null}).figure).toBeNull()
  })
  it('validates region ancestry, owners, task geometry and response syntax',()=>{
    const s=scene();s.regions[0]!.parentId='right';s.regions[1]!.parentId='left';expect(()=>reconstructionSceneSchema.parse(s)).toThrow('成环');s.regions[0]!.parentId='missing';expect(()=>reconstructionSceneSchema.parse(s)).toThrow('不存在');expect(()=>reconstructionTaskSchema.parse({...task,region:{x:.8,y:0,width:.5,height:1}})).toThrow()
    expect(()=>parseReconstructionResponse('not JSON',original(),task)).toThrow('JSON');expect(parseReconstructionResponse('```json\n'+JSON.stringify({message:'Read',scene:scene()})+'\n```',original(),task).figure).toBeTruthy();expect(()=>parseReconstructionResponse('{"message":"x","figure":null}',original(),task)).toThrow('校验')
  })
})
describe('upstream semantic regions and atomic repair patches',()=>{
  it('repairs in attached crop pixel coordinates and preserves unrelated native objects and manual typography',()=>{
    const doc=built(),context=repairContext(doc,repairTask),worker=context.worker,image:ReconstructionImageInfo={referenceSha256:reference.sha256,width:1300,height:1150,sourceRect:{x:worker.x,y:worker.y,w:worker.w,h:worker.h},quality:'original',originalWidth:2400,originalHeight:1200}
    doc.nodes[1]!.textStyle!.italic=true;const row=repairContext(doc,repairTask).catalog.nodes.find(n=>n.id==='label')!,projected=projectReconstructionNode(row,image.width/worker.w,image.height/worker.h)
    const text=JSON.stringify({message:'High resolution correction',patch:{operations:[{op:'update',id:row.id,version:row.version,node:{...projected,text:'Encoder corrected'}}]}}),result=parseReconstructionResponse(text,doc,repairTask,image).figure!
    expect(result.nodes[1]).toMatchObject({id:doc.nodes[1]!.id,label:'Encoder corrected',textStyle:{italic:true},reconstruction:{version:1}});expect(result.nodes[3]).toEqual(doc.nodes[3]);expect(result.nodes[2]).toEqual(doc.nodes[2]);expect(result.nodes[1]!.textStyle!.size).toBeCloseTo(doc.nodes[1]!.textStyle!.size!)
    const prompt=harnessPrompt({sessionId:'00000000-0000-4000-8000-000000000001',figure:doc,task:repairTask,inputImage:{...image,dataUrl:'data:image/png;base64,iVBORw0KGgo='},content:'Repair',selectedIds:['stage'],catalogue:[]})
    expect(prompt).not.toContain('base64');expect(parseReconstructionResponse('{"message":"No change","patch":{"operations":[]}}',doc,repairTask,image).figure).toBeNull()
  })
  it('retains manual typography and source registration when replacement objects omit optional style fields',()=>{
    const doc=built(),node=doc.nodes.find(n=>n.reconstruction?.objectId==='label')!
    Object.assign(node.textStyle!,{weight:550,bold:false,italic:true,letterSpacing:1.2,color:'#995533',family:'MiSans'})
    const row=repairContext(doc,repairTask).catalog.nodes.find(n=>n.id==='label')!
    if(row.type!=='text')throw new Error('Expected text fixture')
    const replacement={type:'text',id:row.id,text:'Reviewed encoder',x:row.x,y:row.y,w:row.w,h:row.h,fontSize:row.fontSize}
    const repaired=compileReconstructionRepair(doc,repairTask,{message:'Only replace text',patch:{operations:[{op:'update',id:row.id,version:row.version,node:replacement}]}}).figure!
    const result=repaired.nodes.find(n=>n.id===node.id)!
    expect(result.textStyle).toMatchObject({weight:550,bold:false,italic:true,color:'#995533',family:'MiSans'});expect(result.textStyle!.letterSpacing).toBeCloseTo(1.2,6)
    expect(result.textLayout!.matrix).toEqual(node.textLayout!.matrix);expect(result.reconstruction!.owner).toBe('left')
    for(const [change,expected]of [[{bold:true},{weight:700,bold:true}],[{fontWeight:800},{weight:800,bold:true}]] as const){const next=compileReconstructionRepair(doc,repairTask,{message:'Explicit format',patch:{operations:[{op:'update',id:row.id,version:row.version,node:{...replacement,...change}}]}}).figure!;expect(next.nodes.find(n=>n.id===node.id)!.textStyle).toMatchObject(expected)}
  })
  it('provides editable local coordinates, separate read-only context and fixed source versions',()=>{
    const doc=built(),context=repairContext(doc,repairTask);expect(context.catalog.nodes.map(n=>n.id)).toEqual(['frame','label','curve']);expect(context.versions.frame).toBe(0);expect(context.worker.x).toBe(0);expect(context.catalog.readOnlyContext.some(n=>n.id==='arrow')).toBe(true)
    const widths=reconstructionWorkers(doc.containers[0]!.reconstruction!,context.scene);expect(widths.some(r=>r.id==='left')).toBe(true);expect(widths.some(r=>r.id==='right')).toBe(true)
  })
  it('updates a local label with a stable native ID, preserves unrelated nodes and external semantic wires',()=>{
    const doc=built(),before=clone(doc),frame=doc.nodes[0]!,output=doc.nodes[3]!;doc.edges=[{id:'semantic',source:frame.id,target:output.id,sourcePort:'right',targetPort:'left'}]
    const result=compileReconstructionRepair(doc,repairTask,updateLabel(doc)).figure!;expect(result.nodes.find(n=>n.reconstruction?.objectId==='label')).toMatchObject({id:before.nodes[1]!.id,label:'Encoder corrected',reconstruction:{version:1,owner:'left'}})
    expect(result.nodes[3]).toEqual(doc.nodes[3]);expect(result.edges).toEqual(doc.edges);expect(doc.nodes[1]!.label).toBe('Encoder');expect(result.containers[0]!.reconstruction!.revision).toBe(1);expect(diffFigures(doc,result).changes.filter(c=>c.kind==='node')).toHaveLength(1)
  })
  it('atomically rejects version conflicts, out-of-region edits and attempts to modify read-only objects',()=>{
    const doc=built(),before=clone(doc),patch=updateLabel(doc);patch.patch.operations[0]!.version=99;expect(()=>compileReconstructionRepair(doc,repairTask,patch)).toThrow('stale-version')
    const wrong=updateLabel(doc);wrong.patch.operations.push({op:'update',id:'output',version:0,node:wrong.patch.operations[0]!.node});expect(()=>compileReconstructionRepair(doc,repairTask,wrong)).toThrow('ownership');expect(doc).toEqual(before)
    const outside=updateLabel(doc);Object.assign(outside.patch.operations[0]!.node,{x:700});expect(()=>compileReconstructionRepair(doc,repairTask,outside)).toThrow('bounds');expect(doc).toEqual(before)
  })
  it('protects manual annotations and their paint order while permitting missing-object additions',()=>{
    const doc=built(),manual={id:'handmade',parentId:'stage',kind:'rectangle' as const,label:'Manual',x:doc.nodes[0]!.x+20,y:doc.nodes[0]!.y+150,width:50,height:20};doc.nodes.splice(2,0,manual)
    const context=repairContext(doc,repairTask);expect(context.catalog.readOnlyContext.some(n=>n.id==='protected-handmade')).toBe(true);expect(context.catalog.nodes.some(n=>n.id==='protected-handmade')).toBe(false)
    const response=updateLabel(doc),result=compileReconstructionRepair(doc,repairTask,response).figure!;expect(result.nodes.map(n=>n.id)).toEqual(doc.nodes.map(n=>n.id));expect(result.nodes.find(n=>n.id==='handmade')).toEqual(manual)
    const addition={message:'Found missing mark',patch:{operations:[{op:'add',node:{id:'missing',version:0,type:'ellipse',x:290,y:310,w:20,h:20,fill:'#112233'}}]}}
    const added=compileReconstructionRepair(doc,repairTask,addition).figure!;expect(added.nodes.length).toBe(doc.nodes.length+1);expect(added.nodes.at(-1)!.reconstruction?.owner).toBe('left')
  })
  it('keeps objects converted into scientific components protected instead of erasing them',()=>{
    const doc=built(),node=doc.nodes[0]!;node.kind='module';node.label='User encoder';node.height=130;node.structure={type:'encoder'};node.width=200;delete node.path;doc.nodes[0]=node
    const before=clone(doc),context=repairContext(doc,repairTask);expect(context.catalog.readOnlyContext.some(n=>n.id===`protected-${node.id}`)).toBe(true)
    const result=compileReconstructionRepair(doc,repairTask,updateLabel(doc)).figure!;expect(result.nodes.find(n=>n.id===node.id)).toEqual(before.nodes[0])
  })
  it('supports split/merge and rejects deletion of objects with semantic wire references',()=>{
    const doc=built(),context=repairContext(doc,repairTask),label=context.catalog.nodes.find(n=>n.id==='label')!
    const split=compileReconstructionRepair(doc,repairTask,{message:'Split line',patch:{operations:[{op:'split',id:'label',version:0,nodes:[{...label,id:'first',text:'Encoder'},{...label,id:'second',y:130,text:'branch'}]}]}}).figure!;expect(split.nodes.length).toBe(doc.nodes.length+1)
    const ctx=repairContext(split,repairTask),textNodes=ctx.catalog.nodes.filter(n=>n.type==='text');expect(textNodes).toHaveLength(2)
    const merged=compileReconstructionRepair(split,repairTask,{message:'Merge',patch:{operations:[{op:'merge',ids:textNodes.map(n=>n.id),nodes:[{...textNodes[0]!,text:'Encoder branch'}]}]}}).figure!;expect(merged.nodes.length).toBe(doc.nodes.length)
    doc.edges=[{id:'wire',source:doc.nodes[0]!.id,target:doc.nodes[3]!.id,sourcePort:'right',targetPort:'left'}];expect(()=>compileReconstructionRepair(doc,repairTask,{message:'Delete',patch:{operations:[{op:'delete',id:'frame',version:0}]}})).toThrow()
  })
  it('returns no proposal for empty, duplicate-only and ignored out-of-bounds additions',()=>{
    const doc=built(),context=repairContext(doc,repairTask);expect(compileReconstructionRepair(doc,repairTask,{message:'No change',patch:{operations:[]}}).figure).toBeNull()
    expect(compileReconstructionRepair(doc,repairTask,{message:'Duplicate',patch:{operations:[{op:'add',node:context.catalog.nodes[0]}]}}).figure).toBeNull()
    expect(compileReconstructionRepair(doc,repairTask,{message:'Outside',patch:{operations:[{op:'add',node:{id:'x',type:'rect',x:2000,y:2000,w:10,h:10}}]}}).figure).toBeNull()
    expect(()=>compileReconstructionRepair(doc,repairTask,{message:'Bad path',patch:{operations:[{op:'add',node:{id:'x',type:'path',d:'M 10 10 W foo'}}]}})).toThrow('路径')
  })
  it('plans parent residuals, exclusion zones, fine detail cores and cropped source coordinates',()=>{
    const doc=built(),record=doc.containers[0]!.reconstruction!,s=scene();s.regions=[{id:'outer',title:'Whole',kind:'panel',x:0,y:0,w:800,h:400},{id:'child',title:'Chart',kind:'chart',parentId:'outer',x:0,y:0,w:400,h:400}];s.nodes=s.nodes.map(n=>({...n,owner:n.id==='output'?'outer':'child'}));record.regions=s.regions
    const workers=reconstructionWorkers(record,s),residual=workers.find(w=>w.id==='outer_remaining')!;expect(residual.editableOwners).toContain('outer');expect(residual.excludeRects).toHaveLength(1)
    record.sourceWidth=2400;record.sourceHeight=1600;record.region={x:0,y:0,width:1,height:1};record.regions=[];s.canvas={width:2400,height:1600};s.regions=[];expect(reconstructionWorkers(record,s).some(w=>w.detailPass)).toBe(true)
    const crop={...task,region:{x:.025,y:.1,width:.425,height:.8}},part=scene();part.nodes=part.nodes.filter(n=>n.owner==='left');part.regions=[part.regions[0]!];const cropped=compileReconstruction(original(),crop,{message:'crop',scene:part}).figure!,ctx=repairContext(cropped,repairTask);expect(ctx.worker.x).toBeGreaterThanOrEqual(20);expect(ctx.worker.y).toBeGreaterThanOrEqual(40)
  })
})
describe('reconstruction provenance through editing and reuse',()=>{
  it('keeps exact source coordinates after movement, uniform scaling, frame resizing and repeated capture',()=>{
    const initial=built(),asset=scaleComponent(captureComponent(initial,'stage','Rebuilt'),.7),inserted=instantiateComponentAt(original(),asset,'stage',{x:100,y:160},'source',true),doc=inserted.document
    const sourceBefore=sceneForReconstruction(doc,'source').nodes.find(n=>n.id==='frame')!;moveObjects(doc,['source'],10,10);expect(sceneForReconstruction(doc,'source').nodes.find(n=>n.id==='frame')).toEqual(sourceBefore)
    const scaled=scaleSubtree(doc,'source',.5,'top-left').document;expect(sceneForReconstruction(scaled,'source').nodes.find(n=>n.id==='frame')).toMatchObject({x:40,y:70,w:280,h:220})
    const group=scaled.containers.find(c=>c.id==='source')!;resizeObject(scaled,'source',group.width+10,group.height+10);expect(sceneForReconstruction(scaled,'source').nodes.find(n=>n.id==='frame')).toMatchObject({x:40,y:70})
    const captured=captureComponent(scaled,'source','Again'),standalone=componentDocument(captured);standalone.references=[reference];expect(sceneForReconstruction(standalone,'stage').nodes.find(n=>n.id==='frame')).toMatchObject({x:40,y:70,w:280,h:220});expect(captured.sources[0]?.image?.sha256).toBe(reference.sha256)
  })
  it('updates source registration during recursive layout and keeps fingerprints on source-free component JSON',()=>{
    const initial=built(),asset=scaleComponent(captureComponent(initial,'stage','Reusable'),.7),doc=instantiateComponent(original(),asset,'stage').document,id=doc.containers.find(c=>c.reconstruction)!.id
    const before=sceneForReconstruction(doc,id),laid=layoutContainer(doc,'stage',{...defaultLayoutOptions,recursive:true}).document;expect(sceneForReconstruction(laid,id).nodes).toEqual(before.nodes)
    const standalone=componentDocument(asset);expect(()=>referenceForReconstruction(standalone,{kind:'repair',containerId:'stage',regionId:'left'})).toThrow('原参考图');standalone.references=[{...reference,pixelWidth:1600,pixelHeight:800}];expect(()=>repairContext(standalone,repairTask)).toThrow('压缩尺寸')
  })
  it('keeps mapping authoritative in ordinary Harness edits and emits scoped reconstruction prompts',()=>{
    const doc=built(),candidate=clone(doc),record=clone(doc.containers[0]!.reconstruction!);candidate.containers[0]!.x+=10;candidate.containers[0]!.reconstruction!.scale=2;candidate.nodes.forEach(n=>{n.x+=10;delete n.reconstruction});const response=parseHarnessResponse(JSON.stringify({message:'Move',figure:candidate}),doc).figure!
    expect(response.containers[0]!.reconstruction!.scale).toBe(record.scale);expect(response.containers[0]!.reconstruction!.origin.x).toBe(record.origin.x+10);expect(response.nodes[0]!.reconstruction).toEqual(doc.nodes[0]!.reconstruction)
    const prompt=harnessPrompt({sessionId:crypto.randomUUID(),content:'Reconstruct',figure:original(),selectedIds:[],catalogue:[],task});expect(prompt).toContain('800×400');expect(prompt).not.toContain(reference.dataUrl)
    const repair=harnessPrompt({sessionId:crypto.randomUUID(),content:'Fix',figure:doc,selectedIds:[],catalogue:[],task:repairTask});expect(repair).toContain('readOnlyContext');expect(repair).not.toContain('以下是当前工程快照')
  })
})
