import { captureComponent } from './assets'
import { rootContainer,type FigureDocument } from './model'
import { canonicalFigureJson,candidateRasterSchema } from './visualAudit'
import { reconstructionViewport } from './reconstruction'
import { prepareReconstructionImage } from './reconstructionImage'
import { rasterizeFigure } from './figureRaster'
import type { ReconstructionTask } from './reconstructionContract'
import {designRasterSchema} from './designReview'

/** Full-canvas review uses the same font-aware renderer as editable candidates. */
export async function prepareDesignReviewImage(figure:FigureDocument){
  const {width,height}=figure.canvas,scale=Math.min(1.6,2000/Math.max(width,height))
  const {canvas,fonts}=await rasterizeFigure(figure,{x:0,y:0,width,height},Math.round(width*scale),Math.round(height*scale))
  let dataUrl='';for(const quality of [.96,.88,.76,.6]){dataUrl=canvas.toDataURL('image/webp',quality);if(dataUrl.length<=1_000_000)break}
  if(dataUrl.length>1_000_000)throw new Error('整图审阅渲染超过预算，请简化图件后重试')
  const digest=async(bytes:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)))].map(b=>b.toString(16).padStart(2,'0')).join('')
  const figureSha256=await digest(new TextEncoder().encode(canonicalFigureJson(figure))),imageSha256=await digest(Uint8Array.from(atob(dataUrl.split(',')[1]!),c=>c.charCodeAt(0)))
  return designRasterSchema.parse({dataUrl,width:canvas.width,height:canvas.height,figureSha256,imageSha256,renderer:'fastfigure-browser-v1',viewport:`canvas-${width}x${height}`,fonts})
}

export async function prepareVisualAuditImages(figure:FigureDocument,task:Extract<ReconstructionTask,{kind:'repair'}>){
  const sourceImage=await prepareReconstructionImage(figure,task),candidate=captureComponent(figure,task.containerId,'Visual audit').figure,record=rootContainer(candidate).reconstruction!
  const source=await createImageBitmap(await(await fetch(sourceImage.dataUrl)).blob())
  try{
    const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('浏览器无法核对原图透明度');ctx.drawImage(source,0,0)
    const pixels=ctx.getImageData(0,0,source.width,source.height).data;let transparent=false;for(let i=3;i<pixels.length;i+=4)if(pixels[i]<255){transparent=true;break}
    if(transparent){ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);let dataUrl='';for(const quality of [.96,.88,.76,.6]){dataUrl=canvas.toDataURL('image/webp',quality);if(dataUrl.length<=600_000)break}if(dataUrl.length>600_000)throw new Error('白底原图裁片超过预算，请选择更小分区');sourceImage.dataUrl=dataUrl}
  }finally{source.close()}
  const {canvas,fonts}=await rasterizeFigure(candidate,reconstructionViewport(record,sourceImage.sourceRect),sourceImage.width,sourceImage.height)
  let dataUrl='';for(const quality of [.96,.88,.76,.6]){dataUrl=canvas.toDataURL('image/webp',quality);if(dataUrl.length<=1_000_000)break}
  if(dataUrl.length>1_000_000)throw new Error('候选裁片超过 1 MB，请选择更小的分区')
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalFigureJson(figure))),figureSha256=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')
  return{sourceImage,candidateImage:candidateRasterSchema.parse({dataUrl,width:canvas.width,height:canvas.height,figureSha256,renderer:'fastfigure-browser-v1',fonts})}
}
