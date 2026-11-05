import {paperColors,isPaperStyle} from '../core/paperStyle.ts'
import type {FigureDocument} from '../core/model.ts'

/** A semantic drawing vocabulary, not a claim that a palette or a green test proves beauty. */
export const scientificFigureDesign={
  priority:'先根据研究论点选择第一眼要看到的机制，再读输入、约束和局部解释。概览中的通用模型不能仅因是模型就比核心贡献更深更大；重复结构可挑一组代表路径强调，其余保持可比较。以轮廓、疏密和少量深色形成重点，不能让所有对象同等强调。',
  grouping:'默认以对齐、间距、短标题和局部括框分组；普通内容可用无描边浅灰卡片，阶段可用极浅底带；外框用于真实边界、状态空间或职责，避免重复套框。',
  alignment:'同一行按垂直中心对齐，同一列按水平中心对齐，重复模块等尺寸等间距；各分区的内容整体居中。标题、正文、公式、图标与标题的组合、token 条带和内部图示默认居中。按公共基准计算坐标，不逐个目测偏移；文字与箭头留出对称空白。',
  vocabulary:'表示用 token 条带／张量片层；可训练模型用一个清晰模块；算子用紧凑符号；编码／解码用收放轮廓；关系约束用矩阵。不同轮廓须对应真实语义，不为装饰虚构网络内部。',
  typography:'主标题简短，分区标题低于核心机制；正文少写整句，变量与操作分开。操作名靠近其实际路径的空白侧，先为线路与文字留位；不要只把操作名放在附近模块下方。符号定义集中一处，重复说明不能占用机制空间。小矩阵用短且一致的位置别名，解释集中在图例／图注；完整来源和省略信息放元数据，不塞满图体。先压缩模块间距和重复标注，再安排组合比例，避免靠整体缩小字形塞进版面。',
  color:'一种数据身份沿路径保持颜色；主模型可用少量深色，背景保持白色。辅助模型不必与核心模型同样深重。实线数据与虚线条件有明确区别；许可矩阵使用清楚的类别对比，不能装成数值热图。用户既定色义优先。',
  correspondence:'局部解释不必都做成放大框。需要逐对象对照时用真实快照；为解释输入、操作和输出而重排时，明确为示意解释，用一致的阶段名、符号和对应标记关联主图，不声称保留原图几何。局部输入不能只剩没有来源的箭头。对应引线过长或挤占主干时，先重新选择说明形式和位置，而非继续绕线。',
  review:['缩小到预期论文尺寸核对第一眼焦点与字形。','移除边框后若信息毫无损失，就不应保留边框。','路径不能穿字；条件线不能误读为参数迁移。','原生可编辑与关系正确只是底线，不是审美验收。'],
} as const

type VisualRole='representation'|'model'|'secondary-model'|'operation'|'decoder'|'condition'|'result'|'permission'|'permission-extra'|'blocked'
export function applyScientificPresentation(figure:FigureDocument,roles:Partial<Record<VisualRole,string[]>>,options:{keepBoundaries?:string[]}={}){
  const paper=isPaperStyle(figure.style)
  const ink=paper?paperColors.ink:'#263b50',muted='#657789',navy='#23445f',teal='#277c78',coral='#ba6a4f'
  for(const container of figure.containers)if(!options.keepBoundaries?.includes(container.id))container.visual={...container.visual,fill:'none',stroke:'none'}
  for(const node of figure.nodes){
    if(node.kind==='text')node.textStyle={...node.textStyle,color:ink,bold:node.id==='structure-title'||node.textStyle?.bold}
    if(node.path)node.visual={...node.visual,stroke:ink,strokeWidth:1.35}
  }
  for(const [role,ids]of Object.entries(roles))for(const id of ids){
    const node=figure.nodes.find(n=>n.id===id);if(!node)continue
    node.visual={...node.visual,padding:2,radius:3,strokeWidth:1.15}
    node.textRole=role==='model'||role==='secondary-model'?'heading':node.textRole
    node.textStyle={...node.textStyle,color:ink}
    if(role==='representation'){node.kind='volume';node.metricScale=Math.min(node.width/80,node.height/44,1);node.visual={...node.visual,fill:'#e2f0ed',stroke:teal};node.textStyle={...node.textStyle,size:15,italic:true}}
    if(role==='model'){node.visual={...node.visual,role:'primary',fill:paper?paperColors.primary:navy,stroke:paper?'none':navy};node.textStyle={...node.textStyle,color:paper?paperColors.ink:'#ffffff',size:12}}
    if(role==='secondary-model'){node.visual={...node.visual,role:'neutral',fill:paper?paperColors.neutral:'#f0f4f7',stroke:paper?'none':'#9cabb9'};node.textStyle={...node.textStyle,size:12}}
    if(role==='operation'){node.kind='ellipse';node.visual={...node.visual,fill:'#fff4e2',stroke:'#c18b3f'};node.textStyle={...node.textStyle,size:15,bold:true}}
    if(role==='decoder'){node.kind='projection';node.metricScale=Math.min(node.width/80,node.height/44,1);node.visual={...node.visual,fill:'#eef2f6',stroke:'#7c8d9d'};node.textStyle={...node.textStyle,size:13}}
    if(role==='condition'){node.visual={...node.visual,fill:'none',stroke:'none'};node.textStyle={...node.textStyle,color:coral,size:16,bold:true}}
    if(role==='result'){node.kind='text';node.visual={fill:'none',stroke:'none',padding:0};node.textStyle={...node.textStyle,size:14,color:ink}}
    if(role==='permission'||role==='permission-extra'||role==='blocked')node.visual={...node.visual,radius:0,fill:role==='permission'?'#beded6':role==='permission-extra'?'#718fb0':'#f1f3f6',stroke:'#ffffff',strokeWidth:.9}
  }
  for(const node of figure.nodes){
    if(node.id.endsWith('-heading'))node.textStyle={...node.textStyle,size:Math.min(node.textStyle?.size??15,15),align:paper?'center':'left',bold:true}
    if(node.id==='context-heading')node.textStyle={...node.textStyle,size:11,bold:false,align:'center',color:muted}
    if(node.id.startsWith('condition-input-')||node.id==='conditioning-rail')node.visual={...node.visual,stroke:coral,strokeWidth:1.05,dash:[3,4]}
    if(node.id==='structure-title')node.textStyle={...node.textStyle,size:18,align:paper?'center':'left',bold:true}
    if(node.id==='structure-note')node.textStyle={...node.textStyle,size:10,color:muted}
  }
  return figure
}
