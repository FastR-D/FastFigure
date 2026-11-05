import {edgeWaypointPoints,orthogonalThroughPoints} from './edgeWaypoints.ts'
import { anchor, type FigureDocument, type FigureEdge, type Port } from './model.ts'
import { ancestors, commonContainer, contentBounds, type Rect } from './geometry.ts'

export interface Point { x: number; y: number }
export interface EdgeRoute { points: Point[]; status: 'clear' | 'blocked'; reason?: string }
export type FigureRoutes = Map<string, EdgeRoute>
export interface StrokeBarrier { a:Point; b:Point }
/** Crossing or overlapping ink; contact at a shared endpoint remains allowed. */
export function segmentsCross(a:Point,b:Point,c:Point,d:Point){
  const cross=(a:Point,b:Point)=>a.x*b.y-a.y*b.x,r={x:b.x-a.x,y:b.y-a.y},s={x:d.x-c.x,y:d.y-c.y},q={x:c.x-a.x,y:c.y-a.y},det=cross(r,s)
  if(Math.abs(det)>1e-8){const t=cross(q,s)/det,u=cross(q,r)/det;return t>1e-5&&t<1-1e-5&&u>1e-5&&u<1-1e-5}
  if(Math.abs(cross(q,r))>1e-8)return false
  const length=r.x*r.x+r.y*r.y;if(length<1e-8)return false
  const first=(q.x*r.x+q.y*r.y)/length,last=first+(s.x*r.x+s.y*r.y)/length
  return Math.min(1,Math.max(first,last))-Math.max(0,Math.min(first,last))>1e-5
}
interface Obstacle extends Rect { id: string }
const clearance = 8, bendCost = 18, epsilon = 0.00001
const directions: Record<Port, number> = { right: 0, bottom: 1, left: 2, top: 3 }
const vectors = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const
const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < epsilon && Math.abs(a.y - b.y) < epsilon
const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
const inside = (p: Point, r: Rect) => p.x > r.x + epsilon && p.x < r.x + r.width - epsilon && p.y > r.y + epsilon && p.y < r.y + r.height - epsilon
const inArea = (p: Point, r: Rect) => p.x >= r.x - epsilon && p.y >= r.y - epsilon && p.x <= r.x + r.width + epsilon && p.y <= r.y + r.height + epsilon
const expand = (r: Rect, id: string,padding=clearance): Obstacle => ({ id, x: r.x - padding, y: r.y - padding, width: r.width + padding * 2, height: r.height + padding * 2 })

export function segmentHitsRect(a: Point, b: Point, r: Rect): boolean {
  if (Math.abs(a.y - b.y) < epsilon) return a.y > r.y + epsilon && a.y < r.y + r.height - epsilon && Math.max(a.x, b.x) > r.x + epsilon && Math.min(a.x, b.x) < r.x + r.width - epsilon
  if (Math.abs(a.x - b.x) < epsilon) return a.x > r.x + epsilon && a.x < r.x + r.width - epsilon && Math.max(a.y, b.y) > r.y + epsilon && Math.min(a.y, b.y) < r.y + r.height - epsilon
  // Intersect a diagonal segment with the open rectangle. A corner touch or a
  // segment along the boundary does not enter its interior.
  let enter=0,leave=1
  for(const [axis,size]of [['x','width'],['y','height']] as const){
    const delta=b[axis]-a[axis],min=r[axis]+epsilon,max=r[axis]+r[size]-epsilon
    if(min>=max)return false
    if(Math.abs(delta)<epsilon){if(a[axis]<=min||a[axis]>=max)return false;continue}
    const first=(min-a[axis])/delta,last=(max-a[axis])/delta
    enter=Math.max(enter,Math.min(first,last));leave=Math.min(leave,Math.max(first,last))
    if(leave<=enter)return false
  }
  return leave>enter
}
export function simplifyPoints(input: Point[]): Point[] {
  const points: Point[] = []
  for (const p of input) {
    if (points.length && same(points.at(-1)!, p)) continue
    points.push(p)
    while (points.length >= 3) {
      const [a, b, c] = points.slice(-3) as [Point, Point, Point]
      const forward = (Math.abs(a.x - b.x) < epsilon && Math.abs(b.x - c.x) < epsilon && (b.y - a.y) * (c.y - b.y) >= 0)
        || (Math.abs(a.y - b.y) < epsilon && Math.abs(b.y - c.y) < epsilon && (b.x - a.x) * (c.x - b.x) >= 0)
      if (!forward) break
      points.splice(points.length - 2, 1)
    }
  }
  return points
}
const direction = (a: Point, b: Point) => Math.abs(a.y - b.y) < epsilon ? b.x > a.x ? 0 : 2 : b.y > a.y ? 1 : 3
export function routeCost(points: Point[]) {
  let result = 0
  for (let i = 1; i < points.length; i++) {
    result += distance(points[i - 1]!, points[i]!)
    if (i > 1 && direction(points[i - 2]!, points[i - 1]!) !== direction(points[i - 1]!, points[i]!)) result += bendCost
  }
  return result
}
function noReversals(points: Point[]) {
  for (let i = 2; i < points.length; i++) if ((direction(points[i - 2]!, points[i - 1]!) + 2) % 4 === direction(points[i - 1]!, points[i]!)) return false
  return true
}

