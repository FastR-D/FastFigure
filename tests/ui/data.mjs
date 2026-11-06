import assert from 'node:assert/strict';
export async function checkData({ page, panel, turn, send, run, saveProject, undo, redo, choose }) {
    const original = await saveProject(), goal = '分别展示延迟与准确率关系、各模型内存用量，标明模型名称。';
    await page.getByRole('button', { name: '助手', exact: true }).click();
    await choose('助手本轮任务', '先规划绘图方案', panel);
    await panel.getByRole('button', { name: '导入数据，让助手选图', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '导入数据与选图', exact: true });
    const compound='Dataset,Model,Method,Mode,Accuracy (%),SE (%),Note\nD1,S,Base,fp16,76,.5,keep\nD1,S,Ours,fp16,8.2e1,.4,keep\nD2,S,Base,fp16,78,.6,keep\nD2,S,Ours,fp16,,,missing\nD1,L,Base,fp16,0,0,zero';
    await dialog.getByLabel('导入选图数据文件',{exact:true}).setInputFiles({name:'compound.csv',mimeType:'text/csv',buffer:Buffer.from(compound)});await dialog.getByRole('textbox',{name:'选图表达目标',exact:true}).fill('比较各数据集与模型上两种方法，保留给定误差。');await dialog.getByRole('textbox',{name:'选图误差含义',exact:true}).fill('Mean ± SE');await choose('选图数值含义','已汇总的均值 / 统计量',dialog);await dialog.getByRole('button',{name:'附到左侧助手',exact:true}).click();
    const preparationRun=await send('CHART_PIVOT_TEST CHART_COMPOSITE：先预览复合键与给定误差的长表展开。');await turn(preparationRun.id).getByRole('button',{name:'预览长表整理',exact:true}).click();const preparation=page.getByRole('dialog',{name:'长表整理预览',exact:true});assert.equal(await preparation.getByRole('table',{name:'整理前原始长表',exact:true}).getByRole('row').count(),6);const wide=preparation.getByRole('table',{name:'整理后宽表',exact:true});assert.equal(await wide.getByRole('row').count(),4);assert.equal(await wide.getByRole('row').nth(1).getByRole('cell').nth(2).getAttribute('title'),'源表第 2 行 · SE (%)');assert.equal(await wide.getByText('（未提供）',{exact:true}).count(),2);assert.equal(await wide.getByText('（输入空值）',{exact:true}).count(),2);await preparation.getByRole('button',{name:'采用为数据附件',exact:true}).click();
    const plotted=await send('CHART_PIVOT_READY CHART_COMPOSITE：使用已确认的宽表生成带配对误差的对比图。');await turn(plotted.id).getByRole('button',{name:'应用候选图',exact:true}).waitFor();const compositeRun=await run(plotted.id),compositeCandidate=compositeRun.events.find(e=>e.proposal).proposal,compositeSpec=compositeCandidate.containers.find(c=>c.dataChart).dataChart.spec;
    assert.deepEqual(compositeSpec.x,['D1 · S','D2 · S','D1 · L']);assert.deepEqual(compositeSpec.series,[{name:'Base · fp16',values:[76,78,0],errors:[.5,.6,0]},{name:'Ours · fp16',values:[82,null,null],errors:[.4,null,null]}]);assert.deepEqual(plotted.input.chartData.preparation.operation,{kind:'pivot',rowColumns:['c0','c1'],groupColumns:['c2','c3'],valueColumn:'c4',errorColumn:'c5'});assert.equal(compositeSpec.dataPreparation.preparation.source.rows[1][4],'8.2e1');assert.deepEqual(await saveProject(),original);await turn(plotted.id).getByRole('button',{name:'应用候选图',exact:true}).click();assert.deepEqual(await saveProject(),compositeCandidate);await undo();assert.deepEqual(await saveProject(),original);await panel.getByRole('button',{name:'移除数据附件',exact:true}).click();await panel.getByRole('button',{name:'导入数据，让助手选图',exact:true}).click();
    await dialog.getByRole('textbox', { name: '选图原始数据', exact: true }).fill('X,Y\n1,2,3\n4,5');
    assert(await dialog.getByRole('button', { name: '附到左侧助手', exact: true }).isDisabled());
    await dialog.getByLabel('导入选图数据文件', { exact: true }).setInputFiles({ name: 'models.csv', mimeType: 'text/csv', buffer: Buffer.from('Model,Latency (ms),Accuracy (%),Accuracy_err,Memory (GB)\nA,12,76,0.5,3\nB,12,83,0.6,4\nC,40,,,5\nD,64,90,1,6') });
    await dialog.getByRole('textbox', { name: '选图表达目标', exact: true }).fill(goal);
    await dialog.getByRole('textbox', { name: '选图误差含义', exact: true }).fill('Mean ± SE');
    await dialog.getByRole('button', { name: '附到左侧助手', exact: true }).click();
    const accepted = await send('CHART_MULTI_VIEW_TEST：按导入目标使用互补视图展示两类问题。');
    await turn(accepted.id).getByRole('button', { name: '应用候选图', exact: true }).waitFor();
    const result = await run(accepted.id), candidate = result.events.find(e => e.proposal).proposal;
    const charts = candidate.containers.filter(c => c.dataChart), report = result.events.find(e => e.chartRecommendation).chartRecommendation;
    assert.equal(accepted.input.chartData.visualizationGoal, goal);
    assert.equal(accepted.input.intent, undefined);
    assert.equal(report.recommendation.status, 'multi-view');
    assert.equal(charts.length, 2);
    const spec = charts[0].dataChart.spec;
    assert.deepEqual(spec.x, [12, 12, 40, 64]);
    assert.deepEqual(spec.pointLabels, ['A', 'B', 'C', 'D']);
    assert.deepEqual(spec.series[0].values, [76, 83, null, 90]);
    assert.deepEqual(spec.series[0].errors, [.5, .6, null, 1]);
    assert.equal(spec.errorLabel, 'Mean ± SE');
    assert.deepEqual(charts[1].dataChart.spec.series[0].values, [3, 4, 5, 6]);
    assert.equal(charts[1].dataChart.spec.errorLabel, '');
    assert.deepEqual(await saveProject(), original);
    await turn(accepted.id).getByRole('button', { name: '应用候选图', exact: true }).click();
    assert.deepEqual(await saveProject(), candidate);
    await undo();
    assert.deepEqual(await saveProject(), original);
    await redo();
    await saveProject();
    await page.reload();
    await page.getByTestId('figure-canvas').waitFor();
    assert.deepEqual(await saveProject(), candidate);
    // Reuse this data journey for numeric color comparison and editable shared scales.
    const heatInput=await page.evaluate(async()=>{
        const {createBlank}=await import('/src/core/model.ts'),{buildDataChart}=await import('/src/core/dataChart.ts'),{chartExample}=await import('/src/core/dataChartTable.ts'),{instantiateComponentAt,scaleComponent}=await import('/src/core/assets.ts');
        let doc=createBlank();Object.assign(doc.containers[0],{x:0,y:0,width:1000,height:620,title:'Compared heatmaps'});doc.title='Compared heatmaps';doc.style.preset='precise';
        const base={...chartExample('heatmap'),valueLabel:'Score (a.u.)',series:[{name:'A',values:[0,10,null]},{name:'B',values:[5,15,20]}]};
        for(const [id,x,spec] of [['first',35,{...base,title:'Matrix A'}],['second',540,{...base,title:'Matrix B',fontSize:12,series:[{name:'A',values:[20,30,null]},{name:'B',values:[10,25,40]}]}]])doc=instantiateComponentAt(doc,scaleComponent(buildDataChart(spec),.42),'stage',{x,y:120},id,true).document;
        const {editableFigure}=await import('/src/core/editableFigure.ts');return JSON.parse(JSON.stringify(editableFigure(doc)));
    });
    await page.getByRole('navigation',{name:'工作区导航',exact:true}).getByRole('button',{name:'组件',exact:true}).click();
    await page.getByRole('button',{name:'工程',exact:true}).click();await page.getByLabel('导入工程文件',{exact:true}).setInputFiles({name:'heatmap-comparison.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(heatInput))});await page.getByRole('dialog',{name:'工程管理',exact:true}).waitFor({state:'hidden'});assert.deepEqual(await saveProject(),heatInput);
    const canvas=page.getByTestId('figure-canvas');await page.getByRole('toolbar',{name:'画布工具',exact:true}).getByRole('button',{name:'多子图编排',exact:true}).click();const layout=page.getByRole('dialog',{name:'多子图编排',exact:true});
    await layout.getByRole('group',{name:'子图工具模式',exact:true}).getByRole('button',{name:'共享色标',exact:true}).click();await choose('共享色标字体','MiSans · 小米黑体',layout);await layout.getByLabel('共享色标实际报告',{exact:true}).waitFor();
    await layout.getByRole('button',{name:'应用共享色标',exact:true}).click();const shared=await saveProject(),group=shared.containers.find(c=>c.sharedColorbar),record=group.sharedColorbar;
    assert.equal(record.min,0);assert.equal(record.max,40);for(const root of shared.containers.filter(c=>c.dataChart))assert.deepEqual(root.dataChart.spec.series,heatInput.containers.find(c=>c.id===root.id).dataChart.spec.series);
    const local=shared.nodes.filter(n=>n.chart?.key?.startsWith('colorbar-'));for(const node of local)assert.equal(await canvas.locator(`[data-object-id="${node.id}"]`).count(),0);
    const sameValue=[shared.nodes.find(n=>n.parentId==='first'&&n.chart?.key==='series-0-point-1'),shared.nodes.find(n=>n.parentId==='second'&&n.chart?.key==='series-1-point-0')],paint=await Promise.all(sameValue.map(n=>canvas.locator(`[data-object-paint-id="${n.id}"] rect`).first().getAttribute('fill')));assert.equal(paint[0],paint[1]);

    const title=shared.nodes.find(n=>n.parentId===group.id&&n.kind==='text'&&n.label===record.valueLabel);await choose('画布缩放','75%');await page.keyboard.press('Escape');await canvas.locator(`[data-object-id="${title.id}"]`).click();await choose('文字字体','Comic Sans MS · 系统 / Comic Neue 回退');const restyled=await saveProject();assert.equal(restyled.nodes.find(n=>n.id===title.id).textStyle.family,'Comic Sans MS');assert.equal(await canvas.locator('[data-shared-colorbar-warning]').count(),0);
    const cell=shared.nodes.find(n=>n.parentId==='second'&&n.chart?.key==='series-0-point-0');await canvas.locator(`[data-object-id="${cell.id}"]`).click({position:{x:5,y:5}});await page.getByLabel('形状填充颜色',{exact:true}).fill('#ff0000');await page.getByLabel('形状填充颜色',{exact:true}).dispatchEvent('change');await saveProject();assert.equal(await canvas.locator('[data-shared-colorbar-warning]').count(),1);for(const node of local)assert.equal(await canvas.locator(`[data-object-id="${node.id}"]`).count(),1);await undo();assert.equal(await canvas.locator('[data-shared-colorbar-warning]').count(),0);
    await page.getByRole('toolbar',{name:'画布工具',exact:true}).getByRole('button',{name:'多子图编排',exact:true}).click();await layout.getByRole('group',{name:'子图工具模式',exact:true}).getByRole('button',{name:'共享色标',exact:true}).click();await layout.getByRole('button',{name:'调整已有色标',exact:true}).click();assert(await layout.getByRole('button',{name:'应用色标同步',exact:true}).isDisabled());
    await choose('已有色标色阶','顺序青绿',layout);await choose('已有色标范围方式','指定统一范围',layout);await layout.getByRole('spinbutton',{name:'已有色标下界',exact:true}).fill('0');await layout.getByRole('spinbutton',{name:'已有色标上界',exact:true}).fill('50');await choose('已有色标字体','MiSans · 小米黑体',layout);await layout.getByRole('spinbutton',{name:'已有色标字号',exact:true}).fill('10');await choose('已有色标位置','顶部空白区',layout);await layout.getByLabel('共享色标实际报告',{exact:true}).waitFor();await layout.getByRole('button',{name:'应用色标同步',exact:true}).click();const synchronized=await saveProject(),updated=synchronized.containers.find(c=>c.id===group.id);
    assert.deepEqual(synchronized.nodes.map(n=>n.id),restyled.nodes.map(n=>n.id));assert.deepEqual(updated.sharedColorbar.parts.map(p=>p.nodeId),record.parts.map(p=>p.nodeId));assert.equal(updated.sharedColorbar.paletteId,'heat-teal');assert.equal(updated.sharedColorbar.max,50);for(const chart of synchronized.containers.filter(c=>c.dataChart)){const old=restyled.containers.find(c=>c.id===chart.id);assert.deepEqual(chart.dataChart.spec.series,old.dataChart.spec.series);assert.deepEqual(chart.dataChart.spec.x,old.dataChart.spec.x);assert.equal(chart.dataChart.spec.paletteId,'heat-teal');assert.equal(chart.dataChart.spec.colorMax,50);}
    const updatedPaint=await Promise.all(sameValue.map(n=>canvas.locator(`[data-object-paint-id="${n.id}"] rect`).first().getAttribute('fill')));assert.deepEqual(updatedPaint,['#bfe4e4','#bfe4e4']);assert.equal(await canvas.locator('[data-shared-colorbar-warning]').count(),0);
    await page.evaluate(()=>document.fonts.ready);
    const colorbarGlyphs=await page.evaluate(doc=>{
        const group=doc.containers.find(c=>c.sharedColorbar);
        return group.sharedColorbar.parts.slice(32).map(part=>{
            const node=doc.nodes.find(n=>n.id===part.nodeId),text=document.querySelector(`[data-object-paint-id="${node.id}"] text`),glyph=text.getBBox(),x=node.x+node.width*node.textLayout.x,y=node.y+node.height*node.textLayout.y;
            return{source:node.label,text:text.textContent,truncated:text.getAttribute('data-text-truncated'),glyph:{left:x+glyph.x,top:y+glyph.y,right:x+glyph.x+glyph.width,bottom:y+glyph.y+glyph.height},box:{left:node.x,top:node.y,right:node.x+node.width,bottom:node.y+node.height}};
        });
    },synchronized);
    for(const row of colorbarGlyphs){assert.equal(row.text,row.source);assert.notEqual(row.truncated,'1');for(const side of ['left','top'])assert(row.glyph[side]>=row.box[side]-.1);for(const side of ['right','bottom'])assert(row.glyph[side]<=row.box[side]+.1);}
    await page.getByRole('toolbar',{name:'画布工具',exact:true}).getByRole('button',{name:'多子图编排',exact:true}).click();await layout.getByRole('group',{name:'子图工具模式',exact:true}).getByRole('button',{name:'绘图区对齐',exact:true}).click();await layout.getByLabel('绘图区对齐实际报告',{exact:true}).waitFor();await layout.getByRole('button',{name:'应用绘图区对齐',exact:true}).click();const aligned=await saveProject();
    assert.deepEqual(aligned.nodes.map(n=>n.id),synchronized.nodes.map(n=>n.id));assert.deepEqual(aligned.containers.find(c=>c.id===group.id),updated);assert.equal(await canvas.locator('[data-shared-colorbar-warning]').count(),0);
    const frames=[];for(const chart of aligned.containers.filter(c=>c.dataChart)){const old=synchronized.containers.find(c=>c.id===chart.id),{plotArea,...spec}=chart.dataChart.spec;assert(plotArea);assert.deepEqual(spec,old.dataChart.spec);const frame=aligned.nodes.find(n=>n.parentId===chart.id&&n.chart?.key==='matrix-frame'),rect=await canvas.locator(`[data-object-paint-id="${frame.id}"] rect`).first().boundingBox();frames.push(rect);for(const cell of aligned.nodes.filter(n=>n.parentId===chart.id&&/^series-\d+-point-\d+$/.test(n.chart?.key??'')))assert(Math.abs(cell.width-cell.height)<1e-6);}
    assert(Math.abs(frames[0].y-frames[1].y)<.1);assert(Math.abs(frames[0].y+frames[0].height-frames[1].y-frames[1].height)<.1);

}
