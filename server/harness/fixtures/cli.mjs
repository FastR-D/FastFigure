#!/usr/bin/env node
// Test-only CLI protocol fixture. Production never selects this file automatically.
import { createInterface } from 'node:readline'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { appendFileSync,readFileSync } from 'node:fs'
import process from 'node:process'
import { log } from 'node:console'
import { setInterval, setTimeout } from 'node:timers'
function referenceDirectory(content){const line=content.split('\n').find(line=>line.startsWith('实际参考图目录：'));return line?JSON.parse(line.slice('实际参考图目录：'.length)):null}
function response(content){
  const text=rawResponse(content),inputs=referenceDirectory(content)
  if(!inputs)return text
  let value;try{value=JSON.parse(text)}catch{return text}
  value.referenceNotes=inputs.map(r=>({image:r.index,decision:content.includes('MULTI_REF_OMIT_LAST')&&r.index===inputs.length?'omit':'use',observation:`测试夹具：图 ${r.index} 的可见特征待核对。`,application:`按 ${r.purpose} 用途参考图 ${r.index}。`,uncertainty:'协议夹具不验证视觉理解质量。'}))
  if(content.includes('MULTI_REF_BAD_ALIAS')&&value.referenceNotes.length)value.referenceNotes[0].image=3
  if(content.includes('MULTI_REF_MISSING_NOTES'))delete value.referenceNotes
  return JSON.stringify(value)
}
function validateReferenceImages(content,bytes){const selectionLine=content.split('\n').find(line=>line.startsWith('实际筛选图谱目录：')),pages=selectionLine?JSON.parse(selectionLine.slice('实际筛选图谱目录：'.length)):[];const lookup=content.split('\n').find(line=>line.startsWith('实际检索裁片指纹：'));if(lookup&&(bytes.length!==1+pages.length||createHash('sha256').update(bytes[0]).digest('hex')!==lookup.slice('实际检索裁片指纹：'.length)))throw new Error('Lookup must receive the exact crop and every candidate atlas');for(const [index,page]of pages.entries())if(page.image!==index+2||createHash('sha256').update(bytes[index+1]).digest('hex')!==page.sha256)throw new Error('Selection atlas order or bytes differ from frozen pages');const atlasLine=content.split('\n').find(line=>line.startsWith('实际组件图谱目录：'));if(atlasLine){const atlas=JSON.parse(atlasLine.slice('实际组件图谱目录：'.length));if(bytes.length!==2||createHash('sha256').update(bytes[1]).digest('hex')!==atlas.sha256)throw new Error('Catalogue atlas must be the exact second image')}const inputs=referenceDirectory(content);if(!inputs)return;if(inputs.length!==bytes.length)throw new Error('Reference image count differs from the prompt directory');for(let i=0;i<inputs.length;i++)if(inputs[i].inputSha256!==createHash('sha256').update(bytes[i]).digest('hex'))throw new Error('Reference image order/bytes differ from the directory')}
const args = process.argv.slice(2), scenario = process.env.FASTFIGURE_TEST_SCENARIO || 'proposal'
if (args.includes('--version')) { log('FastFigure test fixture 1.0.0'); process.exit(0) }
const write = value => process.stdout.write(`${JSON.stringify(value)}\n`)
if (process.env.FASTFIGURE_TEST_LOG) appendFileSync(process.env.FASTFIGURE_TEST_LOG, `${JSON.stringify(args)}\n`)
function applySurface(container,surface='plain'){container.visual={...container.visual,tone:surface==='hatch'?'hatch':'fill'};if(surface==='transparent')container.visual.fill='none';else if(container.visual.fill==='none')delete container.visual.fill}
function rawResponse(content) {
  if(content.includes('FastFigure 的参考图素材检索分析助手'))return content.includes('IMAGE_LOOKUP_BAD_ANALYSIS')?JSON.stringify({summary:'Invalid',values:[1,2]}):JSON.stringify({summary:'测试夹具：可见叠放片层及网格，非科学结构验证。',terms:[{term:'tensor-stack 透视张量栈',basis:'测试夹具：右侧叠放片层。',certainty:'visible'},{term:'invisible-secret-algorithm',basis:'测试夹具：看不清内部含义。',certainty:'uncertain'}],cautions:['夹具不评价图像识别质量。']})
  if(content.startsWith('你是 FastFigure 的素材筛选助手')){
    const query=JSON.parse(content.split('用户完整要求：')[1].split('\n')[0]),rows=JSON.parse(content.split('冻结素材目录：')[1].split('\n')[0])
    if(query.includes('SELECTION_INVALID'))return 'invalid selection JSON'
    const selected=query.includes('SELECTION_EMPTY')?null:query.includes('IMAGE_COMPONENT_LOOKUP_TEST')&&!query.includes('LOOKUP_SAVED')?rows.find(row=>row.key==='recipe:tensor-stack'):query.includes('SELECTION_DEEP_TEST')?rows.find(row=>row.name==='Preferred source'):rows.find(row=>row.key.startsWith('asset:library-'))??rows[0]
    const choices=rows.map(row=>({key:row.key,decision:row===selected?'include':query.includes('SELECTION_EMPTY')?'uncertain':'exclude',reason:'测试夹具：核对冻结目录与阶段隔离，不评价真实相关性。',requirements:[query.slice(0,200)]}))
    if(query.includes('SELECTION_BAD_KEY')&&choices.length)choices[0].key='asset:invented'
    if(query.includes('SELECTION_BAD_QUOTE')&&choices.length)choices[0].requirements=['Not a quote from the request']
    if(query.includes('SELECTION_MISSING'))choices.pop()
    return JSON.stringify({message:'测试夹具：已逐项筛选，仍需人工审阅。',choices})
  }
  if(content.includes('FastFigure 的计算机论文插图规划助手')){
    const line=content.split('\n').find(line=>line.startsWith('本轮原生组件清单：')),catalogue=line?JSON.parse(line.slice('本轮原生组件清单：'.length)):[],inputs=referenceDirectory(content)??[],entry=catalogue[0],indices=inputs.filter(r=>!(content.includes('MULTI_REF_OMIT_LAST')&&r.index===inputs.length)).map(r=>r.index)
    const components=entry?[{id:'planned-0',colorIndex:2,key:entry.key}]:[],needs=content.includes('COMPOSITION_PLAN_NEEDS_INPUT')
    const styleLine=content.split('\n').find(line=>line.startsWith('风格素材快照：')),preferred=styleLine?JSON.parse(styleLine.slice('风格素材快照：'.length)):null
    const plan={status:needs?'needs-input':'ready',title:'可审阅的原生流程方案',goal:'用真实结构表达处理阶段与输入输出',readingOrder:'left-to-right',layout:'左侧复用原生流程，在右侧留出注释空间。',style:{preset:'precise',paletteId:'figureforge-publication-soft',fontFamily:'Inter',usage:'使用柔和蓝色表示处理阶段，留白区放简洁说明。'},sections:[{id:'process',title:'处理结构',purpose:'表达流程',visual:'保留原生阶段及其连接，不替换为单个文字方框。',design:{role:'mechanism',structure:'pipeline',rationale:'原生流程适合表达已经声明的阶段顺序。',emphasis:'primary',frame:{id:'planned-region',x:0,y:0,width:1,height:1}},components,referenceImages:indices,annotations:['按箭头阅读']}],connections:[],checks:['核对组件结构与文字'],questions:needs?['请补充输出的科学含义']:[],uncertainties:['测试夹具不评价视觉或科学质量']}
    if(content.includes('COMPOSITION_PLAN_MISSING_LAYOUT'))delete plan.sections[0].design
    if(preferred){plan.style.preset=preferred.preset;plan.style.paletteId=preferred.paletteId;plan.style.fontFamily=preferred.fontFamily;plan.style.surface=preferred.surface;plan.style.roughness=preferred.roughness;plan.style.sketchStyle=preferred.sketchStyle;plan.style.colorIndex=preferred.colorIndex;plan.style.colorMap=preferred.colorMap}
    if(content.includes('COMPOSITION_COLOR_MAP')&&components.length){delete components[0].colorIndex;components[0].colorMap=entry.colorSlots.slice(0,3).map((slot,i)=>({sourcePaletteId:slot.sourcePaletteId,sourceIndex:slot.sourceIndex,targetPaletteId:plan.style.paletteId,targetIndex:i===0?2:0,role:i===0?'处理':'输出'}))}
    return JSON.stringify({message:'测试夹具：先审阅方案，采用后再绘图。',plan})
  }
  if(content.includes('FastFigure 的数据可视化选型助手')){
    if(content.includes('CHART_MULTI_VIEW_TEST')){
      const accuracy={status:'ready',kind:'scatter',xColumn:'c1',labelColumn:'c0',series:[{column:'c2',errorColumn:'c3'}],title:'Accuracy and latency',xLabel:'Latency (ms)',yLabel:'Accuracy (%)',paletteId:'figureforge-publication-soft',grid:true,showValues:false,reason:'测试夹具：用散点表示模型的延迟与准确率关系，重复延迟和缺失观测保持。',alternatives:[],cautions:['核对误差含义与模型名称。']}
      const memory={...accuracy,kind:'bar',xColumn:'c0',series:[{column:'c4'}],title:'Peak memory',xLabel:'Model',yLabel:'Memory (GB)',reason:'测试夹具：内存单独比较，不与准确率共用纵轴。',cautions:['本视图没有内存误差列。']};delete memory.labelColumn
      return JSON.stringify({message:'测试夹具：提出两个互补视图，候选仍需人工核对。',recommendation:{status:'multi-view',title:'Model trade-offs',columns:2,gap:24,views:[{caption:'Accuracy trade-off',chart:accuracy},{caption:'Memory footprint',chart:memory}],reason:'测试夹具：关系与不同单位的内存对比各用一个视图，所有输入行保留。',alternatives:[],cautions:['独立坐标与图例；不表示科学或视觉质量验证。']}})
    }
    if(content.includes('CHART_PIVOT_TEST')){
      const operation=content.includes('CHART_COMPOSITE')?{kind:'pivot',rowColumns:['c0','c1'],groupColumns:['c2','c3'],valueColumn:'c4',errorColumn:'c5'}:{kind:'pivot',rowColumns:['c0'],groupColumns:['c1'],valueColumn:'c2'}
      return JSON.stringify({message:'测试夹具：先核对长表展开，不生成图件。',recommendation:{status:'prepare',operation,reason:'测试夹具：逐次样本按 Run / Method 展开同一准确率指标，每个位置只允许一条源记录。',alternatives:[],cautions:['核对未参与展开的 Dataset 列；原表保留。']}})
    }
    if(content.includes('CHART_PIVOT_READY')&&content.includes('CHART_COMPOSITE'))return JSON.stringify({message:'测试夹具：复合行键与配对误差生成待审柱状图。',recommendation:{status:'ready',kind:'bar',xColumn:'c0',series:[{column:'c1',errorColumn:'c2'},{column:'c3',errorColumn:'c4'}],title:'Composite method comparison',xLabel:'Dataset / Model',yLabel:'Accuracy (%)',paletteId:'figureforge-publication-soft',grid:true,showValues:false,reason:'测试夹具：比较每个数据集与模型上的原始汇总数值，保留给定SE。',alternatives:[],cautions:['空值与未提供组合都不补零。']}})
    if(content.includes('CHART_PIVOT_READY'))return JSON.stringify({message:'测试夹具：基于使用者已采用的宽表生成箱线图。',recommendation:{status:'ready',kind:'boxplot',xColumn:'c0',series:[{column:'c1'},{column:'c2'}],title:'Prepared run distributions',xLabel:'Method',yLabel:'Accuracy (%)',paletteId:'figureforge-publication-soft',grid:true,showValues:false,showSamples:true,reason:'测试夹具：使用已确认的原始样本组列比较分布。',alternatives:[],cautions:['未提供组合和输入空值均不补零。']}})
    if(content.includes('CHART_DESIGN_NEEDS_INPUT'))return JSON.stringify({message:'测试夹具：先确认分组及原始重复样本。',recommendation:{status:'needs-input',suggestedKind:'箱线图',reason:'分布比较需要原始重复样本与明确的分组。',questions:['这些数值是原始样本还是聚合均值？'],alternatives:[],cautions:['未推断四分位数或误差含义。']}})
    const recommendation={status:'ready',kind:'scatter',xColumn:'c1',labelColumn:'c0',series:[{column:'c2',errorColumn:'c3'}],title:'Accuracy and latency',xLabel:'Latency (ms)',yLabel:'Accuracy (%)',paletteId:'figureforge-publication-soft',grid:true,showValues:false,reason:'测试夹具：数值变量之间的关系用散点，不暗示连接顺序。',alternatives:[{kind:'折线图',reason:'模型之间没有连续轨迹。'}],cautions:['请核对变量单位及参考图样式。']}
    if(content.includes('CHART_DESIGN_INJECT_DATA'))recommendation.values=[999,999]
    return JSON.stringify({message:'测试夹具：推荐散点并映射延迟与准确率。',recommendation})
  }
  if (scenario === 'invalid') return 'not valid JSON'
  if(content.includes('FastFigure 的独立主图设计审阅助手')){
    const rows=JSON.parse(content.split('位置目录只用于定位，不能据其 kind 或 boundary 猜测实际外观：')[1].split('\n')[0]),row=rows.find(n=>!['group','edge'].includes(n.kind))
    return JSON.stringify({message:'测试夹具：整图审阅建议，未修改画布。',firstRead:'测试夹具：首先看到中心模块，再沿连线阅读。',keep:['保留现有输入到输出关系。'],findings:[{id:'design-focus',title:'突出主要机制',category:'hierarchy',severity:'major',observation:'测试夹具观察，不代表真实视觉判断。',impact:'测试夹具：读者不易分辨主次。',suggestion:'核对论点后，减轻辅助模块边框。',box:row?.box??{x:.2,y:.2,width:.2,height:.2},objectIds:row?[row.id]:[]}],uncertainties:['协议夹具不验证审美或科学正确性。']})
  }
  if(content.includes('FastFigure 独立视觉审阅助手')){
    if(content.includes('AUDIT_BAD_JSON'))return 'not an audit report'
    if(content.includes('AUDIT_EMPTY')||content.includes('修复后复审这版候选'))return JSON.stringify({message:'测试夹具：未观察到明确问题，仍需人工核对。',findings:[],uncertainties:['测试输出不代表实际视觉质量']})
    const rows=JSON.parse(content.split('对象位置提示（不是原图答案）：')[1].split('\n')[0]),row=rows.find(n=>n.type==='text'&&!n.readOnly)
    const findings=[{id:'label-check',title:'文字需要核对',type:'text',severity:'major',detail:'测试夹具：请对照原图确认编码器标签。',suggestion:'核对并修复编码器文字，保持其他图元。',box:{x:.2,y:.15,width:.3,height:.15},objectIds:content.includes('AUDIT_BAD_OBJECT')?['invented-object']:row?[row.id]:[],textEvidence:{sourceText:'Encoder',candidateText:'Encoder',certainty:'clear'}}]
    if(content.includes('AUDIT_MULTIPLE')){const frame=rows.find(n=>n.type==='rect'&&!n.readOnly);findings.push({id:'frame-color',title:'填充颜色需要核对',type:'color',severity:'major',detail:'测试夹具：框的填充色需要与原图比较。',suggestion:'确认后使用 #cdebdc，保留文字、曲线和框的几何位置。',box:{x:.15,y:.3,width:.6,height:.4},objectIds:frame?[frame.id]:[]},{id:'unreadable',title:'小字识别不确定',type:'uncertain',severity:'uncertain',detail:'测试夹具：此处无法读清。',suggestion:'由用户核对，不自动改写。',box:{x:.3,y:.7,width:.2,height:.1},objectIds:[]})}
    return JSON.stringify({message:'测试夹具：请核对候选视觉问题。',findings,uncertainties:[]})
  }
  if(content.includes('FastFigure 的论文插图结构重建助手')){
    if(content.includes('本轮任务：识别')){
      const dims=/canvas 必须是 (\d+)×(\d+)/.exec(content),width=Number(dims[1]),height=Number(dims[2]),mapping=content.includes('图像坐标映射：')?JSON.parse(content.split('图像坐标映射：')[1].split('\n')[0]):null,sx=(mapping?.sourceWidth??width)/800,sy=(mapping?.sourceHeight??height)/400
      const scene={canvas:{width,height},revision:0,regions:[{id:'left',title:'Encoder',kind:'diagram',x:20*sx,y:40*sy,w:340*sx,h:320*sy},{id:'right',title:'Output',kind:'diagram',x:440*sx,y:40*sy,w:340*sx,h:320*sy}],nodes:[
        {id:'frame',version:0,owner:'left',type:'rect',x:40*sx,y:70*sy,w:280*sx,h:220*sy,rx:8*sx,fill:'#e9f1fb',stroke:'#4c78a8'},
        {id:'label',version:0,owner:'left',type:'text',x:70*sx,y:90*sy,w:210*sx,h:24*sy,text:'Encoder',fontSize:20*sy,fill:'#233247'},
        {id:'curve',version:0,owner:'left',type:'path',d:`M${80*sx} ${210*sy} Q${130*sx} ${120*sy} ${180*sx} ${210*sy} C${200*sx} ${240*sy} ${230*sx} ${240*sy} ${260*sx} ${210*sy}`,fill:'none',stroke:'#4c78a8',strokeWidth:2},
        {id:'output',version:0,owner:'right',type:'ellipse',x:520*sx,y:150*sy,w:140*sx,h:70*sy,fill:'#f2d8c7',stroke:'#9b6240'},
        {id:'arrow',version:0,type:'line',x:335*sx,y:185*sy,x2:500*sx,y2:185*sy,arrow:true,stroke:'#334155'},
      ]}
      const roi=mapping?.sourceRect??JSON.parse(content.split('识别区域：')[1].split('\n')[0]);scene.regions=scene.regions.filter(r=>r.x>=roi.x&&r.y>=roi.y&&r.x+r.w<=roi.x+roi.w&&r.y+r.h<=roi.y+roi.h);const owners=new Set(scene.regions.map(r=>r.id));scene.nodes=scene.nodes.filter(n=>owners.has(n.owner)||!n.owner&&roi.w===(mapping?.sourceWidth??width))
      if(mapping){const a=width/roi.w,b=height/roi.h,f=Math.sqrt(a*b),x=v=>(v-roi.x)*a,y=v=>(v-roi.y)*b;scene.regions=scene.regions.map(r=>({...r,x:x(r.x),y:y(r.y),w:r.w*a,h:r.h*b}));scene.nodes=scene.nodes.map(n=>{const row={...n,strokeWidth:(n.strokeWidth??1)*f};if(n.type==='path'){let i=0;row.d=n.d.replace(/-?(?:\d*\.)?\d+/g,v=>String(i++%2?y(Number(v)):x(Number(v))))}else{row.x=x(n.x);row.y=y(n.y);if(n.w!==undefined){row.w=n.w*a;row.h=n.h*b}if(n.x2!==undefined){row.x2=x(n.x2);row.y2=y(n.y2)}if(n.fontSize!==undefined)row.fontSize=n.fontSize*f;if(n.rx!==undefined)row.rx=n.rx*f}return row})}
      const reuse=[]
      if(content.includes('RECONSTRUCTION_REUSE_TEST')){const line=content.split('\n').find(line=>line.startsWith('可复用原生组件清单：')),entries=line?JSON.parse(line.slice('可复用原生组件清单：'.length)):[],entry=entries.find(e=>e.key==='recipe:tensor-stack')??entries.find(e=>e.key==='seed:tensor')??entries[0],box=scene.regions.find(r=>r.id==='right');if(!entry||!box)throw new Error('Native reconstruction fixture requires selected components and right source region');scene.nodes=scene.nodes.filter(n=>n.owner!=='right');reuse.push({id:'native-output',componentKey:content.includes('RECONSTRUCTION_REUSE_BAD_KEY')?'seed:invented':entry.key,x:box.x+10,y:box.y+10,w:box.w-20,h:box.h-20,reason:'测试夹具：复用可编辑的输出结构。',differences:['源图椭圆替换为库内原生结构，需由作者核对方法含义；夹具不判断科学等价。']})}
      const attachments=reuse[0]?.componentKey==='recipe:tensor-stack'?[{pathId:'arrow',end:'end',instanceId:'native-output',nodeId:'plane-0',anchorIndex:1,reason:'测试夹具：将可见引线附着到明确原生锚点，不验证科学关系。'}]:[]
      return JSON.stringify({message:'测试夹具：识别了形状、文字和贝塞尔曲线。',warnings:['测试夹具，不代表真实视觉识别质量'],scene,reuse,attachments})
    }
    const catalog=JSON.parse(content.split('分区目录：')[1].split('\n')[0]),row=catalog.nodes.find(n=>n.type==='text')
    if(content.includes('RECONSTRUCTION_BAD_PATCH'))return JSON.stringify({message:'Test forbidden edit',patch:{operations:[{op:'delete',id:catalog.readOnlyContext[0].id,version:0}]}})
    if(content.includes('RECONSTRUCTION_NO_CHANGE'))return JSON.stringify({message:'测试夹具：本轮没有确认到需修改之处，保留上一版候选。',patch:{operations:[]}})
    const operations=row?[{op:'update',id:row.id,version:row.version,node:{...row,text:'Encoder corrected'}}]:[]
    if(content.includes('本轮由用户选择的视觉问题')&&content.includes('"frame-color"')){const frame=catalog.nodes.find(n=>n.type==='rect');if(frame)operations.push({op:'update',id:frame.id,version:frame.version,node:{...frame,fill:'#cdebdc'}})}
    return JSON.stringify({message:'测试夹具：修复所选分区问题。',patch:{operations}})
  }
  const marker = '以下是当前工程快照（最新状态优先于历史会话）：\n'
  if (scenario === 'text' || !content.includes(marker)) return JSON.stringify({ message: 'Fixture connection ready', figure: null })
  const context = JSON.parse(content.split(marker)[1].split('\n')[0])
  const figure = context.figure
  if(content.includes('EDGE_WAYPOINT_TEST'))return JSON.stringify({message:'测试夹具：恢复选中连线的自动避障，等待人工采用。',figure:null,materialEdits:[{kind:'edge-route',edgeId:context.selectedIds.find(id=>figure.edges.some(e=>e.id===id)),points:[],direction:'horizontal'},{kind:'line-style',objectIds:context.selectedIds.filter(id=>figure.edges.some(e=>e.id===id)),includeDescendants:false,style:{stroke:'#287f72',strokeWidth:2,arrow:'open',startArrow:'open',arrowSize:10}}]})
  if(content.includes('RECIPE_UPDATES_TEST')){
    const target=context.recipeUpdateTargets.find(target=>target.recipeId==='tensor-stack')??context.recipeUpdateTargets[0];if(!target)throw new Error('Parameter fixture requires an existing native target')
    const update={containerId:target.containerId,parameters:content.includes('RECIPE_UPDATES_NOOP')?target.parameters:target.recipeId==='tensor-stack'?{layers:7,rows:5}:{hiddenLayers:2},layout:'frame',keepEdits:true,reason:'测试夹具：更新已有组合并保留手工编辑与有效连接。'}
    return JSON.stringify({message:'测试夹具：已有组合参数候选。',figure:null,recipeUpdates:[update]})
  }
  if(content.includes('LIBRARY_RECALL_TEST')){
    const asset=context.catalogue.find(item=>item.key.startsWith('asset:library-'));if(!asset)throw new Error('Recall fixture requires a server-frozen library snapshot')
    figure.nodes=[];figure.edges=[];figure.containers=[{id:'stage',parentId:null,role:'stage',title:'Recalled native fixture',x:40,y:90,width:920,height:490}]
    return JSON.stringify({message:'测试夹具：仅复用服务端已冻结的召回组件，不评价检索质量。',figure,instances:[{id:'recalled-native',componentKey:asset.key,parentId:'stage',x:80,y:160,fit:{width:800,height:400},keepAppearance:true}],instanceLinks:[]})
  }
  if(content.includes('STYLE_ASSET_TEST')){
    const style=context.styleReference;if(!style)throw new Error('Style fixture needs a fixed source snapshot')
    figure.style.preset=content.includes('STYLE_ASSET_BAD_STYLE')?(style.preset==='sketch'?'precise':'sketch'):style.preset;figure.style.fontFamily=style.fontFamily;figure.style.sketchStyle=style.sketchStyle;if(style.roughness!==undefined)figure.style.roughness=style.roughness;figure.style.paletteId=style.paletteId;figure.style.colorIndex=style.colorIndex;figure.style.colorMap=style.colorMap;applySurface(figure.containers[0],style.surface)
    for(const node of figure.nodes)if(!node.textLayout&&!node.chart){node.textStyle={...node.textStyle,family:style.fontFamily};if(node.description)node.descriptionStyle={...node.descriptionStyle,family:style.fontFamily}}
    return JSON.stringify({message:'测试夹具：使用固定风格快照。',figure:{...figure,styleUses:[]}})
  }
  if(content.includes('COMPOSITION_PLAN_DRAW')){
    const record=context.adoptedComposition;if(!record)throw new Error('Composition draw fixture requires an adopted plan')
    figure.nodes=[];figure.edges=[];figure.containers=[{id:'stage',parentId:null,role:'stage',title:'Planned method',x:40,y:90,width:920,height:490}];figure.style.preset=content.includes('COMPOSITION_DRAW_BAD_STYLE')?'sketch':record.plan.style.preset;figure.style.fontFamily=record.plan.style.fontFamily;figure.style.sketchStyle=record.plan.style.sketchStyle;if(record.plan.style.roughness!==undefined)figure.style.roughness=record.plan.style.roughness;figure.style.paletteId=record.plan.style.paletteId;figure.style.colorIndex=record.plan.style.colorIndex;figure.style.colorMap=record.plan.style.colorMap;applySurface(figure.containers[0],record.plan.style.surface)
    figure.containers.push({id:'planned-region',parentId:'stage',role:'component',title:'Planned mechanism',x:52,y:138,width:896,height:430,visual:{fill:'none',stroke:'none'}})
    const components=record.plan.sections.flatMap(s=>s.components),instances=content.includes('COMPOSITION_DRAW_SKIP_ASSET')?[]:components.map((component,i)=>({id:component.id,componentKey:component.key,parentId:'planned-region',x:100+i*360,y:180,keepAppearance:true,scale:1,...(component.parameters?{parameters:component.parameters}:{})}))
    if(!components.length)figure.nodes.push({id:'plan-note',parentId:'planned-region',kind:'text',label:'Native mechanism explanation',x:100,y:180,width:400,height:44})
    return JSON.stringify({message:'测试夹具：按采用方案复用固定组件。',figure,instances,instanceLinks:[]})
  }
  if(content.includes('TEXT_CHECK_TEST')){
    if(!context.textCheck||context.textCheck.engine!=='native-wrap-v1')throw new Error('Text-check fixture requires program-owned current-figure evidence')
    figure.nodes=[{id:'caption',parentId:'stage',kind:'text',label:'Generated line one\nGenerated line two',x:100,y:200,width:240,height:24,textStyle:{family:'Inter',size:15}}];figure.edges=[];figure.containers=[{id:'stage',parentId:null,role:'stage',title:'Text check',x:40,y:90,width:920,height:490}]
    return JSON.stringify({message:'测试夹具：返回带原生文字排版的候选。',figure,textCheck:{total:0,issues:[]}})
  }
  if (content.includes('COMPOSE_COMPONENTS_TEST')) {
    const personal = context.catalogue.find(item => item.key.startsWith('asset:'))
    if (!personal || !context.catalogue.some(item => item.key === 'recipe:fusion')) throw new Error('Composition fixture requires a personal component and fusion recipe')
    figure.nodes = []; figure.edges = []
    figure.containers = [{ id: 'stage', parentId: null, role: 'stage', title: 'Composed method', x: 40, y: 90, width: 920, height: 490 }]
    figure.style.preset = 'precise'
    return JSON.stringify({ message: '测试组合候选：复用个人流水线和双分支融合。', figure,
      instances: [
        { id: 'personal-stage', componentKey: personal.key, parentId: 'stage', x: 80, y: 150, labels: { 'step-0': 'User-defined encoder' } },
        { id: 'fusion-stage', componentKey: 'recipe:fusion', parentId: 'stage', x: 380, y: 330, parameters: { branches: 2, operator: 'sum', feature: 'tensor' } },
      ],
      instanceLinks: [{ id: 'composed-bridge', source: { scope: 'port', instanceId: 'personal-stage', port: 'output', index: 0 }, target: { scope: 'port', instanceId: 'fusion-stage', port: 'input', index: 0 }, sourcePort: 'right', targetPort: 'left' }],
    })
  }
  if (figure.nodes[0]) figure.nodes[0].label = 'Harness edited input'
  figure.style.preset = 'sketch'
  if (scenario === 'bad-geometry') figure.nodes[0].x = -100
  return JSON.stringify({ message: '测试候选图：修改标签并应用手绘样式。', figure })
}
if (args.includes('app-server')) {
  const threadId = 'fixture-thread'
  createInterface({ input: process.stdin }).on('line', line => {
    const message = JSON.parse(line)
    if (message.method === 'initialize'&&scenario!=='stall-init') write({ id: message.id, result: {} })
    if (message.method === 'thread/start') write({ id: message.id, result: { thread: { id: threadId } } })
    if (message.method === 'turn/interrupt') write({ id: message.id, result: {} })
    if (message.method !== 'turn/start') return
    if(message.params.input[0].text.includes('FastFigure 独立视觉审阅助手')&&message.params.input.filter(i=>i.type==='localImage').length!==2)throw new Error('Visual audit requires two ordered images')
    if(message.params.input[0].text.includes('CHART_DESIGN_WITH_IMAGE')&&message.params.input.filter(i=>i.type==='localImage').length!==1)throw new Error('Data chart selection requires an actual style image')
    const turnId = `turn-${message.id}`, params = { threadId, turnId }
    if(message.params.input[0].text.includes('FastFigure 图像草稿助手')){
      const images=message.params.input.filter(i=>i.type==='localImage'),bytes=images.length?readFileSync(images[0].path):Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAD0lEQVR4nGP4jwMwDC0JALoev0Ewkwr8AAAAAElFTkSuQmCC','base64')
      const item={id:'generated-fixture',type:'imageGeneration',status:'completed',result:bytes.toString('base64'),inputImages:images.map(image=>({path:image.path,sha256:createHash('sha256').update(readFileSync(image.path)).digest('hex')})),revisedPrompt:'Authored protocol fixture; not real image generation.'}
      if(scenario==='image-extra-input')item.inputImages.push({path:'/not-selected.png',sha256:'a'.repeat(64)})
      if(scenario==='image-no-result'){delete item.result;item.fileId='opaque-fixture-file'}
      const sendImage=()=>{write({method:'item/started',params:{...params,item:{id:item.id,type:'imageGeneration',status:'in_progress'}}});write({method:'item/completed',params:{...params,item}});write({method:'turn/completed',params:{threadId,turn:{id:turnId,status:'completed'}}})}
      if(scenario==='early'){sendImage();write({id:message.id,result:{turn:{id:turnId}}});return}
      write({id:message.id,result:{turn:{id:turnId}}});if(scenario==='stall')return;setTimeout(sendImage,scenario==='slow'?800:20);return
    }
    validateReferenceImages(message.params.input[0].text,message.params.input.filter(i=>i.type==='localImage').map(i=>readFileSync(i.path)))
    const text = response(message.params.input[0].text)
    const send = () => {
      write({ method: 'item/agentMessage/delta', params: { ...params, threadId: 'unrelated-thread', itemId: 'other', delta: 'DO NOT LEAK' } })
      write({ method: 'item/agentMessage/delta', params: { ...params, turnId: 'old-turn', itemId: 'other', delta: 'DO NOT LEAK' } })
      write({ method: 'item/agentMessage/delta', params: { ...params, itemId: 'answer', delta: text.slice(0, 20) } })
      write({ method: 'item/agentMessage/delta', params: { ...params, itemId: 'answer', delta: text.slice(20) } })
      write({ method: 'item/completed', params: { ...params, item: { id: 'answer', type: 'agentMessage', phase: 'final_answer', text } } })
      write({ method: 'turn/completed', params: { threadId, turn: { id: turnId, status: 'completed' } } })
    }
    if (scenario === 'early') { send(); write({ id: message.id, result: { turn: { id: turnId } } }); return }
    write({ id: message.id, result: { turn: { id: turnId } } })
    if (scenario === 'stall') return
    setTimeout(send, scenario === 'slow' ? (message.params.input[0].text.includes('按计划核对分区')?2000:800) : 20)
  })
} else {
  const id = args[args.indexOf(args.includes('--resume') ? '--resume' : '--session-id') + 1]
  let input = ''
  process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => { input += chunk })
  process.stdin.on('end', () => {
    const request = JSON.parse(input), text = response(request.message.content[0].text)
    validateReferenceImages(request.message.content[0].text,request.message.content.filter(i=>i.type==='image').map(i=>Buffer.from(i.source.data,'base64')))
    if(request.message.content[0].text.includes('FastFigure 独立视觉审阅助手')&&request.message.content.filter(i=>i.type==='image').length!==2)throw new Error('Visual audit requires two ordered images')
    if(request.message.content[0].text.includes('CHART_DESIGN_WITH_IMAGE')&&request.message.content.filter(i=>i.type==='image').length!==1)throw new Error('Data chart selection requires an actual style image')
    write({ type: 'system', subtype: 'init', session_id: scenario === 'wrong-session' ? 'other-session' : id })
    if (scenario === 'stall') { setInterval(() => undefined, 1000); return }
    const send = () => {
      write({ type: 'stream_event', session_id: id, event: { delta: { type: 'text_delta', text: text.slice(0, 20) } } })
      write({ type: 'stream_event', session_id: id, event: { delta: { type: 'text_delta', text: text.slice(20) } } })
      write({ type: 'assistant', session_id: id, message: { content: [{ type: 'text', text }] } })
      write({ type: 'result', session_id: id, result: text, is_error: false })
    }
    setTimeout(send, scenario === 'slow' ? (request.message.content[0].text.includes('按计划核对分区')?2000:800) : 20)
  })
}
