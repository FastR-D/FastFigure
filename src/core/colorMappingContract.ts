import {z} from 'zod'
import {paletteById} from '../data/materials.ts'

export const legacyColors:Record<string,string>={'legacy:blue':'#4C78A8','legacy:slate':'#65758b','legacy:teal':'#2a9d8f','legacy:sand':'#c8963e','legacy:rose':'#b97091'}
const sourceId=z.string().max(120).refine(id=>paletteById.has(id)||Object.hasOwn(legacyColors,id),'未知来源配色')
const paletteId=z.string().max(120).refine(id=>paletteById.has(id),'未知目标配色')
export const colorMappingRowSchema=z.object({sourcePaletteId:sourceId,sourceIndex:z.number().int().min(0).max(11),targetPaletteId:paletteId,targetIndex:z.number().int().min(0).max(11),role:z.string().trim().max(60).default('用途未注明')}).strict().superRefine((row,ctx)=>{
  const sourceLength=paletteById.get(row.sourcePaletteId)?.colors.length??(Object.hasOwn(legacyColors,row.sourcePaletteId)?1:0),targetLength=paletteById.get(row.targetPaletteId)?.colors.length??0
  if(row.sourceIndex>=sourceLength||row.targetIndex>=targetLength)ctx.addIssue({code:'custom',message:'颜色映射色槽超出所选配色'})
})
export type ColorMapping=z.infer<typeof colorMappingRowSchema>
export const colorSlotKey=(slot:{sourcePaletteId:string;sourceIndex:number})=>`${slot.sourcePaletteId}:${slot.sourceIndex}`
export const colorMapSchema=z.array(colorMappingRowSchema).max(12).superRefine((rows,ctx)=>{if(new Set(rows.map(colorSlotKey)).size!==rows.length)ctx.addIssue({code:'custom',message:'同一来源色槽不能重复映射'})}).transform(rows=>[...rows].sort((a,b)=>colorSlotKey(a).localeCompare(colorSlotKey(b))))
export const componentColorMapSchema=colorMapSchema.refine(rows=>rows.length>0,'组件颜色映射至少一项')
export function sourceColorSlot(style:{paletteId?:string;accent:string;colorIndex?:number},index=style.colorIndex??0){
  const palette=style.paletteId?paletteById.get(style.paletteId):undefined
  return palette?{sourcePaletteId:palette.id,sourceIndex:index%palette.colors.length}:{sourcePaletteId:`legacy:${style.accent}`,sourceIndex:0}
}
export function sourceSlotColor(slot:{sourcePaletteId:string;sourceIndex:number}){return paletteById.get(slot.sourcePaletteId)?.colors[slot.sourceIndex]??legacyColors[slot.sourcePaletteId]!}
export function colorMapKey(rows:ColorMapping[]|undefined){return JSON.stringify(colorMapSchema.parse(rows??[]))}
