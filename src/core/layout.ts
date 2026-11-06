import { clone, parseDocument, type FigureDocument, type Port } from './model'
import { ancestors, childrenOf, layoutContentBounds, findObject, translateSubtree, type FigureObject } from './geometry'

export interface LayoutOptions { mode: 'flow' | 'grid'; direction: 'right' | 'down'; gap: number; columns: number; adjustPorts: boolean; recursive: boolean; fitContainers: boolean }
export interface LayoutLevel { id: string; title: string; width: number; height: number; count: number; gap: number }
export interface ContainerResize { id: string; title: string; before: { width: number; height: number }; after: { width: number; height: number } }
export interface LayoutResult { document: FigureDocument; width: number; height: number; count: number; gap: number; maxGap: number; levels: LayoutLevel[]; resized: ContainerResize[] }
export const defaultLayoutOptions: LayoutOptions = { mode: 'flow', direction: 'right', gap: 32, columns: 2, adjustPorts: true, recursive: false, fitContainers: false }
export class LayoutSpaceError extends Error {
  readonly containerId: string
  readonly requiredWidth: number
  readonly requiredHeight: number
  constructor(containerId: string, title: string, width: number, height: number,units=1) {
    super(`容器「${title}」空间不足，需要至少 ${Math.max(200*units, Math.ceil(width + 24*units))} × ${Math.max(120*units, Math.ceil(height + 60*units))}；请扩大目标容器、减少对象或调整方向 / 网格列数。`)
    this.containerId = containerId; this.requiredWidth = Math.max(200*units, Math.ceil(width + 24*units)); this.requiredHeight = Math.max(120*units, Math.ceil(height + 60*units))
  }
}
const center = (o: FigureObject, horizontal: boolean) => horizontal ? o.y + o.height / 2 : o.x + o.width / 2

/** Collapse feedback cycles before ranking, so residual and recurrent connections cannot deadlock layout. */
function ranks(ids: string[], edges: [string, string][]): Map<string, number> {
  const graph = new Map(ids.map(id => [id, edges.filter(e => e[0] === id).map(e => e[1])]))
  const visited = new Map<string, number>(), low = new Map<string, number>(), stack: string[] = [], active = new Set<string>(), components: string[][] = []
  let next = 0
  function visit(id: string) {
    visited.set(id, next); low.set(id, next++); stack.push(id); active.add(id)
    for (const target of graph.get(id)!) {
      if (!visited.has(target)) { visit(target); low.set(id, Math.min(low.get(id)!, low.get(target)!)) }
      else if (active.has(target)) low.set(id, Math.min(low.get(id)!, visited.get(target)!))
    }
    if (low.get(id) === visited.get(id)) {
      const component: string[] = []; let member: string
      do { member = stack.pop()!; active.delete(member); component.push(member) } while (member !== id)
      components.push(component)
    }
  }
  ids.forEach(id => { if (!visited.has(id)) visit(id) })
  const owner = new Map(components.flatMap((members, i) => members.map(id => [id, i] as const)))
  const outgoing = components.map(() => new Set<number>()), incoming = components.map(() => 0), rank = components.map(() => 0)
  for (const [source, target] of edges) {
    const a = owner.get(source)!, b = owner.get(target)!
    if (a !== b && !outgoing[a]!.has(b)) { outgoing[a]!.add(b); incoming[b]!++ }
  }
  const queue = incoming.flatMap((n, i) => n === 0 ? [i] : [])
  for (const index of queue) for (const target of outgoing[index]!) {
    rank[target] = Math.max(rank[target]!, rank[index]! + 1)
    if (--incoming[target]! === 0) queue.push(target)
  }
  return new Map(ids.map(id => [id, rank[owner.get(id)!]!]))
}
function ports(a: FigureObject, b: FigureObject, horizontal: boolean): [Port, Port] {
  const dx = b.x + b.width / 2 - a.x - a.width / 2, dy = b.y + b.height / 2 - a.y - a.height / 2
  if (horizontal ? Math.abs(dx) >= 1 : Math.abs(dy) < 1) return dx >= 0 ? ['right', 'left'] : ['left', 'right']
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom']
}

