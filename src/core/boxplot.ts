import {resolveChartPlotArea} from './chartPlotContract.ts'
import { clone,createBlank,rootContainer,type FigureNode } from './model.ts'
import { parseAsset,type ComponentAsset } from './assets.ts'
import { dataChartSpecSchema,type DataChartSpec } from './dataChartSchema.ts'
import { summarizeBoxSamples } from './boxplotStats.ts'
import { chartTypography,formatChartValue as format,type ChartAdd } from './chartText.ts'
import { chartDomains,chartAxisTitle } from './chartAxes.ts'
import { setPathPoints,type PathPoint } from './paths.ts'
import { paletteById } from '../data/materials.ts'

const pointOffset=(id:string,name:string)=>{let hash=2166136261;for(const c of `${name}\0${id}`)hash=Math.imul(hash^c.codePointAt(0)!,16777619);return((hash>>>0)%17/16-.5)*.32}
/** A descriptive boxplot from explicitly declared raw samples. No estimates supplied by the model. */
export function buildBoxplot(input:DataChartSpec):ComponentAsset{
  const spec=dataChartSpecSchema.parse(input),palette=paletteById.get(spec.paletteId)
  if(spec.kind!=='boxplot'||!palette)throw new Error('请选择原始样本箱线图和有效分类配色')
  const summaries=spec.series.map(row=>summarizeBoxSamples(row.values)),domain=chartDomains(spec).y,yTitle=chartAxisTitle(spec.yLabel,spec.yScale)
  const figure=createBlank(),root=rootContainer(figure);Object.assign(root,{x:0,y:0,width:760,height:460,role:'component',title:spec.title,visual:{fill:'none',stroke:'none'},dataChart:{spec:clone(spec),revision:1}})
  figure.title=spec.title;figure.style={...figure.style,preset:'precise',roughness:0,paletteId:spec.paletteId}
  const add:ChartAdd=(key,node,role,series,channels=[])=>{const full:FigureNode={...node,id:key,parentId:'stage',chart:{key,role,channels,...(series!==undefined?{series}:{})}};figure.nodes.push(full);return full}
  const typography=chartTypography(spec,add),{label,width:textWidth,size}=typography,path=(key:string,points:PathPoint[],series?:number,neutral=false)=>{const node=add(key,{kind:'path',label:'',x:0,y:0,width:1,height:1,path:{points:[{x:0,y:0},{x:1,y:1}],arrow:'none'},visual:{fill:'none',stroke:series===undefined||neutral?'#253447':palette.colors[series%palette.colors.length]!,strokeWidth:neutral?1.8:1.2,handDrawn:false,lineCap:'round'}},series===undefined?'axis':'series',series,series===undefined||neutral?[]:['stroke']);setPathPoints(node,points);return node}
  const footer=typography.footer(['Quartiles: linear (type 7); whiskers: 1.5 IQR; outliers shown.','Raw observations; missing excluded from n.',...(spec.origin==='example'?['Illustrative data']:[]),spec.note].filter(Boolean),728)
  if(textWidth(spec.title,17)>728)throw new Error('箱线图标题过长或字号过大，请调整标题或字号')
  const naturalLeft=Math.max(76,Math.max(...domain.ticks.map(v=>textWidth(format(v),10)))+(yTitle?size(12)*1.3+20:20)),naturalRight=728,nBaseline=typography.titleY+size(10)+16,naturalTop=nBaseline+Math.max(21,size(10)*.3+14),naturalBand=(naturalRight-naturalLeft)/spec.series.length,angle=Math.max(...spec.series.map(s=>textWidth(s.name,11)))>naturalBand-8?Math.PI/4:0,labelDepth=angle?Math.max(...spec.series.map(s=>textWidth(s.name,11)))*Math.SQRT1_2+typography.tickOffset+size(11)*.3*Math.SQRT1_2+6:typography.tickOffset+size(11)*.3+6.7,naturalBottom=460-(footer.length*typography.lineStep+12)-(spec.xLabel?size(12)*1.3+12:0)-labelDepth
  const {left,right,top,bottom}=resolveChartPlotArea({left:naturalLeft,right:naturalRight,top:naturalTop,bottom:naturalBottom},spec.plotArea),band=(right-left)/spec.series.length
  if(left>304||right-left<240||bottom-top<140||yTitle&&!typography.axisFits(yTitle,(top+bottom)/2,footer.length)||spec.xLabel&&textWidth(spec.xLabel,12)>right-left)throw new Error('箱线图文字过长或字号过密，请调整字号或标签')
  if(domain.ticks.some((value,i)=>i>0&&Math.abs(domain.position(value)-domain.position(domain.ticks[i-1]!))*(bottom-top)<size(10)*1.3+2))throw new Error('箱线图纵轴刻度与字号过密，请减小字号或拆分图表')
  if(angle&&band*Math.SQRT1_2<size(11)*1.3+2)throw new Error('箱线图组名与字号过密，请调整字号或拆分图表')
  if(!angle&&Math.max(...spec.series.map(s=>textWidth(s.name,11)))>band-8)throw new Error('固定绘图区放不下箱线图组名，请恢复自动绘图区或调整字号')
  const y=(value:number)=>bottom-domain.position(value)*(bottom-top)
  domain.ticks.forEach((value,i)=>{const yy=y(value);if(spec.grid){const grid=path(`grid-${i}`,[{x:left,y:yy},{x:right,y:yy}]);grid.chart!.role='grid';grid.visual={...grid.visual,stroke:'#e4e9ef',strokeWidth:.7}}path(`tick-y-${i}`,[{x:left-4,y:yy},{x:left,y:yy}]);label(`label-y-${i}`,format(value),left-9,yy+size(10)*.35,10,'right')})
  path('axis-y',[{x:left,y:top},{x:left,y:bottom}]);path('axis-x',[{x:left,y:bottom},{x:right,y:bottom}]);label('title',spec.title,16,typography.titleY,17,'left','annotation')
  spec.series.forEach((series,j)=>{
    const summary=summaries[j]!,xx=left+(j+.5)*band,width=Math.min(68,band*.46),color=palette.colors[j%palette.colors.length]!,outliers=new Set(summary.outlierIndices),qTop=y(summary.q3),qBottom=y(summary.q1)
    const count=`n=${summary.n}${summary.missing?` / NA=${summary.missing}`:''}`;if(textWidth(count,10)>band-8)throw new Error('箱线图样本量标注与字号过密，请调整字号或拆分图表');label(`series-${j}-n`,count,xx,nBaseline,10,'center','annotation')
    if(summary.q1===summary.q3)path(`series-${j}-box`,[{x:xx-width/2,y:qTop},{x:xx+width/2,y:qTop}],j)
    else add(`series-${j}-box`,{kind:'rectangle',label:'',name:`${series.name} · Q1–Q3`,x:xx-width/2,y:qTop,width,height:qBottom-qTop,visual:{fill:color,fillOpacity:.15,stroke:color,strokeWidth:1.4,radius:0,handDrawn:false}},'series',j,['fill','stroke'])
    path(`series-${j}-whiskers`,[{x:xx,y:y(summary.whiskerLow)},{x:xx,y:qBottom},{x:xx,y:qTop,move:true},{x:xx,y:y(summary.whiskerHigh)},{x:xx-width*.28,y:y(summary.whiskerLow),move:true},{x:xx+width*.28,y:y(summary.whiskerLow)},{x:xx-width*.28,y:y(summary.whiskerHigh),move:true},{x:xx+width*.28,y:y(summary.whiskerHigh)}],j)
    path(`series-${j}-median`,[{x:xx-width/2,y:y(summary.median)},{x:xx+width/2,y:y(summary.median)}],j,true)
    series.values.forEach((value,i)=>{if(value===null||!spec.showSamples&&!outliers.has(i))return;const outlier=outliers.has(i),x=xx+pointOffset(String(spec.x[i]),series.name)*band,radius=outlier?3.2:2.7;add(`series-${j}-sample-${i}`,{kind:'ellipse',label:'',name:`${series.name} · ${spec.x[i]}: ${value}${outlier?' (outlier)':''}`,x:x-radius,y:y(value)-radius,width:radius*2,height:radius*2,visual:{fill:outlier?'#ffffff':color,fillOpacity:outlier?1:.65,stroke:color,strokeWidth:outlier?1.4:.6,handDrawn:false}},'series',j,outlier?['stroke']:['fill','stroke'])})
    if(spec.showValues)label(`series-${j}-median-value`,format(summary.median),xx,Math.max(top+size(10)+2,Math.min(bottom-size(10)*.3-2,y(summary.median)-8)),10,'center','annotation')
    label(`series-${j}-name`,series.name,xx,bottom+typography.tickOffset,11,angle?'left':'center','axis',angle)
  })
  label('label-axis-x',spec.xLabel,(left+right)/2,bottom+labelDepth+size(12)+5,12,'center');label('label-axis-y',yTitle,typography.axisX,(top+bottom)/2,12,'center','axis',-Math.PI/2)
  footer.forEach((row,i)=>label(row.key,row.text,16,460-Math.max(10,size(10)*.3+4)-(footer.length-1-i)*typography.lineStep,10,'left','annotation'))
  if(figure.nodes.length>240)throw new Error('箱线图超过 240 个图元，可关闭全部原始点显示；离群点和输入不会删除')
  return parseAsset({format:'fastfigure.component',version:1,id:'data-chart-boxplot',name:spec.title,description:`${spec.origin==='example'?'示例':'自填'}原始观测的箱线图；type 7 四分位数、1.5 IQR 须线，保留离群点与样本量。`,tags:['图表','箱线图','分布',spec.origin==='example'?'示例数据':'自填数据'],createdAt:'2026-10-29T00:00:00.000Z',updatedAt:'2026-10-29T00:00:00.000Z',sources:[{title:'箱线图统计规则',reference:'https://stat.ethz.ch/R-manual/R-devel/library/stats/html/quantile.html · type 7; https://matplotlib.org/stable/api/_as_gen/matplotlib.pyplot.boxplot.html · 1.5 IQR'},{title:`配色：${palette.title}`,reference:`${palette.sourceUrl} · ${palette.source} · ${palette.license}`},...(spec.dataSource?[{title:'数据来源（用户填写）',reference:spec.dataSource}]:[])],lineage:[],figure})
}
