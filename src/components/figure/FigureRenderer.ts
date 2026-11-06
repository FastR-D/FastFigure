import {isPaperStyle} from '../../core/paperStyle'
import {outputFrame} from '../../core/outputFrame'
import {edgeWaypointPoints} from '../../core/edgeWaypoints'
import { fontStack } from '../../data/materials'
import { computed, defineComponent, h,ref,onMounted,onBeforeUnmount, type PropType, type VNode } from 'vue'
import { createScene, type SvgElement } from '../../core/svg'
import { findObject, type Rect } from '../../core/geometry'
import { anchor, type FigureDocument } from '../../core/model'
import type { TextEditField } from '../../composables/useEditor'
import { routeFigure, routePath, type FigureRoutes } from '../../core/routing'
import { measureText } from '../../core/textGeometry'
import { directionLabels } from '../../core/componentPorts'
import {figureHitLayers} from './FigureHitLayer'
import { pathPoints } from '../../core/paths'
import type {AlignmentGuide} from '../../core/alignmentSnap'
import type {ArrowPoint} from '../../core/orthogonalGeometry'

export default defineComponent({
  name: 'FigureRenderer',
  props: {
    figure: { type: Object as PropType<FigureDocument>, required: true },
    viewport: { type: Object as PropType<Rect>, default: undefined },
    showDocumentTitle: { type: Boolean, default: undefined },
    routes: { type: Object as PropType<FigureRoutes>, default: undefined },
    selectedIds: { type: Array as PropType<string[]>, default: () => [] },
    selectionRect: { type: Object as PropType<Rect | null>, default: null },
    interactive: { type: Boolean, default: false }, selectionOnly:{type:Boolean,default:false}, sourceId: { type: String, default: '' },
    highlightedId: { type: String, default: '' },
    connectMode:{type:Boolean,default:false},
    alignmentGuides:{type:Array as PropType<AlignmentGuide[]>,default:()=>[]},
    arrowDraft:{type:Array as PropType<ArrowPoint[]>,default:()=>[]},arrowPreview:{type:Array as PropType<ArrowPoint[]>,default:()=>[]},
    selectedEdgePoint:{type:Number as PropType<number|null>,default:null},
    selectedPathPoint:{type:Number as PropType<number|null>,default:null},
  },
  emits: {
    objectDown: (_id: string, _event: PointerEvent) => true,
    backgroundDown: (_event: PointerEvent) => true,
    resizeDown: (_event: PointerEvent) => true,
    resizeKey: (_dx: number, _dy: number) => true,
    select: (_id: string, _additive: boolean) => true,
    edit: (_id: string, _field: TextEditField) => true,
    edgePointDown:(_id:string,_index:number,_event:PointerEvent)=>true,
    edgePointKey:(_id:string,_index:number,_dx:number,_dy:number)=>true,
    edgePointRemove:(_id:string,_index:number)=>true,
    pathPointDown:(_id:string,_index:number,_event:PointerEvent)=>true,
    pathPointKey:(_id:string,_index:number,_dx:number,_dy:number)=>true,
    namedPortDown:(_id:string,_event:PointerEvent)=>true,
    namedPortKey:(_id:string,_delta:number)=>true,
    pathControlDown:(_id:string,_index:number,_key:'c1'|'c2',_event:PointerEvent)=>true,
    pathControlKey:(_id:string,_index:number,_key:'c1'|'c2',_dx:number,_dy:number)=>true,
    pathPointRemove:(_id:string,_index:number)=>true,
  },
  setup(props, { emit }) {
    const fontEpoch=ref(0),fontsLoaded=()=>fontEpoch.value++
    onMounted(()=>document.fonts?.addEventListener('loadingdone',fontsLoaded));onBeforeUnmount(()=>document.fonts?.removeEventListener('loadingdone',fontsLoaded))
    const routes = computed(() => props.routes ?? routeFigure(props.figure))
    function render(item: SvgElement | string): VNode | string {
      if(typeof item==='string')return item
      const attrs={...item.attrs}
      if(props.interactive&&attrs['data-object-id']!==undefined){attrs['data-object-paint-id']=attrs['data-object-id'];delete attrs['data-object-id']}
      return h(item.tag,attrs,(item.children??[]).map(render))
    }
    return () => {
      void fontEpoch.value
      const doc = props.figure, overlay: VNode[] = []
      if (props.highlightedId) {
        const object = findObject(doc, props.highlightedId)
        if (object) overlay.push(h('rect', { x: object.x - 5, y: object.y - 5, width: object.width + 10, height: object.height + 10,
          rx: 5, fill: '#2f8af5', 'fill-opacity': 0.06, stroke: '#1769d3', 'stroke-width': 3, 'stroke-dasharray': '6 3', 'pointer-events': 'none', 'data-review-highlight': props.highlightedId }))
        else {
          const route = routes.value.get(props.highlightedId)
          if (route) overlay.push(h('path', { d: routePath(route), fill: 'none', stroke: '#1769d3', 'stroke-width': 5, 'stroke-opacity': 0.5, 'pointer-events': 'none', 'data-review-highlight': props.highlightedId }))
        }
      }
      if (props.interactive) {
        if(props.arrowPreview.length>1)overlay.push(h('path',{d:props.arrowPreview.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' '),fill:'none',stroke:'#1769d3','stroke-width':1.6,'vector-effect':'non-scaling-stroke','pointer-events':'none','data-arrow-draft':''}))
        for(const [index,p]of props.arrowDraft.entries())overlay.push(h('circle',{cx:p.x,cy:p.y,r:4.5,fill:'#fff',stroke:'#1769d3','stroke-width':1.5,'vector-effect':'non-scaling-stroke','pointer-events':'none','data-arrow-draft-point':index}))
        for(const guide of props.alignmentGuides)overlay.push(h('line',{
          x1:guide.axis==='x'?guide.position:guide.start,y1:guide.axis==='y'?guide.position:guide.start,
          x2:guide.axis==='x'?guide.position:guide.end,y2:guide.axis==='y'?guide.position:guide.end,
          stroke:'#d74792','stroke-width':1,'stroke-dasharray':'4 3','vector-effect':'non-scaling-stroke','pointer-events':'none','data-alignment-guide':guide.axis,
        }))
        for (const c of doc.containers) overlay.push(h('rect', { x: c.x, y: c.y, width: c.width, height:c.role==='component'||c.titleDetached?c.height:46*(c.metricScale??1),
          fill: c.role==='component'||c.titleDetached?'none':'transparent',...(c.role==='component'||c.titleDetached?{stroke:'transparent','stroke-width':10,'pointer-events':'stroke'}:{}), style: props.selectionOnly?'cursor:pointer':'cursor:move', 'data-container-handle': c.id, role: 'button', tabindex: 0, 'aria-label': `选择容器 ${c.title}`,
          onPointerdown: (e: PointerEvent) => { e.stopPropagation(); if(props.selectionOnly)emit('select',c.id,e.shiftKey||e.ctrlKey||e.metaKey);else emit('objectDown', c.id, e) },
          onDblclick: (e: MouseEvent) => { e.stopPropagation();if(props.selectionOnly||c.titleDetached)return; emit('edit', c.id, 'label') },
          onKeydown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); emit('select', c.id, e.shiftKey||props.selectionOnly&&(e.ctrlKey||e.metaKey)) } },
        }))
        for (const id of props.selectedIds) {
          const selection = findObject(doc, id)
          if(!selection&&routes.value.has(id)){
            const edge=doc.edges.find(e=>e.id===id)!
            overlay.push(h('path',{d:routePath(routes.value.get(id)!,edge.routing==='manual'?0:6),fill:'none',stroke:'#2f8af5','stroke-width':4,'stroke-opacity':.55,'pointer-events':'none','data-selected-edge':id}))
            if(!props.selectionOnly)edgeWaypointPoints(doc,edge).forEach((point,index)=>overlay.push(h('circle',{cx:point.x,cy:point.y,r:5,fill:props.selectedEdgePoint===index?'#2f8af5':'#ffffff',stroke:'#1769d3','stroke-width':1.5,'data-edge-point':`${id}:${index}`,role:'button',tabindex:0,'aria-label':`连线折点 ${index+1}`,style:'cursor:crosshair',onPointerdown:(event:PointerEvent)=>{event.stopPropagation();emit('edgePointDown',id,index,event)},onKeydown:(event:KeyboardEvent)=>{
              if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();event.stopPropagation();const step=event.shiftKey?10:1;emit('edgePointKey',id,index,event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)}
              else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();event.stopPropagation();emit('edgePointRemove',id,index)}
            }})))
            continue
          }
          if (!selection||'socket' in selection&&selection.socket) continue
          overlay.push(h('rect', { x: selection.x - 6, y: selection.y - 6, width: selection.width + 12, height: selection.height + 12,
            rx: 5, fill: 'none', stroke: '#2f8af5', 'stroke-width': 1.5, 'stroke-dasharray': 'kind' in selection ? undefined : '5 4', 'pointer-events': 'none' }))
          if(props.selectionOnly)continue
          if('path' in selection&&selection.path) {
            const points=pathPoints(doc,selection)
            points.forEach((point,index)=>{
              for(const key of ['c1','c2'] as const){
                const control=point[key];if(!control)continue
                const anchor=key==='c1'?points[index-1]!:point
                overlay.push(h('path',{d:`M${anchor.x} ${anchor.y}L${control.x} ${control.y}`,stroke:'#9aa9bd','stroke-width':1,'stroke-dasharray':'3 3','pointer-events':'none'}))
                overlay.push(h('rect',{x:control.x-4,y:control.y-4,width:8,height:8,fill:'#fff6da',stroke:'#c78b26','stroke-width':1.5,tabindex:0,role:'button','aria-label':`曲线 ${index+1} 控制点 ${key}`,'data-path-control':`${index}-${key}`,style:'cursor:crosshair',
                  onPointerdown:(event:PointerEvent)=>{event.stopPropagation();emit('pathControlDown',selection.id,index,key,event)},
                  onKeydown:(event:KeyboardEvent)=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();event.stopPropagation();const step=event.shiftKey?10:1;emit('pathControlKey',selection.id,index,key,event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)}}))
              }
            })
            points.forEach((point,index)=>overlay.push(h('circle',{cx:point.x,cy:point.y,r:5,fill:props.selectedPathPoint===index?'#2f8af5':'#fff',stroke:'#1769d3','stroke-width':1.5,'data-path-point':index,tabindex:0,role:'button','aria-label':`路径点 ${index+1}`,
              style:'cursor:crosshair',onPointerdown:(event:PointerEvent)=>{event.stopPropagation();emit('pathPointDown',selection.id,index,event)},
              onKeydown:(event:KeyboardEvent)=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();event.stopPropagation();const step=event.shiftKey?10:1;emit('pathPointKey',selection.id,index,event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)}else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();event.stopPropagation();emit('pathPointRemove',selection.id,index)}}})))
            continue
          }
          for (const [x, y] of [[selection.x, selection.y], [selection.x + selection.width, selection.y], [selection.x, selection.y + selection.height]])
            overlay.push(h('rect', { x: x! - 3, y: y! - 3, width: 6, height: 6, fill: '#fff', stroke: '#2f8af5', 'pointer-events': 'none' }))
          if (props.selectedIds.length === 1) overlay.push(h('rect', {
            x: selection.x + selection.width + (selection.width<=12&&selection.height<=12?2:-4), y: selection.y + selection.height + (selection.width<=12&&selection.height<=12?2:-4), width: 8, height: 8,
            fill: '#fff', stroke: '#2f8af5', 'stroke-width': 1.5, style: 'cursor:nwse-resize', tabindex: 0,
            role: 'button', 'aria-label': '调整对象大小', 'data-resize-handle': id,
            onPointerdown: (e: PointerEvent) => { e.stopPropagation(); emit('resizeDown', e) },
            onKeydown: (e: KeyboardEvent) => {
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
              e.preventDefault(); e.stopPropagation(); const step = e.shiftKey ? 10 : 1
              emit('resizeKey', e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0)
            },
          },[h('title',{},'拖动等比例缩放 · Shift 拖动自由调整')]))
        }
        if (props.sourceId) {
          const n = findObject(doc, props.sourceId)
          if (n) overlay.push(h('rect', { x: n.x - 9, y: n.y - 9, width: n.width + 18, height: n.height + 18, rx: 8, fill: 'none', stroke: '#1769d3', 'stroke-width': 3, 'pointer-events': 'none' }))
        }
        const selectedOwners=new Set(props.selectedIds.flatMap(id=>{const socket=doc.nodes.find(n=>n.id===id)?.socket;return socket?[doc.nodes.find(n=>n.id===id)!.interfaceFor!]:[id]}))
        for(const node of doc.nodes.filter(n=>!props.selectionOnly&&n.socket&&(props.connectMode||selectedOwners.has(n.interfaceFor!)))){
          const socket=node.socket!,[x,y]=anchor(node,socket.side),selected=props.selectedIds.includes(node.id),color=socket.direction==='input'?'#1769d3':socket.direction==='output'?'#28775d':'#7557a5'
          const label=`${node.label}（${directionLabels[socket.direction]}）`,left=socket.side==='left'&&x>100||socket.side==='right'&&x>900
          const tx=socket.side==='top'||socket.side==='bottom'?x:left?x-11:x+11,ty=socket.side==='top'?y+18:socket.side==='bottom'?y-12:y+4
          const caption=node.label.length>18?`${node.label.slice(0,17)}…`:node.label,captionWidth=measureText(caption,{family:'MiSans',size:11}).width,centered=socket.side==='top'||socket.side==='bottom',labelX=centered?tx-captionWidth/2:left?tx-captionWidth:tx
          const hitX=Math.min(x-10,labelX),hitY=Math.min(y-10,ty-11),hitRight=Math.max(x+10,labelX+captionWidth),hitBottom=Math.max(y+10,ty+3)
          overlay.push(h('g',{'data-named-port':node.id,tabindex:0,role:'button','aria-label':`接口 ${label}`,'aria-pressed':selected,style:'cursor:crosshair',
            onPointerdown:(event:PointerEvent)=>{event.stopPropagation();emit('namedPortDown',node.id,event)},
            onKeydown:(event:KeyboardEvent)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();emit('select',node.id,false)}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();event.stopPropagation();emit('namedPortKey',node.id,(event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:1)*(event.shiftKey?.1:.01))}}},[
            h('title',{},[`${label} · ${socket.key} · ${Math.round(socket.position*100)}%`]),
            h('rect',{x:hitX,y:hitY,width:hitRight-hitX,height:hitBottom-hitY,fill:'transparent'}),h('circle',{cx:x,cy:y,r:10,fill:'transparent'}),h('circle',{cx:x,cy:y,r:selected?7:5.5,fill:selected?color:'#fff',stroke:color,'stroke-width':2}),
            h('text',{x:tx,y:ty,'text-anchor':socket.side==='top'||socket.side==='bottom'?'middle':left?'end':'start','font-size':11,fill:color,stroke:'#fff','stroke-width':3,'paint-order':'stroke','pointer-events':'none'},[caption]),
          ]))
        }
        if (props.selectionRect) overlay.push(h('rect', { ...props.selectionRect, fill: '#2f8af5', 'fill-opacity': 0.08,
          stroke: '#2f8af5', 'stroke-width': 1, 'stroke-dasharray': '4 3', 'pointer-events': 'none', 'data-selection-region': '' }))
      }
      if(props.interactive&&doc.canvas.frame)overlay.push(h('rect',{...doc.canvas.frame,fill:'none',stroke:'#8895a3','stroke-width':1,'stroke-dasharray':'5 5','pointer-events':'none','data-output-frame':''}))
      const scene=createScene(doc,props.showDocumentTitle??doc.publication?.showTitle??!isPaperStyle(doc.style),routes.value)
      const hits=props.interactive?figureHitLayers(scene,doc,{
        down:(id,event)=>{if(props.selectionOnly)emit('select',id,event.shiftKey||event.ctrlKey||event.metaKey);else emit('objectDown',id,event)},
        select:(id,additive)=>emit('select',id,additive),
        edit:(id,field)=>emit('edit',id,field as TextEditField),
      },{selectionOnly:props.selectionOnly,connectMode:props.connectMode,selectedIds:props.selectedIds}):[]
      const viewport = props.viewport ?? (props.interactive?{x:0,y:0,width:doc.canvas.width,height:doc.canvas.height}:outputFrame(doc))
      return h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`,
        ...(props.interactive?{tabindex:0}:{}),
        width: '100%', height: '100%', role: 'img', 'aria-label': doc.title, 'data-testid': props.interactive ? props.selectionOnly?'capture-canvas':'figure-canvas' : undefined,
        style: `display:block;touch-action:none;font-synthesis:weight style;font-family:${fontStack(props.figure.style.fontFamily)}`,
        onPointerdown: props.interactive ? (e: PointerEvent) => emit('backgroundDown', e) : undefined,
      }, [...(props.interactive?[h('g',{'data-paint-layer':'','pointer-events':'none','aria-hidden':'true'},scene.map(render))]:scene.map(render)),...hits,...overlay])
    }
  },
})