/** Arrange a level in a private draft. Fitted children may temporarily exceed ancestors until their turn. */
function layoutLevel(doc: FigureDocument, containerId: string, options: LayoutOptions, fit: boolean): LayoutLevel {
  const parent = doc.containers.find(c => c.id === containerId)!
  const headings=doc.nodes.filter(n=>n.parentId===containerId&&n.titleBlock)
  const objects = childrenOf(doc, containerId).filter(o=>!('interfaceFor' in o&&o.interfaceFor)&&!('titleBlock' in o&&o.titleBlock))
  if(!objects.length)return{id:containerId,title:parent.title,width:0,height:0,count:0,gap:options.gap}
  const layoutArea=()=>layoutContentBounds(doc,parent)
  let area = layoutArea()
  const horizontal = options.direction === 'right'
  const ids = new Set(objects.map(o => o.id))
  const owner = (id: string) => [id, ...ancestors(doc, id)].find(id => ids.has(id))
  const links = [...new Map(doc.edges.flatMap(e => {
    const a = owner(e.source), b = owner(e.target)
    return a && b && a !== b ? [[`${a}:${b}`, [a, b] as [string, string]] as const] : []
  })).values()]
  const groups: FigureObject[][] = []
  if (options.mode === 'grid') {
    const ordered = [...objects].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))
    for (let i = 0; i < ordered.length; i += options.columns) groups.push(ordered.slice(i, i + options.columns))
  } else {
    const rank = ranks(objects.map(o => o.id), links)
    for (const object of objects) (groups[rank.get(object.id)!] ??= []).push(object)
    groups.forEach(group => group.sort((a, b) => center(a, horizontal) - center(b, horizontal) || a.id.localeCompare(b.id)))
    // Alternate forward/backward barycenter sweeps to keep connected neighbors close.
    for (let sweep = 0; sweep < 4; sweep++) {
      const forward = sweep % 2 === 0, indices = groups.map((_, i) => i)
      if (!forward) indices.reverse()
      for (const index of indices) {
        const group = groups[index]!
        const positions = new Map(groups.flatMap(g => g.map((o, i) => [o.id, (i + 0.5) / g.length] as const)))
        const barycenter = (o: FigureObject) => {
          const neighbors = links.flatMap(([a, b]) => forward ? b === o.id && rank.get(a)! < index ? [a] : [] : a === o.id && rank.get(b)! > index ? [b] : [])
          return neighbors.length ? neighbors.reduce((sum, id) => sum + positions.get(id)!, 0) / neighbors.length : positions.get(o.id)!
        }
        const weights = new Map(group.map(o => [o.id, barycenter(o)]))
        group.sort((a, b) => weights.get(a.id)! - weights.get(b.id)!)
      }
    }
  }
  let gap = options.gap, width = 0, height = 0
  function measure() {
    if (options.mode === 'grid') {
      const columns = Math.min(options.columns, objects.length)
      const widths = Array.from({ length: columns }, (_, i) => Math.max(...groups.flatMap(row => row[i] ? [row[i]!.width] : [])))
      const heights = groups.map(row => Math.max(...row.map(o => o.height)))
      width = widths.reduce((sum, v) => sum + v, 0) + gap * (columns - 1)
      height = heights.reduce((sum, v) => sum + v, 0) + gap * (groups.length - 1)
      return { widths, heights }
    }
    const major = groups.map(g => Math.max(...g.map(o => horizontal ? o.width : o.height)))
    const minor = groups.map(g => g.reduce((sum, o) => sum + (horizontal ? o.height : o.width), 0) + gap * (g.length - 1))
    width = horizontal ? major.reduce((sum, v) => sum + v, 0) + gap * (groups.length - 1) : Math.max(...minor)
    height = horizontal ? Math.max(...minor) : major.reduce((sum, v) => sum + v, 0) + gap * (groups.length - 1)
    return { widths: horizontal ? major : minor, heights: horizontal ? minor : major }
  }
  let sizes = measure()
  if (fit) {
    const units=parent.metricScale??1
    const header=Math.max(0,area.y-parent.y)
    parent.width = Math.max(200*units, Math.ceil(width + 24*units),...headings.map(n=>n.x+n.width-parent.x+12*units)); parent.height = Math.max(120*units, Math.ceil(height + header+12*units))
    area = layoutArea()
  } else while ((width > area.width + 0.001 || height > area.height + 0.001) && gap > 16) { gap = Math.max(16, gap - 1); sizes = measure() }
  if (width > area.width + 0.001 || height > area.height + 0.001)
    throw new LayoutSpaceError(containerId, parent.title, width, height,parent.metricScale??1)
  const startX = area.x + (area.width - width) / 2, startY = area.y + (area.height - height) / 2
  const positions = new Map<string, { x: number; y: number }>()
  if (options.mode === 'grid') {
    let y = startY
    groups.forEach((row, r) => {
      let x = startX
      row.forEach((o, c) => { positions.set(o.id, { x: x + (sizes.widths[c]! - o.width) / 2, y: y + (sizes.heights[r]! - o.height) / 2 }); x += sizes.widths[c]! + gap })
      y += sizes.heights[r]! + gap
    })
  } else {
    let major = horizontal ? startX : startY
    groups.forEach((group, i) => {
      const cross = group.reduce((sum, o) => sum + (horizontal ? o.height : o.width), 0) + gap * (group.length - 1)
      let minor = (horizontal ? area.y + area.height / 2 : area.x + area.width / 2) - cross / 2
      group.forEach(o => {
        const majorSize = (horizontal ? sizes.widths : sizes.heights)[i]!, crossSize = horizontal ? o.height : o.width
        positions.set(o.id, horizontal ? { x: major + (majorSize - o.width) / 2, y: minor } : { x: minor, y: major + (majorSize - o.height) / 2 })
        minor += crossSize + gap
      })
      major += (horizontal ? sizes.widths : sizes.heights)[i]! + gap
    })
  }
  for (const o of objects) {
    const position = positions.get(o.id)!, dx = position.x - o.x, dy = position.y - o.y
    translateSubtree(doc,o,dx,dy)
  }
  if (options.adjustPorts) for (const edge of doc.edges) {
    const a = owner(edge.source), b = owner(edge.target)
    if (a && b && a !== b){const sides=ports(findObject(doc,edge.source)!,findObject(doc,edge.target)!,options.mode==='grid'?true:horizontal);if(!doc.nodes.find(n=>n.id===edge.source)?.socket)edge.sourcePort=sides[0];if(!doc.nodes.find(n=>n.id===edge.target)?.socket)edge.targetPort=sides[1]}
  }
  return { id: parent.id, title: parent.title, count: objects.length, width, height, gap }
}

