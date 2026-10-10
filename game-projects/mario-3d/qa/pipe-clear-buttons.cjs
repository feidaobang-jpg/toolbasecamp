// Regression: real input for action availability and full flag sequences through the last implemented stage.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const out = process.env.QA_OUT || path.resolve(__dirname, '../media-kit/releases/v2.4.4/qa');
const url = process.env.QA_URL || 'http://127.0.0.1:8927/html/game/mario-3d/index.html';
const baseline = process.env.QA_BASELINE === '1';
const checks = [];
function check(name, ok, data) { checks.push({ name, ok, data }); if (!ok) throw new Error(name + ': ' + JSON.stringify(data)); }
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--use-angle=d3d11'] });
  try {
    const c = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
    const p = await c.newPage(), errors = [];
    p.on('pageerror', e => errors.push(e.message));
    if (baseline) {
      const { execFileSync } = require('node:child_process');
      for (const n of ['main.js', 'world.js', 'scene.js', 'textures.js']) {
        const body = execFileSync('git', ['show', (process.env.QA_BASELINE_REF || '63a09c05') + ':public/html/game/mario-3d/' + n], { encoding: 'utf8' });
        await p.route('**/' + n + '*', r => r.fulfill({ contentType: 'application/javascript', body }));
      }
    }
    await p.goto(url + (url.includes('?') ? '&' : '?') + 'test=1&q=high');
    await p.waitForFunction(() => window.__MARIO_TEST__);
    await p.locator('[data-control-mode=show]').first().click();
    await p.locator('[data-act=start]').first().click();
    await p.evaluate(() => { const q = __MARIO_TEST__; q.manual(true); q.skipCard(); q.world.player.inv = 999; q.world.player.x = 27; for (let i = 0; i < 120; i++) q.step(1); });
    await p.screenshot({ path: path.join(out, 'pipe-side.png') });
    if (baseline) {
      const result = await p.evaluate(() => { const q = __MARIO_TEST__; q.world.player.x = q.world.area.flag.x - .2; q.world.player.y = 1; try { q.step(1800); return q.state(); } catch (e) { return { error: e.message, phase: q.world.flag.phase }; } });
      fs.writeFileSync(path.join(out, 'reproduction.json'), JSON.stringify(result, null, 2));
      check('baseline reproduces castle walk crash', result.error === 'groundTopAt is not defined', result);
    } else {
      const unavailable = await p.locator('[data-hold=fire]').evaluate(e => ({ opacity: getComputedStyle(e).opacity, nativeDisabled: e.disabled, aria: e.getAttribute('aria-disabled'), label: e.innerText }));
      // 主线 30147c57 起火球键固定显示「火球」，未吃火焰花时只用 aria-disabled 标记，不再弹提示
      check('unavailable fire keeps solid button and is marked unavailable', unavailable.opacity === '1' && !unavailable.nativeDisabled && unavailable.aria === 'true' && unavailable.label.includes('火球'), unavailable);
      // ARIA marks the unavailable action; a real pointer still reaches its explanatory hint.
      const fireRect = await p.locator('[data-hold=fire]').boundingBox();
      await p.mouse.click(fireRect.x + fireRect.width / 2, fireRect.y + fireRect.height / 2);
      check('unavailable fire does not shoot', await p.evaluate(() => __MARIO_TEST__.world.rt.fireballs.length === 0));
      await p.evaluate(() => { const q = __MARIO_TEST__; q.world.player.power = 'fire'; q.step(1); });
      await p.locator('[data-hold=fire]').click();
      await p.evaluate(() => __MARIO_TEST__.step(2));
      check('fire flower enables real projectile', await p.evaluate(() => __MARIO_TEST__.world.rt.fireballs.length > 0));
      await p.evaluate(() => { const q = __MARIO_TEST__; q.world.player.power = 'small'; q.step(1); });
      check('losing flower returns to unavailable state', await p.locator('[data-hold=fire]').getAttribute('aria-disabled') === 'true');
      // Observe pipe from every preset; settle camera with normal frame updates.
      for (let i = 0; i < 5; i++) {
        if (i) await p.keyboard.press('KeyC');
        await p.evaluate(() => { const q = __MARIO_TEST__; q.world.player.x = 27; q.world.player.y = 0; for (let i = 0; i < 100; i++) q.step(1); });
        await p.screenshot({ path: path.join(out, 'pipe-view-' + i + '.png') });
      }
      await p.evaluate(() => { const q = __MARIO_TEST__; q.world.player.x = q.world.area.flag.x - .2; q.world.player.y = 1; q.world.player.vx = q.world.player.vy = 0; q.step(1800); });
      check('1-1 flag sequence automatically enters 1-2', await p.evaluate(() => __MARIO_TEST__.state().level === '1-2' && __MARIO_TEST__.state().cleared.join() === '1-1'));
      await p.screenshot({ path: path.join(out, 'second-stage.png') });
      // Relocate to the actual underground exit pipe, then use its real transition.
      await p.evaluate(() => { const q = __MARIO_TEST__; q.skipCard(); q.step(600); const s = q.world.area.sidePipes.find(s => s.to?.area === 'exit'); Object.assign(q.world.player, { x: s.x - .3, y: s.y, vx: 0, vy: 0, grounded: true }); });
      await p.keyboard.down('KeyU'); await p.evaluate(() => __MARIO_TEST__.step(1)); await p.keyboard.up('KeyU');
      await p.evaluate(() => __MARIO_TEST__.step(500));
      check('1-2 pipe reaches overworld exit', await p.evaluate(() => __MARIO_TEST__.world.areaId === 'exit'));
      await p.evaluate(() => { const q = __MARIO_TEST__; q.world.player.x = 8; q.world.player.y = 0; for (let i = 0; i < 100; i++) q.step(1); });
      await p.screenshot({ path: path.join(out, 'exit-pipe.png') });
      await p.evaluate(() => { const q = __MARIO_TEST__; q.world.player.x = q.world.area.flag.x - .2; q.world.player.y = 1; q.world.player.vx = q.world.player.vy = 0; q.step(1800); });
      const third = await p.evaluate(() => __MARIO_TEST__.state().level === '1-3');
      if (third) {
        check('1-2 flag sequence automatically enters 1-3', await p.evaluate(() => __MARIO_TEST__.state().cleared.join() === '1-1,1-2'));
        await p.evaluate(() => { const q = __MARIO_TEST__; q.skipCard(); q.world.player.x = q.world.area.flag.x - .2; q.world.player.y = 1; q.world.player.vx = q.world.player.vy = 0; q.step(1800); });
        // v2.6.0 起 1-3 之后是 1-4 城堡：到桥头碰斧头，结尾演出放完才结算
        if (await p.evaluate(() => __MARIO_TEST__.state().level === '1-4')) {
          check('1-3 flag sequence automatically enters 1-4', await p.evaluate(() => __MARIO_TEST__.state().cleared.join() === '1-1,1-2,1-3'));
          await p.evaluate(() => { const q = __MARIO_TEST__; q.skipCard(); q.world.rt.flames.length = 0; Object.assign(q.world.player, { x: 140.9, y: 4.4, vx: 0, vy: 0, inv: 9 }); q.step(2400); });
        }
      }
      const cleared = await p.evaluate(() => __MARIO_TEST__.state().cleared.join());
      check('last implemented stage ends run once', await p.evaluate(() => __MARIO_TEST__.state().overlay === 'result') && ['1-1,1-2', '1-1,1-2,1-3', '1-1,1-2,1-3,1-4'].includes(cleared), cleared);
      await p.locator('[data-act=again]').click();
      await p.evaluate(() => { const q = __MARIO_TEST__; q.skipCard(); q.world.player.inv = 999; });
      for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
        await p.setViewportSize(viewport); await p.waitForTimeout(250); await p.evaluate(() => __MARIO_TEST__.step(1));
        const buttons = await p.locator('#touch [data-hold]').evaluateAll(es => es.map(e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return { action: e.dataset.hold, opacity: s.opacity, width: r.width, height: r.height, x: r.x, y: r.y, right: r.right, bottom: r.bottom, background: s.backgroundImage }; }));
        check('equal opaque buttons in ' + viewport.width + 'x' + viewport.height, buttons.length === 4 && buttons.every(e => e.opacity === '1' && Math.abs(e.width - buttons[0].width) < .1 && Math.abs(e.height - buttons[0].height) < .1 && e.x >= 0 && e.y >= 0 && e.right <= viewport.width + .1 && e.bottom <= viewport.height + .1), buttons);
        await p.screenshot({ path: path.join(out, 'phone-' + viewport.width + '.png') });
        await p.locator('#btn-pause').click();
        const state = await p.evaluate(() => ({ level: __MARIO_TEST__.world.levelId, x: __MARIO_TEST__.world.player.x }));
        await p.locator('#pause [data-control-mode=hide]').click(); await p.locator('#pause [data-control-mode=show]').click();
        check('switch modes preserves stage and position', await p.evaluate(s => __MARIO_TEST__.world.levelId === s.level && __MARIO_TEST__.world.player.x === s.x, state));
        await p.locator('#pause [data-act=resume]').click();
      }
      check('no runtime errors', errors.length === 0, errors);
    }
    const video = p.video(); await c.close(); await video.saveAs(path.join(out, 'motion.webm')); await video.delete();
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ url, baseline, browser: b.version(), method: 'Edge headless GPU; browser viewport simulation; relocations and manual clock explicitly used', checks, audio: 'video has no audio; not a media-ready gameplay master' }, null, 2));
    console.log(JSON.stringify({ checks: checks.length, passed: checks.filter(x => x.ok).length, out }));
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exit(1); });
