import {figureDesignPolicy,defaultStyleGuide} from './figureDesignPolicy.ts'
import {fontFamilySchema} from './fontFamily.ts'
import {paperThemeDefaults} from './paperThemeTokens.ts'
import {z} from 'zod'
import type {FigureContainer,FigureDocument,FigureNode,TextStyle} from './model.ts'

export const visualRoles=['neutral','primary','memory','tokens','target','positive','negative','band','plain','detail','perception','planning','execution'] as const
export const textRoles=['heading','body','caption','math','code'] as const
export const visualRoleLabels={neutral:'普通卡片',primary:'核心机制',memory:'记忆与存储',tokens:'Token 表示',target:'目标分组',positive:'正向结论',negative:'问题结论',band:'阶段底带',plain:'无框内容',detail:'内部结构图示',perception:'感知阶段',planning:'规划阶段',execution:'执行阶段'} as const
export const textRoleLabels={heading:'模块标题',body:'正文',caption:'次级注释',math:'数学符号',code:'代码'} as const
export const fontRolesSchema=z.object({heading:fontFamilySchema.optional(),body:fontFamilySchema.optional(),caption:fontFamilySchema.optional(),math:fontFamilySchema.optional(),code:fontFamilySchema.optional()}).strict()
export const paperPaletteId='paper-reference'
export const paperColors={ink:'#202020',neutral:'#f3f4f0',primary:'#e7efd9',memory:'#e3eef8',tokens:'#fae7dc',target:'#4477cc',positive:'#4f8139',negative:'#e62626',band:'#f5f7fd'} as const
export const paperAlignmentGuide=figureDesignPolicy.alignment
export const paperDesignGuide='论文主题定义字体层级和轮廓：柔和论文使用 MiSans、细描边与克制圆角；暖色叙事使用衬线标题与内嵌标题签；轻手绘使用 Comic Neue 与轻微单线起伏。选择轮廓不等于给所有对象加框。使用感知、规划、执行角色时可分别用浅绿、浅蓝、浅杏，同一机制在总览和局部保持身份色；不能为套用色槽补出阶段。普通内容近白或无框，明确阶段可用浅底；默认不用装饰渐变和大阴影。1000×620 基准中模块标题18–19、正文16–17、注释12–13，阶段标题20–21，模块内边距10–12；整体缩放时一起缩放，已有手工字号保持。不能为塞入文字任意缩小字号；空间不足时调整布局或报告。'+paperAlignmentGuide+defaultStyleGuide

export function defaultFigureStyle():FigureDocument['style']{return{preset:'precise',roughness:0,seed:38191,accent:'blue',paletteId:paperPaletteId,fontFamily:'MiSans',designSystem:'paper',paperTheme:{...paperThemeDefaults.soft}}}
export const isPaperStyle=(style:FigureDocument['style'])=>style.designSystem==='paper'&&style.preset!=='sketch'
export function paperTextStyle(style:FigureDocument['style'],role:typeof textRoles[number]='body'):TextStyle{
  if(!isPaperStyle(style))return{}
  const tokens=style.paperTheme??paperThemeDefaults.soft,hand=tokens.variant==='handdrawn',body=style.fontFamily??(hand?'Comic Neue':'MiSans')
  const families={heading:tokens.variant==='warm'?'Noto Serif SC':hand?'Comic Neue':'MiSans',body,caption:body,math:'Noto Serif SC',code:'JetBrains Mono'}
  return{family:style.fontRoles?.[role]??families[role],color:tokens.ink,align:'center',size:role==='heading'?tokens.headingSize:role==='caption'?tokens.captionSize:tokens.bodySize,...(role==='heading'?{bold:true}:{})}
}
export function paperVisual(role:typeof visualRoles[number]='neutral',style?:FigureDocument['style']):NonNullable<FigureNode['visual']>{
  const tokens=style?.paperTheme??paperThemeDefaults.soft
  const base={radius:tokens.radius,padding:tokens.padding,handDrawn:tokens.outline==='gentle',stroke:tokens.ink,strokeWidth:tokens.strokeWidth,fill:paperColors.neutral}
  switch(role){
    case'perception':case'primary':return{...base,fill:paperColors.primary}
    case'planning':case'memory':return{...base,fill:paperColors.memory}
    case'execution':case'tokens':return{...base,fill:paperColors.tokens}
    case'target':return{...base,fill:'none',stroke:paperColors.target,strokeWidth:1.8,dash:[8,6],radius:14}
    case'positive':case'negative':return{...base,fill:'none',stroke:paperColors[role],strokeWidth:1.4,dash:[5,3]}
    case'band':return{...base,stroke:'none',fill:paperColors.band,radius:0,padding:0}
    case'detail':return{...base,stroke:tokens.ink,radius:3,padding:2}
    case'plain':return{...base,fill:'none',stroke:'none',padding:0,handDrawn:false}
    default:return base
  }
}
/** Resolve defaults at render time; explicit author formatting always wins. */
export const paperRoleIndices:Partial<Record<typeof visualRoles[number],number>>={neutral:0,primary:1,memory:2,tokens:3,perception:1,planning:2,execution:3}
export function paperNode(node:FigureNode,style:FigureDocument['style']):FigureNode{
  if(!isPaperStyle(style)||node.chart||node.reconstruction||node.textLayout)return node
  const bare=['path','port','text','icon','image'].includes(node.kind),visual=bare?{}:paperVisual(node.visual?.role??(['volume','projection','neuron','operator','tensor'].includes(node.kind)?'detail':'neutral'),style)
  if(!node.visual?.role||node.visual.role==='detail'||paperRoleIndices[node.visual.role]!==undefined)delete visual.fill
  return{...node,visual:{...(node.visual?.role&&paperRoleIndices[node.visual.role]!==undefined?{colorIndex:paperRoleIndices[node.visual.role]}:{}),...visual,...(bare&&node.visual?.role?paperVisual(node.visual.role,style):{}),...node.visual},textStyle:{...paperTextStyle(style,node.textRole??(node.structure||node.kind==='module'?'heading':'body')),...(node.titleBlock?{size:(style.paperTheme??paperThemeDefaults.soft).containerHeadingSize}:{}),...node.textStyle},descriptionStyle:{...paperTextStyle(style,'caption'),...node.descriptionStyle}}
}

/** Containers share the same role defaults as nodes, while grouping remains independent of a visible frame. */
export function paperContainer(container:FigureContainer,style:FigureDocument['style']):FigureContainer{
  if(!isPaperStyle(style)||container.dataChart||container.reconstruction)return container
  const role=container.visual?.role??'plain',visual=paperVisual(role,style),index=paperRoleIndices[role]
  const tokens=style.paperTheme??paperThemeDefaults.soft
  visual.radius=tokens.containerRadius
  if(tokens.variant==='warm')visual.stroke='none'
  if(index!==undefined)delete visual.fill
  return{...container,visual:{...(index!==undefined?{colorIndex:index}:{}),...visual,...container.visual},textStyle:{...paperTextStyle(style,'heading'),size:(style.paperTheme??paperThemeDefaults.soft).containerHeadingSize,...container.textStyle}}
}
