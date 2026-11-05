import {createBlank,type FigureNode} from '../core/model.ts'
import {setPathPoints,type PathPoint} from '../core/paths.ts'

/** Common native objects and boundary ports for relationship diagrams. IDs are recipe-owned. */
export function createStructureBuilder(){
  const figure=createBlank(),root=figure.containers[0]!
  Object.assign(root,{x:0,y:0,role:'component',visual:{fill:'none',stroke:'none'}})
  figure.style={...figure.style,preset:'precise'}
  function text(id:string,label:string,x:number,y:number,width:number,height:number,size=14,parentId='stage',bold=false){
    const node:FigureNode={id,kind:'text',label,parentId,x,y,width,height,textRole:bold?'heading':'body',textStyle:{size,align:'center',bold},visual:{padding:0,fill:'none',stroke:'none'}};figure.nodes.push(node);return node
  }
  function shape(id:string,label:string,x:number,y:number,width:number,height:number,colorIndex=0,parentId='stage',ellipse=false){
    const node:FigureNode={id,kind:ellipse?'ellipse':'rectangle',label,parentId,x,y,width,height,textStyle:{size:13,align:'center'},visual:{colorIndex,tone:'fill',padding:4,stroke:'none',handDrawn:false}};figure.nodes.push(node);return node
  }
  function path(id:string,points:PathPoint[],arrow:'none'|'filled'='none',closed=false,colorIndex=0,parentId='stage'){
    const node:FigureNode={id,kind:'path',label:id,parentId,x:0,y:0,width:0,height:0,path:{points:[{x:0,y:0},{x:1,y:1}],arrow},visual:{...(closed?{tone:'fill' as const}:{fill:'none'}),colorIndex,strokeWidth:1.3,handDrawn:false,lineJoin:'round'}};setPathPoints(node,points);figure.nodes.push(node);return node
  }
  function bind(line:FigureNode,a:FigureNode,b:FigureNode,points:PathPoint[]){
    const attachment=(n:FigureNode,q:PathPoint)=>({nodeId:n.id,x:Math.max(0,Math.min(1,(q.x-n.x)/n.width)),y:Math.max(0,Math.min(1,(q.y-n.y)/n.height))})
    line.path!.start=attachment(a,points[0]!);line.path!.end=attachment(b,points.at(-1)!)
  }
  function group(id:string,title:string,x:number,y:number,width:number,height:number,colorIndex?:number){
    figure.containers.push({id,title,parentId:'stage',role:'component',x,y,width,height,visual:colorIndex===undefined?{fill:'none',stroke:'none'}:{colorIndex,strokeWidth:1,handDrawn:false}})
  }
  function finish(title:string,note:string){
    text('structure-title',title,16,14,root.width-32,30,20,'stage',true)
    text('structure-note',note,16,root.height-30,root.width-32,20,11)
    for(const side of ['left','right'] as const)figure.nodes.push({id:`structure-${side}`,kind:'port',label:`Structure ${side}`,parentId:'stage',interfaceFor:'stage',x:0,y:0,width:root.width,height:root.height,socket:{key:`structure-${side}`,direction:'both',side,position:.5}})
    return figure
  }
  return{figure,root,text,shape,path,bind,group,finish}
}

/** A circular arc approximated by cubic Béziers, split at at most quarter turns. */
export function circleArc(cx:number,cy:number,r:number,start:number,sweep:number):PathPoint[]{
  const steps=Math.max(1,Math.ceil(Math.abs(sweep)/(Math.PI/2))),step=sweep/steps,point=(angle:number)=>({x:cx+r*Math.cos(angle),y:cy+r*Math.sin(angle)}),points:PathPoint[]=[point(start)]
  for(let i=0;i<steps;i++){
    const a=start+i*step,b=a+step,from=point(a),to=point(b),k=4/3*Math.tan(step/4)
    points.push({...to,c1:{x:from.x-k*r*Math.sin(a),y:from.y+k*r*Math.cos(a)},c2:{x:to.x+k*r*Math.sin(b),y:to.y-k*r*Math.cos(b)}})
  }
  return points
}
