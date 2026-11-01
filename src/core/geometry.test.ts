import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { createEditor } from '../composables/useEditor'
import { clone, createBlank,createExample, parseDocument, type FigureDocument } from './model'
import {createCallouts,calloutTargets} from './callouts'
import {reflowCallouts,existingCalloutTargets} from './calloutReflow'
import {segmentHitsRect} from './routing'
import {checkFigureText} from './figureTextCheck'
import { alignObjects, arrangeObjects, contentBounds, contains, moveObjects, resizeObject, resolveStyle } from './geometry'
import { exportDrawio } from './export'
import { edgePath, exportSvg } from './svg'
import {catalogueAsset} from './catalogue'
import {componentDocument,captureComponent,scaleComponent} from './assets'
import {bindingPoint,pathPoints,setPathPoints,setPathEndpointBinding,movePathPoint} from './paths'
import {applyMaterialEdits,orthogonalPoints} from './materialEditing'
import {canvasNodeTextStyle,canvasContainerTextStyle} from './typography'
import {inspectTextFrame} from './textFrameFit'

let scope: ReturnType<typeof effectScope>
beforeEach(() => { scope = effectScope(); vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined }) })
afterEach(() => { scope.stop(); vi.unstubAllGlobals() })
const editor = () => scope.run(createEditor)!
function nested(): FigureDocument {
  const doc = createExample()
  doc.containers.push(
    { id: 'g1', parentId: 'stage', role: 'group', title: 'Outer', x: 100, y: 170, width: 400, height: 280 },
    { id: 'g2', parentId: 'g1', role: 'boundary', title: 'Inner', x: 130, y: 230, width: 200, height: 200 },
  )
  doc.nodes = [
    { id: 'a', parentId: 'g2', kind: 'module', label: 'A', x: 160, y: 300, width: 100, height: 60 },
    { id: 'b', parentId: 'g1', kind: 'module', label: 'B', x: 350, y: 250, width: 100, height: 60 },
    { id: 'c', parentId: 'stage', kind: 'module', label: 'C', x: 650, y: 300, width: 100, height: 60 },
  ]
  doc.edges = [
    { id: 'ab', source: 'a', target: 'b', sourcePort: 'right', targetPort: 'left' },
    { id: 'bc', source: 'b', target: 'c', sourcePort: 'right', targetPort: 'left' },
  ]
  return parseDocument(doc)
}

function boundNote():FigureDocument {
  const doc=createBlank();Object.assign(doc.containers[0]!,{x:0,y:0,width:1000,height:620})
  doc.nodes=[
    {id:'source',parentId:'stage',kind:'rectangle',label:'Encoder',x:200,y:240,width:100,height:60},
    {id:'note',parentId:'stage',kind:'text',label:'Frozen weights\nKeep original annotation',x:460,y:250,width:160,height:42,textStyle:{family:'MiSans',size:13,bold:true,italic:true,align:'left'},visual:{fill:'none',stroke:'none',padding:2}},
    {id:'leader',parentId:'stage',kind:'path',label:'',x:0,y:0,width:1,height:1,path:{points:[{x:0,y:0},{x:1,y:1}],start:{nodeId:'source',x:1,y:.5,offsetX:2,note:'Preserve author anchor'},end:{nodeId:'note',x:0,y:.5,offsetY:1},arrow:'filled'},visual:{stroke:'#243247',strokeWidth:1.8,dash:[4,2]}},
    {id:'obstacle',parentId:'stage',kind:'rectangle',label:'New operation',x:350,y:230,width:50,height:80},
  ]
  const leader=doc.nodes[2]!;setPathPoints(leader,[bindingPoint(doc,leader.path!.start!)!,bindingPoint(doc,leader.path!.end!)!])
  return parseDocument(doc)
}

