import {applyScientificPresentation} from './scientificPresentation.ts'
import {z} from 'zod'
import type {ComponentSource,FigureNode} from '../core/model.ts'
import {pathPoints,setPathPoints} from '../core/paths.ts'
import {createStructureBuilder} from './structureBuilder.ts'

const count=(min:number,max:number)=>z.coerce.number().int().min(min).max(max)
export const generativeStructureIds=['mixed-modal-mask','conditioned-denoising'] as const
export const generativeStructureSchemas=[
  z.object({id:z.literal('mixed-modal-mask'),format:z.enum(['text-image','image-text','interleaved','text-only']),textTokens:count(1,3),imageTokens:count(2,3)}).strict(),
  z.object({id:z.literal('conditioned-denoising'),steps:count(2,4)}).strict(),
] as const
const schema=z.discriminatedUnion('id',generativeStructureSchemas)
type Parameters=z.infer<typeof schema>
type MaskParameters=Extract<Parameters,{id:'mixed-modal-mask'}>
export const isGenerativeStructure=(p:{id:string}):p is Parameters=>(generativeStructureIds as readonly string[]).includes(p.id)
export interface ModalPosition{id:string;label:string;block:string;modality:'text'|'image'}
/** Position identities, not vocabulary IDs or observed continuous/discrete image values. */
export function mixedModalPositions(p:Pick<MaskParameters,'format'|'textTokens'|'imageTokens'>):ModalPosition[]{
  const blocks=p.format==='text-only'?['text1']:p.format==='image-text'?['image1','text1']:p.format==='interleaved'?['text1','image1','text2','image2']:['text1','image1']
  return blocks.flatMap(block=>{const modality=block.startsWith('text')?'text':'image',length=modality==='text'?p.textTokens:p.imageTokens;return Array.from({length},(_,i)=>({id:`${block}-${i}`,label:`${modality==='text'?(block==='text1'?'t':'s'):(block==='image1'?'a':'b')}${i+1}`,block,modality}))})
}
export const modalAttentionAllowed=(positions:ModalPosition[],query:number,key:number)=>key<=query||positions[query]!.modality==='image'&&positions[query]!.block===positions[key]!.block

export const generativeStructureSemantics={
  'mixed-modal-mask':{relation:'Boolean permission matrix for a mixed-position sequence: rows are queries, columns are keys. Each row can read itself and earlier positions; image positions can additionally read later positions in the SAME image block. Text never reads a future image; different image blocks do not gain bidirectional access to one another. The upper-triangular image allowance is distinct from causal allowance; neither color is an attention score. Positions represent groups schematically, not actual token counts, IDs, embeddings or image values. This shared attention abstraction does not equate Transfusion continuous image vectors with Show-o discrete image tokens. Task and boundary marker tokens, training losses and decoding are omitted.',labels:'modal-sequence, mask-rules, mask-matrix; sequence-<position-id>; query-<position-id>, key-<position-id>; permission-<query-id>-<key-id>. Position IDs include stable text1/image1/text2/image2 blocks. Matrix is categorical permission, not a data heatmap or a computed softmax.'},
  'conditioned-denoising':{relation:'Inference-only, continuous latent diffusion abstraction grounded in Transfusion: x(T) is initial Gaussian noise; each displayed interval uses the same noise-prediction parameter theta with current latent x(tk), symbolic timestep tk and fixed context c. A separate sampler combines current latent and estimated noise to produce the next latent. Noise prediction alone is not the next state. The final x(0) feeds VAE decoding. Displayed intervals abstract a potentially longer schedule, not actual solver steps or measured noise levels. No training noising, CFG, numerical schedule, solver equation, extra stochastic inputs or generated pixels are depicted; sampler internals remain unspecified. It is not Show-o discrete mask-token prediction.',labels:'denoise-process, denoise-context, denoise-output; latent-k for k=0..steps, sampler-k and noise-model-k for k<steps, current-to-sampler-k, current-to-noise-k, noise-to-sampler-k, next-latent-k; condition-c and condition-input-k supply fixed context, not weights or checkpoint transfer. vae-decoder, decoded-image-type. All x/epsilon values are symbols.'},
} as const
export const generativeStructureSources:Record<typeof generativeStructureIds[number],ComponentSource[]>={
  'mixed-modal-mask':[
    {title:'Transfusion · ICLR 2025 · Fig. 1 / Fig. 4 / §3',reference:'https://proceedings.iclr.cc/paper_files/paper/2025/hash/12678c3948153f4bc391f51e2082bd6e-Abstract-Conference.html · 独立抽象因果文本及同一图像块内双向读取；连续图像向量与文本位置保持区别。不包含标记 token、真实维度、数值注意力或训练目标。'},
    {title:'Show-o · ICLR 2025 · Fig. 2 / Fig. 4–5 / §3.2',reference:'https://proceedings.iclr.cc/paper_files/paper/2025/hash/45f0d179ef7e10eb7366550cd4e574ae-Abstract-Conference.html · 核对文本／图像、图像／文本、交错与纯文本的混合权限。这里只共享注意力许可抽象，不将离散图像 token 与 Transfusion 连续表示等同。'},
  ],
  'conditioned-denoising':[{title:'Transfusion · ICLR 2025 · §2.2 / Fig. 3 / §3',reference:'https://proceedings.iclr.cc/paper_files/paper/2025/hash/12678c3948153f4bc391f51e2082bd6e-Abstract-Conference.html · 依据连续潜变量噪声预测、采样器更新、固定上下文与末端 VAE 解码独立展开推理关系。符号区间不是实际推理步数，不计算噪声、采样方程、CFG 或图像；非 Show-o 离散掩码替换。'}],
}

