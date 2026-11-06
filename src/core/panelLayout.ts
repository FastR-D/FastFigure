import {snapshotEdgeWaypoints,reframeEdgeWaypoints} from './edgeWaypoints.ts'
import { clone, parseDocument, type FigureDocument } from './model.ts'
import { allObjects, ancestors, childrenOf, contentBounds, descendants, translateSubtree } from './geometry.ts'
import { scaleSubtree } from './scaling.ts'
import { estimatedTextWidth, nodeTextStyle, resolvedTextStyle } from './typography.ts'

export interface PanelItem { containerId: string; caption: string }
export interface PanelOptions { columns: number; gap: number; margin: number; shrinkToFit: boolean; fontSize: number; start: number; bottomSpace?:number }
export const defaultPanelOptions: PanelOptions = { columns: 2, gap: 24, margin: 12, shrinkToFit: true, fontSize: 16, start: 1, bottomSpace:0 }
export interface PanelLayoutResult {
  document: FigureDocument
  panelIds: string[]
  factor: number
  minimumLabelSize: number | null
  rows: number
  columns: number
}
const overlaps = (a: {x:number;y:number;width:number;height:number}, b: {x:number;y:number;width:number;height:number}) =>
  a.x < b.x + b.width - 1e-6 && a.x + a.width > b.x + 1e-6 && a.y < b.y + b.height - 1e-6 && a.y + a.height > b.y + 1e-6

