import {parseAsset,type ComponentAsset} from './assets.ts'
import {createBlank} from './model.ts'
import type {ImageDraftOrigin} from './imageDraftContract.ts'


const digest=async(bytes:ArrayBuffer)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('')
/** Decode and bound user-selected bytes; preserve alpha, and retain AI origin separately from the portable image. */
export async function readImageAsset(blob:Blob,title:string,origin?:ImageDraftOrigin):Promise<ComponentAsset>{
  if(!['image/png','image/jpeg','image/webp'].includes(blob.type)||blob.size>12_000_000)throw new Error('请选择不超过 12 MB 的 PNG、JPEG 或 WebP 图片')
  const sourceSha=await digest(await blob.arrayBuffer())
  if(origin&&origin.sha256!==sourceSha)throw new Error('插画原图与 AI 生成记录的指纹不符')
  const bitmap=await createImageBitmap(blob)
  try{
    if(bitmap.width*bitmap.height>24_000_000)throw new Error('插画最多 2400 万像素')
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw new Error('浏览器无法读取插画')
    let dataUrl='',scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height))
    for(let i=0;i<6;i++,scale*=.8){canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);dataUrl=canvas.toDataURL('image/webp',.94);if(dataUrl.length<=900_000)break}
    if(dataUrl.length>900_000)throw new Error('图片压缩后仍超过素材容量，请裁小后再导入')
    const encoded=await(await fetch(dataUrl)).arrayBuffer(),sha256=await digest(encoded),figure=createBlank(),root=figure.containers[0]!,s=Math.min(1,280/canvas.width,200/canvas.height),width=Math.max(1,canvas.width*s),height=Math.max(1,canvas.height*s),name=title.trim().slice(0,100)||'图片素材',now=new Date().toISOString()
    Object.assign(root,{x:0,y:0,width:width+4,height:height+4,role:'component',title:name,visual:{fill:'none',stroke:'none'}})
    const evidence={title:origin?`AI 插画：${name}`:name,reference:origin?'平台生成的示意插画，保留原始生成记录':'用户导入的图片素材',image:{sha256:sourceSha,fileName:`${name}.${blob.type.split('/')[1]}`,width:canvas.width,height:canvas.height,region:{x:0,y:0,width:1,height:1}},...(origin?{generated:{runId:origin.runId,sha256:origin.sha256,provider:origin.provider,illustrative:true as const}}:{})}
    figure.nodes=[{id:'illustration',parentId:'stage',kind:'image',label:'',name,x:2,y:2,width,height,image:{dataUrl,sha256,pixelWidth:canvas.width,pixelHeight:canvas.height,fit:'contain',alt:name},evidence}]
    if(origin)figure.imageDrafts=[origin]
    return parseAsset({format:'fastfigure.component',version:1,id:`image-${crypto.randomUUID()}`,name,description:'可缩放的图片插画；图片内部保持位图，可与原生文字和结构组合。',tags:['插画','图片',...(origin?['AI 生成']:[])],createdAt:now,updatedAt:now,sources:[evidence],lineage:[],figure})
  }finally{bitmap.close()}
}
