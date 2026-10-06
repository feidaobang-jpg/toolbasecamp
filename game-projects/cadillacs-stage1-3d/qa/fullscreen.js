// 全屏入口按浏览器能力显示的验收（2026-10-07，与赤色要塞 v0.7.9 同一规则）：node qa/fullscreen.js
// 桌面 1280×720、手机横屏 844×390、手机竖屏 390×844（开局自动旋转）各跑两遍：
//   capable   —— 浏览器原样：菜单与右上全屏按钮显示，点击进入全屏，退出全屏后游戏照旧自动暂停
//   incapable —— addInitScript 删掉 requestFullscreen 并把 fullscreenEnabled 设为 false（iPhone Safari / 未授权 iframe）：
//                按钮全部隐藏（压过公共界面里 body.mobile-device 的 display:block!important），键盘导航跳过、不卡，F 键提示后继续游玩
// TOY_PREVIEW=<Toy 预览外壳地址> 时改在外壳里的 bilibilitoy iframe 内运行（触摸进不了截图后的跨域 iframe，截图放在每段最后）
const { launch, out, sleep } = require('./lib');
const fs = require('fs');
const GAME = {
  name: 'cadillacs', file: 'cadillacs-fullscreen.json',
  base: process.env.CD_BASE || 'http://127.0.0.1:8777/html/game/cadillacs-stage1-3d/index.html',
  state: () => { const s = window.__CD_TEST__.snapshot(); return { uiMode: s.ui.uiMode, overlay: s.ui.overlay, paused: s.ui.paused, fs: s.ui.fs, fsCapable: s.ui.fsCapable, fsLog: s.ui.fsLog, toast: s.ui.toast, focus: s.ui.focus, mode: s.mode, x: s.player ? s.player.x : null }; },
  startKeys: ['Enter', 'Enter'], startTaps: ['[data-act=select]', '#sel-go'],
  // 开场对话：J 跳过，进入可操作状态
  async settle(r, act) { for (let i = 0; i < 14; i++) { const s = await r.evaluate(GAME.state); if (s.mode === 'play') return; await act(); await sleep(250); } },
  attack: { key: 'KeyJ', tap: '#btn-atk' },
  fKey: true, moveKey: 'KeyD'
};
const INCAPABLE = () => {
  for (const o of [Element.prototype, HTMLElement.prototype, document.documentElement]) { try { delete o.requestFullscreen; delete o.webkitRequestFullscreen; } catch (e) { /* 只读 */ } }
  Object.defineProperty(Element.prototype, 'requestFullscreen', { value: undefined, configurable: true });
  Object.defineProperty(Element.prototype, 'webkitRequestFullscreen', { value: undefined, configurable: true });
  Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false, configurable: true });
  Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { get: () => false, configurable: true });
};
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const SIZES = [
  { id: 'desktop', w: 1280, h: 720, mobile: false },
  { id: 'landscape', w: 844, h: 390, mobile: true },
  { id: 'portrait', w: 390, h: 844, mobile: true }
];
(async () => {
  const b = await launch();
  const results = [], errs = [];
  const ok = (name, cond, info) => { results.push({ name, pass: !!cond, info }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
  for (const sz of SIZES) for (const cap of [true, false]) {
    const tag = sz.id + (cap ? '·支持全屏' : '·不支持全屏') + '：';
    const ctx = await b.newContext(sz.mobile ? { viewport: { width: sz.w, height: sz.h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: MOBILE_UA } : { viewport: { width: sz.w, height: sz.h } });
    if (!cap) await ctx.addInitScript(INCAPABLE);
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(tag + 'pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(tag + 'console: ' + m.text()); });
    let r = page;
    if (process.env.TOY_PREVIEW) {
      await page.goto(process.env.TOY_PREVIEW, { waitUntil: 'load' }); await sleep(4000);
      r = page.frames().find(f => /bilibilitoy\.com/.test(f.url()));
      if (!r) { ok(tag + '找到 Toy 预览 iframe', false, page.frames().map(f => f.url())); await ctx.close(); continue; }
      await r.goto(r.url().split('?')[0] + '?test=1&seed=3', { waitUntil: 'load' });
    } else await page.goto(GAME.base + '?test=1&seed=3', { waitUntil: 'load' });
    await r.evaluate(() => localStorage.clear()); await r.evaluate(() => location.reload()); await sleep(600);
    await r.waitForFunction(() => document.querySelector('#loading') ? document.querySelector('#loading').hidden : true, null, { timeout: 30000 }).catch(() => {});
    await sleep(800);
    const S = () => r.evaluate(GAME.state);
    const key = async (k) => { await page.keyboard.press(k); await sleep(80); };
    const tap = async (sel) => { if (sz.mobile) await r.tap(sel); else await r.click(sel); await sleep(250); };
    const vis = (sel) => r.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map(el => { const q = el.getBoundingClientRect(); return { hidden: el.hidden, display: getComputedStyle(el).display, shown: el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none', inView: q.left >= -1 && q.top >= -1 && q.right <= innerWidth + 1 && q.bottom <= innerHeight + 1 }; }), sel);
    // 菜单键盘导航：↓/↑ 走一圈，焦点只落在看得见的项上，全屏项不出现（不支持时）
    async function nav(label) {
      const want = await r.evaluate(() => { const o = document.querySelector('.overlay:not([hidden])'); return Array.from(o.querySelectorAll('.items > button, .items > a, .control-modes > button')).filter(el => !el.hidden && el.getClientRects().length > 0).length; });
      const seen = [];
      for (let i = 0; i < want + 1; i++) { await key('ArrowDown'); seen.push(await r.evaluate(() => { const a = document.activeElement; return { id: a && (a.getAttribute('data-act') || a.getAttribute('data-opt') || a.getAttribute('data-control-mode') || a.id || a.tagName), shown: !!a && a.getClientRects().length > 0 && getComputedStyle(a).display !== 'none', fs: !!a && (a.classList.contains('fs-btn') || a.id === 'btn-fs') }; })); }
      for (let i = 0; i < 2; i++) { await key('ArrowUp'); seen.push(await r.evaluate(() => { const a = document.activeElement; return { id: a && (a.getAttribute('data-act') || a.getAttribute('data-opt') || a.getAttribute('data-control-mode') || a.id), shown: !!a && a.getClientRects().length > 0, fs: !!a && a.classList.contains('fs-btn') }; })); }
      const distinct = new Set(seen.slice(0, want).map(x => x.id)).size;
      ok(tag + label + '键盘 ↓↑ 走一圈焦点都在可见项上、不卡', seen.every(x => x.shown) && distinct === want && seen[want].id === seen[0].id && (cap || !seen.some(x => x.fs)), { want, distinct, ids: seen.map(x => x.id) });
    }
    let s = await S();
    ok(tag + 'fsCapable 与环境一致', s.fsCapable === cap, s.fsCapable);
    const mfs = await vis('#menu .fs-btn');
    ok(tag + '主菜单全屏项' + (cap ? '显示' : '隐藏'), mfs.length > 0 && mfs.every(v => v.shown === cap && v.hidden === !cap), mfs);
    if (!sz.mobile) await nav('主菜单');
    if (cap && !process.env.TOY_PREVIEW) {
      await tap('#menu .fs-btn'); await sleep(500);
      s = await S(); ok(tag + '点主菜单「全屏」进入全屏', s.fs, s.fsLog);
      const txt = await r.evaluate(() => document.querySelector('#menu .fs-btn').textContent);
      ok(tag + '全屏后文字为「退出全屏」', txt === '退出全屏', txt);
      await r.evaluate(() => (document.exitFullscreen || document.webkitExitFullscreen).call(document)); await sleep(500);
      s = await S(); ok(tag + '退出全屏回到菜单、不误开局', !s.fs && s.overlay === 'menu' && s.uiMode !== 'game', [s.fs, s.overlay, s.uiMode]);
      await r.evaluate(() => document.querySelector('#menu .items > button').focus());
    }
    // 开局
    if (sz.mobile) { for (const sel of GAME.startTaps) await tap(sel); }
    else { await r.evaluate(() => document.querySelector('#menu .items > button').focus()); for (const k of GAME.startKeys) { await key(k); await sleep(300); } }
    await sleep(800);
    // 手机段全程只用触摸：按键盘会切到键鼠模式，竖屏旋转与触屏按钮随之撤掉
    if (GAME.settle) await GAME.settle(r, () => sz.mobile ? tap(GAME.attack.tap) : key(GAME.attack.key));
    const pause = () => sz.mobile ? tap('#btn-pause') : key('Escape');
    const resume = () => sz.mobile ? tap('#pause [data-act=resume]') : key('Escape');
    s = await S(); ok(tag + '开局进入游戏', s.uiMode === 'game' && !s.overlay, [s.uiMode, s.overlay, s.mode]);
    const rot = await r.evaluate(() => { const st = document.getElementById('stage'); return st ? st.classList.contains('rotated') : null; });
    if (sz.id === 'portrait') ok(tag + '竖屏开局自动旋转为横屏布局', rot === true, rot);
    if (sz.mobile) { const th = await r.evaluate(() => document.body.classList.contains('touch-on')); ok(tag + '保持触屏模式', th, th); }
    const tfs = await vis('#btn-fs');
    ok(tag + '右上全屏按钮' + (cap ? '显示且在视口内' : '隐藏'), tfs.length === 1 && (cap ? tfs[0].shown && tfs[0].inView && !tfs[0].hidden : !tfs[0].shown && tfs[0].hidden), tfs[0]);
    const siblings = await vis('#hud-top button:not(#btn-fs)');
    ok(tag + '右上其他按钮仍显示', siblings.some(v => v.shown && v.inView), siblings);
    if (cap) {
      await tap('#btn-fs'); await sleep(500);
      s = await S(); ok(tag + '点右上全屏进入全屏、游戏不暂停', s.fs && !s.overlay && !s.paused, [s.fs, s.overlay, s.fsLog]);
      if (s.fs) {
        await r.evaluate(() => (document.exitFullscreen || document.webkitExitFullscreen).call(document)); await sleep(600);
        s = await S(); ok(tag + '退出全屏后自动暂停（原行为）', !s.fs && s.overlay === 'pause', [s.fs, s.overlay]);
        const pfs = await vis('#pause .fs-btn'); ok(tag + '暂停菜单全屏项显示', pfs.every(v => v.shown), pfs);
        if (!sz.mobile) await nav('暂停菜单');
        await resume(); await sleep(300);
        s = await S(); ok(tag + '继续游戏', !s.overlay, s.overlay);
      }
    } else {
      if (GAME.fKey && !sz.mobile) {
        const x0 = (await S()).x;
        await key('KeyF'); await sleep(200);
        s = await S(); ok(tag + 'F 键给出提示、不暂停', !!s.toast && /全屏/.test(s.toast) && !s.overlay && !s.paused && !s.fs, [s.toast, s.overlay, s.fsLog]);
        await page.keyboard.down(GAME.moveKey); await sleep(700); await page.keyboard.up(GAME.moveKey); await sleep(150);
        s = await S(); ok(tag + 'F 之后照常游玩（按方向角色移动）', s.x !== null && Math.abs(s.x - x0) > 0.3, [x0, s.x]);
      }
      await pause(); await sleep(400);
      s = await S(); ok(tag + '打开暂停菜单', s.overlay === 'pause', s.overlay);
      const pfs = await vis('#pause .fs-btn'); ok(tag + '暂停菜单全屏项隐藏', pfs.length > 0 && pfs.every(v => !v.shown), pfs);
      if (!sz.mobile) await nav('暂停菜单');
      await tap('#pause [data-act=resume]'); await sleep(300);
      s = await S(); ok(tag + '继续游戏', !s.overlay && s.uiMode === 'game', s.overlay);
    }
    await page.screenshot({ path: out(GAME.name + '-fs-' + sz.id + (cap ? '-cap' : '-nocap') + '.png') });
    await ctx.close();
  }
  await b.close();
  ok('无页面错误', errs.length === 0, errs.slice(0, 8));
  fs.writeFileSync(out(GAME.file), JSON.stringify({ date: new Date().toISOString(), base: process.env.TOY_PREVIEW || GAME.base, pass: results.filter(x => x.pass).length, total: results.length, results, errors: errs, physicalPhone: false }, null, 1));
  console.log(results.filter(x => x.pass).length + '/' + results.length);
  process.exit(results.every(x => x.pass) ? 0 : 1);
})();
