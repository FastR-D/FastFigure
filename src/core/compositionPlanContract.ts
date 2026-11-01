import {sketchStyleIds} from './sketchStyle.ts'
import {z} from 'zod'
import {fontFamilies,paletteById} from '../data/materials.ts'
import {styleIds} from './styleIds.ts'
import {referenceUseSchema} from './referenceInputs.ts'
import {containerSurfaces} from './containerSurface.ts'
import {styleAssetSchema} from './styleAssetContract.ts'
import {colorMapSchema,componentColorMapSchema,colorMapKey} from './colorMappingContract.ts'
const text=(max:number)=>z.string().trim().min(1).max(max)
const sectionId=z.string().min(1).max(32).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/)
export const compositionRoles={overview:'总体概览',mechanism:'核心机制',detail:'局部解释',context:'背景与输入',evidence:'证据与结果'} as const
export const compositionStructures={'temporal-memory':'时序记忆读写','alternating-attention':'组内／组间交替注意力',layered:'分层架构',hierarchy:'层级树',pipeline:'阶段流程',network:'网络关系',tensor:'张量与特征',matrix:'行列矩阵',cycle:'循环反馈',radial:'中心辐射','encoder-decoder':'多尺度编解码',comparison:'并列对照',overlap:'集合交叠',concentric:'同心圈层',custom:'自定义结构'} as const
export const compositionConnectionLabels={dataflow:'数据流',feedback:'反馈',detail:'局部对应',comparison:'对照',membership:'包含／解释','parameter-transfer':'参数迁移'} as const
const sectionDesign=z.object({role:z.enum(Object.keys(compositionRoles) as [keyof typeof compositionRoles,...(keyof typeof compositionRoles)[]]),structure:z.enum(Object.keys(compositionStructures) as [keyof typeof compositionStructures,...(keyof typeof compositionStructures)[]]),rationale:text(400),emphasis:z.enum(['primary','supporting']),frame:z.object({id:sectionId,x:z.number().min(0).max(1),y:z.number().min(0).max(1),width:z.number().min(.05).max(1),height:z.number().min(.05).max(1)}).strict().refine(f=>f.x+f.width<=1.000001&&f.y+f.height<=1.000001,'方案分区须在归一化内容区内')}).strict()
const plannedComponent=z.object({id:z.string().min(1).max(30).regex(/^[a-zA-Z0-9_-]+$/).refine(id=>id!=='stage','组件实例不能使用根容器标识 stage'),key:text(100),colorIndex:z.number().int().min(0).max(11).optional(),colorMap:componentColorMapSchema.optional(),parameters:z.record(z.string().max(40),z.union([z.string().max(100),z.number().finite()])).refine(p=>Object.keys(p).length<=20).optional()}).strict().refine(c=>c.colorIndex===undefined||!c.colorMap,'组件默认主题色与多色映射不能混用')
const section=z.object({id:sectionId,title:text(80),purpose:text(400),visual:text(600),design:sectionDesign.optional(),components:z.array(plannedComponent).max(4),referenceImages:z.array(z.number().int().min(1).max(3)).max(3),annotations:z.array(text(160)).max(4)}).strict()
export const compositionPlanSchema=z.object({status:z.enum(['ready','needs-input']),title:text(100),goal:text(1000),readingOrder:z.enum(['left-to-right','top-to-bottom','panels','radial']),layout:text(1200),style:z.object({sketchStyle:z.enum(sketchStyleIds).optional(),roughness:z.number().min(0).max(2).optional(),preset:z.enum(styleIds),paletteId:text(120).refine(id=>paletteById.has(id),'未知方案配色'),fontFamily:z.enum(fontFamilies),surface:z.enum(containerSurfaces).optional(),colorIndex:z.number().int().min(0).max(11).optional(),colorMap:colorMapSchema.optional(),usage:text(800)}).strict(),sections:z.array(section).min(1).max(6),connections:z.array(z.object({from:sectionId,to:sectionId,kind:z.enum(['dataflow','feedback','detail','comparison','membership','parameter-transfer']).optional(),meaning:text(300)}).strict()).max(12),checks:z.array(text(300)).min(1).max(8),questions:z.array(text(400)).max(6),uncertainties:z.array(text(400)).max(6)}).strict().superRefine((plan,ctx)=>{
  const ids=new Set(plan.sections.map(s=>s.id))
  if(ids.size!==plan.sections.length)ctx.addIssue({code:'custom',message:'方案分区标识不能重复'})
  const designed=plan.sections.filter(s=>s.design)
  if(designed.length){
    if(designed.length!==plan.sections.length)ctx.addIssue({code:'custom',message:'复合方案每个分区都须声明结构选择与版面'})
    if(designed.filter(s=>s.design!.emphasis==='primary').length!==1)ctx.addIssue({code:'custom',message:'复合方案须有且仅有一个主视觉分区'})
    const frames=designed.map(s=>s.design!.frame)
    if(new Set(frames.map(f=>f.id)).size!==frames.length||frames.some(f=>f.id==='stage'))ctx.addIssue({code:'custom',message:'分区框标识须唯一且不能使用 stage'})
    for(let i=0;i<frames.length;i++)for(let j=i+1;j<frames.length;j++){const a=frames[i]!,b=frames[j]!;if(a.x<b.x+b.width-1e-6&&a.x+a.width>b.x+1e-6&&a.y<b.y+b.height-1e-6&&a.y+a.height>b.y+1e-6)ctx.addIssue({code:'custom',message:'方案分区不得重叠；局部解释须独立留位'})}
    if(plan.connections.some(link=>!link.kind))ctx.addIssue({code:'custom',message:'复合方案须区分数据流、反馈、局部对应、对照和包含关系'})
    for(const part of designed)if(plan.sections.some(other=>other.id!==part.id&&other.components.some(c=>c.id===part.design!.frame.id)))ctx.addIssue({code:'custom',message:'分区框不能借用其他分区的组件标识'})
  }
  const components=plan.sections.flatMap(s=>s.components),colors=paletteById.get(plan.style.paletteId)?.colors
  if(new Set(components.map(c=>c.id)).size!==components.length)ctx.addIssue({code:'custom',message:'方案组件实例标识不能重复'})
  if(colors&&[plan.style.colorIndex,...components.map(c=>c.colorIndex)].some(index=>index!==undefined&&index>=colors.length))ctx.addIssue({code:'custom',message:'主题色色槽不在方案配色中'})
  if(components.some(c=>c.colorMap?.some(row=>row.targetPaletteId!==plan.style.paletteId)))ctx.addIssue({code:'custom',message:'组件颜色映射须使用方案目标配色'})
  for(const part of plan.sections)if(new Set(part.referenceImages).size!==part.referenceImages.length)ctx.addIssue({code:'custom',message:'分区参考图不能重复'})
  for(const link of plan.connections)if(!ids.has(link.from)||!ids.has(link.to)||link.from===link.to)ctx.addIssue({code:'custom',message:'方案连接须引用两个不同的现有分区'})
  if(plan.status==='needs-input'&&!plan.questions.length||plan.status==='ready'&&plan.questions.length)ctx.addIssue({code:'custom',message:'待补充方案须列出问题，可采用方案须先明确这些问题'})
})
export type CompositionPlan=z.infer<typeof compositionPlanSchema>
export const compositionSourceSchema=z.object({key:text(100),name:text(100),revision:text(100),nodeCount:z.number().int().nonnegative().max(240)}).strict()
export const compositionRecordSchema=z.object({version:z.literal(1),runId:z.uuid(),userGoal:text(12000),plan:compositionPlanSchema,references:z.array(referenceUseSchema).max(3),components:z.array(compositionSourceSchema).max(6),styleReference:styleAssetSchema.optional()}).strict().superRefine((record,ctx)=>{
  const keys=new Set(record.components.map(c=>c.key)),indices=new Set(record.references.map(r=>r.index)),used=new Set(record.plan.sections.flatMap(s=>s.referenceImages))
  if(record.styleReference&&(['preset','paletteId','fontFamily','surface','sketchStyle','roughness'] as const).some(key=>(record.plan.style[key]??'plain')!==(record.styleReference![key]??'plain')))ctx.addIssue({code:'custom',message:'方案与保存的风格来源不一致'})
  if(record.styleReference&&(record.plan.style.colorIndex??0)!==(record.styleReference.colorIndex??0))ctx.addIssue({code:'custom',message:'方案与保存风格的默认主题色不一致'})
  if(record.styleReference&&colorMapKey(record.plan.style.colorMap)!==colorMapKey(record.styleReference.colorMap))ctx.addIssue({code:'custom',message:'方案与保存风格的颜色映射不一致'})
  if(keys.size!==record.components.length||indices.size!==record.references.length||new Set(record.references.map(r=>r.id)).size!==record.references.length)ctx.addIssue({code:'custom',message:'方案输入来源不能重复'})
  for(const part of record.plan.sections){if(part.components.some(c=>!keys.has(c.key)))ctx.addIssue({code:'custom',message:'方案素材不在输入来源中'});if(part.referenceImages.some(i=>!record.references.some(r=>r.index===i&&r.decision==='use')))ctx.addIssue({code:'custom',message:'方案参考图使用记录不一致'})}
  if(record.references.some(r=>r.decision==='use'&&!used.has(r.index)))ctx.addIssue({code:'custom',message:'采用参考图须对应分区'})
})
export type CompositionRecord=z.infer<typeof compositionRecordSchema>