/** A deterministic A* over obstacle/terminal coordinates. Direction is part of the state to charge bends. */
function search(start: Point, target: Point, from: number, to: number, obstacles: Obstacle[], area: Rect,barriers:StrokeBarrier[]=[]): Point[] | undefined {
  if (same(start, target)) return [start]
  const coordinates = (axis: 'x' | 'y', size: 'width' | 'height') => [...new Set([
    area[axis], area[axis] + area[size], start[axis], target[axis],
    ...obstacles.flatMap(o => [o[axis], o[axis] + o[size]]),
    ...barriers.flatMap(s=>[Math.min(s.a[axis],s.b[axis])-clearance,Math.max(s.a[axis],s.b[axis])+clearance]),
  ])].filter(v => v >= area[axis] - epsilon && v <= area[axis] + area[size] + epsilon).sort((a, b) => a - b)
  const xs = coordinates('x', 'width'), ys = coordinates('y', 'height'), cols = xs.length, rows = ys.length
  const startIndex = ys.indexOf(start.y) * cols + xs.indexOf(start.x), targetIndex = ys.indexOf(target.y) * cols + xs.indexOf(target.x)
  const point = (index: number): Point => ({ x: xs[index % cols]!, y: ys[Math.floor(index / cols)]! })
  const key = (index: number, dir: number) => index * 4 + dir
  const initial = key(startIndex, from), costs = new Map([[initial, 0]]), previous = new Map<number, number>()
  const validity = new Map<number, boolean>(), segments = new Map<string, boolean>()
  function valid(index: number) {
    if (!validity.has(index)) validity.set(index, !obstacles.some(o => inside(point(index), o)))
    return validity.get(index)!
  }
  function visible(a: number, b: number) {
    const id = `${Math.min(a, b)}-${Math.max(a, b)}`
    if (!segments.has(id)) segments.set(id, !obstacles.some(o => segmentHitsRect(point(a), point(b), o))&&!barriers.some(s=>segmentsCross(point(a),point(b),s.a,s.b)))
    return segments.get(id)!
  }
  interface Entry { key: number; score: number; value: number; order: number }
  const heap: Entry[] = []; let order = 0
  const before = (a: Entry, b: Entry) => a.score < b.score || (a.score === b.score && a.order < b.order)
  function push(entry: Entry) {
    heap.push(entry); let i = heap.length - 1
    while (i > 0) { const parent = Math.floor((i - 1) / 2); if (!before(heap[i]!, heap[parent]!)) break; [heap[i], heap[parent]] = [heap[parent]!, heap[i]!]; i = parent }
  }
  function pop() {
    const result = heap[0]!, last = heap.pop()!
    if (heap.length) {
      heap[0] = last; let i = 0
      while (true) {
        const left = i * 2 + 1, right = left + 1
        let next = i
        if (left < heap.length && before(heap[left]!, heap[next]!)) next = left
        if (right < heap.length && before(heap[right]!, heap[next]!)) next = right
        if (next === i) break
        [heap[i], heap[next]] = [heap[next]!, heap[i]!]; i = next
      }
    }
    return result
  }
  push({ key: initial, score: distance(start, target), value: 0, order: order++ })
  let visited = 0
  while (heap.length && visited++ < 30000) {
    const entry = pop()
    if (entry.value !== costs.get(entry.key)) continue
    const index = Math.floor(entry.key / 4), dir = entry.key % 4
    if (index === targetIndex && dir !== to) {
      const points: Point[] = []; let state: number | undefined = entry.key
      while (state !== undefined) { points.push(point(Math.floor(state / 4))); state = previous.get(state) }
      return points.reverse()
    }
    const x = index % cols, y = Math.floor(index / cols)
    const neighbors = [x < cols - 1 ? index + 1 : -1, y < rows - 1 ? index + cols : -1, x > 0 ? index - 1 : -1, y > 0 ? index - cols : -1]
    for (let d = 0; d < 4; d++) {
      const next = neighbors[d]!
      if (next < 0 || d === (dir + 2) % 4 || !valid(next) || !visible(index, next) || (next === targetIndex && d === to)) continue
      const value = entry.value + distance(point(index), point(next)) + (d !== dir ? bendCost : 0) + (next === targetIndex && d !== (to + 2) % 4 ? bendCost : 0)
      const state = key(next, d)
      if (value >= (costs.get(state) ?? Infinity)) continue
      costs.set(state, value); previous.set(state, entry.key)
      push({ key: state, value, score: value + distance(point(next), target), order: order++ })
    }
  }
}

