import type { FigureDocument } from './model'
import { originalImage } from './originalImages'
import { reconstructionImageSchema, type ReconstructionTask } from './reconstructionContract'
import { reconstructionImageRect, referenceForReconstruction } from './reconstruction'

/** Crop original pixels when available; never replace or inflate the portable preview. */
export async function prepareReconstructionImage(doc:FigureDocument,task:ReconstructionTask){
  const reference=referenceForReconstruction(doc,task),sourceRect=reconstructionImageRect(doc,task),cached=await originalImage(reference.sha256)
  let bitmap:ImageBitmap|undefined,quality:'original'|'preview'='preview'
  if(cached)try{bitmap=await createImageBitmap(cached.blob);quality='original'}catch{ /* A missing or corrupt optional cache must not prevent preview-based work. */ }
  bitmap??=await createImageBitmap(await(await fetch(reference.dataUrl)).blob())
  try{
    const x=sourceRect.x/reference.pixelWidth*bitmap.width,y=sourceRect.y/reference.pixelHeight*bitmap.height,w=sourceRect.w/reference.pixelWidth*bitmap.width,h=sourceRect.h/reference.pixelHeight*bitmap.height
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d');if(!context)throw new Error('当前浏览器无法生成参考裁片')
    let scale=Math.min(1,2000/Math.max(w,h)),dataUrl=''
    for(let i=0;i<5;i++,scale*=.8){
      canvas.width=Math.max(3,Math.round(w*scale));canvas.height=Math.max(3,Math.round(h*scale))
      context.drawImage(bitmap,x,y,w,h,0,0,canvas.width,canvas.height)
      for(const compression of [.96,.88,.76]){dataUrl=canvas.toDataURL('image/webp',compression);if(dataUrl.length<=600_000)break}
      if(dataUrl.length<=600_000)break
    }
    if(dataUrl.length>600_000)throw new Error('局部图片超过本轮预算，请缩小重建区域')
    return reconstructionImageSchema.parse({referenceSha256:reference.sha256,sourceRect,width:canvas.width,height:canvas.height,originalWidth:bitmap.width,originalHeight:bitmap.height,quality,dataUrl})
  }finally{bitmap.close()}
}
