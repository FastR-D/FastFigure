import {z} from 'zod'
import {createBlank,type FigureNode,type Port} from '../core/model.ts'
import {setPathPoints,type PathPoint} from '../core/paths.ts'

const count=(min:number,max:number)=>z.coerce.number().int().min(min).max(max)
export const scaledAttentionParametersSchema=z.object({id:z.literal('scaled-attention'),tokens:count(3,6),channels:count(2,5),mask:z.enum(['none','causal']),details:z.enum(['show','hide'])}).strict()
export type ScaledAttentionParameters=z.infer<typeof scaledAttentionParametersSchema>

/** Independently constructed single-head computation diagram. Grid counts are schematic, not data. */
export function scaledAttentionFigure(input:ScaledAttentionParameters){
  const p=scaledAttentionParametersSchema.parse(input),figure=createBlank(),root=figure.containers[0]!,offset=p.mask==='causal'?100:0,cy=230
  Object.assign(root,{role:'component',width:880+offset,height:510,visual:{fill:'none',stroke:'none'}})
  figure.style={...figure.style,preset:'precise',paletteId:'figureforge-publication-soft'}
  function text(id:string,label:string,x:number,y:number,width:number,height:number,size=14,parentId='stage'){
    const node:FigureNode={id,kind:'text',label,parentId,x,y,width,height,textStyle:{family:'Inter',size,align:'center'},visual:{padding:0,fill:'none',stroke:'none'}};figure.nodes.push(node);return node
  }
  function path(id:string,points:PathPoint[],parentId='stage',colorIndex=0){
    const node:FigureNode={id,kind:'path',label:'',parentId,x:0,y:0,width:0,height:0,path:{points:[{x:0,y:0},{x:1,y:1}],arrow:'none'},visual:{fill:'none',colorIndex,strokeWidth:.8,strokeOpacity:.55,handDrawn:false}};setPathPoints(node,points);figure.nodes.push(node);return node
  }
  function matrix(id:string,label:string,dimensions:string,x:number,y:number,width:number,height:number,rows:number,columns:number,colorIndex:number,below=false){
    const parentId=`${id}-matrix`,gy=below?y-2:y-28
    figure.containers.push({id:parentId,parentId:'stage',role:'component',title:label,x:x-8,y:gy,width:width+16,height:below?height+54:height+56,visual:{fill:'none',stroke:'none'}})
    const frame:FigureNode={id:`${id}-frame`,kind:'rectangle',name:`${label} matrix`,label:'',parentId,x,y,width,height,visual:{colorIndex,tone:'fill',radius:2,strokeWidth:1.3,handDrawn:false}};figure.nodes.push(frame)
    for(let col=1;col<columns;col++){const line=path(`${id}-column-${col}`,[{x:x+col*width/columns,y},{x:x+col*width/columns,y:y+height}],parentId,colorIndex);line.path!.start={nodeId:frame.id,x:col/columns,y:0};line.path!.end={nodeId:frame.id,x:col/columns,y:1}}
    for(let row=1;row<rows;row++){const line=path(`${id}-row-${row}`,[{x,y:y+row*height/rows},{x:x+width,y:y+row*height/rows}],parentId,colorIndex);line.path!.start={nodeId:frame.id,x:0,y:row/rows};line.path!.end={nodeId:frame.id,x:1,y:row/rows}}
    text(`${id}-label`,label,x-2,below?y+height+6:y-26,width+4,20,17,parentId).textStyle!.bold=true
    if(p.details==='show')text(`${id}-dimensions`,dimensions,x-2,y+height+(below?30:7),width+4,18,11,parentId)
    return frame
  }
  function operation(id:string,label:string,x:number,width:number,round=false){const node:FigureNode={id,kind:round?'ellipse':'rectangle',label,parentId:'stage',x,y:cy-23,width,height:46,textStyle:{family:'Inter',size:round?25:16,align:'center'},visual:{radius:round?23:8,tone:'fill',padding:2,strokeWidth:1.3}};figure.nodes.push(node);return node}
  function edge(id:string,source:FigureNode,target:FigureNode,sourcePort:Port='right',targetPort:Port='left'){
    figure.edges.push({id,source:source.id,target:target.id,sourcePort,targetPort,routing:sourcePort==='right'&&targetPort==='left'?'straight':'orthogonal'})
  }

  text('attention-label','Scaled dot-product attention',24,16,root.width-48,30,22).textStyle!.bold=true
  text('attention-formula',p.mask==='causal'?'A = softmax(QKᵀ / √dₖ + M), Y = AV':'A = softmax(QKᵀ / √dₖ), Y = AV',24,57,root.width-48,25,17)
  const q=matrix('query','Q','n × dₖ',32,136,72,64,p.tokens,p.channels,0)
  const kt=matrix('key-transpose','Kᵀ','dₖ × n',32,268,64,72,p.channels,p.tokens,1)
  const score=operation('query-key-product','×',174,46,true),scale=operation('score-scale','÷ √dₖ',256,86)
  edge('q-to-score',q,score,'right','top');edge('kt-to-score',kt,score,'right','bottom');edge('score-to-scale',score,scale)
  let beforeSoftmax=scale
  if(p.mask==='causal'){
    beforeSoftmax=operation('causal-mask','+ M',380,80);edge('scale-to-mask',scale,beforeSoftmax)
    text('mask-caption','Causal mask',370,266,100,20,12)
  }
  const softmax=operation('softmax','Softmax',394+offset,102);edge('to-softmax',beforeSoftmax,softmax)
  text('softmax-caption','over keys',394+offset,266,102,20,12)
  const a=matrix('weights','A','n × n',542+offset,194,72,72,p.tokens,p.tokens,2)
  const product=operation('weighted-values','×',672+offset,46,true),v=matrix('values','V','n × dᵥ',659+offset,348,72,64,p.tokens,p.channels,3,true)
  const y=matrix('output','Y','n × dᵥ',764+offset,198,72,64,p.tokens,p.channels,4)
  edge('softmax-to-weights',softmax,a);edge('weights-to-product',a,product);edge('values-to-product',v,product,'top','bottom');edge('product-to-output',product,y)
  if(p.mask==='causal')for(let row=0;row<p.tokens;row++)for(let col=row+1;col<p.tokens;col++){
    const line=path(`masked-${row}-${col}`,[{x:a.x+col*a.width/p.tokens+2,y:a.y+(row+1)*a.height/p.tokens-2},{x:a.x+(col+1)*a.width/p.tokens-2,y:a.y+row*a.height/p.tokens+2}],a.parentId,2)
    line.path!.start={nodeId:a.id,x:col/p.tokens+2/a.width,y:(row+1)/p.tokens-2/a.height};line.path!.end={nodeId:a.id,x:(col+1)/p.tokens-2/a.width,y:row/p.tokens+2/a.height}
  }
  text('schematic-note',p.mask==='causal'?'Schematic grids · hatching: masked weights (zero) · Q and K share sequence order':'Schematic grids · no attention values · grid counts do not specify tensor dimensions',24,480,root.width-48,18,12)
  for(const [id,key,label,frame,direction]of [['query-in','query-in','Queries Q',q,'input'],['key-in','key-transpose-in','Transposed keys Kᵀ',kt,'input'],['values-in','values-in','Values V',v,'input'],['output-port','attention-out','Attention output Y',y,'output']] as const){
    const side=direction==='input'?'left':'right',position=(frame.y+frame.height/2)/root.height,boundary=side==='left'?2:root.width-2
    const stub=path(`${id}-stub`,direction==='input'?[{x:boundary,y:frame.y+frame.height/2},{x:frame.x,y:frame.y+frame.height/2}]:[{x:frame.x+frame.width,y:frame.y+frame.height/2},{x:boundary,y:frame.y+frame.height/2}])
    stub.path![direction==='input'?'end':'start']={nodeId:frame.id,x:direction==='input'?0:1,y:.5}
    figure.nodes.push({id,kind:'port',parentId:'stage',interfaceFor:'stage',label,x:0,y:0,width:root.width,height:root.height,socket:{key,side,position,direction}})
  }
  return figure
}
