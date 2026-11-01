import type { FigureNode, NodeKind } from '../core/model.ts'
import type { NodeStructure } from '../core/structures.ts'

export interface ComponentSeed {
  id: string; kind: NodeKind; label: string; name: string; category: string; note: string
  visual?: { radius?: number }
  structure?: NodeStructure
  path?:FigureNode['path']
  reference?: { source: 'local-template' | 'ml-visuals'; description: string }
}
export const componentSeeds: ComponentSeed[] = [
  { id:'shape-rect', kind:'rectangle', label:'', name:'矩形', category:'basic', note:'基础形状 · 可自由设色' },
  { id:'shape-rounded', kind:'rectangle', label:'', name:'圆角矩形', category:'basic', note:'基础形状 · 圆角', visual:{radius:10} },
  { id:'shape-circle', kind:'ellipse', label:'', name:'圆形', category:'basic', note:'圆 / 椭圆' },
  { id:'shape-diamond', kind:'diamond', label:'', name:'菱形', category:'basic', note:'决策 / 分支' },
  { id:'shape-text', kind:'text', label:'双击编辑注释', name:'文字与注释', category:'basic', note:'无框文字 · 独立说明' },
  {id:'shape-line',kind:'path',label:'直线',name:'直线',category:'basic',note:'端点 / 折点可编辑',path:{points:[{x:0,y:0},{x:1,y:0}],arrow:'none'}},
  {id:'shape-arrow',kind:'path',label:'箭头',name:'箭头',category:'basic',note:'自由箭头 · 可改线宽',path:{points:[{x:0,y:0},{x:1,y:0}],arrow:'open'}},
  { id: 'encoder', kind: 'module', label: 'Encoder', name: '编码器', category: 'model', note: 'Attention · FFN · 残差', structure:{type:'encoder',repeats:6} },
  { id: 'decoder', kind: 'module', label: 'Decoder', name: '解码器', category: 'model', note: 'Masked / Cross-attention', structure:{type:'decoder',repeats:6} },
  { id: 'attention', kind:'module',label:'Attention',name:'注意力模块',category:'model',note:'Q / K / V · Softmax',structure:{type:'attention'} },
  { id: 'mlp-block', kind:'module',label:'MLP',name:'全连接网络',category:'model',note:'多列神经元 · 全连接',structure:{type:'mlp'} },
  { id: 'convolution', kind:'module',label:'Convolution',name:'卷积模块',category:'model',note:'特征图 · 卷积核',structure:{type:'convolution'} },
  { id: 'retriever', kind:'module',label:'Retriever',name:'检索器',category:'system',note:'Query · Index · Top-k',structure:{type:'retriever'} },
  { id: 'tokens', kind: 'tokens', label: 'Token sequence', name: 'Token 序列', category: 'model', note: 'Sequence' },
  { id: 'tensor', kind: 'tensor', label: 'Feature maps', name: '特征张量', category: 'model', note: 'Tensor' },
  { id: 'fusion', kind: 'module', label: 'Fusion', name: '融合模块', category: 'model', note: '分支汇合 · 拼接 · 投影', structure:{type:'fusion'} },
  { id: 'queue', kind: 'queue', label: 'Cache queue', name: '缓存队列', category: 'system', note: 'Queue' },
  { id: 'query', kind: 'module', label: 'Query operator', name: '查询算子', category: 'system', note: '向量检索', structure:{type:'retriever'} },
  { id: 'memory', kind: 'module', label: 'Memory', name: '存储模块', category: 'system', note: 'Key / Value · 读写槽位', structure:{type:'memory'} },
  { id: 'neuron', kind: 'neuron', label: 'Neuron', name: '神经元', category: 'model', note: 'Neural network', reference: { source: 'ml-visuals', description: '用户提供的 ML 素材，第 47 页网络示意；提炼为参数化节点' } },
  { id: 'sum', kind: 'operator', label: '+', name: '逐元素求和', category: 'model', note: 'Element-wise sum', reference: { source: 'local-template', description: '本地模板第 15、18、22 页的圆形算子表达' } },
  { id: 'concat', kind: 'operator', label: 'C', name: '特征拼接', category: 'model', note: 'Concatenation', reference: { source: 'local-template', description: '本地模板第 8、22、24 页的拼接标记' } },
  { id: 'volume', kind: 'volume', label: 'Feature volume', name: '三维特征体', category: 'model', note: 'Feature volume', reference: { source: 'local-template', description: '本地模板第 15、18、27 页的 cube 原生形状' } },
  { id: 'projection', kind: 'projection', label: 'Projection', name: '投影映射', category: 'model', note: 'Projection', reference: { source: 'local-template', description: '本地模板第 18、24 页的 trapezoid 原生形状' } },
]
