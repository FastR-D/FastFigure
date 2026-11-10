import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

// Delay the browser's file-read boundary, leaving the production dialog/editor intact.
export async function checkProjectImport({ page, results, saveProject }, original) {
    const dialog = page.getByRole('dialog', { name: '工程管理', exact: true });
    const input = dialog.getByLabel('导入工程文件', { exact: true });
    const open = async () => { await page.getByRole('button', { name: '工程', exact: true }).click(); await dialog.waitFor(); };
    const snapshot = async () => {
        // Ctrl+S is intentionally inert behind a native modal; inspect via the real backup action.
        const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: '备份 JSON', exact: true }).click()]);
        const chunks = [];
        for await (const chunk of await download.createReadStream()) chunks.push(chunk);
        return JSON.parse(Buffer.concat(chunks).toString());
    };
    const file = (name, document = original) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) });
    const malformed = name => ({ name, mimeType: 'application/json', buffer: Buffer.from('{"version":"invalid-current"}') });
    await page.evaluate(() => {
        const text = Blob.prototype.text;
        const arrayBuffer = Blob.prototype.arrayBuffer;
        const gates = new Map();
        window.__projectImportProbe = {
            gates,
            restore() { Blob.prototype.text = text; Blob.prototype.arrayBuffer = arrayBuffer; },
        };
        Blob.prototype.text = async function () {
            if (!(this instanceof File) || !this.name.startsWith('delayed-')) return text.call(this);
            const gate = {};
            gates.set(this.name, gate);
            gate.result = new Promise(resolve => { gate.release = resolve; }).then(() => {
                if (this.name.includes('failure')) throw new Error('Delayed file read failed');
                return text.call(this);
            });
            return gate.result;
        };
        Blob.prototype.arrayBuffer = async function () {
            if (!(this instanceof File) || this.name !== 'baseline-reference.png') return arrayBuffer.call(this);
            const gate = {};
            gates.set(this.name, gate);
            gate.result = new Promise(resolve => { gate.release = resolve; }).then(() => arrayBuffer.call(this));
            return gate.result;
        };
    });
    const start = async (name, document, invalid = false) => {
        await input.setInputFiles(invalid ? malformed(name) : file(name, document));
        await page.waitForFunction(name => window.__projectImportProbe.gates.has(name), name);
    };
    const release = async name => {
        await page.evaluate(async name => {
            const gate = window.__projectImportProbe.gates.get(name);
            gate.release();
            await gate.result.catch(() => {});
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }, name);
    };
    const preserved = async (document, message) => {
        assert(await dialog.isVisible(), message);
        assert.deepEqual(await snapshot(), document, message);
    };
    const reports = [];
    try {
        for (const action of ['cancel', 'close', 'escape', 'backdrop']) {
            const name = `delayed-${action}.json`;
            await open();
            await start(name, { ...original, title: `Stale ${action}` });
            if (action === 'escape') await page.keyboard.press('Escape');
            else if (action === 'backdrop') { const box = await dialog.boundingBox(); await page.mouse.click(box.x - 8, box.y + box.height / 2); }
            else await dialog.getByRole('button', { name: action === 'cancel' ? '取消' : '关闭工程管理', exact: true }).click();
            await dialog.waitFor({ state: 'hidden' });
            await open();
            await input.setInputFiles(malformed(`current-${action}-error.json`));
            const alert = dialog.getByRole('alert');
            await alert.waitFor();
            const error = await alert.textContent();
            assert.equal(await input.inputValue(), '');
            await release(name);
            await preserved(original, `Late ${action} read must not replace the canvas or close the reopened dialog`);
            assert.equal(await alert.textContent(), error);
            assert.equal(await input.inputValue(), '');
            await dialog.getByRole('button', { name: '取消', exact: true }).click();
            reports.push(`${action}: reopen/current-error/input preserved`);
        }
        for (const stale of ['success', 'failure']) {
            await open();
            await start(`delayed-${stale}.json`, { ...original, title: 'Superseded import' });
            await start(`delayed-current-${stale}.json`, undefined, true);
            const value = await input.inputValue();
            assert(value.endsWith(`delayed-current-${stale}.json`));
            await release(`delayed-${stale}.json`);
            await preserved(original, 'A superseded read must not change the current canvas or pending input');
            assert.equal(await input.inputValue(), value);
            assert.equal(await dialog.getByRole('alert').count(), 0);
            await release(`delayed-current-${stale}.json`);
            await dialog.getByRole('alert').waitFor();
            assert.equal(await input.inputValue(), '');
            assert.deepEqual(await snapshot(), original);
            await dialog.getByRole('button', { name: '取消', exact: true }).click();
            reports.push(`superseded-${stale}: pending input preserved`);
        }
        await open();
        await start('delayed-stale-error-failure.json');
        await input.setInputFiles(malformed('current-error.json'));
        await dialog.getByRole('alert').waitFor();
        await dialog.getByRole('textbox', { name: '工程名称', exact: true }).fill('');
        await dialog.getByRole('button', { name: '保存工程', exact: true }).click();
        await release('delayed-stale-error-failure.json');
        await preserved(original, 'A stale failure must preserve the current validation error');
        assert.equal(await dialog.getByRole('alert').textContent(), '请输入工程名称');
        assert.equal(await input.inputValue(), '');
        await dialog.getByRole('button', { name: '取消', exact: true }).click();
        reports.push('stale failure preserves current error and cleared input');
        await open();
        await start('delayed-current-error-failure.json');
        await dialog.getByRole('textbox', { name: '工程名称', exact: true }).fill('');
        await dialog.getByRole('button', { name: '保存工程', exact: true }).click();
        assert.equal(await dialog.getByRole('alert').textContent(), '请输入工程名称');
        await release('delayed-current-error-failure.json');
        await dialog.getByRole('alert').waitFor();
        assert((await dialog.getByRole('alert').textContent()).includes('无法导入'));
        assert.equal(await input.inputValue(), '');
        await dialog.getByRole('button', { name: '取消', exact: true }).click();
        reports.push('current failure reports its error and clears input');
        await open();
        await start('delayed-blank.json', { ...original, title: 'Stale before blank' });
        await dialog.getByRole('button', { name: '新建空白图', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        const blank = await saveProject();
        assert.equal(blank.nodes.length, 0);
        await open();
        await release('delayed-blank.json');
        await preserved(blank, 'A newly created blank canvas must not be overwritten by an older import');
        await input.setInputFiles(file('restore-after-blank.json'));
        await dialog.waitFor({ state: 'hidden' });
        assert.deepEqual(await saveProject(), original);
        reports.push('blank canvas survives late import after reopen');
        await open();
        await start('delayed-example.json', { ...original, title: 'Stale before example' });
        await dialog.getByRole('button', { name: '载入示例', exact: true }).click();
        const example = await snapshot();
        await release('delayed-example.json');
        await preserved(example, 'Example loading invalidates the pending project read');
        await page.screenshot({ path: join(results, 'project-import-example.png'), animations: 'disabled' });
        await input.evaluate(element => { window.__projectImportProbe.successInput = element; });
        await input.setInputFiles(file('restore-edited.json'));
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(() => window.__projectImportProbe.successInput.value), '');
        assert.deepEqual(await saveProject(), original);
        await open();
        await input.setInputFiles(file('restore-edited.json'));
        await dialog.waitFor({ state: 'hidden' });
        assert.deepEqual(await saveProject(), original);
        reports.push('example replacement and repeated successful import');

        // A reference import already in flight can legitimately update the canvas while this modal is open.
        const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 30; canvas.getContext('2d').fillRect(0, 0, 40, 30); return canvas.toDataURL().split(',')[1]; });
        await page.getByRole('button', { name: '参考图', exact: true }).click();
        await page.getByLabel('导入参考图', { exact: true }).setInputFiles({ name: 'baseline-reference.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
        await page.waitForFunction(() => window.__projectImportProbe.gates.has('baseline-reference.png'));
        await open();
        await start('delayed-baseline.json', { ...original, title: 'Stale baseline' });
        await release('baseline-reference.png');
        await page.waitForFunction(() => document.querySelector('input[aria-label="导入参考图"]')?.value === '');
        const changed = await snapshot();
        assert.equal(changed.references.length, original.references.length + 1);
        await release('delayed-baseline.json');
        await preserved(changed, 'A concurrent canvas update must reject the old baseline import');
        assert.equal(await dialog.getByRole('alert').textContent(), '画布已变化，请重新选择工程文件。');
        assert.equal(await input.inputValue(), '');
        await input.setInputFiles(file('restore-after-baseline.json'));
        await dialog.waitFor({ state: 'hidden' });
        assert.deepEqual(await saveProject(), original);
        await page.getByRole('button', { name: '组件', exact: true }).click();
        reports.push('concurrent reference import changes baseline without being overwritten');
    } finally {
        await page.evaluate(() => { window.__projectImportProbe.restore(); delete window.__projectImportProbe; });
    }
    writeFileSync(join(results, 'project-import.json'), JSON.stringify({ status: 'passed', reports }, null, 2));
}
