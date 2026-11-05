import {z} from 'zod'
import {fontFamilies} from '../data/materials.ts'
import type {FigureContainer,FigureDocument,FigureNode,TextStyle} from './model.ts'

export const visualRoles=['neutral','primary','memory','tokens','target','positive','negative','band','plain','detail'] as const
export const textRoles=['heading','body','caption','math','code'] as const
export const visualRoleLabels={neutral:'普通卡片',primary:'核心机制',memory:'记忆与存储',tokens:'Token 表示',target:'目标分组',positive:'正向结论',negative:'问题结论',band:'阶段底带',plain:'无框内容',detail:'内部结构图示'} as const
export const textRoleLabels={heading:'模块标题',body:'正文',caption:'次级注释',math:'数学符号',code:'代码'} as const
export const fontRolesSchema=z.object({heading:z.enum(fontFamilies).optional(),body:z.enum(fontFamilies).optional(),caption:z.enum(fontFamilies).optional(),math:z.enum(fontFamilies).optional(),code:z.enum(fontFamilies).optional()}).strict()
export const paperPaletteId='paper-reference'
export const paperColors={ink:'#202020',neutral:'#e7e6e6',primary:'#bad9c8',memory:'#e4dbea',tokens:'#fff7df',target:'#4477cc',positive:'#4f8139',negative:'#e62626',band:'#f5f7fd'} as const
export const paperAlignmentGuide='默认对齐与居中：先确定行列基准和统一间距，再计算坐标；同一行按垂直中心对齐，同一列按水平中心对齐，重复卡片等尺寸、等间距。每个分区内的内容整体居中并保留对称边距。标题、正文、公式和注释默认水平居中，文字在所属框内垂直居中；图标与标题作为一个整体居中，不能把图标固定在左边再单独居中文字。Token 条带、槽位网格和内部图示在所属区域居中，直连箭头接边中点；分支按公共中轴对称安排。独立代码块或用户明确指定时才使用左对齐。保留数据坐标、既有手工排版、定位文字及素材内部几何。'
export const paperDesignGuide='默认论文插图：精确几何、无描边浅灰卡片、柔和语义色、黑色实心箭头。Inter 粗体标题与 Comic Neue 手写正文分工，数学和代码独立排版；手写字体不要求波浪边框。核心机制浅绿、记忆浅紫、token 浅黄、目标分组蓝色透明虚线，颜色沿对象身份保持。图标采用统一线性子集，小插画只用于具体主体；阶段底带与必要边界按含义保留。'+paperAlignmentGuide
export function defaultFigureStyle():FigureDocument['style']{return{preset:'precise',roughness:0,seed:38191,accent:'blue',paletteId:paperPaletteId,fontFamily:'Comic Neue',designSystem:'paper'}}
export const isPaperStyle=(style:FigureDocument['style'])=>style.designSystem==='paper'&&style.preset!=='sketch'
export function paperTextStyle(style:FigureDocument['style'],role:typeof textRoles[number]='body'):TextStyle{
  if(!isPaperStyle(style))return{}
  const families={heading:'Inter',body:style.fontFamily??'Comic Neue',caption:style.fontFamily??'Comic Neue',math:'Noto Serif SC',code:'JetBrains Mono'}
  return{family:style.fontRoles?.[role]??families[role],color:paperColors.ink,align:'center',...(role==='heading'?{bold:true}:{}),...(role==='caption'?{size:12}:{})}
}
export function paperVisual(role:typeof visualRoles[number]='neutral'):NonNullable<FigureNode['visual']>{
  const base={radius:10,padding:10,handDrawn:false,stroke:'none',fill:paperColors.neutral}
  switch(role){
    case'primary':return{...base,fill:paperColors.primary}
    case'memory':return{...base,fill:paperColors.memory}
    case'tokens':return{...base,fill:paperColors.tokens}
    case'target':return{...base,fill:'none',stroke:paperColors.target,strokeWidth:1.8,dash:[8,6],radius:14}
    case'positive':case'negative':return{...base,fill:'none',stroke:paperColors[role],strokeWidth:1.4,dash:[5,3]}
    case'band':return{...base,fill:paperColors.band,radius:0,padding:0}
    case'detail':return{...base,stroke:paperColors.ink,radius:3,padding:2}
    case'plain':return{...base,fill:'none',padding:0}
    default:return base
  }
}
/** Resolve defaults at render time; explicit author formatting always wins. */
export const paperRoleIndices:Partial<Record<typeof visualRoles[number],number>>={neutral:0,primary:1,memory:2,tokens:3}
export function paperNode(node:FigureNode,style:FigureDocument['style']):FigureNode{
  if(!isPaperStyle(style)||node.chart||node.reconstruction||node.textLayout)return node
  const bare=['path','port','text','icon','image'].includes(node.kind),visual=bare?{}:paperVisual(node.visual?.role??(['volume','projection','neuron','operator','tensor'].includes(node.kind)?'detail':'neutral'))
  if(!node.visual?.role||node.visual.role==='detail'||paperRoleIndices[node.visual.role]!==undefined)delete visual.fill
  return{...node,visual:{...(node.visual?.role&&paperRoleIndices[node.visual.role]!==undefined?{colorIndex:paperRoleIndices[node.visual.role]}:{}),...visual,...(bare&&node.visual?.role?paperVisual(node.visual.role):{}),...node.visual},textStyle:{...paperTextStyle(style,node.textRole??(node.structure||node.kind==='module'?'heading':'body')),...node.textStyle},descriptionStyle:{...paperTextStyle(style,'caption'),...node.descriptionStyle}}
}

/** Containers share the same role defaults as nodes, while grouping remains independent of a visible frame. */
export function paperContainer(container:FigureContainer,style:FigureDocument['style']):FigureContainer{
  if(!isPaperStyle(style)||container.dataChart||container.reconstruction)return container
  const role=container.visual?.role??'plain',visual=paperVisual(role),index=paperRoleIndices[role]
  if(index!==undefined)delete visual.fill
  return{...container,visual:{...(index!==undefined?{colorIndex:index}:{}),...visual,...container.visual},textStyle:{...paperTextStyle(style,'heading'),...container.textStyle}}
}
