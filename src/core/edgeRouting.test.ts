import {createHash} from 'node:crypto'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {effectScope} from 'vue'
import {DOMParser} from '@xmldom/xmldom'
import {anchor,clone,createBlank,createExample,parseDocument,rootContainer,type Port} from './model'
import {routeEdge,routeFigure,routePath,segmentHitsRect} from './routing'
import {buildRecipe} from '../data/recipes'
import {captureComponent,componentDocument,instantiateComponentAt,scaleComponent} from './assets'
import {exportSvg} from './svg'
import {exportDrawio} from './export'
import {importSvg} from './svgImport'
import {diffFigures} from './figureDiff'
import {parseHarnessResponse} from './harness'
import {composeCatalogue} from './catalogue'
import {createEditor} from '../composables/useEditor'
import {applyMaterialEdits} from './materialEditing'
import {edgeWaypointPoints,moveEdgeWaypoint,removeEdgeWaypoint} from './edgeWaypoints'
import {groupObjects,ungroupObject,moveObjects,resizeObject} from './geometry'
import {scaleSubtree} from './scaling'
import {captureObjectSelection} from './componentCapture'
import {componentContentJson} from './componentContent'
import {updateRecipeInstance} from './recipeUpdate'
import {pathArrowFrames} from './paths'
import {parseSvgPath} from './svgPath'
afterEach(()=>vi.unstubAllGlobals())
const fixture=()=>{const d=createBlank();d.nodes=[{id:'a',parentId:'stage',kind:'rectangle' as const,label:'A',x:100,y:200,width:80,height:60},{id:'b',parentId:'stage',kind:'rectangle' as const,label:'B',x:700,y:330,width:80,height:60}];d.edges=[{id:'wire',source:'a',target:'b',sourcePort:'right',targetPort:'left',routing:'straight'}];return d}
describe('explicit native edge routing',()=>{
  it('styles semantic connections and open paths together while preserving routes, bindings, visibility warnings and independent channels',()=>{
    const base=applyMaterialEdits(fixture(),[{kind:'edge-route',edgeId:'wire',points:[{x:300,y:230},{x:300,y:360}],direction:'horizontal'}]).figure
    base.nodes.push({id:'curve',parentId:'stage',kind:'path',label:'',x:150,y:400,width:400,height:50,path:{arrow:'filled',points:[{x:0,y:0},{x:1,y:1,c1:{x:.3,y:0},c2:{x:.7,y:1}}],start:{nodeId:'a',x:1,y:.5}},visual:{stroke:'#234567',strokeWidth:1.5,fill:'none',handDrawn:false}})
    base.nodes.splice(2,0,{id:'closed',parentId:'stage',kind:'path',label:'',x:120,y:450,width:60,height:30,path:{arrow:'none',points:[{x:0,y:0},{x:1,y:0},{x:.5,y:1,close:true}]}},{...clone(base.nodes.at(-1)!),id:'transformed',visual:{strokeMatrix:[2,0,0,1]}},{id:'axis',parentId:'stage',kind:'path',label:'',x:200,y:450,width:60,height:0,path:{arrow:'none',points:[{x:0,y:0},{x:1,y:0}]},chart:{role:'axis',channels:['stroke']}})
    Object.assign(base,parseDocument(base))
    const before=clone(base),request={kind:'line-style' as const,objectIds:['stage'],includeDescendants:true,style:{stroke:'#287f72',strokeWidth:3,dash:[7,4],arrow:'open' as const,startArrow:'filled' as const,arrowSize:12}},result=applyMaterialEdits(base,[request]),edge=result.figure.edges[0]!,path=result.figure.nodes.at(-1)!
    expect(edge).toEqual({...base.edges[0],appearance:request.style});expect(path.path).toEqual({...base.nodes.at(-1)!.path,arrow:'open',startArrow:'filled',arrowSize:12});expect(path.visual).toMatchObject({stroke:'#287f72',strokeWidth:3,dash:[7,4],fill:'none',handDrawn:false});expect(routeEdge(result.figure,edge)).toEqual(routeEdge(base,base.edges[0]!));expect(base).toEqual(before);expect(applyMaterialEdits(result.figure,[request]).changed).toBe(false)
    expect(result.figure.nodes.slice(2,-1)).toEqual(before.nodes.slice(2,-1));expect(result.reports[0]!.skipped).toHaveLength(3)
    vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{}});const scope=effectScope();try{const editor=scope.run(createEditor)!;editor.figure.value=clone(result.figure);editor.select('curve');editor.select('wire',true);expect(editor.selectedIds.value).toEqual(['curve','wire']);editor.select('a',true);expect(editor.selectedIds.value).toEqual(['curve','wire','a']);expect(editor.canGroup.value).toBe(false);editor.select('wire',true);expect(editor.selectedIds.value).toEqual(['curve','a'])}finally{scope.stop()}
    const xml=new DOMParser().parseFromString(exportSvg(result.figure),'image/svg+xml'),line=Array.from(xml.getElementsByTagName('path')).find(p=>p.getAttribute('data-edge-id')==='wire')!,marker=xml.getElementById(line.getAttribute('marker-end')!.slice(5,-1))!
    expect(line.getAttribute('stroke')).toBe('#287f72');expect(line.getAttribute('stroke-width')).toBe('3');expect(line.getAttribute('stroke-dasharray')).toBe('7 4');expect(marker.getElementsByTagName('path')[0]!.getAttribute('fill')).toBe('none');expect(diffFigures(base,result.figure).changes.find(c=>c.id==='wire')!.fields.map(f=>f.name)).toEqual(['连线外观'])
    const startMarker=xml.getElementById(line.getAttribute('marker-start')!.slice(5,-1))!;expect(startMarker.getAttribute('orient')).toBe('auto-start-reverse');expect(startMarker.getAttribute('markerUnits')).toBe('userSpaceOnUse');expect(startMarker.getAttribute('markerWidth')).toBe('12');expect(startMarker.getElementsByTagName('path')[0]!.getAttribute('fill')).toBe('#287f72')
    expect(Number(startMarker.getElementsByTagName('path')[0]!.getAttribute('stroke-width'))*Number(startMarker.getAttribute('markerWidth'))).toBe(Number(line.getAttribute('stroke-width')))
    const endOnly=applyMaterialEdits(result.figure,[{...request,style:{arrow:'none'}}]).figure;expect(endOnly.edges[0]!.appearance).toMatchObject({arrow:'none',startArrow:'filled',arrowSize:12});expect(endOnly.nodes.at(-1)!.path).toMatchObject({arrow:'none',startArrow:'filled',arrowSize:12})
    const shared=applyMaterialEdits(result.figure,[{...request,style:{startArrow:'open'}}]).figure,sharedXml=new DOMParser().parseFromString(exportSvg(shared),'image/svg+xml'),sharedLine=Array.from(sharedXml.getElementsByTagName('path')).find(p=>p.getAttribute('data-edge-id')==='wire')!;expect(sharedLine.getAttribute('marker-start')).toBe(sharedLine.getAttribute('marker-end'));const markerIds=Array.from(sharedXml.getElementsByTagName('marker')).map(m=>m.getAttribute('id'));expect(new Set(markerIds).size).toBe(markerIds.length)
    const restored=applyMaterialEdits(result.figure,[{...request,style:{stroke:null,strokeWidth:null,dash:null,arrow:'none',startArrow:'none',arrowSize:null}}]).figure;expect(restored.edges[0]!.appearance).toEqual({arrow:'none',startArrow:'none'});expect(restored.nodes.at(-1)!.visual).toEqual({fill:'none',handDrawn:false});expect(restored.nodes.at(-1)!.path!.arrowSize).toBeUndefined();expect(exportSvg(restored).match(/data-edge-id="wire"[^>]*marker-(end|start)/)).toBeNull()
    const blocked=clone(result.figure);moveEdgeWaypoint(blocked,'wire',0,{x:130,y:220});const warning=Array.from(new DOMParser().parseFromString(exportSvg(blocked),'image/svg+xml').getElementsByTagName('path')).find(p=>p.getAttribute('data-edge-id')==='wire')!;expect(warning.getAttribute('stroke')).toBe('#c54747');expect(warning.getAttribute('stroke-dasharray')).toBe('5 4');expect(blocked.edges[0]!.appearance).toEqual(request.style)
    for(const style of [{},{strokeWidth:65},{dash:[0,0]},{arrowSize:0},{startArrow:'wrong'},{after:{stroke:'#123456'}}])expect(()=>applyMaterialEdits(base,[{...request,style} as never])).toThrow();expect(base).toEqual(before)
  })
  it('places both curve arrowheads on outward tangents, handles coincident controls and subpaths, and scales explicit head sizes',()=>{
    const cubic=[{x:300,y:430},{x:400,y:530,c1:{x:300,y:430},c2:{x:400,y:530}}],frames=pathArrowFrames(cubic);expect(frames.start!.angle).toBeCloseTo(-Math.PI*3/4);expect(frames.end!.angle).toBeCloseTo(Math.PI/4)
    const vertical=pathArrowFrames([{x:0,y:0},{x:0,y:20}]);expect(vertical.start!.angle).toBeCloseTo(-Math.PI/2);expect(vertical.end!.angle).toBeCloseTo(Math.PI/2);expect(pathArrowFrames([{x:1,y:1},{x:1,y:1}])).toEqual({start:undefined,end:undefined});expect(pathArrowFrames([{x:0,y:0},{x:10,y:10,move:true}])).toEqual({start:undefined,end:undefined});expect(pathArrowFrames([{x:0,y:0},{x:10,y:10,close:true}])).toEqual({start:undefined,end:undefined})
    const doc=fixture();doc.nodes.push({id:'curve-heads',parentId:'stage',kind:'path',label:'',x:300,y:430,width:100,height:100,path:{points:[{x:0,y:0},{x:1,y:1,c1:{x:0,y:0},c2:{x:1,y:1}}],arrow:'open',startArrow:'filled',arrowSize:14},visual:{stroke:'#287f72',strokeWidth:2,strokeOpacity:.4,handDrawn:false}})
    const source=exportSvg(doc),xml=new DOMParser().parseFromString(source,'image/svg+xml'),heads=Array.from(xml.getElementsByTagName('path')).filter(p=>p.hasAttribute('data-path-arrow'));expect(heads).toHaveLength(2)
    for(const head of heads){const side=head.getAttribute('data-path-arrow') as 'start'|'end',frame=frames[side]!,points=parseSvgPath(head.getAttribute('d')!,[1,0,0,1,0,0]),center={x:(points[0]!.x+points[2]!.x)/2,y:(points[0]!.y+points[2]!.y)/2};expect(points[1]).toMatchObject(frame.tip);expect(frame.tip.x-center.x).toBeCloseTo(14*Math.cos(frame.angle));expect(frame.tip.y-center.y).toBeCloseTo(14*Math.sin(frame.angle));expect(head.getAttribute('fill')).toBe(side==='start'?'#287f72':'none');expect(head.getAttribute('stroke-opacity')).toBe('0.4')}
    const restored=importSvg(source,{fileName:'heads.svg',sha256:createHash('sha256').update(source).digest('hex'),parseXml:s=>new DOMParser().parseFromString(s,'image/svg+xml') as unknown as Document});expect(restored.asset.figure.nodes.find(n=>n.id==='curve-heads')!.path).toMatchObject({startArrow:'filled',arrow:'open',arrowSize:14})
    groupObjects(doc,['a','b','curve-heads'],'heads');const small=scaleSubtree(doc,'heads',.5,'top-left').document;expect(small.nodes.find(n=>n.id==='curve-heads')!.path!.arrowSize).toBe(7)
  })
  it('routes through author pins without rounding them away, preserves bindings, and rejects collisions atomically',()=>{
    const doc=fixture(),before=clone(doc),points=[{x:300,y:230},{x:300,y:360}],request={kind:'edge-route' as const,edgeId:'wire',points,direction:'horizontal' as const},result=applyMaterialEdits(doc,[request]),edge=result.figure.edges[0]!,route=routeEdge(result.figure,edge)
    expect(route.status).toBe('clear');for(const point of points)expect(route.points).toContainEqual(point)
    expect(edgeWaypointPoints(result.figure,edge)).toEqual(points);expect({...edge,routing:'straight',manualRoute:undefined}).toEqual({...doc.edges[0],manualRoute:undefined});expect(result.figure.nodes).toEqual(doc.nodes);expect(doc).toEqual(before)
    const svg=exportSvg(result.figure);expect(svg).toContain('data-edge-routing="manual"');expect(svg).toContain('d="M180 230 L300 230 L300 360 L700 360"');expect(importSvg(svg,{fileName:'pinned.svg',sha256:createHash('sha256').update(svg).digest('hex'),parseXml:source=>new DOMParser().parseFromString(source,'image/svg+xml') as unknown as Document}).asset.figure.edges[0]!.manualRoute).toEqual(edge.manualRoute)
    expect(applyMaterialEdits(result.figure,[request]).changed).toBe(false)
    const obstruction=clone(doc);obstruction.nodes.push({id:'block',kind:'rectangle',label:'Do not cross',parentId:'stage',x:270,y:270,width:60,height:40})
    expect(()=>applyMaterialEdits(obstruction,[request])).toThrow('相交');expect(obstruction.edges[0]!.routing).toBe('straight')
    expect(()=>applyMaterialEdits(doc,[{...request,points:[{x:300,y:100}]}])).toThrow('内容区域')
    const reset=applyMaterialEdits(result.figure,[{...request,points:[]}]).figure.edges[0]!
    expect(reset.routing).toBe('orthogonal');expect(reset.manualRoute).toBeUndefined();expect(reset.source).toBe('a');expect(reset.target).toBe('b')
  })
  it('keeps pins fixed during endpoint moves, moves them with a multi-selection, and rebases group / ungroup frames without shifting geometry',()=>{
    const points=[{x:300,y:230},{x:300,y:360}],doc=applyMaterialEdits(fixture(),[{kind:'edge-route',edgeId:'wire',points,direction:'horizontal'}]).figure,edge=doc.edges[0]!
    moveObjects(doc,['a'],20,0);expect(edgeWaypointPoints(doc,edge)).toEqual(points);expect(routeEdge(doc,edge).status).toBe('clear')
    moveObjects(doc,['a','b'],10,15);const moved=points.map(p=>({x:p.x+10,y:p.y+15}));expect(edgeWaypointPoints(doc,edge)).toEqual(moved)
    groupObjects(doc,['a','b'],'material');expect(edge.manualRoute!.containerId).toBe('material');expect(edgeWaypointPoints(doc,edge)).toEqual(moved);expect(parseDocument(doc).edges[0]!.manualRoute).toEqual(edge.manualRoute)
    moveObjects(doc,['material'],15,10);const grouped=moved.map(p=>({x:p.x+15,y:p.y+10}));expect(edgeWaypointPoints(doc,edge)).toEqual(grouped)
    resizeObject(doc,'material',1,1);expect(edgeWaypointPoints(doc,edge)).toEqual(grouped)
    ungroupObject(doc,'material');expect(edge.manualRoute!.containerId).toBe('stage');expect(edgeWaypointPoints(doc,edge)).toEqual(grouped);expect(()=>parseDocument(doc)).not.toThrow()
  })
  it('retains manual geometry through scaled material capture, ID remapping, SVG recovery and content comparison',async()=>{
    const doc=applyMaterialEdits(fixture(),[{kind:'edge-route',edgeId:'wire',points:[{x:300,y:170},{x:600,y:170}],direction:'horizontal'},{kind:'line-style',objectIds:['wire'],includeDescendants:false,style:{stroke:'#287f72',strokeWidth:3,dash:[6,4],arrow:'open',startArrow:'filled',arrowSize:12}}]).figure
    const fragment=await captureObjectSelection(doc,['a','b'],{name:'Pinned fragment',description:'',tags:'',sources:[]},{kind:'project'})
    expect(routeEdge(fragment.asset.figure,fragment.asset.figure.edges[0]!).status).toBe('clear');expect(edgeWaypointPoints(fragment.asset.figure,fragment.asset.figure.edges[0]!).every(p=>p.y>=0)).toBe(true)
    groupObjects(doc,['a','b'],'bundle');doc.nodes.push({id:'size-sample',kind:'rectangle',label:'Size sample',parentId:'stage',x:100,y:480,width:760,height:60});const pinsBeforeSize=edgeWaypointPoints(doc,doc.edges[0]!),children=clone(doc.nodes.filter(n=>n.parentId==='bundle'));Object.assign(doc,applyMaterialEdits(doc,[{kind:'match-size',sourceId:'size-sample',objectIds:['bundle'],dimension:'width',anchor:'center'}]).figure);expect(edgeWaypointPoints(doc,doc.edges[0]!)).toEqual(pinsBeforeSize);expect(doc.nodes.filter(n=>n.parentId==='bundle')).toEqual(children)
    const root=doc.containers.find(c=>c.id==='bundle')!,old=edgeWaypointPoints(doc,doc.edges[0]!),scaled=scaleSubtree(doc,'bundle',.5,'top-left').document,newPoints=edgeWaypointPoints(scaled,scaled.edges[0]!)
    newPoints.forEach((p,i)=>{expect(p.x).toBeCloseTo(root.x+(old[i]!.x-root.x)*.5);expect(p.y).toBeCloseTo(root.y+(old[i]!.y-root.y)*.5)})
    const asset=captureComponent(scaled,'bundle','Pinned flow'),stored=clone(asset),placed=instantiateComponentAt(createBlank(),asset,'stage',{x:100,y:180},'placed',true),wire=placed.document.edges[0]!,world=edgeWaypointPoints(placed.document,wire)
    expect(wire.source).not.toBe('a');expect(wire.manualRoute!.containerId).toBe(placed.containerId);world.forEach((p,i)=>{expect(p.x).toBeCloseTo(newPoints[i]!.x-root.x+100);expect(p.y).toBeCloseTo(newPoints[i]!.y-root.y+180)})
    expect(routeEdge(placed.document,wire).status).toBe('clear');expect(asset).toEqual(stored)
    expect(wire.appearance).toEqual({stroke:'#287f72',strokeWidth:1.5,dash:[3,2],arrow:'open',startArrow:'filled',arrowSize:6})
    const recaptured=captureComponent(placed.document,placed.containerId,'Pinned flow');expect(componentContentJson(recaptured)).toBe(componentContentJson(asset))
    expect(importSvg(exportSvg(placed.document),{fileName:'placed.svg',sha256:createHash('sha256').update(exportSvg(placed.document)).digest('hex'),parseXml:source=>new DOMParser().parseFromString(source,'image/svg+xml') as unknown as Document}).asset.figure.edges[0]!.manualRoute).toEqual(wire.manualRoute)
    const pipeline=componentDocument(buildRecipe('pipeline',{stages:2,direction:'row'})),link=pipeline.edges[0]!,ends=routeEdge(pipeline,link).points,pins=[{x:(ends[0]!.x+ends.at(-1)!.x)/2,y:(ends[0]!.y+ends.at(-1)!.y)/2}],edited=applyMaterialEdits(pipeline,[{kind:'edge-route',edgeId:link.id,points:pins,direction:'horizontal'},{kind:'line-style',objectIds:[link.id],includeDescendants:false,style:{strokeWidth:2.5,arrow:'none',startArrow:'open',arrowSize:10}}]).figure,updated=updateRecipeInstance(edited,'stage',{stages:3}).document,kept=updated.edges.find(e=>e.id===link.id)!
    expect(kept.routing).toBe('manual');expect(edgeWaypointPoints(updated,kept)).toEqual(pins);expect(kept.source).toBe(link.source);expect(updateRecipeInstance(edited,'stage',{stages:3},'scale',false).document.edges.every(e=>!e.manualRoute)).toBe(true)
    expect(kept.appearance).toEqual({strokeWidth:2.5,arrow:'none',startArrow:'open',arrowSize:10});expect(updateRecipeInstance(edited,'stage',{stages:3},'scale',false).document.edges.every(e=>!e.appearance)).toBe(true)

  })
  it('shows blocked direct manipulation without deleting pins, supports point removal and enforces manual-route document contracts',()=>{
    const doc=applyMaterialEdits(fixture(),[{kind:'edge-route',edgeId:'wire',points:[{x:300,y:230},{x:300,y:360}],direction:'horizontal'}]).figure,edge=doc.edges[0]!,before=clone(edge)
    moveEdgeWaypoint(doc,'wire',0,{x:130,y:220});expect(routeEdge(doc,edge).status).toBe('blocked');expect(edge.manualRoute!.points).toHaveLength(2);expect(edge.source).toBe(before.source);expect(edge.targetPort).toBe(before.targetPort);expect(()=>parseDocument(doc)).not.toThrow()
    removeEdgeWaypoint(doc,'wire',0);expect(edge.manualRoute!.points).toHaveLength(1);removeEdgeWaypoint(doc,'wire',0);expect(edge.manualRoute).toBeUndefined();expect(edge.routing).toBe('orthogonal')
    for(const change of [{routing:'manual' as const},{routing:'straight' as const,manualRoute:before.manualRoute},{routing:'manual' as const,manualRoute:{...before.manualRoute!,containerId:'missing'}}]){const bad=fixture();Object.assign(bad.edges[0]!,change);expect(()=>parseDocument(bad)).toThrow()}
  })
  it('scales and captures interface routes whose pins and departure legs lie outside their own material frame',()=>{
    const doc=createBlank();doc.containers.push({id:'box',parentId:'stage',role:'component',title:'Interfaces',x:200,y:220,width:200,height:140,visual:{fill:'none',stroke:'none'}})
    doc.nodes=[{id:'right',parentId:'box',kind:'port',interfaceFor:'box',label:'Right interface',x:200,y:220,width:200,height:140},{id:'top',parentId:'box',kind:'port',interfaceFor:'box',label:'Top interface',x:200,y:220,width:200,height:140},{id:'body',parentId:'box',kind:'rectangle',label:'Process',x:250,y:260,width:100,height:50}]
    doc.edges=[{id:'around',source:'right',target:'top',sourcePort:'right',targetPort:'top'}]
    const pinned=applyMaterialEdits(doc,[{kind:'edge-route',edgeId:'around',points:[{x:300,y:180}],direction:'vertical'}]).figure,scaled=scaleSubtree(pinned,'box',.5,'top-left').document,edge=scaled.edges[0]!,points=edgeWaypointPoints(scaled,edge)
    expect(points).toEqual([{x:250,y:200}]);expect(edge.manualRoute!.containerId).toBe('stage');expect(routeEdge(scaled,edge).status).toBe('clear');expect(routeEdge(scaled,edge).points).toContainEqual({x:309,y:255})
    const asset=captureComponent(scaled,'box','Complete interface route'),root=rootContainer(asset.figure),wire=asset.figure.edges[0]!,body=asset.figure.containers.find(c=>c.id==='box')!
    expect(asset.figure.containers).toHaveLength(2);expect(body.width).toBe(100);expect(body.height).toBe(70);expect(root.width).toBeGreaterThan(body.width);expect(edgeWaypointPoints(asset.figure,wire)[0]!.y).toBeGreaterThanOrEqual(0);expect(routeEdge(asset.figure,wire).status).toBe('clear')
    const placed=instantiateComponentAt(createBlank(),asset,'stage',{x:500,y:200},'interface-copy',true).document
    expect(routeEdge(placed,placed.edges[0]!).status).toBe('clear');expect(placed.edges[0]!.manualRoute!.containerId).toBe('interface-copy');expect(pinned.nodes[0]!.width).toBe(200)
  })
  it('intersects diagonal geometry in either direction without confusing a corner touch with entering an obstacle',()=>{
    const rect={x:20,y:20,width:10,height:10}
    for(const [a,b,hit]of [[{x:0,y:0},{x:50,y:50},true],[{x:0,y:0},{x:50,y:10},false],[{x:10,y:30},{x:30,y:10},false],[{x:22,y:22},{x:28,y:28},true],[{x:0,y:30},{x:50,y:32},false],[{x:0,y:29},{x:50,y:29.5},true]] as const){expect(segmentHitsRect(a,b,rect)).toBe(hit);expect(segmentHitsRect(b,a,rect)).toBe(hit)}
    expect(segmentHitsRect({x:0,y:0},{x:40,y:40},{x:20,y:20,width:0,height:0})).toBe(false)
  })
  it('keeps one direct segment and reports invalid directions, bounds and collisions without silently rerouting',()=>{
    const doc=fixture(),before=clone(doc),edge=doc.edges[0]!,direct=routeEdge(doc,edge)
    expect(direct).toEqual({points:[{x:180,y:230},{x:700,y:360}],status:'clear'});expect(doc).toEqual(before)
    doc.nodes.push({id:'wall',parentId:'stage',kind:'module',label:'Wall',x:400,y:260,width:100,height:60})
    const blocked=routeEdge(doc,edge);expect(blocked.status).toBe('blocked');expect(blocked.reason).toContain('相交');expect(blocked.points).toEqual(direct.points)
    edge.routing='orthogonal';expect(routeEdge(doc,edge).status).toBe('clear');expect(routeEdge(doc,edge).points.length).toBeGreaterThan(2)
    edge.routing='straight';doc.nodes.pop();edge.sourcePort='left';expect(routeEdge(doc,edge).reason).toContain('端口外侧')
    edge.sourcePort='right';doc.nodes[0]!.y=100;expect(routeEdge(doc,edge).reason).toContain('内容区域')
  })
  it('supports each geometrically possible pair of cardinal ports and rejects same-side direct connections',()=>{
    const vectors:Record<Port,[number,number]>={left:[-1,0],right:[1,0],top:[0,-1],bottom:[0,1]}
    for(const from of Object.keys(vectors) as Port[])for(const to of Object.keys(vectors) as Port[]){const doc=fixture(),a=doc.nodes[0]!,b=doc.nodes[1]!,s=vectors[from],t=vectors[to];Object.assign(a,{x:440,y:300,width:60,height:60});Object.assign(b,{x:a.x+(from===to?150:(s[0]-t[0])*70),y:a.y+(from===to?80:(s[1]-t[1])*70),width:60,height:60});Object.assign(doc.edges[0]!,{sourcePort:from,targetPort:to});parseDocument(doc);const route=routeEdge(doc,doc.edges[0]!);expect(route.status,`${from} → ${to}`).toBe(from===to?'blocked':'clear');expect(route.points).toHaveLength(2)}
  })
  it('uses straight all-to-all layer relations while fusion and pipeline retain orthogonal routing',()=>{
    const doc=buildRecipe('mlp',{inputs:3,hiddenLayers:2,hidden:3,outputs:2}).figure,routes=routeFigure(doc)
    expect(doc.nodes).toHaveLength(11);expect(doc.edges).toHaveLength(24)
    for(const edge of doc.edges){expect(edge.routing).toBe('straight');expect(routes.get(edge.id)).toMatchObject({status:'clear'});expect(routes.get(edge.id)!.points).toHaveLength(2)}
    expect([...routes.values()].some(r=>r.points[0]!.y!==r.points[1]!.y)).toBe(true)
    expect(new Set([...routes.values()].map(r=>routePath(r))).size).toBe(24)
    expect(buildRecipe('pipeline',{stages:3,direction:'row'}).figure.edges.every(e=>!e.routing||e.routing==='orthogonal')).toBe(true)
    expect(buildRecipe('fusion',{branches:3,operator:'sum',feature:'tensor'}).figure.edges.every(e=>!e.routing||e.routing==='orthogonal')).toBe(true)
  })
  it('preserves routing through model responses, capture, remapping, scale and SVG metadata without changing topology',()=>{
    const asset=buildRecipe('mlp',{inputs:3,hiddenLayers:2,hidden:3,outputs:2}),before=clone(asset)
    const scaled=scaleComponent(asset,.5),doc=instantiateComponentAt(createBlank(),scaled,'stage',{x:100,y:160},'head').document
    expect(asset).toEqual(before);expect(doc.edges).toHaveLength(24);expect(doc.edges.every(e=>e.routing==='straight')).toBe(true)
    expect([...routeFigure(doc).values()].every(r=>r.status==='clear'&&r.points.length===2)).toBe(true)
    const captured=captureComponent(doc,'head','Network'),reused=componentDocument(captured)
    expect(reused.edges.every(e=>e.routing==='straight')).toBe(true)
    const recovered=importSvg(exportSvg(doc),{fileName:'Network.svg',sha256:'a'.repeat(64),parseXml:source=>new DOMParser().parseFromString(source,'image/svg+xml') as unknown as Document}).asset.figure
    expect(recovered.edges).toEqual(doc.edges)
    const response=parseHarnessResponse(JSON.stringify({message:'Preserve network',figure:doc}),doc)
    expect(response.figure?.edges).toEqual(doc.edges)
    const invalid=clone(doc);invalid.edges[0]!.routing='curve' as 'straight';expect(()=>parseDocument(invalid)).toThrow()
  })
  it('keeps draw.io endpoints on their actual node anchors including padded vector fallback cells',()=>{
    const doc=instantiateComponentAt(createBlank(),scaleComponent(buildRecipe('mlp',{inputs:2,hiddenLayers:1,hidden:2,outputs:1}),.5),'stage',{x:100,y:160},'head').document
    const xml=new DOMParser().parseFromString(exportDrawio(doc),'application/xml'),cells=[...Array.from(xml.getElementsByTagName('mxCell'))],byId=new Map(cells.map(c=>[c.getAttribute('id'),c]))
    for(const edge of doc.edges){const cell=byId.get(edge.id)!,styles=Object.fromEntries(cell.getAttribute('style')!.split(';').map(s=>s.split('=')));expect(cell.getAttribute('data-edge-routing')).toBe('straight');expect(styles.rounded).toBe('0');expect(styles.exitPerimeter).toBe('0');expect(styles.entryPerimeter).toBe('0');expect(cell.getElementsByTagName('mxPoint').length).toBe(0)
      for(const [endpoint,prefix]of [['source','exit'],['target','entry']] as const){const node=doc.nodes.find(n=>n.id===edge[endpoint])!,parent=doc.containers.find(c=>c.id===node.parentId)!,geometry=byId.get(node.id)!.getElementsByTagName('mxGeometry')[0]!,[x,y]=anchor(node,edge[`${endpoint}Port`]);expect(Number(geometry.getAttribute('x'))+parent.x+Number(geometry.getAttribute('width'))*Number(styles[`${prefix}X`])).toBeCloseTo(x,9);expect(Number(geometry.getAttribute('y'))+parent.y+Number(geometry.getAttribute('height'))*Number(styles[`${prefix}Y`])).toBeCloseTo(y,9)}
    }
  })
  it('lets model instance links choose direct routing while saved material internals retain their own mode',()=>{
    const asset=buildRecipe('pipeline',{stages:2,direction:'row'}),result=composeCatalogue(createBlank(),[{kind:'asset',asset}],[{id:'first',componentKey:`asset:${asset.id}`,parentId:'stage',x:80,y:170,keepAppearance:false},{id:'second',componentKey:`asset:${asset.id}`,parentId:'stage',x:510,y:320,keepAppearance:false}],[{id:'bridge',source:{scope:'port',instanceId:'first',port:'output',index:0},target:{scope:'port',instanceId:'second',port:'input',index:0},sourcePort:'right',targetPort:'left',routing:'straight'}])
    expect(result.figure.edges.find(e=>e.id==='bridge')?.routing).toBe('straight');expect(result.figure.edges.filter(e=>e.id!=='bridge').every(e=>!e.routing)).toBe(true)
  })
  it('reviews and undoes an edge mode change and reports global reference provenance changes',()=>{
    const storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)})
    const scope=effectScope()
    try{const editor=scope.run(()=>createEditor())!;editor.importProject(JSON.stringify(fixture()));const old=clone(editor.figure.value);editor.update(doc=>{doc.edges[0]!.routing='orthogonal'});expect(diffFigures(old,editor.figure.value).changes[0]?.fields).toEqual([{name:'连线方式',before:'straight',after:'orthogonal'}]);editor.undo();expect(editor.figure.value.edges[0]!.routing).toBe('straight');editor.redo();expect(editor.figure.value.edges[0]!.routing).toBe('orthogonal')}finally{scope.stop()}
    const before=createExample(),after=clone(before);after.referenceUses=[{index:1,id:'ref',title:'Source',purpose:'style',citation:'Fig 1',fileName:'a.png',sha256:'a'.repeat(64),width:100,height:100,decision:'use',observation:'Palette',application:'Colors',uncertainty:''}]
    expect(diffFigures(before,after).changes[0]).toMatchObject({kind:'document',fields:[{name:'图件参考用途'}]})
    after.referenceUses[0]!.application='Spacing';expect(diffFigures({...before,referenceUses:[{...after.referenceUses[0]!,application:'Colors'}]},after).changes[0]?.fields[0]?.name).toBe('图件参考用途')
  })
})
