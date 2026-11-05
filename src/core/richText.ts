import type {FigureDocument,FigureNode,TextStyle} from './model.ts'
import type {SvgElement} from './svg.ts'
import {measureTextEvidence} from './textGeometry.ts'
import {nodeTextStyle,textAttributes,wrappedTextAttributes} from './typography.ts'
import type {TextRun} from './richTextContract.ts'

/** Each shaped run is a native text element, so raster QA and external SVG readers see the same glyph positions. */
export function richTextElements(node:FigureNode,theme:FigureDocument['style'],area:{x:number;y:number;width:number;height:number}):SvgElement[]{
  const base=nodeTextStyle(node,false,theme),size=base.size
  type Piece={value:string;style:TextStyle;width:number;shift:number;ascent:number;descent:number}
  type Row={pieces:Piece[];width:number;ascent:number;descent:number}
  const row=():Row=>({pieces:[],width:0,ascent:size*.8,descent:size*.2}),rows=[row()]
  function piece(value:string,run:TextRun):Piece{const shifted=run.script==='super'||run.script==='sub',style:TextStyle={...base,...run,size:size*(shifted?.7:1)},metrics=measureTextEvidence(value,style),shift=run.script==='super'?-size*.38:run.script==='sub'?size*.24:0;return{value,style,width:metrics.width,shift,ascent:metrics.ascent-shift,descent:metrics.descent+shift}}
  function append(value:string,run:TextRun){
    let current=rows.at(-1)!,part=piece(value,run)
    if(part.width>area.width&&[...value].length>1){for(const char of value)append(char,run);return}
    if(current.width+part.width>area.width+.01&&current.pieces.length){rows.push(row());current=rows.at(-1)!;if(!value.trim())return;part=piece(value,run)}
    current.pieces.push(part);current.width+=part.width;current.ascent=Math.max(current.ascent,part.ascent);current.descent=Math.max(current.descent,part.descent)
  }
  for(const run of node.textRuns??[])for(const token of run.text.match(/\n|[^\S\n]+|[^\s]+/gu)??[]){if(token==='\n')rows.push(row());else append(token,run)}
  const gap=size*.15,requiredHeight=rows.reduce((n,r)=>n+r.ascent+r.descent,0)+gap*(rows.length-1),visible:Row[]=[];let used=0
  for(const r of rows){const next=used+(visible.length?gap:0)+r.ascent+r.descent;if(next>area.height+.05&&visible.length)break;visible.push(r);used=next}
  let y=area.y+Math.max(0,(area.height-Math.min(requiredHeight,area.height))/2)
  const elements:SvgElement[]=[],lines=visible.map(r=>r.pieces.map(p=>p.value).join('')),layout={lines,requiredLines:rows.length,maxLines:visible.length,truncated:visible.length<rows.length,overwide:rows.some(r=>r.width>area.width+.01)}
  for(const r of visible){let x=area.x+(base.align==='center'?(area.width-r.width)/2:base.align==='right'?area.width-r.width:0);y+=r.ascent
    for(const p of r.pieces){elements.push({tag:'text',attrs:{x,y:y+p.shift,...textAttributes(p.style),'text-anchor':'start','xml:space':'preserve','data-edit-field':'label',...(elements.length?{}:wrappedTextAttributes(layout,'label',area.width,area.height,size))},children:[p.value]});x+=p.width}
    y+=r.descent+gap
  }
  return elements
}
