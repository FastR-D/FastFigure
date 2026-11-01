import type {FigureDocument} from './model.ts'
import {ancestors,resolveStyle} from './geometry.ts'
import {nodeVisual,type SvgElement} from './svg.ts'
import {nodeStructure,structureLabels} from './structures.ts'
import {textCheckReportSchema,type TextCheckIssue,type TextCheckReason,type TextCheckReport} from './textCheckContract.ts'

/** Read renderer-owned markers. No text or geometry is changed and no glyph/pixel quality is inferred. */
export function checkFigureText(doc:FigureDocument,limit=80):TextCheckReport{
  const report:TextCheckReport={version:1,engine:'native-wrap-v1',checkedNodes:0,checkedFields:0,positionedNodes:0,invisibleNodes:0,hiddenStructureLabels:0,total:0,omitted:0,issues:[]},maximum=Math.max(0,Math.min(80,Math.floor(limit)))
  for(const node of doc.nodes){
    if(node.kind==='port'||node.kind==='path')continue
    if(node.visual?.opacity===0||ancestors(doc,node.id).some(id=>doc.containers.find(c=>c.id===id)?.opacity===0)){report.invisibleNodes++;continue}
    if(node.textLayout){report.positionedNodes++;continue}
    const structure=nodeStructure(node),structureText=structure?structureLabels(structure):[],source=(field:string)=>field==='label'?node.label:field==='description'?node.description??'':structureText[Number(field.split(':')[1])]??''
    const elements:SvgElement[]=[]
    function visit(element:SvgElement|string){if(typeof element==='string')return;if(element.tag==='text')elements.push(element);element.children?.forEach(visit)}
    nodeVisual(node,{...doc,style:resolveStyle(doc,node.parentId)}).forEach(visit)
    const fields=new Map<string,SvgElement[]>()
    for(const element of elements){const field=String(element.attrs?.['data-text-field']??'');if(!field||!source(field).trim())continue;fields.set(field,[...(fields.get(field)??[]),element])}
    if(fields.size)report.checkedNodes++;report.checkedFields+=fields.size
    report.hiddenStructureLabels+=structureText.filter((label,index)=>label.trim()&&!fields.has(`structure:${index}`)).length
    for(const [field,markers]of fields){
      const reasons=new Set<TextCheckReason>(),number=(element:SvgElement,key:string)=>Number(element.attrs?.[`data-text-${key}`]),scale=node.metricScale??1
      for(const marker of markers){if(number(marker,'truncated'))reasons.add('line-limit');if(number(marker,'overwide'))reasons.add('width');if(number(marker,'height')+1e-6<number(marker,'size')*(1+(number(marker,'shown-lines')-1)*number(marker,'line-step')))reasons.add('height')}
      if(!reasons.size)continue
      report.total++
      if(report.issues.length>=maximum){report.omitted++;continue}
      const issue:TextCheckIssue={nodeId:node.id,nodeLabel:node.label,field,source:source(field),shown:elements.filter(e=>e.attrs?.['data-edit-field']===field).map(e=>e.children?.filter((c):c is string=>typeof c==='string').join('')??'').join('\n').slice(0,1200),reasons:[...reasons],requiredLines:Math.max(...markers.map(m=>number(m,'required-lines'))),lineLimit:Math.min(...markers.map(m=>number(m,'line-limit'))),fontSize:Math.max(...markers.map(m=>number(m,'size')))*scale,availableWidth:Math.min(...markers.map(m=>number(m,'width')))*scale,availableHeight:Math.min(...markers.map(m=>number(m,'height')))*scale}
      report.issues.push(issue)
    }
  }
  return textCheckReportSchema.parse(report)
}
