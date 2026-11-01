import {routeEdge} from './routing.ts'
import {snapshotEdgeWaypoints,reframeEdgeWaypoints} from './edgeWaypoints.ts'
import { referenceUseSource } from './referenceInputs.ts'
import {mergeImageDrafts} from './imageDraftContract.ts'
import {mergeStyleUses} from './styleAsset.ts'
import { z } from 'zod'
import { clone, isPrimitive, componentAncestorSchema, componentRecipeSchema, componentSourceSchema, figureDocumentSchema, parseDocument, rootContainer, type ComponentSource, type FigureDocument } from './model.ts'
import { scaleSubtree } from './scaling.ts'
import { syncBindings } from './paths.ts'
import { ancestors, childrenOf, contains, contentBounds, descendants, bounds, resolveStyle, translateGeometry, type Rect } from './geometry.ts'

export const componentAssetSchema = z.object({
  format: z.literal('fastfigure.component'), version: z.literal(1),
  id: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().trim().min(1).max(100), description: z.string().trim().max(300),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).transform(tags => [...new Set(tags)]),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  sources: z.array(componentSourceSchema).max(12), lineage: z.array(componentAncestorSchema).max(16),
  recipe: componentRecipeSchema.optional(), figure: figureDocumentSchema,
}).superRefine((asset, ctx) => {
  const root = rootContainer(asset.figure)
  if (root.x !== 0 || root.y !== 0 || root.appearance || root.component)
    ctx.addIssue({ code: 'custom', message: '组件根必须位于原点并使用组件主题' })
  if (!asset.figure.nodes.some(n=>n.kind!=='port')) ctx.addIssue({ code: 'custom', message: '组件至少包含一个可见图元' })
  if (asset.figure.references.length) ctx.addIssue({ code: 'custom', message: '组件只保留重绘对象与来源记录，不携带参考图片' })
})
export type ComponentAsset = z.infer<typeof componentAssetSchema>
export const parseAsset = (value: unknown) => componentAssetSchema.parse(value)
const unique = <T>(values: T[]) => [...new Map(values.map(v => [JSON.stringify(v), v])).values()]
function mergeSources(values: ComponentSource[]): ComponentSource[] {
  const sources = new Map<string, ComponentSource>()
  for (const value of values) {
    const key = JSON.stringify([value.title, value.reference, value.image?.sha256,value.file?.sha256,value.file?.page?.index,value.file?.page?.id,value.purpose,value.generated?.runId,value.collection?.figureSha256,value.collection?.selectionSha256,value.collection?.capturedAt,value.collection?.runId]), existing = sources.get(key)
    if (!existing) { sources.set(key, clone(value)); continue }
    if(existing.file&&existing.file.objectId!==value.file?.objectId)delete existing.file.objectId
    if (existing.image && value.image) {
      const a = existing.image.region, b = value.image.region, x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
      existing.image.region = { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y }
    }
  }
  return [...sources.values()]
}

