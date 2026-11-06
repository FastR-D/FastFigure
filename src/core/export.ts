import { clone, type FigureDocument } from './model'
import { outputFrame } from './outputFrame'
import { isPaperStyle } from './paperStyle'

export function pngSize(doc: FigureDocument) {
  const frame = outputFrame(doc)
  return { width: Math.round(frame.width * 2), height: Math.round(frame.height * 2) }
}

export async function exportPng(doc: FigureDocument): Promise<Blob> {
  const snapshot = clone(doc), frame = outputFrame(snapshot), { width, height } = pngSize(snapshot)
  const { rasterizeFigure } = await import('./figureRaster')
  const { canvas } = await rasterizeFigure(snapshot, frame, width, height, snapshot.publication?.showTitle ?? !isPaperStyle(snapshot.style))
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG 编码失败，请重试')), 'image/png'))
}

export function downloadFile(name: string, content: string | Blob, type: string) {
  const url = URL.createObjectURL(typeof content === 'string' ? new Blob([content], { type }) : content)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
