import {paperStructureFigure,paperStructureSchemas,paperStructureIds,paperStructureSemantics,isPaperStructure} from './paperStructures.ts'
import {z} from 'zod'
import type {FigureNode} from '../core/model.ts'
import type {PathPoint} from '../core/paths.ts'
import {createStructureBuilder} from './structureBuilder.ts'
import {relationalFigure,isRelationalParameters,relationalParametersSchemas,relationalRecipeIds,relationalSemantics} from './relationalFigures.ts'

const count=(min:number,max:number)=>z.coerce.number().int().min(min).max(max)
const branchCount=z.union([z.literal('inherit'),count(0,3)]).optional()
export const structuralRecipeIds=['layered-architecture','hierarchy-tree','radial-hub','cycle-loop','structure-matrix','tiered-pyramid',...relationalRecipeIds,...paperStructureIds] as const
export const structuralParametersSchemas=[
  ...relationalParametersSchemas,
  ...paperStructureSchemas,
  z.object({id:z.literal('layered-architecture'),layers:count(2,5),modules:count(2,4),shared:z.enum(['show','hide'])}).strict(),
  z.object({id:z.literal('hierarchy-tree'),branches:count(2,4),leaves:count(1,3),direction:z.enum(['down','right']),branch1Leaves:branchCount,branch2Leaves:branchCount,branch3Leaves:branchCount,branch4Leaves:branchCount}).strict(),
  z.object({id:z.literal('radial-hub'),items:count(3,8),relation:z.enum(['none','outward','inward'])}).strict(),
  z.object({id:z.literal('cycle-loop'),items:count(3,8),direction:z.enum(['clockwise','counterclockwise'])}).strict(),
  z.object({id:z.literal('structure-matrix'),rows:count(2,4),columns:count(2,4),headers:z.enum(['show','hide'])}).strict(),
  z.object({id:z.literal('tiered-pyramid'),levels:count(2,5),profile:z.enum(['pyramid','funnel'])}).strict(),
] as const
const structuralSchema=z.discriminatedUnion('id',structuralParametersSchemas)
type Parameters=z.infer<typeof structuralSchema>

export const structuralSemantics={
  ...relationalSemantics,
  ...paperStructureSemantics,
  'layered-architecture':{relation:'Nested bands contain modules; a shared side block is optional. Vertical position does not imply execution or data flow.',labels:'structure-title, layer-label-i, module-i-j, shared-context (when shown).'},
  'hierarchy-tree':{relation:'One root, branch parents and leaf children. Each branch can inherit the default leaf count or explicitly have 0–3 leaves. Zero leaves means a terminal branch. Bound orthogonal paths indicate parent-child membership and have no arrowheads.',labels:'structure-title, tree-root, branch-i, leaf-i-j. Direction changes layout only. Optional branch1Leaves..branch4Leaves override the default for the corresponding branch; inactive branch values are retained for later reuse.'},
  'radial-hub':{relation:'A central hub and peripheral items. Undirected by default; outward/inward arrows require explicit selection.',labels:'structure-title, hub, satellite-i. Spokes are endpoint-bound paths.'},
  'cycle-loop':{relation:'A closed ordered loop, including the last-to-first link. Cubic arcs follow the selected clockwise/counterclockwise direction.',labels:'structure-title, cycle-stage-i, cycle-center. Each cycle-link-i starts at stage i.'},
  'structure-matrix':{relation:'A categorical row/column arrangement with independent editable headers and cells. It is not a numeric heatmap or an inferred adjacency matrix.',labels:'structure-title, row-label-i, column-label-j (when shown), cell-i-j.'},
  'tiered-pyramid':{relation:'Ordered tiers with a pyramid or funnel silhouette. Widths are illustrative and encode no quantities, proportions or measured conversion rates.',labels:'structure-title, tier-label-i, tier-note-i. Closed tier-i paths are independently editable.'},
} as const
export const isStructuralRecipe=(id:string):id is keyof typeof structuralSemantics=>Object.hasOwn(structuralSemantics,id)

