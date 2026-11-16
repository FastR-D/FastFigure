import assert from 'node:assert/strict';

export async function checkProjectSave({ page }) {
    await page.getByRole('button', { name: '工程', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '工程管理', exact: true });
    const title = 'Retry after private browser storage failure';
    await dialog.getByRole('textbox', { name: '工程名称', exact: true }).fill(title);
    await page.evaluate(() => {
        const setItem = Storage.prototype.setItem;
        window.__restoreProjectStorage = () => { Storage.prototype.setItem = setItem; };
        Storage.prototype.setItem = function(key, value) {
            if (key === 'fastfigure.project.v2') throw new DOMException('Storage is full', 'QuotaExceededError');
            return setItem.call(this, key, value);
        };
    });
    try {
        await dialog.getByRole('button', { name: '保存工程', exact: true }).click();
        assert(await dialog.isVisible(), 'A failed save must leave the project dialog open');
        await dialog.getByRole('alert').waitFor();
        assert.equal(await dialog.getByRole('textbox', { name: '工程名称', exact: true }).inputValue(), title);
        const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: '备份 JSON', exact: true }).click()]);
        const chunks = [];
        for await (const chunk of await download.createReadStream()) chunks.push(chunk);
        assert.equal(JSON.parse(Buffer.concat(chunks).toString()).title, title);
    } finally {
        await page.evaluate(() => { window.__restoreProjectStorage(); delete window.__restoreProjectStorage; });
    }
    await dialog.getByRole('button', { name: '保存工程', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.reload();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fastfigure.project.v2')).title), title);
}
