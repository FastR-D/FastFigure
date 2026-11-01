import {applyScientificPresentation} from './scientificPresentation.ts'
import {z} from 'zod'
import type {ComponentSource,FigureNode} from '../core/model.ts'
import {createStructureBuilder} from './structureBuilder.ts'

export const skipStructureIds=['unet-encoder-decoder','residual-block'] as const
export const skipStructureSchemas=[
  z.object({id:z.literal('unet-encoder-decoder'),levels:z.coerce.number().int().min(3).max(5)}).strict(),
  z.object({id:z.literal('residual-block'),block:z.enum(['basic','bottleneck']),shortcut:z.enum(['identity','projection'])}).strict(),
] as const
const schema=z.discriminatedUnion('id',skipStructureSchemas)
type Parameters=z.infer<typeof schema>
export const isSkipStructure=(p:{id:string}):p is Parameters=>(skipStructureIds as readonly string[]).includes(p.id)
export const skipStructureSemantics={
  'unet-encoder-decoder':{relation:'A contracting path, one shared bottleneck and an expanding path. Each encoder stage copies/crops features into concatenation C at its corresponding decoder scale, never addition. Main downsampling is 2×2 max pool; main upsampling is 2×2 up-convolution. Each encoder/decoder stage and the bottleneck summarize two 3×3 conv+ReLU operations; final 1×1 head maps to unspecified output classes. Level count is illustrative; no claimed channel/spatial sizes or exact 23-layer reconstruction.',labels:'encoder-i, decoder-i, crop-i, concat-i for i=0..levels-2 (finest first); bottleneck, input-tile, output-head. copy-i is the lateral skip, crop-concat-i and decode-i preserve concat order, pool-i and up-i are separate bound paths. Operation labels describe the existing pool/up paths, not extra computational nodes. The deepest transition reserves label space, independent of stage count. Stage backplates are illustrative feature-stack geometry only.'},
  'residual-block':{relation:'Post-activation residual block: y=ReLU(F(x)+x), or y=ReLU(F(x)+Ws x) with explicit projected shortcut. Basic F uses 3×3,3×3; bottleneck uses 1×1,3×3,1×1. Each conv has BN; intermediate convs have ReLU but the final conv does not, until after addition. Identity assumes matching shapes; projection aligns them, with no invented stride/channels. Not pre-activation ResNet, concatenation or a recurrent loop.',labels:'residual-input, conv-i, residual-sum, residual-relu; shortcut-projection only when selected. Main and shortcut paths are independently bound to the addition node. residual-formula documents the selected shortcut.'},
} as const
export const skipStructureSources:Record<typeof skipStructureIds[number],ComponentSource[]>={
  'unet-encoder-decoder':[{title:'U-Net: Convolutional Networks for Biomedical Image Segmentation · Fig. 1 / §2',reference:'https://arxiv.org/abs/1505.04597 · 依据收缩／扩展、2×2 池化／上卷积、copy/crop→拼接和 1×1 输出独立构造。各阶段合并表示两次 3×3 conv+ReLU；尺度数可变，不复刻原图或填造尺寸、通道、分割结果。'}],
  'residual-block':[{title:'Deep Residual Learning for Image Recognition · Fig. 2 / Fig. 5 / §3.2–3.4',reference:'https://arxiv.org/abs/1512.03385 · 独立构造相加后激活的基础／瓶颈残差块。BN 在卷积后、激活前，最后一次卷积后不单独激活；捷径可选恒等或 1×1 投影。尺寸兼容为显式假设，不填造步幅与通道，不代表 pre-activation 版本。'}],
}

