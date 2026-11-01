import {z} from 'zod'
import type {FigureNode} from '../core/model.ts'
import {circleArc,createStructureBuilder} from './structureBuilder.ts'

const count=(min:number,max:number)=>z.coerce.number().int().min(min).max(max)
export const relationalRecipeIds=['coupled-cycles','swimlane-process','set-overlap','concentric-layers'] as const
export const relationalParametersSchemas=[
  z.object({id:z.literal('coupled-cycles'),leftStages:count(2,5),rightStages:count(2,5),rightDirection:z.enum(['clockwise','counterclockwise'])}).strict(),
  z.object({id:z.literal('swimlane-process'),lanes:count(2,4),stages:count(2,4),flow:z.enum(['parallel','handoff'])}).strict(),
  z.object({id:z.literal('set-overlap'),sets:count(2,3),overlap:z.enum(['narrow','broad'])}).strict(),
  z.object({id:z.literal('concentric-layers'),layers:count(2,5),labels:z.enum(['show','hide'])}).strict(),
] as const
const parametersSchema=z.discriminatedUnion('id',relationalParametersSchemas)
type Parameters=z.infer<typeof parametersSchema>
export const isRelationalParameters=(p:{id:string}):p is Parameters=>(relationalRecipeIds as readonly string[]).includes(p.id)
export const relationalSemantics={
  'coupled-cycles':{relation:'Two closed loops share exactly one state node. The left loop is clockwise; the right loop has its own explicit direction. This is a topological schematic, not a reproduction of a source infinity ribbon.',labels:'structure-title, shared-state, left-stage-i, right-stage-i. Each side has stages+1 bound cubic links including return to shared-state. Changing one side does not renumber the other side.'},
  'swimlane-process':{relation:'Each task belongs to a real nested lane. Parallel mode has independent left-to-right chains and no cross-lane links. Handoff mode explicitly alternates row direction and connects lane exits to the next lane entry through side corridors.',labels:'structure-title, lane-label-i, task-i-j. Task j retains its sequence role when lane direction changes; handoff-i joins lane i to i+1. Lane ownership is not a measured variable or automatically inferred concurrency.'},
  'set-overlap':{relation:'Two or three overlapping sets. Translucent independent circles express common membership through actual paint overlap; area, distance and overlap width encode no counts or similarity scores. There is no Boolean intersection object or automatic set algebra.',labels:'structure-title, set-i (circle region), set-label-i (independent A/B/C label). Shown sets are schematic; no observations or set elements are inferred.'},
  'concentric-layers':{relation:'Independent concentric annuli surround an editable core. Annuli use compound cubic paths with evenodd holes. Nesting expresses containment/context, not flow, distance or measured radial quantities.',labels:'structure-title, ring-i, ring-label-i (when shown), ring-core. Outer ring is layer 1. Moving a ring independently edits its geometry; this is not a live Boolean or geometric constraint system.'},
} as const