export function generativeStructureFigure(raw:Parameters){
  const p=schema.parse(raw),{figure,root,text,shape,path,bind,group,finish}=createStructureBuilder()
  root.width=980;root.height=600
  function link(id:string,a:FigureNode,b:FigureNode,points:{x:number;y:number}[],color=0,parent='stage'){const line=path(id,points,'filled',false,color,parent);bind(line,a,b,points);setPathPoints(line,pathPoints(figure,line));return line}
  if(p.id==='mixed-modal-mask'){
    const positions=mixedModalPositions(p),n=positions.length,cell=Math.min(42,300/n),size=n*cell,gx=690-size/2,gy=234
    group('modal-sequence','Mixed sequence order',20,64,940,108);group('mask-rules','Permission rules',20,190,380,354);group('mask-matrix','Query/key permission',420,190,540,354)
    text('sequence-heading','Position order · modality boundaries are schematic',40,74,900,22,15,'modal-sequence',true)
    const tokenWidth=Math.min(66,850/n),sx=490-n*tokenWidth/2
    for(const [i,token]of positions.entries()){
      const tile=shape(`sequence-${token.id}`,token.label,sx+i*tokenWidth,104,tokenWidth-6,36,token.modality==='text'?0:1,'modal-sequence');tile.textStyle!.size=13;tile.visual!.padding=1
      if(i===0||positions[i-1]!.block!==token.block)text(`sequence-block-${token.block}`,token.modality==='text'?'Text':`Image ${token.block.at(-1)}`,sx+i*tokenWidth,144,positions.filter(t=>t.block===token.block).length*tokenWidth-6,20,12,'modal-sequence')
      text(`query-${token.id}`,token.label,gx-48,gy+i*cell,44,cell,12,'mask-matrix')
      text(`key-${token.id}`,token.label,gx+i*cell,gy-24,cell,22,11,'mask-matrix')
      for(const [j,key]of positions.entries()){
        const allowed=modalAttentionAllowed(positions,i,j),extra=allowed&&j>i,tile=shape(`permission-${token.id}-${key.id}`,'',gx+j*cell,gy+i*cell,cell,cell,extra?2:0,'mask-matrix')
        tile.visual={...tile.visual,radius:0,stroke:'#bcc7d3',strokeWidth:.7,...(!allowed?{fill:'#ffffff'}:{})}
      }
    }
    text('rule-heading','Read permissions, not attention scores',38,204,344,50,17,'mask-rules',true)
    for(const [i,label]of ['Text rows: self + earlier positions','Image rows: also all of the same image','Other later blocks remain blocked'].entries())text(`rule-${i}`,label,42,266+i*48,332,36,14,'mask-rules')
    const legends=[['Causal allowance',0],['Extra within-image allowance',2],['Blocked',-1]] as const
    for(const [i,[label,color]]of legends.entries()){
      const y=420+i*36,tile=shape(`permission-key-${i}`,'',42,y,22,22,Math.max(0,color),'mask-rules');tile.visual!.radius=0;if(color<0)tile.visual!.fill='#ffffff'
      text(`permission-key-label-${i}`,label,78,y-2,300,26,12,'mask-rules')
    }
    text('matrix-axis-note','Rows = queries · columns = keys',454,192,472,18,12,'mask-matrix')
    return applyScientificPresentation(finish('Mixed-modality attention','Schematic position aliases · cells denote permission'),{'permission':figure.nodes.filter(n=>n.id.startsWith('permission-')&&!n.id.startsWith('permission-key-')&&n.visual?.fill!=='#ffffff'&&n.visual?.colorIndex===0).map(n=>n.id).concat('permission-key-0'),'permission-extra':figure.nodes.filter(n=>n.id.startsWith('permission-')&&!n.id.startsWith('permission-key-')&&n.visual?.fill!=='#ffffff'&&n.visual?.colorIndex===2).map(n=>n.id).concat('permission-key-1'),blocked:figure.nodes.filter(n=>n.id.startsWith('permission-')&&n.visual?.fill==='#ffffff').map(n=>n.id)})
  }
  group('denoise-process','Continuous latent trajectory',20,180,792,250,0);group('denoise-context','Fixed conditioning',20,450,792,92,4);group('denoise-output','Decode final latent',830,180,130,362,2)
  text('inference-heading','Continuous image latents',34,74,912,28,15,'stage',true)
  text('time-direction','T = t₀ > t₁ > … > tₛ = 0 · displayed intervals are schematic',34,112,912,28,13)
  text('process-heading','(c) Reverse process · S: sampler',38,194,756,28,16,'denoise-process',true)
  const states:FigureNode[]=[],stride=700/p.steps
  for(let k=0;k<=p.steps;k++){
    const label=k===0?'x(T)':k===p.steps?'x(0)':`x(t${k})`,state=shape(`latent-${k}`,label,36+k*stride,238,64,52,k===0?4:k===p.steps?2:0,'denoise-process');states.push(state)
  }
  const context=shape('condition-c','Condition c',36,468,760,42,4,'denoise-context')
  text('context-heading','Shared across the displayed steps',36,524,760,16,11,'denoise-context')
  for(let k=0;k<p.steps;k++){
    const state=states[k]!,next=states[k+1]!,cx=(state.x+state.width+next.x)/2,sampler=shape(`sampler-${k}`,'S',cx-18,246,36,36,1,'denoise-process'),model=shape(`noise-model-${k}`,`εθ(x, t${k}, c)\nnoise estimate`,cx-60,354,120,48,3,'denoise-process')
    sampler.textStyle!.size=model.textStyle!.size=12
    link(`current-to-sampler-${k}`,state,sampler,[{x:state.x+64,y:264},{x:sampler.x,y:264}],0,'denoise-process')
    link(`next-latent-${k}`,sampler,next,[{x:sampler.x+sampler.width,y:264},{x:next.x,y:264}],0,'denoise-process')
    link(`current-to-noise-${k}`,state,model,[{x:state.x+32,y:290},{x:state.x+32,y:378},{x:model.x,y:378}],0,'denoise-process')
    link(`noise-to-sampler-${k}`,model,sampler,[{x:cx,y:354},{x:cx,y:282}],3,'denoise-process')
    link(`condition-input-${k}`,context,model,[{x:cx,y:468},{x:cx,y:402}],4)
  }
  path('conditioning-rail',[{x:(36+64+36+stride)/2,y:468},{x:(36+(p.steps-1)*stride+64+736)/2,y:468}],'none',false,4,'denoise-context')
  const decoder=shape('vae-decoder','VAE\ndecode',840,238,110,54,2,'denoise-output'),output=shape('decoded-image-type','Decoded\nimage',840,354,110,50,2,'denoise-output')
  text('decode-heading','Final only',840,194,110,28,14,'denoise-output',true)
  link('decode-final',states.at(-1)!,decoder,[{x:800,y:264},{x:840,y:265}],2)
  link('decoded-type',decoder,output,[{x:895,y:292},{x:895,y:354}],2,'denoise-output')
  return applyScientificPresentation(finish('Conditional latent diffusion','Inference schematic · symbolic time intervals'),{representation:states.map(n=>n.id),model:Array.from({length:p.steps},(_,k)=>`noise-model-${k}`),operation:Array.from({length:p.steps},(_,k)=>`sampler-${k}`),decoder:['vae-decoder'],condition:['condition-c'],result:['decoded-image-type']})
}
