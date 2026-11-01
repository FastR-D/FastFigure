import { writeFileSync } from 'node:fs'

/** Offline diagnostic, no model calls or automatic acceptance threshold. Use an isolated page. */
export async function auditReconstructionPixels(page,figure,prefix) {
  const source=figure.references.find(r=>r.sha256===figure.containers[0].reconstruction?.referenceSha256)
  if(!source)throw new Error('Pixel comparison needs the attached source reference')
  const size=await page.evaluate(async doc=>{
    const {exportSvg}=await import('/src/core/svg.ts'),record=doc.containers[0].reconstruction
    await document.fonts.load('400 20px Inter');await document.fonts.load('700 20px Inter');await document.fonts.load('16px MiSans')
    const width=Math.round(record.sourceWidth*record.region.width),height=Math.round(record.sourceHeight*record.region.height)
    const svg=new DOMParser().parseFromString(exportSvg(doc),'image/svg+xml').documentElement
    svg.id='reconstruction-proof';svg.setAttribute('viewBox',`${record.origin.x} ${record.origin.y} ${width*record.scale} ${height*record.scale}`);svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));svg.style.display='block'
    document.querySelector('#app')?.remove();document.querySelector('#reconstruction-proof')?.remove();document.body.style.cssText='margin:0;background:white';document.body.append(svg)
    return {width,height,region:record.region}
  },figure)
  const native=await page.locator('#reconstruction-proof').screenshot({path:`${prefix}-native.png`})
  const result=await page.evaluate(async ({source,native,size})=>{
    const image=async url=>{const img=new Image();img.src=url;await img.decode();return img}
    const [reference,candidate]=await Promise.all([image(source),image(`data:image/png;base64,${native}`)]),{width:w,height:h,region:r}=size
    const expected=document.createElement('canvas'),actual=document.createElement('canvas');expected.width=actual.width=w;expected.height=actual.height=h
    const e=expected.getContext('2d'),a=actual.getContext('2d');e.fillStyle=a.fillStyle='#fff';e.fillRect(0,0,w,h);a.fillRect(0,0,w,h)
    e.drawImage(reference,r.x*reference.width,r.y*reference.height,r.width*reference.width,r.height*reference.height,0,0,w,h);a.drawImage(candidate,0,0,w,h)
    const x=e.getImageData(0,0,w,h).data,y=a.getImageData(0,0,w,h).data,diff=document.createElement('canvas');diff.width=w;diff.height=h;const d=diff.getContext('2d'),pixels=d.createImageData(w,h)
    let error=0,blankError=0,pixelsAbove16=0,intersection=0,union=0
    for(let i=0;i<x.length;i+=4){let maximum=0,sourceInk=false,resultInk=false;for(let c=0;c<3;c++){const delta=Math.abs(x[i+c]-y[i+c]);maximum=Math.max(maximum,delta);error+=delta;blankError+=255-x[i+c];sourceInk||=x[i+c]<245;resultInk||=y[i+c]<245;pixels.data[i+c]=Math.min(255,delta*4)}pixels.data[i+3]=255;if(maximum>16)pixelsAbove16++;if(sourceInk&&resultInk)intersection++;if(sourceInk||resultInk)union++}
    d.putImageData(pixels,0,0)
    const board=document.createElement('canvas');board.width=w*3;board.height=h+42;const ctx=board.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,board.width,board.height);ctx.font='16px Inter';ctx.fillStyle='#243247'
    for(const [i,label]of ['Reference target','Editable reconstruction','Absolute difference ×4'].entries())ctx.fillText(label,i*w+14,27)
    ctx.drawImage(expected,0,42);ctx.drawImage(actual,w,42);ctx.drawImage(diff,w*2,42)
    return {metrics:{totalPixels:w*h,meanChannelDifference:error/(w*h*3),blankWhiteMeanChannelDifference:blankError/(w*h*3),pixelsAbove16,foregroundIntersectionOverUnion:union?intersection/union:1,foregroundThreshold:245,note:'Single-sample diagnostic, no automatic acceptance threshold; low average error can hide missing small text or connectors.'},image:board.toDataURL('image/png').split(',')[1]}
  },{source:source.dataUrl,native:native.toString('base64'),size})
  writeFileSync(`${prefix}-comparison.png`,Buffer.from(result.image,'base64'));writeFileSync(`${prefix}-pixels.json`,JSON.stringify(result.metrics,null,2))
  return result.metrics
}
