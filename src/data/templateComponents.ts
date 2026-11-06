import {parseAsset,type ComponentAsset} from '../core/assets.ts'
import {parseDocument,type FigureNode} from '../core/model.ts'
import {createStructureBuilder,circleArc} from './structureBuilder.ts'
import type {PathPoint} from '../core/paths.ts'

/** Curated, native reinterpretations, not a lossless PPTX importer or paper reproductions. */
export const templateComponentSource={
  title:'模板合集20260627.pptx',
  sha256:'3c9313cad84c2d28701494edb2b7a01af3b66ae7cb3e8277079dd334f7c25e3d',
} as const
export const templateComponentSpecs=[
  {id:'segmented-rings',name:'环形分区',category:'structure',pages:[7,12],tags:['环形','分区','分类','扇区','Radial taxonomy'],description:'内外两层分段环带与中心主题，适合分类与领域概览。扇区和标签可分别编辑；面积与角度不表示数量。'},
  {id:'milestone-timeline',name:'里程碑时间轴',category:'structure',pages:[13,16,29],tags:['时间轴','里程碑','Timeline','Milestone'],description:'上下交错的事件、节点和引线，适合演进过程。默认使用阶段占位，不附带真实年份；间距不表示时长。'},
  {id:'phase-roadmap',name:'阶段任务路线图',category:'structure',pages:[5,20],tags:['阶段','路线图','Roadmap','Phase'],description:'四个连续阶段各含两项任务，阶段带与任务可独立改字和换色。宽度不表示时间、工作量或转化率。'},
  {id:'branch-interaction',name:'双路逐元素交互',category:'model',pages:[2,25],tags:['双路','门控','逐元素','乘法','Gating'],description:'输入拆为两路变换，在乘法算子处汇合后输出。仅表示逐元素交互拓扑，不预设激活函数、权重或某篇论文的具体算法。'},
  {id:'compress-expand',name:'特征压缩与展开',category:'model',pages:[8,27],tags:['压缩','展开','瓶颈','Bottleneck','Projection'],description:'宽表示经收缩投影进入紧凑表示，再经展开投影输出。轮廓和条带是示意，不推断真实通道数、维度或编码器结构。'},
  {id:'parallel-kernels',name:'并行卷积分支',category:'model',pages:[18,19],tags:['并行','卷积','多尺度','Kernel','Convolution'],description:'同一输入进入三个不同卷积核分支，显式拼接后输出。核标签可编辑，原生连线绑定分支；不声称复现模板论文模块。'},
  {id:'paired-streams',name:'双流特征对照',category:'model',pages:[26],tags:['双流','孪生','对照','变化检测','Siamese'],description:'两路输入分别编码后送入对照模块。两路编码器独立，默认不声明共享参数，也不预设差分、注意力或变化检测算法。'},
  {id:'modality-slots',name:'多模态输入槽位',category:'model',pages:[23,24],tags:['多模态','缺失模态','槽位','Modality','Missing'],description:'三路模态各自编码，输出保持身份对应，第四槽明确标为缺失。缺失槽没有计算连线；不暗示已经实现缺失模态补全或鲁棒训练。'},
  {id:'repeated-blocks',name:'重复特征块',category:'model',pages:[1,8,23],tags:['重复','特征块','Token','Blocks','序列'],description:'三个串行块各含独立特征条带，配合重复括线表达堆叠。块数、条带数仅作示意，重复次数占位不等于实际网络深度。'},
  {id:'overview-detail',name:'概览与细节展开',category:'structure',pages:[3,4],tags:['概览','局部','展开','细节','Overview','Detail'],description:'主流程中一个阶段由虚线对应到右侧内部步骤。右侧为重排后的解释示意，未复制任何真实图件快照；可按研究方法修改对应关系。'},
] as const
export type TemplateComponentId=typeof templateComponentSpecs[number]['id']
const ink='#34485b',muted='#718096'

