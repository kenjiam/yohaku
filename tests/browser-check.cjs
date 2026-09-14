// Optional: npm install --prefix <temporary-directory> playwright
// Set PLAYWRIGHT_MODULE to its node_modules/playwright directory.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const relative = new URL(req.url, 'http://localhost').pathname.replace(/^\/tskmgr\//, '');
  const file = path.resolve(root, relative || 'index.html');
  if (!file.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
  fs.readFile(file, (error, data) => { if (error) res.writeHead(404).end(); else { res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(data); } });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    const url = `http://127.0.0.1:${server.address().port}/tskmgr/`;
    await page.goto(url); await page.evaluate(() => navigator.serviceWorker.ready);
    assert.equal(await page.locator('.tab').count(), 5);
    await page.locator('#capture-title').fill('海を見に行く'); await page.locator('#capture button').click();
    await page.locator('.item-body').click(); await page.locator('#item-note').fill('<script>alert(1)</script>\n朝の電車で。'); await page.locator('#item-category').selectOption('said'); await page.locator('#item-form button[type=submit]').click();
    await page.getByRole('button', { name: 'SAID 1', exact: true }).click(); assert.equal(await page.locator('.item').count(), 1);
    await page.reload(); await page.getByRole('button', { name: 'SAID 1', exact: true }).click(); assert.match(await page.locator('.item-note').innerText(), /<script>/);
    await page.locator('.done-button').click(); assert.equal(await page.locator('.item').count(), 0);
    await page.locator('#toast button').click(); assert.equal(await page.locator('.item').count(), 1);
    await page.locator('.done-button').click(); await page.locator('#history-toggle').click(); assert.equal(await page.locator('.item').count(), 1);
    await page.locator('.done-button').click(); await page.locator('#history-toggle').click();
    await page.locator('.item-body').click(); await page.locator('#item-delete').click(); await page.locator('#toast button').click(); assert.equal(await page.locator('.item').count(), 1);
    await page.getByRole('button', { name: '箱を追加', exact: true }).click(); await page.locator('#category-name').fill('旅'); await page.locator('#category-description').fill('遠くへ'); await page.locator('#category-form button[type=submit]').click();
    await page.locator('#capture-title').fill('島で一泊'); await page.locator('#capture button').click(); await page.locator('#category-edit').click();
    page.once('dialog', dialog => dialog.accept()); await page.locator('#category-delete').click();
    assert.equal(await page.locator('.tab').count(), 5); assert.equal(await page.locator('.item').count(), 1);
    await page.locator('#settings-open').click();
    const downloadPromise = page.waitForEvent('download'); await page.locator('#export').click(); const download = await downloadPromise; const backup = JSON.parse(fs.readFileSync(await download.path(), 'utf8')); assert.equal(backup.items.length, 2);
    await page.locator('#import-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{bad') }); await page.waitForFunction(() => document.querySelector('#toast span').textContent.includes('JSONを読み取れません'));
    backup.items[0].title = 'バックアップから更新'; backup.items[0].updatedAt = '2099-01-01T00:00:00Z';
    await page.locator('#import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) }); await page.waitForFunction(() => document.querySelector('#toast span').textContent.includes('読み込みました'));
    await page.locator('#settings-dialog [data-close]').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await context.setOffline(true); await page.reload(); await page.locator('#capture-title').fill('オフラインで追加'); await page.locator('#capture button').click(); await page.reload(); assert.equal(await page.locator('.item').count(), 2);
    await context.setOffline(false);
    const second = await context.newPage(); await second.goto(url); await second.locator('#capture-title').fill('別タブから'); await second.locator('#capture button').click(); await page.waitForFunction(() => document.querySelectorAll('.item').length === 3);
    await second.close(); await page.setViewportSize({ width: 1280, height: 900 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(process.env.TEMP || root, 'yohaku-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(process.env.TEMP || root, 'yohaku-mobile.png'), fullPage: true });
    await page.locator('#category-edit').click();
    await page.locator('#category-pressure').check(); await page.locator('#pressure-basis').selectOption('deadline'); await page.locator('#pressure-days').fill('14'); await page.locator('#pressure-motion').check(); await page.locator('#category-sort').selectOption('pressure');
    assert.equal(await page.locator('#pressure-preview .balloon').count(), 3);
    await page.locator('#category-form button[type=submit]').click();
    await page.locator('.item-body').first().click(); await page.locator('#item-due').fill('2020-01-01'); await page.locator('#item-next').fill('まず連絡する'); await page.locator('#item-form button[type=submit]').click();
    assert.equal(await page.locator('.item').first().locator('.balloon').count(), 1);
    assert.equal(await page.locator('.item').first().locator('.next-step').innerText(), '次：まず連絡する');
    assert.equal(await page.locator('.item').first().locator('.overdue').count(), 1);
    await page.reload(); assert.equal(await page.locator('#item-sort').inputValue(), 'pressure');
    assert.equal(await page.locator('.balloon-slot').count(), 1);
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.locator('.done-button').first().click();
    assert.equal(await page.locator('.balloon-pop').count(), 1); await page.locator('#toast button').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(process.env.TEMP || root, 'yohaku-pressure-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('.item-body').first().click(); await page.locator('#due-clear').click(); await page.locator('#item-form button[type=submit]').click(); assert.equal(await page.locator('.balloon-slot').count(), 0);
    await page.locator('#category-edit').click(); await page.locator('#category-pressure').uncheck(); await page.locator('#category-form button[type=submit]').click(); assert.equal(await page.locator('#item-sort').inputValue(), 'newest');
    console.log('PASS: pressure settings/preview, deadline sorting and clearing, next step, persistence, pop/undo, disabled pressure, mobile layout.');
    assert.deepEqual(errors, []); console.log('PASS: CRUD, category move/delete, undo, history, persistence, export/import validation, offline edits, multi-tab updates, mobile/desktop layout; no browser errors.');
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
