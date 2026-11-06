import assert from 'node:assert/strict';

export async function checkResizing({page,canvas,screen,original,saveProject,undo}){
    const fixture={...original,nodes:[
        {id:'small-neuron',parentId:'stage',kind:'neuron',label:'Neuron',x:200,y:250,width:80,height:80},
        {id:'small-sum',parentId:'stage',kind:'operator',label:'+',x:400,y:250,width:80,height:80},
        {id:'small-concat',parentId:'stage',kind:'operator',label:'C',x:600,y:250,width:80,height:80},
        {id:'wide-ellipse',parentId:'stage',kind:'ellipse',label:'Ellipse',x:300,y:400,width:160,height:80},
    ],edges:[]};
    const load=async(doc,name)=>{
        await page.getByRole('button',{name:'工程',exact:true}).click();
        await page.getByLabel('导入工程文件',{exact:true}).setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
        await page.getByRole('dialog',{name:'工程管理',exact:true}).waitFor({state:'hidden'});
    };
    const node=async id=>(await saveProject()).nodes.find(n=>n.id===id);
    const grip=async id=>{
        const object=await node(id),at=await screen(object.x+object.width/2,object.y+object.height/2);await page.mouse.click(at.x,at.y);
        const box=await canvas.locator(`[data-resize-handle="${id}"]`).boundingBox();return{x:box.x+box.width/2,y:box.y+box.height/2};
    };
    const drag=async(id,dx,dy,shift=false)=>{
        const start=await grip(id),origin=await screen(0,0),delta=await screen(dx,dy);
        if(shift)await page.keyboard.down('Shift');
        await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+delta.x-origin.x,start.y+delta.y-origin.y,{steps:5});await page.mouse.up();
        if(shift)await page.keyboard.up('Shift');return node(id);
    };
    await load(fixture,'resize-test.json');
    for(const [id,dx,dy,size] of [['small-neuron',-56,-56,24],['small-sum',-52,-44,32],['small-concat',-60,-60,20]]){
        const resized=await drag(id,dx,dy);assert(Math.abs(resized.width-size)<.01);assert(Math.abs(resized.height-size)<.01);
        assert.equal(resized.label,fixture.nodes.find(n=>n.id===id).label);
    }
    const small=await saveProject(),free=await drag('small-concat',20,40,true);assert(Math.abs(free.width-40)<.01);assert(Math.abs(free.height-60)<.01);await undo();assert.deepEqual(await saveProject(),small);
    const proportional=await drag('wide-ellipse',40,0);assert(Math.abs(proportional.width-192)<.01);assert(Math.abs(proportional.width/proportional.height-2)<.001);await undo();
    // Switching Shift during a drag returns to the original aspect, rather than the intermediate free ratio.
    const start=await grip('wide-ellipse'),origin=await screen(0,0),delta=await screen(60,0);
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.keyboard.down('Shift');await page.mouse.move(start.x+(delta.x-origin.x)*2/3,start.y);await page.keyboard.up('Shift');await page.mouse.move(start.x+delta.x-origin.x,start.y);await page.mouse.up();
    const restored=await node('wide-ellipse');assert(Math.abs(restored.width-208)<.01);assert(Math.abs(restored.height-104)<.01);await undo();assert.deepEqual(await saveProject(),small);
    await load(original,'restore-after-resize.json');assert.deepEqual(await saveProject(),original);
}