function buildTemplateFigure(id:TemplateComponentId){
  const b=createStructureBuilder(),{figure,root,text,shape,path,bind,group}=b
  Object.assign(root,{width:640,height:300})
  figure.canvas.frame={x:0,y:0,width:640,height:300}
  function block(key:string,label:string,x:number,y:number,w=100,h=46,color=0){
    const n=shape(key,label,x,y,w,h,color);n.visual={...n.visual,radius:7};n.textStyle={size:15,align:'center'};return n
  }
  function wire(key:string,a:FigureNode,z:FigureNode,via:PathPoint[]=[],vertical=false){
    const points=vertical?[{x:a.x+a.width/2,y:a.y+a.height},...via,{x:z.x+z.width/2,y:z.y}]:[{x:a.x+a.width,y:a.y+a.height/2},...via,{x:z.x,y:z.y+z.height/2}]
    const n=path(key,points,'filled');n.visual={...n.visual,stroke:ink};n.path!.arrowSize=7;bind(n,a,z,points)
    for(const [end,target,point]of [['start',a,points[0]!],['end',z,points.at(-1)!]] as const)if(target.kind==='path'){
      const anchorIndex=target.path!.points.findIndex(p=>Math.abs(target.x+p.x*target.width-point.x)<1e-6&&Math.abs(target.y+p.y*target.height-point.y)<1e-6)
      if(anchorIndex<0)throw new Error('投影轮廓缺少连接锚点')
      n.path![end]={nodeId:target.id,anchorIndex}
    }
    return n
  }
  function guide(key:string,points:PathPoint[],dashed=false){const n=path(key,points);n.visual={...n.visual,stroke:muted,...(dashed?{dash:[5,4]}:{})};return n}
  function port(key:string,label:string,direction:'input'|'output',side:'left'|'right',position=.5){
    figure.nodes.push({id:key,kind:'port',label,parentId:'stage',interfaceFor:'stage',x:0,y:0,width:root.width,height:root.height,socket:{key,direction,side,position}})
  }
  if(id==='segmented-rings'){
    const cx=208,cy=150
    for(let i=0;i<6;i++){
      const start=-Math.PI/2+i*Math.PI/3+.035,sweep=Math.PI/3-.07
      for(const [layer,inner,outer]of [[0,47,77],[1,83,121]]){
        const points=[...circleArc(cx,cy,outer!,start,sweep),...circleArc(cx,cy,inner!,start+sweep,-sweep)]
        points.push({...points[0]!,close:true});path(`sector-${layer}-${i}`,points,'none',true,i)
      }
      const a=start+sweep/2;text(`sector-label-${i}`,String.fromCharCode(65+i),cx+101*Math.cos(a)-12,cy+101*Math.sin(a)-12,24,24,15)
      block(`legend-chip-${i}`,'',370,44+i*36,16,16,i);text(`legend-${i}`,`Group ${String.fromCharCode(65+i)}`,402,39+i*36,170,26,16)
    }
    text('core-label','Topic',cx-42,cy-15,84,30,19,'stage',true)
  }else if(id==='milestone-timeline'){
    const rail=path('time-direction',[{x:34,y:150},{x:606,y:150}],'filled');rail.visual={...rail.visual,stroke:ink,strokeWidth:2}
    for(let i=0;i<5;i++){
      const x=68+i*125,above=i%2===0,y=above?36:204
      const card=block(`event-${i}`,`Event ${i+1}`,x-50,y,100,48,i),dot=shape(`milestone-${i}`,'',x-6,144,12,12,i,'stage',true)
      const points=[{x,y:above?card.y+card.height:card.y},{x,y:above?dot.y:dot.y+dot.height}],n=guide(`event-leader-${i}`,points)
      bind(n,card,dot,points);text(`stage-label-${i}`,`Stage ${i+1}`,x-50,above?92:168,100,25,14)
    }
  }else if(id==='phase-roadmap'){
    for(let i=0;i<4;i++){
      const x=22+i*154
      group(`phase-${i}`,`Phase ${i+1}`,x,32,138,234)
      text(`phase-title-${i}`,`Phase ${i+1}`,x,42,138,28,17,'stage',true)
      const band=block(`phase-band-${i}`,'',x,82,138,172,i);band.visual!.fillOpacity=.35
      for(let j=0;j<2;j++)block(`phase-task-${i}-${j}`,`Task ${i+1}.${j+1}`,x+10,106+j*78,118,48,i)
      guide(`phase-order-${i}`,[{x:x+12,y:276},{x:x+125,y:276},{x:x+132,y:270}])
    }
  }else if(id==='branch-interaction'){
    const input=block('input','Input',20,127,82,46,0),a=block('branch-a','Branch A',169,55,132,48,1),z=block('branch-b','Branch B',169,197,132,48,2)
    const multiply=shape('multiply','×',414,128,44,44,3,'stage',true);multiply.textStyle={size:24}
    const output=block('output','Output',530,127,90,46,0)
    wire('split-a',input,a,[{x:134,y:150},{x:134,y:79}]);wire('split-b',input,z,[{x:134,y:150},{x:134,y:221}])
    const upper=[{x:301,y:79},{x:436,y:79},{x:436,y:128}],lower=[{x:301,y:221},{x:436,y:221},{x:436,y:172}]
    bind(path('branch-a-product',upper,'filled'),a,multiply,upper);bind(path('branch-b-product',lower,'filled'),z,multiply,lower);wire('product-output',multiply,output)
    port('input-port','Input','input','left');port('output-port','Output','output','right')
  }else if(id==='compress-expand'){
    const input=block('input','Input',18,125,78,50,0),output=block('output','Output',544,125,78,50,0)
    const a=path('compression',[{x:140,y:150},{x:140,y:77},{x:231,y:123},{x:231,y:150},{x:231,y:177},{x:140,y:223},{x:140,y:150,close:true}],'none',true,1)
    const z=path('expansion',[{x:408,y:150},{x:408,y:123},{x:499,y:77},{x:499,y:150},{x:499,y:223},{x:408,y:177},{x:408,y:150,close:true}],'none',true,2)
    const latent=block('latent','z',285,122,69,56,3);latent.textStyle!.size=22
    wire('input-compress',input,a);wire('compress-latent',a,latent);wire('latent-expand',latent,z);wire('expand-output',z,output)
    text('compress-label','Compress',125,239,120,28,15);text('latent-label','Bottleneck',260,197,120,28,15);text('expand-label','Expand',394,239,120,28,15)
    port('input-port','Input','input','left');port('output-port','Output','output','right')
  }else if(id==='parallel-kernels'){
    const input=block('input','Features',18,127,96,46,0),merge=block('concat','Concat',395,120,88,60,3),output=block('output','Output',536,127,86,46,0)
    for(let i=0;i<3;i++){
      const y=35+i*92,kernel=block(`kernel-${i}`,`${i*2+1}×${i*2+1} conv`,198,y,128,46,i)
      wire(`input-kernel-${i}`,input,kernel,[{x:155,y:150},{x:155,y:y+23}])
      wire(`kernel-concat-${i}`,kernel,merge,[{x:360,y:y+23},{x:360,y:150}])
    }
    wire('concat-output',merge,output);port('input-port','Features','input','left');port('output-port','Concatenated features','output','right')
  }else if(id==='paired-streams'){
    const compare=block('compare','Compare',402,121,100,58,3),output=block('output','Output',545,127,78,46,0)
    for(let i=0;i<2;i++){
      const y=57+i*140,input=block(`input-${i}`,`Input ${i?'B':'A'}`,18,y,103,46,i),encoder=block(`encoder-${i}`,`Encoder ${i?'B':'A'}`,184,y,140,46,i)
      wire(`encode-${i}`,input,encoder);wire(`compare-in-${i}`,encoder,compare,[{x:365,y:y+23},{x:365,y:150}]);port(`input-${i}-port`,`Input ${i?'B':'A'}`,'input','left',(y+23)/300)
    }
    wire('compare-output',compare,output);port('output-port','Comparison output','output','right')
  }else if(id==='modality-slots'){
    for(let i=0;i<4;i++){
      const x=26+i*156,missing=i===3,input=block(`modality-${i}`,missing?'Missing':`Modality ${String.fromCharCode(65+i)}`,x,35,120,45,i)
      if(missing){input.visual={...input.visual,fill:'none',stroke:muted,dash:[5,4]};text('missing-note','No input',x,132,120,30,16);continue}
      const encoder=block(`encoder-${i}`,`Encoder ${String.fromCharCode(65+i)}`,x,122,120,45,i),tokens=block(`tokens-${i}`,'',x,216,120,44,i)
      wire(`modality-encoder-${i}`,input,encoder,[],true);wire(`encoder-tokens-${i}`,encoder,tokens,[],true)
      for(let j=0;j<4;j++)block(`token-${i}-${j}`,'',x+9+j*27,225,20,26,i).visual!.stroke=ink
    }
  }else if(id==='repeated-blocks'){
    for(let i=0;i<3;i++){
      const x=32+i*208;group(`block-group-${i}`,`Block ${i+1}`,x,70,160,138)
      block(`block-frame-${i}`,'',x,70,160,138,i).visual!.fillOpacity=.45
      text(`block-label-${i}`,`Block ${i+1}`,x+10,81,140,26,17,'stage',true)
      for(let j=0;j<4;j++)block(`feature-${i}-${j}`,'',x+18+j*32,128,24,58,i).visual!.stroke=ink
      if(i)wire(`block-transition-${i}`,figure.nodes.find(n=>n.id===`block-frame-${i-1}`)!,figure.nodes.find(n=>n.id===`block-frame-${i}`)!)
    }
    guide('repeat-bracket',[{x:32,y:230},{x:32,y:242},{x:608,y:242},{x:608,y:230}]);text('repeat-label','Repeated blocks · ×N',192,252,256,30,17)
    port('input-port','Block input','input','left',139/300);port('output-port','Block output','output','right',139/300)
  }else{
    const a=block('overview-a','Stage A',35,31,148,48,0),z=block('overview-b','Stage B',35,125,148,48,1),c=block('overview-c','Stage C',35,219,148,48,2)
    wire('overview-a-b',a,z,[],true);wire('overview-b-c',z,c,[],true)
    group('detail-region','Stage B detail',278,57,334,187);const frame=block('detail-frame','',278,57,334,187,1);frame.visual={...frame.visual,fillOpacity:.22,stroke:muted,dash:[5,4]}
    text('detail-title','Inside Stage B',296,71,298,28,18,'stage',true)
    const d=block('detail-a','Step 1',304,132,110,50,1),e=block('detail-b','Step 2',476,132,110,50,2);wire('detail-step',d,e)
    guide('detail-top-guide',[{x:183,y:125},{x:278,y:57}],true);guide('detail-bottom-guide',[{x:183,y:173},{x:278,y:244}],true)
  }
  // Logical subgroups own their contents so capture, movement and regrouping preserve structure.
  for(const container of figure.containers.filter(c=>c.id!=='stage')){
    container.x-=2;container.y-=2;container.width+=4;container.height+=4
    for(const node of figure.nodes)if(node.kind!=='port'&&node.x>=container.x+2&&node.y>=container.y+2&&node.x+node.width<=container.x+container.width-2&&node.y+node.height<=container.y+container.height-2)node.parentId=container.id
  }
  return parseDocument(figure)
}

export function templateComponent(id:TemplateComponentId):ComponentAsset{
  const spec=templateComponentSpecs.find(s=>s.id===id)
  if(!spec)throw new Error('未知模板组件')
  const figure=buildTemplateFigure(id);figure.title=spec.name;figure.containers[0]!.title=spec.name
  const source={title:templateComponentSource.title,reference:`第 ${spec.pages.join('、')} 页；SHA-256 ${templateComponentSource.sha256}。参考布局重新构建的原生组件，非论文原图复现；占位文字与数量仅示意。`}
  figure.containers[0]!.evidence=source
  return parseAsset({format:'fastfigure.component',version:1,id:`paper-template-${id}`,name:spec.name,description:spec.description,tags:['模板精选',spec.category,...spec.tags],createdAt:'2026-11-06T00:00:00.000Z',updatedAt:'2026-11-06T00:00:00.000Z',sources:[source],lineage:[],figure})
}
export function templateComponents():ComponentAsset[]{return templateComponentSpecs.map(spec=>templateComponent(spec.id))}
