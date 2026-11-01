import {clone,type FigureDocument,type FigureNode} from './model.ts'
import {scaleNodeMetrics} from './scaling.ts'
import {nodeTextStyle} from './typography.ts'
import {textWidth} from './chartText.ts'
import {resolveStyle} from './geometry.ts'

type Pair={mark:FigureNode;label:FigureNode}
/** Reflow actual native glyphs, preserving identity, paint and unrequested text formatting. */
export function layoutLegendEntries(figure:FigureDocument,pairs:Pair[],options:{fontFamily?:string;fontSize?:number;columns:number;gap:number;padding:number;maxWidth:number}){
  if(options.columns>pairs.length)throw new Error('图例列数不能超过条目数')
  const entries=pairs.map(pair=>{
    const mark=clone(pair.mark),label=clone(pair.label),theme=resolveStyle(figure,label.parentId),before=nodeTextStyle(label,false,theme),factor=(options.fontSize??before.size)/before.size
    if(label.textLayout&&(label.textLayout.matrix.some((value,i)=>Math.abs(value-([1,0,0,1][i]!))>1e-8)||label.textLayout.baseline&&label.textLayout.baseline!=='alphabetic'))throw new Error('图例文字有旋转、仿射或特殊基线，请先保留为手工图例；不会覆盖该变换')
    const sourceBaseline=pair.label.y+(pair.label.textLayout?pair.label.height*pair.label.textLayout.y:pair.label.height*.5+before.size*.35)
    if(factor!==1){scaleNodeMetrics(mark,factor,figure);scaleNodeMetrics(label,factor,figure);mark.width*=factor;mark.height*=factor;label.width*=factor;label.height*=factor}
    if(options.fontFamily!==undefined)label.textStyle={...label.textStyle,family:options.fontFamily}
    const style=nodeTextStyle(label,false,theme),inset=label.width*(label.textLayout?.x??0)
    label.width=Math.max(label.width,textWidth(label.label,style.size,style.family)*1.08+Math.abs(style.letterSpacing??0)*Math.max(0,[...label.label].length-1)+2)
    label.height=Math.max(label.height,style.size*1.35+2)
    if(label.textLayout)label.textLayout={...label.textLayout,x:style.align==='center'?.5:style.align==='right'?1:inset/label.width}
    label.x=mark.width+style.size*.65;label.y=0;mark.x=0
    mark.y=(label.textLayout?label.height*label.textLayout.y:label.height*.5+style.size*.35)+(pair.mark.y-sourceBaseline)*factor
    const top=Math.min(0,mark.y);label.y-=top;mark.y-=top
    return{mark,label,width:label.x+label.width,height:Math.max(mark.y+mark.height,label.y+label.height)}
  })
  const available=options.maxWidth-2*options.padding,rows:typeof entries[]=[]
  for(const entry of entries){
    if(entry.width>available)throw new Error('图例文字或字号超出容器宽度，请调整字号或布局')
    let row=rows.at(-1)
    if(!row||(options.columns?row.length>=options.columns:row.reduce((sum,item)=>sum+item.width,0)+options.gap*row.length+entry.width>available)){row=[];rows.push(row)}
    row.push(entry)
  }
  const widths=options.columns?Array.from({length:options.columns},(_,i)=>Math.max(...rows.map(row=>row[i]?.width??0))):[]
  let y=options.padding,width=0
  for(const row of rows){let x=options.padding;for(const [i,entry]of row.entries()){entry.mark.x+=x;entry.mark.y+=y;entry.label.x+=x;entry.label.y+=y;width=Math.max(width,x+entry.width+options.padding);x+=(widths[i]??entry.width)+options.gap}y+=Math.max(...row.map(entry=>entry.height))+options.gap}
  if(width>options.maxWidth)throw new Error('指定列数与间距放不进容器，请减少列数或调整字号')
  return{entries,width,height:y-options.gap+options.padding}
}
