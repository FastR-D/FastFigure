import { clone,createBlank,rootContainer,type FigureNode } from './model.ts'
import { parseAsset,type ComponentAsset } from './assets.ts'
import { dataChartSpecSchema,type DataChartSpec } from './dataChartSchema.ts'
import { heatmapPaletteById } from '../data/heatmapPalettes.ts'
import { mixColor,foreground } from './paint.ts'
import { chartTypography,chartTypographyMetrics,formatChartValue as format,type ChartAdd } from './chartText.ts'
import {resolveChartPlotArea} from './chartPlotContract.ts'

/** Linear color encoding only. No normalization, clustering, sorting or missing-value imputation. */
export function heatmapScale(spec:Pick<DataChartSpec,'paletteId'|'series'|'colorMin'|'colorMax'|'colorCenter'>){
  const palette=heatmapPaletteById.get(spec.paletteId)
  if(!palette)throw new Error('请选择热图的数值色阶，画板分类配色不能用作热图色标')
  const values=spec.series.flatMap(row=>row.values.filter((v):v is number=>v!==null)),low=Math.min(...values),high=Math.max(...values)
  if(!values.length)throw new Error('热图至少需要一个有效数值')
  let min:number,max:number,center:number|undefined
  if(palette.mode==='diverging'){
    center=spec.colorCenter??0;const span=Math.max(Math.abs(low-center),Math.abs(high-center))||1
    min=spec.colorMin??center-span;max=spec.colorMax??center+span
    if(!(min<center&&center<max))throw new Error('发散色标中心必须严格位于色标范围内')
  }else{
    if(spec.colorCenter!==undefined)throw new Error('顺序色阶不使用发散中心，请清空色标中心或选择发散色阶')
    min=spec.colorMin??low;max=spec.colorMax??high
    if(min===max){const pad=Math.abs(min)*.1||1;if(spec.colorMin===undefined)min-=pad;if(spec.colorMax===undefined)max+=pad}
  }
  if(min>low||max<high)throw new Error('色标范围会截断原始数值，请扩大范围；不会裁剪、归一化或删除数据')
  if(!(max>min))throw new Error('色标范围无效')
  const colors:readonly string[]=palette.colors
  const color=(value:number)=>center===undefined?mixColor(colors[0]!,colors[1]!,Math.max(0,Math.min(1,(value-min)/(max-min)))):value<=center?mixColor(colors[0]!,colors[1]!,Math.max(0,Math.min(1,(value-min)/(center-min)))):mixColor(colors[1]!,colors[2]!,Math.max(0,Math.min(1,(value-center)/(max-center))))
  return{min,max,center,color,palette}
}

/** Available label-safe area and an exact square-cell matrix within it. */
export function heatmapPlotLayout(spec:DataChartSpec,typography=chartTypographyMetrics(spec)){
  const scale=heatmapScale(spec),{width:textWidth,size}=typography,rows=spec.x.map(String),columns=spec.series.map(row=>row.name),missing=spec.series.some(row=>row.values.some(v=>v===null)),footer=typography.footer([...(missing?['× Missing values']:[]),...(spec.origin==='example'?['Illustrative data']:[]),spec.note].filter(Boolean),728)
  if(textWidth(spec.title,17)>728)throw new Error('热图标题过长或字号过大，请调整文字或字号')
  const scaleTitle=typography.wrap(spec.valueLabel!,10,104),ticks=scale.center===undefined?[scale.min,(scale.min+scale.max)/2,scale.max]:[scale.min,scale.center,scale.max]
  const left=Math.max(84,Math.max(...rows.map(row=>textWidth(row,11)))+(spec.yLabel?size(12)*1.3+24:24)),reserve=Math.max(148,...ticks.map(value=>textWidth(format(value),10)+65)),available=760-reserve-left,top=Math.max(64,typography.titleY+size(10)+14)+(scaleTitle.length-1)*size(13),longest=Math.max(...columns.map(col=>textWidth(col,11)))
  const depth=(angled:boolean)=>angled?longest*Math.SQRT1_2+typography.tickOffset+size(11)*.3*Math.SQRT1_2+6:typography.tickOffset+size(11)*.3+6.7
  const limit=(labelDepth:number)=>460-(footer.length*typography.lineStep+12)-(spec.xLabel?size(12)*1.3+12:0)-labelDepth
  const horizontalCell=spec.plotArea?(spec.plotArea.right-spec.plotArea.left)/columns.length:Math.min(available/columns.length,(limit(depth(false))-top)/rows.length),angled=longest>horizontalCell-8,angle=angled?Math.PI/4:0,labelDepth=depth(angled),bottom=limit(labelDepth),natural={left,right:left+available,top,bottom}
  if(left>304||available<240||bottom-top<rows.length*Math.max(18,size(11)*1.3+2))throw new Error('热图标签过长或字号过密，请调整字号或拆分矩阵')
  const area=resolveChartPlotArea(natural,spec.plotArea),cell=spec.plotArea?(area.right-area.left)/columns.length:Math.min(available/columns.length,(bottom-top)/rows.length),x0=spec.plotArea?area.left:left+(available-cell*columns.length)/2,x1=x0+cell*columns.length,y0=spec.plotArea?area.top:top,y1=y0+cell*rows.length
  if(cell<Math.max(18,size(11)*1.3+2)-1e-6||Math.abs(y1-area.bottom)>1e-6&&!!spec.plotArea)throw new Error('热图固定绘图区过密或不能保持正方形单元格，请调整排布、字号或恢复自动绘图区')
  if(angled&&cell*Math.SQRT1_2<size(11)*1.3+2)throw new Error('热图列名与字号过密，请调整字号或拆分矩阵')
  if(spec.yLabel&&!typography.axisFits(spec.yLabel,(y0+y1)/2,footer.length)||spec.xLabel&&textWidth(spec.xLabel,12)>available)throw new Error('热图轴标题过长或字号过大，请调整字号或文字')
  return{scale,rows,columns,footer,scaleTitle,ticks,natural,cell,x0,x1,top:y0,y1,angled,angle,labelDepth}
}

