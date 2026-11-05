import {h,type VNode} from 'vue'
import type {FigureDocument,FigureNode} from '../../core/model'
import {nodeKindLabels} from '../../core/model'
import {pathFill} from '../../core/paint'
import {resolveStyle} from '../../core/geometry'
import type {SvgElement} from '../../core/svg'

interface Actions {
  down:(id:string,event:PointerEvent)=>void
  select:(id:string,additive:boolean)=>void
  edit:(id:string,field:string)=>void
}
interface Options {selectionOnly:boolean;connectMode:boolean;selectedIds:readonly string[]}
const shapes=new Set(['path','rect','ellipse','circle','line','polyline','polygon','text'])
type Paint={fill:string|number;stroke:string|number;fillOpacity:string|number;strokeOpacity:string|number}
const defaults:Paint={fill:'#000000',stroke:'none',fillOpacity:1,strokeOpacity:1}
const hidden=(item:SvgElement)=>item.attrs?.opacity===0||item.attrs?.opacity==='0'||item.attrs?.visibility==='hidden'||item.attrs?.display==='none'

/** Paint-free copies use the same curves, affine transforms and clipping as the
 * scene. Generated chart strokes live below data/text; other drawing paths keep
 * their original ordering. */
function hitGraphic(item:SvgElement|string,wide:boolean,parent:Paint=defaults):VNode|string|null{
  if(typeof item==='string')return item
  if(item.tag==='defs'||hidden(item))return null
  const attrs={...item.attrs},paint={...parent}
  for(const [key,field] of [['fill','fill'],['stroke','stroke'],['fill-opacity','fillOpacity'],['stroke-opacity','strokeOpacity']] as const)if(attrs[key]!==undefined)paint[field]=attrs[key]!
  if(item.tag==='image')return h('rect',{x:attrs.x,y:attrs.y,width:attrs.width,height:attrs.height,transform:attrs.transform,fill:'transparent','pointer-events':'all'})
  if(shapes.has(item.tag)){
    attrs.fill=paint.fill==='none'||Number(paint.fillOpacity)===0?'none':'transparent'
    attrs.stroke=paint.stroke==='none'||Number(paint.strokeOpacity)===0?'none':'transparent'
    // Markers carry their own paint, so leaving these references would draw a
    // second arrow even though the supporting hit stroke is transparent.
    for(const key of ['marker-start','marker-mid','marker-end'])delete attrs[key]
    if(wide&&attrs.stroke!=='none'){attrs['pointer-events']='stroke';attrs['stroke-width']=12;attrs['vector-effect']='non-scaling-stroke'}
  }
  return h(item.tag,attrs,(item.children??[]).map(child=>hitGraphic(child,wide,paint)))
}
function smallMarker(node:FigureNode){const paint=node.visual;if((paint?.fill==='none'||paint?.fillOpacity===0)&&(paint?.stroke==='none'||paint?.strokeOpacity===0))return false;return node.chart?.role==='series'&&/^series-\d+-(point|sample)-\d+$/.test(node.chart.key??'')&&['ellipse','rectangle','diamond'].includes(node.kind)&&node.width<=12&&node.height<=12&&node.width>0&&node.height>0}

/** All decisions are view-only. No model order, coordinates, values or exported
 * paths change. A genuine painted object still wins over another object's halo. */
