import assert from 'node:assert/strict';
import {join} from 'node:path';

export async function checkLibraryDrag({page,canvas,screen,original,saveProject,undo,choose,results}){
    const sidebar=page.locator('#workspace-sidebar'),navigation=page.getByRole('navigation',{name:'工作区导航',exact:true});
    const fixture={...original,containers:[original.containers[0],{id:'drop-group',parentId:'stage',title:'Nested',role:'component',x:600,y:250,width:300,height:180}],nodes:[],edges:[]};
    const load=async(doc,name)=>{await page.getByRole('button',{name:'工程',exact:true}).click();await page.getByLabel('导入工程文件',{exact:true}).setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await page.getByRole('dialog',{name:'工程管理',exact:true}).waitFor({state:'hidden'});};
    const begin=async(card,x,y)=>{
        await card.scrollIntoViewIfNeeded();const box=await card.boundingBox(),to=await screen(x,y),from={x:box.x+box.width/2,y:box.y+20};
        await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(from.x+10,from.y+5,{steps:3});await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.move(to.x+.1,to.y+.1);
        await canvas.locator('..').locator('[data-component-drop]').waitFor();
    };
    const drop=async(card,x,y)=>{await begin(card,x,y);await page.mouse.up();await page.locator('[data-component-drop]').waitFor({state:'hidden'});};
    await load(fixture,'library-drop-test.json');await navigation.getByRole('button',{name:'组件',exact:true}).click();await sidebar.getByRole('button',{name:'基础',exact:true}).click();
    await begin(sidebar.getByRole('button',{name:'添加神经元',exact:true}),260,300);await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await saveProject(),fixture);assert.equal(await page.locator('[data-component-drop]').count(),0);
    await drop(sidebar.getByRole('button',{name:'添加神经元',exact:true}),260,300);const first=await saveProject(),neuron=first.nodes.find(n=>n.kind==='neuron');assert(neuron);assert(Math.abs(neuron.x-220)<1);assert(Math.abs(neuron.y-260)<1);assert.equal(neuron.parentId,'stage');assert.equal(await page.getByRole('dialog').count(),0);
    // Mouse gestures are canceled in capture phase, including when the pointer leaves the canvas.
    const at=await screen(450,350),beforePan=await canvas.boundingBox();await page.mouse.move(at.x,at.y);await page.mouse.down({button:'right'});
    const suppressed=await page.evaluate(()=>{
        const viewport=document.querySelector('.canvas-viewport'),probe=(target,type,options={})=>!target.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,button:2,buttons:2,...options}));
        return{active:viewport.classList.contains('is-panning'),move:probe(window,'mousemove'),context:probe(window,'contextmenu'),drag:!window.dispatchEvent(new Event('dragstart',{cancelable:true})),selection:!window.dispatchEvent(new Event('selectstart',{cancelable:true}))};
    });assert.deepEqual(suppressed,{active:true,move:true,context:true,drag:true,selection:true});
    await page.mouse.move(at.x+35,at.y+20,{steps:4});await page.mouse.up({button:'right'});const panned=await canvas.boundingBox();assert(Math.abs(panned.x-beforePan.x-35)<1);assert(Math.abs(panned.y-beforePan.y-20)<1);assert.deepEqual(await saveProject(),first);
    const terminal=await page.locator('.canvas-viewport').evaluate(viewport=>['mousedown','mouseup','auxclick','contextmenu'].every(type=>!viewport.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,button:2}))));assert(terminal);
    const cancelAt=await screen(450,350);await page.mouse.move(cancelAt.x,cancelAt.y);await page.mouse.down({button:'right'});await page.mouse.move(cancelAt.x+10,cancelAt.y+10);await page.locator('.canvas-viewport').dispatchEvent('lostpointercapture');await page.mouse.up({button:'right'});assert.equal(await page.locator('.canvas-viewport.is-panning').count(),0);const canceledPan=await canvas.boundingBox();assert(Math.abs(canceledPan.x-panned.x)<1);assert(Math.abs(canceledPan.y-panned.y)<1);
    await choose('画布缩放','75%');await page.keyboard.press('Escape');
    await drop(sidebar.getByRole('button',{name:'添加特征拼接',exact:true}),750,340);const nested=await saveProject(),concat=nested.nodes.find(n=>n.kind==='operator');assert.equal(concat.parentId,'drop-group');assert(Math.abs(concat.x-710)<1);assert(Math.abs(concat.y-300)<1);await undo();assert.deepEqual(await saveProject(),first);
    // Releasing right drag and returning to normal editing must remove all global mouse guards.
    await page.getByRole('button',{name:'适应画布',exact:true}).click();await canvas.locator(`[data-object-id="${neuron.id}"]`).click();await undo();assert.deepEqual(await saveProject(),fixture);
    await sidebar.getByRole('button',{name:'参数化组合',exact:true}).click();await sidebar.getByRole('textbox',{name:'搜索组件',exact:true}).fill('全连接网络');
    await drop(sidebar.getByRole('button',{name:'配置全连接网络',exact:true}),350,340);const recipe=await saveProject(),instance=recipe.containers.find(c=>c.component);assert.equal(instance.component.recipe.id,'mlp');assert(recipe.nodes.filter(n=>n.kind==='neuron').length>1);assert(recipe.edges.length>1);assert.equal(await page.getByRole('dialog').count(),0);await undo();assert.deepEqual(await saveProject(),fixture);
    await sidebar.getByRole('textbox',{name:'搜索组件',exact:true}).fill('');await sidebar.getByRole('button',{name:'实验图表',exact:true}).click();
    await drop(sidebar.getByRole('button',{name:'配置数据折线图',exact:true}),400,340);await page.waitForFunction(()=>JSON.parse(localStorage.getItem('fastfigure.project.v2'))!==null);const chart=await saveProject();assert.equal(chart.containers.find(c=>c.dataChart).dataChart.spec.kind,'line');await undo();assert.deepEqual(await saveProject(),fixture);
    await sidebar.getByRole('button',{name:'基础',exact:true}).click();await begin(sidebar.getByRole('button',{name:'添加神经元',exact:true}),260,300);await page.screenshot({path:join(results,'library-drag.png'),animations:'disabled'});await page.keyboard.press('Escape');await page.mouse.up();
    await load(original,'restore-after-library-drag.json');assert.deepEqual(await saveProject(),original);
}
