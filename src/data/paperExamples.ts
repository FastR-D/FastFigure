import {createBlank,parseDocument,type FigureDocument,type FigureNode} from '../core/model.ts'
import {parseAsset,type ComponentAsset} from '../core/assets.ts'
import {setPathPoints,type PathPoint} from '../core/paths.ts'
import {paperColors,type visualRoles,type textRoles} from '../core/paperStyle.ts'
import {circleArc} from './structureBuilder.ts'
import {defaultGradient} from '../core/gradient.ts'
import robotAsset from './materials/paper-robot.json' with {type:'json'}

export const paperExampleIds=['memory-comparison','internalizer-mechanism'] as const
function builder(width:number,height:number){
  const figure=createBlank(),root=figure.containers[0]!
  Object.assign(root,{x:0,y:0,width,height,role:'component',visual:{fill:'none',stroke:'none'}})
  figure.canvas.frame={x:0,y:0,width,height}
  function node(id:string,label:string,x:number,y:number,w:number,h:number,role:typeof visualRoles[number]='neutral',textRole:typeof textRoles[number]='body',size=20):FigureNode{
    const n:FigureNode={id,kind:role==='plain'?'text':'rectangle',parentId:'stage',label,x,y,width:w,height:h,textRole,textStyle:{size},visual:{role}}
    figure.nodes.push(n);return n
  }
  function line(id:string,points:PathPoint[],arrow=true,stroke:string=paperColors.ink,dash?:number[]){
    const n:FigureNode={id,kind:'path',parentId:'stage',label:id,x:0,y:0,width:1,height:1,path:{points:[{x:0,y:0},{x:1,y:1}],arrow:arrow?'filled':'none',arrowSize:8},visual:{stroke,strokeWidth:1.8,fill:'none',handDrawn:false,...(dash?{dash}:{})}}
    setPathPoints(n,points);figure.nodes.push(n);return n
  }
  function icon(id:string,iconId:string,x:number,y:number,size=26,color:string=paperColors.ink){const n:FigureNode={id,kind:'icon',iconId,parentId:'stage',label:'',x,y,width:size,height:size,visual:{stroke:color}};figure.nodes.push(n);return n}
  return{figure,root,node,line,icon}
}
function comparison(){
  const b=builder(478,530),{figure,node,line}=b
  for(const [suffix,y]of [['before',27],['after',289]] as const){
    const icons=['paper:search','paper:calculator','paper:transfer']
    for(let i=0;i<3;i++){const x=33+i*148,n=node(`task-${suffix}-${i}`,`Task ${i+1}`,x,y,116,45);n.iconId=icons[i]!;n.visual!.padding=10}
    const center=node(`memory-${suffix}`,suffix==='before'?'Static Latent Memory':'Test-time Internalizer',74,y+74,330,57,suffix==='before'?'neutral':'primary');center.visual!.radius=10;center.iconId=suffix==='before'?'paper:lock':'paper:fire'
    for(let i=0;i<3;i++){const start={x:91+i*148,y:y+45},end={x:111+i*128,y:y+74};line(`task-memory-${suffix}-${i}`,[start,end])}
    if(suffix==='after'){center.visual!.fillGradient=defaultGradient('#def9ac','#a4e8dc');line('task-order-1',[{x:149,y:y+22.5},{x:181,y:y+22.5}]);line('task-order-2',[{x:297,y:y+22.5},{x:329,y:y+22.5}]);line('update-loop',circleArc(427,391,24,Math.PI*.8,-Math.PI*1.6));node('update-label','Update',391,416,72,28,'plain','body',19)}
    line(`memory-result-${suffix}`,[{x:239,y:y+131},{x:239,y:y+160}])
    const caption=node(`result-${suffix}`,suffix==='before'?'Memory Without\nCross-Task Transfer!':'Memory Adapting\nAt Test Time',88,y+167,302,55,suffix==='before'?'negative':'positive','body',20);caption.visual!.padding=2;caption.textStyle!.color=suffix==='before'?paperColors.negative:paperColors.positive
    const robot=paperRobot().figure.nodes[0]!
    figure.nodes.push({...robot,id:`agent-${suffix}`,parentId:'stage',x:18,y:y+165,width:59,height:58})
  }
  line('comparison-divider',[{x:15,y:268},{x:463,y:268}],false,paperColors.ink,[8,6])
  return figure
}
function mechanism(){
  const {figure,node,line,icon}=builder(1000,416)
  node('state-band','',6,7,988,78,'band').visual!.fill='#f5f9f5'
  node('interaction-band','',6,93,988,129,'band')
  node('memory-band','',6,228,988,180,'band').visual!.fill='#f7f4fa'
  const core1=node('internalizer-1','',23,29,314,45,'primary','heading',17);core1.textStyle!.align='left';core1.visual!.padding=16
  node('state-title-1','Internalizer t = 1',39,39,141,25,'plain','heading',16)
  node('shape-1','ℝᴸᵗ×ᵈ → ℝᴷ×ᵈ',180,39,141,25,'plain','math',15)
  node('update-internalizer','',374,29,201,45,'primary','heading',17).visual!.fill='#e0ebd9';node('update-title','Update Internalizer',382,39,185,25,'plain','heading',16).iconId='paper:refresh'
  const core2=node('internalizer-2','',618,29,355,45,'primary','heading',17);core2.textStyle!.align='left';core2.visual!.padding=34
  node('state-title-2','Internalizer t = 2',634,39,161.5,25,'plain','heading',16)
  node('shape-2','ℝᴸᵗ×ᵈ → ℝᴷ×ᵈ',795.5,39,161.5,25,'plain','math',15)
  line('advance-1',[{x:337,y:51.5},{x:374,y:51.5}]);line('advance-2',[{x:575,y:51.5},{x:618,y:51.5}])
  function card(id:string,title:string,body:string,x:number,y:number,w:number,h:number,iconId?:string){
    node(id,'',x,y,w,h)
    const heading=node(`${id}-title`,title,x+6,y+(body?4:(h-23)/2),w-12,23,'plain','body',15);heading.textStyle!.bold=true;heading.iconId=iconId
    if(body)node(`${id}-body`,body,x+9,y+30,w-18,h-34,'plain','body',14.5)
  }
  card('query','‹query›','Help me understand\nthis codebase.',21,110,151,71,'paper:chat')
  node('input-token-card','',177,110,143,71,'tokens');node('input-token-title','‹internalize tokens›',179,112,139,24,'plain','body',15).textStyle!.bold=true
  function tokens(id:string,x:number,y:number,count:number,color:'tokens'|'memory'='tokens'){
    for(let i=0;i<count;i++){const n=node(`${id}-${i}`,'',x+i*22,y,19,20,color);n.visual={...n.visual,fill:color==='tokens'?'#ffecae':'#e4dbea',stroke:color==='tokens'?'#ffbd00':'#9879ac',strokeWidth:.9,radius:5}}
  }
  tokens('input-token',184,148,6)
  node('target-1','',327,103,321,109,'target');node('target-1-label','target₁',437.5,183,100,25,'plain','math',21).textStyle={size:21,bold:true,color:paperColors.target}
  card('think','‹think›','First, I need to find\nthe entrance code.',336,110,149,71,'paper:thought')
  card('tool','‹tool call›','› read model.py\n› grep generate()',492,110,150,71,'paper:tool')
  card('observe','‹observe›','def generate(…):\n  return output',654,110,140,71,'paper:search')
  node('output-token-card','',800,110,73,71,'tokens','body',15);node('output-token-title','‹tokens›',802,112,69,24,'plain','body',15);tokens('output-token',805,148,3)
  node('target-2','',880,103,103,109,'target');card('think-next','‹think›','',890,110,83,33,'paper:thought');card('tool-next','‹tool›','',890,151,83,30,'paper:tool');node('target-2-label','target₂',888,183,87,25,'plain','math',20).textStyle={size:20,bold:true,color:paperColors.target}
  for(const [id,x,a,z]of [['query-state',96.5,110,74],['state-tokens',248.5,74,110],['think-update',474.5,103,74],['target-state',634,103,74],['observe-state',724,110,74],['state-output',836.5,74,110]] as const)line(id,[{x,y:a},{x,y:z}])
  node('entry','',21,239,314,157,'memory').visual!.radius=24
  node('entry-heading','Internalizer Entry',37,247,282,25,'plain','heading',17)
  node('lora-tile','',34,276,82,87,'neutral').visual={fill:'#f6f2f9',stroke:'none',radius:13}
  line('lora-left',[{x:48,y:290},{x:74,y:301},{x:74,y:345},{x:48,y:332},{x:48,y:290}],false,'#9879ac')
  line('lora-right',[{x:103,y:290},{x:78,y:301},{x:78,y:345},{x:103,y:332},{x:103,y:290}],false,'#9879ac')
  node('lora-label','LoRA',34,365,82,27,'plain','body',15);icon('lora-trainable','paper:fire',30,265,25,'#ff7020')
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)line(`network-${i}-${j}`,[{x:151,y:294+i*17},{x:173,y:301+j*17}],false,'#9879ac')
  for(let i=0;i<3;i++){const a=node(`network-a-${i}`,'',146,289+i*17,10,10,'memory');a.kind='ellipse';a.visual!.stroke='#9879ac';const z=node(`network-b-${i}`,'',168,296+i*17,10,10,'memory');z.kind='ellipse';z.visual!.stroke='#9879ac'}
  node('network-label','index space',122,365,80,27,'plain','body',15)
  tokens('memory-query-1',212,281,5,'memory');tokens('memory-query-2',212,339,5,'memory');node('memory-query-ellipsis','⋮',250.5,307,30,27,'plain','body',22);node('memory-query-label','memory queries',210,365,111,27,'plain','body',15);icon('queries-trainable','paper:fire',201,265,25,'#ff7020')

  // Cylinder: a body plus independent native ellipse outlines; no opaque bitmap.
  const bank=line('bank-body',[{x:355,y:258},{x:355,y:377},{x:594,y:377,c1:{x:355,y:402},c2:{x:594,y:402}},{x:594,y:258},{x:355,y:258,close:true}],false,'#9879ac');bank.visual!.fill='#f0e9f3'
  const top=node('bank-top','',355,239,239,38,'memory');top.kind='ellipse';top.visual={...top.visual,fill:'#f7f4fa',stroke:'#9879ac',strokeWidth:1.8}
  node('bank-title','Internalizer Bank',379.5,245.5,190,25,'plain','heading',16).textStyle!.color='#9879ac'
  for(const [id,label,x,y]of [['bank-1','𝒥₁',365,291],['bank-2','𝒥₂',480,291],['bank-more','…',365,338],['bank-n','𝒥ₙ',480,338]] as const)node(id,label,x,y,104,40,'memory','math',22).visual!.radius=16
  line('entry-bank-top',[{x:335,y:251},{x:354,y:277}],false,'#9879ac',[7,5]);line('entry-bank-bottom',[{x:335,y:383},{x:354,y:358}],false,'#9879ac',[7,5])
  node('updated','',654,239,268,71,'primary','heading',17);node('updated-title','Updated Internalizer',670,248,236,25,'plain','heading',17);node('updated-formula','ℝᴸᵗ×ᵈ → ℝᴷ×ᵈ',701,278,174,24,'plain','math',15)
  card('saved-query','‹query›','Help me understand\nthis codebase.',654,319,145,71,'paper:chat');card('answer','‹answer›','The entrance\ncode is …',807,319,115,71,'paper:chat')
  line('save-internalizer',[{x:654,y:274.5},{x:594,y:274.5}]);node('save-internalizer-label','save',600,251,48,25,'plain','heading',17)
  line('save-query',[{x:654,y:354.5},{x:594,y:354.5}]);node('save-query-label','save',600,327,48,25,'plain','heading',17)
  line('retrieve',[{x:96.5,y:239},{x:96.5,y:181}]);node('retrieve-label','retrieve',106,195,80,25,'plain','heading',17)
  line('update-result',[{x:931.5,y:212},{x:954,y:212},{x:954,y:274.5},{x:922,y:274.5}]);line('answer-result',[{x:954,y:274.5},{x:954,y:354.5},{x:922,y:354.5}]);node('continuation','⋮',947,285,25,30,'plain','body',22)
  const code=figure.nodes.find(n=>n.id==='observe-body')!;code.textStyle!.align='left';code.textRuns=[{text:'def ',color:'#b929c2',italic:true},{text:'generate(…)',color:'#477cff',italic:true},{text:':\n  return output'}];code.label=code.textRuns.map(r=>r.text).join('')
  for(const id of ['shape-1','shape-2','updated-formula']){const n=figure.nodes.find(n=>n.id===id)!;n.textRuns=[{text:'ℝ',family:'Noto Serif SC'},{text:'Lₜ×d',script:'super',italic:true},{text:' → ℝ',family:'Noto Serif SC'},{text:'K×d',script:'super',italic:true}];n.label=n.textRuns.map(r=>r.text).join('')}
  return figure
}
export function paperExample(id:typeof paperExampleIds[number]):ComponentAsset{
  const figure=id==='memory-comparison'?comparison():mechanism(),name=id==='memory-comparison'?'记忆适应 · 简洁对照标杆':'Internalizer · 详细机制标杆'
  figure.title=name;figure.containers[0]!.title=name
  return parseAsset({format:'fastfigure.component',version:1,id:`paper-${id}`,name,description:'依据用户提供的视觉参考构建的可编辑设计标杆。内容与关系为参考示意，不能据此推断方法有效性或实验事实。',tags:['论文插图','标杆','记忆','Internalizer',id==='memory-comparison'?'对照':'机制'],createdAt:'2026-11-05T00:00:00.000Z',updatedAt:'2026-11-05T00:00:00.000Z',sources:[{title:'用户提供的论文插图视觉参考',reference:id==='memory-comparison'?'对照图：静态记忆与测试时适应；结构、文字与连线原生可编辑，机器人使用单独生成的透明 AI 插画。':'机制图：Internalizer、交互目标和记忆库；按所给图示构建原生视觉标杆。'}],lineage:[],figure:parseDocument(figure)})
}
export function paperExamples(){return paperExampleIds.map(paperExample)}
export function paperExampleDocument(id:typeof paperExampleIds[number]):FigureDocument{return paperExample(id).figure}
export function paperRobot():ComponentAsset{return parseAsset(robotAsset)}

