import {clone,createExample,parseDocument,type FigureDocument} from './model.ts'
import {descendants,resolveStyle} from './geometry.ts'
import {containerSurface,setContainerSurface} from './containerSurface.ts'
import {paperTextStyle,isPaperStyle} from './paperStyle.ts'
import {defaultPaletteId,fontFamilies} from '../data/materials.ts'
import {colorMapKey} from './colorMappingContract.ts'
import {styleAssetSchema,type StyleAsset,type StyleUse} from './styleAssetContract.ts'
import type {CompositionRecord} from './compositionPlanContract.ts'
import {canvasContainerTextStyle,canvasNodeTextStyle} from './typography.ts'
import {applyLineStyle,lineStyleTargets} from './lineAppearance.ts'
import type {LinePreset} from './lineStyleContract.ts'
export {styleAssetSchema,type StyleAsset,type StyleUse} from './styleAssetContract.ts'

const identity=()=>{const now=new Date().toISOString();return{format:'fastfigure.style' as const,version:1 as const,id:`style-${crypto.randomUUID()}`,name:'我的论文风格',description:'',tags:[],createdAt:now,updatedAt:now}}
/** Only author-selected line channels are applied; missing targets are a reported no-op. */
function applyStyleLines(figure:FigureDocument,preset:LinePreset|undefined,containerId:string){
  if(!preset)return undefined
  const targets=lineStyleTargets(figure,[containerId],true,preset.scope),ids=[...targets.edges.map(e=>e.id),...targets.paths.map(p=>p.id)]
  const changed=ids.length?applyLineStyle(figure,ids,false,preset.style).changed:0
  return{total:ids.length,changed,skipped:targets.skipped.length}
}
export function captureStyleAsset(figure:FigureDocument,containerId='stage'):StyleAsset{
  const scope=figure.containers.find(c=>c.id===containerId);if(!scope)throw new Error('请选择要保存风格的容器')
  const appearance=resolveStyle(figure,containerId),first=descendants(figure,containerId).find(n=>'kind' in n&&n.textStyle?.family)
  const family=appearance.fontFamily??(first&&'kind' in first?first.textStyle?.family:undefined)
  return styleAssetSchema.parse({...identity(),preset:appearance.preset,...(appearance.designSystem?{designSystem:appearance.designSystem}:{}),...(appearance.paperTheme?{paperTheme:clone(appearance.paperTheme)}:{}),...(appearance.fontRoles?{fontRoles:clone(appearance.fontRoles)}:{}),...(appearance.sketchStyle?{sketchStyle:appearance.sketchStyle}:{}),roughness:appearance.roughness,...(appearance.colorMap?{colorMap:clone(appearance.colorMap)}:{}),...(appearance.colorIndex!==undefined?{colorIndex:appearance.colorIndex}:{}),surface:containerSurface(scope),paletteId:appearance.paletteId??defaultPaletteId,fontFamily:fontFamilies.includes(family as typeof fontFamilies[number])?family:appearance.fontFamily??'MiSans',guide:'按模块语义分配颜色，保留简洁注释与可识别结构。',references:(figure.referenceUses??[]).filter(r=>r.purpose==='style'),origin:{kind:'canvas',title:scope.title}})
}
export function styleFromCompositionDraft(record:CompositionRecord):StyleAsset{
  if(record.plan.status!=='ready')throw new Error('请先明确方案问题，再保存风格')
  const {designSystem,paperTheme,fontRoles,preset,paletteId,fontFamily,usage,surface,colorIndex,colorMap,roughness,sketchStyle}=record.plan.style
  return {...identity(),name:record.plan.title,designSystem,paperTheme,fontRoles,preset,paletteId,fontFamily,...(sketchStyle?{sketchStyle}:{}),...(roughness!==undefined?{roughness}:{}),...(colorMap?{colorMap:clone(colorMap)}:{}),...(colorIndex!==undefined?{colorIndex}:{}),surface:surface??'plain',...(record.styleReference?.lineStyle?{lineStyle:clone(record.styleReference.lineStyle)}:{}),guide:usage,references:[...new Map([...(record.styleReference?.references??[]),...record.references.filter(r=>r.purpose==='style'&&r.decision==='use')].map(r=>[r.sha256,r])).values()],origin:{kind:'plan',title:record.plan.title,runId:record.runId}}
}
export const styleFromComposition=(record:CompositionRecord)=>styleAssetSchema.parse(styleFromCompositionDraft(record))
export function mergeStyleUses(previous:StyleUse[]|undefined,use:StyleUse):StyleUse[]{
  const uses=[...(previous??[]).filter(r=>!(r.asset.id===use.asset.id&&r.asset.updatedAt===use.asset.updatedAt&&r.target.id===use.target.id&&r.application===use.application)),clone(use)]
  return uses.slice(-8)
}
export function recordHarnessStyle(figure:FigureDocument,input:StyleAsset):FigureDocument{
  const asset=styleAssetSchema.parse(input)
  const actual=resolveStyle(figure,'stage')
  if(asset.paperTheme&&JSON.stringify(actual.paperTheme)!==JSON.stringify(asset.paperTheme))throw new Error('候选图的主题尺寸或轮廓与所选风格不符')
  if((actual.designSystem??'legacy')!==(asset.designSystem??'legacy')||JSON.stringify(actual.fontRoles)!==JSON.stringify(asset.fontRoles))throw new Error('候选图的字体角色或视觉体系与所选风格不符')
  if((asset.sketchStyle&&actual.sketchStyle!==asset.sketchStyle)||(asset.roughness!==undefined&&actual.roughness!==asset.roughness)||colorMapKey(actual.colorMap)!==colorMapKey(asset.colorMap)||(actual.colorIndex??0)!==(asset.colorIndex??0)||figure.style.preset!==asset.preset||figure.style.paletteId!==asset.paletteId||actual.preset!==asset.preset||actual.paletteId!==asset.paletteId||containerSurface(figure.containers.find(c=>c.id==='stage')!)!==(asset.surface??'plain'))throw new Error('候选图的基础配色、容器样式或填充与所选风格不符，请核对后重新生成')
  const result=clone(figure),lines=applyStyleLines(result,asset.lineStyle,'stage');result.styleUses=mergeStyleUses(result.styleUses,{asset,application:'harness',target:{id:'stage',title:result.title},appliedAt:new Date().toISOString(),typography:'preferred',textNodes:0,skippedTextNodes:0,...(lines?{lines}:{})});return parseDocument(result)
}
export function applyStyleAsset(figure:FigureDocument,input:StyleAsset,containerId='stage',typography=true){
  const asset=styleAssetSchema.parse(input),result=clone(figure),target=result.containers.find(c=>c.id===containerId);if(!target)throw new Error('目标容器已不存在')
  if(containerId==='stage'){result.style.preset=asset.preset;result.style.paletteId=asset.paletteId;result.style.colorIndex=asset.colorIndex;result.style.colorMap=asset.colorMap?clone(asset.colorMap):undefined}else target.appearance={accent:'inherit',...target.appearance,preset:asset.preset,paletteId:asset.paletteId,colorIndex:asset.colorIndex??0,colorMap:clone(asset.colorMap??[])}
  if(containerId==='stage'){result.style.sketchStyle=asset.sketchStyle;if(asset.roughness!==undefined)result.style.roughness=asset.roughness;if(typography)result.style.fontFamily=asset.fontFamily}else{target.appearance!.sketchStyle=asset.sketchStyle;target.appearance!.roughness=asset.roughness;if(typography)target.appearance!.fontFamily=asset.fontFamily}
  if(containerId==='stage'){result.style.designSystem=asset.designSystem??'legacy';result.style.paperTheme=asset.paperTheme?clone(asset.paperTheme):undefined;result.style.fontRoles=asset.fontRoles?clone(asset.fontRoles):undefined}else{target.appearance!.designSystem=asset.designSystem??'legacy';target.appearance!.paperTheme=asset.paperTheme?clone(asset.paperTheme):undefined;target.appearance!.fontRoles=asset.fontRoles?clone(asset.fontRoles):undefined}
  const ids=new Set([containerId,...descendants(result,containerId).map(n=>n.id)]),chartIds=new Set(result.containers.filter(c=>c.dataChart).flatMap(c=>[c.id,...descendants(result,c.id).map(o=>o.id)]));let textNodes=0,skippedTextNodes=0
  if(!chartIds.has(containerId))setContainerSurface(target,asset.surface??'plain')
  if(!typography){
    for(const c of result.containers){
      if(!ids.has(c.id)||chartIds.has(c.id))continue
      const original=figure.containers.find(o=>o.id===c.id)!,old=canvasContainerTextStyle(original,resolveStyle(figure,c.id)),next=canvasContainerTextStyle(c,resolveStyle(result,c.id))
      if(old.family!==next.family||old.size!==next.size)c.textStyle={...c.textStyle,family:old.family,size:old.size}
    }
    for(const node of result.nodes){
      if(!ids.has(node.id)||['path','port','image'].includes(node.kind)||chartIds.has(node.id))continue
      const original=figure.nodes.find(n=>n.id===node.id)!,before=resolveStyle(figure,node.parentId),after=resolveStyle(result,node.parentId)
      for(const description of [false,true]){
        if(description&&!node.description)continue
        const old=canvasNodeTextStyle(original,description,before),next=canvasNodeTextStyle(node,description,after),field=description?'descriptionStyle':'textStyle'
        if(old.family!==next.family||old.size!==next.size)node[field]={...node[field],family:old.family,size:old.size}
      }
    }
  }
  const themedSizes=asset.designSystem==='paper'&&asset.preset!=='sketch'
  if(typography)for(const c of result.containers){if(ids.has(c.id)&&!chartIds.has(c.id)){const original=figure.containers.find(o=>o.id===c.id)!;c.textStyle={...c.textStyle,...(!themedSizes?{size:canvasContainerTextStyle(original,resolveStyle(figure,c.id)).size}:original.textStyle?.size!==undefined?{size:original.textStyle.size}:{}),family:asset.designSystem==='paper'&&asset.preset!=='sketch'?paperTextStyle(resolveStyle(result,c.id),'heading').family:asset.fontFamily}}}
  if(typography)for(const node of result.nodes){
    if(!ids.has(node.id)||['path','port','image'].includes(node.kind))continue
    const original=figure.nodes.find(o=>o.id===node.id)!,theme=resolveStyle(figure,node.parentId)
    if(chartIds.has(node.id)||node.textLayout){
      // Freeze an inherited font before changing its container default. The
      // positioned glyph must keep its appearance even without an explicit face.
      const before=resolveStyle(figure,node.parentId).fontFamily??'MiSans',after=resolveStyle(result,node.parentId).fontFamily??'MiSans'
      if(before!==after){if(node.label&&!node.textStyle?.family)node.textStyle={...node.textStyle,size:canvasNodeTextStyle(original,false,theme).size,family:before};if(node.description&&!node.descriptionStyle?.family)node.descriptionStyle={...node.descriptionStyle,size:canvasNodeTextStyle(original,true,theme).size,family:before}}
      skippedTextNodes++;continue
    }
    node.textStyle={...node.textStyle,...(!themedSizes?{size:canvasNodeTextStyle(original,false,theme).size}:original.textStyle?.size!==undefined?{size:original.textStyle.size}:{}),family:asset.designSystem==='paper'&&asset.preset!=='sketch'?paperTextStyle(resolveStyle(result,node.parentId),node.textRole??(node.structure||node.kind==='module'?'heading':'body')).family:asset.fontFamily};if(node.description)node.descriptionStyle={...node.descriptionStyle,...(!themedSizes?{size:canvasNodeTextStyle(original,true,theme).size}:original.descriptionStyle?.size!==undefined?{size:original.descriptionStyle.size}:{}),family:isPaperStyle(resolveStyle(result,node.parentId))?paperTextStyle(resolveStyle(result,node.parentId),'caption').family:asset.fontFamily};textNodes++
  }
  const lines=applyStyleLines(result,asset.lineStyle,containerId)
  const use:StyleUse={asset,application:'manual',target:{id:containerId,title:target.title},appliedAt:new Date().toISOString(),typography:typography?'applied':'unchanged',textNodes,skippedTextNodes,...(lines?{lines}:{})};result.styleUses=mergeStyleUses(result.styleUses,use)
  return{figure:parseDocument(result),use}
}
export const stylePreview=(asset:StyleAsset)=>applyStyleAsset(createExample(),asset).figure
