import {z} from 'zod'
import {createBlank,type FigureNode} from '../core/model.ts'
import {setPathPoints,type PathPoint} from '../core/paths.ts'

export const patchEmbeddingParametersSchema=z.object({id:z.literal('patch-embedding'),grid:z.coerce.number().int().min(2).max(4),classToken:z.enum(['show','hide']),position:z.enum(['learned','none']),details:z.enum(['show','hide'])}).strict()
export type PatchEmbeddingParameters=z.infer<typeof patchEmbeddingParametersSchema>

/** Native schematic of ViT §3.1 before the encoder. Cell counts never determine H, W, P, C or D. */
export function patchEmbeddingFigure(input:PatchEmbeddingParameters){
  const p=patchEmbeddingParametersSchema.parse(input),figure=createBlank(),root=figure.containers[0]!,count=p.grid*p.grid,cls=p.classToken==='show',sequenceRows=count+(cls?1:0),sequenceHeight=sequenceRows*18+(sequenceRows-1)*3,cy=Math.max(250,110+sequenceHeight/2)
  Object.assign(root,{role:'component',width:940,height:Math.max(cy+182,cy+sequenceHeight/2+100),visual:{fill:'none',stroke:'none'}})
  figure.style={...figure.style,preset:'precise',paletteId:'figureforge-publication-soft'}
  function group(id:string,title:string,x:number,y:number,width:number,height:number){figure.containers.push({id,title,parentId:'stage',role:'component',x,y,width,height,visual:{fill:'none',stroke:'none'}})}
  function text(id:string,label:string,x:number,y:number,width:number,height:number,size=13,parentId='stage',bold=false){const node:FigureNode={id,kind:'text',label,parentId,x,y,width,height,textStyle:{family:'Inter',size,align:'center',bold},visual:{padding:0,fill:'none',stroke:'none'}};figure.nodes.push(node);return node}
  function rect(id:string,name:string,x:number,y:number,width:number,height:number,parentId:string,colorIndex=0,label='',visible=true){const node:FigureNode={id,name,kind:'rectangle',label,parentId,x,y,width,height,textStyle:{family:'Inter',size:11,align:'center'},visual:visible?{colorIndex,tone:'fill',radius:2,strokeWidth:1,padding:1,handDrawn:false}:{fill:'none',stroke:'none'}};figure.nodes.push(node);return node}
  function path(id:string,points:PathPoint[],parentId:string,colorIndex=0){const node:FigureNode={id,kind:'path',label:'',parentId,x:0,y:0,width:0,height:0,path:{points:[{x:0,y:0},{x:1,y:1}],arrow:'none'},visual:{fill:'none',colorIndex,strokeWidth:.7,strokeOpacity:.45,handDrawn:false}};setPathPoints(node,points);figure.nodes.push(node);return node}
  function separator(id:string,frame:FigureNode,u:number,v?:number){
    const line=v===undefined?path(id,[{x:frame.x+frame.width*u,y:frame.y},{x:frame.x+frame.width*u,y:frame.y+frame.height}],frame.parentId,frame.visual?.colorIndex):path(id,[{x:frame.x,y:frame.y+frame.height*v},{x:frame.x+frame.width,y:frame.y+frame.height*v}],frame.parentId,frame.visual?.colorIndex)
    line.path!.start={nodeId:frame.id,x:v===undefined?u:0,y:v??0};line.path!.end={nodeId:frame.id,x:v===undefined?u:1,y:v??1}
  }
  function matrix(id:string,name:string,x:number,y:number,width:number,height:number,parentId:string,color:number){const frame=rect(id,name,x,y,width,height,parentId,color);for(const [index,value]of [1/3,2/3].entries()){separator(`${id}-column-${index}`,frame,value);separator(`${id}-row-${index}`,frame,0,value)}return frame}
  function edge(id:string,source:FigureNode,target:FigureNode,vertical=false){figure.edges.push({id,source:source.id,target:target.id,sourcePort:vertical?'bottom':'right',targetPort:vertical?'top':'left',routing:'straight'})}
  function vectors(prefix:string,title:string,x:number,width:number,labels:string[],withClass=false,flatten=false){
    const height=labels.length*18+(labels.length-1)*3,top=cy-height/2,parentId=`${prefix}-group`
    group(parentId,title,x-8,top-40,width+16,height+86)
    const frame=rect(`${prefix}-boundary`,title,x-2,top-2,width+4,height+4,parentId,0,'',false)
    text(`${prefix}-caption`,prefix==='output'?'Encoder\ninput':title,x-4,top-(prefix==='output'?38:34),width+8,prefix==='output'?36:24,prefix==='output'?12:13,parentId,true)
    for(const [i,label]of labels.entries()){
      const row=rect(`${prefix}-${withClass&&i===0?'cls':i+(withClass?0:1)}`,`${title}: ${label}`,x,top+i*21,width,18,parentId,withClass&&i===0?4:(i-(withClass?1:0))%4,label)
      if(flatten){separator(`${row.id}-first`,row,1/3);separator(`${row.id}-second`,row,2/3)}else separator(`${row.id}-cell`,row,.18)
    }
    if(p.details==='show')text(`${prefix}-dimensions`,prefix==='flat'?'N × (P²C)':withClass?'(N + 1) × D':'N × D',x-6,top+height+10,width+12,26,12,parentId)
    return frame
  }

  text('patch-title',p.position==='none'?cls?'Patch embedding · no position embedding':'Patch embedding · no CLS / position embedding':cls?'ViT patch embedding':'Patch embedding · no class token',24,12,892,30,22,'stage',true)
  group('image-group','Schematic image',18,cy-120,172,258)
  text('image-caption','Image patches',20,cy-116,168,26,16,'image-group',true)
  const image=rect('image-boundary','Schematic image boundary',24,cy-80,160,160,'image-group',0,'',false),cell=160/p.grid
  for(let i=0;i<count;i++){const tile=rect(`patch-${i+1}`,`Shown patch ${i+1}`,image.x+i%p.grid*cell+2,image.y+Math.floor(i/p.grid)*cell+2,cell-4,cell-4,'image-group',i%4,`p${i+1}`);tile.textStyle!.size=13}
  if(p.details==='show')text('image-dimensions','H × W × C',24,cy+96,160,26,13,'image-group')
  const flat=vectors('flat','Flatten',226,84,Array.from({length:count},(_,i)=>`p${i+1}`),false,true)
  group('projection-group','Shared linear projection',328,cy-88,128,172)
  text('projection-caption','Shared linear E',330,cy-82,124,26,14,'projection-group',true)
  const projection=matrix('projection-matrix','Shared projection E',350,cy-42,84,84,'projection-group',2)
  text('projection-symbol','E',380,cy-12,24,24,20,'projection-group',true)
  if(p.details==='show')text('projection-dimensions','P²C → D',330,cy+54,124,26,13,'projection-group')
  const embedded=vectors('embedded','Embeddings',478,72,Array.from({length:count},(_,i)=>`e${i+1}`)),sequence=vectors('sequence','Sequence',622,72,[...(cls?['[CLS]']:[]),...Array.from({length:count},(_,i)=>`e${i+1}`)],cls),output=vectors('output','Encoder input',844,72,[...(cls?['z_cls']:[]),...Array.from({length:count},(_,i)=>`z${i+1}`)],cls)
  edge('image-to-flat',image,flat);edge('flat-to-projection',flat,projection);edge('projection-to-embeddings',projection,embedded)
  if(cls){
    text('class-caption','Learned CLS',542,50,78,22,12)
    const token=rect('class-parameter','Learned class token',556,78,50,28,'stage',4,'x_class'),concat=rect('prepend-class','Prepend class token',562,cy-17,38,34,'stage',4,'cat')
    edge('embeddings-to-prepend',embedded,concat);edge('class-to-prepend',token,concat,true);edge('prepend-to-sequence',concat,sequence)
  }else edge('embeddings-to-sequence',embedded,sequence)
  if(p.position==='learned'){
    group('position-group','Learned position embedding',670,50,160,130)
    text('position-caption',`Learned E_pos${p.details==='show'?`\n${cls?'(N + 1)':'N'} × D`:''}`,674,54,152,48,13,'position-group',true)
    const position=matrix('position-matrix','Learned position embedding E_pos',697,116,104,60,'position-group',5),sum:FigureNode={id:'add-position',kind:'ellipse',label:'+',parentId:'stage',x:734,y:cy-15,width:30,height:30,textStyle:{family:'Inter',size:22,align:'center'},visual:{tone:'fill',colorIndex:5,padding:0,strokeWidth:1}};figure.nodes.push(sum)
    edge('sequence-to-add',sequence,sum);edge('position-to-add',position,sum,true);edge('add-to-output',sum,output)
  }else edge('sequence-to-output',sequence,output)
  if(p.details==='show')text('patch-formula',`z₀ = ${cls?'concat(x_class, X_p E)':'X_p E'}${p.position==='learned'?' + E_pos':''};  N = HW/P²  (H, W divisible by P)`,24,root.height-50,892,24,13)
  text('schematic-note','Illustrative patches and vector cells; H, W, P, C, N and D are symbolic, not inferred from shown counts.',24,root.height-22,892,18,11)
  for(const [id,key,label,side,frame,direction]of [['image-port','image-in','Image input','left',image,'input'],['tokens-port','tokens-out',p.position==='learned'?'Tokens + position':'Tokens (no position)','right',output,'output']] as const){
    const y=cy,boundary=side==='left'?2:root.width-2
    path(`${id}-stub`,side==='left'?[{x:boundary,y},{x:frame.x,y}]:[{x:frame.x+frame.width,y},{x:boundary,y}],'stage')
    figure.nodes.push({id,kind:'port',label,parentId:'stage',interfaceFor:'stage',x:0,y:0,width:root.width,height:root.height,socket:{key,side,direction,position:y/root.height}})
  }
  return figure
}
