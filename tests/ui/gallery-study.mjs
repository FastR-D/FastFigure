import assert from 'node:assert/strict';
import {join} from 'node:path';

export async function checkGalleryStudy({page,results,saveProject,undo}){
    const original=await saveProject(),sidebar=page.locator('#workspace-sidebar'),navigation=page.getByRole('navigation',{name:'工作区导航',exact:true});
    // Gallery-derived primitives remain searchable; complete benchmarks require an explicit choice.
    await navigation.getByRole('button',{name:'组件',exact:true}).click();await sidebar.getByRole('button',{name:'基础',exact:true}).click();
    await sidebar.getByRole('textbox',{name:'搜索组件',exact:true}).fill('配对身份矩阵');
    await sidebar.getByRole('button',{name:'查看图库构件 配对身份矩阵',exact:true}).waitFor();assert.equal(await sidebar.getByText('没有匹配的组件，试试其他关键词。',{exact:true}).count(),0);
    await sidebar.getByRole('button',{name:'查看图库构件 配对身份矩阵',exact:true}).click();const galleryDialog=page.getByRole('dialog',{name:'组件详情',exact:true});
    await galleryDialog.getByRole('button',{name:'新建图件并插入',exact:true}).click();assert.equal((await saveProject()).containers[0].component.assetId,'gallery-part-identity-matrix');await undo();assert.deepEqual(await saveProject(),original);
    await sidebar.getByRole('textbox',{name:'搜索组件',exact:true}).fill('');await sidebar.getByRole('button',{name:'标杆主题',exact:true}).click();
    await sidebar.getByRole('textbox',{name:'搜索标杆主题',exact:true}).fill('工具反馈');
    await sidebar.getByRole('button',{name:'查看标杆主题 工具反馈 · 主循环与执行记录',exact:true}).click();await galleryDialog.getByRole('button',{name:'新建图件并插入',exact:true}).click();
    const galleryDocument=await saveProject();assert.equal(galleryDocument.containers[0].component.assetId,'gallery-benchmark-tool-feedback');assert(galleryDocument.containers[0].component.sources.some(s=>s.reference.includes('SHA-256')));assert(galleryDocument.nodes.every(n=>n.kind!=='image'));
    await page.screenshot({path:join(results,'gallery-benchmark.png'),animations:'disabled'});await undo();assert.deepEqual(await saveProject(),original);
    await sidebar.getByRole('textbox',{name:'搜索标杆主题',exact:true}).fill('训练部署');
    await sidebar.getByRole('button',{name:'查看标杆主题 训练部署 · 阶段与参数迁移',exact:true}).click();
    await galleryDialog.getByRole('button',{name:'新建图件并插入',exact:true}).click();
    const training=await saveProject();assert.equal(training.containers[0].component.assetId,'gallery-benchmark-training-deployment');
    const loss=training.nodes.find(n=>n.kind==='ellipse'),models=training.nodes.filter(n=>n.kind==='rectangle'&&n.width===150&&n.height===80).sort((a,b)=>a.y-b.y);
    assert(loss&&models.length===2);assert(training.nodes.some(n=>n.path?.start?.nodeId===loss.id&&n.path?.end?.nodeId===models[0].id));
    await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:join(results,'gallery-training.png'),animations:'disabled'});
    await undo();assert.deepEqual(await saveProject(),original);await sidebar.getByRole('button',{name:'基础',exact:true}).click();
}
