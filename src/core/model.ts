import {edgeAppearanceSchema} from './lineStyleContract.ts'
import {nativeDetailSourceSchema} from './detailInsetContract.ts'
export {edgeAppearanceSchema} from './lineStyleContract.ts'
import {edgeRouteContainer,edgeWaypointPoints} from './edgeWaypoints.ts'
import {sharedLegendRecordSchema} from './sharedLegendContract.ts'
import {sharedColorbarRecordSchema} from './sharedColorbarContract.ts'
import {componentCollectionSchema} from './componentCaptureContract.ts'
import {publicationSettingsSchema} from './publicationContract.ts'
import { z } from 'zod'
import {linearGradientSchema,supportsGradient} from './gradient.ts'
import {colorMapSchema} from './colorMappingContract.ts'
import { referenceUseSchema,referencePurposeSchema } from './referenceInputs.ts'
import {sketchStyleIds} from './sketchStyle.ts'
import {fontFamilies, defaultPaletteId, iconById, paletteById } from '../data/materials.ts'
import { structureSchema } from './structures.ts'
import { syncBindings,isClosedPathTarget } from './paths.ts'
import { reconstructionRecordSchema, reconstructionTraceSchema,reconstructionReuseRecordSchema } from './reconstructionContract.ts'
import { dataChartRecordSchema } from './dataChartSchema.ts'
import {styleIds} from './styleIds.ts'
import {compositionRecordSchema} from './compositionPlanContract.ts'
import {styleUseSchema} from './styleAssetContract.ts'
import {generatedImageTraceSchema} from './generatedImageTrace.ts'
import {imageDraftOriginSchema} from './imageDraftContract.ts'