/** Add editable native panel frames. The original subtrees and their IDs remain intact. */
export function layoutPanels(input: FigureDocument, parentId: string, items: PanelItem[], options: PanelOptions): PanelLayoutResult {
  if (!Number.isFinite(options.bottomSpace??0)||(options.bottomSpace??0)<0||(options.bottomSpace??0)>100)throw new Error('底部图例留白为 0–100')
  if (!Number.isInteger(options.columns) || options.columns < 1 || options.columns > 4 ||
    !Number.isFinite(options.gap) || options.gap < 16 || options.gap > 80 ||
    !Number.isFinite(options.margin) || options.margin < 0 || options.margin > 48 ||
    typeof options.shrinkToFit !== 'boolean' || !Number.isFinite(options.fontSize) || options.fontSize < 12 || options.fontSize > 24 ||
    !Number.isInteger(options.start) || options.start < 1 || options.start + items.length - 1 > 26)
    throw new Error('子图编排参数无效；标号范围为 (a)–(z)')
  if (items.length < 2 || items.length > 8 || new Set(items.map(item => item.containerId)).size !== items.length)
    throw new Error('请选择 2–8 个不同的同层图件容器')
  let doc = parseDocument(clone(input))
  const parent = doc.containers.find(c => c.id === parentId)
  if (!parent || parent.dataChart || parent.reconstruction || parent.structureOrigin)
    throw new Error('请选择图件外层容器，保留图表、重建和结构组件的内部内容')
  const sources = items.map(item => {
    const source = doc.containers.find(c => c.id === item.containerId)
    if (!source || source.parentId !== parentId) throw new Error('每张子图必须是目标容器的直接子容器；请先组合散落图元')
    if (source.role === 'panel') throw new Error('已有子图面板可用“自动布局”重新排列，标号和说明可直接编辑')
    if (typeof item.caption !== 'string' || item.caption.trim().length > 70 || /[\r\n]/.test(item.caption)) throw new Error('子图说明限单行 70 字')
    const members = new Set([source.id, ...descendants(doc, source.id).map(o => o.id)])
    if (doc.containers.some(c => members.has(c.id) && ancestors(doc,c.id).length >= 6)) throw new Error('新增面板将超过六层嵌套，请先整理图件层级')
    for (const node of doc.nodes.filter(n => members.has(n.id)))
      if ([node.path?.start, node.path?.end].some(binding => binding && !members.has(binding.nodeId)))
        throw new Error('子图内部引线绑定了外部图元，请先将跨图引线移到共同外层容器')
    return source
  })
  if (doc.containers.length + items.length > 21) throw new Error('新增子图面板将超过 21 个容器，请减少子图或整理层级')
  const area = contentBounds(parent), columns = Math.min(items.length, options.columns), rows = Math.ceil(items.length / columns)
  const width = (area.width - options.margin * 2 - options.gap * (columns - 1)) / columns
  const availableHeight = (area.height - (options.bottomSpace??0) - options.margin * 2 - options.gap * (rows - 1)) / rows
  if (width < 200 || availableHeight < 120) throw new Error('每个子图面板至少需要 200 × 120；请减少列数、子图数或间距')
  const content = contentBounds({x:0,y:0,width,height:availableHeight,role:'panel'})
  const fit = Math.min(1, ...sources.flatMap(source => [content.width / source.width, content.height / source.height]))
  if (!options.shrinkToFit && fit < 1 - 1e-6) throw new Error('原尺寸图件放不进网格，请启用统一等比缩小或减少子图')
  const factor = options.shrinkToFit ? fit : 1
  if (factor < .1) throw new Error('需要缩小至 10% 以下，请减少子图或调整源图内容')
  // Keep captions next to the artwork instead of stretching a short figure to the full page height.
  const height = Math.max(120,Math.min(availableHeight,Math.max(...sources.map(source=>source.height*factor))+60))
  const startY = area.y + (area.height-(options.bottomSpace??0) - rows*height - (rows-1)*options.gap)/2
  const titles = items.map((item, i) => `(${String.fromCharCode(96 + options.start + i)})${item.caption.trim() ? ` ${item.caption.trim()}` : ''}`)
  if (titles.some(title => estimatedTextWidth(title, options.fontSize) > width - 44)) throw new Error('子图标号与说明超出单行宽度，请缩短说明、减小标号字号或减少列数')
  // Shrink at the original origin first: every intermediate subtree stays within its original parent.
  if (factor < 1) for (const source of sources) doc = scaleSubtree(doc, source.id, factor, 'top-left').document
  const used = new Set([...allObjects(doc), ...doc.edges].map(o => o.id))
  let serial = 1
  function panelId() { while (used.has(`panel-${serial}`)) serial++; const id = `panel-${serial++}`; used.add(id); return id }
  const panelIds: string[] = [], sourceIds = new Set(items.map(item => item.containerId))
  const obstacles = childrenOf(doc, parentId).filter(o => !sourceIds.has(o.id) && !('path' in o && o.path) && !('interfaceFor' in o && o.interfaceFor))
  items.forEach((item, index) => {
    const x = area.x + options.margin + index % columns * (width + options.gap)
    const y = startY + Math.floor(index / columns) * (height + options.gap)
    const id = panelId(), box = { x, y, width, height }
    if (obstacles.some(o => overlaps(o, box))) throw new Error('子图网格与未参与编排的同层对象重叠，请先移动这些对象或将其组合为子图')
    const source = doc.containers.find(c => c.id === item.containerId)!, target = contentBounds({...box,role:'panel'})
    const dx = target.x + (target.width - source.width) / 2 - source.x
    const dy = target.y + (target.height - source.height) / 2 - source.y
    translateSubtree(doc,source,dx,dy)
    source.parentId = id
    doc.containers.push({id,parentId,role:'panel',title:titles[index]!,...box,
      visual:{fill:'none',stroke:'none',handDrawn:false},textStyle:{family:'MiSans',size:options.fontSize,bold:true,align:'left'}})
    panelIds.push(id)
  })
  reframeEdgeWaypoints(doc,snapshotEdgeWaypoints(doc))
  doc = parseDocument(doc)
  const labels: number[] = []
  for (const source of sources) for (const object of [doc.containers.find(c=>c.id===source.id)!, ...descendants(doc, source.id)]) {
    if ('kind' in object) {
      if (object.kind === 'path' || object.kind === 'port') continue
      if (object.label.trim()) labels.push(nodeTextStyle(object).size)
      if (object.description?.trim()) labels.push(nodeTextStyle(object, true).size)
    } else if (object.role !== 'component') labels.push(resolvedTextStyle(object.textStyle, true).size)
  }
  return {document:doc,panelIds,factor,minimumLabelSize:labels.length?Math.min(...labels):null,rows,columns}
}
