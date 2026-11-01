import {clone,isPrimitive,parseDocument,type FigureDocument,type FigureNode} from './model.ts'
import {allObjects,ancestors,contains,contentBounds,findObject,fitTransparentAncestors,resolveStyle,type Rect} from './geometry.ts'
import {checkFigureText} from './figureTextCheck.ts'
import {nodeVisual,type SvgElement} from './svg.ts'
import {measureTextEvidence,reflowText} from './textGeometry.ts'
import {routeFigure} from './routing.ts'
import {fontStack} from '../data/materials.ts'

export interface TextFitRow {nodeId:string;label:string;status:'fitted'|'unchanged'|'blocked'|'skipped';before:Rect;after:Rect;reason:string;engine?:'canvas'|'estimate';expandedGroups:string[]}
export interface TextFitOptions {anchor:'center'|'top-left';expandGroups:boolean;positionedText?:'preserve'|'reflow'}
const rect=(node:Rect):Rect=>({x:node.x,y:node.y,width:node.width,height:node.height})
const area=(a:Rect,b:Rect)=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y))
const transparent=(c:FigureDocument['containers'][number])=>c.role==='component'&&c.visual?.fill==='none'&&c.visual.stroke==='none'

/** Read the renderer's actual lines; canvas checks use the current browser's loaded faces. */
export function inspectTextFrame(doc:FigureDocument,node:FigureNode){
  const plain={...node,visual:{...node.visual,handDrawn:false}},theme=resolveStyle(doc,node.parentId),report=checkFigureText({...doc,nodes:[plain]},80),scale=node.metricScale??1
  const fields=new Map<string,{width:number;height:number;texts:{value:string;attrs:Record<string,unknown>;family:string}[]}>(),elements:{value:string;attrs:Record<string,unknown>;family:string}[]=[]
  function visit(element:SvgElement|string,family=fontStack(theme.fontFamily)){
    if(typeof element==='string')return
    const attrs=element.attrs??{},face=String(attrs['font-family']??family)
    if(element.tag==='text'){
      const value=(element.children??[]).filter((c):c is string=>typeof c==='string').join(''),field=String(attrs['data-edit-field']??'')
      elements.push({value,attrs,family:face})
      if(attrs['data-text-field'])fields.set(field,{width:Number(attrs['data-text-width'])*scale,height:Number(attrs['data-text-height'])*scale,texts:[]})
    }
    element.children?.forEach(child=>visit(child,face))
  }
  nodeVisual(plain,{...doc,style:theme}).forEach(element=>visit(element))
  for(const item of elements)fields.get(String(item.attrs['data-edit-field']??''))?.texts.push(item)
  const glyphIssues:string[]=[];let engine:'canvas'|'estimate'='estimate',widthDeficit=0
  for(const [field,slot]of fields){
    let top=Infinity,bottom=-Infinity
    for(const item of slot.texts){
      const a=item.attrs,size=Number(a['font-size']??16)*scale,metrics=measureTextEvidence(item.value,{size,weight:Number(a['font-weight']??400),italic:a['font-style']==='italic',letterSpacing:Number(a['letter-spacing']??0)*scale},item.family)
      engine=metrics.engine
      const width=Math.max(metrics.width,metrics.inkWidth),y=Number(a.y??0)*scale
      if(width>slot.width+.05){glyphIssues.push(`${field}：字形宽度不足`);widthDeficit=Math.max(widthDeficit,width-slot.width)}
      top=Math.min(top,y-metrics.ascent);bottom=Math.max(bottom,y+metrics.descent)
    }
    if(slot.texts.length&&bottom-top>slot.height+.05)glyphIssues.push(`${field}：字形高度不足`)
  }
  return{fits:report.total===0&&!glyphIssues.length,engine,layout:report,glyphIssues:[...new Set(glyphIssues)],widthDeficit}
}

function growthArea(doc:FigureDocument,node:FigureNode,expand:boolean){
  let padding=0,parent=doc.containers.find(c=>c.id===node.parentId)
  while(parent&&expand&&transparent(parent)){padding+=2*(parent.metricScale??1);parent=parent.parentId?doc.containers.find(c=>c.id===parent!.parentId):undefined}
  const outer=parent?contentBounds(parent):{x:0,y:0,width:1000,height:620}
  return{x:outer.x+padding,y:outer.y+padding,width:outer.width-padding*2,height:outer.height-padding*2}
}
function collides(doc:FigureDocument,node:FigureNode,candidate:Rect){
  const parents=new Set(ancestors(doc,node.id))
  return allObjects(doc).some(other=>{
    if(other.id===node.id||parents.has(other.id)||'interfaceFor'in other&&other.interfaceFor)return false
    // Open strokes are not opaque rectangular walls. Connections are checked separately.
    if('kind'in other&&other.kind==='path'&&!other.path?.points.some(p=>p.close)&&(!other.visual?.fill||other.visual.fill==='none'))return false
    if('kind'in other&&!['text','icon','path','port'].includes(other.kind)&&contains(other,node))return !contains(other,candidate)
    return area(candidate,other)>area(node,other)+1e-5
  })
}
const grid=(minimum:number,maximum:number)=>[...new Set(Array.from({length:25},(_,i)=>minimum+(maximum-minimum)*i/24).map(n=>Math.round(n*1000)/1000).concat(minimum,maximum))]

