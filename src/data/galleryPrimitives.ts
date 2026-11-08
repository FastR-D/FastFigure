import {galleryBuilder,type GallerySourceId} from './galleryStudy.ts'

export const galleryPrimitiveSpecs=[
  {id:'phase-transfer',name:'阶段迁移接口',category:'structure',tags:['参数迁移','训练部署','Checkpoint'],description:'实线阶段边界与虚线参数迁移；迁移标签独立编辑。虚线只表示标注的参数转移，不作数据流。',sources:['iclr2024-0825']},
  {id:'state-slots',name:'带时刻的状态槽',category:'system',tags:['时序','记忆','State slots'],description:'状态标题、槽位和时刻注释独立编辑；槽数为示意，不声明存储容量或写入策略。',sources:['aaai2023-25392','icml2024-0608']},
  {id:'identity-matrix',name:'配对身份矩阵',category:'model',tags:['配对','矩阵','Identity matrix'],description:'行列身份与配对对角线；没有相似度、概率或注意力数值，不能作为实验热图。',sources:['ImmunoStruct_contrastive']},
  {id:'relation-key',name:'关系线型图例',category:'structure',tags:['图例','连线','Legend'],description:'数据传递、参数迁移、解释引线三类图例；颜色和线型双重区分，标签可以修改。',sources:['aaai2023-25392','iclr2024-0825']},
  {id:'trainability-key',name:'冻结与可训练标记',category:'model',tags:['冻结','可训练','Frozen','Trainable'],description:'锁与火焰配合文字说明训练状态。状态需使用者声明，不根据颜色自动推断。',sources:['icml2026-0316','ImmunoStruct_schematic']},
  {id:'evidence-slot',name:'带角色的证据槽',category:'structure',tags:['证据','面板','Evidence'],description:'面板角标、问题标题、数据位置与说明行；留空等待真实数据，不附带曲线或统计结论。',sources:['fig1-material-mechanism-rich']},
  {id:'crop-correspondence',name:'原图与局部对应框',category:'structure',tags:['图像','局部','ROI','Crop'],description:'空图像槽、ROI 矩形和对应引线；没有图片或比例尺，需放入自己的原图和真实裁切。',sources:['fig2-spatial-imaging-rich','atlas-09-image-plates']},
  {id:'panel-heading',name:'面板角标与标题',category:'structure',tags:['标题','角标','Panel label'],description:'左侧角标、问题标题、短说明和分隔线；无边框图版也能保持清晰的面板层次。',sources:['fig4-single-cell-systems-rich']},
  {id:'modality-rows',name:'保持身份的模态行',category:'model',tags:['多模态','身份','Modality lanes'],description:'两行模态与各自 token 位置一一对应；行色保持身份，不表示共享编码器或跨模态注意力。',sources:['aaai2023-25392']},
  {id:'shared-label-grid',name:'共享行列标签的图像槽',category:'structure',tags:['对照','图像','共享标签','Image plate'],description:'两条件×三通道的空图版，共用行列标签；没有合成通道、定量值或虚构标尺。',sources:['fig2-spatial-imaging-rich']},
] as const
export type GalleryPrimitiveId=typeof galleryPrimitiveSpecs[number]['id']

