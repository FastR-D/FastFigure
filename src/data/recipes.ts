import { z } from 'zod'
import { parseAsset, type ComponentAsset } from '../core/assets.ts'
import { createBlank, type FigureNode, type NodeKind } from '../core/model.ts'
import {tensorStackFigure,tensorStackParametersSchema} from './tensorStack.ts'
import {scaledAttentionFigure,scaledAttentionParametersSchema} from './scaledAttention.ts'
import {patchEmbeddingFigure,patchEmbeddingParametersSchema} from './patchEmbedding.ts'
import {structuralFigure,structuralParametersSchemas,structuralRecipeIds,isStructuralRecipe} from './structuralFigures.ts'
import {structuralSources} from './structuralSources.ts'

export const recipeIds=['mlp','fusion','pipeline','tensor-stack','scaled-attention','patch-embedding',...structuralRecipeIds] as const

interface RecipeField {
  key: string; label: string; options: { value: string; label: string }[]
  when?:{key:string;values:string[]}
}
export interface ComponentRecipe {
  id: typeof recipeIds[number]; name: string; description: string; category: 'model' | 'system' | 'structure'; tags: string[]
  defaults: Record<string, string | number>; fields: RecipeField[]
}
const counts = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, i) => ({ value: String(min + i), label: String(min + i) }))
const layerGaps=[32,48,64,80,104,120],neuronGaps=[12,24,40,56,64]
const gapOptions=(values:number[])=>values.map(value=>({value:String(value),label:String(value)}))
export const recipeFieldValue=(field:RecipeField,parameters:Record<string,string|number>)=>parameters[field.key]??field.options[0]!.value
export const visibleRecipeFields=(recipe:Pick<ComponentRecipe,'fields'>,parameters:Record<string,string|number>)=>recipe.fields.filter(field=>!field.when||field.when.values.includes(String(parameters[field.when.key])))
export const componentRecipes: ComponentRecipe[] = [
  {id:'mixed-modal-mask',name:'混合序列分块注意力掩码',description:'参考 ICLR 2025 Transfusion／Show-o：文本因果读取，同一图像块内部双向读取；序列条带与 query/key 权限矩阵保持身份对应。支持文本→图像、图像→文本、交错和纯文本；颜色仅表示许可。',category:'structure',tags:['Transfusion','Show-o','ICLR 2025','Attention mask','近期','已录用','多模态','混合序列','分块','注意力掩码','矩阵','主图'],defaults:{format:'text-image',textTokens:2,imageTokens:3},fields:[{key:'format',label:'示意序列格式',options:[{value:'text-image',label:'文本 → 图像位置'},{value:'image-text',label:'图像位置 → 文本'},{value:'interleaved',label:'文本／图像交错两段'},{value:'text-only',label:'仅文本'}]},{key:'textTokens',label:'每段示意文本位置数',options:counts(1,3)},{key:'imageTokens',label:'每段示意图像位置数',options:counts(2,3),when:{key:'format',values:['text-image','image-text','interleaved']}}]},
  {id:'conditioned-denoising',name:'条件去噪与采样时间展开',description:'参考 ICLR 2025 Transfusion：连续潜变量、共享噪声预测器、独立采样器及固定上下文，最后才 VAE 解码。示意区间可调，噪声预测不直接等于下一状态；非离散 mask token 替换。',category:'structure',tags:['Transfusion','ICLR 2025','Diffusion','Denoising','近期','已录用','扩散','去噪','采样','时间展开','条件生成','主图'],defaults:{steps:3},fields:[{key:'steps',label:'示意采样区间数',options:counts(2,4)}]},
  {id:'streaming-memory',name:'时序记忆读取与后续写入',description:'参考 ICLR 2025 SAM 2：当前帧计算、可选提示、历史记忆读取与后续状态写入分区编排；记忆编码器同时接收预测掩码和原图特征。仅前向流式抽象，非完整 SAM 2。',category:'structure',tags:['SAM 2','ICLR 2025','Streaming memory','Temporal','时序','记忆库','视频','读写','交互提示','主图'],defaults:{memories:3,prompt:'show'},fields:[{key:'memories',label:'示意历史槽位数',options:counts(2,4)},{key:'prompt',label:'当前帧提示',options:[{value:'show',label:'显示提示编码支路'},{value:'hide',label:'仅依赖历史记忆'}]}]},
  {id:'alternating-view-attention',name:'跨视图与逐视图交替注意力',description:'参考 CVPR 2025 VGGT：多视图 token 行、跨视图共享注意力、逐视图注意力与重复块，接相机及稠密输出头；跟踪特征另与查询点进入跟踪模块。视图数和 L 仅示意。',category:'structure',tags:['VGGT','CVPR 2025','Multi-view','Global frame attention','多视图','交替注意力','多任务','相机','几何','主图'],defaults:{views:3},fields:[{key:'views',label:'示意视图数',options:counts(2,4)}]},
  {id:'distillation-stages',name:'蒸馏训练与学生推理',description:'固定教师与可训练学生的软目标蒸馏，可选硬目标；同温度 T 与 T²／λ 符号目标明确。训练后只迁移学生参数，推理无教师或损失，不生成概率或性能。',category:'structure',tags:['Distillation','Teacher student','Training inference','知识蒸馏','教师学生','训练','推理','参数迁移'],defaults:{hardTargets:'show'},fields:[{key:'hardTargets',label:'训练硬目标',options:[{value:'show',label:'软目标 + 硬标签'},{value:'hide',label:'仅软目标'}]}]},
  {id:'masked-autoencoding',name:'掩码预训练与编码器迁移',description:'MAE 式可见块编码、编码后加入 mask token／位置并恢复顺序、仅掩码位置重建损失；下游迁移编码器并接收全体块，无预训练解码器。网格和掩码模式仅示意。',category:'structure',tags:['MAE','Masked autoencoder','Pretraining','Transfer','掩码','自监督','预训练','编码器迁移','重建'],defaults:{grid:3,visible:'few'},fields:[{key:'grid',label:'示意网格边长',options:counts(2,4)},{key:'visible',label:'示意可见数量',options:[{value:'few',label:'较少可见块'},{value:'half',label:'约一半可见块'}]}]},
  {id:'graph-message-passing',name:'邻域消息传递',description:'局部邻域与消息函数展开对应，消息求和后结合旧状态更新目标节点。明确一次局部更新，无全图读出、注意力、虚构边特征或分子观测。',category:'structure',tags:['MPNN','GNN','Message passing','Graph','图神经网络','邻域','消息传递','聚合'],defaults:{neighbors:3},fields:[{key:'neighbors',label:'示意邻居数',options:counts(2,5)}]},
  {id:'top1-expert-routing',name:'Top-1 专家路由',description:'单 token、Softmax 路由、显式选择一位专家及门控加权；实线表示实际示意路径，虚线区分路由选择和权重。专家数及选中编号可调，不计算真实门控或容量。',category:'structure',tags:['MoE','Switch','Top-1','Experts','Router','专家','混合专家','条件计算','路由'],defaults:{experts:4,activeExpert:2},fields:[{key:'experts',label:'示意专家数',options:counts(2,5)},{key:'activeExpert',label:'选中专家编号（示意）',options:counts(1,5)}]},
  {id:'unet-encoder-decoder',name:'U 形编解码与拼接跳连',description:'U-Net 式收缩／扩展与共享瓶颈，跨层 copy/crop 后拼接 C；池化、上卷积和 1×1 输出各自明确。阶段概括两次卷积与 ReLU，尺度数可变，不推断通道、像素尺寸或结果。',category:'structure',tags:['U-Net','UNet','Encoder decoder','Skip connections','编解码','跳连','拼接','多尺度','分割'],defaults:{levels:5},fields:[{key:'levels',label:'示意尺度数（含瓶颈）',options:counts(3,5)}]},
  {id:'residual-block',name:'残差与瓶颈块',description:'相加后激活的 ResNet 式基础／瓶颈块，主分支与恒等或投影捷径分别可编辑。卷积后含 BN，仅中间卷积紧跟 ReLU；不混同拼接或 pre-activation 版本。',category:'structure',tags:['ResNet','Residual','Bottleneck','Identity','残差','瓶颈','捷径','跳连','相加'],defaults:{block:'basic',shortcut:'identity'},fields:[{key:'block',label:'残差主分支',options:[{value:'basic',label:'基础块 · 3×3 / 3×3'},{value:'bottleneck',label:'瓶颈块 · 1×1 / 3×3 / 1×1'}]},{key:'shortcut',label:'捷径分支',options:[{value:'identity',label:'恒等 · 尺寸兼容'},{value:'projection',label:'1×1 投影 · 对齐尺寸'}]}]},
  {id:'feature-pyramid',name:'多尺度特征金字塔',description:'FPN 的自底向上特征、1×1 横向投影、2× 上采样与逐层相加，再经 3×3 输出多尺度特征；层数为示意变体，无检测头和虚构维度。',category:'structure',tags:['FPN','Feature pyramid','多尺度','横向融合','金字塔','Top-down'],defaults:{levels:4},fields:[{key:'levels',label:'示意尺度数',options:counts(3,5)}]},
  {id:'dual-encoder-alignment',name:'双编码器配对对齐',description:'CLIP 式两路编码器、独立嵌入和配对矩阵，可选双向对比目标。对角高亮表示正配对身份，不表示观测相似度；不含零样本分类阶段。',category:'structure',tags:['CLIP','Dual encoder','Contrastive','双编码器','对比学习','配对','对齐矩阵'],defaults:{pairs:4,objective:'symmetric'},fields:[{key:'pairs',label:'示意配对数',options:counts(3,5)},{key:'objective',label:'目标说明',options:[{value:'symmetric',label:'行列双向对比目标'},{value:'alignment-only',label:'仅展示配对结构'}]}]},
  {id:'layered-architecture',name:'分层架构',description:'用嵌套分区组织多层模块，可加跨层共享区域。层次位置表示包含与职责，不自动生成执行箭头。',category:'structure',tags:['Architecture','Layered','系统架构','分层','包含','主图'],defaults:{layers:3,modules:3,shared:'show'},fields:[
    {key:'layers',label:'架构层数',options:counts(2,5)},{key:'modules',label:'每层模块数',options:counts(2,4)},{key:'shared',label:'跨层共享区域',options:[{value:'show',label:'显示'},{value:'hide',label:'隐藏'}]},
  ]},
  {id:'hierarchy-tree',name:'层级树',description:'根、分支和叶子以无箭头折线表达从属。各分支可使用默认数量，或分别设 0–3 个叶子；支持不均衡分支及横向／纵向展开。',category:'structure',tags:['Hierarchy','Tree','层级','树状','组织架构','不均衡','分类'],defaults:{branches:3,leaves:2,direction:'down'},fields:[
    {key:'branches',label:'一级分支数',options:counts(2,4)},{key:'leaves',label:'默认叶节点数',options:counts(1,3)},{key:'direction',label:'层级展开方向',options:[{value:'down',label:'从上到下'},{value:'right',label:'从左到右'}]},
    ...[1,2,3,4].map(i=>({key:`branch${i}Leaves`,label:`分支 ${i} 叶节点数`,options:[{value:'inherit',label:'使用默认数量'},{value:'0',label:'0 · 无叶节点'},...counts(1,3)],when:{key:'branches',values:counts(Math.max(2,i),4).map(option=>option.value)}})),
  ]},
  {id:'radial-hub',name:'中心辐射',description:'中心与周边单元的关系图，默认无向，可明确选择向外或向内。中心、周边节点和绑定线分别可编辑。',category:'structure',tags:['Radial','Hub','辐射','放射','中心','关系'],defaults:{items:6,relation:'none'},fields:[
    {key:'items',label:'周边单元数',options:counts(3,8)},{key:'relation',label:'辐射关系方向',options:[{value:'none',label:'无向关系'},{value:'outward',label:'由中心向外'},{value:'inward',label:'由周边向内'}]},
  ]},
  {id:'cycle-loop',name:'循环闭环',description:'阶段围绕中心排列，以可编辑贝塞尔弧线连接并闭合，可选顺时针或逆时针。适用于迭代、反馈与优化过程。',category:'structure',tags:['Cycle','Loop','循环','闭环','反馈','迭代'],defaults:{items:4,direction:'clockwise'},fields:[
    {key:'items',label:'循环阶段数',options:counts(3,8)},{key:'direction',label:'循环方向',options:[{value:'clockwise',label:'顺时针'},{value:'counterclockwise',label:'逆时针'}]},
  ]},
  {id:'structure-matrix',name:'结构矩阵',description:'行列标题与单元分别可编辑，用于类别、职责和模块对照。单元没有预设数值或强弱含义；实验数值请使用热图。',category:'structure',tags:['Matrix','结构矩阵','行列','对照','分类','模块'],defaults:{rows:3,columns:3,headers:'show'},fields:[
    {key:'rows',label:'结构行数',options:counts(2,4)},{key:'columns',label:'结构列数',options:counts(2,4)},{key:'headers',label:'行列标题',options:[{value:'show',label:'显示'},{value:'hide',label:'隐藏'}]},
  ]},
  {id:'tiered-pyramid',name:'金字塔与漏斗',description:'用独立梯形／三角形分层，支持金字塔和漏斗轮廓，层级与旁注可独立改字。宽度仅作结构示意，不表示比例或转化率。',category:'structure',tags:['Pyramid','Funnel','金字塔','漏斗','层次','筛选'],defaults:{levels:4,profile:'pyramid'},fields:[
    {key:'levels',label:'结构层数',options:counts(2,5)},{key:'profile',label:'分层轮廓',options:[{value:'pyramid',label:'金字塔'},{value:'funnel',label:'漏斗'}]},
  ]},
  {id:'coupled-cycles',name:'耦合双循环',description:'两个闭环共享一个状态节点，两侧阶段数分别可调，右环方向可独立选择。节点和返回弧线独立可编辑，表达双过程之间的耦合。',category:'structure',tags:['Coupled cycles','Dual loop','双环','双循环','耦合','闭环','反馈'],defaults:{leftStages:3,rightStages:3,rightDirection:'counterclockwise'},fields:[
    {key:'leftStages',label:'左环阶段数',options:counts(2,5)},{key:'rightStages',label:'右环阶段数',options:counts(2,5)},{key:'rightDirection',label:'右环方向',options:[{value:'clockwise',label:'顺时针'},{value:'counterclockwise',label:'逆时针'}]},
  ]},
  {id:'swimlane-process',name:'泳道协作',description:'以嵌套泳道表达任务归属。可选独立序列，或沿交替方向串接明确的跨道交接；不会从泳道位置推断真实并发。',category:'structure',tags:['Swimlane','Ownership','泳道','协作','职责','跨区','交接'],defaults:{lanes:3,stages:3,flow:'handoff'},fields:[
    {key:'lanes',label:'泳道数量',options:counts(2,4)},{key:'stages',label:'每道任务数',options:counts(2,4)},{key:'flow',label:'泳道连接方式',options:[{value:'parallel',label:'各道独立序列'},{value:'handoff',label:'跨道交接序列'}]},
  ]},
  {id:'set-overlap',name:'集合交叠',description:'用两个或三个半透明圆表达共同成员与交叠关系，集合名称独立可编辑。面积、距离和交叠宽度仅示意，不表示样本数或相似度。',category:'structure',tags:['Venn','Set overlap','韦恩','维恩','集合','交集','交叠'],defaults:{sets:3,overlap:'broad'},fields:[
    {key:'sets',label:'集合数量',options:counts(2,3)},{key:'overlap',label:'交叠范围',options:[{value:'narrow',label:'较窄交叠'},{value:'broad',label:'较宽交叠'}]},
  ]},
  {id:'concentric-layers',name:'同心圈层',description:'独立环带围绕核心表达层次与上下文。环带使用带孔原生路径，标签和核心分别可编辑；环宽不编码数值。',category:'structure',tags:['Concentric','Annulus','同心圆','圈层','环带','核心','包含'],defaults:{layers:3,labels:'show'},fields:[
    {key:'layers',label:'环带层数',options:counts(2,5)},{key:'labels',label:'环带标签',options:[{value:'show',label:'显示'},{value:'hide',label:'隐藏'}]},
  ]},
  { id: 'mlp', name: '全连接网络', description: '按层排列神经元，生成相邻层的全连接。', category: 'model', tags: ['MLP', '神经网络'],
    defaults: { inputs: 2, hiddenLayers: 1, hidden: 3, outputs: 2,layerGap:80,neuronGap:24 }, fields: [
      { key: 'inputs', label: '输入神经元', options: counts(2, 4) }, { key: 'hiddenLayers', label: '隐藏层数', options: counts(1, 3) },
      { key: 'hidden', label: '每层隐藏神经元', options: counts(2, 4) }, { key: 'outputs', label: '输出神经元', options: counts(1, 3) },
      {key:'layerGap',label:'层间距',options:gapOptions(layerGaps)},{key:'neuronGap',label:'神经元间距',options:gapOptions(neuronGaps)},
    ] },
  { id: 'fusion', name: '多分支特征融合', description: '组合特征分支、融合算子与输出特征。', category: 'model', tags: ['Fusion', 'CNN', '特征融合'],
    defaults: { branches: 3, operator: 'concat', feature: 'volume' }, fields: [
      { key: 'branches', label: '特征分支数', options: counts(2, 4) },
      { key: 'operator', label: '融合方式', options: [{ value: 'concat', label: '拼接 C' }, { value: 'sum', label: '求和 +' }] },
      { key: 'feature', label: '特征表示', options: [{ value: 'volume', label: '三维特征体' }, { value: 'tensor', label: '层叠张量' }] },
    ] },
  { id: 'pipeline', name: '处理流水线', description: '按阶段生成可独立命名的处理模块。', category: 'system', tags: ['Pipeline', '系统架构'],
    defaults: { stages: 4, direction: 'row' }, fields: [
      { key: 'stages', label: '处理阶段数', options: counts(2, 5) },
      { key: 'direction', label: '排列方向', options: [{ value: 'row', label: '从左到右' }, { value: 'column', label: '从上到下' }] },
    ] },
  {id:'tensor-stack',name:'透视张量栈',description:'独立片层与网格路径，可改片数、示意网格、间隔和倾斜；计数是视觉示意，不表示实验数据或真实张量维度。',category:'model',tags:['Tensor','Embeddings','Feature maps','张量','叠片','网格'],defaults:{layers:5,rows:4,columns:5,spacing:'normal',tilt:'steep',note:'show'},fields:[
    {key:'layers',label:'示意片层数',options:counts(1,8)},{key:'rows',label:'示意网格行数',options:counts(2,8)},{key:'columns',label:'示意网格列数',options:counts(2,8)},
    {key:'spacing',label:'片层间隔',options:[{value:'compact',label:'紧凑'},{value:'normal',label:'标准'},{value:'loose',label:'疏朗'}]},{key:'tilt',label:'倾斜幅度',options:[{value:'flat',label:'平面'},{value:'mild',label:'轻微'},{value:'steep',label:'明显'}]},{key:'note',label:'示意说明',options:[{value:'show',label:'显示 Schematic grid'},{value:'hide',label:'隐藏'}]},
  ]},
  {id:'scaled-attention',name:'缩放点积注意力',description:'单头 Q / Kᵀ / V 矩阵、缩放、Softmax 与加权输出。可选同序列因果掩码；网格仅示意，不提供真实权重或推断张量维度。输入键已转置，不包含投影、多头或残差。',category:'model',tags:['Attention','Transformer','QKV','Softmax','注意力','矩阵','因果掩码'],defaults:{tokens:4,channels:4,mask:'none',details:'show'},fields:[
    {key:'tokens',label:'示意序列格数',options:counts(3,6)},{key:'channels',label:'示意通道格数',options:counts(2,5)},
    {key:'mask',label:'注意力掩码',options:[{value:'none',label:'无掩码'},{value:'causal',label:'同序列因果掩码'}]},
    {key:'details',label:'符号维度',options:[{value:'show',label:'显示符号维度'},{value:'hide',label:'隐藏符号维度'}]},
  ]},
  {id:'patch-embedding',name:'图像分块与嵌入',description:'ViT 编码器之前的图像分块、展平、共享线性投影、可选分类 token 和可学习位置嵌入。独立原生图元；格数与向量单元仅示意，不推断图像大小或特征维度，不含编码器及分类头。',category:'model',tags:['ViT','Patch embedding','图像分块','嵌入','CLS','Position embedding','视觉 Transformer'],defaults:{grid:3,classToken:'show',position:'learned',details:'show'},fields:[
    {key:'grid',label:'示意分块格数',options:[{value:'2',label:'2 × 2'},{value:'3',label:'3 × 3'},{value:'4',label:'4 × 4'}]},
    {key:'classToken',label:'分类 token',options:[{value:'show',label:'添加可学习 CLS'},{value:'hide',label:'不添加 CLS'}]},
    {key:'position',label:'位置嵌入',options:[{value:'learned',label:'可学习位置嵌入'},{value:'none',label:'不添加位置嵌入'}]},
    {key:'details',label:'符号维度',options:[{value:'show',label:'显示符号维度'},{value:'hide',label:'隐藏符号维度'}]},
  ]},
]
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max)
const gap=(values:number[],fallback:number)=>z.coerce.number().int().refine(n=>values.includes(n),'请选择支持的间距').default(fallback)
const parametersSchema = z.discriminatedUnion('id', [
  ...structuralParametersSchemas,
  tensorStackParametersSchema,
  scaledAttentionParametersSchema,
  patchEmbeddingParametersSchema,
  z.object({ id: z.literal('mlp'), inputs: int(2, 4), hiddenLayers: int(1, 3), hidden: int(2, 4), outputs: int(1, 3),layerGap:gap(layerGaps,80),neuronGap:gap(neuronGaps,24) }),
  z.object({ id: z.literal('fusion'), branches: int(2, 4), operator: z.enum(['concat', 'sum']), feature: z.enum(['volume', 'tensor']) }),
  z.object({ id: z.literal('pipeline'), stages: int(2, 5), direction: z.enum(['row', 'column']) }),
])
const fixedDate = '2026-10-28T00:00:00.000Z'
export function buildRecipe(id: string, input: Record<string, string | number>): ComponentAsset {
  const normalized={...input}
  for(const field of componentRecipes.find(recipe=>recipe.id===id)?.fields??[])if(field.options[0]?.value==='inherit'&&normalized[field.key]==='inherit')delete normalized[field.key]
  const p = parametersSchema.parse({ ...normalized, id }), recipe = componentRecipes.find(r => r.id === p.id)!
  const figure = p.id==='tensor-stack'?tensorStackFigure(p):p.id==='scaled-attention'?scaledAttentionFigure(p):p.id==='patch-embedding'?patchEmbeddingFigure(p):p.id==='mlp'||p.id==='fusion'||p.id==='pipeline'?createBlank():structuralFigure(p), root = figure.containers[0]!
  root.x = 0; root.y = 0; root.title = recipe.name; figure.title = recipe.name
  function node(nodeId: string, kind: NodeKind, label: string, x: number, y: number, width: number, height: number): FigureNode {
    const n = { id: nodeId, parentId: 'stage', kind, label, x, y, width, height }; figure.nodes.push(n); return n
  }
  function edge(a: FigureNode, b: FigureNode, vertical = false) {
    figure.edges.push({ id: `e-${a.id}-${b.id}`, source: a.id, target: b.id, sourcePort: vertical ? 'bottom' : 'right', targetPort: vertical ? 'top' : 'left' })
  }
  if (p.id === 'mlp') {
    const layers = [p.inputs, ...Array<number>(p.hiddenLayers).fill(p.hidden), p.outputs], max = Math.max(...layers)
    root.width = 48 + layers.length * 80 + (layers.length - 1) * p.layerGap
    root.height = 68 + max * 80 + (max - 1) * p.neuronGap
    const columns = layers.map((count, col) => Array.from({ length: count }, (_, row) => node(`neuron-${col}-${row}`, 'neuron',
      col === 0 ? `x${row + 1}` : col === layers.length - 1 ? `y${row + 1}` : `h${col},${row + 1}`,
      24 + col * (80+p.layerGap), 48 + (root.height - 68 - (count * 80 + (count - 1) * p.neuronGap)) / 2 + row * (80+p.neuronGap), 80, 80)))
    for (let col = 1; col < columns.length; col++) for (const a of columns[col - 1]!) for (const b of columns[col]!) {edge(a,b);figure.edges.at(-1)!.routing='straight'}
  } else if (p.id === 'fusion') {
    root.width = 536; root.height = 68 + p.branches * 66 + (p.branches - 1) * 20
    const cy = 48 + (root.height - 68) / 2
    const inputs = Array.from({ length: p.branches }, (_, i) => node(`branch-${i}`, p.feature, `Feature ${i + 1}`, 24, 48 + i * 86, 130, 66))
    const op = node('fusion', 'operator', p.operator === 'sum' ? '+' : 'C', 226, cy - 40, 80, 80)
    const output = node('output', p.feature, 'Fused feature', 382, cy - 33, 130, 66)
    inputs.forEach(n => edge(n, op)); edge(op, output)
  } else if(p.id==='pipeline') {
    const vertical = p.direction === 'column'
    root.width = vertical ? 224 : 48 + p.stages * 120 + (p.stages - 1) * 30
    root.height = vertical ? 68 + p.stages * 52 + (p.stages - 1) * 20 : 160
    const stages = Array.from({ length: p.stages }, (_, i) => node(`step-${i}`, 'module', `Stage ${i + 1}`, vertical ? 52 : 24 + i * 150, vertical ? 48 + i * 72 : 64, 120, vertical ? 52 : 60))
    for (let i = 1; i < stages.length; i++) edge(stages[i - 1]!, stages[i]!, vertical)
  }
  const { id: recipeId, ...parameters } = p
  const sources = isStructuralRecipe(recipeId)?structuralSources[recipeId]:recipeId==='patch-embedding'?[{title:'An Image is Worth 16x16 Words · §3.1 / Eq. 1',reference:'https://arxiv.org/html/2010.11929v2#S3.SS1 · 依据分块、共享投影、分类 token 与位置嵌入关系独立构造，不描摹原图。格数不是图像尺寸或 N/D，假设 H/W 可被 P 整除；不含编码器和分类头。关闭 CLS 或位置嵌入是显式变体。'}]:recipeId==='scaled-attention'?[{title:'Attention Is All You Need · §3.2.1 / §3.2.3',reference:'https://arxiv.org/html/1706.03762v7 · 参考缩放点积与 Softmax 前的因果掩码关系，独立构造原生几何，并非原图描摹。单头；输入 Kᵀ 已转置；网格不代表观测或实际维度。'}]:recipeId === 'mlp'
    ? [{ title: '用户提供的 ML 绘图素材', reference: 'Google Slides，第 47 页神经网络结构；按层次关系重新参数化。https://docs.google.com/presentation/d/11mR1nkIR9fbHegFkcFq8z9oDQ5sjv8E3JJp1LfLGKuk/edit#slide=id.g78327f1586_217_712' }]
    : recipeId === 'fusion' ? [{ title: '模板合集20260627.pptx', reference: '第 15、18、22 页：特征体与圆形融合算子；重新构建组合结构。' }] : recipeId==='tensor-stack'?[{title:'FastFigure 程序化科研图示',reference:'独立构造的透视片层与网格。片层数、网格行列与倾斜均为视觉示意，不代表观测、张量维度或实验结果。'}]:[]
  const date=isStructuralRecipe(recipeId)?'2026-10-31T00:00:00.000Z':recipeId==='patch-embedding'?'2026-10-30T00:00:00.000Z':fixedDate
  root.parametric={version:1,recipe:{id,version:1,parameters},revision:0,objects:Object.fromEntries([...figure.containers,...figure.nodes,...figure.edges].map(object=>[object.id,object.id]))}
  return parseAsset({ format: 'fastfigure.component', version: 1, id: `builtin-${id}`, name: recipe.name, description: recipe.description,
    tags: recipe.tags, createdAt: date, updatedAt: date, sources, lineage: [], recipe: { id, version: 1, parameters }, figure })
}
