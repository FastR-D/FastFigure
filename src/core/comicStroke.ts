import {parseSvgPath} from './svgPath.ts'
import {identity,type Point} from './affine.ts'
import {sketchSeed} from './sketchStyle.ts'
import type {PathPoint} from './paths.ts'

const lerp=(a:Point,b:Point,t:number)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t})
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)
const number=(value:number)=>String(Number(value.toFixed(3)))
const point=(p:Point)=>`${number(p.x)} ${number(p.y)}`
const ease=(t:number)=>t*t*(3-2*t)

/** One continuous ink contour with soft, shallow deviations.
 * Long, uneven waves suggest a pen without distorting the frame.
 * Open endpoints stay fixed for attached arrows.
 * All noise uses relative geometry, so moving an object never changes its stroke. */
export function comicPath(data:string,seed:string,roughness=.45):string{
  if(roughness===0)return data
  let state=sketchSeed(seed)
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296}
  const signed=()=>random()*2-1
  const contours:PathPoint[][]=[]
  for(const p of parseSvgPath(data,identity)){
    if(!contours.length||p.move)contours.push([])
    contours.at(-1)!.push(p)
  }
  const output:string[]=[]
  for(const contour of contours){
    const closed=!!contour.at(-1)?.close
    const geometry=contour.flatMap(p=>[p,...(p.c1?[p.c1]:[]),...(p.c2?[p.c2]:[])])
    const minX=Math.min(...geometry.map(p=>p.x)),minY=Math.min(...geometry.map(p=>p.y))
    const width=Math.max(...geometry.map(p=>p.x))-minX,height=Math.max(...geometry.map(p=>p.y))-minY
    // A gentle shear breaks mechanical right angles without moving the center.
    const skewX=closed?signed()*Math.min(roughness*1.2,height*.04):0
    const skewY=closed?signed()*Math.min(roughness*1.2,width*.03):0
    const warp=(p:Point)=>({x:p.x+(height?((p.y-minY)/height-.5)*skewX:0),y:p.y+(width?((p.x-minX)/width-.5)*skewY:0)})
    let from:Point=contour[0]!
    output.push(`M${point(warp(from))}`)
    function segment(to:Point,c1?:Point,c2?:Point){
      const a=from,controls=[a,...(c1?[c1]:[]),...(c2?[c2]:[]),to]
      const evaluate=(t:number)=>{let row=controls;while(row.length>1)row=row.slice(1).map((p,i)=>lerp(row[i]!,p,t));return row[0]!}
      const length=controls.slice(1).reduce((sum,p,i)=>sum+distance(controls[i]!,p),0)
      if(length<2){output.push(`L${point(warp(to))}`);from=to;return}
      const amplitude=Math.min(roughness*2,length*.05,...(closed?[Math.min(width,height)*.045]:[]))
      // Unequal wave lengths and excursions avoid regular sine waves and tiny tremors.
      const knotCount=Math.max(2,Math.min(60,Math.ceil(length/64))),knots=[0]
      for(let i=1;i<=knotCount;i++)knots.push(knots[i-1]!+.65+random()*.7)
      const span=knots.at(-1)!
      for(let i=1;i<knots.length;i++)knots[i]!/=span
      let sign=signed()<0?-1:1
      const values=knots.map(()=>{const value=sign*(.5+random()*.5);sign*=-1;return value}),bow=signed()
      const wave=(t:number)=>{
        const i=Math.min(knotCount-1,Math.max(0,knots.findIndex(k=>k>=t)-1))
        const blend=ease((t-knots[i]!)/(knots[i+1]!-knots[i]!))
        return values[i]!+(values[i+1]!-values[i]!)*blend
      }
      const count=Math.max(4,Math.min(160,Math.ceil(length/10)))
      const samples=Array.from({length:count+1},(_,i)=>{
        const t=i/count,p=evaluate(t)
        if(i===0||i===count)return warp(p)
        const before=evaluate(Math.max(0,t-.005)),after=evaluate(Math.min(1,t+.005))
        const dx=after.x-before.x,dy=after.y-before.y,norm=Math.hypot(dx,dy)||1
        // Zero derivative at joins keeps rounded corners and ellipses smooth.
        const envelope=ease(Math.min(1,t/.18))*ease(Math.min(1,(1-t)/.18))
        const offset=amplitude*(.72*envelope*wave(t)+.28*Math.sin(Math.PI*t)**2*bow)
        return warp({x:p.x-dy/norm*offset,y:p.y+dx/norm*offset})
      })
      for(let i=1;i<samples.length;i++){
        const prev=samples[i-1]!,next=samples[i]!,p0=samples[Math.max(0,i-2)]!,p3=samples[Math.min(count,i+1)]!
        // Keep source tangents at joins; Catmull–Rom smooths the interior.
        const first=i===1?warp(lerp(a,controls[1]!, (controls.length-1)/count/3)):undefined
        const last=i===count?warp(lerp(to,controls.at(-2)!, (controls.length-1)/count/3)):undefined
        output.push(`C${point(first??{x:prev.x+(next.x-p0.x)/6,y:prev.y+(next.y-p0.y)/6})} ${point(last??{x:next.x-(p3.x-prev.x)/6,y:next.y-(p3.y-prev.y)/6})} ${point(next)}`)
      }
      from=to
    }
    for(const p of contour.slice(1))segment(p,p.c1,p.c2)
    if(closed){if(distance(from,contour[0]!)>.001)segment(contour[0]!);output.push('Z')}
  }
  return output.join(' ')
}
