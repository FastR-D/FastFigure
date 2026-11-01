import { z } from 'zod'
import { figureDocumentSchema, rootContainer } from './model'
import { reconstructionSceneSchema, type ReconstructionNode } from './reconstructionContract'
import { sceneForReconstruction } from './reconstruction'
import { parseSvgPath } from './svgPath'
import { identity } from './affine'
import type { PathPoint } from './paths'

const point=z.object({x:z.number().finite(),y:z.number().finite()}),box=z.object({x:z.number().finite(),y:z.number().finite(),w:z.number().nonnegative(),h:z.number().nonnegative()})
export const benchmarkObjectSchema=z.object({id:z.string(),kind:z.enum(['text','shape','stroke']),box,text:z.string().optional(),samples:z.array(point).max(2048).optional(),arrow:z.boolean().optional(),tip:point.optional(),direction:point.optional(),role:z.string().optional(),fill:z.string().optional(),stroke:z.string().optional()})
export const benchmarkCaseSchema=z.object({id:z.string(),title:z.string(),split:z.enum(['development','evaluation']),canvas:z.object({width:z.number().positive(),height:z.number().positive()}),objects:z.array(benchmarkObjectSchema).max(512)})
export type BenchmarkCase=z.infer<typeof benchmarkCaseSchema>
type Point=z.infer<typeof point>&{move?:boolean;close?:boolean;anchor?:boolean;curved?:boolean}
type Box=z.infer<typeof box>
interface Predicted {id:string;kind:'text'|'shape'|'stroke';box:Box;text?:string;samples:Point[];arrow?:boolean;tip?:Point;direction?:Point;fill?:string;stroke?:string;triangle?:boolean}
export const reconstructionEvaluationPolicy=Object.freeze({geometryIoU:.35,contourCoverage:.8,strokeTolerancePixels:3,strokeRecoveryCoverage:.8,arrowTipTolerancePixels:8,arrowDirectionCosine:.7,automaticAcceptance:false})
const norm=(value:string)=>value.normalize('NFC').replace(/\s+/gu,' ').trim()
export function characterDistance(a:string,b:string){const x=Array.from(norm(a)),y=Array.from(norm(b));let previous=y.map((_,i)=>i+1);previous.unshift(0)
  for(let i=1;i<=x.length;i++){const next=[i];for(let j=1;j<=y.length;j++)next.push(Math.min(next[j-1]!+1,previous[j]!+1,previous[j-1]!+(x[i-1]===y[j-1]?0:1)));previous=next}return previous[y.length]!
}
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)
const center=(b:Box)=>({x:b.x+b.w/2,y:b.y+b.h/2})
function iou(a:Box,b:Box){const intersection=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));return intersection/(a.w*a.h+b.w*b.h-intersection||1)}
/** Rectangular Hungarian assignment with unmatched slots, independent of prediction order/IDs. */
function assignment(cost:number[][]){const n=cost.length;if(!n)return[];const m=cost[0]!.length,u=Array(n+1).fill(0) as number[],v=Array(m+1).fill(0) as number[],p=Array(m+1).fill(0) as number[],way=Array(m+1).fill(0) as number[]
  for(let i=1;i<=n;i++){p[0]=i;let j0=0;const minimum=Array(m+1).fill(Infinity) as number[],used=Array(m+1).fill(false) as boolean[]
    do{used[j0]=true;const i0=p[j0]!;let delta=Infinity,j1=0;for(let j=1;j<=m;j++)if(!used[j]){const current=cost[i0-1]![j-1]!-u[i0]!-v[j]!;if(current<minimum[j]!){minimum[j]=current;way[j]=j0}if(minimum[j]!<delta){delta=minimum[j]!;j1=j}}for(let j=0;j<=m;j++)if(used[j]){u[p[j]!]+=delta;v[j]-=delta}else minimum[j]-=delta;j0=j1}while(p[j0]!==0)
    do{const j1=way[j0]!;p[j0]=p[j1]!;j0=j1}while(j0)
  }
  const result=Array(n).fill(-1) as number[];for(let j=1;j<=m;j++)if(p[j])result[p[j]!-1]=j-1;return result
}
function match<T,U>(expected:T[],actual:U[],cost:(a:T,b:U)=>number){return assignment(expected.map(a=>[...actual.map(b=>cost(a,b)),...expected.map(()=>.99)])).map((index,i)=>({expected:expected[i]!,actual:index<actual.length&&index>=0&&cost(expected[i]!,actual[index]!)<.99?actual[index]:undefined}))}
function samplePath(points:PathPoint[]){const result:Point[]=[];let start=points[0],previous=points[0]
  for(let i=0;i<points.length;i++){const p=points[i]!;if(i===0||p.move){start=p;previous=p;result.push({x:p.x,y:p.y,anchor:true,...(p.move?{move:true}:{})});continue}for(let j=1;j<=16;j++){const t=j/16,s=1-t,a=previous!;if(p.c2&&p.c1)result.push({x:s*s*s*a.x+3*s*s*t*p.c1.x+3*s*t*t*p.c2.x+t*t*t*p.x,y:s*s*s*a.y+3*s*s*t*p.c1.y+3*s*t*t*p.c2.y+t*t*t*p.y});else if(p.c1)result.push({x:s*s*a.x+2*s*t*p.c1.x+t*t*p.x,y:s*s*a.y+2*s*t*p.c1.y+t*t*p.y});else result.push({x:a.x+(p.x-a.x)*t,y:a.y+(p.y-a.y)*t})}Object.assign(result.at(-1)!,{anchor:true,curved:!!p.c1});if(p.close&&start)result.push({x:start.x,y:start.y,close:true});previous=p}
  return result
}
function nodeSamples(row:ReconstructionNode):Point[]{
  if(row.type==='line')return[{x:row.x,y:row.y},{x:row.x2,y:row.y2}]
  if(row.type==='path')return samplePath(parseSvgPath(row.d,identity))
  if(row.type==='polyline'){const values=row.points.trim().split(/[ ,]+/).map(Number);if(values.length%2||values.some(v=>!Number.isFinite(v)))throw new Error('评测输入的折线无效');return values.filter((_,i)=>i%2===0).map((x,i)=>({x,y:values[i*2+1]!,anchor:true}))}
  if(row.type==='ellipse')return Array.from({length:65},(_,i)=>({x:row.x+row.w/2+row.w/2*Math.cos(i*Math.PI/32),y:row.y+row.h/2+row.h/2*Math.sin(i*Math.PI/32)}))
  if(row.type==='rect'&&row.rx){const r=Math.min(row.rx,row.w/2,row.h/2),corners=[{x:row.x+r,y:row.y+r,start:Math.PI},{x:row.x+row.w-r,y:row.y+r,start:-Math.PI/2},{x:row.x+row.w-r,y:row.y+row.h-r,start:0},{x:row.x+r,y:row.y+row.h-r,start:Math.PI/2}],points=corners.flatMap(c=>Array.from({length:9},(_,i)=>({x:c.x+r*Math.cos(c.start+i*Math.PI/16),y:c.y+r*Math.sin(c.start+i*Math.PI/16)})));points.push({...points[0]!});return points}
  const p=[{x:row.x,y:row.y},{x:row.x+row.w,y:row.y},{x:row.x+row.w,y:row.y+row.h},{x:row.x,y:row.y+row.h},{x:row.x,y:row.y}]
  return p
}
function bounds(points:Point[]):Box{if(!points.length)throw new Error('评测对象没有有效几何');const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));return{x,y,w:Math.max(...points.map(p=>p.x))-x,h:Math.max(...points.map(p=>p.y))-y}}
function parts(points:Point[]){const paths:Point[][]=[];for(const p of points){if(!paths.length||p.move)paths.push([]);paths.at(-1)!.push(p)}return paths}
function resample(points:Point[],count=65):Point[]{if(points.some(p=>p.move))return parts(points).flatMap((path,i)=>resample(path.map(p=>({x:p.x,y:p.y})),count).map((p,j)=>({...p,...(i&&j===0?{move:true}:{})})));const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]!+distance(points[i-1]!,points[i]!));const total=lengths.at(-1)??0;if(!total)return points;let index=1;return Array.from({length:count},(_,i)=>{const target=total*i/(count-1);while(index<lengths.length-1&&lengths[index]!<target)index++;const a=points[index-1]!,b=points[index]!,t=(target-lengths[index-1]!)/(lengths[index]!-lengths[index-1]!||1);return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}})}
function predictions(raw:unknown,canvas:BenchmarkCase['canvas']):Predicted[]{
  let input=raw as Record<string,unknown>
  if(input.events){const events=z.array(z.object({proposal:z.unknown().optional()})).parse(input.events);input=[...events].reverse().find(e=>e.proposal)?.proposal as Record<string,unknown>;if(!input)throw new Error('运行没有重建候选，不能作为成功评测')}
  if(input.figure)input=input.figure as Record<string,unknown>
  let scene
  if('version' in input){const doc=figureDocumentSchema.parse(input),root=rootContainer(doc);if(!root.reconstruction)throw new Error('评测工程需要重建根组的来源注册');scene=sceneForReconstruction(doc,root.id)}else scene=reconstructionSceneSchema.parse('scene' in input?input.scene:input)
  const sx=canvas.width/scene.canvas.width,sy=canvas.height/scene.canvas.height,result:Predicted[]=[]
  for(const row of scene.nodes){let points=nodeSamples(row)
    if('rotation' in row&&row.rotation&&!('matrix' in row&&row.matrix)){const cx=row.x+row.w/2,cy=row.y+row.h/2,a=row.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);points=points.map(p=>({x:cx+(p.x-cx)*c-(p.y-cy)*s,y:cy+(p.x-cx)*s+(p.y-cy)*c}))}
    points=points.map(p=>({...p,x:p.x*sx,y:p.y*sy}))
    if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>canvas.width*10||Math.abs(p.y)>canvas.height*10))throw new Error('评测对象坐标超出合理画幅范围')
    const pieces=row.type==='path'?parts(points):[points]
    for(let i=0;i<pieces.length;i++){const piece=pieces[i]!,b=pieces.length>1?bounds(piece):bounds(points),closed=piece.some(p=>p.close),area=Math.abs(piece.reduce((sum,p,j)=>{const next=piece[(j+1)%piece.length]!;return sum+p.x*next.y-next.x*p.y},0)/2),isStroke=row.type==='line'||row.type==='polyline'&&(!row.fill||row.fill==='none')||row.type==='path'&&!closed&&(!row.fill||row.fill==='none'||area<1),anchors=piece.filter(p=>p.anchor)
      const samples=resample(piece.map(p=>({x:p.x,y:p.y}))),tip=samples.at(-1)!,previous=samples.at(-2)??tip,length=distance(previous,tip)
      result.push({id:pieces.length>1?`${row.id}/part-${i}`:row.id,kind:row.type==='text'?'text':isStroke?'stroke':'shape',box:b,text:row.type==='text'?row.text:undefined,samples,arrow:'arrow' in row?row.arrow&&i===pieces.length-1:false,...(length?{tip,direction:{x:(tip.x-previous.x)/length,y:(tip.y-previous.y)/length}}:{}),fill:row.type==='text'?row.fill??'#243247':row.fill,stroke:row.stroke,triangle:!anchors.some(p=>p.curved)&&new Set(anchors.map(p=>`${p.x},${p.y}`)).size===3})
    }
  }
  // A separately drawn triangular arrowhead is valid vector structure, not a spurious module.
  const triangles=result.filter(p=>p.kind==='shape'&&p.box.w<=36&&p.box.h<=36&&p.triangle)
  for(const triangle of triangles){const line=result.filter(p=>p.kind==='stroke'&&p.tip&&p.direction).sort((a,b)=>distance(a.tip!,center(triangle.box))-distance(b.tip!,center(triangle.box)))[0];if(!line||distance(line.tip!,center(triangle.box))>24)continue;const tip=triangle.samples.reduce((best,p)=>(p.x-line.tip!.x)*line.direction!.x+(p.y-line.tip!.y)*line.direction!.y>(best.x-line.tip!.x)*line.direction!.x+(best.y-line.tip!.y)*line.direction!.y?p:best);line.arrow=true;line.tip=tip;line.samples.push(tip);result.splice(result.indexOf(triangle),1)}
  return result
}
function pointSegment(p:Point,a:Point,b:Point){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)}
function nearestCoverage(paths:Point[][],canvas:BenchmarkCase['canvas'],tolerance=reconstructionEvaluationPolicy.strokeTolerancePixels){const grid=new Map<string,[Point,Point][]>(),cell=16
  for(const path of paths)for(let i=1;i<path.length;i++){const a=path[i-1]!,b=path[i]!;if(b.move)continue;for(let x=Math.max(-1,Math.floor((Math.min(a.x,b.x)-tolerance)/cell));x<=Math.min(Math.ceil(canvas.width/cell),Math.floor((Math.max(a.x,b.x)+tolerance)/cell));x++)for(let y=Math.max(-1,Math.floor((Math.min(a.y,b.y)-tolerance)/cell));y<=Math.min(Math.ceil(canvas.height/cell),Math.floor((Math.max(a.y,b.y)+tolerance)/cell));y++){const key=`${x},${y}`,list=grid.get(key)??[];list.push([a,b]);grid.set(key,list)}}
  return (path:Point[])=>path.length?path.filter(p=>(grid.get(`${Math.floor(p.x/cell)},${Math.floor(p.y/cell)}`)??[]).some(([a,b])=>pointSegment(p,a,b)<=tolerance)).length/path.length:0
}
function paintDistance(a?:string,b?:string){const rgb=(s?:string)=>s?.startsWith('#')?[parseInt(s.slice(1,3),16),parseInt(s.slice(3,5),16),parseInt(s.slice(5,7),16)]:s?.startsWith('rgb')?s.match(/[\d.]+/g)?.slice(0,3).map(Number):undefined,x=rgb(a),y=rgb(b);if(!x)return null;if(!y)return 255;return x.reduce((sum,v,i)=>sum+Math.abs(v-y[i]!),0)/3}
export function evaluateReconstruction(sample:BenchmarkCase,raw:unknown){
  const truth=benchmarkCaseSchema.parse(sample),actual=predictions(raw,truth.canvas),textTruth=truth.objects.filter(o=>o.kind==='text'),textActual=actual.filter(o=>o.kind==='text'),shapeTruth=truth.objects.filter(o=>o.kind==='shape'),shapeActual=actual.filter(o=>o.kind==='shape'),strokeTruth=truth.objects.filter(o=>o.kind==='stroke'),strokeActual=actual.filter(o=>o.kind==='stroke'),ratio=(a:number,b:number)=>b?a/b:null
  const texts=match(textTruth,textActual,(a,b)=>{const d=distance(center(a.box),center(b.box)),radius=Math.max(24,Math.min(100,a.box.h*4));if(d>radius&&iou(a.box,b.box)<.05)return 2;return .65*characterDistance(a.text??'',b.text??'')/Math.max(1,Array.from(norm(a.text??'')).length,Array.from(norm(b.text??'')).length)+.3*Math.min(1,d/radius)})
  const textUsed=new Set(texts.flatMap(m=>m.actual?[m.actual.id]:[])),extraTexts=textActual.filter(t=>!textUsed.has(t.id)),characters=textTruth.reduce((n,t)=>n+Array.from(norm(t.text??'')).length,0),edits=texts.reduce((n,m)=>n+characterDistance(m.expected.text??'',m.actual?.text??''),0)+extraTexts.reduce((n,t)=>n+Array.from(norm(t.text??'')).length,0)
  const contours=new Map<string,ReturnType<typeof nearestCoverage>>()
  const shapes=match(shapeTruth,shapeActual,(a,b)=>{const overlap=iou(a.box,b.box);if(overlap<reconstructionEvaluationPolicy.geometryIoU)return 2;let coverage=1;if(a.samples?.length){const key=`${a.id}/${b.id}`;if(!contours.has(key))contours.set(key,nearestCoverage([b.samples],truth.canvas));const forward=contours.get(key)!(a.samples),reverse=nearestCoverage([a.samples],truth.canvas)(b.samples);coverage=(forward+reverse)/2;if(coverage<reconstructionEvaluationPolicy.contourCoverage)return 2}return 1-(.55*overlap+.45*coverage)})
  const shapeMatches=shapes.filter(m=>m.actual),strokeCover=nearestCoverage(strokeActual.map(p=>p.samples),truth.canvas),truthCover=nearestCoverage(strokeTruth.map(p=>p.samples??[]),truth.canvas),strokeDetails=strokeTruth.map(t=>({id:t.id,role:t.role,coverage:strokeCover(t.samples??[])})),arrowTruth=strokeTruth.filter(t=>t.arrow&&t.tip&&t.direction),arrowActual=strokeActual.filter(t=>t.arrow&&t.tip&&t.direction)
  const arrows=match(arrowTruth,arrowActual,(a,b)=>{const d=distance(a.tip!,b.tip!),dot=a.direction!.x*b.direction!.x+a.direction!.y*b.direction!.y;return d<=reconstructionEvaluationPolicy.arrowTipTolerancePixels&&dot>=reconstructionEvaluationPolicy.arrowDirectionCosine?d/16:2}),arrowMatches=arrows.filter(m=>m.actual).length
  const expectedInk=truth.objects.filter(o=>o.kind!=='text'),actualInk=actual.filter(o=>o.kind!=='text'),inkCoverage=nearestCoverage(actualInk.map(o=>o.samples),truth.canvas),expectedCoverage=nearestCoverage(expectedInk.map(o=>o.samples??[]),truth.canvas),inkDetails=expectedInk.map(o=>({id:o.id,kind:o.kind,coverage:inkCoverage(o.samples??[])})),shapeUnmatched=shapes.filter(m=>!m.actual).map(m=>({id:m.expected.id,boundaryCoverage:inkCoverage(m.expected.samples??[])}))
  const paint=[...texts,...shapes].flatMap(m=>m.actual?[paintDistance(m.expected.fill,m.actual.fill),paintDistance(m.expected.stroke,m.actual.stroke)].filter((n):n is number=>n!==null):[])
  return {caseId:truth.id,policy:reconstructionEvaluationPolicy,counts:{expected:truth.objects.length,predicted:actual.length},text:{expected:textTruth.length,predicted:textActual.length,exact:texts.filter(m=>m.actual&&norm(m.expected.text??'')===norm(m.actual.text??'')).length,exactRecall:ratio(texts.filter(m=>m.actual&&norm(m.expected.text??'')===norm(m.actual.text??'')).length,textTruth.length),characterErrorRate:ratio(edits,characters),missing:texts.filter(m=>!m.actual).map(m=>m.expected.id),mismatches:texts.filter(m=>m.actual&&norm(m.expected.text??'')!==norm(m.actual.text??'')).map(m=>({id:m.expected.id,expected:m.expected.text,actual:m.actual!.text})),extra:extraTexts.map(t=>({id:t.id,text:t.text}))},shapes:{expected:shapeTruth.length,predicted:shapeActual.length,matched:shapeMatches.length,recall:ratio(shapeMatches.length,shapeTruth.length),precision:ratio(shapeMatches.length,shapeActual.length),meanIoU:shapeMatches.length?shapeMatches.reduce((n,m)=>n+iou(m.expected.box,m.actual!.box),0)/shapeMatches.length:null,unmatched:shapeUnmatched.map(o=>o.id),missing:shapeUnmatched.filter(o=>o.boundaryCoverage<reconstructionEvaluationPolicy.contourCoverage).map(o=>o.id),encodingDifferences:shapeUnmatched.filter(o=>o.boundaryCoverage>=reconstructionEvaluationPolicy.contourCoverage)},strokes:{expected:strokeTruth.length,predicted:strokeActual.length,objectRecall:ratio(strokeDetails.filter(s=>s.coverage>=reconstructionEvaluationPolicy.strokeRecoveryCoverage).length,strokeTruth.length),meanCoverage:strokeDetails.length?strokeDetails.reduce((n,t)=>n+t.coverage,0)/strokeDetails.length:null,precision:strokeActual.length?strokeActual.reduce((n,p)=>n+truthCover(p.samples),0)/strokeActual.length:null,deficits:strokeDetails.filter(t=>t.coverage<reconstructionEvaluationPolicy.strokeRecoveryCoverage)},ink:{expected:expectedInk.length,objectRecall:ratio(inkDetails.filter(o=>o.coverage>=reconstructionEvaluationPolicy.strokeRecoveryCoverage).length,expectedInk.length),meanCoverage:inkDetails.length?inkDetails.reduce((n,o)=>n+o.coverage,0)/inkDetails.length:null,precision:actualInk.length?actualInk.reduce((n,o)=>n+expectedCoverage(o.samples),0)/actualInk.length:null,deficits:inkDetails.filter(o=>o.coverage<reconstructionEvaluationPolicy.strokeRecoveryCoverage)},arrows:{expected:arrowTruth.length,predicted:arrowActual.length,matched:arrowMatches,recall:ratio(arrowMatches,arrowTruth.length),precision:ratio(arrowMatches,arrowActual.length),missing:arrows.filter(m=>!m.actual).map(m=>m.expected.id)},paint:{meanChannelDifference:paint.length?paint.reduce((a,b)=>a+b,0)/paint.length:null,samples:paint.length}}
}
