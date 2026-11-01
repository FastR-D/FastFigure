import {z} from 'zod'
import type {FigureNode,ComponentSource} from '../core/model.ts'
import {createStructureBuilder} from './structureBuilder.ts'

export const stagedStructureIds=['distillation-stages','masked-autoencoding'] as const
export const stagedStructureSchemas=[
  z.object({id:z.literal('distillation-stages'),hardTargets:z.enum(['show','hide'])}).strict(),
  z.object({id:z.literal('masked-autoencoding'),grid:z.coerce.number().int().min(2).max(4),visible:z.enum(['few','half'])}).strict(),
] as const
const schema=z.discriminatedUnion('id',stagedStructureSchemas)
type Parameters=z.infer<typeof schema>
export const isStagedStructure=(p:{id:string}):p is Parameters=>(stagedStructureIds as readonly string[]).includes(p.id)
export const stagedStructureSemantics={
  'distillation-stages':{relation:'Teacher is already trained and fixed during distillation. Teacher and student softmax use the same symbolic temperature T; soft-target CE trains only the student. Optional hard-label CE uses student logits at T=1. The combined objective has symbolic lambda and T², never measured weights. Inference uses only the trained student at T=1; no teacher, loss or labels in that phase. Dashed parameter-transfer copies trained student theta, not teacher parameters; the separate dashed training-update path never updates the teacher.',labels:'distill-train, distill-infer; teacher, train-student, teacher-softmax, student-softmax, soft-loss, total-loss; hard-loss and hard-labels only when shown. deploy-input, deploy-student, deploy-prediction. student-checkpoint is the parameter-transfer path. Teacher pretraining and numeric probabilities are omitted.'},
  'masked-autoencoding':{relation:'MAE-style pretraining: select visible patch IDs → encoder → restore full order with mask tokens and positions → decoder → reconstruction placeholders. MSE compares only masked positions with full original targets. Encoder checkpoint initializes downstream use of all patches; decoder is absent downstream, and the task head is unspecified. Grid and deterministic visible pattern illustrate membership only, not actual resolution, sampling, mask ratio, dimensions or reconstructed pixels. One learned mask token is repeated conceptually; patch projection and encoder positions are abstracted within E, decoder positions within restore; CLS, positional values and optimization details are not expanded.',labels:'mae-pretrain, mae-downstream; input-patch-i and output-patch-i share row-major IDs; visible-tile-i references shown input IDs. visible-select, mae-encoder, restore-tokens, mask-token, mae-decoder, masked-loss; downstream-input, downstream-encoder, downstream-head. encoder-checkpoint transfers theta only, never decoder phi.'},
} as const
export const stagedStructureSources:Record<typeof stagedStructureIds[number],ComponentSource[]>={
  'distillation-stages':[{title:'Distilling the Knowledge in a Neural Network · §2',reference:'https://arxiv.org/abs/1503.02531 · 依据同温度软目标、可选 T=1 硬目标、T² 平衡和部署学生独立构造分阶段图。λ、温度和概率均未赋观测值。教师已训练且固定；部署迁移的是学生参数，不复制教师权重。'}],
  'masked-autoencoding':[{title:'Masked Autoencoders Are Scalable Vision Learners · Fig. 1 / §3',reference:'https://arxiv.org/abs/2111.06377 · 依据可见块编码、编码后加入 mask token／恢复顺序、仅掩码位置重建损失与编码器迁移独立构造。网格、块 ID 和固定图示模式不代表实际图像、采样比例或重建结果；下游不带预训练解码器。'}],
}