/** Neutral building blocks expose visual vocabulary without importing the reference's scientific claims. */
export function paperPrimitives():ComponentAsset[]{
  const specs=[['message-card','图标与正文卡片',220,112],['token-strip','Token 条带卡片',230,90],['core-module','核心机制模块',260,88],['memory-bank','记忆库圆柱',260,180]] as const
  return specs.map(([id,name,width,height])=>{
    const {figure,node,line}=builder(width,height)
    if(id==='message-card'){
      node('card','',10,10,200,92)
      const heading=node('card-heading','‹query›',22,18,176,25,'plain','body',17);heading.textStyle!.bold=true;heading.iconId='paper:chat'
      node('card-content','Describe the input\nand expected output.',22,50,176,44,'plain','body',15)
    }else if(id==='token-strip'){
      node('card','',10,10,210,70,'tokens');node('card-heading','‹tokens›',22,14,186,25,'plain','body',17).textStyle!.bold=true
      for(let i=0;i<6;i++)node(`token-${i}`,'',22+i*32,46,26,24,'tokens').visual={fill:'#ffecae',stroke:'#ffbd00',strokeWidth:1,radius:6}
    }else if(id==='core-module'){
      node('card','',10,10,240,68,'primary');node('card-heading','Core mechanism',22,17,216,25,'plain','heading',17)
      node('card-content','Inputs → Outputs',22,48,216,23,'plain','math',15)
    }else{
      const bank=line('bank-body',[{x:10,y:32},{x:10,y:151},{x:250,y:151,c1:{x:10,y:177},c2:{x:250,y:177}},{x:250,y:32},{x:10,y:32,close:true}],false,'#9879ac');bank.visual!.fill='#f0e9f3'
      const top=node('bank-top','',10,10,240,44,'memory');top.kind='ellipse';top.visual={fill:'#f7f4fa',stroke:'#9879ac',strokeWidth:1.8}
      node('bank-heading','Memory Bank',35,18,190,25,'plain','heading',17).textStyle!.color='#9879ac'
      for(let i=0;i<4;i++)node(`slot-${i}`,['𝒥₁','𝒥₂','…','𝒥ₙ'][i]!,21+(i%2)*115,65+Math.floor(i/2)*45,103,36,'memory','math',21)
    }
    figure.title=name;figure.containers[0]!.title=name
    return parseAsset({format:'fastfigure.component',version:1,id:`paper-${id}`,name,description:'内置论文插图构件；占位文字可修改，结构与内容不代表实验事实。',tags:['论文插图','内置图示',name],createdAt:'2026-11-05T00:00:00Z',updatedAt:'2026-11-05T00:00:00Z',sources:[{title:'FastFigure 原生论文图示',reference:'按默认论文风格独立构建；文字、形状与连接可分别编辑。'}],lineage:[],figure:parseDocument(figure)})
  })
}
