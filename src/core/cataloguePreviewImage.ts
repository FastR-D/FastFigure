import {catalogueAsset,type CatalogueEntry} from './catalogue.ts'
import {cataloguePreviewLayout,catalogueSnapshotJson} from './cataloguePreview.ts'
import {cataloguePreviewSchema} from './cataloguePreviewContract.ts'
import {rootContainer} from './model.ts'
import {rasterizeFigure} from './figureRaster.ts'
const digest=async(bytes:BufferSource)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('')

export async function prepareCataloguePreview(entries:CatalogueEntry[]){
  const layout=cataloguePreviewLayout(entries),snapshotSha256=await digest(new TextEncoder().encode(catalogueSnapshotJson(entries)))
  const canvas=document.createElement('canvas');canvas.width=layout.width;canvas.height=layout.height;const context=canvas.getContext('2d');if(!context)throw new Error('浏览器无法生成组件图谱')
  context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height)
  const fonts=new Set<string>(),headingFont='600 16px MiSans',keyFont='400 12px "JetBrains Mono"'
  for(const [index,entry]of entries.entries()){
    const asset=catalogueAsset(entry),root=rootContainer(asset.figure),tile=layout.tiles[index]!,viewport={x:-8,y:-8,width:root.width+16,height:root.height+16},scale=Math.min(768/viewport.width,412/viewport.height),width=Math.max(3,Math.round(viewport.width*scale)),height=Math.max(3,Math.round(viewport.height*scale))
    const rendered=await rasterizeFigure(asset.figure,viewport,width,height);rendered.fonts.forEach(font=>fonts.add(font))
    await document.fonts.load(headingFont,asset.name);await document.fonts.load(keyFont,tile.key);fonts.add(headingFont);fonts.add(keyFont)
    context.strokeStyle='#d6dde7';context.strokeRect(tile.x+.5,tile.y+.5,tile.width-1,tile.height-1)
    context.fillStyle='#182538';context.font=headingFont;context.fillText(`${tile.index}. ${asset.name} · ${entry.kind==='asset'?'保存快照':'默认配置'}`,tile.x+16,tile.y+23,768)
    context.font=keyFont;context.fillStyle='#52647a';context.fillText(tile.key,tile.x+16,tile.y+43,768)
    context.drawImage(rendered.canvas,tile.x+(800-width)/2,tile.y+56+(412-height)/2)
  }
  let dataUrl='';for(const quality of [.96,.88,.76,.6]){dataUrl=canvas.toDataURL('image/webp',quality);if(dataUrl.length<=600_000)break}
  if(dataUrl.length>600_000)throw new Error('组件图谱超过本轮容量，请减少所选组件')
  const bytes=Uint8Array.from(atob(dataUrl.split(',')[1]!),char=>char.charCodeAt(0))
  return cataloguePreviewSchema.parse({version:1,renderer:'fastfigure-browser-v1',snapshotSha256,sha256:await digest(bytes),...layout,fonts:[...fonts],dataUrl})
}

/** Render every frozen candidate; never trim the pool to the final six selected items. */
export async function prepareSelectionPreviews(entries:CatalogueEntry[],signal?:AbortSignal){
  const {selectionPreviewGroups}=await import('./selectionPreviews.ts'),pages=[]
  for(const group of selectionPreviewGroups(entries)){signal?.throwIfAborted();pages.push(await prepareCataloguePreview(group));signal?.throwIfAborted()}
  return pages
}
