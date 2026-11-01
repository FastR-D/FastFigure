import {z} from 'zod'
import {createBlank,type FigureNode} from '../core/model.ts'
import {setPathPoints,type PathPoint} from '../core/paths.ts'

const count=(min:number,max:number)=>z.coerce.number().int().min(min).max(max)
export const tensorStackParametersSchema=z.object({id:z.literal('tensor-stack'),layers:count(1,8),rows:count(2,8),columns:count(2,8),spacing:z.enum(['compact','normal','loose']),tilt:z.enum(['flat','mild','steep']),note:z.enum(['show','hide'])}).strict()
export type TensorStackParameters=z.infer<typeof tensorStackParametersSchema>
type Point={x:number;y:number}
function roundedPlane(vertices:Point[]):PathPoint[]{
  const corners=vertices.map((p,i)=>{const previous=vertices[(i+3)%4]!,next=vertices[(i+1)%4]!,a=Math.hypot(previous.x-p.x,previous.y-p.y),b=Math.hypot(next.x-p.x,next.y-p.y),r=Math.min(4,a/4,b/4);return{p,incoming:{x:p.x+(previous.x-p.x)*r/a,y:p.y+(previous.y-p.y)*r/a},outgoing:{x:p.x+(next.x-p.x)*r/b,y:p.y+(next.y-p.y)*r/b}}})
  return[corners[0]!.outgoing,...[1,2,3,0].flatMap(i=>{const corner=corners[i]!;return[corner.incoming,{...corner.outgoing,c1:corner.p,...(i===0?{close:true}:{})}]})]
}
/** A diagram recipe. Counts control illustrative geometry, never observations or tensor dimensions. */
export function tensorStackFigure(input:TensorStackParameters){
  const p=tensorStackParametersSchema.parse(input),figure=createBlank(),root=figure.containers[0]!,gap={compact:10,normal:18,loose:26}[p.spacing],rise=p.tilt==='flat'?0:7,skew={flat:0,mild:24,steep:48}[p.tilt],width=164,height=168,left=20,top=48,offset=(p.layers-1)*gap,dy=(p.layers-1)*rise
  root.role='component';root.width=left*2+width+offset;root.height=top+height+dy+(p.note==='show'?36:16);root.visual={fill:'none',stroke:'none'}
  figure.style={...figure.style,preset:'precise',paletteId:'figureforge-publication-soft',colorIndex:1}
  function path(id:string,name:string,points:PathPoint[],face=false){const node:FigureNode={id,name,kind:'path',label:name,parentId:'stage',x:0,y:0,width:0,height:0,path:{points:[{x:0,y:0},{x:1,y:1}],arrow:'none'},visual:{...(face?{tone:'hatch' as const}:{fill:'none'}),strokeWidth:face?1.4:.8,strokeOpacity:face?1:.4,handDrawn:false}};setPathPoints(node,points);figure.nodes.push(node);return node}
  function point(layer:number,u:number,v:number):Point{return{x:left+layer*gap+u*width,y:top+layer*rise+skew*(1-u)+v*(height-skew)}}
  for(let layer=0;layer<p.layers;layer++)path(`plane-${layer}`,`Illustrative slice ${layer+1}`,roundedPlane([point(layer,0,0),point(layer,1,0),point(layer,1,1),point(layer,0,1)]),true)
  const front=p.layers-1
  for(let col=1;col<p.columns;col++)path(`grid-column-${col}`,'Schematic grid column',[point(front,col/p.columns,0),point(front,col/p.columns,1)])
  for(let row=1;row<p.rows;row++)path(`grid-row-${row}`,'Schematic grid row',[point(front,0,row/p.rows),point(front,1,row/p.rows)])
  figure.nodes.push({id:'tensor-label',kind:'text',label:'Tensor features',parentId:'stage',x:16,y:12,width:root.width-32,height:26,textStyle:{family:'Inter',size:18,bold:true,align:'center'},visual:{padding:0,fill:'none',stroke:'none'}})
  if(p.note==='show')figure.nodes.push({id:'schematic-note',kind:'text',label:'Schematic grid',parentId:'stage',x:16,y:root.height-27,width:root.width-32,height:16,textStyle:{family:'Inter',size:11,align:'center'},visual:{padding:0,fill:'none',stroke:'none'}})
  const inputY=point(0,0,.5).y,outputY=point(front,1,.5).y
  path('input-link','Input interface stub',[{x:2,y:inputY},point(0,0,.5)])
  path('output-link','Output interface stub',[point(front,1,.5),{x:root.width-2,y:outputY}])
  for(const [id,key,label,side,y,direction]of [['input','features-in','Features in','left',inputY,'input'],['output','features-out','Features out','right',outputY,'output']] as const)figure.nodes.push({id,kind:'port',parentId:'stage',interfaceFor:'stage',label,x:0,y:0,width:root.width,height:root.height,socket:{key,side,direction,position:y/root.height}})
  return figure
}
