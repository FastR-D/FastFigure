import type { FigureDocument } from './model'
import type { Rect } from './geometry'
import { exportSceneSvg } from './svg'

/** Rasterize browser-shaped glyphs in place; SVG-as-image cannot reliably load web fonts. */
export async function rasterizeFigure(figure:FigureDocument,viewport:Rect,width:number,height:number,showTitle=false){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>8192||height>8192)throw new Error('图件渲染尺寸无效')
  if(![viewport.x,viewport.y,viewport.width,viewport.height].every(Number.isFinite)||viewport.width<=0||viewport.height<=0)throw new Error('图件渲染范围无效')
  const holder=document.createElement('div');holder.style.cssText='position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none'
  const xml=new DOMParser().parseFromString(exportSceneSvg(figure,viewport,width,height,showTitle),'image/svg+xml'),svg=document.importNode(xml.documentElement,true) as unknown as SVGSVGElement
  holder.append(svg);document.body.append(holder)
  const fonts=new Set<string>();let glyphPixels=0
  try{
    for(const t of [...svg.querySelectorAll('text')]){
      const style=getComputedStyle(t),font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      // Chromium clamps glyph metrics at extreme CTMs; reject before measuring or culling them.
      const matrix=t.getScreenCTM(),pixels=parseFloat(style.fontSize)*Math.max(Math.hypot(matrix?.a??1,matrix?.b??0),Math.hypot(matrix?.c??0,matrix?.d??1))*2
      if(!Number.isFinite(pixels)||pixels>8192)throw new Error('文字变换超过候选渲染预算，请扩大裁片范围或降低输出尺寸')
      await document.fonts.load(font,t.textContent??'');fonts.add(font)
    }
    const area=svg.getBoundingClientRect()
    for(const t of [...svg.querySelectorAll('text')]){
      const screen=t.getBoundingClientRect();if(screen.right<area.left||screen.left>area.right||screen.bottom<area.top||screen.top>area.bottom){t.remove();continue}
      const style=getComputedStyle(t),font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,box=t.getBBox(),baseline=t.getAttribute('dominant-baseline')
      t.setAttribute('dominant-baseline','alphabetic');const alphabetic=t.getBBox();if(baseline===null)t.removeAttribute('dominant-baseline');else t.setAttribute('dominant-baseline',baseline)
      const pad=Math.max(2,parseFloat(style.fontSize)*.25,parseFloat(style.strokeWidth)*2),x=box.x-pad,y=box.y-pad,w=box.width+pad*2,h=box.height+pad*2
      const matrix=t.getScreenCTM(),scale=Math.max(1,Math.hypot(matrix?.a??1,matrix?.b??0),Math.hypot(matrix?.c??0,matrix?.d??1))*2
      const spriteWidth=Math.ceil(w*scale),spriteHeight=Math.ceil(h*scale);glyphPixels+=spriteWidth*spriteHeight
      if(!Number.isFinite(glyphPixels)||spriteWidth>8192||spriteHeight>8192||glyphPixels>32_000_000)throw new Error('文字变换超过候选渲染预算，请选择较小分区')
      const sprite=document.createElement('canvas');sprite.width=spriteWidth;sprite.height=spriteHeight
      const ctx=sprite.getContext('2d');if(!ctx)throw new Error('浏览器无法生成候选文字')
      ctx.scale(scale,scale);ctx.translate(-x,-y);ctx.font=font;ctx.textBaseline='alphabetic';ctx.textAlign=style.textAnchor==='middle'?'center':style.textAnchor==='end'?'end':'start';ctx.direction=style.direction==='rtl'?'rtl':'ltr';ctx.letterSpacing=style.letterSpacing==='normal'?'0px':style.letterSpacing
      const tx=Number(t.getAttribute('x')??0),ty=Number(t.getAttribute('y')??0)+box.y-alphabetic.y,label=t.textContent??''
      if(style.fill!=='none'){ctx.fillStyle=style.fill;ctx.globalAlpha=Number(style.fillOpacity);ctx.fillText(label,tx,ty)}
      if(style.stroke!=='none'){ctx.strokeStyle=style.stroke;ctx.lineWidth=parseFloat(style.strokeWidth);ctx.globalAlpha=Number(style.strokeOpacity);ctx.lineJoin=style.strokeLinejoin as CanvasLineJoin;ctx.lineCap=style.strokeLinecap as CanvasLineCap;ctx.miterLimit=parseFloat(style.strokeMiterlimit);if(style.strokeDasharray!=='none')ctx.setLineDash(style.strokeDasharray.split(/[ ,]+/).map(n=>parseFloat(n)));ctx.lineDashOffset=parseFloat(style.strokeDashoffset);ctx.strokeText(label,tx,ty)}
      const image=document.createElementNS(svg.namespaceURI,'image');for(const [key,value] of Object.entries({x,y,width:sprite.width/scale,height:sprite.height/scale,href:sprite.toDataURL('image/png')}))image.setAttribute(key,String(value))
      for(const key of ['transform','opacity'])if(t.hasAttribute(key))image.setAttribute(key,t.getAttribute(key)!)
      t.replaceWith(image)
    }
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('浏览器无法生成候选渲染')
    const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'})),image=new Image()
    try{image.src=url;await image.decode();ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);return{canvas,fonts:[...fonts]}}finally{URL.revokeObjectURL(url)}
  }finally{holder.remove()}
}
