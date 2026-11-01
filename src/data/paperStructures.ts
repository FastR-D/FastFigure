import {applyScientificPresentation} from './scientificPresentation.ts'
import {generativeStructureIds,generativeStructureSchemas,generativeStructureSemantics,generativeStructureSources,isGenerativeStructure,generativeStructureFigure} from './generativeStructures.ts'
import {recentStructureIds,recentStructureSchemas,recentStructureSemantics,recentStructureSources,isRecentStructure,recentStructureFigure} from './recentStructures.ts'
import {stagedStructureIds,stagedStructureSchemas,stagedStructureSemantics,stagedStructureSources,isStagedStructure,stagedStructureFigure} from './stagedStructures.ts'
import {routedStructureIds,routedStructureSchemas,routedStructureSemantics,routedStructureSources,isRoutedStructure,routedStructureFigure} from './routedStructures.ts'
import {skipStructureIds,skipStructureSchemas,skipStructureSemantics,skipStructureSources,isSkipStructure,skipStructureFigure} from './skipStructures.ts'
import {z} from 'zod'
import type {FigureNode,ComponentSource} from '../core/model.ts'
import {createStructureBuilder} from './structureBuilder.ts'

const count=(min:number,max:number)=>z.coerce.number().int().min(min).max(max)
export const paperStructureIds=['feature-pyramid','dual-encoder-alignment',...skipStructureIds,...routedStructureIds,...stagedStructureIds,...recentStructureIds,...generativeStructureIds] as const
export const paperStructureSchemas=[
  ...skipStructureSchemas,
  ...routedStructureSchemas,
  ...stagedStructureSchemas,
  ...recentStructureSchemas,
  ...generativeStructureSchemas,
  z.object({id:z.literal('feature-pyramid'),levels:count(3,5)}).strict(),
  z.object({id:z.literal('dual-encoder-alignment'),pairs:count(3,5),objective:z.enum(['symmetric','alignment-only'])}).strict(),
] as const
const schema=z.discriminatedUnion('id',paperStructureSchemas)
type Parameters=z.infer<typeof schema>
export const isPaperStructure=(p:{id:string}):p is Parameters=>(paperStructureIds as readonly string[]).includes(p.id)
export const paperStructureSemantics={
  ...skipStructureSemantics,
  ...routedStructureSemantics,
  ...stagedStructureSemantics,
  ...recentStructureSemantics,
  ...generativeStructureSemantics,
  'feature-pyramid':{relation:'Bottom-up C levels, 1×1 lateral projections, top-down 2× upsampling and elementwise addition below the coarsest level; 3×3 convolutions create P outputs. No fabricated feature sizes or prediction heads. Level count is an explicit schematic variant.',labels:'backbone-i, lateral-i, merge-i, smooth-i, output-i; i=0 is the finest illustrated scale, topmost is coarsest. Distinct bottom-up, lateral, top-down and output bound paths.'},
  'dual-encoder-alignment':{relation:'Two independent encoders produce paired A/B embeddings and feed an N×N schematic pairing matrix. Only diagonal pair identities are highlighted, never observed similarities. Symmetric objective means row and column contrastive classification; alignment-only explicitly omits the objective, not a zero-shot classifier.',labels:'input-a/b, encoder-a/b, embedding-a/b, pair-i-j, pair-row-i, pair-column-j, objective when symmetric. Pair count is illustrative, not actual batch size.'},
} as const
export const paperStructureSources:Record<typeof paperStructureIds[number],ComponentSource[]>={
  ...skipStructureSources,
  ...routedStructureSources,
  ...stagedStructureSources,
  ...recentStructureSources,
  ...generativeStructureSources,
  'feature-pyramid':[{title:'Feature Pyramid Networks for Object Detection · Fig. 2 / Fig. 3 / §3',reference:'https://arxiv.org/abs/1612.03144 · 独立重绘多尺度 bottom-up / top-down / lateral 关系；保留 1×1、2× up、相加及输出 3×3 的区别。不复刻原图，不含检测头；层数可变为示意变体。'}],
  'dual-encoder-alignment':[{title:'Learning Transferable Visual Models From Natural Language Supervision · Fig. 1 / Fig. 3 / §2.2',reference:'https://proceedings.mlr.press/v139/radford21a.html · 独立抽象双编码器、配对矩阵与双向对比目标。不包含 Fig. 1 后续零样本分类阶段；高亮对角仅标注配对身份，无观测相似度或损失数值。'}],
}