export {styleIds} from './styleIds.ts'
export type StyleId = typeof styleIds[number]
export const accentIds = ['blue', 'slate', 'teal', 'sand', 'rose'] as const
export type AccentId = typeof accentIds[number]
export const nodeKinds = ['module', 'tokens', 'tensor', 'queue', 'neuron', 'operator', 'volume', 'projection', 'rectangle', 'ellipse', 'diamond', 'text', 'icon', 'path', 'port'] as const
export type NodeKind = typeof nodeKinds[number]
export const nodeKindLabels: Record<NodeKind, string> = { module: '通用模块', tokens: 'Token 序列', tensor: '矩阵 / 张量', queue: '队列', neuron: '神经元', operator: '融合算子', volume: '特征体', projection: '投影层', rectangle: '矩形', ellipse: '圆 / 椭圆', diamond: '菱形', text: '无框文字 / 注释', icon: '矢量图标', path:'路径 / 连线',port:'外部接口' }
export const primitiveKinds = ['rectangle','ellipse','diamond','text','icon','path','port'] as const
export const isPrimitive = (kind: NodeKind) => (primitiveKinds as readonly string[]).includes(kind)
export const textStyleSchema = z.object({ family: z.string().max(80).regex(/^[\p{L}\p{N} _.-]+$/u).optional(), size: z.number().min(1).max(256).optional(), bold: z.boolean().optional(),weight:z.number().int().min(1).max(1000).optional(), italic: z.boolean().optional(),letterSpacing:z.number().min(-32).max(128).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), align: z.enum(['left','center','right']).optional() })
export type TextStyle = z.infer<typeof textStyleSchema>
export const chartMarkSchema=z.object({role:z.enum(['series','axis','grid','stat','heat','band','annotation','frame']),series:z.number().int().min(0).max(11).optional(),channels:z.array(z.enum(['fill','stroke','text'])).max(3).default([]),key:z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/).optional()})
const paletteIdSchema = z.string().max(120).refine(id => paletteById.has(id), '未知配色方案')
const linearSchema=z.tuple([z.number().finite().min(-128).max(128),z.number().finite().min(-128).max(128),z.number().finite().min(-128).max(128),z.number().finite().min(-128).max(128)]).refine(m=>Math.abs(m[0]*m[3]-m[1]*m[2])>1e-8,'变换矩阵不能退化')
const metricScaleSchema=z.number().finite().min(.05).max(16)
const visualSchema = z.object({ fillGradient:linearGradientSchema.nullable().optional(),strokeGradient:linearGradientSchema.nullable().optional(),fill: z.string().regex(/^(#[0-9a-fA-F]{6}|none)$/).optional(), stroke: z.string().regex(/^(#[0-9a-fA-F]{6}|none)$/).optional(), colorIndex: z.number().int().min(0).max(11).optional(), radius: z.number().min(0).max(310).optional(),strokeWidth:z.number().min(.01).max(64).optional(),opacity:z.number().min(0).max(1).optional(),fillOpacity:z.number().min(0).max(1).optional(),strokeOpacity:z.number().min(0).max(1).optional(),padding:z.number().min(0).max(384).optional(),tone:z.enum(['fill','hatch']).optional(),textTone:z.enum(['ink','deep']).optional(),handDrawn:z.boolean().optional(),lineCap:z.enum(['butt','round','square']).optional(),lineJoin:z.enum(['miter','round','bevel']).optional(),dash:z.array(z.number().min(0).max(2000)).max(16).optional(),dashOffset:z.number().min(-2000).max(2000).optional(),miterLimit:z.number().min(1).max(1000).optional(),strokeMatrix:linearSchema.optional() })
const id = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/)
const fraction=z.number().finite().min(0).max(1),coordinatePoint=z.object({x:fraction,y:fraction})
const pathPoint=coordinatePoint.extend({c1:coordinatePoint.optional(),c2:coordinatePoint.optional(),move:z.boolean().optional(),close:z.boolean().optional()})
export const pathBindingSchema=z.object({nodeId:id,note:z.string().trim().max(240).optional(),x:fraction.optional(),y:fraction.optional(),anchorIndex:z.number().int().min(0).max(127).optional(),offsetX:z.number().min(-384).max(384).optional(),offsetY:z.number().min(-384).max(384).optional()}).superRefine((b,ctx)=>{if(b.anchorIndex!==undefined?b.x!==undefined||b.y!==undefined:b.x===undefined||b.y===undefined)ctx.addIssue({code:'custom',message:'路径绑定须选择锚点编号或完整比例坐标，不能混用'})})
export const pathSchema=z.object({points:z.array(pathPoint).min(2).max(128),arrow:z.enum(['none','open','filled']).default('none'),startArrow:z.enum(['none','open','filled']).optional(),arrowSize:z.number().finite().min(.1).max(256).optional(),fillRule:z.enum(['nonzero','evenodd']).optional(),start:pathBindingSchema.optional(),end:pathBindingSchema.optional()})
export const evidenceRegionSchema = z.object({
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1),
}).refine(r => r.x + r.width <= 1.000001 && r.y + r.height <= 1.000001, '证据区域超出原图')
export const componentSourceSchema = z.object({
  nativeDetail:nativeDetailSourceSchema.optional(),
  collection:componentCollectionSchema.optional(),
  generated:generatedImageTraceSchema.optional(),
  title: z.string().min(1).max(100), reference: z.string().min(1).max(500),purpose:referencePurposeSchema.optional(),
  file:z.object({format:z.enum(['svg','drawio']),fileName:z.string().min(1).max(200),sha256:z.string().regex(/^[a-f0-9]{64}$/),page:z.object({index:z.number().int().min(0).max(49),id:z.string().max(200),name:z.string().max(100)}).optional(),objectId:z.string().max(200).optional()}).optional(),
  image: z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), fileName: z.string().min(1).max(200),
    width: z.number().int().positive().max(2400), height: z.number().int().positive().max(2400), region: evidenceRegionSchema,
  }).optional(),
}).refine(source=>!source.generated||source.image?.sha256===source.generated.sha256,'AI 草稿来源指纹不符')
export type ComponentSource = z.infer<typeof componentSourceSchema>
export type EvidenceRegion = z.infer<typeof evidenceRegionSchema>
export const referenceImageSchema = z.object({
  generated:generatedImageTraceSchema.optional(),
  id, title: z.string().trim().min(1).max(100), citation: z.string().trim().max(500),
  fileName: z.string().min(1).max(200), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  pixelWidth: z.number().int().positive().max(2400), pixelHeight: z.number().int().positive().max(2400),
  dataUrl: z.string().max(600_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
  placement: z.object({ x: z.number().finite().min(-2000).max(2000), y: z.number().finite().min(-2000).max(2000),
    width: z.number().min(1).max(2000), height: z.number().positive().max(2000) }),
}).refine(r => Math.abs(r.placement.width / r.placement.height - r.pixelWidth / r.pixelHeight) < 0.001, '参考图必须等比缩放').refine(r=>!r.generated||r.generated.sha256===r.sha256,'AI 草稿图片指纹不符')
export type ReferenceImage = z.infer<typeof referenceImageSchema>
export const componentRecipeSchema = z.object({
  id, version: z.number().int().positive(),
  parameters: z.record(z.string().max(40), z.union([z.string().max(100), z.number().finite()])).refine(p => Object.keys(p).length <= 20),
})
const parametricRecipeSchema=z.object({version:z.literal(1),recipe:componentRecipeSchema,revision:z.number().int().nonnegative(),updatedAt:z.iso.datetime().optional(),objects:z.record(id,id).refine(values=>Object.keys(values).length<=381&&!!values.stage&&new Set(Object.values(values)).size===Object.keys(values).length,'参数化图元对应记录无效')}).strict()
export const componentAncestorSchema = z.object({ assetId: id, name: z.string().min(1).max(100), revision: z.iso.datetime(), recipe: componentRecipeSchema.optional() })
export const componentOriginSchema = componentAncestorSchema.extend({
  sources: z.array(componentSourceSchema).max(12), lineage: z.array(componentAncestorSchema).max(16),
  recipe: componentRecipeSchema.optional(),
})
const coord = z.number().finite().min(0).max(2000)
export const componentPortSchema=z.object({key:z.string().min(1).max(32).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),direction:z.enum(['input','output','both']),side:z.enum(['left','right','top','bottom']),position:fraction})
export type ComponentPort=z.infer<typeof componentPortSchema>
export const nodeSchema = z.object({
  reconstruction:reconstructionTraceSchema.optional(),
  metricScale:metricScaleSchema.optional(),
  chart:chartMarkSchema.optional(),
  id, kind: z.enum(nodeKinds), label: z.string().max(240),name:z.string().max(100).optional(), description: z.string().max(240).optional(),
  parentId: id,
  x: coord, y: coord, width: z.number().min(0).max(1000), height: z.number().min(0).max(620),
  path:pathSchema.optional(),interfaceFor:id.optional(),socket:componentPortSchema.optional(),
  textLayout:z.object({x:fraction,y:fraction,matrix:linearSchema,baseline:z.enum(['auto','alphabetic','middle','central','hanging','text-before-edge','text-after-edge','ideographic']).optional()}).optional(),
  textStyle: textStyleSchema.optional(), descriptionStyle: textStyleSchema.optional(), structure: structureSchema.optional(), visual: visualSchema.optional(), iconId: z.string().refine(id => id === 'none' || iconById.has(id), '未知图标').optional(),
  evidence: componentSourceSchema.optional(),
})
export type FigureNode = z.infer<typeof nodeSchema>
const port = z.enum(['left', 'right', 'top', 'bottom'])
export type Port = z.infer<typeof port>
export const automaticEdgeRoutingSchema=z.enum(['orthogonal','straight'])
export type AutomaticEdgeRouting=z.infer<typeof automaticEdgeRoutingSchema>
export const edgeRoutingSchema=z.enum([...automaticEdgeRoutingSchema.options,'manual'])
const manualRouteSchema=z.object({containerId:id,direction:z.enum(['horizontal','vertical']),points:z.array(z.object({x:z.number().finite().min(0).max(20000),y:z.number().finite().min(0).max(20000)}).strict()).min(1).max(32)}).strict()
export type EdgeRouting=z.infer<typeof edgeRoutingSchema>
const edgeSchema = z.object({ metricScale:metricScaleSchema.optional(),id, source: id, target: id, sourcePort: port, targetPort: port,routing:edgeRoutingSchema.optional(),manualRoute:manualRouteSchema.optional(),appearance:edgeAppearanceSchema.optional() })
export type FigureEdge = z.infer<typeof edgeSchema>
export const containerRoles = ['group', 'stage', 'boundary', 'lane', 'panel', 'component'] as const
const containerSchema = z.object({sharedColorbar:sharedColorbarRecordSchema.optional(),sharedLegend:sharedLegendRecordSchema.optional(),metricScale:metricScaleSchema.optional(),
  parametric:parametricRecipeSchema.optional(),
  reconstructionReuse:reconstructionReuseRecordSchema.optional(),
  dataChart:dataChartRecordSchema.optional(),
  reconstruction:reconstructionRecordSchema.optional(),
  id, parentId: id.nullable(), title: z.string().min(1,'容器标题不能为空').max(100,'容器标题最多 100 字'), role: z.enum(containerRoles),
  x: coord, y: coord, width: z.number().min(.05).max(1000), height: z.number().min(.05).max(620),
  visual:visualSchema.optional(),structureOrigin:structureSchema.optional(),
  opacity:z.number().min(0).max(1).optional(),
  appearance: z.object({ fontFamily:z.enum(fontFamilies).optional(),sketchStyle:z.enum(sketchStyleIds).optional(),roughness:z.number().min(0).max(2).optional(),preset: z.enum([...styleIds, 'inherit']).default('inherit'), accent: z.enum([...accentIds, 'inherit']).default('inherit'), paletteId: z.union([z.literal('inherit'),paletteIdSchema]).optional(), colorIndex:z.number().int().min(0).max(11).optional(), colorMap:colorMapSchema.optional() }).optional(),
  textStyle: textStyleSchema.optional(),
  component: componentOriginSchema.optional(),
  evidence: componentSourceSchema.optional(),
})
export type FigureContainer = z.infer<typeof containerSchema>
export const figureDocumentSchema = z.object({
  publication:publicationSettingsSchema.optional(),
  version: z.literal('0.2'), title: z.string().min(1).max(100),
  canvas: z.object({ width: z.literal(1000), height: z.literal(620) }),
  style: z.object({ fontFamily:z.enum(fontFamilies).optional(),sketchStyle:z.enum(sketchStyleIds).optional(),preset: z.enum(styleIds), roughness: z.number().min(0).max(2), seed: z.number().int().min(1).max(2147483647), accent: z.enum(accentIds), paletteId: paletteIdSchema.optional(), colorIndex:z.number().int().min(0).max(11).optional(), colorMap:colorMapSchema.optional() }),
  nodes: z.array(nodeSchema).max(240), edges: z.array(edgeSchema).max(120),
  containers: z.array(containerSchema).min(1).max(21),
  references: z.array(referenceImageSchema).max(3).default([]),referenceUses:z.array(referenceUseSchema.refine(r=>r.decision==='use','图件只保存已采用的参考来源')).max(12).optional(),
  compositionPlans:z.array(compositionRecordSchema.refine(p=>p.plan.status==='ready','图件只保存已采用的可绘制方案')).max(4).optional(),
  styleUses:z.array(styleUseSchema).max(8).optional(),
  imageDrafts:z.array(imageDraftOriginSchema).max(8).optional(),
}).superRefine((doc, ctx) => {
  for(const node of doc.nodes)if((node.visual?.fillGradient||node.visual?.strokeGradient)&&!supportsGradient(node.kind))ctx.addIssue({code:'custom',message:'渐变暂用于形状和路径，文字、图标与接口不支持'})
  for(const container of doc.containers)if(container.visual?.fillGradient||container.visual?.strokeGradient)ctx.addIssue({code:'custom',message:'容器渐变暂不支持，请使用独立形状作为背景'})
  if(doc.imageDrafts&&new Set(doc.imageDrafts.map(d=>d.runId)).size!==doc.imageDrafts.length)ctx.addIssue({code:'custom',message:'AI 草稿来源不能重复'})
  for(const ref of doc.references)if(ref.generated){const origin=doc.imageDrafts?.find(d=>d.runId===ref.generated!.runId);if(origin&&origin.sha256!==ref.sha256)ctx.addIssue({code:'custom',message:'AI 草稿完整来源与图片不符'})}
  if(doc.compositionPlans&&new Set(doc.compositionPlans.map(p=>p.runId)).size!==doc.compositionPlans.length)ctx.addIssue({code:'custom',message:'图件绘图方案记录不能重复'})
  if(doc.referenceUses&&new Set(doc.referenceUses.map(r=>`${r.sha256}:${r.purpose}`)).size!==doc.referenceUses.length)ctx.addIssue({code:'custom',message:'参考用途记录不能重复'})
  if (new Set(doc.references.map(r => r.id)).size !== doc.references.length || new Set(doc.references.map(r => r.sha256)).size !== doc.references.length)
    ctx.addIssue({ code: 'custom', message: '参考图不能重复' })
  if (doc.references.reduce((sum, r) => sum + r.dataUrl.length, 0) > 1_200_000)
    ctx.addIssue({ code: 'custom', message: '参考图总容量超过工程限制，请先移除其他参考图' })
  const ids = new Set<string>()
  if(doc.nodes.filter(n=>!isPrimitive(n.kind)).length>60) ctx.addIssue({code:'custom',message:'科研节点最多 60 个；原生图元总数最多 240 个'})
  if(doc.nodes.reduce((sum,n)=>sum+(n.path?.points.reduce((s,p)=>s+1+Number(!!p.c1)+Number(!!p.c2),0)??0),0)>4096)ctx.addIssue({code:'custom',message:'路径锚点与控制点合计最多 4096 个'})
  for (const node of doc.nodes) {
    if (!isPrimitive(node.kind) && !node.label.trim()) ctx.addIssue({ code: 'custom', message: '科研节点标签不能为空' })
    if(!isPrimitive(node.kind)&&node.label.length>100) ctx.addIssue({code:'custom',message:'科研节点标签最多 100 字'})
    const units=node.metricScale??1
    if (!isPrimitive(node.kind) && (node.width < 80*units-1e-6 || node.height < 44*units-1e-6||node.width>360*units+1e-6||node.height>180*units+1e-6)) ctx.addIssue({ code: 'custom', message: '科研节点尺寸须符合当前缩放下的 80–360 × 44–180 基准范围' })
    if(isPrimitive(node.kind)&&node.kind!=='path'&&!node.interfaceFor&&(node.width<units-1e-6||node.height<units-1e-6)) ctx.addIssue({code:'custom',message:'图元尺寸至少为当前缩放下的 1 × 1 基准尺寸'})
    if(node.kind==='path'&&(!node.path||node.width+node.height<.001*units)) ctx.addIssue({code:'custom',message:'路径须含至少两个不同的点'})
    if(node.path&&!node.path.points.flatMap(p=>[p,...(p.c1?[p.c1]:[]),...(p.c2?[p.c2]:[])]).some(p=>Math.abs((p.x-node.path!.points[0]!.x)*node.width)+Math.abs((p.y-node.path!.points[0]!.y)*node.height)>.00001)) ctx.addIssue({code:'custom',message:'路径点不能全部重合'})
    if(node.path){
      if(node.path.points.some((p,i)=>p.c2&&!p.c1||(p.c1||p.c2)&&(i===0||p.move)))ctx.addIssue({code:'custom',message:'曲线控制点必须属于有效线段'})
      if(!node.path.points.some((p,i)=>i>0&&!p.move))ctx.addIssue({code:'custom',message:'路径至少包含一个可绘制线段'})
      if(node.path.points.some(p=>p.move||p.close)&&(node.path.start||node.path.end))ctx.addIssue({code:'custom',message:'闭合或复合路径不能绑定开放端点'})
      if(node.chart?.key&&(node.path.start||node.path.end))ctx.addIssue({code:'custom',message:'数据图表路径不能用作附着引线，请使用独立注释路径'})
    }
    if(node.kind!=='path'&&node.path) ctx.addIssue({code:'custom',message:'路径数据只能用于路径节点'})
    if(node.textLayout&&node.kind!=='text')ctx.addIssue({code:'custom',message:'文字变换只能用于文字节点'})
    if (node.kind === 'icon' && (!node.iconId || node.iconId === 'none')) ctx.addIssue({ code: 'custom', message: '图标节点须选择图标' })
  }
  const nodeIds = new Set(doc.nodes.filter(n=>n.kind!=='path').map(n => n.id))
  for (const element of [...doc.nodes, ...doc.edges, ...doc.containers]) {
    if (ids.has(element.id)) ctx.addIssue({ code: 'custom', message: '对象 ID 必须唯一' })
    ids.add(element.id)
  }
  for(const c of doc.containers)if(c.opacity!==undefined&&(c.role!=='component'||c.visual?.fill!=='none'||c.visual?.stroke!=='none'))ctx.addIssue({code:'custom',message:'组合透明度仅用于无外框的自由图元组'})
  const roots = doc.containers.filter(c => c.parentId === null)
  if (roots.length !== 1 || roots[0]?.id !== 'stage') ctx.addIssue({ code: 'custom', message: '工程必须有且只有一个 stage 根容器' })
  const containers = new Map(doc.containers.map(c => [c.id, c]))
  for(const container of doc.containers)if(container.reconstruction&&container.role!=='component')ctx.addIssue({code:'custom',message:'原图重建记录只能保存在自由图元组合中'})
  for(const container of doc.containers)if(container.dataChart&&(container.role!=='component'||container.reconstruction))ctx.addIssue({code:'custom',message:'数据图表配置仅用于独立的自由图元组合'})
  for(const node of doc.nodes) {
    if(node.socket&&(!node.interfaceFor||node.kind!=='port'||!node.label.trim()||node.label.length>40))ctx.addIssue({code:'custom',message:'命名接口须属于自由组合，名称为 1–40 字'})
    if(node.interfaceFor&&(node.kind!=='port'||node.interfaceFor!==node.parentId||containers.get(node.interfaceFor)?.role!=='component')) ctx.addIssue({code:'custom',message:'组件接口须属于对应的自由图元组合'})
    for(const binding of [node.path?.start,node.path?.end]) if(binding) {
      if(Math.abs(binding.offsetX??0)>24*(node.metricScale??1)+1e-6||Math.abs(binding.offsetY??0)>24*(node.metricScale??1)+1e-6)ctx.addIssue({code:'custom',message:'路径绑定偏移超过当前缩放下的 ±24 基准范围'})
      const target=doc.nodes.find(n=>n.id===binding.nodeId)
      if(!target||target.id===node.id||target.socket)ctx.addIssue({code:'custom',message:'路径绑定须引用其他有效图元；命名接口请使用语义连接'})
      else if(target.kind==='path'&&(!isClosedPathTarget(target)||binding.anchorIndex===undefined||binding.anchorIndex>=target.path!.points.length)||target.kind!=='path'&&binding.anchorIndex!==undefined)ctx.addIssue({code:'custom',message:'几何锚点须引用独立闭合路径中存在的锚点'})
    }
  }
  for(const container of doc.containers){const sockets=doc.nodes.filter(n=>n.interfaceFor===container.id&&n.socket);if(sockets.length>16)ctx.addIssue({code:'custom',message:'每个组件最多 16 个命名接口'});if(new Set(sockets.map(n=>n.socket!.key)).size!==sockets.length)ctx.addIssue({code:'custom',message:'同一组件的接口标识不能重复'})}
  for(const container of doc.containers)if(container.width<5*(container.metricScale??1)-1e-6||container.height<5*(container.metricScale??1)-1e-6)ctx.addIssue({code:'custom',message:'组合尺寸至少为当前缩放下的 5 × 5 基准尺寸'})
  for(const container of doc.containers) if(container.role!=='component'&&(container.width<200*(container.metricScale??1)-1e-6||container.height<120*(container.metricScale??1)-1e-6)) ctx.addIssue({code:'custom',message:'普通容器至少为当前缩放下的 200 × 120 基准尺寸'})
  for (const object of [...doc.nodes, ...doc.containers]) {
    if (object.parentId === null) continue
    const c = containers.get(object.parentId)
    if (!c) { ctx.addIssue({ code: 'custom', message: '对象必须引用有效父容器' }); continue }
    const inset=(c.role==='component'?2:12)*(c.metricScale??1),top=(c.role==='component'?2:48)*(c.metricScale??1)
    if ('interfaceFor' in object&&object.interfaceFor===c.id) continue
    if (object.x < c.x + inset - 0.001 || object.y < c.y + top - 0.001 || object.x + object.width > c.x + c.width - inset + 0.001 || object.y + object.height > c.y + c.height - inset + 0.001)
      ctx.addIssue({ code: 'custom', message: '对象必须位于父容器内容区' })
  }
  for (const group of doc.containers) {
    const seen = new Set([group.id])
    let parent = group.parentId
    while (parent !== null && parent !== 'stage') {
      if (seen.has(parent)) { ctx.addIssue({ code: 'custom', message: '容器层级不能循环' }); break }
      seen.add(parent)
      if (seen.size > 6) { ctx.addIssue({ code: 'custom', message: '容器最多支持六层嵌套' }); break }
      const ancestor = doc.containers.find(c => c.id === parent)
      if (!ancestor) break
      parent = ancestor.parentId
    }
  }
  for (const c of roots) {
    if (c.appearance && (c.appearance.preset !== 'inherit' || c.appearance.accent !== 'inherit' || c.appearance.paletteId && c.appearance.paletteId !== 'inherit' || c.appearance.colorIndex!==undefined || c.appearance.colorMap!==undefined)) ctx.addIssue({ code: 'custom', message: '根容器使用工程主题，子容器可设置局部覆盖' })
    if (c.x + c.width > doc.canvas.width || c.y + c.height > doc.canvas.height)
      ctx.addIssue({ code: 'custom', message: '容器超出画布' })
  }
  if(doc.edges.reduce((sum,e)=>sum+(e.manualRoute?.points.length??0),0)>512)ctx.addIssue({code:'custom',message:'全图指定连线折点最多 512 个'})
  for (const e of doc.edges) {
    if((e.routing==='manual')!==!!e.manualRoute)ctx.addIssue({code:'custom',message:'指定折点连线须同时保存 manual 路由与折点，自动模式不能带指定折点'})
    if(e.manualRoute){
      if(e.manualRoute.containerId!==edgeRouteContainer(doc,e.source,e.target)||!doc.containers.some(c=>c.id===e.manualRoute!.containerId))ctx.addIssue({code:'custom',message:'连线折点须使用当前共同容器的坐标'})
      else if(edgeWaypointPoints(doc,e).some(p=>p.x< -1e-6||p.x>1000+1e-6||p.y< -1e-6||p.y>620+1e-6))ctx.addIssue({code:'custom',message:'连线折点超出画板'})
    }
    const source=doc.nodes.find(n=>n.id===e.source),target=doc.nodes.find(n=>n.id===e.target)
    if(source?.socket&&(source.socket.direction==='input'||source.socket.side!==e.sourcePort)||target?.socket&&(target.socket.direction==='output'||target.socket.side!==e.targetPort))ctx.addIssue({code:'custom',message:'连接须遵循接口方向和固定边界'})
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target) || e.source === e.target)
      ctx.addIssue({ code: 'custom', message: '连接必须引用两个有效节点' })
  }
})
export type FigureDocument = z.infer<typeof figureDocumentSchema>
export function parseDocument(value: unknown): FigureDocument { const doc=figureDocumentSchema.parse(value);syncBindings(doc);return figureDocumentSchema.parse(doc) }
export const rootContainer = (doc: FigureDocument) => doc.containers.find(c => c.id === 'stage')!
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export function createBlank(): FigureDocument {
  return parseDocument({
    version: '0.2', title: '未命名图件', canvas: { width: 1000, height: 620 },
    containers: [{ id: 'stage', parentId: null, role: 'stage', title: 'Method overview', x: 40, y: 90, width: 920, height: 490 }],
    style: { preset: 'soft', roughness: 0.8, seed: 38191, accent: 'blue' }, nodes: [], edges: [],
  })
}