function lead(anchor: Point, dir: number, own: Obstacle, obstacles: Obstacle[], area: Rect, maxLength = Infinity,extra=10): Point | undefined {
  const horizontal = dir % 2 === 0, positive = dir === 0 || dir === 1, axis = horizontal ? 'x' : 'y', size = horizontal ? 'width' : 'height'
  const other = horizontal ? 'y' : 'x', otherSize = horizontal ? 'height' : 'width'
  const required = Math.max(0,positive ? own[axis] + own[size] - anchor[axis] : anchor[axis] - own[axis])
  let length = Math.min(required + extra, maxLength, positive ? area[axis] + area[size] - anchor[axis] : anchor[axis] - area[axis])
  for (const o of obstacles) {
    if (o.id === own.id || anchor[other] <= o[other] + epsilon || anchor[other] >= o[other] + o[otherSize] - epsilon) continue
    if (inside(anchor, o)) return
    const gap = positive ? o[axis] - anchor[axis] : anchor[axis] - o[axis] - o[size]
    if (gap >= -epsilon) length = Math.min(length, Math.max(0, gap))
  }
  if (length < required - epsilon) return
  const [dx, dy] = vectors[dir]!
  return { x: anchor.x + dx * length, y: anchor.y + dy * length }
}

export function routeEdge(doc: FigureDocument, edge: FigureEdge, fixed?:{source:Point;target:Point;area?:Rect;barriers?:StrokeBarrier[]}): EdgeRoute {
  const barriers=fixed?.barriers??[],crosses=(a:Point,b:Point)=>barriers.some(s=>segmentsCross(a,b,s.a,s.b))
  const source = doc.nodes.find(n => n.id === edge.source)!, target = doc.nodes.find(n => n.id === edge.target)!
  const [sx, sy] = fixed?[fixed.source.x,fixed.source.y]:anchor(source, edge.sourcePort), [tx, ty] = fixed?[fixed.target.x,fixed.target.y]:anchor(target, edge.targetPort)
  const start = fixed?.source??{ x: sx, y: sy }, end = fixed?.target??{ x: tx, y: ty }, from = directions[edge.sourcePort], to = directions[edge.targetPort]
  const permitted = new Set([...ancestors(doc, source.id), ...ancestors(doc, target.id)])
  // An exposed interface represents its entire component. Collapse its hidden proxies and
  // internal geometry so another interface on the same boundary is not a false obstacle.
  const owners=new Set([source.interfaceFor,target.interfaceFor].filter((id):id is string=>!!id))
  const endpointId=(node:typeof source)=>node.interfaceFor?`interface:${node.interfaceFor}`:`node:${node.id}`
  // Inset labels and divider strokes belong to a terminal's visible body. Their
  // clearance must not block departure from that body's boundary. Keep partial
  // overlaps and annotations in other groups as real obstacles.
  const insetDecoration=(node:typeof source)=>[source,target].some(endpoint=>
    !endpoint.interfaceFor&&!['text','path','port'].includes(endpoint.kind)
    &&(node.kind==='text'||node.kind==='path'||node.kind==='rectangle'&&!node.label&&!node.description&&!node.structure
      &&!doc.edges.some(e=>e.source===node.id||e.target===node.id)
      &&(node.height<=2*(node.metricScale??1)&&node.width>=endpoint.width*.8||node.width<=2*(node.metricScale??1)&&node.height>=endpoint.height*.8))&&node.parentId===endpoint.parentId
    &&node.x>=endpoint.x-epsilon&&node.y>=endpoint.y-epsilon
    &&node.x+node.width<=endpoint.x+endpoint.width+epsilon
    &&node.y+node.height<=endpoint.y+endpoint.height+epsilon)
  const obstacle=(r:typeof source|FigureDocument['containers'][number],id:string)=>expand(r,id,edge.routing==='straight'?Math.max(.75*(r.metricScale??1),(r.visual?.strokeWidth??1.3*(r.metricScale??1))/2):edge.routing==='manual'?clearance*(edge.metricScale??1):clearance)
  const all:Obstacle[]=[
    // An unfilled open stroke has no opaque rectangular body. In particular a
    // long callout must not turn its empty bounding box into a false wall.
    ...doc.nodes.filter(n=>(n.kind!=='path'||n.path?.points.some(p=>p.close)||!!n.visual?.fill&&n.visual.fill!=='none')&&!n.interfaceFor&&!insetDecoration(n)&&(!owners.size||!ancestors(doc,n.id).some(id=>owners.has(id)))).map(n=>obstacle(n,`node:${n.id}`)),
    ...doc.containers.filter(c=>(!permitted.has(c.id)||c.role!=='component')&&(!owners.size||!ancestors(doc,c.id).some(id=>owners.has(id)))).map(c=>obstacle(permitted.has(c.id)?{...c,height:44*(c.metricScale??1)}:c,`container:${c.id}`)),
    obstacle(source,endpointId(source)),obstacle(target,endpointId(target)),
  ]
  const obstacles=[...new Map(all.map(o=>[o.id,o])).values()]
  const owner = doc.containers.find(c => c.id === commonContainer(doc, source.id, target.id))!, area = fixed?.area??contentBounds(owner)
  const sourceBox = obstacles.find(o=>o.id===endpointId(source))!,targetBox=obstacles.find(o=>o.id===endpointId(target))!
  if(edge.routing==='straight'){
    const points=[start,end],outward=(dir:number,a:Point,b:Point)=>(b.x-a.x)*vectors[dir]![0]+(b.y-a.y)*vectors[dir]![1]>epsilon
    if(!outward(from,start,end)||!outward(to,end,start))return{points,status:'blocked',reason:'直线未朝端口外侧连接，请调整端口、移动对象或切换折线避障。'}
    if(!inArea(start,area)||!inArea(end,area))return{points,status:'blocked',reason:'直线超出共同容器的内容区域，请调整布局。'}
    if(crosses(start,end)||obstacles.some(o=>o.id!==sourceBox.id&&o.id!==targetBox.id&&segmentHitsRect(start,end,o)))return{points,status:'blocked',reason:'直线与其他对象相交，请移动对象或切换折线避障。'}
    return{points,status:'clear'}
  }
  if(edge.routing==='manual'&&edge.manualRoute){
    const pins=edgeWaypointPoints(doc,edge),unique=(points:Point[])=>points.filter((p,i)=>!i||p.x!==points[i-1]!.x||p.y!==points[i-1]!.y)
    const connect=(points:Point[])=>orthogonalThroughPoints(points,edge.manualRoute!.direction)
    const limit=(terminal:Point,pin:Point,dir:number)=>((dir%2===0?pin.y===terminal.y:pin.x===terminal.x)&&(pin.x-terminal.x)*vectors[dir]![0]+(pin.y-terminal.y)*vectors[dir]![1]>0)?distance(terminal,pin):Infinity
    const first=lead(start,from,sourceBox,obstacles,area,limit(start,pins[0]!,from),10*(edge.metricScale??1)),last=lead(end,to,targetBox,obstacles,area,limit(end,pins.at(-1)!,to),10*(edge.metricScale??1))
    const fallback=connect([start,...pins,end])
    if(!first||!last)return{points:fallback,status:'blocked',reason:'指定折点的端口出线空间不足，请调整折点或端口。'}
    const middle=connect([first,...pins,last]),points=unique([start,...middle,end])
    if(!points.every(p=>inArea(p,area)))return{points,status:'blocked',reason:'指定折点路线超出共同容器的内容区域，请调整折点或扩大容器。'}
    if(!noReversals(simplifyPoints(points)))return{points,status:'blocked',reason:'指定折点使路线立即折返，请调整折点顺序或水平 / 垂直优先方向。'}
    const terminalClear=(a:Point,b:Point,ownId:string)=>!crosses(a,b)&&!obstacles.some(o=>o.id!==ownId&&segmentHitsRect(a,b,o))
    if(!terminalClear(start,first,sourceBox.id)||!terminalClear(last,end,targetBox.id)||middle.slice(1).some((p,i)=>crosses(middle[i]!,p)||obstacles.some(o=>segmentHitsRect(middle[i]!,p,o))))return{points,status:'blocked',reason:'指定折点路线与对象相交，请调整折点或切换自动避障；指定点未被替换。'}
    return{points,status:'clear'}
  }
  const facing = (from + 2) % 4 === to && (from === 0 ? tx > sx : from === 1 ? ty > sy : from === 2 ? sx > tx : sy > ty)
  const aligned = Math.abs(sx - tx) < epsilon || Math.abs(sy - ty) < epsilon
  if (facing && aligned && direction(start, end) === from && inArea(start, area) && inArea(end, area)
    && !crosses(start,end)&& !obstacles.some(o => o.id !== sourceBox.id && o.id !== targetBox.id && segmentHitsRect(start, end, o))) return { points: [start, end], status: 'clear' }
  const half = (from % 2 === 0 ? Math.abs(tx - sx) : Math.abs(ty - sy)) / 2
  const required = clearance + (from % 2 === 0 && (source.kind === 'projection' || target.kind === 'projection') ? 9 : 0)
  const limit = facing && half >= required ? half : Infinity
  const first = lead(start, from, sourceBox, obstacles, area, limit)
  const last = lead(end, to, targetBox, obstacles, area, limit)
  const fallback = simplifyPoints([start, { x: (sx + tx) / 2, y: sy }, { x: (sx + tx) / 2, y: ty }, end])
  if (!first || !last||crosses(start,first)||crosses(last,end)) return { points: fallback, status: 'blocked', reason: '端口朝向缺少避障空间，请调整端口、移动对象或扩大容器。' }
  const clear = (points: Point[]) => points.every(p => inArea(p, area)) && points.slice(1).every((p, i) => !obstacles.some(o => segmentHitsRect(points[i]!, p, o))&&!crosses(points[i]!,p))
  const mx = (first.x + last.x) / 2, my = (first.y + last.y) / 2
  const candidates = [
    [first, { x: last.x, y: first.y }, last], [first, { x: first.x, y: last.y }, last],
    [first, { x: mx, y: first.y }, { x: mx, y: last.y }, last],
    [first, { x: first.x, y: my }, { x: last.x, y: my }, last],
  ].map(simplifyPoints).filter(points => clear(points) && noReversals(simplifyPoints([start, ...points, end])))
  if (candidates.length) {
    candidates.sort((a, b) => routeCost(simplifyPoints([start, ...a, end])) - routeCost(simplifyPoints([start, ...b, end])))
    return { points: simplifyPoints([start, ...candidates[0]!, end]), status: 'clear' }
  }
  const path = search(first, last, from, to, obstacles, area,barriers)
  if (path) return { points: simplifyPoints([start, ...path, end]), status: 'clear' }
  return { points: fallback, status: 'blocked', reason: '未找到容器内的无碰撞折线路径，请调整布局或端口。' }
}
export function routeFigure(doc: FigureDocument): FigureRoutes { return new Map(doc.edges.map(e => [e.id, routeEdge(doc, e)])) }
export function routePath(route: EdgeRoute,cornerRadius=6): string {
  const points = simplifyPoints(route.points)
  if (!points.length) return ''
  let path = `M${points[0]!.x} ${points[0]!.y}`
  for (let i=1;i<points.length;i++) {
    const current=points[i]!,previous=points[i-1]!,next=points[i+1]
    if (cornerRadius>0 && next && direction(previous,current)!==direction(current,next)) {
      const radius=Math.min(cornerRadius,distance(previous,current)/2,distance(current,next)/2)
      const a={x:current.x+(previous.x-current.x)*radius/distance(previous,current),y:current.y+(previous.y-current.y)*radius/distance(previous,current)}
      const b={x:current.x+(next.x-current.x)*radius/distance(current,next),y:current.y+(next.y-current.y)*radius/distance(current,next)}
      path+=` L${a.x} ${a.y} Q${current.x} ${current.y} ${b.x} ${b.y}`
    } else path+=` L${current.x} ${current.y}`
  }
  return path
}