describe('material editing',()=>{
  it('unifies typefaces without flattening size or weight hierarchy, including scaled defaults and separately controlled annotations',()=>{
    const doc=createBlank();doc.nodes=[{id:'sample',kind:'rectangle',label:'Sample',parentId:'stage',x:100,y:200,width:120,height:80,textStyle:{family:'MiSans',size:24,bold:true,color:'#ff0000',align:'center'}},{id:'small',kind:'text',label:'Small',description:'Details',parentId:'stage',x:350,y:220,width:100,height:45,metricScale:.5},{id:'large',kind:'text',label:'Large',description:'Caption',parentId:'stage',x:550,y:220,width:160,height:70,textStyle:{family:'Inter',size:22,weight:650,italic:true,color:'#123456',align:'left'},descriptionStyle:{size:12,weight:400,color:'#456789'}}]
    const request={kind:'format' as const,sourceId:'sample',objectIds:['small','large'],channels:['typography' as const],includeDescendants:false,includeDescriptions:true},before=clone(doc),family=applyMaterialEdits(doc,[request]).figure
    expect(family.nodes[1]!.textStyle).toEqual({family:'MiSans',size:8});expect(family.nodes[1]!.descriptionStyle).toEqual({family:'MiSans',size:5.5});expect(family.nodes[2]!.textStyle).toEqual({...doc.nodes[2]!.textStyle,family:'MiSans'});expect(family.nodes[2]!.descriptionStyle).toEqual({...doc.nodes[2]!.descriptionStyle,family:'MiSans'})
    const typeface=applyMaterialEdits(doc,[{...request,textPolicy:'typeface'}]).figure.nodes[2]!
    expect(typeface.textStyle).toMatchObject({size:22,bold:true,italic:false,color:'#123456',align:'left'});expect(typeface.textStyle!.weight).toBeUndefined();expect(typeface.descriptionStyle!.weight).toBe(400)
    const e=editor();e.importProject(JSON.stringify(doc));e.select('small');expect(e.formatText({family:'MiSans'})).toBe(true);expect(canvasNodeTextStyle(e.figure.value.nodes[1]!)).toMatchObject({size:8,family:'MiSans'});e.textTarget.value='description';expect(e.formatText({bold:true})).toBe(true);expect(e.figure.value.nodes[1]!.descriptionStyle).toMatchObject({size:5.5,bold:true})
    const group={...doc.containers[0]!,metricScale:.5};expect(canvasContainerTextStyle(group).size).toBe(7.5);expect(doc).toEqual(before)
  })
  it('fits full labels and annotations by growing frames, preserves font settings and bindings, and keeps tight targets unchanged',()=>{
    const doc=boundNote(),target=doc.nodes[0]!;target.kind='ellipse';target.label='Keep target text';target.description='Keep annotation';target.textStyle={family:'MiSans',size:20,bold:true};target.descriptionStyle={size:11};target.width=120;target.height=90
    doc.nodes=doc.nodes.filter(n=>n.id!=='obstacle');const source=parseDocument(doc),before=clone(source),result=applyMaterialEdits(source,[{kind:'fit-text',objectIds:['source'],includeDescendants:false,anchor:'center',expandGroups:false}]),grown=result.figure.nodes[0]!,report=result.reports[0]!.textFit![0]!
    expect(report.status).toBe('fitted');expect(report.engine).toBe('estimate');expect(grown.width*grown.height).toBeGreaterThan(target.width*target.height);expect(grown.x+grown.width/2).toBeCloseTo(target.x+target.width/2);expect(grown.y+grown.height/2).toBeCloseTo(target.y+target.height/2);expect(grown.textStyle).toEqual(target.textStyle);expect(grown.descriptionStyle).toEqual(target.descriptionStyle);expect(grown.label).toBe(target.label);expect(grown.description).toBe(target.description);expect(inspectTextFrame(result.figure,grown).fits).toBe(true)
    const leader=result.figure.nodes.find(n=>n.id==='leader')!;expect(leader.path!.start).toEqual(source.nodes.find(n=>n.id==='leader')!.path!.start);expect(pathPoints(result.figure,leader)[0]).toEqual(bindingPoint(result.figure,leader.path!.start!));expect(source).toEqual(before)
    expect(applyMaterialEdits(result.figure,[{kind:'fit-text',objectIds:['source'],includeDescendants:false,anchor:'center',expandGroups:false}]).changed).toBe(false)
    const tight=createBlank();tight.nodes=[{...target,id:'target',x:400,y:300},{id:'left',kind:'rectangle',label:'',parentId:'stage',x:380,y:280,width:20,height:130},{id:'right',kind:'rectangle',label:'',parentId:'stage',x:520,y:280,width:20,height:130},{id:'top',kind:'rectangle',label:'',parentId:'stage',x:400,y:280,width:120,height:20},{id:'bottom',kind:'rectangle',label:'',parentId:'stage',x:400,y:390,width:120,height:20}]
    const failed=applyMaterialEdits(tight,[{kind:'fit-text',objectIds:['target'],includeDescendants:false,anchor:'center',expandGroups:false}]);expect(failed.changed).toBe(false);expect(failed.figure).toEqual(tight);expect(failed.reports[0]!.textFit![0]!.status).toBe('blocked')
  })
  it('expands transparent material bounds when requested and fits structured labels without changing their scientific structure',()=>{
    const doc=createBlank();doc.containers.push({id:'tight-group',parentId:'stage',role:'component',title:'Tight',x:298,y:248,width:124,height:84,visual:{fill:'none',stroke:'none'}});doc.nodes=[{id:'caption',parentId:'tight-group',kind:'rectangle',label:'Keep target text',x:300,y:250,width:120,height:80,textStyle:{size:20}}]
    const request={kind:'fit-text' as const,objectIds:['tight-group'],includeDescendants:true,anchor:'top-left' as const,expandGroups:false},blocked=applyMaterialEdits(doc,[request]);expect(blocked.changed).toBe(false)
    const expanded=applyMaterialEdits(doc,[{...request,expandGroups:true}]);expect(expanded.reports[0]!.textFit![0]!.expandedGroups).toEqual(['tight-group']);expect(expanded.figure.nodes[0]!.x).toBe(300);expect(expanded.figure.nodes[0]!.y).toBe(250);expect(inspectTextFrame(expanded.figure,expanded.figure.nodes[0]!).fits).toBe(true)
    const structured=createExample(),encoder=structured.nodes.find(n=>n.id==='encoder')!;encoder.label='Transformer encoder';encoder.textStyle={family:'Inter',size:24};const saved=clone(encoder.structure),result=applyMaterialEdits(structured,[{kind:'fit-text',objectIds:['encoder'],includeDescendants:false,anchor:'center',expandGroups:false}]),node=result.figure.nodes.find(n=>n.id==='encoder')!
    expect(result.reports[0]!.textFit![0]!.status).toBe('fitted');expect(node.structure).toEqual(saved);expect(node.textStyle!.size).toBe(24);expect(inspectTextFrame(result.figure,node).fits).toBe(true);expect(result.figure.edges).toEqual(structured.edges)
  })
  it('matches frame dimensions exactly without scaling typography, clipping children or detaching linked paths',()=>{
    const doc=createBlank();doc.nodes=[{id:'sample',parentId:'stage',kind:'rectangle',label:'Size sample',x:140,y:200,width:120,height:80},{id:'target',parentId:'stage',kind:'module',label:'Editable encoder',description:'Keep note',x:500,y:250,width:80,height:60,textStyle:{size:17,bold:true},descriptionStyle:{size:10},structure:{type:'encoder',repeats:2}},{id:'leader',parentId:'stage',kind:'path',label:'',x:0,y:0,width:1,height:1,path:{arrow:'open',points:[{x:0,y:0},{x:1,y:1}],start:{nodeId:'target',x:1,y:.5}},visual:{stroke:'#123456'}}]
    setPathPoints(doc.nodes[2]!,[bindingPoint(doc,doc.nodes[2]!.path!.start!)!,{x:800,y:380}]);const before=clone(doc),request={kind:'match-size' as const,sourceId:'sample',objectIds:['target','leader'],dimension:'both' as const,anchor:'center' as const},result=applyMaterialEdits(doc,[request]),node=result.figure.nodes[1]!
    expect(node).toMatchObject({x:480,y:240,width:120,height:80,textStyle:before.nodes[1]!.textStyle,descriptionStyle:before.nodes[1]!.descriptionStyle,structure:before.nodes[1]!.structure,label:'Editable encoder',description:'Keep note'});expect(result.figure.nodes[0]).toEqual(doc.nodes[0]);expect(result.figure.nodes[2]!.path!.start).toEqual(doc.nodes[2]!.path!.start);expect(pathPoints(result.figure,result.figure.nodes[2]!)[0]).toEqual({x:600,y:280});expect(result.reports[0]!.skipped.join()).toContain('leader');expect(doc).toEqual(before)
    expect(applyMaterialEdits(result.figure,[request]).changed).toBe(false)
    const height=applyMaterialEdits(doc,[{...request,dimension:'height',anchor:'top-left',objectIds:['target']}]).figure.nodes[1]!;expect(height).toMatchObject({x:500,y:250,width:80,height:80})
    const grouped=nested(),original=clone(grouped);expect(()=>applyMaterialEdits(grouped,[{...request,sourceId:'a',objectIds:['g1']}])).toThrow('无法容纳');expect(grouped).toEqual(original)
    expect(()=>applyMaterialEdits(doc,[{...request,sourceId:'leader'}])).toThrow('尺寸样本');expect(()=>applyMaterialEdits(doc,[{...request,objectIds:['missing']}])).toThrow('已不存在')
  })
  it('centers a whole material and its descendants, retains relative geometry and bindings, and detects a no-op',()=>{
    const doc=nested(),before=clone(doc),result=applyMaterialEdits(doc,[{kind:'center',objectIds:['g1','g2','a'],axis:'both'}]),outer=result.figure.containers.find(c=>c.id==='g1')!,area=contentBounds(doc.containers[0]!),dx=area.x+(area.width-400)/2-100,dy=area.y+(area.height-280)/2-170
    expect(outer.x).toBeCloseTo(100+dx);expect(outer.y).toBeCloseTo(170+dy)
    for(const id of ['a','b']){const old=doc.nodes.find(n=>n.id===id)!,moved=result.figure.nodes.find(n=>n.id===id)!;expect(moved).toEqual({...old,x:old.x+dx,y:old.y+dy})}
    expect(result.figure.edges).toEqual(doc.edges);expect(result.figure.nodes.find(n=>n.id==='c')).toEqual(doc.nodes[2]);expect(doc).toEqual(before)
    expect(result.reports[0]!.objectIds).toEqual(['g1']);expect(applyMaterialEdits(result.figure,[{kind:'center',objectIds:['g1'],axis:'both'}]).changed).toBe(false)
    expect(()=>applyMaterialEdits(doc,[{kind:'center',objectIds:['a','b'],axis:'both'}])).toThrow('同一父容器')
    expect(()=>applyMaterialEdits(boundNote(),[{kind:'center',objectIds:['leader'],axis:'both'}])).toThrow('绑定')
  })
  it('retains supplied waypoints and order while inserting exact horizontal or vertical elbows, including decimal and reversed segments',()=>{
    const given=[{x:400.125,y:200.25},{x:300.5,y:300.75},{x:450,y:300.75},{x:450,y:170}]
    expect(orthogonalPoints(given,'horizontal')).toEqual([given[0],{x:300.5,y:200.25},...given.slice(1)])
    expect(orthogonalPoints(given,'vertical')).toEqual([given[0],{x:400.125,y:300.75},...given.slice(1)])
    expect(()=>orthogonalPoints(given,'strict')).toThrow('相邻点');expect(()=>orthogonalPoints([given[0]!,given[0]!],'horizontal')).toThrow('重合')
    const doc=boundNote(),before=clone(doc),result=applyMaterialEdits(doc,[{kind:'arrow',nodeId:'leader',parentId:'stage',points:[bindingPoint(doc,doc.nodes[2]!.path!.start!)!,{x:320,y:360},bindingPoint(doc,doc.nodes[2]!.path!.end!)!],direction:'vertical',arrow:'open'}]),path=result.figure.nodes[2]!,points=pathPoints(result.figure,path)
    expect(path.path!.start).toEqual(doc.nodes[2]!.path!.start);expect(path.path!.end).toEqual(doc.nodes[2]!.path!.end);expect(path.visual).toEqual(doc.nodes[2]!.visual)
    expect(points.slice(1).every((p,i)=>p.x===points[i]!.x||p.y===points[i]!.y)).toBe(true);expect(result.figure.nodes.filter(n=>n.id!=='leader')).toEqual(doc.nodes.filter(n=>n.id!=='leader'));expect(doc).toEqual(before)
    expect(()=>applyMaterialEdits(doc,[{kind:'arrow',nodeId:'leader',parentId:'stage',points:given,direction:'vertical',arrow:'filled'}])).toThrow('绑定位置')
    expect(()=>applyMaterialEdits(doc,[{kind:'arrow',parentId:'stage',points:[{x:0,y:0},{x:200,y:200}],direction:'horizontal',arrow:'filled'}])).toThrow('内容区域')
  })
  it('copies selected format channels from a frozen sample, preserves structure, annotations and bindings, and leaves gradient channels independently editable',()=>{
    const doc=nested(),source=doc.nodes[0]!,target=doc.nodes[1]!,gradient={type:'linear' as const,vector:[1,0,0] as [number,number,number],stops:[{offset:0,color:'#112233',opacity:1},{offset:1,color:'#ddeeff',opacity:.7}],spread:'pad' as const,interpolation:'sRGB' as const}
    source.textStyle={family:'MiSans',size:19,weight:650,italic:true,color:'#234567',align:'right'};source.visual={fill:'#abcdef',stroke:'#334455',strokeWidth:2.5,dash:[4,2],fillGradient:gradient};target.description='Human note';target.descriptionStyle={family:'Inter',size:11};target.structure={type:'encoder',repeats:3};target.visual={fill:'#fefefe',fillGradient:gradient,strokeGradient:gradient,radius:9}
    const before=clone(doc),result=applyMaterialEdits(doc,[{kind:'format',sourceId:'a',objectIds:['g1'],channels:['typography','stroke'],includeDescendants:true,textPolicy:'match'}]),node=result.figure.nodes[1]!
    expect(node.textStyle).toMatchObject({family:'MiSans',size:19,weight:650,italic:true,color:'#234567',align:'right'});expect(node.visual).toMatchObject({fill:'#fefefe',fillGradient:gradient,stroke:'#334455',strokeGradient:null,strokeWidth:2.5,dash:[4,2],radius:9})
    expect({...node,textStyle:target.textStyle,visual:target.visual}).toEqual(target);expect(result.figure.nodes[0]).toEqual(source);expect(result.figure.nodes[2]).toEqual(doc.nodes[2]);expect(result.figure.edges).toEqual(doc.edges);expect(doc).toEqual(before)
    const filled=applyMaterialEdits(result.figure,[{kind:'format',sourceId:'a',objectIds:['b'],channels:['fill'],includeDescendants:false}]).figure.nodes[1]!
    expect(filled.visual?.fillGradient).toEqual(gradient);expect(filled.textStyle).toEqual(node.textStyle)
    const solid=clone(result.figure);delete solid.nodes[0]!.visual!.fillGradient
    expect(applyMaterialEdits(solid,[{kind:'format',sourceId:'a',objectIds:['b'],channels:['fill'],includeDescendants:false}]).figure.nodes[1]!.visual!.fillGradient).toBeNull()
  })
  it('protects positioned text and transformed strokes by channel, and rejects a later invalid edit atomically',()=>{
    const doc=boundNote(),source=doc.nodes[0]!,target=doc.nodes[3]!;source.visual={fill:'#000000',stroke:'#765432',strokeWidth:2};target.visual={stroke:'#abcdef',strokeMatrix:[2,0,0,1]};doc.nodes[1]!.textLayout={x:0,y:.5,matrix:[1,0,0,1]}
    const before=clone(doc),result=applyMaterialEdits(doc,[{kind:'format',sourceId:'source',objectIds:['note','obstacle'],channels:['typography','stroke'],includeDescendants:false,textPolicy:'match'}])
    expect(result.figure.nodes[1]).toEqual(doc.nodes[1]);expect(result.figure.nodes[3]!.visual).toEqual(target.visual);expect(result.figure.nodes[3]!.textStyle!.color).toBe('#ffffff');expect(result.reports[0]!.skipped.some(s=>s.includes('定位文字'))).toBe(true);expect(result.reports[0]!.skipped.some(s=>s.includes('变换描边'))).toBe(true)
    const reflowed=applyMaterialEdits(doc,[{kind:'format',sourceId:'source',objectIds:['note'],channels:['typography'],includeDescendants:false,positionedText:'reflow',textPolicy:'match'}]).figure.nodes[1]!,old=doc.nodes[1]!
    expect(reflowed.textStyle!.size).toBe(16);expect(reflowed.textLayout!.matrix).toEqual(old.textLayout!.matrix);expect(reflowed.label).toBe(old.label);expect(reflowed.x+reflowed.width*reflowed.textLayout!.x).toBeCloseTo(old.x+old.width*old.textLayout!.x);expect(reflowed.y+reflowed.height*reflowed.textLayout!.y).toBeCloseTo(old.y+old.height*old.textLayout!.y)

    expect(()=>applyMaterialEdits(doc,[{kind:'center',objectIds:['obstacle'],axis:'horizontal'},{kind:'arrow',parentId:'stage',points:[{x:0,y:0},{x:100,y:100}],direction:'horizontal',arrow:'filled'}])).toThrow();expect(doc).toEqual(before)
  })
})

