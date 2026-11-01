import type {LineStylePatch} from '../../core/lineStyleContract'
export interface LineStyleDraft {
  colorEnabled:boolean;color:string;inheritColor:boolean;widthEnabled:boolean;width:number;defaultWidth:boolean
  dashEnabled:boolean;dash:string;arrowEnabled:boolean;arrow:'none'|'open'|'filled'
  startEnabled:boolean;startArrow:'none'|'open'|'filled';sizeEnabled:boolean;arrowSize:number;defaultSize:boolean
}
export function createLineStyleDraft(style:LineStylePatch={stroke:null,strokeWidth:1.5,dash:[]},fallback:Partial<{stroke:string;strokeWidth:number;arrow:'none'|'open'|'filled';startArrow:'none'|'open'|'filled';arrowSize:number}>={}):LineStyleDraft{
  return{colorEnabled:style.stroke!==undefined,color:style.stroke??fallback.stroke??'#243247',inheritColor:style.stroke===null,widthEnabled:style.strokeWidth!==undefined,width:style.strokeWidth??fallback.strokeWidth??1.5,defaultWidth:style.strokeWidth===null,dashEnabled:style.dash!==undefined,dash:style.dash?.join(', ')??'',arrowEnabled:style.arrow!==undefined,arrow:style.arrow??fallback.arrow??'filled',startEnabled:style.startArrow!==undefined,startArrow:style.startArrow??fallback.startArrow??'none',sizeEnabled:style.arrowSize!==undefined,arrowSize:style.arrowSize??fallback.arrowSize??9,defaultSize:style.arrowSize===null}
}
export function lineStyleFromDraft(draft:LineStyleDraft):LineStylePatch{
  const dash=draft.dash.trim()?draft.dash.trim().split(/[,，\s]+/).map(Number):[]
  return{...(draft.colorEnabled?{stroke:draft.inheritColor?null:draft.color}:{}),...(draft.widthEnabled?{strokeWidth:draft.defaultWidth?null:draft.width}:{}),...(draft.dashEnabled?{dash}:{}),...(draft.arrowEnabled?{arrow:draft.arrow}:{}),...(draft.startEnabled?{startArrow:draft.startArrow}:{}),...(draft.sizeEnabled?{arrowSize:draft.defaultSize?null:draft.arrowSize}:{})}
}