/** Independent editable abstractions of primary-paper relationships, not traced figure artwork. */
export function paperStructureFigure(input:Parameters){
  const p=schema.parse(input)
  if(isGenerativeStructure(p))return generativeStructureFigure(p)
  if(isRecentStructure(p))return recentStructureFigure(p)
  if(isStagedStructure(p))return stagedStructureFigure(p)
  if(isRoutedStructure(p))return routedStructureFigure(p)
  if(isSkipStructure(p))return skipStructureFigure(p)
  const {root,text,shape,path,bind,finish}=createStructureBuilder()
  function connect(id:string,a:FigureNode,b:FigureNode,vertical=false,color=0){
    const points=vertical?[{x:a.x+a.width/2,y:a.y+a.height},{x:b.x+b.width/2,y:b.y}]:[{x:a.x+a.width,y:a.y+a.height/2},{x:b.x,y:b.y+b.height/2}]
    const line=path(id,points,'filled',false,color);bind(line,a,b,points);return line
  }
  if(p.id==='feature-pyramid'){
    root.width=820;root.height=150+p.levels*88
    for(const [id,label,x,w]of [['bottom-up','Bottom-up',28,130],['lateral','Lateral 1×1',180,132],['top-down','Top-down',358,138],['outputs','Pyramid outputs',590,200]] as const)text(id,label,x,60,w,26,15,'stage',true)
    const cs:FigureNode[]=[],ms:FigureNode[]=[]
    for(let i=0;i<p.levels;i++){
      const y=104+(p.levels-1-i)*88,level=i+2
      const c=shape(`backbone-${i}`,`C${level}`,40,y,100,44,0),lateral=shape(`lateral-${i}`,'1×1',210,y,80,44,1),merge=shape(`merge-${i}`,i===p.levels-1?'M':'+',410,y+4,36,36,2,'stage',i!==p.levels-1),smooth=shape(`smooth-${i}`,'3×3',530,y,80,44,2),out=shape(`output-${i}`,`P${level}`,690,y,92,44,2)
      connect(`lateral-in-${i}`,c,lateral,false,1);connect(`lateral-out-${i}`,lateral,merge,false,1);connect(`smooth-in-${i}`,merge,smooth,false,2);connect(`output-link-${i}`,smooth,out,false,2);cs.push(c);ms.push(merge)
    }
    for(let i=0;i<p.levels-1;i++){
      const lower=cs[i]!,upper=cs[i+1]!,points=[{x:lower.x+50,y:lower.y},{x:upper.x+50,y:upper.y+44}],up=path(`bottom-up-${i}`,points,'filled');bind(up,lower,upper,points)
      connect(`top-down-${i}`,ms[i+1]!,ms[i]!,true,2)
      const upperMerge=ms[i+1]!,lowerMerge=ms[i]!
      const label=text(`upsample-${i}`,'2× up',upperMerge.x+upperMerge.width/2+12,(upperMerge.y+upperMerge.height+lowerMerge.y)/2-10,68,20,12)
      label.textStyle!.align='left'
    }
    return applyScientificPresentation(finish('Additive multi-scale feature pyramid','Schematic feature levels · lateral and top-down fusion'),{representation:cs.map(n=>n.id).concat(Array.from({length:p.levels},(_,i)=>`output-${i}`)),model:Array.from({length:p.levels},(_,i)=>`smooth-${i}`),'secondary-model':Array.from({length:p.levels},(_,i)=>`lateral-${i}`).concat(`merge-${p.levels-1}`),operation:ms.slice(0,-1).map(n=>n.id)})
  }
  root.width=950;root.height=560
  const n=p.pairs,cell=40,mx=616,my=150,size=n*cell
  const inputs=['a','b'].map((side,i)=>{
    const y=150+i*244,a=shape(`input-${side}`,side==='a'?'Images A':'Texts B',24,y,112,52,i),encoder=shape(`encoder-${side}`,`Encoder ${side.toUpperCase()}`,180,y,148,52,i),embedding=shape(`embedding-${side}`,`${side.toUpperCase()}ᵢ`,386,y,68,52,i)
    connect(`encode-${side}`,a,encoder,false,i);connect(`embed-${side}`,encoder,embedding,false,i);return embedding
  })
  text('alignment-heading','Paired embedding alignment',554,64,340,28,18,'stage',true)
  text('column-heading','Bⱼ',mx,104,size,24,14)
  for(let i=0;i<n;i++){
    text(`pair-row-${i}`,`A${i+1}`,558,my+i*cell,48,cell,12)
    text(`pair-column-${i}`,`${i+1}`,mx+i*cell,126,cell,22,12)
    for(let j=0;j<n;j++){
      const tile=shape(`pair-${i}-${j}`,'',mx+j*cell,my+i*cell,cell,cell,i===j?0:4)
      tile.visual={...tile.visual,radius:0,...(i===j?{fill:'#e0f2ea'}:{fill:'#f6f7fa',stroke:'#d4dae3'})}
    }
  }
  // Invisible bounded relation target encompasses cells; visible cell objects stay independent.
  const matrix=shape('pairing-frame','',mx,my,size,size,2);matrix.visual={fill:'none',stroke:'#718096',strokeWidth:1,handDrawn:false}
  const a=inputs[0]!,b=inputs[1]!,ap=[{x:a.x+a.width,y:a.y+26},{x:518,y:a.y+26},{x:518,y:my+size/2},{x:mx,y:my+size/2}],bp=[{x:b.x+b.width,y:b.y+26},{x:mx+size/2,y:b.y+26},{x:mx+size/2,y:my+size}]
  bind(path('align-a',ap,'filled',false,0),a,matrix,ap);bind(path('align-b',bp,'filled',false,1),b,matrix,bp)
  text('pairing-key','Diagonal = matched pairs; cells are not scores.',540,460,388,24,12)
  if(p.objective==='symmetric'){
    const objective=shape('objective','Row + column contrastive objective',554,496,370,28,2)
    const points=[{x:matrix.x+matrix.width,y:matrix.y+matrix.height/2},{x:932,y:matrix.y+matrix.height/2},{x:932,y:510},{x:objective.x+objective.width,y:510}]
    bind(path('objective-link',points,'filled',false,2),matrix,objective,points)
  }
  return finish('Dual-encoder alignment','Illustrative pairs; no similarity values, training data or zero-shot classifier.')
}
