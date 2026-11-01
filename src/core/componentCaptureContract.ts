import {z} from 'zod'
const id=z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),sha=z.string().regex(/^[a-f0-9]{64}$/)
const ids=(limit:number)=>z.array(id).max(limit).refine(values=>new Set(values).size===values.length,'采集来源对象不能重复')
export const componentCollectionSchema=z.object({version:z.literal(1),kind:z.enum(['project','candidate']),runId:z.uuid().optional(),review:z.enum(['none','pending','applied','discarded']).optional(),sourceTitle:z.string().min(1).max(100),figureSha256:sha,selectionSha256:sha,capturedAt:z.iso.datetime(),requestedIds:ids(261).min(1),objectIds:ids(261).min(1),scopeIds:ids(21),omittedEdgeIds:ids(120),blockedEdgeIds:ids(120),detachedEndpoints:z.array(z.object({nodeId:id,end:z.enum(['start','end'])}).strict()).max(480)}).strict().superRefine((value,ctx)=>{
  if(value.kind==='candidate'?(!value.runId||value.review===undefined):(!!value.runId||value.review!==undefined))ctx.addIssue({code:'custom',message:'候选采集须保留原运行与状态；工程采集不冒充候选'})
  if(value.requestedIds.some(id=>!value.objectIds.includes(id))||value.scopeIds.some(id=>value.objectIds.includes(id))||value.detachedEndpoints.some(endpoint=>!value.objectIds.includes(endpoint.nodeId))||new Set(value.detachedEndpoints.map(endpoint=>`${endpoint.nodeId}:${endpoint.end}`)).size!==value.detachedEndpoints.length)ctx.addIssue({code:'custom',message:'采集来源选择与处理记录不一致'})
})
export type ComponentCollection=z.infer<typeof componentCollectionSchema>
export type ComponentCaptureOrigin={kind:'project'}|{kind:'candidate';runId:string;review:'none'|'pending'|'applied'|'discarded'}
export function collectionSelectionJson(record:Pick<ComponentCollection,'requestedIds'|'objectIds'|'scopeIds'|'omittedEdgeIds'|'blockedEdgeIds'|'detachedEndpoints'>){
  return JSON.stringify({requestedIds:[...record.requestedIds].sort(),objectIds:[...record.objectIds].sort(),scopeIds:[...record.scopeIds].sort(),omittedEdgeIds:[...record.omittedEdgeIds].sort(),blockedEdgeIds:[...record.blockedEdgeIds].sort(),detachedEndpoints:[...record.detachedEndpoints].sort((a,b)=>(a.nodeId<b.nodeId?-1:a.nodeId>b.nodeId?1:0)||(a.end<b.end?-1:a.end>b.end?1:0)).map(value=>({nodeId:value.nodeId,end:value.end}))})
}
