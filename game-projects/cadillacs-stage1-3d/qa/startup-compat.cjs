// Regression: a fresh Toy/WebView session must start without randomUUID or storage.
// CD_BASE can point to the local/site entry or Toy preview/public shell.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { launch, BASE, out, sleep } = require('./lib');
const capture = process.env.CD_CAPTURE || path.dirname(out('startup.json'));
fs.mkdirSync(capture, { recursive: true });
const results = process.env.CD_CASE && fs.existsSync(path.join(capture, 'startup-compat.json'))
  ? JSON.parse(fs.readFileSync(path.join(capture, 'startup-compat.json'), 'utf8')).filter(r => r.name !== process.env.CD_CASE) : [];
(async () => {
  const browser = await launch();
  try {
    const cases = process.env.CD_COMPAT_ONLY
      ? [['mobile-no-uuid', 'uuid', 844, 390, true], ['mobile-no-crypto-storage', 'all', 844, 390, true]]
      : [['desktop-native', 'native', 1280, 720, false], ['desktop-no-uuid', 'uuid', 1280, 720, false], ['mobile-no-uuid', 'uuid', 844, 390, true], ['mobile-no-crypto-storage', 'all', 844, 390, true], ['portrait-no-uuid', 'uuid', 390, 844, true]];
    if (process.argv.includes('--baseline')) cases.unshift(['baseline-no-uuid', 'uuid', 1280, 720, false]);
    for (const [name, missing, width, height, touch] of cases) {
      if (process.env.CD_CASE && name !== process.env.CD_CASE) continue;
      const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch,
        ...(process.env.CD_RECORD ? { recordVideo: { dir: capture, size: { width, height } } } : {}),
        ...(touch ? { userAgent: 'Mozilla/5.0 (Linux; Android 8.1.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0 Mobile Safari/537.36' } : {}) });
      if (missing !== 'native') await ctx.addInitScript(missing => {
        if (missing === 'all') {
          Object.defineProperty(window, 'crypto', { configurable: true, value: undefined });
          Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
        } else Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
      }, missing);
      const page = await ctx.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      if (name.startsWith('baseline')) {
        const old = execFileSync('git', ['show', 'origin/master:public/html/game/cadillacs-stage1-3d/js/game.min.js']);
        await page.route('**/js/game.min.js*', route => route.fulfill({ contentType: 'text/javascript', body: old }));
      }
      const url = new URL(BASE); url.searchParams.set('test', '1'); url.searchParams.set('seed', '5');
      await page.goto(url.href, { waitUntil: 'load', timeout: 60000 });
      let game = page;
      if (/bilibili\.com/.test(BASE)) {
        await page.waitForSelector('iframe', { timeout: 30000 });
        for (let i = 0; i < 20; i++) { game = page.frames().find(f => /bilibilitoy\.com/.test(f.url())); if (game) break; await sleep(300); }
        assert.ok(game, 'Toy game iframe');
        const u = new URL(game.url()); u.searchParams.set('test', '1'); u.searchParams.set('seed', '5');
        await game.goto(u.href, { waitUntil: 'load', timeout: 60000 });
      }
      if (name.startsWith('baseline')) {
        await page.waitForFunction(() => document.getElementById('loading').textContent.includes('randomUUID'));
        assert.ok(errors.some(e => e.includes('randomUUID')));
        await page.screenshot({ path: path.join(capture, name + '.png') });
        results.push({ name, pass: true, errors, expected_failure: true });
        await ctx.close(); continue;
      }
      await game.waitForFunction(() => window.__CD_TEST__ && document.getElementById('loading').hidden, { timeout: 30000 });
      assert.equal(await game.evaluate(() => window.__CD_TEST__.version), 'v0.9.4');
      if (touch) await game.locator('#menu [data-control-mode="show"]').click();
      await page.screenshot({ path: path.join(capture, name + '-menu.png') });
      const click = async selector => { await game.locator(selector).click(); await sleep(250); };
      await click('#menu [data-act=select]'); await click('#sel-go');
      for (let i = 0; i < 40; i++) {
        if (await game.evaluate(() => window.__CD_TEST__.snapshot().mode === 'play')) break;
        await sleep(300);
      }
      await game.waitForFunction(() => window.__CD_TEST__.snapshot().mode === 'play');
      // Only setup uses the test hook; movement, attack, pause and restart use real controls.
      await game.evaluate(() => { window.__CD_TEST__.cheat.G.pending = []; window.__CD_TEST__.cheat.killAll(); });
      await sleep(500);
      const before = await game.evaluate(() => window.__CD_TEST__.snapshot().player.x);
      await page.keyboard.down('KeyD'); await sleep(350); await page.keyboard.up('KeyD');
      const after = await game.evaluate(() => window.__CD_TEST__.snapshot().player.x);
      assert.notEqual(before, after, 'movement works');
      if (touch) await game.tap('#btn-atk'); else await page.keyboard.press('KeyJ');
      await sleep(80);
      const attack = await game.evaluate(() => window.__CD_TEST__.snapshot().player.state);
      assert.notEqual(attack, 'idle', 'attack input works');
      await page.screenshot({ path: path.join(capture, name + '-gameplay.png') });
      await click('#btn-pause');
      assert.equal(await game.evaluate(() => window.__CD_TEST__.snapshot().ui.paused), true);
      await click('#pause [data-act=resume]');
      assert.equal(await game.evaluate(() => window.__CD_TEST__.snapshot().ui.paused), false);
      await click('#btn-pause'); await click('#pause [data-act=restart]');
      assert.ok(['cut', 'play'].includes(await game.evaluate(() => window.__CD_TEST__.snapshot().mode)));
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(capture, name + '-play.png') });
      results.push({ name, pass: true, missing, viewport: [width, height], errors, movement: [before, after], attack,
        method: 'Edge desktop with API removal and mobile viewport emulation; not a physical device' });
      console.log('PASS ' + name);
      await ctx.close();
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(capture, 'startup-compat.json'), JSON.stringify(results, null, 2) + '\n'); }
})().catch(e => { console.error(e); process.exitCode = 1; });
