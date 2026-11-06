import {canvasDimensionSchema} from './canvasContract'
import {childrenOf,contains,contentBounds} from './geometry'
import {rootContainer,type FigureDocument} from './model'

/** Resize the workspace frame without rescaling authored geometry or text. */
export function resizeCanvas(doc:FigureDocument,width:number,height:number){
  if(!canvasDimensionSchema.safeParse(width).success||!canvasDimensionSchema.safeParse(height).success)throw new Error('画布宽高须为 100–4096 的整数')
  const root=rootContainer(doc),frame=doc.canvas.frame
  if(frame&&(frame.x+frame.width>width||frame.y+frame.height>height))throw new Error('出图裁切区域超出新画布，请先调整裁切区域')
  const next={...root}
  if(root.role==='stage'&&!root.reconstruction&&!root.dataChart){
    next.width=width-root.x-(doc.canvas.width-root.x-root.width)
    next.height=height-root.y-(doc.canvas.height-root.y-root.height)
  }
  if(next.width<=0||next.height<=0||!contains({x:0,y:0,width,height},next)||childrenOf(doc,root.id).some(child=>!contains(contentBounds(next),child)))throw new Error('新画布无法容纳现有图件，请先移动内容或增大画布')
  root.width=next.width;root.height=next.height;doc.canvas.width=width;doc.canvas.height=height
}
