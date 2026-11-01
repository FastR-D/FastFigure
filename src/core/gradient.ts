import {z} from 'zod'
import {identity,inverse,type Affine} from './affine.ts'
import type {FigureNode} from './model.ts'

const number=z.number().finite().min(-1e7).max(1e7)
export const linearGradientSchema=z.object({
  type:z.literal('linear'),
  // t = a*u + b*v + c. A covector preserves the paint under arbitrary affine transforms.
  vector:z.tuple([number,number,number]).refine(v=>Math.hypot(v[0],v[1])>1e-12,'渐变方向不能退化'),
  stops:z.array(z.object({offset:z.number().min(0).max(1),color:z.string().regex(/^#[a-f\d]{6}$/i),opacity:z.number().min(0).max(1).default(1)}).strict()).min(2).max(32).refine(s=>s.every((p,i)=>!i||p.offset>=s[i-1]!.offset),'渐变停靠点必须按位置排序'),
  spread:z.enum(['pad','reflect','repeat']).default('pad'),
  interpolation:z.enum(['sRGB','linearRGB']).default('sRGB'),
}).strict()
export type LinearGradient=z.infer<typeof linearGradientSchema>
export const supportsGradient=(kind:string)=>!['text','icon','port'].includes(kind)
type Box=Pick<FigureNode,'x'|'y'|'width'|'height'>
const size=(box:Box)=>({w:box.width||box.height,h:box.height||box.width})
export function gradientFromSource(vector:[number,number,number],matrix:Affine,box:Box):[number,number,number]{
  const inv=inverse([matrix[0],matrix[1],matrix[2],matrix[3]]),a=vector[0]*inv[0]+vector[1]*inv[1],b=vector[0]*inv[2]+vector[1]*inv[3]
  const c=vector[2]-a*matrix[4]-b*matrix[5],{w,h}=size(box)
  return [a*w,b*h,c+a*box.x+b*box.y]
}
export function gradientCoordinates(gradient:LinearGradient,box:Box,matrix:Affine=identity){
  const {w,h}=size(box),[u,v,c]=gradient.vector,a=u/w,b=v/h
  const x=a*matrix[0]+b*matrix[1],y=a*matrix[2]+b*matrix[3],offset=c-a*box.x-b*box.y+a*matrix[4]+b*matrix[5],d=x*x+y*y
  return {x1:-offset*x/d,y1:-offset*y/d,x2:(1-offset)*x/d,y2:(1-offset)*y/d}
}
export function defaultGradient(first='#c7ddeb',last='#496b8a'):LinearGradient{return {type:'linear',vector:[1,0,0],stops:[{offset:0,color:first,opacity:1},{offset:1,color:last,opacity:1}],spread:'pad',interpolation:'sRGB'}}
