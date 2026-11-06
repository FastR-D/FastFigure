import {parseDocument,type FigureDocument} from './model.ts'
import {resolveStyle} from './geometry.ts'
import {canvasContainerTextStyle} from './typography.ts'
import {measureTextEvidence} from './textGeometry.ts'
import {isPaperStyle} from './paperStyle.ts'

/** The canvas stores headings as ordinary text objects, independent of frames. */
export function editableFigure(input:unknown):FigureDocument{
  const doc=parseDocument(input),ids=new Set([...doc.nodes,...doc.containers].map(o=>o.id))
  for(const c of doc.containers){
    if(c.titleDetached||c.role==='component')continue
    c.titleDetached=true
    if(doc.nodes.some(n=>n.parentId===c.id&&n.titleBlock))continue
    const theme=resolveStyle(doc,c.id)
    if(c.dataChart||c.reconstruction||c.sharedLegend||c.sharedColorbar||isPaperStyle(theme)&&c.id==='stage'&&!c.visual&&c.title==='Method overview')continue
    const units=c.metricScale??1,style=canvasContainerTextStyle(c,theme)
    const width=Math.min(c.width-24*units,measureTextEvidence(c.title,style).width+24*units),height=Math.min(c.height-24*units,style.size*1.2+8*units)
    let id=`${c.id.slice(0,65)}-title`,suffix=1
    while(ids.has(id))id=`${c.id.slice(0,65)}-title-${suffix++}`
    ids.add(id)
    doc.nodes.push({id,parentId:c.id,kind:'text',titleBlock:true,textRole:'heading',label:c.title,
      x:style.align==='center'?c.x+(c.width-width)/2:style.align==='right'?c.x+c.width-12*units-width:c.x+12*units,
      y:c.y+12*units,width,height,...(units!==1?{metricScale:units}:{}),
      textStyle:{align:style.align,...c.textStyle},visual:{padding:4*units,handDrawn:false}})
  }
  return parseDocument(doc)
}
