import {z} from 'zod'
import {repositorySelectionSchema} from './repositorySelection.ts'
import {componentImageQuerySchema} from './componentSearch.ts'

const sha=z.string().regex(/^[a-f0-9]{64}$/),key=z.string().max(100),word=z.string().min(2).max(80),words=z.array(word).max(8)
const groupSchema=z.object({label:word,kind:z.enum(['literal','alias']),terms:z.array(word).min(1).max(6)})
export type RecallQueryGroup=z.infer<typeof groupSchema>
export const recallMatchSchema=z.object({snapshotId:sha,componentKey:key.optional(),name:z.string().max(100),revision:z.iso.datetime(),score:z.number().finite().nonnegative(),matched:z.object({identity:words,name:words,tags:words,description:words,sources:words}),decision:z.enum(['candidate','included','already-attached','not-selected','unavailable']),note:z.string().max(240).optional()})
export const repositoryRecallSchema=z.object({version:z.literal(2),engine:z.literal('metadata-keywords-v2'),query:z.string().max(12_000),groups:z.array(groupSchema).max(32),terms:z.array(word).max(192),omittedTerms:z.number().int().nonnegative(),candidatePoolLimit:z.literal(24),candidatePoolCapped:z.boolean(),matches:z.array(recallMatchSchema).max(24),catalogue:z.array(z.object({key,name:z.string().max(100),revision:z.iso.datetime(),snapshotId:sha.optional()})).max(6),selection:repositorySelectionSchema.optional(),visualQuery:componentImageQuerySchema.optional(),fromPlanRunId:z.uuid().optional(),fromSearchRunId:z.uuid().optional()})
export type RepositoryRecall=z.infer<typeof repositoryRecallSchema>
// Name translations grounded in components.ts / recipes.ts. Related structures are not synonyms:
// encoder is not Transformer, tensor is not feature maps, and attention is not Softmax.
const aliases=[
  ['编码器','encoder'],['解码器','decoder'],['注意力','attention'],['因果','causal'],['无掩码','unmasked'],
  ['张量','tensor','tensors'],['嵌入','embedding','embeddings'],['特征图','feature map','feature maps'],
  ['融合','fusion'],['卷积','convolution'],['检索器','retriever'],['存储模块','memory'],
  ['缓存','cache'],['队列','queue'],['流水线','pipeline'],['全连接网络','mlp'],['神经元','neuron','neurons'],
  ['特征拼接','concatenation'],['投影映射','projection'],['三维特征体','feature volume'],
  ['token 序列','token序列','token sequence'],
  ['图像分块','patchify','patchification'],['分块嵌入','patch embedding','patch embeddings','patch嵌入'],
  ['位置嵌入','position embedding','positional embedding'],['视觉 transformer','vision transformer','vit'],
] as const
const stop=new Set(['the','and','for','from','with','into','this','that','please','draw','create','figure','diagram','paper','using','use','editable','native','keep','only','are','not','test','绘图','绘制','图件','论文','科研','组件','使用','要求','需要','一个','这张','图片','原生','可编','编辑','保持','根据','以及','进行','示意','结构','表示','显示','请用','不要','希望','复用','加入','最后','最终','整体','关键','部件'])
const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
/** Latin words need boundaries; Chinese names may occur inside unsegmented sentences. */
function expression(term:string){return new RegExp(`${/^[a-z0-9]/.test(term)?'(?<![a-z0-9])':''}${escape(term)}${/[a-z0-9]$/.test(term)?'(?![a-z0-9])':''}`,'gu')}
function sample<T>(all:T[],limit:number){return all.length<=limit?all:limit===1?[all.at(-1)!]:Array.from({length:limit},(_,i)=>all[Math.round(i*(all.length-1)/(limit-1))]!)}

/** Prioritize explicit names anywhere in the query, then evenly cover the remaining text. */
export function repositoryRecallTerms(query:string){
  const text=query.toLowerCase(),covered=new Uint8Array(text.length),known:{group:RecallQueryGroup;at:number}[]=[]
  for(const variants of aliases){
    const hits=variants.flatMap(term=>[...text.matchAll(expression(term))].map(match=>({term,at:match.index,end:match.index+match[0].length})))
    if(!hits.length)continue
    hits.sort((a,b)=>a.at-b.at||b.term.length-a.term.length)
    for(const hit of hits)covered.fill(1,hit.at,hit.end)
    known.push({group:{label:hits[0]!.term,kind:'alias',terms:[...variants]},at:hits[0]!.at})
  }
  const rest=Array.from({length:text.length},(_,i)=>covered[i]?' ':text[i]).join(''),literals=[...new Set((rest.match(/[a-z0-9_-]+|[\p{Script=Han}]+/gu)??[]).flatMap(token=>/^[\p{Script=Han}]+$/u.test(token)?Array.from({length:Math.max(0,token.length-1)},(_,i)=>token.slice(i,i+2)):[token]).filter(term=>term.length>=2&&term.length<=80&&!stop.has(term)))]
  const named=known.sort((a,b)=>a.at-b.at).map(row=>row.group),selected=sample(named,32),remaining=sample(literals,32-selected.length),groups:RecallQueryGroup[]=[...selected,...remaining.map(term=>({label:term,kind:'literal' as const,terms:[term]}))]
  return{groups,terms:[...new Set(groups.flatMap(group=>group.terms))],omittedTerms:named.length+literals.length-groups.length}
}
export interface SearchableComponent{id?:string;assetId?:string;lineage?:{assetId:string}[];name:string;tags:string[];description:string;sources:{title:string;reference:string}[]}
/** One contribution per group per field, so translations never multiply the same evidence. */
export function scoreComponentMetadata(value:SearchableComponent,groups:RecallQueryGroup[]){
  const fields={identity:[value.id,value.assetId,...(value.lineage??[]).map(row=>row.assetId)].filter(Boolean).join(' '),name:value.name,tags:value.tags.join(' '),description:value.description,sources:value.sources.flatMap(s=>[s.title,s.reference]).join(' ')},weights={identity:12,name:8,tags:5,description:2,sources:1},matched={identity:[] as string[],name:[] as string[],tags:[] as string[],description:[] as string[],sources:[] as string[]};let score=0
  for(const field of Object.keys(fields)as(keyof typeof fields)[]){const text=fields[field].toLowerCase(),hits=groups.flatMap(group=>{const term=group.terms.find(term=>expression(term).test(text));return term?[term]:[]});score+=hits.length*weights[field];matched[field]=hits.slice(0,8)}
  return{score,matched}
}
export function repositoryRecallPrompt(report?:RepositoryRecall){return report?`本轮本机素材召回记录：${JSON.stringify(report)}\n此记录来自程序的元数据文字匹配；别名仅用于名称翻译，不推断科学关系或满足否定约束。分数不是科学适用性、视觉相似度或质量评价。只有 catalogue 中实际附带的素材可以引用；允许不使用。按完整用户要求核对原生结构、接口、参数、来源和示例数据身份，不因命中词推断实验值或新的科学关系。\n`:''}
