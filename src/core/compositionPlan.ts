import {paperDesignGuide,paperPaletteId} from './paperStyle.ts'
import {scientificFigureDesign} from '../data/scientificPresentation.ts'
import {mainFigureStrategies} from '../data/mainFigureStrategies.ts'
import {validateCompositionLayout} from './compositionLayout.ts'
import {z} from 'zod'
import {colorPalettes,fontFamilies,defaultPaletteId} from '../data/materials.ts'
import {styleIds} from './styleIds.ts'
import {catalogueAsset,catalogueKey,describeCatalogue,type CatalogueEntry} from './catalogue.ts'
import {compositionPlanSchema,compositionRecordSchema,type CompositionRecord} from './compositionPlanContract.ts'
import {referenceInputPrompt,referenceNotesSchema,resolveReferenceNotes,type ReferenceInputInfo} from './referenceInputs.ts'
import {containerSurface} from './containerSurface.ts'
import {canColorContainer,setContainerColor} from './containerColor.ts'
import {validateColorMapping} from './colorMapping.ts'
import {colorMapKey,colorSlotKey} from './colorMappingContract.ts'
import {clone,parseDocument,type FigureDocument} from './model.ts'
import type {StyleAsset} from './styleAssetContract.ts'
import type {ComponentUse} from './catalogue.ts'