export function createExample(): FigureDocument {
  return parseDocument({
    version: '0.2', title: '检索增强生成架构', canvas: { width: 1000, height: 620 },
    containers: [{ id: 'stage', parentId: null, role: 'stage', title: 'Retrieval-augmented generation', x: 68, y: 112, width: 864, height: 490 }],
    style: { preset: 'soft', roughness: 0.8, seed: 38191, accent: 'blue', paletteId:defaultPaletteId },
    nodes: [
      { id: 'input', parentId: 'stage', kind: 'tokens', label: 'Input tokens', x: 105, y: 275, width: 136, height: 66 },
      { id: 'encoder', parentId: 'stage', kind: 'module', label: 'Encoder', description:'Hidden states', structure:{type:'encoder',repeats:6},visual:{colorIndex:1}, x: 290, y: 243, width: 140, height: 130 },
      { id: 'retriever', parentId: 'stage', kind: 'module', label: 'Retriever',description:'Top-k neighbors',structure:{type:'retriever'},visual:{colorIndex:2}, x: 490, y: 164, width: 150, height: 130 },
      { id: 'context', parentId: 'stage', kind: 'tensor', label: 'Context',description:'Relevant evidence',visual:{colorIndex:2}, x: 490, y: 366, width: 150, height: 66 },
      { id: 'fusion', parentId: 'stage', kind: 'module', label: 'Fusion',description:'Fused features',structure:{type:'fusion'},visual:{colorIndex:3}, x: 735, y: 243, width: 150, height: 130 },
    ],
    edges: [
      { id: 'e1', source: 'input', target: 'encoder', sourcePort: 'right', targetPort: 'left' },
      { id: 'e2', source: 'encoder', target: 'retriever', sourcePort: 'right', targetPort: 'left' },
      { id: 'e3', source: 'retriever', target: 'context', sourcePort: 'bottom', targetPort: 'top' },
      { id: 'e4', source: 'encoder', target: 'fusion', sourcePort: 'right', targetPort: 'left' },
      { id: 'e5', source: 'context', target: 'fusion', sourcePort: 'right', targetPort: 'left' },
    ],
  })
}