/** Capture only the selected container subtree; external edges stay in the project. */
export function captureComponent(doc: FigureDocument, containerId: string, name: string, description = '', tags: string[] = []): ComponentAsset {
  const container = doc.containers.find(c => c.id === containerId)
  if (!container) throw new Error('请先选择一个容器；可先将多个对象组合')
  const selected = [container, ...descendants(doc, containerId)], ids = new Set(selected.map(o => o.id))
  const pinsOutside=doc.edges.filter(e=>e.manualRoute&&ids.has(e.source)&&ids.has(e.target)).flatMap(e=>routeEdge(doc,e).points).filter(p=>p.x<container.x-1e-7||p.x>container.x+container.width+1e-7||p.y<container.y-1e-7||p.y>container.y+container.height+1e-7)
  if(pinsOutside.length){
    if(!container.parentId)throw new Error('根画板外还有指定连线折点，请先扩大根画板或调整折点后采集')
    const copy=clone(doc),root=copy.containers.find(c=>c.id===containerId)!,parent=copy.containers.find(c=>c.id===root.parentId)!,padding=2*(root.metricScale??1),box=bounds([root,...pinsOutside.map(p=>({...p,width:0,height:0}))]),wrapperId=`capture-route-${crypto.randomUUID()}`,saved=snapshotEdgeWaypoints(copy)
    const wrapper={id:wrapperId,parentId:root.parentId,role:'component' as const,title:name,x:box.x-padding,y:box.y-padding,width:box.width+padding*2,height:box.height+padding*2,metricScale:root.metricScale,visual:{fill:'none',stroke:'none'}}
    if(!contains(contentBounds(parent),wrapper))throw new Error('外侧连线折点距父容器边界过近，请留出采集边距后重试')
    root.parentId=wrapperId;copy.containers.unshift(wrapper);reframeEdgeWaypoints(copy,saved)
    return captureComponent(copy,wrapperId,name,description,tags)
  }
  const parentIds=new Set(ancestors(doc,containerId)),provenance=[...selected,...doc.containers.filter(c=>parentIds.has(c.id))]
  const origins = provenance.flatMap(o => 'component' in o && o.component ? [o.component] : [])
  const sources = mergeSources([...origins.flatMap(o => o.sources), ...provenance.flatMap(o => o.evidence ? [o.evidence] : []),...(doc.referenceUses??[]).map(referenceUseSource)])
  const lineage = unique(origins.flatMap(o => [...o.lineage, { assetId: o.assetId, name: o.name, revision: o.revision, ...(o.recipe ? { recipe: o.recipe } : {}) }]))
  if (sources.length > 12 || lineage.length > 16) throw new Error('来源记录过多，请拆分为较小的组件再保存')
  const figure = clone(doc),pins=snapshotEdgeWaypoints(doc)
  syncBindings(figure)
  figure.references = []
  delete figure.publication
  figure.title = name.trim(); figure.style = resolveStyle(doc, containerId)
  figure.containers = figure.containers.filter(c => ids.has(c.id))
  figure.nodes = figure.nodes.filter(n => ids.has(n.id))
  for(const node of figure.nodes) {
    if(node.interfaceFor===containerId) node.interfaceFor='stage'
    if(node.path?.start&&!ids.has(node.path.start.nodeId)) delete node.path.start
    if(node.path?.end&&!ids.has(node.path.end.nodeId)) delete node.path.end
  }
  figure.edges = figure.edges.filter(e => ids.has(e.source) && ids.has(e.target))
  for (const object of [...figure.containers, ...figure.nodes]) {
    translateGeometry(object,-container.x,-container.y)
    if (object.parentId === containerId) object.parentId = 'stage'
  }
  for(const c of figure.containers)if(c.sharedColorbar){if(c.sharedColorbar.chartIds.some(id=>!ids.has(id)))delete c.sharedColorbar;else c.sharedColorbar.chartIds=c.sharedColorbar.chartIds.map(id=>id===containerId?'stage':id)}
  for(const c of figure.containers)if(c.sharedLegend){if(c.sharedLegend.chartIds.some(id=>!ids.has(id)))delete c.sharedLegend;else{c.sharedLegend.chartIds=c.sharedLegend.chartIds.map(id=>id===containerId?'stage':id)}}
  const root = figure.containers.find(c => c.id === containerId)!
  for(const owner of figure.containers)if(owner.parametric)for(const alias of Object.keys(owner.parametric.objects))if(owner.parametric.objects[alias]===containerId)owner.parametric.objects[alias]='stage'
  root.id = 'stage'; root.parentId = null; root.title = name.trim()
  reframeEdgeWaypoints(figure,pins,-container.x,-container.y)
  delete root.appearance; delete root.component
  const now = new Date().toISOString()
  return parseAsset({ format: 'fastfigure.component', version: 1, id: `asset-${crypto.randomUUID()}`, name, description, tags,
    createdAt: now, updatedAt: now, sources, lineage, figure })
}

export function componentPosition(doc: FigureDocument, parentId: string, size: Pick<Rect, 'width' | 'height'>): Rect | undefined {
  const parent = doc.containers.find(c => c.id === parentId)
  if (!parent) throw new Error('目标容器不存在')
  const area = contentBounds(parent), siblings = childrenOf(doc, parentId), gap = 16
  // Rectangle packing candidates come from actual obstacle boundaries, not a grid that can miss a narrow valid slot.
  const xs = [...new Set([area.x, ...siblings.map(o => o.x + o.width + gap)])].sort((a, b) => a - b)
  const ys = [...new Set([area.y, ...siblings.map(o => o.y + o.height + gap)])].sort((a, b) => a - b)
  for (const y of ys) for (const x of xs) {
    const rect = { x, y, width: size.width, height: size.height }
    if (contains(area, rect) && !siblings.some(o => x < o.x + o.width + gap && x + size.width + gap > o.x && y < o.y + o.height + gap && y + size.height + gap > o.y)) return rect
  }
}

