import {paperNode} from './paperStyle.ts'
import {edgeRouteContainer,edgeWaypointPoints,snapshotEdgeWaypoints,reframeEdgeWaypoints} from './edgeWaypoints.ts'
import { isPrimitive, type FigureDocument, type FigureNode, type FigureContainer } from './model.ts'
import { syncBindings,bindingPoint } from './paths.ts'
import { figurePaint } from './paint.ts'
import { nodeTextStyle } from './typography.ts'
import {defaultPaletteId,paletteById} from '../data/materials.ts'

export interface Rect { x: number; y: number; width: number; height: number }
export type FigureObject = FigureNode | FigureContainer
export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'distribute-x' | 'distribute-y'
export const allObjects = (doc: FigureDocument): FigureObject[] => [...doc.containers, ...doc.nodes]
export const findObject = (doc: FigureDocument, id: string) => allObjects(doc).find(o => o.id === id)
export const childrenOf = (doc: FigureDocument, parentId: string): (FigureNode | FigureContainer)[] => [...doc.containers, ...doc.nodes].filter(o => o.parentId === parentId)
export const parentOf = (doc: FigureDocument, id: string) => {
  const o = findObject(doc, id)
  return o?.parentId ? doc.containers.find(c => c.id === o.parentId) : undefined
}
export function ancestors(doc: FigureDocument, id: string): string[] {
  const result: string[] = []
  let parent = parentOf(doc, id)
  while (parent && !result.includes(parent.id)) { result.push(parent.id); parent = parentOf(doc, parent.id) }
  return result
}
export function resolveStyle(doc: FigureDocument, id: string): FigureDocument['style'] {
  const style = { ...doc.style }
  for (const objectId of [...ancestors(doc, id).reverse(), id]) {
    const c = doc.containers.find(c => c.id === objectId)
    if (c?.appearance?.preset && c.appearance.preset !== 'inherit') {style.preset=c.appearance.preset;if(!c.appearance.designSystem)style.designSystem='legacy'}
    if (c?.appearance?.accent && c.appearance.accent !== 'inherit') { style.accent = c.appearance.accent; delete style.paletteId }
    if (c?.appearance?.paletteId && c.appearance.paletteId !== 'inherit') style.paletteId = c.appearance.paletteId
    if (c?.appearance?.colorIndex !== undefined) style.colorIndex = c.appearance.colorIndex
    if(c?.appearance?.colorMap!==undefined)style.colorMap=c.appearance.colorMap
    if(c?.appearance?.designSystem)style.designSystem=c.appearance.designSystem
    if(c?.appearance?.fontRoles)style.fontRoles=c.appearance.fontRoles
    if(c?.appearance?.fontFamily)style.fontFamily=c.appearance.fontFamily
    if(c?.appearance?.sketchStyle)style.sketchStyle=c.appearance.sketchStyle
    if(c?.appearance?.roughness!==undefined)style.roughness=c.appearance.roughness
  }
  if(style.colorIndex!==undefined)style.colorIndex%=paletteById.get(style.paletteId??defaultPaletteId)!.colors.length
  if([...ancestors(doc,id),id].some(objectId=>{const c=doc.containers.find(c=>c.id===objectId);return c?.dataChart||c?.sharedLegend||c?.sharedColorbar})){delete style.colorMap;style.designSystem='legacy'}
  return style
}
export const commonContainer=edgeRouteContainer