export const styles: { id: StyleId; name: string; subtitle: string }[] = [
  { id: 'precise', name: '规范细线', subtitle: '清晰 · 克制' },
  { id: 'soft', name: '柔和分组', subtitle: '淡色 · 圆角' },
  { id: 'header', name: '标题带', subtitle: '分区 · 层级' },
  { id: 'dashed', name: '虚线边界', subtitle: '边界 · 分组' },
  { id: 'bracket', name: '括号分组', subtitle: '开放 · 轻量' },
  { id: 'sketch', name: '手绘排线', subtitle: '笔触 · 可复现' },
]

export function anchor(node: FigureNode, side: Port): [number, number] {
  if(node.socket){const {side,position}=node.socket;return [node.x+node.width*(side==='left'?0:side==='right'?1:position),node.y+node.height*(side==='top'?0:side==='bottom'?1:position)]}
  if (side === 'left') return [node.x + (node.kind === 'projection' ? 9*(node.metricScale??1) : 0), node.y + node.height / 2]
  if (side === 'right') return [node.x + node.width - (node.kind === 'projection' ? 9*(node.metricScale??1) : 0), node.y + node.height / 2]
  if (side === 'top') return [node.x + node.width / 2, node.y]
  return [node.x + node.width / 2, node.y + node.height]
}
