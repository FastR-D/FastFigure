import {paperThemeDefaults} from './paperThemeTokens.ts'
import {applyStyleAsset,type StyleAsset} from './styleAsset.ts'
import type {FigureDocument} from './model.ts'
import {paperDesignGuide,paperPaletteId} from './paperStyle.ts'
import {sketchProfiles,type SketchStyle} from './sketchStyle.ts'

const definitions=[
  {id:'comic',name:'Comic Sans MS',fontFamily:'Comic Sans MS',paletteId:'theme-comic',surface:'plain',description:'柔和单线轮廓 · 轻微手绘起伏',guide:'使用连续单线轮廓和轻微起伏，保持框体端正与圆角清晰。Comic Sans MS 缺失时回退到本地 Comic Neue；中文回退 MiSans。'},
  {id:'xkcd',name:'XKCD',fontFamily:'Patrick Hand',paletteId:'theme-xkcd',surface:'plain',description:'黑白手稿 · 单线笔触',guide:'使用 Patrick Hand 手写字体与黑白轮廓；数据坐标和数据路径保持精确。'},
  {id:'excalidraw',name:'Excalidraw',fontFamily:'Excalifont',paletteId:'theme-excalidraw',surface:'plain',description:'双线草绘 · 淡彩白板',guide:'参考 Excalidraw，使用 Excalifont 与淡彩、双线草绘。'},
  {id:'drawio',name:'draw.io Sketch',fontFamily:'Comic Sans MS',paletteId:'theme-drawio',surface:'plain',description:'粗糙轮廓 · 图形排线',guide:'参考 draw.io Rough Sketch，采用 Rough.js 与图形内部的斜线填充。Comic Sans MS 缺失时回退 Comic Neue。'},
] as const
export const figureThemes:StyleAsset[]=definitions.map(theme=>({format:'fastfigure.style',version:1,id:`theme-${theme.id}`,name:theme.name,description:theme.description,tags:['内置主题','手绘'],createdAt:'2026-10-30T00:00:00Z',updatedAt:'2026-10-30T00:00:00Z',preset:'sketch',sketchStyle:theme.id,fontFamily:theme.fontFamily,roughness:sketchProfiles[theme.id].roughness,paletteId:theme.paletteId,surface:theme.surface,guide:theme.guide,references:[],origin:{kind:'manual',title:'FastFigure 内置主题'}}))
export const paperThemes:StyleAsset[]=[
  {variant:'soft' as const,id:'theme-paper',name:'柔和论文',description:'MiSans · 细描边 · 清楚的模块层级',paletteId:paperPaletteId,fontFamily:'MiSans' as const},
  {variant:'warm' as const,id:'theme-paper-warm',name:'暖色叙事',description:'衬线标题签 · 暖色分区 · 规整正文',paletteId:'paper-warm',fontFamily:'MiSans' as const},
  {variant:'handdrawn' as const,id:'theme-paper-handdrawn',name:'轻手绘',description:'Comic Neue · 轻微单线起伏 · 柔和阶段色',paletteId:'paper-handdrawn',fontFamily:'Comic Neue' as const},
].map(({variant,...theme})=>({...theme,format:'fastfigure.style',version:1,tags:['内置主题','论文'],createdAt:'2026-11-06T00:00:00Z',updatedAt:'2026-11-06T00:00:00Z',designSystem:'paper',paperTheme:{...paperThemeDefaults[variant]},preset:'precise',roughness:variant==='handdrawn'?.16:0,...(variant==='handdrawn'?{sketchStyle:'comic' as const}:{}),surface:'transparent',guide:paperDesignGuide,references:[],origin:{kind:'manual',title:'FastFigure 论文主题'}}))
export const paperTheme=paperThemes[0]!
export function applyFigureTheme(figure:FigureDocument,id:SketchStyle,containerId='stage'){
  const theme=figureThemes.find(theme=>theme.sketchStyle===id)
  if(!theme)throw new Error('未知手绘主题')
  return applyStyleAsset(figure,theme,containerId)
}
