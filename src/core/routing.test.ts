import { describe, expect, it } from 'vitest'
import { anchor, clone, createBlank, parseDocument, type FigureDocument, type FigureEdge, type Port } from './model'
import { contentBounds, type Rect } from './geometry'
import { routeEdge, routeFigure, routePath, type EdgeRoute, type Point } from './routing'
import { exportSvg } from './svg'
import { buildRecipe } from '../data/recipes'

const ports: Port[] = ['left', 'right', 'top', 'bottom']
function fixture(): FigureDocument {
  const doc = createBlank()
  doc.nodes = [
    { id: 'a', parentId: 'stage', kind: 'module', label: 'A', x: 110, y: 285, width: 100, height: 60 },
    { id: 'b', parentId: 'stage', kind: 'module', label: 'B', x: 770, y: 305, width: 100, height: 60 },
  ]
  doc.edges = [{ id: 'wire', source: 'a', target: 'b', sourcePort: 'right', targetPort: 'left' }]
  return doc
}
// Independent intersection oracle: test actual shape bounds with a small margin, not router internals.
function crosses(a: Point, b: Point, rect: Rect,margin=7): boolean {
  const left=rect.x-margin,right=rect.x+rect.width+margin,top=rect.y-margin,bottom=rect.y+rect.height+margin
  const dx=b.x-a.x,dy=b.y-a.y,cuts=[0,1,...(dx?[left,right].map(x=>(x-a.x)/dx):[]),...(dy?[top,bottom].map(y=>(y-a.y)/dy):[])].filter(t=>t>=0&&t<=1).sort((x,y)=>x-y)
  return cuts.slice(1).some((t,i)=>{const mid=(t+cuts[i]!)/2,x=a.x+mid*dx,y=a.y+mid*dy;return t>cuts[i]!&&x>left&&x<right&&y>top&&y<bottom})
}
function verify(doc: FigureDocument, edge: FigureEdge, route: EdgeRoute) {
  expect(route.status).toBe('clear')
  const source = doc.nodes.find(n => n.id === edge.source)!, target = doc.nodes.find(n => n.id === edge.target)!
  const [sx, sy] = anchor(source, edge.sourcePort), [tx, ty] = anchor(target, edge.targetPort)
  expect(route.points[0]).toEqual({ x: sx, y: sy }); expect(route.points.at(-1)).toEqual({ x: tx, y: ty })
  const first = route.points[1]!, last = route.points.at(-2)!
  const outgoing = (port: Port, p: Point, q: Point) => port === 'left' ? q.x < p.x && (edge.routing==='straight'||q.y === p.y) : port === 'right' ? q.x > p.x && (edge.routing==='straight'||q.y === p.y) : port === 'top' ? q.y < p.y && (edge.routing==='straight'||q.x === p.x) : q.y > p.y && (edge.routing==='straight'||q.x === p.x)
  expect(outgoing(edge.sourcePort, { x: sx, y: sy }, first)).toBe(true)
  expect(outgoing(edge.targetPort, { x: tx, y: ty }, last)).toBe(true)
  const region = contentBounds(doc.containers.find(c => c.id === 'stage')!)
  route.points.forEach(p => {
    expect(p.x).toBeGreaterThanOrEqual(region.x - 0.001); expect(p.x).toBeLessThanOrEqual(region.x + region.width + 0.001)
    expect(p.y).toBeGreaterThanOrEqual(region.y - 0.001); expect(p.y).toBeLessThanOrEqual(region.y + region.height + 0.001)
  })
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1]!, b = route.points[i]!
    if(edge.routing==='straight')expect(route.points).toHaveLength(2)
    else expect(a.x === b.x || a.y === b.y).toBe(true)
    for (const n of doc.nodes) {
      if ((n.id === source.id && i === 1) || (n.id === target.id && i === route.points.length - 1)) continue
      expect(crosses(a, b, n,edge.routing==='straight'?.5*(n.metricScale??1):7), `segment ${i} crosses ${n.id}`).toBe(false)
    }
  }
}

