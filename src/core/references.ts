import { evidenceRegionSchema, referenceImageSchema, type ComponentSource, type EvidenceRegion, type ReferenceImage } from './model'
import type { Rect } from './geometry'
import { cacheOriginalImage,originalImage } from './originalImages'
import {imageDraftBundleSchema,type ImageDraftOrigin} from './imageDraftContract.ts'

export const wholeImage: EvidenceRegion = { x: 0, y: 0, width: 1, height: 1 }
export function fitReference(image: Pick<ReferenceImage, 'pixelWidth' | 'pixelHeight'>, area: Rect): Rect {
  const scale = Math.min(area.width / image.pixelWidth, area.height / image.pixelHeight)
  const width = image.pixelWidth * scale, height = image.pixelHeight * scale
  return { x: area.x + (area.width - width) / 2, y: area.y + (area.height - height) / 2, width, height }
}
export function resizeReference(image: ReferenceImage, width: number): Rect {
  const maximum = Math.min(2000, 2000 * image.pixelWidth / image.pixelHeight)
  width = Math.max(1, Math.min(maximum, width))
  return { ...image.placement, width, height: width * image.pixelHeight / image.pixelWidth }
}
export function referenceSource(image: ReferenceImage, region: EvidenceRegion): ComponentSource {
  return { title: image.title, reference: image.citation || image.fileName,...(image.generated?{generated:{...image.generated}}:{}),
    image: { sha256: image.sha256, fileName: image.fileName, width: image.pixelWidth, height: image.pixelHeight, region: evidenceRegionSchema.parse(region) } }
}
export async function readGeneratedReference(file:File,origin:ImageDraftOrigin,area:Rect){
  const image=await readReferenceImage(file,area)
  if(image.sha256!==origin.sha256)throw new Error('生成图片与来源指纹不符，当前工程未改变')
  const cached=await originalImage(image.sha256),bitmap=cached?undefined:await createImageBitmap(file),size=cached??bitmap!
  const valid=size.width===origin.width&&size.height===origin.height;bitmap?.close();if(!valid)throw new Error('生成图片与记录尺寸不符')
  return referenceImageSchema.parse({...image,title:origin.title,citation:`AI 视觉设计草稿 · Codex 图像生成 · ${origin.runId}`,generated:{runId:origin.runId,sha256:origin.sha256,provider:origin.provider,illustrative:true}})
}
export async function readImageDraftBundle(file:File,area:Rect){
  if(file.size>17_000_000)throw new Error('草稿包不能超过 17 MB')
  const bundle=imageDraftBundleSchema.parse(JSON.parse(await file.text())),bytes=Uint8Array.from(atob(bundle.image.base64),char=>char.charCodeAt(0)),extension=bundle.image.mime==='image/png'?'png':bundle.image.mime==='image/jpeg'?'jpg':'webp'
  const reference=await readGeneratedReference(new File([bytes],`ai-draft-${bundle.origin.runId}.${extension}`,{type:bundle.image.mime}),bundle.origin,area)
  return{reference,origin:bundle.origin}
}
export function normalizedRegion(a: { x: number; y: number }, b: { x: number; y: number }): EvidenceRegion {
  const clamp = (value: number) => Math.max(0, Math.min(1, value))
  const x = clamp(Math.min(a.x, b.x)), y = clamp(Math.min(a.y, b.y))
  return { x, y, width: Math.max(0, clamp(Math.max(a.x, b.x)) - x), height: Math.max(0, clamp(Math.max(a.y, b.y)) - y) }
}

/** Decode local raster files, bound the embedded image, and retain the original file fingerprint. */
export async function readReferenceImage(file: File, area: Rect): Promise<ReferenceImage> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('请选择 PNG、JPEG 或 WebP 图片')
  if (file.size > 12_000_000) throw new Error('原图不能超过 12 MB')
  const bytes = await file.arrayBuffer()
  const header = new Uint8Array(bytes)
  const valid = file.type === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => header[i] === v)
    : file.type === 'image/jpeg' ? header[0] === 255 && header[1] === 216 && header[2] === 255
      : String.fromCharCode(...header.slice(0, 4)) === 'RIFF' && String.fromCharCode(...header.slice(8, 12)) === 'WEBP'
  if (!valid) throw new Error('图片内容与格式不符，请重新选择')
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file) } catch { throw new Error('图片无法解码，请换一张有效图片') }
  try {
    if (bitmap.width * bitmap.height > 24_000_000) throw new Error('原图不能超过 2400 万像素')
    if (bitmap.width / bitmap.height > 50 || bitmap.height / bitmap.width > 50) throw new Error('图片过长，请先裁剪需要重绘的区域')
    const hash = await crypto.subtle.digest('SHA-256', bytes)
    const sha256 = [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('')
    const canvas = document.createElement('canvas'), context = canvas.getContext('2d')
    if (!context) throw new Error('当前浏览器无法处理图片')
    let scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height)), dataUrl = ''
    for (let attempt = 0; attempt < 5; attempt++, scale *= 0.8) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      for (const quality of [0.94, 0.84, 0.72]) {
        dataUrl = canvas.toDataURL('image/webp', quality)
        if (dataUrl.length <= 600_000) break
      }
      if (dataUrl.length <= 600_000) break
    }
    if (dataUrl.length > 600_000) throw new Error('图片压缩后仍过大，请裁剪后再导入')
    const image = { id: `ref-${crypto.randomUUID()}`, title: (file.name.replace(/\.[^.]+$/, '').trim() || '参考图').slice(0, 100),
      citation: '', fileName: file.name.slice(0, 200), sha256, pixelWidth: canvas.width, pixelHeight: canvas.height, dataUrl }
    const reference=referenceImageSchema.parse({ ...image, placement: fitReference(image, area) })
    await cacheOriginalImage(sha256,file,bitmap.width,bitmap.height)
    return reference
  } finally { bitmap.close() }
}