export function figureHitLayers(scene:SvgElement[],figure:FigureDocument,actions:Actions,options:Options):VNode[]{
  const nodes=new Map(figure.nodes.map(node=>[node.id,node]))
  function pathUnderPointer(event:PointerEvent){
    if(!event.altKey||options.connectMode)return
    const target=event.currentTarget as SVGElement,svg=target.ownerSVGElement
    if(!svg)return
    for(const element of svg.ownerDocument.elementsFromPoint(event.clientX,event.clientY)){
      const hit=element.closest('[data-stroke-hit],[data-edge-handle]')
      if(!hit||!svg.contains(hit))continue
      const edge=hit.getAttribute('data-edge-handle'),id=edge??hit.getAttribute('data-stroke-hit')
      if(id)return{id,edge:!!edge}
    }
  }
  function down(id:string,event:PointerEvent){
    event.stopPropagation()
    const forced=pathUnderPointer(event)
    if(forced?.edge)actions.select(forced.id,event.shiftKey)
    else actions.down(forced?.id??id,event)
  }
  function object(item:SvgElement,node:FigureNode,wide:boolean){
    return h('g',{...item.attrs,tabindex:0,role:'button','aria-label':`选择 ${node.label||node.name||nodeKindLabels[node.kind]}`,...(node.path?{'data-path-hit':node.id}:{}),...(wide?{'data-stroke-hit':node.id}:{}),style:options.selectionOnly?'cursor:pointer':'cursor:move',
      onPointerdown:(event:PointerEvent)=>down(node.id,event),
      onDblclick:(event:MouseEvent)=>{event.stopPropagation();if(options.selectionOnly)return;actions.edit(node.id,(event.target as Element).closest('[data-edit-field]')?.getAttribute('data-edit-field')??'label')},
      onKeydown:(event:KeyboardEvent)=>{if(event.key==='F2'&&!options.selectionOnly){event.preventDefault();event.stopPropagation();actions.edit(node.id,'label')}else if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();actions.select(node.id,event.shiftKey||options.selectionOnly&&(event.ctrlKey||event.metaKey))}},
    },[...(node.name&&!node.label?[h('title',{},node.name)]:[]),...(item.children??[]).map(child=>hitGraphic(child,wide))])
  }
  function collect(item:SvgElement|string,bucket:'strokes'|'markers'|'objects'):VNode|null{
    if(typeof item==='string'||item.tag==='defs'||hidden(item))return null
    const id=item.attrs?.['data-object-id'],node=id===undefined?undefined:nodes.get(String(id)),edge=item.attrs?.['data-edge-id']
    if(edge!==undefined){
      if(bucket!=='strokes'||options.connectMode||options.selectionOnly)return null
      const edgeId=String(edge),index=figure.edges.findIndex(row=>row.id===edgeId)
      return h('path',{d:item.attrs!.d,fill:'none',stroke:'transparent','stroke-width':12,'vector-effect':'non-scaling-stroke','pointer-events':'stroke',tabindex:0,role:'button','aria-label':`选择连接 ${index+1}`,'data-edge-handle':edgeId,'aria-pressed':options.selectedIds.includes(edgeId),style:'cursor:pointer',
        onPointerdown:(event:PointerEvent)=>{event.stopPropagation();actions.select(edgeId,event.shiftKey)},
        onKeydown:(event:KeyboardEvent)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();actions.select(edgeId,event.shiftKey)}},
      })
    }
    if(node){
      const strokeOnly=!!node.path&&pathFill(resolveStyle(figure,node.parentId),node.visual)==='none'
      if(bucket==='markers'){
        if(!smallMarker(node))return null
        return h('circle',{cx:node.x+node.width/2,cy:node.y+node.height/2,r:Math.max(node.width,node.height)/2,fill:'transparent',stroke:'transparent','stroke-width':10,'vector-effect':'non-scaling-stroke','data-marker-halo':node.id,'aria-hidden':'true',style:options.selectionOnly?'cursor:pointer':'cursor:move',onPointerdown:(event:PointerEvent)=>down(node.id,event)})
      }
      // Generated chart strokes sit below data/text; free drawing paths retain
      // their original paint order with filled shapes and annotations.
      const underlay=strokeOnly&&!!node.chart
      return (bucket==='strokes')===underlay?object(item,node,strokeOnly):null
    }
    const children=(item.children??[]).map(child=>collect(child,bucket)).filter((child):child is VNode=>child!==null)
    return children.length?h(item.tag,item.attrs,children):null
  }
  return (['strokes','markers','objects'] as const).map(bucket=>h('g',{'data-hit-layer':bucket},scene.map(item=>collect(item,bucket))))
}