describe('shared obstacle-aware orthogonal routing', () => {
  it('honors all sixteen endpoint port combinations without crossing terminal bodies', () => {
    const doc = fixture()
    for (const sourcePort of ports) for (const targetPort of ports) {
      doc.edges[0]!.sourcePort = sourcePort; doc.edges[0]!.targetPort = targetPort
      verify(doc, doc.edges[0]!, routeEdge(doc, doc.edges[0]!))
    }
  })
  it('routes around an intervening module and changes route deterministically when the obstacle moves', () => {
    const doc = fixture(); doc.nodes[1]!.y = 285
    doc.nodes.push({ id: 'wall', parentId: 'stage', kind: 'tensor', label: 'Obstacle', x: 390, y: 245, width: 150, height: 140 })
    parseDocument(doc)
    const before = clone(doc), route = routeEdge(doc, doc.edges[0]!)
    verify(doc, doc.edges[0]!, route); expect(route.points.length).toBeGreaterThan(2)
    expect(routeEdge(doc, doc.edges[0]!)).toEqual(route); expect(doc).toEqual(before)
    doc.nodes[2]!.y = 400
    const moved = routeEdge(doc, doc.edges[0]!)
    verify(doc, doc.edges[0]!, moved); expect(moved.points).not.toEqual(route.points)
    expect(moved.points).toHaveLength(2)
  })
  it('leaves vector bodies with inset text and dividers without treating their own annotations as blocked ports', () => {
    const doc=fixture();doc.nodes[0]!.kind='rectangle';doc.nodes[1]!.kind='rectangle';doc.nodes[1]!.y=285
    doc.nodes.push(
      {id:'input-value',parentId:'stage',kind:'text',label:'x₂',x:112,y:298,width:96,height:30},
      {id:'input-divider',parentId:'stage',kind:'path',label:'',x:110,y:305,width:100,height:0,path:{points:[{x:0,y:0},{x:1,y:0}],arrow:'none'}},
      {id:'output-value',parentId:'stage',kind:'text',label:'y₁',x:772,y:298,width:96,height:30},
      {id:'output-divider',parentId:'stage',kind:'rectangle',label:'',x:770.75,y:314.25,width:98.5,height:1.5,visual:{fill:'#202020',stroke:'none'}},
    )
    parseDocument(doc)
    const before=clone(doc),route=routeEdge(doc,doc.edges[0]!)
    expect(route).toEqual({status:'clear',points:[{x:210,y:315},{x:770,y:315}]})
    expect(exportSvg(doc)).not.toContain('data-routing-status="blocked"');expect(doc).toEqual(before)
    // A substantial shape is not inferred to be a divider just because it is inset.
    doc.nodes.find(n=>n.id==='output-divider')!.height=3
    expect(routeEdge(doc,doc.edges[0]!).status).toBe('blocked')
    doc.nodes.find(n=>n.id==='output-divider')!.height=1.5
    // Text that protrudes beyond the body still prevents a falsely clear route.
    doc.nodes.find(n=>n.id==='input-value')!.width=104
    expect(routeEdge(doc,doc.edges[0]!).status).toBe('blocked')
    // A separately grouped annotation is not part of this endpoint's body.
    doc.nodes.find(n=>n.id==='input-value')!.width=96
    doc.containers.push({id:'separate',parentId:'stage',role:'component',title:'Separate',x:100,y:275,width:120,height:80})
    doc.nodes.find(n=>n.id==='input-value')!.parentId='separate'
    expect(routeEdge(doc,doc.edges[0]!).status).toBe('blocked')
  })
  it('avoids unrelated containers and ancestor title bands while permitting cross-group bindings', () => {
    const doc = fixture()
    doc.containers.push(
      { id: 'source-group', parentId: 'stage', role: 'group', title: 'Source', x: 80, y: 190, width: 240, height: 280 },
      { id: 'target-group', parentId: 'stage', role: 'group', title: 'Target', x: 690, y: 190, width: 240, height: 280 },
      { id: 'unrelated', parentId: 'stage', role: 'panel', title: 'Unrelated panel', x: 400, y: 220, width: 220, height: 240 },
    )
    doc.nodes[0]!.parentId = 'source-group'; doc.nodes[1]!.parentId = 'target-group'
    parseDocument(doc)
    const route = routeEdge(doc, doc.edges[0]!)
    verify(doc, doc.edges[0]!, route)
    for (let i = 1; i < route.points.length; i++) {
      expect(crosses(route.points[i - 1]!, route.points[i]!, doc.containers[3]!)).toBe(false)
      for (const c of doc.containers) expect(crosses(route.points[i - 1]!, route.points[i]!, { ...c, height: 44 })).toBe(false)
    }
  })
  it('keeps short facing connections straight and reports a blocked outward port instead of pretending success', () => {
    const doc = fixture(); doc.nodes[1]!.x = 230; doc.nodes[1]!.y = 285
    const short = routeEdge(doc, doc.edges[0]!)
    expect(short.status).toBe('clear'); expect(short.points).toHaveLength(2)
    doc.nodes[0]!.x = contentBounds(doc.containers[0]!).x; doc.edges[0]!.sourcePort = 'left'
    const blocked = routeEdge(doc, doc.edges[0]!)
    expect(blocked.status).toBe('blocked'); expect(blocked.reason).toContain('端口')
    expect(exportSvg(doc)).toContain('data-routing-status="blocked"')
    expect(exportSvg(doc)).toContain('stroke="#c54747"')
  })
  it('finds a multi-bend corridor when alternating panels block both simple detours', () => {
    const doc = fixture(); doc.nodes[1]!.y = 285
    doc.containers.push(
      { id: 'upper-wall', parentId: 'stage', role: 'panel', title: 'Upper', x: 310, y: 138, width: 200, height: 220 },
      { id: 'lower-wall', parentId: 'stage', role: 'panel', title: 'Lower', x: 560, y: 350, width: 200, height: 218 },
    )
    parseDocument(doc)
    const route = routeEdge(doc, doc.edges[0]!)
    verify(doc, doc.edges[0]!, route)
    expect(route.points.length).toBeGreaterThanOrEqual(6)
    for (let i = 1; i < route.points.length; i++) for (const wall of doc.containers.slice(1)) expect(crosses(route.points[i - 1]!, route.points[i]!, wall)).toBe(false)
  })
  it('serializes SVG with the routed points independently of appearance', () => {
    const doc = fixture(); doc.nodes.push({ id: 'wall', parentId: 'stage', kind: 'module', label: 'Wall', x: 390, y: 245, width: 150, height: 140 })
    const route = routeFigure(doc).get('wire')!, svg = exportSvg(doc)
    const edge = svg.match(/<path[^>]*data-edge-id="wire"[^>]*>/)![0]
    expect(edge.match(/ d="([^"]+)"/)![1]).toBe(routePath(route))
    const styled = clone(doc); styled.style.preset = 'sketch'; styled.style.accent = 'rose'
    expect(routeFigure(styled)).toEqual(routeFigure(doc))
  })
  it('routes representative fusion branches and both pipeline directions without collisions', () => {
    // Network routing is covered by edgeRouting and networkPresentation; recipe bounds by assets.
    for (const [branches, operator, feature] of [[2,'sum','tensor'], [4,'concat','volume']] as const) {
      const doc = buildRecipe('fusion', { branches, operator, feature }).figure
      for (const edge of doc.edges) verify(doc, edge, routeEdge(doc, edge))
    }
    for (const [stages, direction] of [[5,'row'], [5,'column']] as const) {
      const doc = buildRecipe('pipeline', { stages, direction }).figure
      for (const edge of doc.edges) verify(doc, edge, routeEdge(doc, edge))
    }
  })
  it('routes a crowded sixty-node, 120-edge fixture inside the canvas without false clear paths', () => {
    const doc = createBlank()
    doc.nodes = Array.from({ length: 60 }, (_, i) => ({ id: `n${i}`, parentId: 'stage', kind: 'module', label: `Node ${i}`, x: 70 + (i % 9) * 96, y: 150 + Math.floor(i / 9) * 60, width: 80, height: 44 }))
    doc.edges = Array.from({ length: 120 }, (_, i) => ({ id: `e${i}`, source: `n${i % 60}`, target: `n${(i * 17 + 7) % 60}`, sourcePort: i < 60 ? 'right' : 'bottom', targetPort: i < 60 ? 'left' : 'top' }))
    parseDocument(doc)
    for (const edge of doc.edges) verify(doc, edge, routeEdge(doc, edge))
  })
})