export function skipStructureFigure(raw:Parameters){
  const p=schema.parse(raw),{figure,root,text,shape,path,bind,finish}=createStructureBuilder()
  function connect(id:string,a:FigureNode,b:FigureNode,color=0){const points=[{x:a.x+a.width,y:a.y+a.height/2},{x:b.x,y:b.y+b.height/2}];bind(path(id,points,'filled',false,color),a,b,points)}
  if(p.id==='residual-block'){
    root.width=980;root.height=424
    const input=shape('residual-input','x',32,244,96,48,0),sum=shape('residual-sum','+',770,248,40,40,2,'stage',true),relu=shape('residual-relu','ReLU',854,244,92,48,2),kernels=p.block==='basic'?['3×3','3×3']:['1×1','3×3','1×1']
    const stages=kernels.map((kernel,i)=>shape(`conv-${i}`,`${kernel} conv\nBN${i<kernels.length-1?' → ReLU':''}`,p.block==='basic'?250+i*280:206+i*182,236,140,64,1))
    connect('residual-in',input,stages[0]!,1);for(let i=0;i<stages.length-1;i++)connect(`conv-link-${i}`,stages[i]!,stages[i+1]!,1)
    connect('residual-main',stages.at(-1)!,sum,1);connect('residual-out',sum,relu,2)
    const start={x:input.x+input.width/2,y:input.y},end={x:sum.x+sum.width/2,y:sum.y}
    if(p.shortcut==='identity'){
      const points=[start,{x:start.x,y:112},{x:end.x,y:112},end];bind(path('identity-shortcut',points,'filled',false,0),input,sum,points)
      text('shortcut-label','Identity shortcut · matching shapes',260,78,420,26,14)
    }else{
      const projection=shape('shortcut-projection','1×1 projection\nBN',402,88,164,48,0),a=[start,{x:start.x,y:112},{x:projection.x,y:112}],b=[{x:projection.x+projection.width,y:112},{x:end.x,y:112},end]
      bind(path('projection-in',a,'filled'),input,projection,a);bind(path('projection-out',b,'filled'),projection,sum,b)
      text('shortcut-label','Projected shortcut · align shapes',258,50,420,26,14)
    }
    text('residual-label',p.block==='basic'?'Basic residual path F(x)':'Bottleneck residual path F(x)',190,192,540,28,16,'stage',true)
    text('residual-formula',`y = ReLU(F(x) + ${p.shortcut==='identity'?'x':'Wₛx'})`,170,330,640,32,19,'stage',true)
    figure.nodes.find(n=>n.id==='residual-formula')!.textStyle!.size=16;figure.nodes.find(n=>n.id==='residual-label')!.textStyle!.size=14
    return applyScientificPresentation(finish(p.block==='basic'?'Residual addition':'Bottleneck residual addition','Post-activation · dimensions assumed compatible'),{representation:['residual-input'],model:stages.map(n=>n.id),'secondary-model':['shortcut-projection','residual-relu'],operation:['residual-sum']})
  }
  root.width=760;root.height=136+p.levels*76
  const encoders:FigureNode[]=[],decoders:FigureNode[]=[],concats:FigureNode[]=[]
  const input=shape('input-tile','Input tile',40,58,128,28,0),head=shape('output-head','1×1 output',580,58,128,28,2)
  for(let i=0;i<p.levels-1;i++){
    const y=110+i*76,ex=40+i*30,dx=580-i*30
    // Independent backplates suggest feature stacks, never measured spatial/channel dimensions.
    for(const [side,x,color]of [['encoder',ex,0],['decoder',dx,2]] as const){const back=shape(`${side}-back-${i}`,'',x+6,y-6,128,48,color);back.visual!.fillOpacity=.45}
    const encoder=shape(`encoder-${i}`,`E${i+1} · Conv ×2`,ex,y,128,48,0),decoder=shape(`decoder-${i}`,`D${i+1} · Conv ×2`,dx,y,128,48,2),crop=shape(`crop-${i}`,'Copy/crop',dx-158,y+8,86,32,4),concat=shape(`concat-${i}`,'C',dx-44,y+10,28,28,1,'stage',true)
    crop.visual!.fill='#ffffff';crop.visual!.dash=[4,3]
    connect(`copy-${i}`,encoder,crop,4);connect(`crop-concat-${i}`,crop,concat,1);connect(`decode-${i}`,concat,decoder,2)
    encoders.push(encoder);decoders.push(decoder);concats.push(concat)
  }
  const bottleneck=shape('bottleneck','B · Conv ×2',308,150+(p.levels-1)*76,144,48,1)
  const inputPoints=[{x:104,y:86},{x:104,y:110}],outputPoints=[{x:644,y:110},{x:644,y:86}]
  bind(path('unet-input',inputPoints,'filled'),input,encoders[0]!,inputPoints);bind(path('unet-output',outputPoints,'filled',false,2),decoders[0]!,head,outputPoints)
  for(let i=0;i<p.levels-1;i++){
    const e=encoders[i]!,lower=i===p.levels-2?bottleneck:encoders[i+1]!,upSource=i===p.levels-2?bottleneck:decoders[i+1]!,concat=concats[i]!,down=[{x:e.x+e.width/2,y:e.y+48},{x:lower.x+lower.width/2,y:lower.y}],up=[{x:upSource.x+upSource.width/2,y:upSource.y},{x:concat.x+14,y:concat.y+28}]
    bind(path(`pool-${i}`,down,'filled',false,0),e,lower,down);bind(path(`up-${i}`,up,'filled',false,2),upSource,concat,up)
    if(i===p.levels-2){
      // Reserve a real gap for the two operation labels; narrow fields wrap the
      // existing text without shrinking it or changing the scientific path.
      text(`pool-label-${i}`,'2×2 pool',Math.max(e.x+e.width+8,(down[0]!.x+down[1]!.x)/2-25),e.y+37,50,34,13)
      text(`up-label-${i}`,'2×2 up-conv',(up[0]!.x+up[1]!.x)/2,(up[0]!.y+up[1]!.y)/2+1,64,34,13)
    }else{
      text(`pool-label-${i}`,'2×2 pool',e.x+94,e.y+50,104,20,13)
      text(`up-label-${i}`,'2×2 up-conv',upSource.x+80,upSource.y-27,110,20,13)
    }
  }
  text('unet-key','Conv ×2 = two 3×3 conv + ReLU; C = concatenation',190,62,360,24,13)
  const result=applyScientificPresentation(finish('Multi-scale encoding and skip fusion','Schematic feature stages'),{representation:[...encoders,...decoders].map(n=>n.id),model:['bottleneck'],operation:concats.map(n=>n.id),'secondary-model':['input-tile','output-head']})
  Object.assign(figure.nodes.find(n=>n.id==='structure-note')!,{x:190,y:88,width:360,height:18})
  for(const node of figure.nodes){if(node.id.startsWith('copy-'))node.visual={...node.visual,stroke:'#6e9992',strokeWidth:1.05};if(node.id.startsWith('crop-')&&!node.path)node.visual={...node.visual,stroke:'#87968d',strokeWidth:.8,fill:'#ffffff',radius:2};if(node.id.includes('-back-'))node.visual={...node.visual,fill:'#f5f9f8',stroke:'#cadbd7',strokeWidth:.8,fillOpacity:1}}
  return result
}
