import { z } from 'zod'
import type { FigureNode } from './model.ts'

export const structureTypes = ['none', 'encoder', 'decoder', 'attention', 'mlp', 'convolution', 'retriever', 'fusion', 'memory'] as const
export type StructureType = typeof structureTypes[number]
export const structureSchema = z.object({
  type: z.enum(structureTypes), repeats: z.number().int().min(1).max(12).optional(),
  labels: z.array(z.string().max(40)).max(6).optional(),
})
export type NodeStructure = z.infer<typeof structureSchema>
export const structurePresets: { type: StructureType; name: string; labels: string[]; note: string; height: number }[] = [
  { type:'none', name:'无内部结构', labels:[], note:'通用方框', height:66 },
  { type:'encoder', name:'Transformer 编码器', labels:['Self-attention','Add & Norm','Feed-forward','Add & Norm'], note:'注意力 / 前馈层 / 两条残差路径', height:164 },
  { type:'decoder', name:'Transformer 解码器', labels:['Masked self-attn','Add & Norm','Cross-attention','Add & Norm','Feed-forward','Add & Norm'], note:'因果注意力 / 编码器交叉输入 / 残差', height:180 },
  { type:'attention', name:'缩放点积注意力', labels:['Q','K','V','QKᵀ / √d','Softmax','× V'], note:'Q/K/V 分路 / 相似度 / 加权求和', height:156 },
  { type:'mlp', name:'多层感知机', labels:['Input','Hidden','Output'], note:'多列神经元 / 全连接', height:144 },
  { type:'convolution', name:'卷积特征提取', labels:['Features','Kernel','Output'], note:'特征图 / 局部卷积核 / 输出特征', height:144 },
  { type:'retriever', name:'向量检索器', labels:['Query','Index','Top-k'], note:'查询向量 / 文档索引 / 检索结果', height:144 },
  { type:'fusion', name:'双分支特征融合', labels:['x₁','x₂','Concat','Proj.'], note:'分支输入 / 特征拼接 / 投影', height:144 },
  { type:'memory', name:'键值存储', labels:['Key','Value','Read / write'], note:'键值行 / 高亮访问槽位 / 读写方向', height:144 },
]
export function structurePreset(type: StructureType) { return structurePresets.find(p => p.type === type)! }
/** Recognize only conventional seed names; explicit `none` always wins. New components store their type. */
export function nodeStructure(node: FigureNode): NodeStructure | undefined {
  if (node.kind !== 'module') return
  if (node.structure) return node.structure.type === 'none' ? undefined : node.structure
  const aliases: Record<string, StructureType> = { encoder:'encoder',decoder:'decoder',retriever:'retriever',fusion:'fusion','query operator':'retriever',memory:'memory',attention:'attention',mlp:'mlp',convolution:'convolution' }
  const type = aliases[node.label.trim().toLowerCase()]
  return type ? { type } : undefined
}
export function structureLabels(structure: NodeStructure) { return structurePreset(structure.type).labels.map((label,i) => structure.labels?.[i] ?? label) }
