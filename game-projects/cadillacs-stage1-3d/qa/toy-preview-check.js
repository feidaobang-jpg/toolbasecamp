// Toy 预览实测：电脑 + 手机视口分别打开预览页，在游戏 iframe 内（加 test=1）确认版本、开局、实际按键效果、触屏方阵与无报错。
// 直接打开 iframe 地址会 302 回外壳页，所以先进外壳页，再让 iframe 自己导航到带参数的地址。
// 用法：node qa/toy-preview-check.js <preview_url> [期望版本，如 v0.1.3]
const { launch, out, sleep } = require('./lib');
(async () => {
  const PREVIEW = process.argv[2], WANT = process.argv[3];
  if (!PREVIEW) { console.log('用法：node qa/toy-preview-check.js <preview_url> [期望版本]'); process.exit(2); }
  const results = [];
  const ok = (name, cond, info) => { results.push({ name, pass: !!cond, info }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
  for (const mode of ['desktop', 'mobile']) {
    const b = await launch();
    const ctx = mode === 'desktop'
      ? await b.newContext({ viewport: { width: 1280, height: 720 } })
      : await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' });
    const page = await ctx.newPage();
    const errs = [], failed = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('response', r => { if (r.status() >= 400 && /bilibilitoy\.com/.test(r.url())) failed.push(r.status() + ' ' + r.url()); });
    await page.goto(PREVIEW, { waitUntil: 'load', timeout: 60000 });
    await sleep(4000);
    let frame = page.frames().find(f => /bilibilitoy\.com/.test(f.url()));
    ok(mode + '：预览页载入游戏 iframe', !!frame, frame && frame.url().replace(/\?.*/, ''));
    if (!frame) { await b.close(); continue; }
    const u = new URL(frame.url()); u.searchParams.set('test', '1'); u.searchParams.set('seed', '5');
    await frame.goto(u.href, { waitUntil: 'load', timeout: 60000 });
    await sleep(2500);
    frame = page.frames().find(f => /bilibilitoy\.com/.test(f.url()));
    const S = () => frame.evaluate(() => window.__CD_TEST__.snapshot());
    const ver = await frame.evaluate(() => window.__CD_TEST__ && window.__CD_TEST__.version);
    ok(mode + '：版本', !WANT || ver === WANT, ver);
    const tap = async (sel) => { await frame.tap(sel, { timeout: 5000 }); await sleep(250); };   // Playwright 自己换算 iframe 偏移
    await page.screenshot({ path: out('toy-preview-' + mode + '-title.png') });
    let s;
    if (mode === 'desktop') {
      await frame.evaluate(() => { window.focus(); const b0 = document.querySelector('[data-act=select]'); if (b0) b0.focus(); });
      await page.keyboard.press('Enter'); await sleep(500);
      await page.keyboard.press('Enter'); await sleep(800);
      for (let i = 0; i < 14; i++) { s = await S(); if (s.mode === 'play') break; await page.keyboard.press('KeyJ'); await sleep(300); }
      ok('desktop：键盘开局进入战斗', s.mode === 'play', s.mode);
      ok('desktop：电脑键鼠布局（不显示触屏键）', s.ui.touchHidden === true);
      await frame.evaluate(() => window.__CD_TEST__.cheat.killAll()); await sleep(1500);
      await page.keyboard.down('KeyI'); await page.keyboard.down('KeyD'); await sleep(300);
      s = await S(); ok('desktop：按住 I + D 冲刺', s.player.state === 'run', s.player.state);
      await page.keyboard.up('KeyD'); await page.keyboard.up('KeyI'); await sleep(600);
      await page.keyboard.press('KeyC'); await sleep(200);
      s = await S(); ok('desktop：C 切换视角', s.ui.camera === 'oblique', s.ui.camera);
    } else {
      await tap('[data-act=select]'); await tap('#sel-go'); await sleep(600);
      for (let i = 0; i < 14; i++) { s = await S(); if (s.mode === 'play') break; await tap('#btn-atk'); }
      ok('mobile：触屏开局进入战斗', s.mode === 'play', s.mode);
      ok('mobile：显示触屏键', s.ui.touchHidden === false);
      const pad = await frame.evaluate(() => { const c = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2), Math.round(r.width)]; }; return { J: c('btn-atk'), K: c('btn-jump'), U: c('btn-mega'), I: c('btn-run'), esc: getComputedStyle(document.querySelector('#btn-pause .kb-only')).display, qe: !!document.querySelector('#btn-rotl, #btn-rotr, [aria-label*="左转"]') }; });
      ok('mobile：2×2 方阵（下排 J K、上排 U I）、无 Esc 标签、无左右转键', pad.J[1] === pad.K[1] && pad.U[1] === pad.I[1] && pad.J[0] === pad.U[0] && pad.K[0] === pad.I[0] && pad.J[0] < pad.K[0] && pad.U[1] < pad.J[1] && pad.esc === 'none' && !pad.qe, pad);
      await tap('#btn-cam'); s = await S(); ok('mobile：右上角 C 切换视角', s.ui.camera === 'oblique', s.ui.camera);
      await tap('#btn-jump'); s = await S(); ok('mobile：K 跳跃', s.player.state === 'jump' || s.player.y > 0, s.player.state);
    }
    await sleep(800);
    await page.screenshot({ path: out('toy-preview-' + mode + '-game.png') });
    ok(mode + '：游戏 iframe 无报错 / 404', !errs.some(e => /pageerror|game\.min|cadillacs/i.test(e)) && failed.length === 0, { errs: errs.slice(0, 5), failed: failed.slice(0, 5) });
    await ctx.close(); await b.close();
  }
  console.log('\n' + results.filter(r => r.pass).length + '/' + results.length + ' 通过');
  require('fs').writeFileSync(out('toy-preview-results.json'), JSON.stringify({ preview: PREVIEW, results }, null, 1));
  if (results.some(r => !r.pass)) process.exitCode = 1;
})();