export function stagedStructureFigure(raw:Parameters){
  const p=schema.parse(raw),{root,text,shape,path,bind,group,finish}=createStructureBuilder()
  function connect(id:string,a:FigureNode,b:FigureNode,color=0){const pts=[{x:a.x+a.width,y:a.y+a.height/2},{x:b.x,y:b.y+b.height/2}];bind(path(id,pts,'filled',false,color,a.parentId===b.parentId?a.parentId:'stage'),a,b,pts)}
  function vertical(id:string,a:FigureNode,b:FigureNode,color=0){const pts=[{x:a.x+a.width/2,y:a.y+a.height},{x:b.x+b.width/2,y:b.y}];bind(path(id,pts,'filled',false,color,a.parentId===b.parentId?a.parentId:'stage'),a,b,pts)}
  root.width=980;root.height=600
  if(p.id==='distillation-stages'){
    const train='distill-train',infer='distill-infer';group(train,'Distillation training',20,60,624,452,1);group(infer,'Student inference',666,60,294,452,2)
    text('train-heading','Distillation training',40,78,300,26,18,train,true);text('infer-heading','Student inference',684,78,258,26,18,infer,true)
    const input=shape('distill-input','Transfer\ninputs x',40,224,92,56,0,train),teacher=shape('teacher','Teacher',164,142,144,52,4,train),student=shape('train-student','Student θ',164,316,144,52,0,train),teacherSoft=shape('teacher-softmax','Softmax T',356,142,112,52,4,train),studentSoft=shape('student-softmax','Softmax T',356,316,112,52,0,train),soft=shape('soft-loss','Soft CE',504,228,112,48,1,train),total=shape('total-loss',p.hardTargets==='show'?'Total loss':'Soft CE',504,322,112,48,1,train)
    text('teacher-status','Frozen teacher',164,112,144,22,12,train);text('student-status','Train student θ',164,286,144,22,12,train)
    const a=[{x:86,y:224},{x:86,y:168},{x:164,y:168}],b=[{x:86,y:280},{x:86,y:342},{x:164,y:342}];bind(path('teacher-input',a,'filled',false,0,train),input,teacher,a);bind(path('student-input',b,'filled',false,0,train),input,student,b)
    connect('teacher-probabilities',teacher,teacherSoft,4);connect('student-probabilities',student,studentSoft)
    const ta=[{x:468,y:168},{x:486,y:168},{x:486,y:240},{x:504,y:240}],sa=[{x:468,y:342},{x:486,y:342},{x:486,y:264},{x:504,y:264}];bind(path('teacher-target',ta,'filled',false,4,train),teacherSoft,soft,ta);bind(path('student-target',sa,'filled',false,0,train),studentSoft,soft,sa);vertical('soft-objective',soft,total,1)
    if(p.hardTargets==='show'){
      const hard=shape('hard-loss','Hard CE\n(T=1)',504,414,112,48,1,train),labels=shape('hard-labels','Labels y',356,470,112,28,4,train),logits=[{x:308,y:342},{x:328,y:342},{x:328,y:438},{x:504,y:438}],truth=[{x:468,y:484},{x:560,y:484},{x:560,y:462}],up=[{x:560,y:414},{x:560,y:370}]
      bind(path('student-hard-logits',logits,'filled',false,0,train),student,hard,logits);bind(path('hard-target',truth,'filled',false,4,train),labels,hard,truth);bind(path('hard-objective',up,'filled',false,1,train),hard,total,up)
    }
    const grad=[{x:504,y:346},{x:490,y:346},{x:490,y:390},{x:236,y:390},{x:236,y:368}],gradient=path('student-update',grad,'filled',false,1,train);gradient.visual!.dash=[3,3];bind(gradient,total,student,grad);text('update-label','Optimize θ',346,370,100,18,11,train)
    const fresh=shape('deploy-input','New inputs',734,142,160,44,0,infer),deployed=shape('deploy-student','Student θ',734,248,160,52,0,infer),output=shape('deploy-prediction','Prediction · T=1',734,414,160,48,2,infer);vertical('infer-input',fresh,deployed);vertical('infer-output',deployed,output,2)
    const checkpoint=[{x:236,y:316},{x:236,y:310},{x:640,y:310},{x:640,y:274},{x:734,y:274}],transfer=path('student-checkpoint',checkpoint,'filled',false,5);transfer.visual!.dash=[6,4];bind(transfer,student,deployed,checkpoint);text('checkpoint-label','Transfer trained θ',344,282,142,22,12)
    text('distill-objective',p.hardTargets==='show'?'L = λ T² L_soft + (1−λ) L_hard':'L = L_soft · soft-target-only variant',40,530,900,30,17)
    return finish('Teacher–student training and inference','Symbolic T and λ; no probabilities or performance values. Teacher pretraining is not shown.')
  }
  const train='mae-pretrain',down='mae-downstream';group(train,'Masked pretraining',20,60,940,330,1);group(down,'Downstream encoder use',20,420,940,130,2)
  text('pretrain-heading','Masked pretraining · train θ and φ',40,76,420,28,18,train,true);text('downstream-heading','Downstream encoder use',40,432,280,26,17,down,true)
  const total=p.grid*p.grid,visibleCount=Math.max(1,Math.ceil(total/(p.visible==='few'?4:2))),visibleIds=new Set(Array.from({length:visibleCount},(_,i)=>i*5%total)),cell=104/p.grid
  text('input-patch-heading','Full patch set',40,106,112,20,12,train);text('output-patch-heading','Decoder output',826,100,112,20,12,train)
  for(let i=0;i<total;i++){
    const x=i%p.grid*cell,y=Math.floor(i/p.grid)*cell,input=shape(`input-patch-${i}`,`p${i+1}`,42+x,124+y,cell,cell,visibleIds.has(i)?0:4,train),output=shape(`output-patch-${i}`,`r${i+1}`,830+x,124+y,cell,cell,visibleIds.has(i)?4:1,train)
    input.textStyle!.size=output.textStyle!.size=11;input.visual!.radius=output.visual!.radius=0;input.visual!.padding=output.visual!.padding=1
    if(!visibleIds.has(i))input.visual!.dash=[3,2]
    if(visibleIds.has(i))output.visual={...output.visual,fill:'#f6f7fa',stroke:'#d4dae3'}
  }
  const inputFrame=shape('mae-input-frame','',42,124,104,104,0,train),outputFrame=shape('mae-output-frame','',830,124,104,104,1,train);for(const frame of [inputFrame,outputFrame])frame.visual={fill:'none',stroke:'#718096',strokeWidth:1}
  const select=shape('visible-select',`Keep ${visibleCount} visible`,190,144,104,48,0,train),encoder=shape('mae-encoder','Encoder Eθ',340,136,120,64,0,train),restore=shape('restore-tokens','Restore + pos',510,144,110,48,1,train),decoder=shape('mae-decoder','Decoder Dφ',670,144,104,48,1,train),mask=shape('mask-token','[MASK]',510,258,110,44,4,train),loss=shape('masked-loss','Masked MSE',670,296,120,44,1,train)
  connect('select-patches',inputFrame,select);connect('visible-to-encoder',select,encoder);connect('encode-visible',encoder,restore);connect('decode-full-sequence',restore,decoder,1);connect('reconstruct-patches',decoder,outputFrame,1)
  const maskInput=[{x:565,y:258},{x:565,y:192}];bind(path('mask-after-encoder',maskInput,'filled',false,4,train),mask,restore,maskInput)
  for(const [j,i]of [...visibleIds].entries()){const tile=shape(`visible-tile-${j}`,`p${i+1}`,190+(j%4)*26,218+Math.floor(j/4)*26,24,24,0,train);tile.textStyle!.size=10;tile.visual!.padding=1}
  const reconstructed=[{x:882,y:228},{x:882,y:318},{x:790,y:318}],targets=[{x:94,y:228},{x:94,y:338},{x:642,y:338},{x:642,y:318},{x:670,y:318}];bind(path('reconstruction-loss',reconstructed,'filled',false,1,train),outputFrame,loss,reconstructed);bind(path('original-targets',targets,'filled',false,4,train),inputFrame,loss,targets)
  text('target-label','Original targets · masked positions only',140,278,240,24,11,train);text('masked-loss-note','MSE only on masked positions',636,354,304,24,13,train)
  const full=shape('downstream-input','All patches',60,482,150,44,0,down),transferred=shape('downstream-encoder','Encoder Eθ',340,482,120,44,0,down),head=shape('downstream-head','Task head / features',630,482,180,44,2,down);connect('downstream-input-link',full,transferred);connect('downstream-output-link',transferred,head,2)
  const checkpoint=[{x:400,y:200},{x:400,y:482}],transfer=path('encoder-checkpoint',checkpoint,'filled',false,5);transfer.visual!.dash=[6,4];bind(transfer,encoder,transferred,checkpoint);text('encoder-transfer-label','Transfer θ only',414,396,180,20,12)
  return finish('Masked pretraining and encoder transfer','Grid, patch IDs and mask pattern are illustrative; no pixels, reconstruction values or target accuracy.')
}
