// Browser fixtures only: no production voting requests or account data.
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..'), web = path.join(root, 'public');
const out = process.env.QA_OUT;
const modes = ['defense', 'zerg', 'rv', 'battlefield', 'resistance'];
const server = http.createServer((req, res) => {
    const file = path.resolve(web, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(web + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (error, data) => {
        if (error) { res.writeHead(404); return res.end(); }
        res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
        res.end(data);
    });
});
(async () => {
    if (out) fs.mkdirSync(out, { recursive: true });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const reports = [];
    try {
        for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
            const context = await browser.newContext({ viewport });
            const base = 'http://127.0.0.1:' + server.address().port;
            await context.route('**/*', route => {
                if (route.request().url().startsWith(base + '/')) return route.continue();
                return route.fulfill({ status: 200, json: {} });
            });
            let selected = '', writes = 0, rejectWrite = false, rejectRead = false, ambiguousWrite = false;
            const devices = new Set(), errors = [];
            const poll = () => ({ options: modes.map(key => ({ key, votes: key === selected ? 1 : 0 })), selected, total: selected ? 1 : 0, limit: 1 });
            await context.route('**/game-votes/**', async route => {
                const request = route.request(), url = new URL(request.url());
                let data = {}, status = 200;
                if (url.pathname.endsWith('/starship-modes/vote')) {
                    writes++;
                    const body = request.postDataJSON();
                    assert.match(body.device_id, /^[a-f0-9]{16,32}$/);
                    devices.add(body.device_id);
                    assert.equal(request.headers().authorization, undefined);
                    assert.equal(request.headers().cookie, undefined);
                    await new Promise(resolve => setTimeout(resolve, 100));
                    if (rejectWrite) { status = 429; data = { detail: 'This network voted too many times today' }; }
                    else {
                        selected = body.target; data = poll();
                        if (ambiguousWrite) return route.abort();
                    }
                } else if (url.pathname.endsWith('/starship-modes')) {
                    devices.add(url.searchParams.get('device_id'));
                    data = poll();
                    if (rejectRead) { status = 503; data = { detail: 'fixture offline' }; }
                } else if (url.pathname.endsWith('/options')) data = { favorites: [{ key: 'starship-defense', name: '虫潮围城', url: '/html/game/starship-defense/index.html' }], limits: { favorite: 3, wishlist: 5, wishSubmit: 3 } };
                else if (url.pathname.endsWith('/board')) data = { favorite: [{ key: 'starship-defense', votes: 7 }], wishlist: [{ id: 1, key: 'w1', name: '测试愿望', votes: 2, progress: 'pending' }], wishlistTotal: 1, wishCounts: { pending: 1, fulfilled: 0 }, totals: { votes: 9, voters: 7, wishes: 1 } };
                else if (url.pathname.endsWith('/my-votes')) data = { favorite: [], wishlist: [], myWishes: [], remaining: { favorite: 3, wishlist: 5, wishSubmit: 3 } };
                else { status = 401; data = { detail: 'anonymous fixture' }; }
                await route.fulfill({ status, json: data });
            });
            const page = await context.newPage();
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(base + '/games.html');
            const entry = page.locator('a[href="game-vote.html#gv-starship-modes"]');
            assert.equal(await entry.count(), 1);
            await entry.click();
            await page.waitForSelector('[data-mode="defense"]');
            assert.equal(await page.locator('.gv-mode-button').count(), 5);
            await page.waitForFunction(() => !document.getElementById('gv-mode-refresh').disabled);
            if (out) await page.screenshot({ path: path.join(out, 'mode-entry-' + viewport.width + '.png') });
            const titleBox = await page.locator('#gv-mode-title').boundingBox();
            const headerBox = await page.locator('.site-header').boundingBox();
            assert.ok(titleBox.y >= headerBox.y + headerBox.height - 1 && titleBox.y < viewport.height, 'Mode heading must be visible after following the entry link');
            assert.match(await page.locator('#gv-mode-summary').innerText(), /0 台设备/);
            assert.match(await page.locator('#gv-favorite').innerText(), /7 票/);
            assert.match(await page.locator('#gv-wishlist').innerText(), /测试愿望/);
            await page.locator('[data-mode="defense"]').focus();
            await page.keyboard.press('Enter');
            await page.waitForFunction(() => document.querySelector('[data-mode="defense"]').getAttribute('aria-pressed') === 'true');
            assert.equal(await page.locator('.gv-mode-button[aria-pressed="true"]').count(), 1);
            assert.equal(await page.evaluate(() => document.activeElement.dataset.mode), 'defense');
            await page.locator('[data-mode="rv"]').click();
            await page.waitForFunction(() => document.querySelector('[data-mode="rv"]').getAttribute('aria-pressed') === 'true');
            assert.match(await page.locator('#gv-mode-summary').innerText(), /1 台设备.*房车/);
            await page.reload();
            await page.waitForSelector('[data-mode="rv"][aria-pressed="true"]');
            await page.locator('[data-mode="rv"]').click();
            await page.waitForFunction(() => document.querySelectorAll('.gv-mode-button[aria-pressed="true"]').length === 0);
            assert.equal(selected, '');
            rejectWrite = true;
            await page.locator('[data-mode="zerg"]').click();
            await page.waitForFunction(() => document.getElementById('gv-mode-msg').textContent.includes('当前网络'));
            assert.equal(selected, '');
            rejectWrite = false; ambiguousWrite = true;
            await page.locator('[data-mode="zerg"]').click();
            await page.waitForFunction(() => document.getElementById('gv-mode-msg').textContent.includes('无法确认'));
            assert.equal(selected, 'zerg');
            ambiguousWrite = false;
            await page.click('#gv-mode-refresh');
            await page.waitForSelector('[data-mode="zerg"][aria-pressed="true"]');
            rejectRead = true;
            await page.click('#gv-mode-refresh');
            await page.waitForFunction(() => document.getElementById('gv-mode-msg').textContent.includes('无法加载'));
            rejectRead = false;
            await page.click('#gv-mode-refresh');
            await page.waitForFunction(() => document.getElementById('gv-mode-msg').textContent === '');
            const previousWrites = writes;
            await page.locator('[data-mode="battlefield"]').evaluate(button => { button.click(); button.click(); });
            await page.waitForSelector('[data-mode="battlefield"][aria-pressed="true"]');
            assert.equal(writes, previousWrites + 1);
            assert.equal(devices.size, 1);
            assert.deepEqual(errors, []);
            assert.ok(await page.locator('#gv-starship-modes').evaluate(element => element.scrollWidth <= element.clientWidth + 1));
            assert.ok(await page.locator('.gv-mode-button').evaluateAll(buttons => buttons.every(button => button.getBoundingClientRect().height >= 44)));
            assert.match(await page.locator('#gv-favorite').innerText(), /7 票/);
            if (out) await page.screenshot({ path: path.join(out, 'mode-result-' + viewport.width + '.png') });
            // Storage-disabled browser still keeps one identity throughout the page's requests.
            await context.addInitScript(() => { Storage.prototype.getItem = () => { throw new Error('storage blocked'); }; Storage.prototype.setItem = () => { throw new Error('storage blocked'); }; });
            devices.clear();
            await page.reload();
            await page.waitForSelector('[data-mode="battlefield"][aria-pressed="true"]');
            await page.click('[data-mode="resistance"]');
            await page.waitForSelector('[data-mode="resistance"][aria-pressed="true"]');
            await page.click('#gv-mode-refresh');
            await page.waitForFunction(() => !document.getElementById('gv-mode-refresh').disabled);
            assert.equal(devices.size, 1);
            reports.push({ viewport, ok: true, checks: ['entry', 'five modes', 'keyboard/focus', 'vote/change/withdraw/reload', 'idempotent clicks', 'network recovery', 'anonymous requests', 'quota isolation', 'storage fallback', 'layout'] });
            await context.close();
        }
    } finally { await browser.close(); server.close(); }
    if (out) fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ productionWrites: 0, reports }, null, 2));
    console.log('PASS', JSON.stringify(reports));
})().catch(error => { server.close(); console.error(error); process.exitCode = 1; });