export function relationalFigure(input:Parameters){
  const p=parametersSchema.parse(input),{root,text,shape,path,bind,group,finish}=createStructureBuilder()
  if(p.id==='coupled-cycles'){
    root.width=760;root.height=510
    const cy=270,r=150,tau=Math.PI*2,shared=shape('shared-state','Shared\nstate',336,226,88,88,5,'stage',true)
    for(const [side,cx,base,count,direction]of [['left',230,0,p.leftStages,1],['right',530,Math.PI,p.rightStages,p.rightDirection==='clockwise'?1:-1]] as const){
      const nodes:FigureNode[]=[shared]
      for(let i=0;i<count;i++){
        const angle=base+(i+1)*tau/(count+1),x=cx+r*Math.cos(angle),y=cy+r*Math.sin(angle)
        nodes.push(shape(`${side}-stage-${i}`,`${side==='left'?'Left':'Right'} ${i+1}`,x-38,y-38,76,76,side==='left'?0:2,'stage',true))
      }
      nodes.forEach((source,i)=>{
        const target=nodes[(i+direction+nodes.length)%nodes.length]!,startTrim=2*Math.asin(source.width/(4*r)),endTrim=2*Math.asin(target.width/(4*r)),start=base+i*tau/nodes.length+direction*startTrim,sweep=direction*(tau/nodes.length-startTrim-endTrim),points=circleArc(cx,cy,r,start,sweep)
        bind(path(`${side}-link-${i}`,points,'filled',false,side==='left'?0:2),source,target,points)
      })
      text(`${side}-loop-label`,side==='left'?'Loop A':'Loop B',cx-54,cy-16,108,32,18,'stage',true)
    }
    return finish('Coupled cycles','Two closed loops share one state; stage counts are illustrative.')
  }
  if(p.id==='swimlane-process'){
    const taskWidth=110,taskHeight=44,step=148,firstX=156,laneHeight=80,rowStep=112
    root.width=firstX+(p.stages-1)*step+taskWidth+50;root.height=60+(p.lanes-1)*rowStep+laneHeight+48
    const rows:FigureNode[][]=[]
    for(let i=0;i<p.lanes;i++){
      const id=`lane-${i}`,y=60+i*rowStep,reverse=p.flow==='handoff'&&i%2===1
      group(id,`Lane ${i+1}`,20,y,root.width-40,laneHeight,i)
      text(`lane-label-${i}`,`Lane ${i+1}`,28,y+22,112,36,15,id,true)
      const tasks=Array.from({length:p.stages},(_,j)=>shape(`task-${i}-${j}`,`Task ${i+1}.${j+1}`,firstX+(reverse?p.stages-1-j:j)*step,y+18,taskWidth,taskHeight,i,id));rows.push(tasks)
      for(let j=1;j<tasks.length;j++){
        const a=tasks[j-1]!,b=tasks[j]!,points=[{x:a.x+(reverse?0:taskWidth),y:a.y+taskHeight/2},{x:b.x+(reverse?taskWidth:0),y:b.y+taskHeight/2}]
        bind(path(`lane-link-${i}-${j-1}`,points,'filled',false,i,id),a,b,points)
      }
    }
    if(p.flow==='handoff')for(let i=0;i<p.lanes-1;i++){
      const a=rows[i]!.at(-1)!,b=rows[i+1]![0]!,right=i%2===0,start={x:a.x+(right?taskWidth:0),y:a.y+taskHeight/2},end={x:b.x+(right?taskWidth:0),y:b.y+taskHeight/2},corridor=right?root.width-10:firstX-12,points=[start,{x:corridor,y:start.y},{x:corridor,y:end.y},end]
      bind(path(`handoff-${i}`,points,'filled',false,i),a,b,points)
    }
    return finish('Swimlane process',p.flow==='parallel'?'Independent lane sequences; no cross-lane handoffs.':'Alternating lane sequences with explicit handoffs.')
  }
  if(p.id==='set-overlap'){
    root.width=640;root.height=540
    const cx=320,cy=278,r=124,d=p.overlap==='narrow'?172:120
    const centers=p.sets===2?[{x:cx-d/2,y:cy},{x:cx+d/2,y:cy}]:[{x:cx-d/2,y:cy-d*Math.sqrt(3)/6},{x:cx+d/2,y:cy-d*Math.sqrt(3)/6},{x:cx,y:cy+d*Math.sqrt(3)/3}]
    for(const [i,center]of centers.entries()){
      const label=String.fromCharCode(65+i),region=shape(`set-${i}`,'',center.x-r,center.y-r,r*2,r*2,i,'stage',true)
      region.name=`Set ${label} region`;region.visual!.fillOpacity=.45
      const length=Math.hypot(center.x-cx,center.y-cy),x=center.x+(center.x-cx)/length*r*.64,y=center.y+(center.y-cy)/length*r*.64
      text(`set-label-${i}`,label,x-28,y-15,56,30,20,'stage',true)
    }
    return finish('Set overlap','Common membership only; areas and spacing are schematic.')
  }
  root.width=560;root.height=540
  const cx=280,cy=282,outer=198,thickness=32,inner=outer-p.layers*thickness
  for(let i=0;i<p.layers;i++){
    const radius=outer-i*thickness,outside=circleArc(cx,cy,radius,0,Math.PI*2),inside=circleArc(cx,cy,radius-thickness,0,Math.PI*2)
    outside.at(-1)!.close=true;inside[0]!.move=true;inside.at(-1)!.close=true
    const ring=path(`ring-${i}`,[...outside,...inside],'none',true,i);ring.path!.fillRule='evenodd';ring.name=`Layer ${i+1} annulus`
    if(p.labels==='show')text(`ring-label-${i}`,`Layer ${i+1}`,cx-60,cy-radius+6,120,22,13,'stage',true)
  }
  shape('ring-core','Core',cx-inner,cy-inner,inner*2,inner*2,5,'stage',true)
  return finish('Concentric layers','Nested context; ring widths do not encode quantities.')
}
