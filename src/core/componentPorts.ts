import { anchor, componentPortSchema, type ComponentPort, type FigureDocument, type FigureNode } from './model.ts'
export const directionLabels={input:'输入',output:'输出',both:'双向'} as const
export const sideLabels={left:'左侧',right:'右侧',top:'顶部',bottom:'底部'} as const
export const namedPorts=(doc:FigureDocument,ownerId:string)=>doc.nodes.filter(n=>n.interfaceFor===ownerId&&n.socket)
export function exposedPorts(doc:FigureDocument,direction:'input'|'output'):FigureNode[] {
  const named=namedPorts(doc,'stage')
  if(named.length)return named.filter(n=>n.socket!.direction===direction||n.socket!.direction==='both')
  const legacy=doc.nodes.filter(n=>n.kind==='port'&&n.interfaceFor==='stage')
  if(legacy.length)return legacy
  if(doc.containers.find(c=>c.id==='stage')?.role==='component')return []
  const connected=new Set(doc.edges.map(e=>direction==='input'?e.target:e.source))
  return doc.nodes.filter(n=>n.kind!=='path'&&!connected.has(n.id))
}
export function addComponentPort(doc:FigureDocument,ownerId:string,direction:ComponentPort['direction'],id:string) {
  const owner=doc.containers.find(c=>c.id===ownerId)
  if(!owner||owner.role!=='component')throw new Error('请先选择自由图元组合')
  const existing=namedPorts(doc,ownerId)
  if(existing.length>=16)throw new Error('每个组件最多 16 个命名接口')
  if(doc.nodes.length>=240)throw new Error('图元已达 240 个上限，请先拆分工程')
  const side=direction==='output'?'right':'left',prefix=direction==='both'?'io':direction
  let i=1;while(existing.some(n=>n.socket!.key===`${prefix}-${i}`))i++
  const positions=[0,...existing.filter(n=>n.socket!.side===side).map(n=>n.socket!.position),1].sort((a,b)=>a-b)
  let position=.5,gap=0;for(let i=1;i<positions.length;i++)if(positions[i]!-positions[i-1]!>gap){gap=positions[i]!-positions[i-1]!;position=(positions[i]!+positions[i-1]!)/2}
  const node:FigureNode={id,parentId:ownerId,interfaceFor:ownerId,kind:'port',label:`${directionLabels[direction]} ${i}`,x:owner.x,y:owner.y,width:owner.width,height:owner.height,socket:{key:`${prefix}-${i}`,direction,side,position}}
  doc.nodes.push(node);return node
}
export function updateComponentPort(doc:FigureDocument,id:string,patch:Partial<ComponentPort>&{label?:string}) {
  const node=doc.nodes.find(n=>n.id===id)
  if(!node?.socket)throw new Error('请选择命名接口')
  const next=componentPortSchema.parse({...node.socket,...patch})
  if(doc.nodes.some(n=>n.id!==id&&n.interfaceFor===node.interfaceFor&&n.socket?.key===next.key))throw new Error('同一组件的接口标识不能重复')
  const incident=doc.edges.filter(e=>e.source===id||e.target===id)
  if(next.direction==='input'&&incident.some(e=>e.source===id)||next.direction==='output'&&incident.some(e=>e.target===id))throw new Error('现有连线与新方向冲突，请先改接或移除连线')
  node.socket=next;if(patch.label!==undefined){const label=patch.label.trim();if(!label||label.length>40)throw new Error('接口名称为 1–40 字');node.label=label}
  for(const edge of incident){if(edge.source===id)edge.sourcePort=next.side;if(edge.target===id)edge.targetPort=next.side}
}
export function removeComponentPort(doc:FigureDocument,id:string) {
  if(!doc.nodes.some(n=>n.id===id&&n.socket))throw new Error('请选择命名接口')
  doc.nodes=doc.nodes.filter(n=>n.id!==id);doc.edges=doc.edges.filter(e=>e.source!==id&&e.target!==id)
}
export const portLocation=(node:FigureNode)=>{const [x,y]=anchor(node,node.socket!.side);return{x,y}}
