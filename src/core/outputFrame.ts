import {z} from 'zod'
import type {FigureDocument} from './model.ts'
import {maxCanvasSize} from './canvasContract.ts'

export const outputFrameSchema=z.object({x:z.number().finite().min(0).max(maxCanvasSize-1),y:z.number().finite().min(0).max(maxCanvasSize-1),width:z.number().finite().min(1).max(maxCanvasSize),height:z.number().finite().min(1).max(maxCanvasSize)}).strict().refine(f=>f.x+f.width<=maxCanvasSize+.001&&f.y+f.height<=maxCanvasSize+.001,'出图区域须位于画板内')
/** Keep editing coordinates stable while allowing portrait and wide publication frames. */
export function outputFrame(figure:FigureDocument){return figure.canvas.frame??{x:0,y:0,width:figure.canvas.width,height:figure.canvas.height}}