export function galleryPrimitive(id:GalleryPrimitiveId){
  const spec=galleryPrimitiveSpecs.find(s=>s.id===id)
  if(!spec)throw new Error('未知图库构件')
  const b=galleryBuilder(id==='shared-label-grid'?400:300,id==='shared-label-grid'?230:170),{text,card,line,wire,figure}=b
  if(id==='phase-transfer'){
    const a=card('earlier','Training',12,42,112,62,0),z=card('later','Deployment',176,42,112,62,1)
    wire('parameter-transfer',a,z,[],false,true);text('transfer-label','Parameters',100,12,100,22,13)
    text('transfer-note','Phase boundary · editable transfer',12,125,276,24,12)
  }else if(id==='state-slots'){
    text('state-title','Memory state · t',12,12,276,28,18,true)
    for(let i=0;i<3;i++)card(`slot-${i}`,`s${i+1}`,22+i*90,58,76,52,1)
    text('state-note','Illustrative slots, not capacity',12,130,276,24,12)
  }else if(id==='identity-matrix'){
    text('column-title','B positions',102,6,156,22,14,true)
    for(let i=0;i<3;i++){
      text(`row-${i}`,`A${i+1}`,16,39+i*32,62,28,13)
      text(`column-${i}`,`${i+1}`,100+i*48,26,42,16,11)
      for(let j=0;j<3;j++){const n=card(`pair-${i}-${j}`,'',100+j*48,44+i*30,42,26,1);n.visual!.radius=2;if(i!==j)n.visual!.fill='#f3f5f4'}
    }
    const frame=card('pairing-frame','',96,40,146,90,4);frame.visual={fill:'none',stroke:'#81908f',strokeWidth:1,radius:0,handDrawn:false}
    text('matrix-note','Diagonal = pair identity; no scores',12,142,276,22,12)
  }else if(id==='relation-key'){
    for(const [i,label,dashed,arrow]of [[0,'Data flow',false,true],[1,'Parameter transfer',true,true],[2,'Detail correspondence',true,false]] as const){
      line(`key-${i}`,[{x:16,y:35+i*48},{x:78,y:35+i*48}],arrow,dashed)
      text(`key-label-${i}`,label,90,20+i*48,198,30,15)
    }
  }else if(id==='trainability-key'){
    for(const [i,label,icon]of [[0,'Frozen','paper:lock'],[1,'Trainable','paper:fire']] as const){const n=card(`status-${i}`,label,24,24+i*66,252,50,i);n.iconId=icon}
  }else if(id==='evidence-slot'){
    text('panel-letter','a',12,4,24,28,19,true);text('panel-question','Evidence question',44,4,244,28,17,true)
    const n=card('evidence-placeholder','Insert observed data',18,44,264,78,4);n.visual={...n.visual,fill:'none',dash:[5,4]}
    text('evidence-caption','Metric · units · source',18,134,264,24,13)
  }else if(id==='crop-correspondence'){
    card('image-placeholder','',12,30,124,104,4).visual!.fill='none'
    text('image-label','Source image',16,34,116,26,14)
    card('crop-placeholder','Detail crop',190,30,98,104,4).visual!.fill='none'
    const roi=card('roi','ROI',78,74,46,42,1);roi.textStyle!.size=12;roi.visual={...roi.visual,fill:'none',dash:[4,3],radius:0}
    line('crop-top',[{x:124,y:74},{x:190,y:30}],false,true);line('crop-bottom',[{x:124,y:116},{x:190,y:134}],false,true)
    text('crop-note','Use a real crop; no implied scale',12,142,276,22,12)
  }else if(id==='panel-heading'){
    text('letter','a',12,16,32,34,24,true);text('heading','Panel question',54,16,234,34,20,true)
    text('subtitle','A short, specific description',12,66,276,28,15);line('divider',[{x:12,y:110},{x:288,y:110}])
  }else if(id==='modality-rows'){
    for(let i=0;i<2;i++){
      text(`modality-${i}`,`Input ${i?'B':'A'}`,8,31+i*66,86,34,15,true)
      for(let j=0;j<4;j++)card(`token-${i}-${j}`,`${j+1}`,108+j*46,28+i*66,34,40,i).textStyle!.size=13
    }
  }else{
    for(let j=0;j<3;j++)text(`column-${j}`,['Input','Output','Detail'][j]!,84+j*104,12,96,26,15,true)
    for(let i=0;i<2;i++){
      text(`row-${i}`,`Group ${i?'B':'A'}`,4,64+i*78,76,56,13,true)
      for(let j=0;j<3;j++){const n=card(`image-${i}-${j}`,'Image',84+j*104,54+i*78,96,64,i);n.visual={...n.visual,fill:'none',radius:2,dash:[4,3]};n.textStyle!.size=13}
    }
    text('plate-note','Matched samples · replace every image',12,204,376,22,12)
  }
  // Whole glyphs expose no scientific data-flow ports. Individual native marks remain editable.
  for(const n of figure.nodes)if(n.kind==='path')n.label=''
  return b.asset(`gallery-part-${id}`,spec.name,spec.description,['图库提炼',spec.category,...spec.tags],[...spec.sources] as GallerySourceId[])
}
export const galleryPrimitives=()=>galleryPrimitiveSpecs.map(s=>galleryPrimitive(s.id))
