/** Numerical scales are separate from categorical canvas palettes. */
export const heatmapPalettes=[
  {id:'heat-blue',title:'顺序蓝',mode:'sequential',colors:['#eff6ff','#1d4ed8'],source:{title:'FastFigure 顺序蓝数值色阶',reference:'FastFigure 内置，按原始数值以 sRGB 通道线性插值编码。'}},
  {id:'heat-teal',title:'顺序青绿',mode:'sequential',colors:['#edfdfa','#087f8c'],source:{title:'FastFigure 顺序青绿数值色阶',reference:'FastFigure 内置，按原始数值以 sRGB 通道线性插值编码。'}},
  {id:'heat-figureforge-diverging',title:'FigureForge 蓝白红',mode:'diverging',colors:['#2166ac','#f7f7fa','#b2182b'],source:{title:'FigureForge 热图发散色阶',reference:'https://github.com/jing1312/nature-figure-skill · af778027c866e2e6b3432b946e44a4a2b4434d82 · templates.js heatmap dv · MIT'}},
] as const
export const heatmapPaletteById=new Map<string,typeof heatmapPalettes[number]>(heatmapPalettes.map(p=>[p.id,p]))