/** Create a complete candidate first; failure cannot partially mutate the source document. */
export function instantiateComponent(doc: FigureDocument, input: ComponentAsset, parentId: string, keepAppearance = true,
  makeId: () => string = () => `c-${crypto.randomUUID()}`): { document: FigureDocument; containerId: string } {
  const asset = parseAsset(input), source = asset.figure, assetRoot = rootContainer(source)
  if (doc.nodes.length + source.nodes.length > 240) throw new Error('插入后超过 240 个图元，请拆分图件')
  if([...doc.nodes,...source.nodes].filter(n=>!isPrimitive(n.kind)).length>60) throw new Error('插入后超过 60 个科研节点，请拆分图件')
  if (doc.edges.length + source.edges.length > 120) throw new Error('插入后超过 120 条连接，请拆分图件')
  if (doc.containers.length + source.containers.length > 21) throw new Error('插入后超过 20 个子容器，请拆分图件')
  const position = componentPosition(doc, parentId, assetRoot)
  if (!position) throw new Error('目标容器没有足够空位；可扩大容器，或新建图件并插入')
  const candidate = clone(doc)
  const inserted = transplant(candidate, asset, position, parentId, keepAppearance, makeId)
  return { document: parseDocument(candidate), ...inserted }
}

/** Place a planned instance exactly, returning source-node aliases for external connections. */
export function instantiateComponentAt(doc: FigureDocument, input: ComponentAsset, parentId: string, position: Pick<Rect, 'x' | 'y'>, instanceId: string, keepAppearance = false,ignoredCollisions:ReadonlySet<string>=new Set()) {
  const asset = parseAsset(input), parent = doc.containers.find(c => c.id === parentId)
  if (!parent) throw new Error('目标容器不存在')
  if (!/^[a-zA-Z0-9_-]{1,30}$/.test(instanceId)) throw new Error('组件实例 ID 无效')
  const ids = new Set([...doc.containers, ...doc.nodes, ...doc.edges].map(o => o.id))
  if (ids.has(instanceId)) throw new Error(`组件实例 ID 已使用：${instanceId}`)
  const rect = { ...position, width: rootContainer(asset.figure).width, height: rootContainer(asset.figure).height }
  if (!contains(contentBounds(parent), rect)) throw new Error(`组件「${asset.name}」需要 ${rect.width} × ${rect.height}，超出目标容器内容区`)
  if (childrenOf(doc, parentId).some(o => !ignoredCollisions.has(o.id)&&rect.x < o.x + o.width && rect.x + rect.width > o.x && rect.y < o.y + o.height && rect.y + rect.height > o.y)) throw new Error(`组件「${asset.name}」与同层对象重叠，请调整位置`)
  const candidate = clone(doc)
  let index = 0
  const inserted = transplant(candidate, asset, position, parentId, keepAppearance, () => {
    if (index++ === 0) return instanceId
    const id = `${instanceId}-object-${index}`
    if (ids.has(id)) throw new Error(`组件展开后的 ID 已使用：${id}`)
    return id
  })
  return { document: parseDocument(candidate), ...inserted }
}

/** A new figure uses the component itself as its root, so even a full-canvas asset is reusable. */
export function componentDocument(input: ComponentAsset, keepAppearance = true, theme?: FigureDocument['style']): FigureDocument {
  const asset = parseAsset(input), root = rootContainer(asset.figure), candidate = clone(asset.figure)
  candidate.references = []
  delete candidate.publication
  candidate.title = asset.name; candidate.containers = []; candidate.nodes = []; candidate.edges = []
  if (!keepAppearance && theme) candidate.style = clone(theme)
  const x = (candidate.canvas.width - root.width) / 2
  const y = root.height <= candidate.canvas.height - 90 ? 90 : (candidate.canvas.height - root.height) / 2
  transplant(candidate, asset, { x, y }, null, keepAppearance, () => `c-${crypto.randomUUID()}`)
  return parseDocument(candidate)
}

