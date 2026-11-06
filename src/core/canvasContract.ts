import {z} from 'zod'
export const minCanvasSize=100,maxCanvasSize=4096
export const canvasDimensionSchema=z.number().finite().int().min(minCanvasSize).max(maxCanvasSize)
