import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue'
import type {Editor} from './useEditor'
import {contentBounds} from '../core/geometry'
import {applyMaterialEdits} from '../core/materialEditing'
import {appendArrowPoint,compactArrowPoints,moveArrowPoint,type ArrowPoint} from '../core/orthogonalGeometry'
import {pathPoints} from '../core/paths'
export function useArrowDrawing(editor:Editor){
  const points=ref<ArrowPoint[]>([]),cursor=ref<ArrowPoint|null>(null),parentId=ref('stage')
  let stopDrag:(()=>void)|undefined
  const preview=computed(()=>cursor.value&&points.value.length?appendArrowPoint(points.value,cursor.value):points.value)
  watch(points,value=>{editor.arrowPointCount.value=value.length},{deep:true})
  watch(editor.arrowDrawMode,active=>{if(!active){stopDrag?.();points.value=[];cursor.value=null;editor.arrowEditId.value=null}else{editor.connectMode.value=false;editor.connectionSource.value=null;const existing=editor.figure.value.nodes.find(n=>n.id===editor.arrowEditId.value);parentId.value=existing?.parentId??editor.currentContainer.value.id;points.value=existing?.path?pathPoints(editor.figure.value,existing).map(p=>({x:p.x,y:p.y})):[]}})
  function position(event:PointerEvent,svg:SVGSVGElement){const m=svg.getScreenCTM();if(!m)return null;const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(m.inverse()),parent=editor.figure.value.containers.find(c=>c.id===parentId.value);if(!parent)return null;const area=contentBounds(parent);return{x:Math.max(area.x,Math.min(area.x+area.width,p.x)),y:Math.max(area.y,Math.min(area.y+area.height,p.y))}}
  function down(event:PointerEvent,svg:SVGSVGElement){
    if(!editor.arrowDrawMode.value||event.button!==0)return
    event.preventDefault();event.stopPropagation();svg.focus({preventScroll:true});const p=position(event,svg);if(!p)return
    const tolerance=8/Math.abs(svg.getScreenCTM()?.a??1)
    let index=points.value.findIndex(point=>Math.hypot(point.x-p.x,point.y-p.y)<=tolerance)
    if(index<0){if(points.value.length>=62){editor.notice.value='一条箭头最多 64 个折点';return}points.value=appendArrowPoint(points.value,p);index=points.value.length-1}
    cursor.value=null;const before=points.value.map(point=>({...point}))
    const move=(e:PointerEvent)=>{if(e.pointerId!==event.pointerId)return;const at=position(e,svg);if(at)points.value=moveArrowPoint(before,index,at)}
    const cleanup=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);stopDrag=undefined}
    const up=(e:PointerEvent)=>{if(e.pointerId===event.pointerId)cleanup()},cancel=()=>{points.value=before;cleanup()}
    stopDrag=cancel;window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel)
  }
  function hover(event:PointerEvent,svg:SVGSVGElement){if(editor.arrowDrawMode.value&&!stopDrag)cursor.value=position(event,svg)}
  function finish(){
    if(!editor.arrowDrawMode.value)return
    const vertices=compactArrowPoints(points.value);if(vertices.length<2){editor.notice.value='请先点击创建至少两个不同的点';return}
    const existing=editor.figure.value.nodes.find(n=>n.id===editor.arrowEditId.value)
    try{const result=applyMaterialEdits(editor.figure.value,[{kind:'arrow',parentId:parentId.value,...(existing?{nodeId:existing.id}:{}),points:vertices,direction:'strict',arrow:existing?.path?.arrow??'filled',...(existing?.path?.startArrow?{startArrow:existing.path.startArrow}:{}),...(existing?.path?.arrowSize?{arrowSize:existing.path.arrowSize}:{})}]);if(editor.update(doc=>Object.assign(doc,result.figure))){editor.arrowDrawMode.value=false;const id=result.reports[0]!.objectIds[0]!;editor.select(id);editor.selectedPathPoint.value=vertices.length-1}}
    catch(error){editor.notice.value=(error as Error).message}
  }
  watch(editor.arrowFinishRequest,finish)
  function key(event:KeyboardEvent){if(!editor.arrowDrawMode.value||(event.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"],dialog[open]'))return;if(event.key==='Enter'||event.key==='Escape'||event.key==='Backspace'||event.key==='Delete'){event.preventDefault();event.stopImmediatePropagation();if(event.key==='Enter')finish();else if(event.key==='Escape')editor.arrowDrawMode.value=false;else{points.value=points.value.slice(0,-1);cursor.value=null}}}
  onMounted(()=>window.addEventListener('keydown',key,true));onBeforeUnmount(()=>{stopDrag?.();window.removeEventListener('keydown',key,true)})
  return{points,preview,down,hover,finish}
}
