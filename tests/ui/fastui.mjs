import assert from 'node:assert/strict';
import { join } from 'node:path';

export async function checkFastUi({ page, results, saveProject, choose }) {
    const original = await saveProject();
    const trigger = page.getByRole('button', { name: '编辑图件名称', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: '重命名图件', exact: true });
    assert(await dialog.evaluate(element => element instanceof HTMLDialogElement && element.matches(':modal')));
    await dialog.getByRole('textbox', { name: '新名称', exact: true }).fill('Cancelled shared dialog draft');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert(await trigger.evaluate(element => element === document.activeElement));
    assert.deepEqual(await saveProject(), original);
    await trigger.click();
    const box = await dialog.boundingBox();
    await page.mouse.click(box.x - 8, box.y + box.height / 2);
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(await saveProject(), original);

    await choose('画布缩放', '75%');
    await page.getByRole('combobox', { name: '画布缩放', exact: true }).press('ArrowRight');
    assert.deepEqual(await saveProject(), original);
    await page.getByRole('button', { name: '适应画布', exact: true }).click();
    for (const mode of ['light', 'dark']) {
        await page.evaluate(mode => localStorage.setItem('fastfigure.color-mode', mode), mode);
        await page.reload();
        await page.getByTestId('figure-canvas').waitFor();
        assert.equal(await page.locator('html').getAttribute('data-fastui-theme'), mode);
        assert.equal(await page.getByRole('button', { name: '导出图件', exact: true }).evaluate(element => getComputedStyle(element).backgroundColor), mode === 'light' ? 'rgb(21, 95, 184)' : 'rgb(14, 99, 156)');
        assert.deepEqual(await saveProject(), original);
        await page.screenshot({ path: join(results, `${mode}-1920.png`), animations: 'disabled' });
    }
}