export const descendants = (doc: FigureDocument, id: string) => allObjects(doc).filter(o => ancestors(doc, o.id).includes(id))
export function fitTransparentAncestors(doc:FigureDocument,id:string) {
  const pins=snapshotEdgeWaypoints(doc)
  for(const ancestor of ancestors(doc,id)){
    const c=doc.containers.find(c=>c.id===ancestor)!
    if(c.role!=='component'||c.visual?.fill!=='none'||c.visual?.stroke!=='none')break
    const box=bounds(childrenOf(doc,c.id).filter(n=>!('interfaceFor'in n&&n.interfaceFor))),right=Math.max(c.x+c.width,box.x+box.width+2*(c.metricScale??1)),bottom=Math.max(c.y+c.height,box.y+box.height+2*(c.metricScale??1))
    c.x=Math.min(c.x,box.x-2*(c.metricScale??1));c.y=Math.min(c.y,box.y-2*(c.metricScale??1));c.width=Math.max(5,right-c.x);c.height=Math.max(5,bottom-c.y)
  }
  reframeEdgeWaypoints(doc,pins)
}
export const topLevelSelection = (doc: FigureDocument, ids: string[]) => allObjects(doc).filter(o => ids.includes(o.id) && !ancestors(doc, o.id).some(parent => ids.includes(parent)))
export function bounds(objects: Rect[]): Rect {
  if (!objects.length) return { x: 0, y: 0, width: 0, height: 0 }
  const x = Math.min(...objects.map(o => o.x)), y = Math.min(...objects.map(o => o.y))
  return { x, y, width: Math.max(...objects.map(o => o.x + o.width)) - x, height: Math.max(...objects.map(o => o.y + o.height)) - y }
}
export const contentBounds = (container: Rect & {role?:string;metricScale?:number}): Rect => container.role==='component'?{x:container.x+2*(container.metricScale??1),y:container.y+2*(container.metricScale??1),width:container.width-4*(container.metricScale??1),height:container.height-4*(container.metricScale??1)}:{ x: container.x + 12*(container.metricScale??1), y: container.y + 48*(container.metricScale??1), width: container.width - 24*(container.metricScale??1), height: container.height - 60*(container.metricScale??1) }
export const contains = (outer: Rect, inner: Rect) => inner.x >= outer.x - 0.001 && inner.y >= outer.y - 0.001 && inner.x + inner.width <= outer.x + outer.width + 0.001 && inner.y + inner.height <= outer.y + outer.height + 0.001
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
export function translateGeometry(object:FigureObject,dx:number,dy:number) {
  object.x+=dx;object.y+=dy
  if(!('kind' in object)&&object.reconstruction){object.reconstruction.origin.x+=dx;object.reconstruction.origin.y+=dy}
}