function transplant(candidate: FigureDocument, asset: ComponentAsset, position: Pick<Rect, 'x' | 'y'>, parentId: string | null, keepAppearance: boolean, makeId: () => string) {
  const source = asset.figure, elements = [...source.containers, ...source.nodes, ...source.edges]
  // Root first: exact placement reserves instanceId for the root regardless of input array order.
  const map = new Map<string, string>([['stage', parentId === null ? 'stage' : makeId()]])
  for (const object of elements) if (object.id !== 'stage') map.set(object.id, makeId())
  const containers = source.containers.map(c => {
    const copy = clone(c)
    copy.id = map.get(c.id)!; copy.parentId = c.parentId ? map.get(c.parentId)! : parentId
    if(copy.sharedColorbar){copy.sharedColorbar.chartIds=copy.sharedColorbar.chartIds.map(id=>map.get(id)??id);for(const part of copy.sharedColorbar.parts)part.nodeId=map.get(part.nodeId)??part.nodeId}
    if(copy.sharedLegend){copy.sharedLegend.chartIds=copy.sharedLegend.chartIds.map(id=>map.get(id)??id);for(const entry of copy.sharedLegend.entries){entry.markId=map.get(entry.markId)??entry.markId;entry.labelId=map.get(entry.labelId)??entry.labelId}}
    if(copy.parametric)for(const alias of Object.keys(copy.parametric.objects))copy.parametric.objects[alias]=map.get(copy.parametric.objects[alias]!)??copy.parametric.objects[alias]!
    translateGeometry(copy,position.x,position.y)
    if (!keepAppearance) delete copy.appearance
    return copy
  })
  const root = containers.find(c => c.id === map.get('stage'))!
  root.role = parentId === null ? root.role==='component'?'component':'stage' : root.role === 'stage' ? 'group' : root.role
  if (keepAppearance && parentId !== null) root.appearance = { fontFamily:source.style.fontFamily,sketchStyle:source.style.sketchStyle,roughness:source.style.roughness,preset: source.style.preset, accent: source.style.accent, ...(source.style.paletteId ? {paletteId:source.style.paletteId} : {}),colorIndex:source.style.colorIndex??0,colorMap:clone(source.style.colorMap??[]) }
  root.component = { assetId: asset.id, name: asset.name, revision: asset.updatedAt, sources: clone(asset.sources), lineage: clone(asset.lineage), ...(asset.recipe ? { recipe: clone(asset.recipe) } : {}) }
  candidate.containers.push(...containers)
  candidate.nodes.push(...source.nodes.map(n => {
    const copy={...clone(n),id:map.get(n.id)!,parentId:map.get(n.parentId)!,x:n.x+position.x,y:n.y+position.y}
    if(copy.interfaceFor) copy.interfaceFor=map.get(copy.interfaceFor)!
    for(const binding of [copy.path?.start,copy.path?.end]) if(binding) binding.nodeId=map.get(binding.nodeId)!
    return copy
  }))
  candidate.edges.push(...source.edges.map(e => ({ ...e, id: map.get(e.id)!, source: map.get(e.source)!, target: map.get(e.target)!,...(e.manualRoute?{manualRoute:{...clone(e.manualRoute),containerId:map.get(e.manualRoute.containerId)!}}:{}) })))
  reframeEdgeWaypoints(candidate,snapshotEdgeWaypoints(candidate,e=>source.edges.some(old=>map.get(old.id)===e.id)))
  candidate.imageDrafts=mergeImageDrafts(candidate.imageDrafts,source.imageDrafts??[])
  for(const use of source.styleUses??[])candidate.styleUses=mergeStyleUses(candidate.styleUses,use)
  return { containerId: root.id, nodeIds: Object.fromEntries(source.nodes.map(n => [n.id, map.get(n.id)!])) }
}

export function importComponentText(text: string): ComponentAsset {
  if (text.length > 2_000_000) throw new Error('组件文件不能超过 2 MB')
  return parseAsset(JSON.parse(text))
}

/** A scale is an instance transform; the saved source revision and its provenance remain intact. */
export function scaleComponent(input:ComponentAsset,factor:number) {
  const asset=clone(parseAsset(input));if(factor===1)return asset
  asset.figure=scaleSubtree(asset.figure,'stage',factor,'top-left').document
  return parseAsset(asset)
}
