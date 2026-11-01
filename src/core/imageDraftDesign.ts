import {compositionConnectionLabels,compositionRoles,compositionStructures,type CompositionRecord} from './compositionPlanContract.ts'
import {draftStyleSchema,imageDraftCompositionSchema,type ImageDraftInput} from './imageDraftContract.ts'
import type {FigureDocument} from './model.ts'
import type {ReferenceInputInfo} from './referenceInputs.ts'

export function imageDraftPlanStyle(record:CompositionRecord){
  const {usage,...style}=record.plan.style
  return draftStyleSchema.parse({id:`plan-${record.runId}`,name:record.plan.title,updatedAt:record.styleReference?.updatedAt??new Date().toISOString(),...style,guide:usage,lineStyle:record.styleReference?.lineStyle})
}

export function imageDraftPlanReferences(record:CompositionRecord,figure:Pick<FigureDocument,'references'>):ImageDraftInput['references']{
  return record.references.filter(r=>r.decision==='use').sort((a,b)=>a.index-b.index).map(source=>{
    const ref=figure.references.find(r=>r.id===source.id)
    if(!ref||ref.sha256!==source.sha256||ref.pixelWidth!==source.width||ref.pixelHeight!==source.height)throw new Error('方案参考图已变化或移除，请恢复原图后重试')
    return{id:ref.id,title:ref.title,citation:ref.citation,fileName:ref.fileName,sha256:ref.sha256,width:ref.pixelWidth,height:ref.pixelHeight,dataUrl:ref.dataUrl,purpose:source.purpose,...(ref.generated?{generated:ref.generated}:{})}
  })
}

// This compiles declared content, rather than asking a second model to invent a design.
export function compileImageDraftDesign(record:CompositionRecord,references:ReferenceInputInfo[]){
  const {plan}=imageDraftCompositionSchema.parse(record)
  return {version:1,sourceRunId:record.runId,originalRequest:record.userGoal,goal:plan.goal,readingOrder:plan.readingOrder,layout:plan.layout,
    sections:plan.sections.map(section=>({id:section.id,title:section.title,purpose:section.purpose,visual:section.visual,
      role:compositionRoles[section.design!.role],structure:compositionStructures[section.design!.structure],rationale:section.design!.rationale,emphasis:section.design!.emphasis,frame:section.design!.frame,
      modules:section.components.map(component=>({...component,name:record.components.find(source=>source.key===component.key)!.name})),
      references:section.referenceImages.map(index=>{const source=record.references.find(ref=>ref.index===index)!;return{index:references.find(ref=>ref.id===source.id)?.index,sourceIndex:index,id:source.id,purpose:source.purpose,observation:source.observation,application:source.application,uncertainty:source.uncertainty}}),annotations:section.annotations})),
    connections:plan.connections.map(link=>({...link,relation:compositionConnectionLabels[link.kind!]})),checks:plan.checks,uncertainties:plan.uncertainties,style:plan.style}
}