describe('hierarchy, selection and constrained geometry', () => {
  it('reflows existing note geometry around obstacles while preserving both endpoint orientations, offsets, IDs and manual formatting',()=>{
    for(const reverse of [false,true]){
      const doc=boundNote(),leader=doc.nodes.find(n=>n.id==='leader')!
      if(reverse){const points=pathPoints(doc,leader);[leader.path!.start,leader.path!.end]=[leader.path!.end,leader.path!.start];setPathPoints(leader,points.reverse())}
      const before=clone(doc),request={leaderId:'leader',labelId:'note',mode:'route',reason:'Avoid the new operation'},routed=reflowCallouts(doc,[request]),path=routed.figure.nodes.find(n=>n.id==='leader')!,points=pathPoints(routed.figure,path)
      expect(routed.changed).toBe(true);expect(routed.reports[0]).toMatchObject({labelMoved:false,leaderChanged:true,textPreserved:true,targetPreserved:true,bindingsChanged:false})
      expect(routed.figure.nodes.filter(n=>n.id!=='leader')).toEqual(before.nodes.filter(n=>n.id!=='leader'));expect(points.slice(1).every((p,i)=>!segmentHitsRect(points[i]!,p,doc.nodes.find(n=>n.id==='obstacle')!))).toBe(true)
      expect(points[0]).toEqual(bindingPoint(routed.figure,path.path!.start!));expect(points.at(-1)).toEqual(bindingPoint(routed.figure,path.path!.end!));expect(path.path!.start).toEqual(leader.path!.start);expect(path.path!.end).toEqual(leader.path!.end);expect(path.path!.arrow).toBe('filled');expect(path.visual).toEqual(leader.visual)
      const layout=reflowCallouts(routed.figure,[{...request,mode:'layout',side:'top'}]),note=layout.figure.nodes.find(n=>n.id==='note')!,old=doc.nodes.find(n=>n.id==='note')!
      expect(layout.reports[0]!.labelMoved).toBe(true);expect({...note,x:old.x,y:old.y}).toEqual(old);expect(layout.figure.nodes.map(n=>n.id)).toEqual(doc.nodes.map(n=>n.id));expect(layout.figure.containers).toEqual(doc.containers);expect(reflowCallouts(layout.figure,[{...request,mode:'layout',side:'top'}]).changed).toBe(false);expect(doc).toEqual(before)
      const compact=reflowCallouts(layout.figure,[{...request,anchorPolicy:'reselect'}]),report=compact.reports[0]!,shortPath=compact.figure.nodes.find(n=>n.id==='leader')!
      expect(report).toMatchObject({anchorPolicy:'reselect',labelMoved:false,bindingsChanged:true,targetPreserved:true});expect(report.afterLength).toBeLessThan(report.beforeLength);expect(compact.figure.nodes.filter(n=>n.id!=='leader')).toEqual(layout.figure.nodes.filter(n=>n.id!=='leader'))
      for(const end of ['start','end'] as const){const original=leader.path![end]!,updated=shortPath.path![end]!;expect({id:updated.nodeId,note:updated.note,dx:updated.offsetX,dy:updated.offsetY}).toEqual({id:original.nodeId,note:original.note,dx:original.offsetX,dy:original.offsetY})}
      const repeated=reflowCallouts(compact.figure,[{...request,anchorPolicy:'reselect'}]);expect(repeated.changed).toBe(false);expect(repeated.figure).toEqual(compact.figure)

    }
  })
  it('rejects managed or hidden notes, external references and failing later reflows without partially editing the figure',()=>{
    const request={leaderId:'leader',labelId:'note',mode:'layout',side:'top',reason:'Place annotation above'},doc=boundNote()
    const managed=clone(doc);managed.containers[0]!.parametric={version:1,recipe:{id:'pipeline',version:1,parameters:{stages:2,direction:'row'}},revision:0,objects:{stage:'stage',label:'note'}};expect(()=>reflowCallouts(managed,[request])).toThrow('管理')
    const hidden=clone(doc);hidden.containers.push({id:'hidden',parentId:'stage',role:'component',title:'Hidden',x:100,y:150,width:600,height:400,opacity:0,visual:{fill:'none',stroke:'none'}});hidden.nodes.find(n=>n.id==='leader')!.parentId='hidden';expect(existingCalloutTargets(hidden)[0]!.error).toContain('隐藏');expect(()=>reflowCallouts(hidden,[request])).toThrow('隐藏')
    const external=clone(doc);external.edges.push({id:'extra',source:'source',target:'note',sourcePort:'top',targetPort:'bottom'});expect(()=>reflowCallouts(external,[request])).toThrow('外部引用')
    const batch=clone(doc);batch.nodes.push({...clone(batch.nodes[0]!),id:'source-2',x:720,y:420},{...clone(batch.nodes[1]!),id:'note-2',x:820,y:420,width:130},{...clone(batch.nodes[2]!),id:'leader-2',path:{...clone(batch.nodes[2]!.path!),start:{nodeId:'source-2',x:1,y:.5},end:{nodeId:'note-2',x:0,y:.5}}},{id:'blocked-area',parentId:'stage',kind:'rectangle',label:'Occupied',x:650,y:80,width:330,height:500});const before=clone(batch)
    expect(()=>reflowCallouts(batch,[request,{leaderId:'leader-2',labelId:'note-2',mode:'route',reason:'Cannot fit'}])).toThrow('没有可用');expect(batch).toEqual(before)
    expect(()=>reflowCallouts(doc,[request,request])).toThrow();expect(()=>reflowCallouts(doc,[{...request,mode:'route',side:'left'}])).toThrow()
  })
  it('places complete unboxed callouts without changing the diagram and keeps both leader ends through motion and captured scaling',()=>{
    const doc=createExample(),before=clone(doc),text='Frozen encoder\nParameters are not updated',created=createCallouts(doc,[{targetId:'encoder',text,fontFamily:'Comic Sans MS',fontSize:12,maxWidth:180,reason:'Explain frozen training behavior'}]),after=created.figure,report=created.reports[0]!,leader=after.nodes.find(n=>n.id===report.leaderId)!,label=after.nodes.find(n=>n.id===report.labelId)!
    expect(doc).toEqual(before);expect(after.nodes.slice(0,before.nodes.length)).toEqual(before.nodes);expect(after.containers).toEqual(before.containers);expect(after.edges).toEqual(before.edges);expect(label).toMatchObject({kind:'text',label:text,textStyle:{family:'Comic Sans MS',size:12},visual:{fill:'none',stroke:'none'}});expect(checkFigureText(after).issues.filter(issue=>issue.nodeId===label.id)).toEqual([])
    expect(calloutTargets(doc).some(t=>t.targetId==='encoder')).toBe(true);expect(report.lines).toBeGreaterThan(1)
    const longText='说明'.repeat(80),long=createCallouts(doc,[{targetId:'encoder',text:longText,fontFamily:'MiSans',fontSize:8,maxWidth:160,reason:'Keep the full supplied annotation'}]);expect(long.figure.nodes.find(n=>n.id===long.reports[0]!.labelId)!.label).toBe(longText);expect(checkFigureText(long.figure).issues.filter(i=>i.nodeId===long.reports[0]!.labelId)).toEqual([])
    const start=pathPoints(after,leader)[0]!,end=pathPoints(after,leader).at(-1)!
    moveObjects(after,['encoder'],8,0);expect(pathPoints(after,leader)[0]!.x).toBeCloseTo(start.x+8);expect(pathPoints(after,leader).at(-1)).toEqual(end)
    moveObjects(after,[label.id],10,0);expect(pathPoints(after,leader).at(-1)!.x).toBeCloseTo(end.x+10)
    const captured=componentDocument(scaleComponent(captureComponent(created.figure,'stage','Annotated diagram'),.6)),copied=captured.nodes.find(n=>n.name===leader.name)!
    expect(pathPoints(captured,copied)[0]).toEqual(bindingPoint(captured,copied.path!.start!));expect(pathPoints(captured,copied).at(-1)).toEqual(bindingPoint(captured,copied.path!.end!))
    const editor=createEditor();editor.importProject(JSON.stringify(before));expect(editor.update(figure=>Object.assign(figure,created.figure))).toBe(true);editor.undo();expect(editor.figure.value).toEqual(before);editor.redo();expect(editor.figure.value.nodes).toEqual(created.figure.nodes)
  })
  it('uses real closed-path anchors and rejects missing targets, full layouts or mixed target declarations atomically',()=>{
    const doc=createBlank();Object.assign(doc.containers[0]!,{x:0,y:0,width:1000,height:620});doc.nodes=[{id:'face',parentId:'stage',kind:'path',label:'',x:200,y:230,width:120,height:80,path:{points:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1,close:true}],arrow:'none'},visual:{fill:'#eff5fc',stroke:'#243247'}}]
    const before=clone(doc),request={targetId:'face',text:'Feature plane',side:'right',reason:'Identify this slice'},result=createCallouts(doc,[request]),leader=result.figure.nodes.find(n=>n.id===result.reports[0]!.leaderId)!
    expect(leader.path!.start!.anchorIndex).toBeDefined();expect(pathPoints(result.figure,leader)[0]).toEqual(bindingPoint(result.figure,leader.path!.start!)!)
    const moved=reflowCallouts(result.figure,[{leaderId:leader.id,labelId:result.reports[0]!.labelId,mode:'layout',side:'left',anchorPolicy:'reselect',reason:'Move to the other side of the plane'}]),rebound=moved.figure.nodes.find(n=>n.id===leader.id)!
    expect(rebound.path!.start!.anchorIndex).not.toBe(leader.path!.start!.anchorIndex);expect([0,3]).toContain(rebound.path!.start!.anchorIndex);expect(rebound.path!.start!.x).toBeUndefined();expect(rebound.path!.start!.nodeId).toBe('face');expect(pathPoints(moved.figure,rebound)[0]).toEqual(bindingPoint(moved.figure,rebound.path!.start!)!);expect(moved.figure.nodes.find(n=>n.id==='face')).toEqual(doc.nodes[0])
    expect(()=>createCallouts(doc,[request,{...request,targetId:'missing'}])).toThrow('有效');expect(doc).toEqual(before)
    const crowded=clone(doc);crowded.nodes.push({id:'full',parentId:'stage',kind:'rectangle',label:'Occupied',x:12,y:48,width:976,height:560});expect(()=>createCallouts(crowded,[request])).toThrow('没有可用')
    expect(()=>createCallouts(doc,[{...request,instanceId:'instance',nodeId:'face'}])).toThrow();expect(()=>createCallouts(doc,[{...request,text:'x'.repeat(161)}])).toThrow()
  })
  it('keeps leaders on closed geometry anchors through movement, point edits, index changes, undo and captured scaling',()=>{
    const doc=componentDocument(catalogueAsset({kind:'recipe',id:'tensor-stack'})),face=doc.nodes.find(n=>n.name==='Illustrative slice 1')!
    doc.nodes.push({id:'leader',kind:'path',label:'Callout',parentId:'stage',x:doc.containers[0]!.x+220,y:doc.containers[0]!.y+12,width:30,height:40,path:{points:[{x:0,y:0},{x:1,y:1,c1:{x:.2,y:0},c2:{x:.8,y:1}}],arrow:'none'},visual:{fill:'none'}})
    const start=pathPoints(doc,doc.nodes.at(-1)!)[0]!
    setPathEndpointBinding(doc,'leader','end',face.id,1);const leader=doc.nodes.find(n=>n.id==='leader')!,endpoint=pathPoints(doc,leader).at(-1)!
    expect(endpoint).toMatchObject(bindingPoint(doc,leader.path!.end!)!);moveObjects(doc,[face.id],6,3);expect(pathPoints(doc,leader).at(-1)!.x).toBeCloseTo(endpoint.x+6);expect(pathPoints(doc,leader)[0]).toMatchObject(start)
    const old=pathPoints(doc,face)[1]!;movePathPoint(doc,face.id,1,{x:old.x+4,y:old.y+2});expect(pathPoints(doc,leader).at(-1)).toMatchObject(bindingPoint(doc,leader.path!.end!)!)
    const e=editor();e.importProject(JSON.stringify(parseDocument(doc)));e.select(face.id);e.selectedPathPoint.value=0;const before=clone(e.figure.value),position=pathPoints(before,before.nodes.find(n=>n.id==='leader')!).at(-1)!
    e.addPathBend();expect(e.figure.value.nodes.find(n=>n.id==='leader')!.path!.end!.anchorIndex).toBe(2);expect(pathPoints(e.figure.value,e.figure.value.nodes.find(n=>n.id==='leader')!).at(-1)).toMatchObject(position);e.undo();expect(e.figure.value).toEqual(before)
    e.select(face.id);e.selectedPathPoint.value=1;e.removePathBend();expect(e.figure.value.nodes.find(n=>n.id==='leader')!.path!.end).toBeUndefined();expect(pathPoints(e.figure.value,e.figure.value.nodes.find(n=>n.id==='leader')!).at(-1)).toMatchObject(position);e.undo();expect(e.figure.value).toEqual(before)
    const restored=componentDocument(scaleComponent(captureComponent(before,'stage','Attached'),.8)),line=restored.nodes.find(n=>n.label==='Callout')!;expect(pathPoints(restored,line).at(-1)).toMatchObject(bindingPoint(restored,line.path!.end!)!);expect(exportSvg(restored)).toContain('anchorIndex')
    for(const binding of [{nodeId:'input-link',anchorIndex:0},{nodeId:'input',x:0,y:.5},{nodeId:face.id,anchorIndex:127},{nodeId:face.id,anchorIndex:0,x:0,y:0}]){const invalid=clone(before);invalid.nodes.find(n=>n.id==='leader')!.path!.end=binding;expect(()=>parseDocument(invalid)).toThrow()}
    const generated=clone(before);generated.nodes.find(n=>n.id==='leader')!.chart={key:'series-0',role:'series',channels:['stroke']};expect(()=>setPathEndpointBinding(generated,'leader','end',face.id,1)).toThrow('数据图表路径');expect(()=>parseDocument(generated)).toThrow('数据图表路径')
  })
  it('requires the new schema explicitly and rejects old versions, missing parents and cycles', () => {
    const doc = createExample()
    expect(() => parseDocument({ ...doc, version: '0.1' })).toThrow()
    const missing = clone(doc); missing.nodes[0]!.parentId = 'missing'
    expect(() => parseDocument(missing)).toThrow()
    const cycle = nested(); cycle.containers[1]!.parentId = 'g2'
    expect(() => parseDocument(cycle)).toThrow()
    const twoRoots = nested(); twoRoots.containers[1]!.parentId = null
    expect(() => parseDocument(twoRoots)).toThrow()
  })
  it('groups and ungroups siblings without changing positions, IDs or edge bindings', () => {
    const e = editor(), before = clone(e.figure.value)
    e.select('input'); e.select('encoder', true); e.groupSelection()
    const group = e.selectedContainer.value!
    expect(group.parentId).toBe('stage')
    expect(e.figure.value.nodes[0]!.parentId).toBe(group.id)
    expect(e.figure.value.nodes[1]!.parentId).toBe(group.id)
    expect(e.figure.value.edges).toEqual(before.edges)
    before.nodes.forEach((n, i) => expect(e.figure.value.nodes[i]!.x).toBe(n.x))
    e.ungroupSelection(); expect(e.figure.value).toEqual(before)
    e.undo(); expect(e.figure.value.containers).toHaveLength(2)
  })
  it('moves selected hierarchies once, including descendants, and updates derived edge paths', () => {
    const doc = nested(), original = clone(doc), path = edgePath(doc, 'ab')
    moveObjects(doc, ['g1', 'g2', 'a'], 30, 20)
    expect(doc.containers[1]!.x).toBe(original.containers[1]!.x + 30)
    expect(doc.containers[2]!.x).toBe(original.containers[2]!.x + 30)
    expect(doc.nodes[0]!.x).toBe(original.nodes[0]!.x + 30)
    expect(doc.nodes[2]).toEqual(original.nodes[2])
    expect(doc.edges).toEqual(original.edges)
    expect(edgePath(doc, 'ab')).not.toBe(path)
    expect(() => parseDocument(doc)).not.toThrow()
  })
  it('clamps a multi-selection as one translation, preserving the relative arrangement', () => {
    const doc = createExample(), delta = doc.nodes[1]!.x - doc.nodes[0]!.x
    moveObjects(doc, ['input', 'encoder'], -10000, -10000)
    expect(doc.nodes[1]!.x - doc.nodes[0]!.x).toBe(delta)
    expect(doc.nodes[0]!.x).toBe(80)
    expect(() => parseDocument(doc)).not.toThrow()
  })
  it('constrains sizes by node limits, parent content and container descendants', () => {
    const doc = nested()
    resizeObject(doc, 'a', 9999, 9999)
    expect(doc.nodes[0]!.width).toBe(158)
    expect(doc.nodes[0]!.height).toBe(118)
    resizeObject(doc, 'g1', 1, 1)
    expect(doc.containers[1]!.width).toBeGreaterThanOrEqual(362)
    expect(contains(contentBounds(doc.containers[1]!), doc.containers[2]!)).toBe(true)
    expect(() => parseDocument(doc)).not.toThrow()
  })
  it('aligns and arranges siblings while retaining topology; refuses impossible layouts atomically', () => {
    const e = editor(), edges = clone(e.figure.value.edges)
    e.select('input'); e.select('encoder', true); e.alignSelection('top')
    expect(e.figure.value.nodes[0]!.y).toBe(e.figure.value.nodes[1]!.y)
    e.arrangeSelection('column')
    expect(e.figure.value.nodes[0]!.x).toBe(e.figure.value.nodes[1]!.x + 2)
    expect(e.figure.value.edges).toEqual(edges)
    e.selectAll(); const before = clone(e.figure.value)
    e.arrangeSelection('column')
    expect(e.figure.value).toEqual(before)
    expect(e.notice.value).toContain('空间不足')
  })
  it('distributes by physical edge gaps and refuses selection across different parents', () => {
    const doc = createExample()
    alignObjects(doc, ['input', 'encoder', 'retriever'], 'distribute-x')
    const [a, b, c] = doc.nodes
    expect(b!.x - a!.x - a!.width).toBeCloseTo(c!.x - b!.x - b!.width)
    expect(() => arrangeObjects(nested(), ['a', 'b'], 'row')).toThrow('同一父容器')
  })
  it('marquee normalizes ancestor selections and deleting a container removes its entire subtree', () => {
    const e = editor(); e.importProject(JSON.stringify(nested()))
    e.selectRegion({ x: 98, y: 168, width: 404, height: 284 })
    expect(e.selectedIds.value).toEqual(['g1'])
    e.removeSelected()
    expect(e.figure.value.nodes.map(n => n.id)).toEqual(['c'])
    expect(e.figure.value.edges).toEqual([])
    e.undo(); expect(e.figure.value).toEqual(nested())
  })
  it('exports nested cells in parent-relative coordinates and edges under the least common container', () => {
    const xml = exportDrawio(nested())
    expect(xml).toContain('parent="g2"><mxGeometry x="30" y="70"')
    expect(xml).toContain('id="ab" edge="1" parent="g1" source="a" target="b"')
    expect(xml).toContain('id="bc" edge="1" parent="stage" source="b" target="c"')
  })
  it('inherits container appearance independently and applies local overrides in SVG and draw.io', () => {
    const doc = nested(), before = clone(doc.nodes)
    doc.containers[1]!.appearance = { preset: 'sketch', accent: 'rose' }
    doc.containers[2]!.appearance = { preset: 'header', accent: 'inherit' }
    expect(resolveStyle(doc, 'g2')).toMatchObject({ preset: 'header', accent: 'rose' })
    expect(resolveStyle(doc, 'a')).toMatchObject({ preset: 'header', accent: 'rose' })
    expect(resolveStyle(doc, 'c')).toMatchObject({ preset: 'soft', accent: 'blue' })
    expect(exportSvg(doc)).toContain('#714d68')
    expect(exportDrawio(doc)).toContain('strokeColor=#714d68')
    expect(doc.nodes).toEqual(before)
    expect(() => parseDocument(doc)).not.toThrow()
  })
})
