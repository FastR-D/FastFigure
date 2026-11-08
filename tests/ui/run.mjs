import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { checkEditor } from './editor.mjs';
import {checkGalleryStudy} from './gallery-study.mjs';
import { checkData } from './data.mjs';
import { checkAssistant } from './assistant.mjs';
import { checkReconstruction } from './reconstruction.mjs';
import { checkNotifications } from './notifications.mjs';
// One supported desktop viewport. A private fixture service never uses the user's CLI/session.
process.env.FASTFIGURE_CODEX_COMMAND = join(process.cwd(), 'server/harness/fixtures/cli.mjs');
process.env.FASTFIGURE_CLAUDE_COMMAND = process.env.FASTFIGURE_CODEX_COMMAND;
process.env.FASTFIGURE_TEST_SCENARIO = 'slow';
const libraryDirectory=mkdtempSync(join(tmpdir(),'fastfigure-ui-library-'));
process.env.FASTFIGURE_LIBRARY_DIR=libraryDirectory;
const results = join(process.cwd(), 'test-results/ui');
// This directory belongs to this runner; avoid stale passing screenshots/results after a failed run.
rmSync(results, { recursive: true, force: true });
mkdirSync(results, { recursive: true });
const cache = join(homedir(), '.cache/ms-playwright'), candidates = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, chromium.executablePath()];
if (existsSync(cache))
    for (const name of readdirSync(cache).filter(n => /^chromium-\d+$/.test(n)).sort().reverse())
        candidates.push(join(cache, name, 'chrome-linux64/chrome'), join(cache, name, 'chrome-linux/chrome'));
const executablePath = candidates.find(p => p && existsSync(p));
assert(executablePath, 'Install Chromium or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH');
const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: true } }), started = Date.now(), reports = [];
let browser;
try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true, executablePath });
    for (const [name, check] of (process.argv.includes('--gallery-study')?[['gallery-study',checkGalleryStudy]]:process.argv.includes('--notifications')?[['notifications',checkNotifications]]:[['editor', checkEditor], ['data', checkData], ['assistant', checkAssistant], ['reconstruction', checkReconstruction], ['notifications',checkNotifications]])) {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }), errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('dialog', d => void d.dismiss());
        const choose = async (label, option, scope = page) => { await scope.getByRole('button', { name: label, exact: true }).click(); await page.getByRole('option', { name: option, exact: true }).click(); };
        // Persist explicitly before reading: refresh must not trigger the unsaved-edit guard.
        const saveProject = async () => { await page.keyboard.press('Control+s'); return page.evaluate(() => JSON.parse(localStorage.getItem('fastfigure.project.v2'))); };
        const undo = () => page.getByRole('button', { name: '撤销 · Ctrl / ⌘ Z', exact: true }).click(), redo = () => page.getByRole('button', { name: '重做 · Ctrl / ⌘ Shift Z', exact: true }).click();
        const panel = page.getByRole('complementary', { name: 'Harness 绘图助手', exact: true }), turn = id => panel.locator(`[data-turn-id="${id}"]`);
        const send = async (content) => { await panel.getByRole('textbox', { name: '绘图要求', exact: true }).fill(content); const response = page.waitForResponse(r => r.url().endsWith('/api/harness/runs') && r.request().method() === 'POST'); await panel.getByRole('button', { name: '发送要求', exact: true }).click(); const accepted = await response; assert.equal(accepted.status(), 202); return { ...(await accepted.json()), input: accepted.request().postDataJSON() }; };
        const run = async (id) => (await page.request.get(`${base}/api/harness/runs/${id}`)).json();
        try {
            await page.goto(base);
            await page.getByTestId('figure-canvas').waitFor();
            if (!reports.length) assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await check({ page, base, results, choose, saveProject, undo, redo, panel, turn, send, run });
            assert.deepEqual(errors, []);
            await page.screenshot({ path: join(results, `${name}.png`), animations: 'disabled' });
            reports.push({ name, status: 'passed' });
            console.log(`1920px ${name}: passed`);
        }
        catch (error) {
            await page.screenshot({ path: join(results, `${name}-failure.png`), animations: 'disabled' }).catch(() => { });
            throw error;
        }
        finally {
            await page.close();
        }
    }
    writeFileSync(join(results, 'results.json'), JSON.stringify({ viewport: { width: 1920, height: 1080 }, seconds: (Date.now() - started) / 1000, reports }, null, 2));
}
finally {
    await browser?.close();
    await server.close();
    rmSync(libraryDirectory,{recursive:true,force:true});
}