export function layoutContainer(input: FigureDocument, containerId: string, options: LayoutOptions): LayoutResult {
  if (!['flow', 'grid'].includes(options.mode) || !['right', 'down'].includes(options.direction) || !Number.isFinite(options.gap) || options.gap < 16 || options.gap > 80 || !Number.isInteger(options.columns) || options.columns < 1 || options.columns > 10
    || typeof options.adjustPorts !== 'boolean' || typeof options.recursive !== 'boolean' || typeof options.fitContainers !== 'boolean' || options.fitContainers && !options.recursive)
    throw new Error('布局参数无效')
  if (!input.containers.some(c => c.id === containerId)) throw new Error('请选择一个有效容器')
  if(input.containers.find(c=>c.id===containerId)?.role==='component') throw new Error('自由图元组合保留内部几何，可移动内部图元或先解组后排列')
  if (!childrenOf(input, containerId).length) throw new Error('容器中没有可排列的对象')
  input = parseDocument(input)
  // Postorder avoids validating partially resized ancestors. Every attempt starts from the untouched input.
  const order: string[] = []
  function visit(id: string) {
    if (options.recursive) for (const child of input.containers.filter(c => c.parentId === id&&c.role!=='component')) visit(child.id)
    if (childrenOf(input, id).length) order.push(id)
  }
  visit(containerId)
  for (let gap = options.gap; ; gap = Math.max(16, gap - 1)) {
    const doc = clone(input), levels: LayoutLevel[] = []
    try {
      for (const id of order) levels.push(layoutLevel(doc, id, { ...options, gap }, options.fitContainers && id !== containerId))
      const resized = doc.containers.flatMap(c => {
        const previous = input.containers.find(old => old.id === c.id)!
        return previous.width === c.width && previous.height === c.height ? [] : [{ id: c.id, title: c.title, before: { width: previous.width, height: previous.height }, after: { width: c.width, height: c.height } }]
      })
      const target = levels.at(-1)!
      return { document: parseDocument(doc), width: target.width, height: target.height, count: levels.reduce((n, level) => n + level.count, 0),
        gap: Math.min(...levels.map(l => l.gap)), maxGap: Math.max(...levels.map(l => l.gap)), levels, resized }
    } catch (error) {
      // An outer fit may require compacting several inner levels; retry the whole subtree at a smaller gap.
      if (!(error instanceof LayoutSpaceError) || !options.fitContainers || gap === 16) throw error
    }
  }
}
