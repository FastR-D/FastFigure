import {outputFrame} from './outputFrame.ts'
import {createScene,type SvgElement} from './svg.ts'
import {identity,multiply,parseTransform,type Affine} from './affine.ts'
import {clone,parseDocument,type FigureDocument} from './model.ts'
import {captureFigureJson} from './componentCapture.ts'
import {publicationSettingsSchema,type PublicationSettings,type PublicationReport,type PublicationMeasure} from './publicationContract.ts'

/** Singular-value bounds include all renderer transforms; uniform transforms yield an exact size. */
function scales(matrix:Affine){const[a,b,c,d]=matrix,t=a*a+b*b+c*c+d*d,det=Math.abs(a*d-b*c),max=Math.sqrt((t+Math.sqrt(Math.max(0,t*t-4*det*det)))/2);return{min:det/max,max}}
type Owner=Pick<PublicationMeasure,'objectId'|'kind'|'label'>
interface Paint {matrix:Affine;opacity:number;fill:string;fillOpacity:number;stroke:string;strokeOpacity:number;strokeWidth:number;fontSize:number}
export function checkPublication(input:FigureDocument,raw:PublicationSettings,limit=80):PublicationReport{
  const settings=publicationSettingsSchema.parse(raw),doc=input,frame=outputFrame(doc),factor=settings.widthMm/frame.width*72/25.4,texts=new Map<string,PublicationMeasure>(),strokes=new Map<string,PublicationMeasure>(),labels=new Map([...doc.nodes.map(node=>[node.id,node.name||node.label||node.kind] as const),...doc.containers.map(container=>[container.id,container.title] as const),...doc.edges.map(edge=>[edge.id,`${edge.source} → ${edge.target}`] as const)]),maximum=Number.isFinite(limit)?Math.max(0,Math.min(80,Math.floor(limit))):80
  function add(rows:Map<string,PublicationMeasure>,owner:Owner,field:string,min:number,max:number,sample:string,transformed:boolean){const key=`${owner.kind}:${owner.objectId}:${field}`,old=rows.get(key);if(old){old.minPt=Math.min(old.minPt,min);old.maxPt=Math.max(old.maxPt,max);old.parts++;old.transformed||=transformed;if(!old.sample)old.sample=sample.slice(0,160)}else rows.set(key,{...owner,field,minPt:min,maxPt:max,sample:sample.slice(0,160),parts:1,transformed})}
  function visit(element:SvgElement|string,parent:Paint,owner:Owner){
    if(typeof element==='string'||['defs','marker','metadata','title','desc'].includes(element.tag))return
    const attrs=element.attrs??{},number=(key:string,fallback:number)=>attrs[key]===undefined?fallback:Number(attrs[key]),matrix=attrs.transform?multiply(parent.matrix,parseTransform(String(attrs.transform))):parent.matrix,paint:Paint={matrix,opacity:parent.opacity*number('opacity',1),fill:String(attrs.fill??parent.fill),fillOpacity:number('fill-opacity',parent.fillOpacity),stroke:String(attrs.stroke??parent.stroke),strokeOpacity:number('stroke-opacity',parent.strokeOpacity),strokeWidth:number('stroke-width',parent.strokeWidth),fontSize:number('font-size',parent.fontSize)}
    if(paint.opacity===0)return
    const objectId=attrs['data-object-id']??attrs['data-container-id']??attrs['data-edge-id'];if(objectId!==undefined)owner={objectId:String(objectId),kind:attrs['data-object-id']!==undefined?'node':attrs['data-container-id']!==undefined?'container':'edge',label:labels.get(String(objectId))??String(objectId)}
    const object=doc.nodes.find(n=>n.id===owner.objectId)??doc.containers.find(c=>c.id===owner.objectId)
    if(object&&(object.x+object.width<frame.x||object.y+object.height<frame.y||object.x>frame.x+frame.width||object.y>frame.y+frame.height))return
    const scale=scales(matrix),transformed=Math.abs(scale.max-scale.min)>1e-7*Math.max(1,scale.max)
    if(element.tag==='text'&&paint.fill!=='none'&&paint.fillOpacity>0){const sample=(element.children??[]).filter((child):child is string=>typeof child==='string').join('');if(sample.trim())add(texts,owner,String(attrs['data-edit-field']??'label'),paint.fontSize*scale.min*factor,paint.fontSize*scale.max*factor,sample,transformed)}
    if(['path','line','polyline','polygon','rect','ellipse','circle'].includes(element.tag)&&paint.stroke!=='none'&&paint.strokeOpacity>0&&paint.strokeWidth>0)add(strokes,owner,'stroke',paint.strokeWidth*scale.min*factor,paint.strokeWidth*scale.max*factor,'',transformed)
    for(const child of element.children??[])visit(child,paint,owner)
  }
  const base:Paint={matrix:identity,opacity:1,fill:'#000000',fillOpacity:1,stroke:'none',strokeOpacity:1,strokeWidth:1,fontSize:16},owner:Owner={objectId:'stage',kind:'document',label:doc.title}
  for(const element of createScene(doc,settings.showTitle))visit(element,base,owner)
  const small=[...texts.values()].filter(row=>row.minPt+1e-8<settings.minFontPt).sort((a,b)=>a.minPt-b.minPt),thin=[...strokes.values()].filter(row=>row.minPt+1e-8<settings.minStrokePt).sort((a,b)=>a.minPt-b.minPt),all=[...small.map(row=>({...row,reason:'text' as const})),...thin.map(row=>({...row,reason:'stroke' as const}))],minimum=(rows:Map<string,PublicationMeasure>)=>rows.size?Math.min(...[...rows.values()].map(row=>row.minPt)):null
  return{version:1,engine:'native-svg-physical-v1',widthMm:settings.widthMm,heightMm:settings.widthMm*frame.height/frame.width,pointsPerUnit:factor,textFields:texts.size,strokeObjects:strokes.size,minFontPt:minimum(texts),minStrokePt:minimum(strokes),smallText:small.length,thinStroke:thin.length,total:all.length,omitted:Math.max(0,all.length-maximum),issues:all.slice(0,maximum)}
}
export async function publicationReportPacket(input:FigureDocument,raw:PublicationSettings){
  const figure=parseDocument(clone(input)),settings=publicationSettingsSchema.parse(raw),sourceSha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(captureFigureJson(figure))))].map(value=>value.toString(16).padStart(2,'0')).join('')
  return{format:'fastfigure.publication-check',version:1,sourceSha256,checkedAt:new Date().toISOString(),settings,report:checkPublication(figure,settings)}
}