/** Grow only. Failed targets remain intact and receive an explicit per-object report. */
export function fitTextFrames(doc:FigureDocument,ids:Set<string>,options:TextFitOptions){
  const reports:TextFitRow[]=[],nodes=doc.nodes.filter(n=>ids.has(n.id)),clearEdges=new Set([...routeFigure(doc)].filter(([,r])=>r.status==='clear').map(([id])=>id))
  for(const node of nodes){
    const before=rect(node),base={nodeId:node.id,label:node.label,before,after:before,expandedGroups:[] as string[]},parents=ancestors(doc,node.id)
    const managed=[node.id,...parents].some(id=>{const c=doc.containers.find(c=>c.id===id);return c?.dataChart||c?.sharedLegend||c?.sharedColorbar})
    if(managed||node.interfaceFor||['path','port','icon'].includes(node.kind)||!node.label&&!node.description||node.visual?.opacity===0||parents.some(id=>doc.containers.find(c=>c.id===id)?.opacity===0)){
      reports.push({...base,status:'skipped',reason:'保留图表管理对象、接口、图标、路径或无可见文字的对象'});continue
    }
    if(node.textLayout&&options.positionedText!=='reflow'){reports.push({...base,status:'skipped',reason:'定位文字保持；可明确选择重新排版导入文字'});continue}
    const initial=node.textLayout?null:inspectTextFrame(doc,node)
    if(initial?.fits){reports.push({...base,status:'unchanged',reason:'已有文字完整显示',engine:initial.engine});continue}
    const free=growthArea(doc,node,options.expandGroups),units=node.metricScale??1,cx=node.x+node.width/2,cy=node.y+node.height/2
    const maxWidth=Math.min(isPrimitive(node.kind)?1000:360*units,options.anchor==='center'?2*Math.min(cx-free.x,free.x+free.width-cx):free.x+free.width-node.x)
    const maxHeight=Math.min(isPrimitive(node.kind)?620:180*units,options.anchor==='center'?2*Math.min(cy-free.y,free.y+free.height-cy):free.y+free.height-node.y)
    const candidates:FigureNode[]=[]
    if(node.textLayout){const copy=clone(node);reflowText(copy);candidates.push(copy)}
    else if(maxWidth>=node.width&&maxHeight>=node.height){
      const widths=grid(node.width,maxWidth),heights=grid(node.height,maxHeight),hint=Math.min(maxWidth,node.width+(initial?.widthDeficit??0)+2*units)
      if(hint>node.width)widths.push(hint)
      for(const width of widths)for(const height of heights)if(width>node.width||height>node.height)candidates.push({...node,x:options.anchor==='center'?cx-width/2:node.x,y:options.anchor==='center'?cy-height/2:node.y,width,height})
      candidates.sort((a,b)=>a.width*a.height*(1+.08*Math.abs(Math.log(a.width/a.height/(node.width/node.height))))-b.width*b.height*(1+.08*Math.abs(Math.log(b.width/b.height/(node.width/node.height)))))
    }
    let chosen:{figure:FigureDocument;assessment:ReturnType<typeof inspectTextFrame>|null;groups:string[]}|undefined,routeBlocked=false,checks=0
    for(const candidate of candidates){
      if(!contains(free,candidate)||collides(doc,node,candidate))continue
      const assessment=candidate.textLayout?null:inspectTextFrame(doc,candidate)
      if(assessment&&!assessment.fits)continue
      if(checks++>=16)break
      const trial=clone(doc),target=trial.nodes.find(n=>n.id===node.id)!
      Object.assign(target,candidate)
      if(options.expandGroups)fitTransparentAncestors(trial,node.id)
      try{
        const valid=parseDocument(trial),routes=routeFigure(valid)
        if([...clearEdges].some(id=>routes.get(id)?.status==='blocked')){routeBlocked=true;continue}
        const groups=parents.filter(id=>{const a=findObject(doc,id)!,b=findObject(valid,id)!;return JSON.stringify(rect(a))!==JSON.stringify(rect(b))})
        chosen={figure:valid,assessment,groups};break
      }catch{continue}
    }
    if(chosen){
      Object.assign(doc,chosen.figure)
      reports.push({...base,status:JSON.stringify(node)===JSON.stringify(doc.nodes.find(n=>n.id===node.id))&&!chosen.groups.length?'unchanged':'fitted',after:rect(doc.nodes.find(n=>n.id===node.id)!),expandedGroups:chosen.groups,reason:node.textLayout?'保留基点和矩阵，重算字形框':'扩大文字框，保留字号、原文和结构',engine:chosen.assessment?.engine??measureTextEvidence(node.label,node.textStyle??{}).engine})
    }else reports.push({...base,status:'blocked',reason:routeBlocked?'可适配的尺寸会阻塞已有连接，请先留出连线空间':'现有边界、相邻对象或组件尺寸上限内空间不足；未缩字、移走邻居或删改原文',engine:initial?.engine})
  }
  return reports
}
