import {applyScientificPresentation} from './scientificPresentation.ts'
import {z} from 'zod'
import type {FigureNode,ComponentSource} from '../core/model.ts'
import {createStructureBuilder} from './structureBuilder.ts'

export const recentStructureIds=['streaming-memory','alternating-view-attention'] as const
export const recentStructureSchemas=[
  z.object({id:z.literal('streaming-memory'),memories:z.coerce.number().int().min(2).max(4),prompt:z.enum(['show','hide'])}).strict(),
  z.object({id:z.literal('alternating-view-attention'),views:z.coerce.number().int().min(2).max(4)}).strict(),
] as const
const schema=z.discriminatedUnion('id',recentStructureSchemas)
type Parameters=z.infer<typeof schema>
export const isRecentStructure=(p:{id:string}):p is Parameters=>(recentStructureIds as readonly string[]).includes(p.id)
export const recentStructureSemantics={
  'streaming-memory':{relation:'SAM 2-inspired forward streaming abstraction: previously observed memories condition memory attention on current image features; optional prompt encoder conditions the mask decoder. Current mask AND unconditional image features enter the memory encoder, whose result updates a distinct bank state for subsequent frames. Read <t and write ≤t are not an instantaneous cycle or parameter transfer. Memory count is a schematic display count, not FIFO capacity. The next-frame attention is a contextual continuation, not a second complete inference graph. Object pointers, high-resolution decoder skips, mask disambiguation and memory selection policy are omitted.',labels:'stream-history, stream-current, stream-future; past-memory-i; history-frame → memory-attention via history-read; frame-input → image-encoder → memory-attention → mask-decoder → current-mask → memory-encoder. image-to-memory supplies unconditional features separately. prompt-input / prompt-encoder only when shown. memory-write → updated-bank → future-attention. Bank cells are placeholders, never observed masks or embeddings.'},
  'alternating-view-attention':{relation:'VGGT-inspired multi-view abstraction: per-image DINO patch tokens with added camera tokens enter a shared global self-attention spanning all shown views, followed by separate frame-wise self-attention. The dashed ×L enclosure indicates repeated alternating blocks, not a feedback edge or numeric layer count. Updated camera tokens feed a camera head; patch tokens feed task-specific DPT heads for depth, points and tracking features. Tracks additionally require query points and a separate tracking module, not a direct transformer prediction. No numerical tensor dimensions, estimated scene or performance. Register tokens, first-frame identity, normalization and head internals are not expanded.',labels:'view-inputs, alternating-blocks, geometry-heads; view-i, dino-i, input-tokens-i, global-attention, global-row-i, frame-attention-i, updated-tokens; camera-head, camera-output, dense-heads, dense-output, tracking-module, query-points, track-output. One incoming/outgoing row per view; no cross-view edges between the independent frame-attention nodes.'},
} as const
export const recentStructureSources:Record<typeof recentStructureIds[number],ComponentSource[]>={
  'streaming-memory':[{title:'SAM 2: Segment Anything in Images and Videos · ICLR 2025 · Fig. 1–3 / §4',reference:'https://proceedings.iclr.cc/paper_files/paper/2025/hash/45c1f6a8cbf2da59ebf2c802b4f742cd-Abstract-Conference.html · 独立抽象当前帧、可选提示、历史读取与后续状态写入。补出 Fig. 3 图注说明的无条件图像特征到记忆编码器输入；非完整 SAM 2，省略对象指针、高分辨率跳连、消歧与缓存策略。槽位数量仅示意。'}],
  'alternating-view-attention':[{title:'VGGT: Visual Geometry Grounded Transformer · CVPR 2025 · Fig. 1–2 / §3.1–3.3',reference:'https://openaccess.thecvf.com/content/CVPR2025/html/Wang_VGGT_Visual_Geometry_Grounded_Transformer_CVPR_2025_paper.html · 独立抽象跨视图／逐视图注意力交替、相机 token 与稠密头的分工。跟踪特征须与查询点进入单独跟踪模块；视图、token 和 L 均非观测维度或层数。不复用照片、几何结果或原图作品。'}],
}