/** Relationship geometry rebuilt from local PPT research, with neutral editable content. */
export function structuralFigure(input:Parameters){
  const p=structuralSchema.parse(input)
  if(isPaperStructure(p))return paperStructureFigure(p)
  if(isRelationalParameters(p))return relationalFigure(p)
  const {root,text,shape,path,bind,group,finish}=createStructureBuilder()
  let note:string
  if(p.id==='layered-architecture'){
    const bandWidth=156+p.modules*112+(p.modules-1)*16,bodyHeight=p.layers*92-12,baseWidth=bandWidth+40
    root.width=baseWidth+(p.shared==='show'?96:0);root.height=60+bodyHeight+48
    for(let i=0;i<p.layers;i++){
      const id=`layer-${i}`,y=60+i*92
      group(id,`Layer ${i+1}`,20,y,bandWidth,80,i)
      text(`layer-label-${i}`,`Layer ${i+1}`,28,y+22,116,36,15,id,true)
      for(let j=0;j<p.modules;j++)shape(`module-${i}-${j}`,`Module ${i+1}.${j+1}`,160+j*128,y+18,112,44,i,id)
    }
    if(p.shared==='show'){
      const shared=shape('shared-context','Shared\ncontext',baseWidth-4,60,80,bodyHeight,5);shared.visual!.dash=[5,4]
    }
    note='Bands indicate containment, not execution order.'
  }else if(p.id==='hierarchy-tree'){
    const down=p.direction==='down',leafSpan=down?66:32,gap=8,branchGap=down?20:16,overrides=[p.branch1Leaves,p.branch2Leaves,p.branch3Leaves,p.branch4Leaves],leafCounts=Array.from({length:p.branches},(_,i)=>typeof overrides[i]==='number'?overrides[i] as number:p.leaves),leavesSpans=leafCounts.map(count=>Math.max(0,count*leafSpan+(count-1)*gap)),branchSpans=leavesSpans.map(span=>Math.max(down?120:32,span)),total=branchSpans.reduce((sum,span)=>sum+span,0)+(p.branches-1)*branchGap,hasLeaves=leafCounts.some(count=>count>0)
    root.width=down?total+40:hasLeaves?572:376;root.height=down?hasLeaves?360:252:total+108
    const center=20+total/2,top=down?0:40
    const place=(id:string,label:string,spread:number,depth:number,color:number,leaf=false)=>down
      ?shape(id,label,spread-(leaf?66:120)/2,depth,leaf?66:120,44,color)
      :shape(id,label,depth,top+spread-16,140,32,color)
    const source=place('tree-root','Root',center,down?60:20,0)
    function relation(a:FigureNode,b:FigureNode,id:string){
      const start=down?{x:a.x+a.width/2,y:a.y+a.height}:{x:a.x+a.width,y:a.y+a.height/2},end=down?{x:b.x+b.width/2,y:b.y}:{x:b.x,y:b.y+b.height/2},mid=down?(start.y+end.y)/2:(start.x+end.x)/2
      const points=down?[start,{x:start.x,y:mid},{x:end.x,y:mid},end]:[start,{x:mid,y:start.y},{x:mid,y:end.y},end]
      bind(path(id,points),a,b,points)
    }
    let start=20
    for(let i=0;i<p.branches;i++){
      const branchSpan=branchSpans[i]!,leavesSpan=leavesSpans[i]!,branch=place(`branch-${i}`,`Branch ${i+1}`,start+branchSpan/2,down?166:216,i)
      relation(source,branch,`root-branch-${i}`)
      for(let j=0;j<leafCounts[i]!;j++){
        const leaf=place(`leaf-${i}-${j}`,`Unit ${i+1}.${j+1}`,start+(branchSpan-leavesSpan)/2+j*(leafSpan+gap)+leafSpan/2,down?272:412,i,true)
        relation(branch,leaf,`branch-leaf-${i}-${j}`)
      }
      start+=branchSpan+branchGap
    }
    note='Lines indicate parent–child membership.'
  }else if(p.id==='radial-hub'||p.id==='cycle-loop'){
    root.width=500;root.height=510
    const cx=250,cy=270,r=166,diameter=80,tau=Math.PI*2,point=(angle:number)=>({x:cx+r*Math.cos(angle),y:cy+r*Math.sin(angle)})
    const items=Array.from({length:p.items},(_,i)=>{const q=point(-Math.PI/2+i*tau/p.items);return shape(p.id==='radial-hub'?`satellite-${i}`:`cycle-stage-${i}`,p.id==='radial-hub'?`Item ${i+1}`:`Stage ${i+1}`,q.x-diameter/2,q.y-diameter/2,diameter,diameter,i%6,'stage',true)})
    if(p.id==='radial-hub'){
      const hub=shape('hub','Hub',cx-48,cy-48,96,96,0,'stage',true)
      items.forEach((item,i)=>{
        const angle=-Math.PI/2+i*tau/p.items,v={x:Math.cos(angle),y:Math.sin(angle)},start={x:cx+48*v.x,y:cy+48*v.y},end={x:cx+(r-40)*v.x,y:cy+(r-40)*v.y},inward=p.relation==='inward',points=inward?[end,start]:[start,end]
        bind(path(`spoke-${i}`,points,p.relation==='none'?'none':'filled'),inward?item:hub,inward?hub:item,points)
      })
      note=p.relation==='none'?'Undirected hub relationships.':p.relation==='outward'?'Directed relationships: hub to items.':'Directed relationships: items to hub.'
    }else{
      const sign=p.direction==='clockwise'?1:-1,trim=2*Math.asin(40/(2*r)),sweep=tau/p.items-2*trim
      items.forEach((item,i)=>{
        const target=items[(i+sign+p.items)%p.items]!,start=-Math.PI/2+i*tau/p.items+sign*trim,end=start+sign*sweep,a=point(start),b=point(end),k=4/3*Math.tan(sign*sweep/4),points:PathPoint[]=[a,{...b,c1:{x:a.x-k*r*Math.sin(start),y:a.y+k*r*Math.cos(start)},c2:{x:b.x+k*r*Math.sin(end),y:b.y-k*r*Math.cos(end)}}]
        bind(path(`cycle-link-${i}`,points,'filled'),item,target,points)
      })
      text('cycle-center','Iterative\nloop',190,cy-30,120,60,18,'stage',true)
      note=p.direction==='clockwise'?'Clockwise loop; last stage returns to first.':'Counterclockwise loop; first stage returns to last.'
    }
  }else if(p.id==='structure-matrix'){
    const headers=p.headers==='show',left=headers?124:20,top=headers?104:60,cellWidth=124,cellHeight=58,gap=12
    root.width=left+p.columns*(cellWidth+gap)+8;root.height=top+p.rows*(cellHeight+gap)+36
    if(headers)for(let j=0;j<p.columns;j++)text(`column-label-${j}`,`Column ${j+1}`,left+j*(cellWidth+gap),62,cellWidth,28,14,'stage',true)
    for(let i=0;i<p.rows;i++){
      if(headers)text(`row-label-${i}`,`Row ${i+1}`,20,top+i*(cellHeight+gap)+12,92,32,14,'stage',true)
      for(let j=0;j<p.columns;j++)shape(`cell-${i}-${j}`,`Cell ${i+1},${j+1}`,left+j*(cellWidth+gap),top+i*(cellHeight+gap),cellWidth,cellHeight,i)
    }
    note='Categories only; no measurements.'
  }else{
    root.width=700;root.height=60+p.levels*76+44
    const center=212,full=360
    for(let i=0;i<p.levels;i++){
      const y=60+i*76,a=p.profile==='pyramid'?full*i/p.levels:full-(full-120)*i/p.levels,b=p.profile==='pyramid'?full*(i+1)/p.levels:full-(full-120)*(i+1)/p.levels
      path(`tier-${i}`,[{x:center-a/2,y},{x:center+a/2,y},{x:center+b/2,y:y+64},{x:center-b/2,y:y+64},{x:center-a/2,y,close:true}],'none',true,i)
      text(`tier-label-${i}`,`L${i+1}`,center-28,y+(a===0?36:20),56,22,13,'stage',true)
      text(`tier-note-${i}`,`Level ${i+1} · editable description`,420,y+16,256,32,14)
    }
    note='Schematic tiers; widths do not encode quantities.'
  }
  const title={
    'layered-architecture':'Layered architecture','hierarchy-tree':'Hierarchy','radial-hub':'Hub relationships',
    'cycle-loop':'Iterative cycle','structure-matrix':'Structure matrix','tiered-pyramid':p.id==='tiered-pyramid'&&p.profile==='funnel'?'Funnel structure':'Pyramid structure',
  }[p.id]
  return finish(title,note)
}
