import type { FigureNode } from './model.ts'
import { nodeStructure, structureLabels } from './structures.ts'
import { figurePaint, mixColor } from './paint.ts'
import { layoutWrappedText,type WrappedTextLayout } from './typography.ts'

/** Shared native geometry for the canvas, library previews, SVG and editable draw.io children. */
export interface StructurePart {
  key: string; kind: 'box' | 'ellipse' | 'line' | 'text'; x: number; y: number; width: number; height: number
  fill: string; stroke: string; radius?: number; points?: { x: number; y: number }[]; arrow?: boolean
  label?: string; labelIndex?: number; fontSize?: number; color?: string; opacity?: number
  textLayout?:WrappedTextLayout
}
export interface StructureArea { x: number; y: number; width: number; height: number }
export function structuredNodeLayout(node: FigureNode) {
  const structure=nodeStructure(node), size=node.textStyle?.size??16, bodySize=node.descriptionStyle?.size??11
  const textWidth=node.width-20-((structure?.repeats??1)>1?24:0)-(node.iconId&&node.iconId!=='none'?22:0),textLayout=layoutWrappedText(node.label,textWidth,size,2),lines=textLayout.lines
  const header=8+lines.length*size*1.25, footer=node.description?bodySize*1.3+10:8
  return { size,bodySize,lines,textLayout,textWidth,header,footer,area:{x:10,y:header+4,width:node.width-20,height:Math.max(0,node.height-header-footer-4)} }
}
export function structureParts(node: FigureNode, area: StructureArea, paint: ReturnType<typeof figurePaint>, forceDetail=false): StructurePart[] {
  const structure = nodeStructure(node)
  if (!structure || area.height < 10 || area.width < 30) return []
  const parts: StructurePart[] = [], labels = structureLabels(structure), detailed = forceDetail||area.height >= 60 && area.width >= 120
  const sx = area.width/160, sy = area.height/96
  const textInk=paint.ink==='none'?'#243247':paint.ink
  const label = (i:number) => detailed ? labels[i] : undefined
  const fontSize = Math.max(8,Math.min(11,sy*11))
  function box(key:string,x:number,y:number,w:number,h:number,i?:number,soft=false) {
    parts.push({key,kind:'box',x:area.x+x*sx,y:area.y+y*sy,width:w*sx,height:h*sy,radius:3,fill:soft?paint.hatch:paint.fill,stroke:paint.ink,...(i===undefined?{}:{label:label(i),labelIndex:i}),fontSize,color:textInk})
  }
  function ellipse(key:string,x:number,y:number,w:number,h:number,fill=paint.fill) { parts.push({key,kind:'ellipse',x:area.x+x*sx,y:area.y+y*sy,width:w*sx,height:h*sy,fill,stroke:paint.ink}) }
  function line(key:string,points:number[][],arrow=true,opacity=1) {
    const coords=points.map(([x,y])=>({x:area.x+x!*sx,y:area.y+y!*sy}))
    const xs=coords.map(p=>p.x),ys=coords.map(p=>p.y)
    parts.push({key,kind:'line',x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys),fill:'none',stroke:paint.ink,points:coords,arrow,opacity})
  }
  function caption(key:string,x:number,y:number,w:number,i:number) { if(detailed) parts.push({key,kind:'text',x:area.x+x*sx,y:area.y+y*sy,width:w*sx,height:13*sy,fill:'none',stroke:'none',label:labels[i],labelIndex:i,fontSize,color:textInk}) }
  switch(structure.type) {
    case 'encoder': case 'decoder': {
      const count=labels.length, step=88/count, bh=step-6
      for(let i=0;i<count;i++) {
        const y=90-(i+1)*step
        box(`layer-${i}`,25,y,110,bh,i,i%2===0)
        if(i<count-1) line(`flow-${i}`,[[80,y],[80,y-6]])
        if(i%2===0) {
          const side=i%4===0?9:151, to=y-step+bh/2
          line(`residual-${i}`,[[80,y+bh+4],[side,y+bh+4],[side,to],[side<80?25:135,to]])
        }
      }
      line('input',[[80,96],[80,90-6]])
      line('output',[[80,2],[80,0]])
      if(structure.type==='decoder') line('encoder-context',[[0,90-3*step+bh/2],[25,90-3*step+bh/2]])
      break
    }
    case 'attention': {
      box('q',4,72,36,20,0,true);box('k',58,72,36,20,1,true);box('v',116,72,36,20,2,true)
      box('scores',4,35,88,23,3);box('softmax',102,35,54,23,4);box('weighted',102,1,54,22,5,true)
      line('query',[[22,72],[22,58]]);line('key',[[76,72],[76,58]])
      line('normalization',[[92,46.5],[102,46.5]]);line('weights',[[129,35],[129,23]])
      line('values',[[134,72],[158,72],[158,12],[156,12]])
      break
    }
    case 'mlp': {
      const columns=[[17,[25,48,71]],[80,[13,34,55,76]],[143,[36,59]]] as const
      for(let c=0;c<columns.length-1;c++) for(const y of columns[c]![1]) for(const to of columns[c+1]![1]) line(`connection-${c}-${y}-${to}`,[[columns[c]![0]+5,y],[columns[c+1]![0]-5,to]],false,0.32)
      columns.forEach(([x,ys],c)=>{ys.forEach((y,i)=>ellipse(`neuron-${c}-${i}`,x-5,y-5,10,10,c===1?paint.hatch:paint.fill));caption(`column-${c}`,Math.max(0,Math.min(120,x-20)),83,40,c)})
      break
    }
    case 'convolution': {
      for(let i=2;i>=0;i--) box(`map-${i}`,4+i*6,20-i*6,42,51,undefined,i===0)
      for(let i=1;i<4;i++) { line(`grid-x-${i}`,[[4+i*10.5,20],[4+i*10.5,71]],false,.3);line(`grid-y-${i}`,[[4,20+i*12.75],[46,20+i*12.75]],false,.3) }
      box('kernel',14,33,18,20,undefined,true);line('receptive-field',[[32,43],[70,43]])
      box('filter',70,30,20,25,undefined,true);line('convolve',[[90,43],[111,43]])
      for(let i=1;i>=0;i--) box(`output-${i}`,113+i*7,23-i*7,32,42,undefined,i===0)
      caption('map-label',0,79,60,0);caption('kernel-label',57,65,45,1);caption('output-label',109,79,50,2)
      break
    }
    case 'retriever': {
      box('query-vector',0,46,36,23,undefined,true)
      for(let i=0;i<5;i++) box(`vector-${i}`,5+i*5,51,3,13-i%3*3,undefined,true)
      line('query-search',[[36,57],[66,57]])
      box('index-body',56,7,47,22);ellipse('index-base',56,23,47,10);ellipse('index-top',56,2,47,10,paint.hatch)
      line('index-search',[[80,33],[80,44]])
      ellipse('search',67,44,26,26,paint.hatch);ellipse('search-lens',74,50,9,9);line('search-handle',[[82,58],[87,64]],false);line('search-result',[[93,57],[122,57]])
      for(let i=2;i>=0;i--) { box(`document-${i}`,122+i*5,39-i*5,24,35);line(`document-lines-${i}`,[[128+i*5,49-i*5],[140+i*5,49-i*5]],false,.6) }
      caption('query-label',0,78,40,0);caption('index-label',51,11,55,1);caption('result-label',113,79,46,2)
      break
    }
    case 'fusion': {
      box('branch-a',0,5,47,23,0,true);box('branch-b',0,65,47,23,1,true)
      box('concatenation',61,32,47,29,2)
      for(let i=0;i<4;i++) box(`channel-${i}`,68+i*8,35,4,3,undefined,true)
      box('projection',119,32,41,29,3,true)
      line('branch-a-merge',[[47,16.5],[55,16.5],[55,42],[61,42]])
      line('branch-b-merge',[[47,76.5],[55,76.5],[55,52],[61,52]])
      line('merged-output',[[108,46.5],[119,46.5]])
      break
    }
    case 'memory': {
      caption('key-label',18,0,36,0);caption('value-label',67,0,63,1)
      for(let r=0;r<4;r++) { box(`key-${r}`,18,18+r*16,36,14,undefined,r===1);box(`value-${r}`,57,18+r*16,73,14,undefined,r===1) }
      line('read',[[0,41],[18,41]]);line('write',[[130,41],[156,41]])
      caption('access-label',40,82,100,2)
      break
    }
  }
  // Keep every caption within its own primitive; never alter the user's main font size.
  for(const part of parts) if(part.label) {
    part.textLayout=layoutWrappedText(part.label,Math.max(8,part.width-4),part.fontSize!,1);part.label=part.textLayout.lines[0]
    if(part.fill!== 'none') part.color=mixColor(textInk,'#182235',.2)
  }
  return parts
}
