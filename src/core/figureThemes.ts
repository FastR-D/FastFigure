import {applyStyleAsset,type StyleAsset} from './styleAsset.ts'
import type {FigureDocument} from './model.ts'
import {paperDesignGuide,paperPaletteId} from './paperStyle.ts'
import {sketchProfiles,type SketchStyle} from './sketchStyle.ts'

const definitions=[
  {id:'comic',name:'Comic Sans MS',fontFamily:'Comic Sans MS',paletteId:'theme-comic',surface:'plain',description:'歪曲波浪边框 · 柔和彩色',guide:'使用自研连续波浪边框，长短起伏交错，闭合轮廓略微偏斜。Comic Sans MS 缺失时回退到本地 Comic Neue；中文回退 MiSans。'},
  {id:'xkcd',name:'XKCD',fontFamily:'Patrick Hand',paletteId:'theme-xkcd',surface:'plain',description:'黑白手稿 · 单线笔触',guide:'使用 Patrick Hand 手写字体与黑白轮廓；数据坐标和数据路径保持精确。'},
  {id:'excalidraw',name:'Excalidraw',fontFamily:'Excalifont',paletteId:'theme-excalidraw',surface:'plain',description:'双线草绘 · 淡彩白板',guide:'参考 Excalidraw，使用 Excalifont 与淡彩、双线草绘。'},
  {id:'drawio',name:'draw.io Sketch',fontFamily:'Comic Sans MS',paletteId:'theme-drawio',surface:'plain',description:'粗糙轮廓 · 图形排线',guide:'参考 draw.io Rough Sketch，采用 Rough.js 与图形内部的斜线填充。Comic Sans MS 缺失时回退 Comic Neue。'},
] as const
export const figureThemes:StyleAsset[]=definitions.map(theme=>({format:'fastfigure.style',version:1,id:`theme-${theme.id}`,name:theme.name,description:theme.description,tags:['内置主题','手绘'],createdAt:'2026-10-30T00:00:00Z',updatedAt:'2026-10-30T00:00:00Z',preset:'sketch',sketchStyle:theme.id,fontFamily:theme.fontFamily,roughness:sketchProfiles[theme.id].roughness,paletteId:theme.paletteId,surface:theme.surface,guide:theme.guide,references:[],origin:{kind:'manual',title:'FastFigure 内置主题'}}))
export const paperTheme:StyleAsset={format:'fastfigure.style',version:1,id:'theme-paper',name:'论文插图',description:'规整轮廓 · 手写正文 · 柔和语义色',tags:['内置主题','论文'],createdAt:'2026-11-05T00:00:00Z',updatedAt:'2026-11-05T00:00:00Z',designSystem:'paper',preset:'precise',roughness:0,paletteId:paperPaletteId,fontFamily:'Comic Neue',surface:'transparent',guide:paperDesignGuide,lineStyle:{scope:'all-lines',style:{stroke:'#202020',strokeWidth:1.5,arrow:'filled',startArrow:'none',arrowSize:8}},references:[],origin:{kind:'manual',title:'FastFigure 默认论文风格'}}
export function applyFigureTheme(figure:FigureDocument,id:SketchStyle,containerId='stage'){
  const theme=figureThemes.find(theme=>theme.sketchStyle===id)
  if(!theme)throw new Error('未知手绘主题')
  return applyStyleAsset(figure,theme,containerId)
}