/** Native structural abstractions; independently arranged, without original paper artwork. */
export function recentStructureFigure(raw:Parameters){
  const p=schema.parse(raw),{figure,root,text,shape,path,bind,group,finish}=createStructureBuilder()
  root.width=980;root.height=600
  function link(id:string,a:FigureNode,b:FigureNode,pts:{x:number;y:number}[],color=0,parent='stage'){const line=path(id,pts,'filled',false,color,parent);bind(line,a,b,pts);return line}
  function horizontal(id:string,a:FigureNode,b:FigureNode,color=0,parent='stage'){return link(id,a,b,[{x:a.x+a.width,y:a.y+a.height/2},{x:b.x,y:b.y+b.height/2}],color,parent)}
  if(p.id==='streaming-memory'){
    const past='stream-history',current='stream-current',future='stream-future'
    group(past,'Previously observed state',282,64,188,74,3);group(current,'Current frame t',20,154,940,266,0);group(future,'Subsequent frame context',300,444,660,100,2)
    text('history-heading','History < t',292,70,168,22,14,past,true)
    const history=shape('history-frame','',292,98,168,30,3,past);history.visual={fill:'none',stroke:'#718096',strokeWidth:1}
    for(let i=0;i<p.memories;i++){const cell=shape(`past-memory-${i}`,`m${i+1}`,296+i*160/p.memories,101,160/p.memories-4,24,3,past);cell.textStyle!.size=11;cell.visual!.padding=1}
    text('current-heading','Current frame t',38,168,240,24,17,current,true)
    const input=shape('frame-input','Frame t',36,232,90,56,0,current),image=shape('image-encoder','Image\nencoder',154,232,118,56,0,current),attention=shape('memory-attention','Memory\nattention',328,232,132,56,3,current),decoder=shape('mask-decoder','Mask decoder',512,232,128,56,1,current),mask=shape('current-mask','Mask t',696,232,104,56,1,current),encoder=shape('memory-encoder','Memory\nencoder',834,232,110,56,3,current)
    horizontal('frame-encoding',input,image,0,current);horizontal('current-features',image,attention,0,current);horizontal('conditioned-features',attention,decoder,3,current);horizontal('mask-prediction',decoder,mask,1,current);horizontal('mask-to-memory',mask,encoder,1,current)
    link('history-read',history,attention,[{x:394,y:128},{x:284,y:128},{x:284,y:220},{x:394,y:220},{x:394,y:232}],3)
    text('history-read-label','Read',226,138,58,18,11)
    link('image-to-memory',image,encoder,[{x:213,y:288},{x:213,y:402},{x:816,y:402},{x:816,y:274},{x:834,y:274}],0,current)
    text('unconditional-feature-label','Unconditional image features',284,374,268,20,12,current)
    if(p.prompt==='show'){
      const prompt=shape('prompt-input','Points / box / mask',294,174,174,36,4,current),promptEncoder=shape('prompt-encoder','Prompt encoder',512,174,128,36,4,current)
      horizontal('prompt-encoding',prompt,promptEncoder,4,current);link('prompt-conditioning',promptEncoder,decoder,[{x:576,y:210},{x:576,y:232}],4,current)
    }
    text('future-heading','Next frame context · t+1',314,450,304,22,14,future,true)
    const updated=shape('updated-bank','Updated bank ≤ t',718,464,226,62,3,future),next=shape('future-attention','Read at t+1',328,480,132,40,3,future)
    link('memory-write',encoder,updated,[{x:889,y:288},{x:889,y:464}],3)
    text('memory-write-label','Write for later',734,424,140,18,11)
    link('next-memory-read',updated,next,[{x:718,y:495},{x:492,y:495},{x:492,y:500},{x:460,y:500}],3,future)
    return finish('Prompted streaming with explicit memory state','Schematic bank slots; forward streaming only. Memory selection, object pointers and decoder skips are omitted.')
  }
  const inputs='view-inputs',blocks='alternating-blocks',heads='geometry-heads',height=p.views*74-14
  group(inputs,'Multi-view inputs',20,64,382,490);group(blocks,'Alternating attention',420,64,296,p.views*74+90,2);group(heads,'Typed geometric outputs',736,64,236,490)
  text('inputs-heading','Views → DINO patches + camera tokens',26,76,370,24,14,inputs,true)
  text('alternation-heading','Alternating blocks · × L',426,76,284,24,15,blocks,true)
  text('global-heading','Global SA',434,104,110,22,13,blocks,true);text('frame-heading','Frame SA',594,104,110,22,13,blocks,true)
  const global=shape('global-attention','',434,128,110,height,3,blocks),updated=shape('updated-tokens','',750,128,24,height,2,heads)
  global.visual!.radius=8;updated.visual={fill:'none',stroke:'#718096',strokeWidth:1}
  for(let i=0;i<p.views;i++){
    const y=136+i*74,input=shape(`view-${i}`,`View ${i+1}`,26,y,78,40,i,inputs),dino=shape(`dino-${i}`,'DINO\npatch tokens',134,y,102,40,i,inputs),tokens=shape(`input-tokens-${i}`,`+ c${i+1}\npatch p${i+1}`,274,y,104,40,i,inputs),frame=shape(`frame-attention-${i}`,`View ${i+1} SA`,594,y,110,40,i,blocks)
    for(const node of [dino,tokens]){node.textStyle!.size=12;node.visual!.padding=2}
    tokens.label='';tokens.visual={fill:'none',stroke:'none'}
    const badge=shape(`camera-token-${i}`,`c${i+1}`,278,y+8,24,24,i,inputs,true);badge.textStyle!.size=10;badge.visual!.padding=1
    for(let chip=0;chip<3;chip++)shape(`patch-token-${i}-${chip}`,'',310+chip*18,y+5,14,30,i,inputs).visual!.radius=1
    const row=shape(`global-row-${i}`,`c${i+1}, p${i+1}`,444,y,90,40,i,blocks);row.visual!.stroke='none'
    const tile=shape(`updated-row-${i}`,'',752,y,20,40,i,heads);tile.visual!.radius=0
    horizontal(`patchify-${i}`,input,dino,i,inputs);horizontal(`add-camera-${i}`,dino,tokens,i,inputs)
    link(`global-in-${i}`,tokens,global,[{x:378,y:y+20},{x:434,y:y+20}],i)
    link(`global-to-frame-${i}`,global,frame,[{x:544,y:y+20},{x:594,y:y+20}],i,blocks)
    link(`frame-output-${i}`,frame,updated,[{x:704,y:y+20},{x:750,y:y+20}],i)
  }
  text('scope-label','Across views → within each view',428,136+height,280,30,12,blocks)
  const camera=shape('camera-head','Camera head',818,118,142,42,4,heads),dense=shape('dense-heads','DPT heads',818,256,142,42,1,heads),tracker=shape('tracking-module','Tracking module',818,430,142,42,2,heads),query=shape('query-points','Query points',740,520,120,32,4,heads)
  link('camera-token-head',updated,camera,[{x:774,y:144},{x:796,y:144},{x:796,y:139},{x:818,y:139}],4,heads)
  const dy=Math.min(278,128+height-8);link('patch-token-heads',updated,dense,[{x:774,y:dy},{x:796,y:dy},{x:796,y:277},{x:818,y:277}],1,heads)
  text('camera-output','Cameras',818,170,142,24,14,heads);text('dense-output','Depth · Points\nTracking features',818,310,142,44,13,heads)
  link('features-to-tracker',dense,tracker,[{x:889,y:298},{x:970,y:298},{x:970,y:451},{x:960,y:451}],2,heads)
  text('tracking-feature-label','Track features',818,382,142,22,12,heads)
  link('tracking-query',query,tracker,[{x:800,y:520},{x:800,y:451},{x:818,y:451}],4,heads)
  text('track-output','Tracks',818,480,142,24,14,heads)
  const result=applyScientificPresentation(finish('Shared and per-view attention','Schematic tokens · query-based tracking uses a separate module'),{model:['global-attention'],'secondary-model':Array.from({length:p.views},(_,i)=>[`dino-${i}`,`frame-attention-${i}`]).flat().concat('tracking-module'),decoder:['camera-head','dense-heads'],result:['camera-output','dense-output','track-output']},{keepBoundaries:[blocks]})
  const repeat=figure.containers.find(c=>c.id===blocks)!;repeat.visual={fill:'none',stroke:'#b6c3cf',strokeWidth:1,dash:[5,4]}
  const colors=['#2c7d79','#bc735b','#6e83a4','#a68b4c']
  for(let i=0;i<p.views;i++){
    const row=figure.nodes.find(n=>n.id===`global-row-${i}`)!;row.visual={fill:'none',stroke:'none',padding:2};row.textStyle={...row.textStyle,color:'#ffffff',size:13}
    for(const id of [`camera-token-${i}`,`patch-token-${i}-0`,`patch-token-${i}-1`,`patch-token-${i}-2`,`updated-row-${i}`]){const node=figure.nodes.find(n=>n.id===id)!;node.visual={...node.visual,fill:colors[i],stroke:colors[i]};node.textStyle={...node.textStyle,color:'#ffffff'}}
    const view=figure.nodes.find(n=>n.id===`view-${i}`)!;view.visual={...view.visual,fill:'#ffffff',stroke:colors[i],radius:2};view.textStyle!.color=colors[i]
  }
  const queryNode=figure.nodes.find(n=>n.id==='query-points')!;queryNode.visual={fill:'none',stroke:'none',padding:0};queryNode.textStyle={...queryNode.textStyle,color:'#ba6a4f',size:13}
  return result
}
