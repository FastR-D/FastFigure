import assert from 'node:assert/strict';
import { join } from 'node:path';

export async function checkNotifications({page, panel, results, saveProject}) {
    const original=await saveProject();
    const notices=page.getByRole('region',{name:'通知',exact:true});
    const fail=route=>route.abort('failed');
    await page.route('**/resources/topconf/figures.json',fail);
    await page.getByRole('button',{name:'图库',exact:true}).click();
    const notice=notices.getByRole('alert');await notice.waitFor();
    await notice.getByRole('heading',{name:'连接失败',exact:true}).waitFor();
    const position=await notices.boundingBox(),viewport=page.viewportSize();
    assert.equal(Math.round(viewport.width-position.x-position.width),16);
    assert.equal(Math.round(viewport.height-position.y-position.height),16);
    assert.equal(await page.locator('#workspace-sidebar').getByText('Failed to fetch',{exact:true}).isVisible(),false);
    await notice.getByText('错误详情',{exact:true}).click();await notice.getByText('Failed to fetch',{exact:true}).waitFor();
    await page.unroute('**/resources/topconf/figures.json',fail);
    await page.getByRole('button',{name:'助手',exact:true}).click();
    const prompt=panel.getByRole('textbox',{name:'绘图要求',exact:true});await prompt.fill('通知不能修改绘图要求或画布。');
    await panel.getByRole('button',{name:'选图库',exact:true}).click();
    const picker=page.getByRole('dialog',{name:'从论文图库选择',exact:true});
    const paper=picker.getByRole('button',{name:/^选择论文图 /}).first();await paper.waitFor();await paper.click();
    await page.route('https://raw.githubusercontent.com/**',fail);
    await picker.getByRole('button',{name:'插入本轮',exact:true}).click();
    await picker.getByRole('button',{name:'插入本轮',exact:true}).waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelectorAll('.workspace-notification').length===1);
    await picker.getByRole('alert').getByText('Failed to fetch',{exact:true}).waitFor();
    // Native dialogs keep background notifications inert; errors remain actionable in the modal.
    await page.screenshot({path:join(results,'network-error-notification.png'),animations:'disabled'});
    assert(await picker.isVisible());await picker.getByRole('button',{name:'取消',exact:true}).click();
    await notice.getByRole('button',{name:'关闭错误通知',exact:true}).click();await notice.waitFor({state:'hidden'});
    assert.equal(await prompt.inputValue(),'通知不能修改绘图要求或画布。');
    assert.deepEqual(await saveProject(),original);
    await page.unroute('https://raw.githubusercontent.com/**',fail);
    // A failed request can be retried and reported again after dismissal.
    await page.route('**/api/harness/status',fail);
    await panel.getByRole('button',{name:'切换模型设置',exact:true}).click();
    const settings=page.getByRole('dialog',{name:'助手设置',exact:true});
    await settings.getByRole('button',{name:'重新检测 Harness',exact:true}).click();await settings.getByRole('alert').waitFor();
    assert.equal(await panel.getByText('Failed to fetch',{exact:true}).isVisible(),false);
    await page.unroute('**/api/harness/status',fail);
    await settings.getByRole('button',{name:'重新检测 Harness',exact:true}).click();
    await settings.getByRole('button',{name:'完成',exact:true}).click();
    assert.deepEqual(await saveProject(),original);
}
