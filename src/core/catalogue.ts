import {maxCanvasSize} from './canvasContract.ts'
import {paperPrimitives,paperRobot} from '../data/paperExamples.ts'
import {templateComponents} from '../data/templateComponents.ts'
import {recipeCompositionUse} from '../data/recipeComposition.ts'
import { z } from 'zod'
import { componentAssetSchema, instantiateComponentAt, scaleComponent, parseAsset, type ComponentAsset } from './assets.ts'
import { clone, createBlank, parseDocument, rootContainer,automaticEdgeRoutingSchema, type FigureDocument } from './model.ts'
import {attachmentAnchorInventory} from './paths.ts'
import { buildRecipe, componentRecipes,recipeIds } from '../data/recipes.ts'
import {isStructuralRecipe,structuralSemantics} from '../data/structuralFigures.ts'
import { componentSeeds } from '../data/components.ts'
import { exposedPorts, namedPorts } from './componentPorts.ts'
import { structurePreset } from './structures.ts'
import { chartOptionsSchema,chartToolUseSchema,type ChartToolUse } from './dataChartSchema.ts'
import { configureChartAsset } from './chartTool.ts'
import {setContainerEdgeRouting} from './edgeRouting.ts'
import {canColorContainer} from './containerColor.ts'
import {colorSlotInventory,setContainerColorMap,validateColorMapping} from './colorMapping.ts'
import {componentColorMapSchema} from './colorMappingContract.ts'
import {contentBounds,contains} from './geometry.ts'
import {fontFamilies} from '../data/materials.ts'

