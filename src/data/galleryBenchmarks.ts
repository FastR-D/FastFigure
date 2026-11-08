import {instantiateComponentAt,scaleComponent} from '../core/assets.ts'
import {galleryBuilder,type GallerySourceId} from './galleryStudy.ts'
import {galleryPrimitive,type GalleryPrimitiveId} from './galleryPrimitives.ts'

export const galleryBenchmarkSpecs=[
  {id:'retrieval-rewrite',name:'检索改写 · 对照与主路径',topic:'系统与智能体',tags:['检索','改写','RAG','Retrieval'],parts:['relation-key'],sources:['aaai2026-37741'],fits:'上方紧凑对照，下方展开主路径；偏好上下文通过独立虚线进入改写器。',caution:'不沿用原图的正确/错误结果；上下文输入不是已证实的性能提升。'},
  {id:'paired-representations',name:'双路表征 · 身份与交互',topic:'模型与表征',tags:['双流','配对','Alignment'],parts:['identity-matrix','modality-rows'],sources:['aaai2023-25531','ImmunoStruct_contrastive'],fits:'平行保留两路输入身份，右侧以配对矩阵解释输出关系。',caution:'两个编码器独立；矩阵表示配对身份，不声称共享参数或观测相似度。'},
  {id:'training-deployment',name:'训练部署 · 阶段与参数迁移',topic:'模型与表征',tags:['训练','部署','Transfer'],parts:['phase-transfer','trainability-key'],sources:['iclr2024-0825','icml2026-0316'],fits:'监督学习示意：训练与推理沿同一计算轴排列，显式区分标签、损失、梯度回路与参数复制。',caution:'这是监督学习的具体示例，不代表来源论文的专有算法；可改写为自己的训练与部署方法。'},
  {id:'temporal-state',name:'时序记忆 · 读取与后续写入',topic:'系统与智能体',tags:['记忆','时序','Memory'],parts:['state-slots','relation-key'],sources:['aaai2023-25392','icml2024-0608'],fits:'三个时间列对齐输入、计算、输出；状态从前一时刻读取，写入后一状态。',caution:'只有图示时间步和槽位；读旧状态与写新状态分开，不暗示同帧代数循环。'},
  {id:'tool-feedback',name:'工具反馈 · 主循环与执行记录',topic:'系统与智能体',tags:['工具','反馈','Agent','Reflection'],parts:['evidence-slot','relation-key'],sources:['iclr2025-1473','acl2024-2024.acl-long.570'],fits:'左侧执行与修订闭环，右侧保留可核对的执行记录。',caution:'循环只作可修改的中性拓扑；记录槽为空，不编造工具输出或成功率。'},
  {id:'mechanism-evidence',name:'机制证据 · 总览与验证面板',topic:'实验与证据',tags:['机制','验证','Evidence'],parts:['evidence-slot','panel-heading'],sources:['fig1-material-mechanism-rich','fig4-single-cell-systems-rich'],fits:'上方宽幅机制，下方三类证据；相同模块在机制和面板中沿用颜色身份。',caution:'所有证据面板为空；观察、定量和稳健性需分别提供真实来源。'},
  {id:'image-comparison',name:'图像对照 · 通道与局部对应',topic:'实验与证据',tags:['图像','对照','ROI','Channels'],parts:['shared-label-grid','crop-correspondence'],sources:['fig2-spatial-imaging-rich','atlas-09-image-plates'],fits:'上方共享行列标签图版，下方局部对应与定量位置。',caution:'需保持样本身份并使用真实裁切；未生成图像、通道合成或比例尺。'},
  {id:'perturbation-validation',name:'干预验证 · 流程与证据包',topic:'实验与证据',tags:['干预','消融','Validation'],parts:['evidence-slot','panel-heading'],sources:['fig3-in-vivo-efficacy-rich','fig5-validation-perturbation-rich'],fits:'顶部试验阶段链，下方主终点、干预、特异性和耐受证据。',caution:'阶段间距不表示时长；干预与对照设计由用户提供，布局本身不证明因果。'},
] as const
export type GalleryBenchmarkId=typeof galleryBenchmarkSpecs[number]['id']

