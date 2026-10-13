// 双端布局与触屏：各尺寸菜单是否完整、手机竖屏是否从标题起旋转、摇杆/动作键/拖动转视角、三种操作模式切换
// 触屏为浏览器触控模拟（CDP），不是手机真机。
const { open, shot } = require('./lib.cjs');
const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });

// 面板里每个可见按钮是否都落在视口内
const fitScript = (id) => {
  const ov = document.getElementById(id);
  const vw = window.innerWidth, vh = window.innerHeight;
  const out = [];
  for (const b of ov.querySelectorAll('.btn')) {
    if (b.hidden || !b.getClientRects().length) continue;
    const r = b.getBoundingClientRect();
    if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) out.push(b.textContent.trim().slice(0, 12) + ` [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
    if (Math.min(r.width, r.height) < 43.5) out.push('触控高度不足 ' + b.textContent.trim().slice(0, 10) + ' ' + Math.round(Math.min(r.width, r.height)));
    if (b.scrollWidth > b.clientWidth + 1) out.push('文字溢出 ' + b.textContent.trim().slice(0, 12));
  }
  return { out, scroll: ov.scrollHeight > ov.clientHeight + 1, rot: document.getElementById('stage').classList.contains('rot'), compact: document.getElementById('stage').classList.contains('compact') };
};

async function touchSession(ctx, page) {
  const cdp = await ctx.newCDPSession(page);
  const pts = new Map();
  // 每次派发后等一小会儿，让浏览器把触摸事件真正送进页面（否则连续派发会排在队列里）
  const send = async (type) => { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...pts.entries()].map(([id, p]) => ({ x: p[0], y: p[1], id, radiusX: 4, radiusY: 4, force: 1 })) }); await page.waitForTimeout(35); };
  return {
    async down(id, x, y) { pts.set(id, [x, y]); await send('touchStart'); },
    async move(id, x, y) { pts.set(id, [x, y]); await send('touchMove'); },
    async up(id) { pts.delete(id); await send(pts.size ? 'touchMove' : 'touchEnd'); if (pts.size) { /* 其余手指保持 */ } },
    async end() { pts.clear(); await send('touchEnd'); },
  };
}
const center = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
const step = (page, n) => page.evaluate((k) => __lj.step(k, true), n);
const gs = (page) => page.evaluate(() => { const g = __lj.game; return { x: g.hero.x, z: g.hero.z, yaw: g.cam.yaw, bullets: g.bullets.filter((b) => b.team === 0).length, state: __lj.app.state, view: g.cam.view, mode: __lj.app.mode(), rot: __lj.app.rot, size: __lj.app.size(), nades: g.hero.nades, dashCd: g.hero.dashCd, cavCd: g.hero.cavCd }; });

(async () => {
  let allErrors = [];
  // ---------- 电脑各窗口尺寸：标题菜单不滚动看全 ----------
  for (const [w, h] of [[1366, 768], [1280, 720], [1366, 625], [1280, 580], [1920, 1080]]) {
    const { browser, page, errors } = await open({ context: { viewport: { width: w, height: h } } });
    const f = await page.evaluate(fitScript, 'menu');
    check(`电脑 ${w}×${h}：标题菜单完整且不滚动`, f.out.length === 0 && !f.scroll && !f.rot, f);
    if (h === 580) await shot(page, 'menu-1280x580.png');
    if (h === 720) {
      // 键盘走一遍菜单：↓ 到选项、→ 改值、Tab 可进入操作模式三键
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
      const before = await page.evaluate(() => __lj.app.s.lives);
      const focused = await page.evaluate(() => document.activeElement.dataset.opt);
      await page.keyboard.press('ArrowRight');
      const after = await page.evaluate(() => __lj.app.s.lives);
      check('键盘 ↓ 选到“命数”、→ 调整', focused === 'lives' && before !== after, { focused, before, after });
      await page.keyboard.press('ArrowLeft');
      for (let i = 0; i < 30; i++) { if (await page.evaluate(() => document.activeElement.dataset.mode === 'auto')) break; await page.keyboard.press('ArrowDown'); }
      const m1 = await page.evaluate(() => document.activeElement.dataset.mode);
      await page.keyboard.press('ArrowRight');
      const m2 = await page.evaluate(() => document.activeElement.dataset.mode);
      await page.keyboard.press('Enter');
      const st1 = await page.evaluate(() => ({ mode: __lj.app.s.mode, pressed: [...document.querySelectorAll('#menu .modes .btn')].map((b) => b.getAttribute('aria-pressed')), touch: !document.getElementById('touch').hidden, body: document.body.classList.contains('touch-on') }));
      check('键盘能进入操作模式三键并切换', m1 === 'auto' && m2 === 'pc' && st1.mode === 'pc' && st1.pressed.join() === 'false,true,false', { m1, m2, st1 });
      await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
      const st2 = await page.evaluate(() => ({ mode: __lj.app.s.mode, touch: !document.getElementById('touch').hidden, body: document.body.classList.contains('touch-on'), rot: __lj.app.rot }));
      check('电脑上切到“手机触屏”：虚拟按键出现、横屏不旋转', st2.mode === 'touch' && st2.touch && st2.body && !st2.rot, st2);
      // 开局后用鼠标点虚拟键、拖摇杆
      await page.evaluate(() => document.querySelector('#menu .btn.primary').click());
      await page.evaluate(() => { __lj.manual(true); const g = __lj.game; for (const e of g.enemies) { e.alive = false; e.deadT = 9; } g.place(g.hero, 0, 80); __lj.step(5, true); });
      const a = await gs(page);
      const [jx, jy] = await center(page, '#joy-base');
      await page.mouse.move(jx, jy); await page.mouse.down(); await page.mouse.move(jx, jy - 60, { steps: 4 }); await step(page, 30);
      const b = await gs(page);
      await page.mouse.up(); await step(page, 3);
      check('电脑用鼠标拖虚拟摇杆向上＝前进', b.z < a.z - 1.5 && Math.abs(b.x - a.x) < 0.6, { dz: (b.z - a.z).toFixed(2) });
      const [fx, fy] = await center(page, '#act-J');
      await page.mouse.move(fx, fy); await page.mouse.down(); await step(page, 12); const c = await gs(page); await page.mouse.up(); await step(page, 2);
      check('电脑用鼠标按住虚拟 J 键开火', c.bullets > 0, c);
      await shot(page, 'pc-touchmode.png');
      // 暂停里切回电脑键鼠，本局保留
      await page.evaluate(() => __lj.app.pause());
      const pz = await page.evaluate(() => __lj.game.hero.z);
      await page.evaluate(() => document.querySelector('#pause .modes .btn[data-mode="pc"]').click());
      const st3 = await page.evaluate(() => ({ touch: !document.getElementById('touch').hidden, body: document.body.classList.contains('touch-on'), z: __lj.game.hero.z, state: __lj.app.state, phase: __lj.game.phase }));
      check('暂停中切回“电脑键鼠”：虚拟键收起且本局保留', !st3.touch && !st3.body && st3.z === pz && st3.state === 'pause', st3);
      const pf = await page.evaluate(fitScript, 'pause');
      check('电脑 1280×720：暂停菜单完整', pf.out.length === 0, pf);
      await shot(page, 'pause-1280x720.png');
      await page.evaluate(() => document.querySelector('#pause .modes .btn[data-mode="auto"]').click());
      await page.keyboard.press('Escape');
      check('Esc 继续', (await gs(page)).state === 'play', null);
    }
    allErrors = allErrors.concat(errors);
    await browser.close();
  }

  // ---------- 手机横屏 / 竖屏 ----------
  const phones = [[844, 390, true], [844, 346, true], [800, 390, true], [740, 360, false], [568, 320, false], [390, 844, true], [360, 780, false], [375, 667, false]];
  for (const [w, h, mustFit] of phones) {
    const { browser, ctx, page, errors } = await open({ context: { viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' } });
    const portrait = h > w;
    const f = await page.evaluate(fitScript, 'menu');
    const s0 = await gs(page);
    check(`手机 ${w}×${h}：识别为触屏，${portrait ? '标题菜单起就旋转为横屏' : '横屏不旋转'}`, s0.mode === 'touch' && s0.rot === portrait && f.compact, { s0, f });
    if (mustFit) check(`手机 ${w}×${h}：标题菜单完整显示`, f.out.length === 0 && !f.scroll, f);
    else {
      // 小视口允许滚动，但首尾要可达
      const reach = await page.evaluate(() => { const ov = document.getElementById('menu'); ov.scrollTop = 99999; const bs = [...ov.querySelectorAll('.btn')].filter((b) => b.getClientRects().length); const last = bs[bs.length - 1].getBoundingClientRect(); const okLast = last.bottom <= window.innerHeight + 1 && last.right <= window.innerWidth + 1 && last.left >= -1 && last.top >= -1; ov.scrollTop = 0; const first = bs[0].getBoundingClientRect(); return { okLast, okFirst: first.top >= -1 && first.left >= -1 && first.bottom <= window.innerHeight + 1 && first.right <= window.innerWidth + 1 }; });
      check(`手机 ${w}×${h}：标题菜单可滚动且首尾可达`, reach.okFirst && reach.okLast, { reach, f });
    }
    const kb = await page.evaluate(() => [...document.querySelectorAll('#menu .foot .pc-only, #hud kbd')].some((e) => e.getClientRects().length > 0));
    check(`手机 ${w}×${h}：菜单不出现键盘专属提示`, !kb, null);
    if ((w === 844 && h === 390) || (w === 390 && h === 844) || (w === 844 && h === 346)) await shot(page, `menu-${w}x${h}.png`);

    if ((w === 844 && h === 390) || (w === 390 && h === 844)) {
      const T = await touchSession(ctx, page);
      const [sx, sy] = await center(page, '#menu .btn.primary');
      await page.touchscreen.tap(sx, sy);
      await page.waitForTimeout(150);
      await page.evaluate(() => { __lj.manual(true); const g = __lj.game; for (const e of g.enemies) { e.alive = false; e.deadT = 9; } g.place(g.hero, 0, 80); __lj.step(5, true); });
      const st = await gs(page);
      check(`手机 ${w}×${h}：点“开始战斗”进入游戏且不自动全屏`, st.state === 'play' && !(await page.evaluate(() => !!document.fullscreenElement)), st);
      // 控件都在屏内、互不重叠
      const lay = await page.evaluate(() => { const vw = innerWidth, vh = innerHeight; const ids = ['joy-base', 'act-J', 'act-K', 'act-U', 'act-I', 'btn-view', 'btn-pause', 'btn-full']; const rs = ids.map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { id, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }); const off = rs.filter((r) => r.l < 0 || r.t < 0 || r.r > vw || r.b > vh).map((r) => r.id); const over = []; for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i], b = rs[j]; if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) over.push(a.id + '×' + b.id); } const small = rs.filter((r) => Math.min(r.w, r.h) < 43.5).map((r) => r.id); const hud = document.getElementById('hud-left').getBoundingClientRect(), top = document.getElementById('hud-top').getBoundingClientRect(); const hudOver = hud.left < top.right && top.left < hud.right && hud.top < top.bottom && top.top < hud.bottom; return { off, over, small, hudOver, viewText: document.getElementById('btn-view').scrollWidth <= document.getElementById('btn-view').clientWidth + 1 }; });
      check(`手机 ${w}×${h}：摇杆、四个动作键、右上三键都在屏内且不重叠`, !lay.off.length && !lay.over.length && !lay.small.length && !lay.hudOver && lay.viewText, lay);
      // 摇杆：往“逻辑上方”推＝前进。竖屏旋转后逻辑上方对应物理右方
      const [jx, jy] = await center(page, '#joy-base');
      const up = portrait ? [50, 0] : [0, -50], right = portrait ? [0, 50] : [50, 0];
      let a = await gs(page);
      await T.down(1, jx, jy); await T.move(1, jx + up[0] * 0.5, jy + up[1] * 0.5); await T.move(1, jx + up[0], jy + up[1]);
      await step(page, 30);
      let b = await gs(page);
      check(`手机 ${w}×${h}：摇杆上推＝前进`, b.z < a.z - 1.5 && Math.abs(b.x - a.x) < 0.8, { dx: (b.x - a.x).toFixed(2), dz: (b.z - a.z).toFixed(2) });
      // 多点：左手摇杆不放，右手按 J 开火
      const [fx, fy] = await center(page, '#act-J');
      await T.down(2, fx, fy); await step(page, 14);
      let c = await gs(page);
      check(`手机 ${w}×${h}：边移动边按 J 开火（多点触控）`, c.bullets > 0 && c.z < b.z - 0.5, { bullets: c.bullets, dz: (c.z - b.z).toFixed(2) });
      await T.up(2); await T.move(1, jx + right[0], jy + right[1]); await step(page, 24);
      let d = await gs(page);
      check(`手机 ${w}×${h}：摇杆右推＝右移`, d.x > c.x + 1.2, { dx: (d.x - c.x).toFixed(2) });
      await T.end(); await step(page, 6);
      const e0 = await gs(page); await step(page, 12); const e1 = await gs(page);
      check(`手机 ${w}×${h}：松手后停止移动`, Math.abs(e1.x - e0.x) < 0.05 && Math.abs(e1.z - e0.z) < 0.05, null);
      // 拖动空白处转视角：逻辑向右拖＝向右看（yaw 减小）
      const vw = w, vh = h;
      const mid = [vw / 2, vh / 2];
      const dragR = portrait ? [0, 16] : [16, 0];
      a = await gs(page);
      await T.down(3, mid[0], mid[1]);
      for (let i = 1; i <= 8; i++) { await T.move(3, mid[0] + dragR[0] * i, mid[1] + dragR[1] * i); await step(page, 2); }
      await T.end(); await step(page, 20);
      b = await gs(page);
      check(`手机 ${w}×${h}：画面空白处向右拖＝向右看`, b.yaw < a.yaw - 0.15, { dyaw: (b.yaw - a.yaw).toFixed(2) });
      a = b;
      await T.down(3, mid[0], mid[1]);
      for (let i = 1; i <= 8; i++) { await T.move(3, mid[0] - dragR[0] * i, mid[1] - dragR[1] * i); await step(page, 2); }
      await T.end(); await step(page, 20);
      b = await gs(page);
      check(`手机 ${w}×${h}：向左拖＝向左看`, b.yaw > a.yaw + 0.15, { dyaw: (b.yaw - a.yaw).toFixed(2) });
      // 在动作键上拖不触发转视角
      a = await gs(page);
      await T.down(4, fx, fy); await T.move(4, fx + dragR[0] * 2, fy + dragR[1] * 2); await T.move(4, fx + dragR[0] * 4, fy + dragR[1] * 4); await step(page, 6); await T.end(); await step(page, 10);
      b = await gs(page);
      check(`手机 ${w}×${h}：在动作键上滑动不会转视角`, Math.abs(b.yaw - a.yaw) < 0.01, { dyaw: (b.yaw - a.yaw).toFixed(3) });
      // 其余动作键
      for (const [key, test] of [['K', (p, q) => q.nades < p.nades], ['U', (p, q) => q.dashCd > 0], ['I', (p, q) => q.cavCd > 0]]) {
        const p0 = await gs(page);
        const [kx, ky] = await center(page, '#act-' + key);
        await T.down(5, kx, ky); await step(page, 3); await T.end(); await step(page, 3);
        const p1 = await gs(page);
        check(`手机 ${w}×${h}：${key} 键生效`, test(p0, p1), { p0: [p0.nades, p0.dashCd, p0.cavCd], p1: [p1.nades, p1.dashCd.toFixed(1), p1.cavCd.toFixed(1)] });
      }
      await step(page, 40);
      // 右上角：切换视角（按下即触发）、暂停
      const [vx, vy] = await center(page, '#btn-view');
      await T.down(6, vx, vy); await T.end(); await step(page, 3);
      const v1 = await gs(page);
      check(`手机 ${w}×${h}：右上“切换视角”按下即切`, v1.view === 1, { view: v1.view });
      const tip = await page.evaluate(() => document.getElementById('toast').textContent);
      check(`手机 ${w}×${h}：切视角提示不含键盘字样`, !/Q\/E|Esc|Enter|鼠标/.test(tip), { tip });
      await shot(page, `play-${w}x${h}.png`);
      const [px, py] = await center(page, '#btn-pause');
      await T.down(7, px, py); await T.end(); await page.waitForTimeout(60);
      const ps = await gs(page);
      const pf = await page.evaluate(fitScript, 'pause');
      check(`手机 ${w}×${h}：暂停菜单完整显示`, ps.state === 'pause' && pf.out.length === 0 && !pf.scroll, pf);
      const kb2 = await page.evaluate(() => [...document.querySelectorAll('#pause kbd')].some((e) => e.getClientRects().length > 0));
      check(`手机 ${w}×${h}：暂停菜单不出现键盘提示`, !kb2, null);
      await shot(page, `pause-${w}x${h}.png`);
      // 结算
      await page.evaluate(() => { __lj.app.resume(); const g = __lj.game; g.flags.loot = 1; g.finish(true); });
      await page.waitForTimeout(60);
      const rf = await page.evaluate(fitScript, 'result');
      check(`手机 ${w}×${h}：结算面板完整显示`, rf.out.length === 0 && !rf.scroll, rf);
      await shot(page, `result-${w}x${h}.png`);
    }
    if (w === 844 && h === 390) {
      // 手动切到“电脑键鼠”再回“自动识别”
      await page.evaluate(() => { __lj.app.toMenu(); __lj.manual(false); });
      await page.evaluate(() => document.querySelector('#menu .modes .btn[data-mode="pc"]').click());
      const m1 = await page.evaluate(() => ({ touch: !document.getElementById('touch').hidden, body: document.body.classList.contains('touch-on') }));
      await page.evaluate(() => document.querySelector('#menu .modes .btn[data-mode="auto"]').click());
      const m2 = await page.evaluate(() => ({ touch: !document.getElementById('touch').hidden, body: document.body.classList.contains('touch-on') }));
      check('手机：手动“电脑键鼠”收起虚拟键，恢复“自动识别”后回到触屏', !m1.touch && !m1.body && m2.touch && m2.body, { m1, m2 });
    }
    allErrors = allErrors.concat(errors);
    await browser.close();
  }

  // ---------- 竖屏窄窗口的电脑不旋转；强制手机触屏模式才旋转 ----------
  {
    const { browser, page, errors } = await open({ context: { viewport: { width: 600, height: 900 } } });
    const a = await gs(page);
    await page.evaluate(() => document.querySelector('#menu .modes .btn[data-mode="touch"]').click());
    const b = await gs(page);
    await page.evaluate(() => document.querySelector('#menu .modes .btn[data-mode="pc"]').click());
    const c = await gs(page);
    check('电脑窄高窗口：自动识别不旋转；手动“手机触屏”才旋转；“电脑键鼠”不旋转', !a.rot && b.rot && !c.rot, { a: a.rot, b: b.rot, c: c.rot });
    allErrors = allErrors.concat(errors);
    await browser.close();
  }

  const bad = results.filter((r) => !r.ok);
  for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
  console.log(`\n${results.length - bad.length}/${results.length} 通过`);
  console.log(allErrors.length ? 'ERRORS:\n' + allErrors.join('\n') : 'no errors');
  require('fs').writeFileSync(require('path').join(__dirname, 'out-mobile.json'), JSON.stringify({ at: new Date().toISOString(), note: '触屏为 Edge 无头浏览器的触控模拟，不是手机真机', results, errors: allErrors }, null, 1));
  process.exit(bad.length || allErrors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
