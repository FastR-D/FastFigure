import {describe,expect,it} from 'vitest'
import {clone,createBlank,parseDocument,type FigureNode} from './model'
import {checkFigureText} from './figureTextCheck'
import {layoutWrappedText,wrapText} from './typography'
import {nodeVisual,type SvgElement,exportSvg} from './svg'
import {captureComponent,componentDocument,scaleComponent} from './assets'
import {harnessPrompt,parseHarnessResponse} from './harness'
import {textCheckReportSchema} from './textCheckContract'
import {checkPublication,publicationReportPacket} from './publication'
import {defaultPublicationSettings} from './publicationContract'
import {captureFigureJson} from './componentCapture'
import {DOMParser} from '@xmldom/xmldom'
const node=(patch:Partial<FigureNode>={}):FigureNode=>({id:'caption',kind:'text',label:'First line\nSecond line',parentId:'stage',x:100,y:200,width:240,height:24,textStyle:{size:15},...patch})
function texts(elements:SvgElement[]){const result:SvgElement[]=[];function visit(e:SvgElement|string){if(typeof e==='string')return;if(e.tag==='text')result.push(e);e.children?.forEach(visit)}elements.forEach(visit);return result}
describe('renderer-backed native text checks',()=>{
  it('measures final physical text and stroke sizes through native scale and affine transforms, skipping invisible paint',()=>{
    const doc=createBlank();Object.assign(doc.containers[0]!,{role:'component',visual:{fill:'none',stroke:'none'}})
    doc.nodes=[node({id:'scaled',label:'Scaled label',metricScale:.5,height:44,textStyle:{size:10}}),node({id:'affine',label:'Affine label',height:44,textStyle:{size:20},textLayout:{x:0,y:.8,matrix:[2,0,0,.5]}}),node({id:'hidden',visual:{opacity:0}}),node({id:'line',kind:'path',label:'Leader',y:320,width:100,height:20,path:{points:[{x:0,y:0},{x:1,y:1}],arrow:'open'},visual:{fill:'none',stroke:'#123456',strokeWidth:1,strokeMatrix:[2,0,0,.5]}})]
    const saved=clone(doc),settings={...defaultPublicationSettings},report=checkPublication(doc,settings),factor=88.9/1000*72/25.4,scaled=report.issues.find(row=>row.objectId==='scaled')!,affine=report.issues.find(row=>row.objectId==='affine')!,stroke=report.issues.find(row=>row.objectId==='line')!
    expect(report).toMatchObject({textFields:2,strokeObjects:1,smallText:2,thinStroke:1,total:3});expect(scaled.minPt).toBeCloseTo(10*factor);expect(scaled.maxPt).toBeCloseTo(scaled.minPt);expect(affine.minPt).toBeCloseTo(10*factor);expect(affine.maxPt).toBeCloseTo(40*factor);expect(affine.transformed).toBe(true);expect(stroke.minPt).toBeCloseTo(.5*factor);expect(stroke.maxPt).toBeCloseTo(2*factor)
    expect(checkPublication(doc,{...settings,widthMm:177.8}).minFontPt).toBeCloseTo(report.minFontPt!*2);expect(checkPublication(doc,settings,1)).toMatchObject({total:3,omitted:2});expect(doc).toEqual(saved)
    doc.containers[0]!.opacity=0;expect(checkPublication(doc,settings)).toMatchObject({textFields:0,strokeObjects:0,total:0,minFontPt:null,minStrokePt:null})
  })
  it('exports physical SVG dimensions with independent title visibility and a frozen canonical source hash, without passing paper settings into assets',async()=>{
    const doc=createBlank();doc.title='Unique publication heading';Object.assign(doc.containers[0]!,{y:100,height:450});doc.nodes=[node({height:44})];doc.publication={...defaultPublicationSettings}
    const before=clone(doc),svg=exportSvg(doc),metadata=new DOMParser().parseFromString(svg,'image/svg+xml').getElementsByTagName('metadata')[0]!.textContent;expect(svg).toContain('width="88.9mm" height="55.118mm"');expect(svg).toContain('viewBox="0 0 1000 620"');expect(svg).not.toContain('>Unique publication heading</text>');expect(exportSvg({...doc,publication:{...doc.publication,showTitle:true}})).toContain('>Unique publication heading</text>');expect(parseDocument(JSON.parse(metadata!)).publication).toEqual(doc.publication);expect(doc).toEqual(before)
    expect(captureComponent(doc,'stage','Paper component').figure.publication).toBeUndefined()
    const expected=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(captureFigureJson(doc))))].map(value=>value.toString(16).padStart(2,'0')).join(''),pending=publicationReportPacket(doc,{...doc.publication,widthMm:182});doc.nodes[0]!.label='Changed after export started';const packet=await pending
    expect(packet.sourceSha256).toBe(expected);expect(packet.settings.widthMm).toBe(182);expect(packet.report).toEqual(checkPublication(before,packet.settings));expect(before.publication!.widthMm).toBe(88.9)
  })
  it('reports actual line-limit omission and displays exactly the renderer lines without mutating the figure',()=>{
    const doc=createBlank();doc.nodes=[node()];const before=clone(doc),report=checkFigureText(doc),labels=texts(nodeVisual(doc.nodes[0]!,doc)).filter(t=>t.attrs?.['data-edit-field']==='label')
    expect(report).toMatchObject({checkedNodes:1,checkedFields:1,total:1,omitted:0,issues:[{nodeId:'caption',field:'label',source:'First line\nSecond line',requiredLines:2,lineLimit:1,reasons:['line-limit']}]});expect(report.issues[0]!.shown).toBe(labels.map(t=>t.children?.join('')).join('\n'));expect(report.issues[0]!.shown).toBe('First lin…');expect(doc).toEqual(before)
    doc.nodes[0]!.height=44;expect(checkFigureText(doc).total).toBe(0)
  })
  it('does not mistake literal ellipses or empty labels for renderer omissions and keeps whitespace wrapping unchanged',()=>{
    const doc=createBlank();doc.nodes=[node({label:'Literal…',height:44}),node({id:'empty',label:'',height:44})]
    expect(checkFigureText(doc)).toMatchObject({total:0,checkedNodes:1,checkedFields:1})
    expect(layoutWrappedText('A\nB',100,15,1)).toMatchObject({lines:['…'],requiredLines:2,maxLines:1,truncated:true})
    expect(wrapText('  Alpha   beta \n 中文 ',300,15,2)).toEqual(['Alpha   beta','中文'])
  })
  it('distinguishes estimated width or height problems from definite line-limit omission',()=>{
    const doc=createBlank();doc.nodes=[node({id:'narrow',label:'中',width:3,height:44,textStyle:{size:16}}),node({id:'short',label:'X',width:180,height:10,textStyle:{size:80}})]
    const report=checkFigureText(doc);expect(report.issues.find(i=>i.nodeId==='narrow')!.reasons).toContain('width');expect(report.issues.find(i=>i.nodeId==='narrow')!.reasons).not.toContain('line-limit');expect(report.issues.find(i=>i.nodeId==='short')!.reasons).toEqual(['height'])
  })
  it('checks descriptions separately from main labels and respects explicit inset capacity',()=>{
    const doc=createBlank();doc.nodes=[node({kind:'rectangle',label:'Title',description:'Description one\nDescription two\nDescription three',width:240,height:90,textStyle:{size:15},descriptionStyle:{size:11}})]
    const report=checkFigureText(doc);expect(report.issues).toHaveLength(1);expect(report.issues[0]).toMatchObject({field:'description',requiredLines:3,lineLimit:2,source:'Description one\nDescription two\nDescription three'})
    doc.nodes=[node({height:44,visual:{padding:12}})];expect(checkFigureText(doc).issues[0]!.reasons).toContain('line-limit')
    doc.nodes=[node({kind:'module',label:'Encoder',description:'Body',width:184,height:66,descriptionStyle:{size:64},structure:{type:'encoder'}})];expect(checkFigureText(doc).issues.find(i=>i.field==='description')!.reasons).toContain('height')
  })
  it('locates structured titles, internal labels and footnotes using their editable field IDs',()=>{
    const doc=createBlank();doc.nodes=[node({kind:'module',label:'非常长的标题'.repeat(20),description:'长注释'.repeat(40),width:184,height:300,structure:{type:'encoder',labels:['非常长的结构标签'.repeat(4)]}})]
    const fields=checkFigureText(doc).issues.map(i=>i.field);expect(fields).toContain('label');expect(fields).toContain('description');expect(fields).toContain('structure:0')
    expect(exportSvg(doc)).toContain('data-text-truncated="1"')
  })
  it('reports compact hidden structure labels and excludes positioned glyphs or invisible content from claims',()=>{
    const doc=createBlank();doc.nodes=[node({id:'positioned',height:24,textLayout:{x:0,y:.8,matrix:[1,0,0,1]}}),node({id:'hidden',visual:{opacity:0}}),node({id:'compact',kind:'module',label:'Encoder',width:90,height:70,structure:{type:'encoder'}}),node({id:'free',kind:'path',label:'A long path name',path:{points:[{x:0,y:0},{x:1,y:1}],arrow:'none'}})]
    const report=checkFigureText(doc);expect(report.positionedNodes).toBe(1);expect(report.invisibleNodes).toBe(1);expect(report.hiddenStructureLabels).toBe(4);expect(report.issues.every(i=>i.nodeId==='compact')).toBe(true)
    doc.containers[0]!.opacity=0;expect(checkFigureText(doc)).toMatchObject({checkedFields:0,total:0,invisibleNodes:3})
  })
  it('preserves field identity through capture, scaling and remapping and reports world-unit sizes',()=>{
    const doc=createBlank();doc.nodes=[node()];const asset=captureComponent(doc,'stage','Caption'),scaled=componentDocument(scaleComponent(asset,.5)),report=checkFigureText(scaled)
    expect(report.issues).toHaveLength(1);expect(report.issues[0]).toMatchObject({field:'label',fontSize:7.5,availableWidth:118,availableHeight:10,requiredLines:2,lineLimit:1})
    expect(report.issues[0]!.nodeId).toBe(scaled.nodes[0]!.id)
  })
  it('bounds detailed reports while retaining exact totals and rejects inconsistent saved counts',()=>{
    const doc=createBlank();doc.nodes=Array.from({length:100},(_,i)=>node({id:`caption-${i}`}));parseDocument(doc)
    expect(checkFigureText(doc)).toMatchObject({total:100,omitted:20,issues:expect.any(Array)});expect(checkFigureText(doc).issues).toHaveLength(80);expect(checkFigureText(doc,20)).toMatchObject({total:100,omitted:80});expect(checkFigureText(doc,0)).toMatchObject({total:100,omitted:100,issues:[]})
    expect(()=>textCheckReportSchema.parse({...checkFigureText(doc),total:99})).toThrow('总数不一致')
  })
  it('exposes bounded current-figure evidence to the model while ignoring forged response reports',()=>{
    const doc=createBlank();doc.nodes=[node()];doc.publication={...defaultPublicationSettings};const prompt=harnessPrompt({sessionId:crypto.randomUUID(),content:'Preserve all words',figure:doc,selectedIds:[],catalogue:[]}),marker='以下是当前工程快照（最新状态优先于历史会话）：\n',context=JSON.parse(prompt.split(marker)[1]!.split('\n')[0]!)
    expect(context.textCheck).toEqual(checkFigureText(doc,20))
    expect(context.publication).toEqual({settings:doc.publication,report:checkPublication(doc,doc.publication,20)});expect(context.figure).not.toHaveProperty('publication')
    const parsed=parseHarnessResponse(JSON.stringify({message:'Candidate',figure:{...doc,publication:{...doc.publication,widthMm:420,minFontPt:1}},textCheck:{total:0}}),doc);expect(parsed).not.toHaveProperty('textCheck');expect(checkFigureText(parsed.figure!).total).toBe(1);expect(parsed.figure!.publication).toEqual(doc.publication)
  })
})