export function compositionSources(entries:CatalogueEntry[]){return entries.map(entry=>{const asset=catalogueAsset(entry);return{key:catalogueKey(entry),name:asset.name,revision:asset.updatedAt,nodeCount:asset.figure.nodes.length}})}
export function compositionPlanPrompt(content:string,catalogue:CatalogueEntry[],references:ReferenceInputInfo[],styleReference?:StyleAsset){
  const preferred=new Set([paperPaletteId,defaultPaletteId,...(styleReference?[styleReference.paletteId]:[]),'figureforge-publication-soft','figureforge-tableau10',...catalogue.flatMap(e=>e.kind==='asset'&&e.asset.figure.style.paletteId?[e.asset.figure.style.paletteId]:[])]),palettes=[...colorPalettes.filter(p=>preferred.has(p.id)),...colorPalettes.filter(p=>!preferred.has(p.id)).slice(0,12)]
  return `你是 FastFigure 的计算机论文插图规划助手。先提出可审阅的绘图方案，本轮不生成图体、不写文件、不执行命令。结合用户研究目标、实际附图和原生组件清单，说明结构图示、简洁注释、分区层次、留白和配色角色，避免只在方框里放短文字。不得从配图推断未提供的实验值或科学关系；信息不足时 status=needs-input，列出必须补充的问题。方案 ready 仍需用户采用，不代表科学或视觉质量已验证。
规划遵循“论点→分区作用→合适结构→整体编排”。复杂论文主图通常组合总体概览、核心机制和必要的局部解释：例如分层概览 + 编解码/张量细节 + 对照矩阵；选择依赖内容的真实关系，禁止为凑种类堆模板或把所有内容都变成箭头流程。简单问题允许单一结构。先选一个主视觉，其他分区辅助它；统一符号、同义配色与字号层级，保留跨区通道和留白，避免每个小图都加重复标题。
近期已录用论文的可选编排策略（已核对录用来源；迁移叙事方法，不复制原图或凭空加入模块）：${JSON.stringify(mainFigureStrategies)}。先判断适配条件，说明采用哪些组合及理由；不要求每张图同时包含所有区或增加结构种类。主图可用任务／结果展示与核心架构各自叙述；共享颜色、身份和阅读轴建立对应。重复括框 ×L、记忆状态推进、训练参数迁移是不同关系，不共用一条含混的返回箭头。
默认视觉体系：${paperDesignGuide}。没有用户指定风格时，plan.style 使用 designSystem=paper、preset=precise、paletteId=paper-reference、fontFamily=MiSans；可用 fontRoles 为 heading/body/caption/math/code 指定清单字体。
视觉设计要求：${JSON.stringify(scientificFigureDesign)}。visual 和 rationale 不只列结构名，还须说明哪些内容形成主视觉、不同对象采用何种有依据的轮廓、哪些区域无需外框；不能以“原生可编辑／无截断”代替视觉质量。
每个新方案分区必须包含 design={role:overview/mechanism/detail/context/evidence,structure:layered/hierarchy/pipeline/network/tensor/matrix/cycle/radial/encoder-decoder/comparison/overlap/concentric/temporal-memory/alternating-attention/custom,rationale:为什么该结构适合本区内容与整体论点,emphasis:primary/supporting,frame:{id:绘制时的根级容器ID,x,y,width,height}}。frame 坐标为根容器内容区内 0..1 比例（不是画布比例），宽高≥0.05，必须完整在内容区且各分区不重叠，独立给局部解释留位。全图恰有一个 primary；阅读顺序、比例和密度应支持这个重点，不要求主区面积机械最大。structure=custom 时说明具体几何组织。生成阶段将检查实际分区位置比例（2px容差）、可见内容和组件归属，不能仅写在 layout 中。分区 frame.id 唯一、不能是 stage，可与本区唯一素材的实例 id 相同，否则新建透明 component 容器作为外框。
connections 每项必须加 kind=dataflow/feedback/detail/comparison/membership/parameter-transfer。数据流和反馈须生成方向正确的真实跨区 edge 或两端绑定 path；detail 生成无箭头绑定引线，明确是实际选区快照还是概念解释，不暗示新增数据流。概念解释若用同名阶段／符号／对应标记关联而无需引线，可用 membership 并说明对应关系；重排的新内容不能称为真实放大。parameter-transfer 表示训练后迁移参数／初始化，须画方向正确的单向虚线连接，说明复制哪些参数，不能以数据流、样本传送、同一时刻共享权重或持续同步代替；训练阶段的损失／教师／解码器是否保留到推理须明确。comparison 通常用对齐和共同图例，membership 用明确包含/分组说明，不机械加箭头；程序不自动证明这两类科学关系。核对项须包含结构适配、叙事层次、跨区对应、文字密度和来源限制。
只返回 JSON：{"message":"简短解释","plan":{"status":"ready或needs-input","title":"方案名","goal":"拟表达的研究内容","readingOrder":"left-to-right/top-to-bottom/panels/radial","layout":"分区、留白、比例和阅读层次","style":{"preset":"容器样式ID","paletteId":"配色ID","fontFamily":"字体ID","surface":"plain/hatch/transparent","colorIndex":0,"usage":"颜色与线条承担的角色"},"sections":[{"id":"input","title":"分区标题","purpose":"内容作用","visual":"图示结构，不是裸方框","design":{"role":"mechanism","structure":"custom","rationale":"结构选择如何服务论点","emphasis":"primary","frame":{"id":"mechanism-region","x":0,"y":0,"width":1,"height":1}},"components":[{"id":"mlp","key":"清单素材key","colorIndex":1,"parameters":{}}],"referenceImages":[],"annotations":[]}],"connections":[],"checks":["绘制后需核对的事项"],"questions":[],"uncertainties":[]},"referenceNotes":[]}。
style 可选 sketchStyle=comic/xkcd/excalidraw/drawio（preset=sketch 时启用）、roughness=0..2；绘制时同步到 figure.style，默认字体使用 fontFamily，仍可逐对象调整。分区1–6个，ID唯一，连接最多12条且只能指向不同的已声明分区。sections.components 是该分区计划新插入复用的素材，每项 id 不能为 stage，须是全方案唯一的实例标识（1–30位字母、数字、下划线、短横线），绘制时 instances.id 必须保持。每项 key 只能用本轮清单；colorIndex 可选，是 plan.style.paletteId 中从0开始的实际色槽，用于该组件的默认主题色；例如“处理用蓝色”须找到蓝色色槽并写入此字段，不能只写在 usage。程序在生成后绑定该实例的默认填充、描边和内部连接颜色，几何、文字、手工颜色、对象显式色槽及内层样式覆盖保持。数据图表不能使用此字段，保留自己的系列和数值色阶。省略 colorIndex 时保留素材/继承的默认色。plan.style.colorIndex 是全图默认色槽，省略为0。多色素材可选 colorMap=[{sourcePaletteId,sourceIndex,targetPaletteId,targetIndex,role}]，最多12项，须来自该素材 colorSlots 清单，targetPaletteId 必须是 plan.style.paletteId，role 简述其视觉角色（不得据颜色推断科学含义）。sourceIndex/targetIndex 从0开始；同源色槽不能重复，映射同时进行，不连锁。它可映射对象显式 visual.colorIndex，保留固定 RGB、文字和几何。程序按源素材配色展开，再应用映射；不与本组件 colorIndex 混用。数据图表不能使用。内层自带颜色映射仍优先。plan.style.colorMap 如来自风格素材须完整保持，省略视为空。仅 recipe 类型可给 parameters，使用清单中参数名与选项。未指定参数则使用其默认值，程序会展开为明确的规范参数，绘制阶段按素材及参数数量校验。不采用素材则空数组，不猜展开后的节点ID。referenceImages 只用实际图片图号，且该图 referenceNotes.decision 必须为 use；不适合的图明确 omit，不将其绑定到分区。每张采用图片至少说明一个对应分区。questions 在 ready 时为空，在 needs-input 时至少一项。不要添加 figure、instances、SVG、数值数据或源元信息。
可用样式：${JSON.stringify(styleIds)}；字体：${JSON.stringify(fontFamilies)}；本轮配色候选：${JSON.stringify(palettes.map(p=>({id:p.id,name:p.title,colors:p.colors})))}
${styleReference?`风格素材快照：${JSON.stringify(styleReference)}\nplan.style 的 designSystem、paperTheme、fontRoles、preset、paletteId、fontFamily、sketchStyle、roughness、surface（省略为 plain）和 colorIndex（省略为0）须与风格素材一致；colorMap 也须完整一致，结合 guide 描述用法。保存来源没有实际附图，不得声称本轮看到这些来源图片。`:''}
清单中的 compositionUse 提供适用的叙事角色、结构族和误用边界。自动推荐可能包含互补或相近的候选，不是必须全部采用；按研究内容选择，解释保留理由。不得从同在清单推断组件间存在真实科学关系。
本轮原生组件清单：${JSON.stringify(describeCatalogue(catalogue))}
${referenceInputPrompt(references)}
用户要求：${content}`
}
export function parseCompositionPlanResponse(raw:string,runId:string,userGoal:string,catalogue:CatalogueEntry[],references:ReferenceInputInfo[],styleReference?:StyleAsset,options:{layoutPolicy?:'require'|'legacy'}={}){
  const text=raw.trim(),fence=/^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text)
  let value:unknown;try{value=JSON.parse(fence?.[1]??text)}catch{throw new Error('模型未返回有效的绘图方案 JSON')}
  const parsed=z.object({message:z.string().trim().min(1).max(5000),plan:compositionPlanSchema,referenceNotes:referenceNotesSchema.optional()}).strict().safeParse(value)
  if(!parsed.success)throw new Error(`绘图方案不符合契约：${[...new Set(parsed.error.issues.map(i=>i.message))].slice(0,3).join('；')}`)
  if(parsed.data.plan.status==='ready'&&options.layoutPolicy!=='legacy'&&parsed.data.plan.sections.some(section=>!section.design))throw new Error('新绘图方案须声明每个分区的结构选择、主次和可核对版面，请重新规划')
  const referenceUse=resolveReferenceNotes(parsed.data.referenceNotes,references),components=compositionSources(catalogue),entries=new Map(catalogue.map(c=>[catalogueKey(c),c])),used=new Set<number>()
  for(const section of parsed.data.plan.sections){
    for(const component of section.components){const entry=entries.get(component.key);if(!entry)throw new Error(`方案引用了本轮清单之外的组件：${component.key}`);const asset=catalogueAsset(entry,component.parameters);if(component.colorMap)validateColorMapping(asset.figure,'stage',component.colorMap);if(component.colorIndex!==undefined&&!canColorContainer(asset.figure,'stage'))throw new Error('数据图表不能绑定组件默认主题色，请使用图表配色工具');if(entry.kind==='recipe')component.parameters={...asset.recipe!.parameters};else delete component.parameters}
    for(const index of section.referenceImages){if(!referenceUse.some(r=>r.index===index&&r.decision==='use'))throw new Error('方案分区只能使用本轮已采用的参考图号');used.add(index)}
  }
  if(referenceUse.some(r=>r.decision==='use'&&!used.has(r.index)))throw new Error('已采用参考图须对应至少一个方案分区')
  if(styleReference&&(['designSystem','paperTheme','fontRoles','preset','paletteId','fontFamily','surface','sketchStyle','roughness'] as const).some(key=>JSON.stringify(parsed.data.plan.style[key]??'plain')!==JSON.stringify(styleReference[key]??'plain')))throw new Error('方案与用户指定的风格素材不符')
  if(styleReference&&(parsed.data.plan.style.colorIndex??0)!==(styleReference.colorIndex??0))throw new Error('方案与用户指定风格的默认主题色不符')
  if(styleReference&&colorMapKey(parsed.data.plan.style.colorMap)!==colorMapKey(styleReference.colorMap))throw new Error('方案与风格素材的颜色映射不符')
  const compositionRecord=compositionRecordSchema.parse({version:1,runId,userGoal,plan:parsed.data.plan,references:referenceUse,components,...(styleReference?{styleReference}:{})})
  return{message:parsed.data.message,compositionRecord,referenceUse}
}
export function mergeCompositionRecords(previous:CompositionRecord[]|undefined,record:CompositionRecord){
  if(record.plan.status!=='ready')throw new Error('请先补充方案问题，再采用可绘制方案')
  const records=[...(previous??[]).filter(p=>p.runId!==record.runId),record]
  if(records.length>4)throw new Error('图件最多保留 4 份绘图方案，请先在属性栏精简记录')
  return records
}
export function validateCompositionCandidate(record:CompositionRecord,figure:FigureDocument,used:ComponentUse[]){
  if(record.plan.style.paperTheme&&JSON.stringify(record.plan.style.paperTheme)!==JSON.stringify(figure.style.paperTheme))throw new Error('候选图的主题尺寸或轮廓与采用方案不符')
  if(record.plan.style.designSystem&&record.plan.style.designSystem!==(figure.style.designSystem??'legacy')||record.plan.style.fontRoles&&JSON.stringify(record.plan.style.fontRoles)!==JSON.stringify(figure.style.fontRoles))throw new Error('候选图的视觉体系或字体角色与采用方案不符')
  if((record.plan.style.sketchStyle&&figure.style.sketchStyle!==record.plan.style.sketchStyle)||(record.plan.style.roughness!==undefined&&figure.style.roughness!==record.plan.style.roughness)||colorMapKey(figure.style.colorMap)!==colorMapKey(record.plan.style.colorMap)||figure.style.paletteId!==record.plan.style.paletteId||figure.style.preset!==record.plan.style.preset||(figure.style.colorIndex??0)!==(record.plan.style.colorIndex??0)||containerSurface(figure.containers.find(c=>c.id==='stage')!)!==(record.plan.style.surface??'plain'))throw new Error('候选图的基础配色、容器样式或填充与采用方案不符，请按方案重新生成')
  const remaining=[...used]
  for(const section of record.plan.sections)for(const component of section.components){const index=remaining.findIndex(use=>use.instanceId===component.id&&use.componentKey===component.key&&(!component.parameters||compositionSnapshotKey(component.parameters)===compositionSnapshotKey(use.parameters??{})));if(index<0)throw new Error(`候选未按方案复用原生素材、实例标识或配方参数：${component.key}`);const use=remaining[index]!;if(colorMapKey(component.colorMap)!==colorMapKey(use.colorMap))throw new Error('候选组件颜色映射与采用方案不符');for(const row of component.colorMap??[]){const actual=figure.containers.find(c=>c.id===component.id)?.appearance?.colorMap?.find(r=>colorSlotKey(r)===colorSlotKey(row));if(!actual||colorMapKey([actual])!==colorMapKey([row]))throw new Error('候选未应用方案颜色映射')}remaining.splice(index,1)}
  if(remaining.length)throw new Error('候选新增了方案之外的素材，请重新核对方案')
  validateCompositionLayout(record.plan,figure)
}
export function applyCompositionRecord(figure:FigureDocument,record:CompositionRecord,used:ComponentUse[]):FigureDocument{
  validateCompositionCandidate(record,figure,used)
  const result=clone(figure)
  result.containers.find(container=>container.id==='stage')!.title=record.plan.title
  for(const section of record.plan.sections)for(const component of section.components)if(component.colorIndex!==undefined)setContainerColor(result,component.id,component.colorIndex,record.plan.style.paletteId)
  result.compositionPlans=mergeCompositionRecords(result.compositionPlans,record)
  return parseDocument(result)
}
/** Compare plain serialized snapshots independent of property order or omitted undefined fields. */
export function compositionSnapshotKey(value:unknown):string{
  const plain=JSON.parse(JSON.stringify(value)) as unknown
  const stable=(item:unknown):string=>Array.isArray(item)?`[${item.map(stable).join(',')}]`:item&&typeof item==='object'?`{${Object.entries(item).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>`${JSON.stringify(key)}:${stable(v)}`).join(',')}}`:JSON.stringify(item)
  return stable(plain)
}
export const compositionBaseKey=(figure:FigureDocument)=>compositionSnapshotKey({...figure,compositionPlans:undefined})