export function buildHeatmap(input:DataChartSpec):ComponentAsset{
  const spec=dataChartSpecSchema.parse(input)
  if(spec.kind!=='heatmap')throw new Error('热图编译器只接受热图数据')
  const figure=createBlank(),root=rootContainer(figure)
  Object.assign(root,{x:0,y:0,width:760,height:460,role:'component',title:spec.title,visual:{fill:'none',stroke:'none'},dataChart:{spec:clone(spec),revision:1}})
  figure.title=spec.title;figure.style={...figure.style,designSystem:'legacy',fontFamily:spec.fontFamily??'Inter',fontRoles:undefined,preset:'precise',roughness:0}
  const add:ChartAdd=(key,node,role,series,channels=[])=>{const full:FigureNode={...node,id:key,parentId:'stage',chart:{key,role,channels,...(series!==undefined?{series}:{})}};figure.nodes.push(full);return full}
  const typography=chartTypography(spec,add),{label,width:textWidth,size}=typography,{scale,rows,columns,footer,scaleTitle,ticks,cell,x0,x1,top,y1,angled,angle,labelDepth}=heatmapPlotLayout(spec,typography)
  const rectangle=(key:string,x:number,y:number,width:number,height:number,fill:string,stroke='none',role:'heat'|'frame'='heat')=>add(key,{kind:'rectangle',label:'',x,y,width,height,visual:{fill,stroke,...(stroke!=='none'?{strokeWidth:.8}:{}),radius:0,handDrawn:false}},role)
  label('title',spec.title,16,typography.titleY,17,'left','annotation')
  rows.forEach((row,i)=>label(`row-${i}`,row,x0-10,top+cell*(i+.5)+size(11)*.32,11,'right'))
  columns.forEach((col,j)=>label(`column-${j}`,col,x0+cell*(j+.5),y1+typography.tickOffset,11,angled?'left':'center','axis',angle))
  spec.series.forEach((series,j)=>series.values.forEach((value,i)=>{
    const x=x0+cell*j,y=top+cell*i,key=`series-${j}-point-${i}`
    const node=rectangle(key,x,y,cell,cell,value===null?'#f1f5f9':scale.color(value),spec.grid?'#ffffff':'none');node.name=`${rows[i]} · ${series.name}: ${value===null?'Missing':value}`
    if(value===null){add(`series-${j}-missing-${i}`,{kind:'path',label:'',x:x+cell*.3,y:y+cell*.3,width:cell*.4,height:cell*.4,path:{points:[{x:0,y:0},{x:1,y:1},{x:1,y:0,move:true},{x:0,y:1}],arrow:'none'},visual:{fill:'none',stroke:'#94a3b8',strokeWidth:1,handDrawn:false}},'heat');return}
    if(spec.showValues){const text=format(value);if(textWidth(text,10)+8>cell||size(10)*1.3+4>cell)throw new Error('热图数值标注过密，请调整字号或关闭数值标签；不会四舍五入或删格以容纳文字');label(`series-${j}-value-${i}`,text,x+cell/2,y+cell/2+size(10)*.35,10,'center','heat',0,undefined,foreground(scale.color(value)))}
  }))
  rectangle('matrix-frame',x0,top,x1-x0,y1-top,'none','#64748b','frame')
  const barX=x1+28,barH=y1-top,steps=32
  for(let i=0;i<steps;i++){const value=scale.max-(scale.max-scale.min)*i/(steps-1);rectangle(`colorbar-${i}`,barX,top+i*barH/steps,15,barH/steps+.01,scale.color(value))}
  scaleTitle.forEach((text,i)=>label(`colorbar-title${i?`-${i}`:''}`,text,barX-4,top-size(10)-3-(scaleTitle.length-1-i)*size(13),10,'left','heat'))
  ticks.forEach((value,i)=>label(`colorbar-tick-${i}`,format(value),barX+21,top+(scale.max-value)/(scale.max-scale.min)*barH+size(10)*.35,10,'left','heat'))
  label('label-axis-x',spec.xLabel,(x0+x1)/2,y1+labelDepth+size(12)+5,12,'center');label('label-axis-y',spec.yLabel,typography.axisX,(top+y1)/2,12,'center','axis',-Math.PI/2)
  footer.forEach((row,i)=>label(row.key,row.text,16,460-Math.max(10,size(10)*.3+4)-(footer.length-1-i)*typography.lineStep,10,'left','annotation'))
  if(figure.nodes.length>240)throw new Error('热图超过 240 个图元，请关闭数值标签或减少矩阵规模；原始行列不会自动删除')
  return parseAsset({format:'fastfigure.component',version:1,id:'data-chart-heatmap',name:spec.title,description:`${spec.origin==='example'?'示例':'自填'}矩阵的原始数值热图。保留行列顺序、零与缺失；不归一化或聚类。`,tags:['图表','热图','矩阵',spec.origin==='example'?'示例数据':'自填数据'],createdAt:'2026-10-29T00:00:00.000Z',updatedAt:'2026-10-29T00:00:00.000Z',sources:[clone(scale.palette.source),...(spec.dataSource?[{title:'数据来源（用户填写）',reference:spec.dataSource}]:[])],lineage:[],figure})
}