export function galleryBenchmark(id:GalleryBenchmarkId){
  const spec=galleryBenchmarkSpecs.find(s=>s.id===id)
  if(!spec)throw new Error('未知标杆主题')
  const b=galleryBuilder(1000,580),{figure,text,card,wire,line,panel,bind}=b
  // Composition advice belongs in the library, outside the exported scientific figure.
  // Panel headings carry the hierarchy; a manuscript supplies its own figure caption.
  function embed(part:GalleryPrimitiveId,key:string,x:number,y:number,scale:number,parent='stage'){
    const result=instantiateComponentAt(figure,scaleComponent(galleryPrimitive(part),scale),parent,{x,y},key)
    Object.assign(figure,result.document)
    if(part==='evidence-slot')for(const name of ['panel-letter','panel-question'])figure.nodes.find(n=>n.id===result.nodeIds[name])!.label=''
    return result
  }
  if(id==='retrieval-rewrite'){
    panel('compare','a  Compact alternatives',24,96,952,124)
    for(let i=0;i<2;i++){
      const y=146,a=card(`query-${i}`,'Query',44+i*470,y,100,48,1,'compare'),z=card(`retrieve-${i}`,i?'Rewrite + retrieve':'Direct retrieval',184+i*470,y,226,48,0,'compare')
      wire(`alternative-${i}`,a,z)
    }
    panel('main','b  Context-conditioned retrieval',24,242,952,276)
    const labels=['Query','Rewrite','Retrieve','Results'],nodes=labels.map((label,i)=>card(`main-${i}`,label,48+i*234,366,190,60,i===1?0:1,'main'))
    nodes.slice(1).forEach((n,i)=>wire(`main-flow-${i}`,nodes[i]!,n))
    const context=card('context','Preference context',282,290,190,48,2,'main')
    wire('condition-rewrite',context,nodes[1]!,[],true,true)
    text('context-note','Context input',492,300,180,26,14,false,'main')
    text('result-note','Replace with your own inputs, retrieval rule and result examples.',48,464,900,28,15,false,'main')
  }else if(id==='paired-representations'){
    panel('branches','a  Keep branch identity',24,96,624,418)
    const embeddings=[]
    for(let i=0;i<2;i++){
      const y=176+i*174,a=card(`input-${i}`,`Input ${i?'B':'A'}`,44,y,136,60,i,'branches'),z=card(`encoder-${i}`,`Encoder ${i?'B':'A'}`,224,y,176,60,i,'branches'),v=card(`embedding-${i}`,`z${i?'B':'A'}`,450,y,154,60,i,'branches')
      wire(`encode-${i}`,a,z);wire(`represent-${i}`,z,v);embeddings.push(v)
    }
    panel('pairing','b  Pair correspondence',672,96,304,418)
    const result=embed('identity-matrix','pair-matrix',704,168,.8,'pairing')
    const target=figure.nodes.find(n=>n.id===result.nodeIds['pairing-frame'])!
    figure.nodes.find(n=>n.id===result.nodeIds['matrix-note'])!.label=''
    // Row identity enters from the left; column identity enters below. Keep labels clear.
    const row=[{x:604,y:206},{x:660,y:206},{x:660,y:190},{x:774,y:190},{x:774,y:214},{x:target.x,y:214}]
    const column=[{x:604,y:380},{x:660,y:380},{x:660,y:324},{x:target.x+target.width/2,y:324},{x:target.x+target.width/2,y:target.y+target.height}]
    bind(line('pairing-link-0',row,true),embeddings[0]!,target,row);bind(line('pairing-link-1',column,true),embeddings[1]!,target,column)
    text('encoder-note','Independent encoders',52,462,560,28,16,false,'branches')
    text('pairing-note','Pair identity only\nNo observed scores',696,366,256,64,16,false,'pairing')
  }else if(id==='training-deployment'){
    panel('train','a  Training',24,18,952,300)
    panel('deploy','b  Inference',24,350,952,210)
    function sample(key:string,y:number,parent:string){
      for(let i=2;i>=0;i--){
        const n=card(`${key}-sheet-${i}`,'',62+i*7,y-i*6,82,70,0,parent)
        n.visual={fill:'#ffffff',stroke:'#526463',strokeWidth:1.3,radius:1,handDrawn:false}
      }
      for(let i=0;i<3;i++)line(`${key}-row-${i}`,[{x:76,y:y+18+i*15},{x:128,y:y+18+i*15}])
      return figure.nodes.find(n=>n.id===`${key}-sheet-0`)!
    }
    function vector(key:string,y:number,parent:string){
      const frame=card(key,'',530,y,100,44,2,parent);frame.visual!.radius=1
      for(let i=1;i<4;i++)line(`${key}-cell-${i}`,[{x:530+i*25,y},{x:530+i*25,y:y+44}])
      return frame
    }
    function modelNode(key:string,label:string,y:number,parent:string){
      const n=card(key,'',292,y,150,80,1,parent)
      const symbol=text(`${key}-symbol`,label,304,y+12,126,54,32,false,parent)
      symbol.textRuns=[{text:'f',italic:true},{text:label.slice(1),script:'sub',italic:true}]
      n.visual={...n.visual,radius:3,stroke:'#4f745b',strokeWidth:1.5};n.textStyle!.size=32
      return n
    }
    const input=sample('train-input',135,'train'),model=modelNode('training-model','fθ',130,'train'),pred=vector('train-prediction',148,'train')
    text('training-status','Trainable',292,92,150,28,16,false,'train')
    text('train-input-label','Samples x',40,218,140,30,18,false,'train')
    text('prediction-label','Prediction ŷ',500,218,160,30,18,false,'train')
    const target=card('train-target','Labels y',748,68,130,38,0,'train');target.visual={...target.visual,fill:'none',stroke:'none'};target.textStyle!.size=18
    const loss=card('objective','ℓ',780,138,66,66,0,'train');loss.kind='ellipse';loss.visual={fill:'#fcf0e8',stroke:'#aa714d',strokeWidth:1.5,handDrawn:false};loss.textStyle!.size=30
    text('loss-label','Loss\nℓ(ŷ, y)',860,144,110,62,18,false,'train')
    wire('input-to-model',input,model);wire('model-to-prediction',model,pred);wire('prediction-to-loss',pred,loss);wire('target-to-loss',target,loss,[],true)
    const gradient=[{x:813,y:204},{x:813,y:284},{x:405,y:284},{x:405,y:210}]
    const update=line('gradient-update',gradient,true);bind(update,loss,model,gradient);update.visual!.stroke='#aa714d'
    const rule=text('update-rule','θ ← θ − η ∇θℓ',468,248,268,30,19,false,'train')
    rule.textRuns=[{text:'θ ← θ − η ∇',italic:true},{text:'θ',script:'sub',italic:true},{text:'ℓ',italic:true}]
    text('update-caption','Gradient update',468,292,268,24,14,false,'train')
    line('phase-divider',[{x:24,y:330},{x:976,y:330}]).visual!.stroke='#d4dcd7'
    const dIn=sample('deploy-input',435,'deploy'),dModel=modelNode('deployed-model','fθ*',430,'deploy'),out=vector('deploy-output',448,'deploy')
    text('deploy-input-label','New samples x',28,520,180,30,18,false,'deploy')
    text('deploy-output-label','Prediction ŷ',500,520,160,30,18,false,'deploy')
    text('deployment-status','Fixed parameters',266,520,202,30,16,false,'deploy')
    wire('deploy-input-model',dIn,dModel);wire('deploy-model-output',dModel,out)
    const checkpoint=text('checkpoint','θ*',306,350,48,34,24)
    const transfer=[{x:330,y:210},{x:330,y:350}];bind(line('checkpoint-transfer',transfer,true,true),model,checkpoint,transfer)
    const load=[{x:330,y:384},{x:330,y:430}];bind(line('load-checkpoint',load,true,true),checkpoint,dModel,load)
    text('checkpoint-label','Copy learned parameters',370,353,300,28,16)
  }else if(id==='temporal-state'){
    const previous=card('state-before','State t−1',30,112,182,52,1),next=card('state-after','State t+1',788,112,182,52,1)
    const steps=[]
    for(let i=0;i<3;i++){
      const x=30+i*338,p=panel(`time-${i}`,`Time ${i===0?'t−1':i===1?'t':'t+1'}`,x,196,264,314)
      const input=card(`frame-${i}`,'Current input',x+30,252,204,50,2,p),step=card(`compute-${i}`,'Compute',x+30,338,204,56,0,p),output=card(`prediction-${i}`,'Output',x+30,436,204,48,1,p)
      wire(`frame-compute-${i}`,input,step,[],true);wire(`compute-prediction-${i}`,step,output,[],true);steps.push(step)
    }
    const read=[{x:previous.x+182,y:138},{x:500,y:138},{x:500,y:338}]
    bind(line('read-old-state',read,true),previous,steps[1]!,read)
    const write=[{x:steps[1]!.x+204,y:366},{x:650,y:366},{x:650,y:138},{x:788,y:138}]
    bind(line('write-later-state',write,true),steps[1]!,next,write)
    text('read-label','Read old state',286,106,200,26,15);text('write-label','Write next state',564,106,200,26,15)
  }else if(id==='tool-feedback'){
    panel('execution','a  Execution and revision',24,96,612,422);panel('trace','b  Inspect a real run',660,96,316,422)
    const task=card('task','Task',52,166,140,54,1,'execution'),actor=card('actor','Actor',250,166,150,54,0,'execution'),tool=card('tool','Tool call',454,166,150,54,2,'execution'),observation=card('observation','Observation',454,328,150,58,1,'execution'),revision=card('revision','Revision',250,328,150,58,0,'execution')
    wire('task-actor',task,actor);wire('actor-tool',actor,tool);wire('tool-observation',tool,observation,[],true)
    const back=[{x:454,y:357},{x:400,y:357}];bind(line('observe-revise',back,true),observation,revision,back)
    const loop=[{x:325,y:328},{x:325,y:220}];bind(line('revise-actor',loop,true),revision,actor,loop)
    text('loop-caption','Repeat only when the method calls for revision.',52,450,552,30,15,false,'execution')
    embed('evidence-slot','run-record',680,174,.9,'trace');text('trace-caption','Input → tool output → decision\nReplace with an actual trace.',682,370,270,64,15,false,'trace')
  }else if(id==='mechanism-evidence'){
    panel('mechanism','a  Mechanism overview',24,96,952,190)
    const nodes=['Input','Core mechanism','Output'].map((label,i)=>card(`mechanism-${i}`,label,64+i*314,174,244,64,i,'mechanism'))
    nodes.slice(1).forEach((n,i)=>wire(`mechanism-link-${i}`,nodes[i]!,n))
    for(let i=0;i<3;i++){
      const x=24+i*324,p=panel(`evidence-${i}`,['b  Observation','c  Quantification','d  Robustness'][i]!,x,312,304,206)
      embed('evidence-slot',`evidence-slot-${i}`,x+17,354,.9,p)
    }
  }else if(id==='image-comparison'){
    panel('plate','a  Matched conditions and channels',24,96,588,422)
    embed('shared-label-grid','matched-plate',46,164,1.35,'plate')
    panel('detail','b  Region correspondence',636,96,340,240);embed('crop-correspondence','paired-crop',650,146,1.03,'detail')
    panel('quantify','c  Quantification',636,360,340,158)
    const slot=card('quantification-slot','Insert observed measurements',654,408,304,58,4,'quantify');slot.visual={...slot.visual,fill:'none',dash:[5,4]};slot.textStyle!.size=14
    text('quantification-caption','Units · samples · source',654,476,304,24,13,false,'quantify')
  }else{
    panel('protocol','a  Declared intervention protocol',24,96,952,140)
    const stages=['Baseline','Intervention','Follow-up','Readout'].map((label,i)=>card(`protocol-${i}`,label,50+i*240,156,180,52,i,'protocol'))
    stages.slice(1).forEach((n,i)=>wire(`protocol-link-${i}`,stages[i]!,n))
    for(let i=0;i<4;i++){
      const x=24+i%2*486,y=260+Math.floor(i/2)*136,p=panel(`validation-${i}`,['b  Primary endpoint','c  Perturbation','d  Specificity','e  Tolerability'][i]!,x,y,466,122)
      const n=card(`data-slot-${i}`,'Insert evidence · metric · source',x+18,y+48,430,52,i,p);n.visual={...n.visual,fill:'none',dash:[5,4]}
    }
  }
  for(const n of figure.nodes)if(n.kind==='path')n.label=''
  return b.asset(`gallery-benchmark-${id}`,spec.name,`${spec.fits}${spec.caution}`,['标杆主题','图库提炼',spec.topic,...spec.tags],[...spec.sources] as GallerySourceId[])
}
export const galleryBenchmarks=()=>galleryBenchmarkSpecs.map(s=>galleryBenchmark(s.id))