export function translateSubtree(doc: FigureDocument, object: FigureObject, dx: number, dy: number,movePins=true) {
  const affected = [object, ...descendants(doc, object.id)]
  const ids=new Set(affected.map(o=>o.id)),pins=movePins?snapshotEdgeWaypoints(doc,e=>ids.has(e.source)&&ids.has(e.target)&&!ids.has(e.manualRoute!.containerId)):new Map()
  affected.forEach(o => translateGeometry(o,dx,dy));reframeEdgeWaypoints(doc,pins,dx,dy)
}
export function moveObjects(doc: FigureDocument, ids: string[], dx: number, dy: number) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
  ids=ids.map(id=>doc.nodes.find(n=>n.id===id)?.interfaceFor??id)
  const objects = topLevelSelection(doc, ids)
  if (!objects.length) return
  const moving=new Set(objects.flatMap(o=>[o.id,...descendants(doc,o.id).map(n=>n.id)]))
  let minX = -Infinity, maxX = Infinity, minY = -Infinity, maxY = Infinity
  for (const object of objects) {
    const parent = parentOf(doc, object.id)
    const area = parent ? contentBounds(parent) : { x: 0, y: 0, width: doc.canvas.width, height: doc.canvas.height }
    minX = Math.max(minX, area.x - object.x); maxX = Math.min(maxX, area.x + area.width - object.x - object.width)
    minY = Math.max(minY, area.y - object.y); maxY = Math.min(maxY, area.y + area.height - object.y - object.height)
  }
  for(const path of doc.nodes) if(path.path&&!moving.has(path.parentId)) {
    const parent=parentOf(doc,path.id);if(!parent)continue
    const area=contentBounds(parent)
    for(const binding of [path.path.start,path.path.end]) if(binding&&moving.has(binding.nodeId)) {
      const {x,y}=bindingPoint(doc,binding)!
      minX=Math.max(minX,area.x-x);maxX=Math.min(maxX,area.x+area.width-x);minY=Math.max(minY,area.y-y);maxY=Math.min(maxY,area.y+area.height-y)
    }
  }
  const pins=snapshotEdgeWaypoints(doc,e=>moving.has(e.source)&&moving.has(e.target)&&!moving.has(e.manualRoute!.containerId))
  for(const edge of doc.edges)if(pins.has(edge.id)){const area=contentBounds(doc.containers.find(c=>c.id===edge.manualRoute!.containerId)!);for(const point of pins.get(edge.id)!.points){minX=Math.max(minX,area.x-point.x);maxX=Math.min(maxX,area.x+area.width-point.x);minY=Math.max(minY,area.y-point.y);maxY=Math.min(maxY,area.y+area.height-point.y)}}
  dx = clamp(dx, minX, maxX); dy = clamp(dy, minY, maxY)
  if(!dx&&!dy) return
  for(const object of objects) if('path' in object&&object.path) {
    if(object.path.start&&!moving.has(object.path.start.nodeId)) delete object.path.start
    if(object.path.end&&!moving.has(object.path.end.nodeId)) delete object.path.end
  }
  objects.forEach(o => translateSubtree(doc, o, dx, dy,false));reframeEdgeWaypoints(doc,pins,dx,dy)
  syncBindings(doc)
}
export function resizeObject(doc: FigureDocument, id: string, width: number, height: number) {
  id=doc.nodes.find(n=>n.id===id)?.interfaceFor??id
  const object = findObject(doc, id)
  if (!object || !Number.isFinite(width) || !Number.isFinite(height)) return
  const isNode = 'kind' in object, parent = parentOf(doc, id)
  const area = parent ? contentBounds(parent) : { x: 0, y: 0, width: 1000, height: 620 }
  const children = childrenOf(doc, id).filter(o=>!('interfaceFor' in o&&o.interfaceFor===id))
  const units=object.metricScale??1
  const simple = isNode && isPrimitive(object.kind), component=!isNode&&object.role==='component',inset=(component?2:12)*units
  const pins=doc.edges.filter(e=>e.manualRoute?.containerId===id).flatMap(e=>edgeWaypointPoints(doc,e))
  const minWidth = isNode ? simple ? object.kind==='path'?0:units : 80*units : Math.max(component?5*units:200*units, ...children.map(c => c.x + c.width - object.x + inset),...pins.map(p=>p.x-object.x+inset))
  const minHeight = isNode ? simple ? object.kind==='path'?0:units : 44*units : Math.max(component?5*units:120*units, ...children.map(c => c.y + c.height - object.y + inset),...pins.map(p=>p.y-object.y+inset))
  if('path' in object&&object.path) {delete object.path.start;delete object.path.end}
  const oldWidth=object.width,oldHeight=object.height
  object.width = clamp(width, minWidth, Math.min(isNode&&!simple ? 360*units : 1000, area.x + area.width - object.x))
  object.height = clamp(height, minHeight, Math.min(isNode&&!simple ? 180*units : 620, area.y + area.height - object.y))
  if('textLayout' in object&&object.textLayout){const sx=object.width/oldWidth,sy=object.height/oldHeight,m=object.textLayout.matrix;object.textLayout.matrix=[m[0]*sx,m[1]*sy,m[2]*sx,m[3]*sy]}
  syncBindings(doc)
}
function siblingSelection(doc: FigureDocument, ids: string[], min: number) {
  const objects = topLevelSelection(doc, ids)
  if (objects.length < min || objects.some(o => !o.parentId)) throw new Error(`请选择至少 ${min} 个同层对象`)
  const parents = new Set(objects.map(o => 'parentId' in o ? o.parentId : ''))
  if (parents.size !== 1) throw new Error('请先选择同一父容器内的对象')
  return objects as (FigureNode | FigureContainer)[]
}
export function alignObjects(doc: FigureDocument, ids: string[], mode: AlignMode) {
  const objects = siblingSelection(doc, ids, mode.startsWith('distribute') ? 3 : 2)
  const box = bounds(objects)
  if (mode.startsWith('distribute')) {
    const horizontal = mode === 'distribute-x', axis = horizontal ? 'x' : 'y', size = horizontal ? 'width' : 'height'
    const sorted = [...objects].sort((a, b) => a[axis] - b[axis])
    const gap = (box[size] - sorted.reduce((sum, o) => sum + o[size], 0)) / (sorted.length - 1)
    if (gap < 0) throw new Error('所选对象空间重叠，请先拉开距离再等距分布')
    let position = box[axis]
    for (const o of sorted) { translateSubtree(doc, o, horizontal ? position - o.x : 0, horizontal ? 0 : position - o.y); position += o[size] + gap }
    return
  }
  for (const o of objects) {
    let dx = 0, dy = 0
    if (mode === 'left') dx = box.x - o.x
    if (mode === 'right') dx = box.x + box.width - o.x - o.width
    if (mode === 'center') dx = box.x + box.width / 2 - o.x - o.width / 2
    if (mode === 'top') dy = box.y - o.y
    if (mode === 'bottom') dy = box.y + box.height - o.y - o.height
    if (mode === 'middle') dy = box.y + box.height / 2 - o.y - o.height / 2
    translateSubtree(doc, o, dx, dy)
  }
  syncBindings(doc)
}
export function arrangeObjects(doc: FigureDocument, ids: string[], direction: 'row' | 'column') {
  const objects = siblingSelection(doc, ids, 2), parent = parentOf(doc, objects[0]!.id)!
  const area = contentBounds(parent), horizontal = direction === 'row', gap = 24
  const width = horizontal ? objects.reduce((sum, o) => sum + o.width, 0) + gap * (objects.length - 1) : Math.max(...objects.map(o => o.width))
  const height = horizontal ? Math.max(...objects.map(o => o.height)) : objects.reduce((sum, o) => sum + o.height, 0) + gap * (objects.length - 1)
  if (width > area.width || height > area.height) throw new Error('父容器空间不足，请减少对象数量或扩大容器')
  const box = bounds(objects), startX = clamp(box.x + (box.width - width) / 2, area.x, area.x + area.width - width)
  const startY = clamp(box.y + (box.height - height) / 2, area.y, area.y + area.height - height)
  let offset = 0
  for (const o of [...objects].sort((a, b) => horizontal ? a.x - b.x : a.y - b.y)) {
    const x = startX + (horizontal ? offset : (width - o.width) / 2), y = startY + (horizontal ? (height - o.height) / 2 : offset)
    translateSubtree(doc, o, x - o.x, y - o.y); offset += (horizontal ? o.width : o.height) + gap
  }
  syncBindings(doc)
}
export function groupObjects(doc: FigureDocument, ids: string[], groupId: string) {
  if (doc.containers.length >= 21) throw new Error('当前最多支持 20 个子容器')
  const objects = siblingSelection(doc, ids, 1).filter(o=>!('interfaceFor' in o&&o.interfaceFor))
  if(!objects.length)throw new Error('请选择可组合的图元')
  const selected=new Set(objects.flatMap(o=>[o.id,...descendants(doc,o.id).map(n=>n.id)])),pins=snapshotEdgeWaypoints(doc),routePoints=doc.edges.filter(e=>selected.has(e.source)&&selected.has(e.target)).flatMap(e=>edgeWaypointPoints(doc,e))
  const parent = parentOf(doc, objects[0]!.id)!, area = contentBounds(parent), box = bounds([...objects,...routePoints.map(p=>({...p,width:0,height:0}))]),free=objects.every(o=>'kind' in o?isPrimitive(o.kind):o.role==='component')
  const width = Math.max(free?5:200, box.width + (free?4:32)), height = Math.max(free?5:120, box.height + (free?4:72))
  if (width > area.width || height > area.height) throw new Error('分组需要标题和边距空间，请先扩大父容器或调整组件位置')
  const x = clamp(box.x - (free?2:16), area.x, area.x + area.width - width), y = clamp(box.y - (free?2:56), area.y, area.y + area.height - height)
  const group: FigureContainer = { id: groupId, parentId: parent.id, title: '新建分组', role: free?'component':'group', x, y, width, height,...(free?{visual:{fill:'none',stroke:'none'}}:{}) }
  if (!objects.every(o => contains(contentBounds(group), o))) throw new Error('所选对象距离边界过近，请先向内移动后再分组')
  doc.containers.push(group); objects.forEach(o => { o.parentId = groupId });reframeEdgeWaypoints(doc,pins)
}
export function ungroupObject(doc: FigureDocument, id: string) {
  const pins=snapshotEdgeWaypoints(doc)
  const group = doc.containers.find(c => c.id === id)
  if (!group?.parentId) throw new Error('请选择一个子容器')
  if(group.opacity!==undefined&&group.opacity!==1)throw new Error('该组使用整体透明度；请先在属性中设为 100%，再解组')
  const named=doc.nodes.filter(n=>n.interfaceFor===id&&n.socket),namedIds=new Set(named.map(n=>n.id))
  if(doc.edges.some(e=>namedIds.has(e.source)||namedIds.has(e.target)))throw new Error('命名接口仍有连接；请将连线改接内部节点，或先移除接口及其连线，再解组')
  doc.nodes=doc.nodes.filter(n=>!namedIds.has(n.id))
  const children = childrenOf(doc, id)
  let addedFrame=false
  if(group.role==='component') {
    const boundInterface=children.find((o):o is FigureNode=>'kind' in o&&o.kind==='port'&&o.interfaceFor===group.id)
    const needsFrame=!!boundInterface||group.visual?.fill!=='none'||group.visual?.stroke!=='none'
    if(needsFrame&&!boundInterface&&doc.nodes.length>=240) throw new Error('解组需要保留外框，图元数量已达上限')
    const style=resolveStyle(doc,group.id),parentStyle=resolveStyle(doc,group.parentId),local=JSON.stringify(style)!==JSON.stringify(parentStyle)
    if(local)for(const child of children) {
      const theme=resolveStyle(doc,child.id)
      if('kind' in child){
        const resolved=paperNode(child,theme),paint=figurePaint(theme,resolved.visual?.colorIndex),text=nodeTextStyle(resolved,false,theme)
        child.textStyle={...text,...child.textStyle};if(child.description)child.descriptionStyle={family:theme.fontFamily,...child.descriptionStyle}
        child.visual={...resolved.visual,fill:resolved.visual?.fill??(['text','path','icon','image','port'].includes(child.kind)?'none':child.visual?.tone==='hatch'?paint.hatch:paint.fill),stroke:resolved.visual?.stroke??paint.ink}
        if(child.visual.textTone&&!child.textStyle?.color)child.textStyle={...child.textStyle,color:text.color}
      }else child.appearance={designSystem:theme.designSystem,fontRoles:theme.fontRoles,fontFamily:theme.fontFamily,sketchStyle:theme.sketchStyle,roughness:theme.roughness,preset:theme.preset,accent:theme.accent,...(theme.paletteId?{paletteId:theme.paletteId}:{}),...(theme.colorIndex!==undefined?{colorIndex:theme.colorIndex}:{}),...(theme.colorMap?{colorMap:theme.colorMap}:{})}
    }
    const paint=figurePaint(style,group.visual?.colorIndex)
    const visual={...group.visual,handDrawn:false,...(local?{fill:group.visual?.fill??paint.fill,stroke:group.visual?.stroke??paint.ink}:{})}
    if(boundInterface)Object.assign(boundInterface,{kind:'rectangle',label:'',metricScale:group.metricScale,visual,evidence:group.evidence})
    else if(needsFrame){doc.nodes.unshift({id:group.id,kind:'rectangle',label:'',metricScale:group.metricScale,parentId:group.parentId,x:group.x,y:group.y,width:group.width,height:group.height,visual,evidence:group.evidence});addedFrame=true}
  }
  children.forEach(c => { c.parentId = group.parentId })
  for(const child of children) if('interfaceFor' in child) delete child.interfaceFor
  doc.containers = doc.containers.filter(c => c.id !== id)
  reframeEdgeWaypoints(doc,pins);syncBindings(doc)
  return [...(addedFrame?[group.id]:[]),...children.map(c => c.id)]
}