const id = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/)
export const catalogueEntrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('recipe'), id: z.enum(recipeIds) }),
  z.object({ kind: z.literal('seed'), id }).refine(value => componentSeeds.some(s => s.id === value.id), '未知基础组件'),
  z.object({ kind: z.literal('asset'), asset: componentAssetSchema }),
])
export type CatalogueEntry = z.infer<typeof catalogueEntrySchema>
export const catalogueSchema = z.array(catalogueEntrySchema).max(6).default([]).refine(entries => new Set(entries.map(catalogueKey)).size === entries.length, '参考组件不能重复')
export function catalogueKey(entry: CatalogueEntry): string { return entry.kind === 'asset' ? `asset:${entry.asset.id}` : `${entry.kind}:${entry.id}` }
const builtins = new Map<string, ComponentAsset>()
export function catalogueAsset(entry: CatalogueEntry, parameters?: Record<string, string | number>): ComponentAsset {
  if (entry.kind === 'asset') {
    if (parameters && Object.keys(parameters).length) throw new Error('我的组件保留手动编辑结果，不接受配方参数；请使用内置组合配方')
    return parseAsset(entry.asset)
  }
  if (entry.kind === 'recipe') {
    const recipe = componentRecipes.find(r => r.id === entry.id)!
    for (const key of Object.keys(parameters ?? {})) if (!recipe.fields.some(f => f.key === key)) throw new Error(`配方「${recipe.name}」不支持参数 ${key}`)
    return buildRecipe(recipe.id, { ...recipe.defaults, ...parameters })
  }
  if (parameters && Object.keys(parameters).length) throw new Error('基础组件不接受配方参数')
  const key = catalogueKey(entry), cached = builtins.get(key)
  if (cached) return clone(cached)
  const seed = componentSeeds.find(s => s.id === entry.id)
  if (!seed) throw new Error('基础组件不存在')
  const figure = createBlank(), root = rootContainer(figure), round = ['neuron','operator','ellipse','diamond'].includes(seed.kind)
  const height = seed.structure ? structurePreset(seed.structure.type).height :seed.kind==='path'?0: round ? 80 : 66, width = seed.structure ? 184 : round ? 80 : 140
  Object.assign(root, { x: 0, y: 0, width: Math.max(220,width+48), height: Math.max(160,height+76), title: seed.name })
  figure.title = seed.name
  figure.nodes.push({ id: seed.id, parentId: 'stage', kind: seed.kind, label: seed.label, x:(root.width-width)/2, y:seed.kind==='path'?90:58, width, height, ...(seed.visual ? {visual:seed.visual} : {}), ...(seed.structure ? {structure:seed.structure} : {}),...(seed.path?{path:seed.path}:{}) })
  const asset = parseAsset({ format: 'fastfigure.component', version: 1, id: `builtin-seed-${seed.id}`, name: seed.name, description: seed.note,
    tags: [seed.category, seed.kind, seed.label].filter(Boolean), createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z',
    sources: seed.reference ? [{ title: seed.reference.source === 'local-template' ? '模板合集20260627.pptx' : '用户提供的 ML 绘图素材', reference: seed.reference.description }] : [], lineage: [], figure })
  builtins.set(key, asset); return clone(asset)
}
export function createCatalogue(assets: ComponentAsset[]): CatalogueEntry[] {
  return [...componentRecipes.map(r => ({ kind: 'recipe' as const, id: r.id })), ...componentSeeds.map(s => ({ kind: 'seed' as const, id: s.id })), ...[...paperPrimitives(),paperRobot(),...templateComponents(),...assets].map(asset => ({ kind: 'asset' as const, asset }))]
}
export interface CatalogueItem { entry: CatalogueEntry; key: string; asset: ComponentAsset; score: number }
function tokens(value: string): string[] {
  const result = value.toLowerCase().match(/[a-z0-9]+|[\p{Script=Han}]+/gu) ?? []
  return [...new Set(result.flatMap(token => /^[\p{Script=Han}]+$/u.test(token) && token.length > 1 ? Array.from({ length: token.length - 1 }, (_, i) => token.slice(i, i + 2)) : [token]))]
}
export function searchCatalogue(entries: CatalogueEntry[], query: string): CatalogueItem[] {
  const terms = tokens(query)
  return entries.map((entry, index) => {
    const asset = catalogueAsset(entry), title = `${asset.name} ${asset.tags.join(' ')}`.toLowerCase()
    const description = `${asset.description} ${asset.figure.nodes.map(n => n.label).join(' ')}`.toLowerCase()
    const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 4 : description.includes(term) ? 1 : 0), 0)
    return { entry, key: catalogueKey(entry), asset, score, index }
  }).sort((a, b) => b.score - a.score || a.index - b.index)
}
export function recommendCatalogue(entries: CatalogueEntry[], query: string): CatalogueItem[] {
  const ranked=[...new Map(searchCatalogue(entries,query).map(item=>[item.key,item])).values()]
  const recent = ranked.filter(item => item.entry.kind === 'asset'&&!item.asset.id.startsWith('paper-')).sort((a, b) => b.asset.updatedAt.localeCompare(a.asset.updatedAt)).slice(0, 2)
  const positive=ranked.filter(item=>item.score>0),composite=/主图|复合|多种结构|概览.*(?:机制|细节)|整体.*局部|main\s*figure|overview.*(?:mechanism|detail)/i.test(query)
  if(!composite)return [...new Map([...positive,...recent,...ranked.filter(item=>item.entry.kind==='recipe'),...ranked].map(item=>[item.key,item])).values()].slice(0,6)
  const family=(item:CatalogueItem)=>item.entry.kind==='recipe'?recipeCompositionUse(item.entry.id)?.family??item.key:item.entry.kind==='seed'?`seed:${item.asset.figure.nodes[0]?.structure?.type??item.asset.figure.nodes[0]?.kind??item.key}`:item.key,selected:CatalogueItem[]=[],counts=new Map<string,number>(),pending=[...positive]
  // Keep relevance, while reducing saturation by near-equivalent recipe families. Never inject zero-score items ahead of a match.
  while(pending.length&&selected.length<6){
    let best=0;for(let i=1;i<pending.length;i++)if(pending[i]!.score/(1+.8*(counts.get(family(pending[i]!))??0))>pending[best]!.score/(1+.8*(counts.get(family(pending[best]!))??0)))best=i
    const item=pending.splice(best,1)[0]!,key=family(item);selected.push(item);counts.set(key,(counts.get(key)??0)+1)
  }
  const fallback=[...new Map([...recent,...ranked.filter(item=>item.entry.kind==='recipe'),...ranked].map(item=>[item.key,item])).values()].filter(item=>!selected.some(chosen=>chosen.key===item.key))
  // No relation is inferred from a fallback; the planner must explain whether each suggested component is useful.
  for(const item of fallback)if(selected.length<6&&!counts.has(family(item))){selected.push(item);counts.set(family(item),1)}
  for(const item of fallback)if(selected.length<6&&!selected.some(chosen=>chosen.key===item.key))selected.push(item)
  return selected
}
export function describeCatalogue(entries: CatalogueEntry[]) {
  return entries.map(entry => {
    const asset = catalogueAsset(entry), root = rootContainer(asset.figure),anchors=attachmentAnchorInventory(asset.figure)
    return { ...(asset.recipe?.id==='patch-embedding'?{patchEmbeddingSemantics:{scope:'Image patch tokenization before the encoder; no encoder, attention block or classifier is included.',order:'Row-major shown patches → flattened patches → one shared projection E → optionally prepend learned x_class → optionally add learned E_pos → encoder-input sequence.',counts:'grid controls shown schematic patches only. It does not determine symbolic H, W, P, C, N or D; N=HW/P² assumes H and W divisible by P. Vector cells and colors are illustrative, not pixels, weights or measured features.',variants:'Default includes CLS and learned positions. Disabling either is explicit and changes the displayed title/formula/dimensions. CLS adds a sequence row; it is not passed through patch projection.',ports:'image-in accepts the image; tokens-out returns the sequence, with the selected CLS/position configuration. It is not the final encoded representation.',labelId:'patch-title',formulaId:'patch-formula',noteId:'schematic-note'}}:{}),...(asset.recipe?.id==='scaled-attention'?{attentionSemantics:{scope:'Single-head scaled dot-product; no projection, residual or multi-head structure.',inputs:'Q, already-transposed Kᵀ, V. key-transpose-in accepts Kᵀ, not K.',order:'QKᵀ → divide by sqrt(d_k) → optional additive M → softmax over keys → multiply by V.',mask:'causal assumes Q and K share sequence positions; upper-triangle hatching marks zero output weights, not measured values.',counts:'Schematic grid counts are independent of symbolic dimensions; d_k and d_v need not be equal.',labelId:'attention-label',formulaId:'attention-formula',noteId:'schematic-note'}}:{}),...(asset.recipe?.id==='tensor-stack'?{illustrativeGeometry:{counts:'Illustrative slice/grid counts; not observations or scientific tensor dimensions.',native:'Independent rounded parallelogram paths, front-face grid, editable labels and named feature interfaces. Saved assets keep manual edits.',labelId:'tensor-label',noteId:'schematic-note'}}:{}),key: catalogueKey(entry), name: asset.name, description: asset.description, tags: asset.tags, width: root.width, height: root.height,scaleRange:{min:.1,max:4},
      nodes: asset.figure.nodes.map(n => ({ id: n.id, label: n.label, kind: n.kind,...(anchors.has(n.id)?{attachmentAnchors:anchors.get(n.id)}:{}),...(n.chart?{chart:n.chart}:{}) })), inputs: exposedPorts(asset.figure,'input').map(n=>n.id), outputs:exposedPorts(asset.figure,'output').map(n=>n.id),
      ports:namedPorts(asset.figure,'stage').map(n=>({nodeId:n.id,name:n.label,...n.socket})),
      parameters: entry.kind === 'recipe' ? componentRecipes.find(r => r.id === entry.id)!.fields.map(f => ({ key: f.key,label:f.label, options: f.options.map(o => o.value),...(f.when?{when:f.when}:{}) })) : [],
      defaults: entry.kind === 'recipe' ? componentRecipes.find(r => r.id === entry.id)!.defaults : {},
      sources: asset.sources,
      ...(asset.recipe&&recipeCompositionUse(asset.recipe.id)?{compositionUse:{...recipeCompositionUse(asset.recipe.id),basis:entry.kind==='recipe'?'native recipe':'source recipe; inspect saved manual edits before reuse'}}:{}),
      ...(asset.recipe&&isStructuralRecipe(asset.recipe.id)?{structureSemantics:{...structuralSemantics[asset.recipe.id],counts:'Counts control schematic items only. Labels are neutral placeholders; no observed data, quantitative widths or unsupported scientific relationships are inferred.',ports:'structure-left and structure-right are bidirectional composition-boundary interfaces, not scientific inputs or outputs.',editing:'Native shapes, labels, nested bands and bound paths remain independently editable. Reuse saved assets without parameters to retain hand edits; use a built-in recipe or a controlled recipe update to regenerate geometry.'}}:{}),
      defaultTheme:{available:canColorContainer(asset.figure,'stage'),paletteId:asset.figure.style.paletteId,colorIndex:asset.figure.style.colorIndex??0,explicitColorObjects:asset.figure.nodes.filter(n=>n.visual?.fill&&n.visual.fill!=='none'||n.visual?.stroke&&n.visual.stroke!=='none'||n.textStyle?.color).length,explicitSlotObjects:asset.figure.nodes.filter(n=>n.visual?.colorIndex!==undefined).length,nestedOverrides:asset.figure.containers.filter(c=>c.appearance).length},
      colorSlots:canColorContainer(asset.figure,'stage')?colorSlotInventory(asset.figure):[],
      ...(asset.figure.edges.length?{internalEdges:{count:asset.figure.edges.length,routingOptions:['straight','orthogonal'],modes:[...new Set(asset.figure.edges.map(e=>e.routing??'orthogonal'))]}}:{}),
      ...(root.dataChart?{dataChart:root.dataChart,chartOptions:{typography:{fontFamilies:[...fontFamilies],fontSize:{min:8,max:36,default:10},current:{fontFamily:root.dataChart.spec.fontFamily??'MiSans',fontSize:root.dataChart.spec.fontSize??10}},kind:root.dataChart.spec.kind==='boxplot'?['boxplot']:root.dataChart.spec.kind==='heatmap'?['heatmap']:['line','bar','scatter'],fields:['fontFamily','fontSize',...(root.dataChart.spec.kind==='boxplot'?['title','xLabel','yLabel','yMin','yMax','yScale','showValues','showSamples','grid','paletteId']:root.dataChart.spec.kind==='heatmap'?['title','xLabel','yLabel','valueLabel','colorMin','colorMax','colorCenter','showValues','grid','paletteId']:['title','xLabel','yLabel','xMin','xMax','yMin','yMax','xScale','yScale','showValues','grid','paletteId'])],autoRange:'xMin/xMax/yMin/yMax or heatmap colorMin/colorMax/colorCenter=null resets the corresponding bound/center',data:'Observations, series names, error meaning, note, data source and example status are fixed. Bar charts use categorical x and must include zero. Bar-to-line keeps categorical x. Scatter requires numeric x, permits repeats and never draws connecting lines. Boxplots only stay boxplots, with immutable raw observations, sample IDs and type-7 / 1.5-IQR rules. showSamples=false hides inlier overlays only; all outliers remain visible. Numeric line/scatter X/Y and boxplot Y permit positive-only log10. All raw values/error endpoints and bounds must be positive; no dropping/offset/clipping. Bar Y stays linear with zero baseline; categorical X ignores linear scale only and has no numeric bounds. Log10 changes geometry only, not the saved raw samples or the box statistics.'},chartEditing:'Last data-editor input snapshot, not statistics inferred from geometry. Manual mark edits do not update this snapshot. chartOptions explicitly redraws generated marks from the saved input and preserves added objects; omit it to reuse all saved manual edits. Changing observations requires the data chart editor.'}:{}),
    }
  })
}
const instanceFitSchema=z.object({width:z.number().finite().positive().max(maxCanvasSize),height:z.number().finite().positive().max(maxCanvasSize)}).strict()
export const componentInstanceSchema = z.object({
  id: z.string().min(1).max(30).regex(/^[a-zA-Z0-9_-]+$/), componentKey: z.string().min(1).max(100), parentId: id,
  x: z.number().finite().min(0).max(maxCanvasSize), y: z.number().finite().min(0).max(maxCanvasSize), keepAppearance: z.boolean().default(false),
  scale:z.number().finite().min(.1).max(4).optional(),
  fit:instanceFitSchema.optional(),
  title: z.string().trim().min(1).max(100).optional(),
  parameters: z.record(z.string().max(40), z.union([z.string().max(100), z.number().finite()])).refine(p => Object.keys(p).length <= 20).optional(),
  labels: z.record(id, z.string().trim().max(100)).optional(),
  chartOptions:chartOptionsSchema.optional(),
  edgeRouting:automaticEdgeRoutingSchema.optional(),
  colorMap:componentColorMapSchema.optional(),
}).refine(spec=>spec.scale===undefined||spec.fit===undefined,'实例 scale 与 fit 只能选择一种')
export type ComponentInstance = z.infer<typeof componentInstanceSchema>
const endpoint = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('node'), nodeId: id }),
  z.object({ scope: z.literal('instance'), instanceId: id, nodeId: id }),
  z.object({ scope: z.literal('port'), instanceId: id, port: z.enum(['input', 'output']), key:z.string().min(1).max(32).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/).optional(),index: z.number().int().min(0).max(239).default(0) }),
])
export const instanceLinkSchema = z.object({ id, source: endpoint, target: endpoint, sourcePort: z.enum(['left','right','top','bottom']), targetPort: z.enum(['left','right','top','bottom']),routing:automaticEdgeRoutingSchema.optional() })
export type InstanceLink = z.infer<typeof instanceLinkSchema>
export const componentUseSchema = z.object({ instanceId: id, componentKey: z.string(), name: z.string(), revision: z.string(), nodeCount: z.number().int(),scale:z.number().min(.1).max(4).optional(),fit:instanceFitSchema.optional(), parameters: z.record(z.string(), z.union([z.string(), z.number()])).optional(),chart:chartToolUseSchema.optional(),edgeRouting:automaticEdgeRoutingSchema.optional(),colorMap:componentColorMapSchema.optional() })
export type ComponentUse = z.infer<typeof componentUseSchema>
/** Deterministically expand selected snapshots. Any error rejects the complete candidate. */
export function composeCatalogue(figure: FigureDocument, entries: CatalogueEntry[], instances: ComponentInstance[], links: InstanceLink[],leaderIds:string[]=[]) {
  let candidate = parseDocument(figure)
  const ignoredCollisions=new Set(leaderIds)
  for(const id of ignoredCollisions){const node=candidate.nodes.find(n=>n.id===id);if(!node?.path||node.chart?.key||node.path.points.some(p=>p.move||p.close))throw new Error('只有开放注释引线可与复用图形交叠')}
  const catalogue = new Map(catalogueSchema.parse(entries).map(e => [catalogueKey(e), e]))
  const placed = new Map<string, { asset: ComponentAsset; nodeIds: Record<string, string>;aliases:Record<string,string> }>(), used: ComponentUse[] = []
  if (new Set(instances.map(i => i.id)).size !== instances.length) throw new Error('组件实例 ID 不能重复')
  const waiting = [...instances]
  while (waiting.length) {
    const index = waiting.findIndex(i => candidate.containers.some(c => c.id === i.parentId))
    if (index < 0) throw new Error('组件父容器不存在或实例之间存在循环依赖')
    const spec = waiting.splice(index, 1)[0]!, entry = catalogue.get(spec.componentKey)
    if (!entry) throw new Error(`组件未包含在本轮参考中：${spec.componentKey}`)
    if(spec.fit&&spec.scale!==undefined)throw new Error('实例 scale 与 fit 只能选择一种')
    let asset = clone(catalogueAsset(entry, spec.parameters));const declared=new Set(asset.figure.nodes.map(n=>n.id))
    let chart:ChartToolUse|undefined
    if(spec.chartOptions!==undefined){const configured=configureChartAsset(asset,spec.chartOptions);asset=configured.asset;chart=configured.use}
    if(spec.edgeRouting!==undefined&&!setContainerEdgeRouting(asset.figure,'stage',spec.edgeRouting).total)throw new Error('此组件没有可调整的内部语义连接')
    for (const [id, label] of Object.entries(spec.labels ?? {})) {
      const node = asset.figure.nodes.find(n => n.id === id)
      if (!node) throw new Error(`组件「${asset.name}」不存在节点 ${id}`)
      if(node.chart?.key&&asset.figure.containers.some(c=>c.dataChart))throw new Error('数据图表的生成标签须通过图表数据编辑器修改，不能只覆盖文字')
      node.label = label
    }
    if (spec.title) rootContainer(asset.figure).title = spec.title
    let scale=spec.scale
    if(spec.fit){
      const box=instanceFitSchema.parse(spec.fit),parent=candidate.containers.find(c=>c.id===spec.parentId)!,size=rootContainer(asset.figure)
      if(!contains(contentBounds(parent),{x:spec.x,y:spec.y,...box}))throw new Error('组件 fit 区域须完整位于父容器内容区')
      scale=Math.min(box.width/size.width,box.height/size.height)
    }
    if(scale!==undefined)asset=scaleComponent(asset,scale)
    if(spec.colorMap){validateColorMapping(asset.figure,'stage',spec.colorMap);setContainerColorMap(asset.figure,'stage',spec.colorMap,true)}
    const result = instantiateComponentAt(candidate, asset, spec.parentId, spec, spec.id, spec.colorMap?true:spec.keepAppearance,ignoredCollisions)
    candidate = result.document; placed.set(spec.id, { asset, nodeIds: result.nodeIds,aliases:Object.fromEntries(Object.entries(result.nodeIds).filter(([id])=>declared.has(id))) })
    used.push({ instanceId: spec.id, componentKey: spec.componentKey, name: asset.name, revision: asset.updatedAt, nodeCount: asset.figure.nodes.length,...(scale!==undefined?{scale}:{}),...(spec.fit?{fit:clone(spec.fit)}:{}), ...(asset.recipe ? { parameters: clone(asset.recipe.parameters) } : {}),...(chart?{chart}:{}),...(spec.edgeRouting?{edgeRouting:spec.edgeRouting}:{}),...(spec.colorMap?{colorMap:clone(spec.colorMap)}:{}) })
  }
  function resolve(ref: InstanceLink['source']): string {
    if (ref.scope === 'node') {
      if (!candidate.nodes.some(n => n.id === ref.nodeId)) throw new Error(`画布节点不存在：${ref.nodeId}`)
      return ref.nodeId
    }
    const instance = placed.get(ref.instanceId)
    if (!instance) throw new Error(`连接引用了不存在的实例：${ref.instanceId}`)
    const originalId = ref.scope === 'instance' ? ref.nodeId : (ref.key?exposedPorts(instance.asset.figure,ref.port).find(n=>n.socket?.key===ref.key):exposedPorts(instance.asset.figure,ref.port)[ref.index])?.id
    const id = originalId ? instance.nodeIds[originalId] : undefined
    if (!id) throw new Error(`实例 ${ref.instanceId} 的节点或输入输出序号不存在`)
    return id
  }
  candidate.edges.push(...links.map(link=>{const source=resolve(link.source),target=resolve(link.target);return{id:link.id,source,target,sourcePort:candidate.nodes.find(n=>n.id===source)?.socket?.side??link.sourcePort,targetPort:candidate.nodes.find(n=>n.id===target)?.socket?.side??link.targetPort,...(link.routing?{routing:link.routing}:{})}}))
  return { figure: parseDocument(candidate), used,nodeAliases:Object.fromEntries([...placed].map(([id,value])=>[id,value.aliases])) }
}
