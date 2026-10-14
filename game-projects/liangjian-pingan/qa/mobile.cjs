// 双端布局与触屏（枪战类布局）：各尺寸菜单是否完整、手机竖屏旋转、浮动摇杆、滑屏瞄准、开火键拖动瞄准、各功能键、三种操作模式切换
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
    async up(id) { pts.delete(id); await send(pts.size ? 'touchMove' : 'touchEnd'); },
    async end() { pts.clear(); await send('touchEnd'); },
  };
}
const center = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
const step = (page, n) => page.evaluate((k) => __lj.step(k, true), n);
const gs = (page) => page.evaluate(() => { const g = __lj.game, h = g.hero; return { x: h.x, y: h.y, z: h.z, yaw: g.cam.yaw, pitch: g.cam.pitch, bullets: g.bullets.filter((b) => b.team === 0).length, state: __lj.app.state, view: g.cam.view, mode: __lj.app.mode(), rot: __lj.app.rot, size: __lj.app.size(), nades: h.nades, dashCd: h.dashCd, cavCd: h.cavCd, mag: h.mag, reloadT: h.reloadT, ads: h.ads, manned: g.cannon.manned }; });
const cleanField = (page, phase = 1, x = 0, z = 80) => page.evaluate(([ph, px, pz]) => { __lj.manual(true); const g = __lj.game; if (g.phase !== ph) g.reset(ph, false); for (const e of g.enemies) { e.alive = false; e.deadT = 9; } g.timers.length = 0; g.cut = 0; g.flags.counter = 1; g.flags.nA = 1; g.flags.nB = 1; g.flags.p1done = 1; for (const b of g.world.bunkers) b.cd = 999; g.place(g.hero, px, pz); g.cam.yaw = 0; g.cam.pitch = 0; __lj.app.demo = true; __lj.step(6, true); }, [phase, x, z]);
const BTN_IDS = ['joy-base', 'act-fire', 'act-jump', 'act-ads', 'act-reload', 'act-nade', 'act-dash', 'act-cav', 'btn-view', 'btn-pause', 'btn-full'];
const layoutScript = (ids) => {
  const vw = innerWidth, vh = innerHeight;
  const rs = ids.map((id) => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); return { id, hidden: e.hidden || !e.getClientRects().length, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }).filter((r) => !r.hidden);
  const off = rs.filter((r) => r.l < -0.5 || r.t < -0.5 || r.r > vw + 0.5 || r.b > vh + 0.5).map((r) => r.id);
  const over = [];
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i], b = rs[j]; if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) over.push(a.id + '×' + b.id); }
  const small = rs.filter((r) => Math.min(r.w, r.h) < 43.5).map((r) => r.id + ':' + Math.round(Math.min(r.w, r.h)));
  const text = rs.filter((r) => r.id.startsWith('act-')).filter((r) => [...document.getElementById(r.id).querySelectorAll('span,em')].some((s) => s.getClientRects().length && s.scrollWidth > document.getElementById(r.id).clientWidth + 2)).map((r) => r.id);
  const hud = document.getElementById('hud-left').getBoundingClientRect(), top = document.getElementById('hud-top').getBoundingClientRect();
  const hudOver = rs.filter((r) => r.id.startsWith('act-') || r.id === 'joy-base').filter((r) => (r.l < hud.right && hud.left < r.r && r.t < hud.bottom && hud.top < r.b) || (r.l < top.right && top.left < r.r && r.t < top.bottom && top.top < r.b)).map((r) => r.id);
  return { n: rs.length, off, over, small, text, hudOver, viewText: document.getElementById('btn-view').scrollWidth <= document.getElementById('btn-view').clientWidth + 1 };
};

(async () => {
  let allErrors = [];
  // ---------- 电脑各窗口尺寸：标题菜单不滚动看全 ----------
  for (const [w, h] of [[1366, 768], [1280, 720], [1366, 625], [1280, 580], [1920, 1080]]) {
    const { browser, page, errors } = await open({ context: { viewport: { width: w, height: h } } });
    const f = await page.evaluate(fitScript, 'menu');
    check(`电脑 ${w}×${h}：标题菜单完整且不滚动`, f.out.length === 0 && !f.scroll && !f.rot, f);
    if (h === 580) await shot(page, 'menu-1280x580.png');
    if (h === 720) {
      await shot(page, 'menu-1280x720.png');
      // 键盘走一遍菜单：↓ 到选项、→ 改值、能进入操作模式三键
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
      const before = await page.evaluate(() => __lj.app.s.lives);
      const focused = await page.evaluate(() => document.activeElement.dataset.opt);
      await page.keyboard.press('ArrowRight');
      const after = await page.evaluate(() => __lj.app.s.lives);
      check('键盘 ↓ 选到“命数”、→ 调整', focused === 'lives' && before !== after, { focused, before, after });
      await page.keyboard.press('ArrowLeft');
      for (let i = 0; i < 40; i++) { if (await page.evaluate(() => document.activeElement.dataset.mode === 'auto')) break; await page.keyboard.press('ArrowDown'); }
      const m1 = await page.evaluate(() => document.activeElement.dataset.mode);
      await page.keyboard.press('ArrowRight');
      const m2 = await page.evaluate(() => document.activeElement.dataset.mode);
      await page.keyboard.press('Enter');
      const st1 = await page.evaluate(() => ({ mode: __lj.app.s.mode, pressed: [...document.querySelectorAll('#menu .modes .btn')].map((b) => b.getAttribute('aria-pressed')) }));
      check('键盘能进入操作模式三键并切换', m1 === 'auto' && m2 === 'pc' && st1.mode === 'pc' && st1.pressed.join() === 'false,true,false', { m1, m2, st1 });
      await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
      const st2 = await page.evaluate(() => ({ mode: __lj.app.s.mode, touch: !document.getElementById('touch').hidden, body: document.body.classList.contains('touch-on'), rot: __lj.app.rot }));
      check('电脑上切到“手机触屏”：虚拟按键出现、横屏不旋转', st2.mode === 'touch' && st2.touch && st2.body && !st2.rot, st2);
      // 开局后用鼠标操作虚拟键
      await page.evaluate(() => document.querySelector('#menu .btn.primary').click());
      await cleanField(page);
      const lay = await page.evaluate(layoutScript, BTN_IDS);
      check('电脑 1280×720 的触屏布局：功能键不出界、不重叠、不压信息栏', !lay.off.length && !lay.over.length && !lay.small.length && !lay.hudOver.length, lay);
      const a = await gs(page);
      const [jx, jy] = await center(page, '#joy-base');
      await page.mouse.move(jx, jy); await page.mouse.down(); await page.mouse.move(jx, jy - 60, { steps: 4 }); await step(page, 30);
      const b = await gs(page);
      await page.mouse.up(); await step(page, 3);
      check('电脑用鼠标拖虚拟摇杆向上＝前进', b.z < a.z - 1.5 && Math.abs(b.x - a.x) < 0.6, { dz: (b.z - a.z).toFixed(2) });
      const [fx, fy] = await center(page, '#act-fire');
      await page.mouse.move(fx, fy); await page.mouse.down(); await step(page, 12); const c = await gs(page); await page.mouse.up(); await step(page, 2);
      check('电脑用鼠标按住虚拟开火键开火', c.bullets > 0, { bullets: c.bullets });
      await shot(page, 'pc-touchmode.png');
      // 暂停里切回电脑键鼠，本局保留
      await page.evaluate(() => __lj.app.pause());
      const pz = await page.evaluate(() => __lj.game.hero.z);
      await page.evaluate(() => document.querySelector('#pause .modes .btn[data-mode="pc"]').click());
      const st3 = await page.evaluate(() => ({ touch: !document.getElementById('touch').hidden, body: document.body.classList.contains('touch-on'), z: __lj.game.hero.z, state: __lj.app.state }));
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
    const portrait = h > w, tag = `手机 ${w}×${h}`;
    const f = await page.evaluate(fitScript, 'menu');
    const s0 = await gs(page);
    check(`${tag}：识别为触屏，${portrait ? '标题菜单起就旋转为横屏' : '横屏不旋转'}`, s0.mode === 'touch' && s0.rot === portrait && f.compact, { s0, f });
    if (mustFit) check(`${tag}：标题菜单完整显示`, f.out.length === 0 && !f.scroll, f);
    else {
      const reach = await page.evaluate(() => { const ov = document.getElementById('menu'); ov.scrollTop = 99999; const bs = [...ov.querySelectorAll('.btn')].filter((b) => b.getClientRects().length); const last = bs[bs.length - 1].getBoundingClientRect(); const okLast = last.bottom <= window.innerHeight + 1 && last.right <= window.innerWidth + 1 && last.left >= -1 && last.top >= -1; ov.scrollTop = 0; const first = bs[0].getBoundingClientRect(); return { okLast, okFirst: first.top >= -1 && first.left >= -1 && first.bottom <= window.innerHeight + 1 && first.right <= window.innerWidth + 1 }; });
      check(`${tag}：标题菜单可滚动且首尾可达`, reach.okFirst && reach.okLast, { reach, f });
    }
    const kb = await page.evaluate(() => [...document.querySelectorAll('#menu .foot .pc-only, #hud kbd, #touch .kb')].some((e) => e.getClientRects().length > 0));
    check(`${tag}：菜单与按键上不出现键盘专属提示`, !kb, null);
    if ((w === 844 && h === 390) || (w === 390 && h === 844) || (w === 844 && h === 346)) await shot(page, `menu-${w}x${h}.png`);

    if ((w === 844 && h === 390) || (w === 390 && h === 844) || (w === 844 && h === 346)) {
      const T = await touchSession(ctx, page);
      const [sx, sy] = await center(page, '#menu .btn.primary');
      await page.touchscreen.tap(sx, sy);
      await page.waitForTimeout(150);
      const st = await gs(page);
      check(`${tag}：点“开始战斗”进入游戏且不自动全屏`, st.state === 'play' && !(await page.evaluate(() => !!document.fullscreenElement)), st);
      await cleanField(page);
      const lay = await page.evaluate(layoutScript, BTN_IDS);
      check(`${tag}：摇杆、七个功能键、右上三键都在屏内、互不重叠、≥44px、不压信息栏`, lay.n === BTN_IDS.length && !lay.off.length && !lay.over.length && !lay.small.length && !lay.hudOver.length && !lay.text.length && lay.viewText, lay);
      // 逻辑方向：竖屏旋转后，逻辑“上”对应物理“右”，逻辑“右”对应物理“下”
      const up = portrait ? [1, 0] : [0, -1], right = portrait ? [0, 1] : [1, 0];
      const [jx, jy] = await center(page, '#joy-base');
      let a = await gs(page);
      await T.down(1, jx, jy); await T.move(1, jx + up[0] * 25, jy + up[1] * 25); await T.move(1, jx + up[0] * 50, jy + up[1] * 50);
      await step(page, 30);
      let b = await gs(page);
      check(`${tag}：摇杆上推＝前进`, b.z < a.z - 1.5 && Math.abs(b.x - a.x) < 0.8, { dx: (b.x - a.x).toFixed(2), dz: (b.z - a.z).toFixed(2) });
      // 多点：左手摇杆不放，右手按开火
      const [fx, fy] = await center(page, '#act-fire');
      await T.down(2, fx, fy); await step(page, 14);
      let c = await gs(page);
      check(`${tag}：边移动边按开火（多点触控）`, c.bullets > 0 && c.z < b.z - 0.5, { bullets: c.bullets, dz: (c.z - b.z).toFixed(2) });
      // 开火键按住时拖动也能瞄：逻辑向右拖＝向右看
      const y0 = c.yaw;
      for (let i = 1; i <= 6; i++) { await T.move(2, fx + right[0] * 12 * i, fy + right[1] * 12 * i); await step(page, 2); }
      await step(page, 10);
      const fdrag = await gs(page);
      check(`${tag}：按住开火键拖动＝边打边转准星`, fdrag.yaw < y0 - 0.1 && fdrag.bullets > 0, { dyaw: (fdrag.yaw - y0).toFixed(2) });
      await T.up(2); await T.move(1, jx + right[0] * 50, jy + right[1] * 50); await step(page, 24);
      let d = await gs(page);
      const rgt = [Math.cos(fdrag.yaw), -Math.sin(fdrag.yaw)];
      check(`${tag}：摇杆右推＝向右平移`, (d.x - fdrag.x) * rgt[0] + (d.z - fdrag.z) * rgt[1] > 1.2, { moved: [(d.x - fdrag.x).toFixed(2), (d.z - fdrag.z).toFixed(2)] });
      await T.end(); await step(page, 6);
      const e0 = await gs(page); await step(page, 12); const e1 = await gs(page);
      check(`${tag}：松手后停止移动、停止开火`, Math.abs(e1.x - e0.x) < 0.05 && Math.abs(e1.z - e0.z) < 0.05 && e1.mag === e0.mag, null);
      // 浮动摇杆：手指落在左下区域别处，摇杆跟到手指下面
      await cleanField(page);
      const zone = await page.evaluate(() => { const r = document.getElementById('joy-zone').getBoundingClientRect(); return [r.left + r.width * 0.62, r.top + r.height * 0.3]; });
      await T.down(1, zone[0], zone[1]);
      const bc = await center(page, '#joy-base');
      a = await gs(page);
      await T.move(1, zone[0] + up[0] * 25, zone[1] + up[1] * 25); await T.move(1, zone[0] + up[0] * 50, zone[1] + up[1] * 50); await step(page, 24);
      b = await gs(page);
      await T.end(); await step(page, 4);
      const back = await center(page, '#joy-base');
      check(`${tag}：浮动摇杆跟到手指落点，松手回到默认位置`, Math.hypot(bc[0] - zone[0], bc[1] - zone[1]) < 6 && b.z < a.z - 1.2 && Math.hypot(back[0] - jx, back[1] - jy) < 3, { bc, zone, back, jx, jy });
      // 空白处滑动瞄准：向右＝向右看，向上＝抬头
      const mid = [w * (portrait ? 0.5 : 0.62), h * (portrait ? 0.62 : 0.42)];
      a = await gs(page);
      await T.down(3, mid[0], mid[1]);
      for (let i = 1; i <= 8; i++) { await T.move(3, mid[0] + right[0] * 14 * i, mid[1] + right[1] * 14 * i); await step(page, 2); }
      await T.end(); await step(page, 20);
      b = await gs(page);
      check(`${tag}：右半屏向右滑＝向右看`, b.yaw < a.yaw - 0.15, { dyaw: (b.yaw - a.yaw).toFixed(2) });
      a = b;
      await T.down(3, mid[0], mid[1]);
      for (let i = 1; i <= 8; i++) { await T.move(3, mid[0] + up[0] * 10 * i, mid[1] + up[1] * 10 * i); await step(page, 2); }
      await T.end(); await step(page, 20);
      b = await gs(page);
      check(`${tag}：向上滑＝抬头`, b.pitch > a.pitch + 0.08 && Math.abs(b.yaw - a.yaw) < 0.05, { dp: (b.pitch - a.pitch).toFixed(2) });
      // 各功能键
      await cleanField(page);
      const tapBtn = async (sel) => { const [kx, ky] = await center(page, sel); await T.down(5, kx, ky); await step(page, 3); await T.end(); await step(page, 3); };
      let p0 = await gs(page); await tapBtn('#act-jump'); let p1 = await gs(page);
      check(`${tag}：跳跃键`, p1.y > 0.3, { y: p1.y.toFixed(2) });
      await step(page, 50);
      p0 = await gs(page); await tapBtn('#act-nade'); p1 = await gs(page);
      check(`${tag}：手榴弹键`, p1.nades === p0.nades - 1, [p0.nades, p1.nades]);
      await step(page, 40);
      await tapBtn('#act-ads'); p1 = await gs(page);
      const adsOn = await page.evaluate(() => document.getElementById('act-ads').classList.contains('on'));
      await tapBtn('#act-ads'); const p2 = await gs(page);
      check(`${tag}：开镜键点一下开、再点一下关`, p1.ads && adsOn && !p2.ads, { on: p1.ads, off: p2.ads });
      await T.down(5, fx, fy); await step(page, 30); await T.end(); await step(page, 4);
      p0 = await gs(page); await tapBtn('#act-reload'); p1 = await gs(page);
      check(`${tag}：换弹键`, p0.mag < 20 && p1.reloadT > 0, { mag: p0.mag, reloadT: p1.reloadT });
      const label = await page.evaluate(() => document.querySelector('#act-fire em').textContent);
      check(`${tag}：开火键上显示余弹`, /\d+\/\d+|换弹/.test(label), { label });
      // 左手开火键（可选）
      await page.evaluate(() => { __lj.app.cycle('leftFire', 1); });
      await step(page, 80);
      const lay2 = await page.evaluate(layoutScript, BTN_IDS.concat(['act-fire2']));
      const [lx, ly] = await center(page, '#act-fire2');
      p0 = await gs(page); await T.down(5, lx, ly); await step(page, 12); p1 = await gs(page); await T.end(); await step(page, 3);
      check(`${tag}：打开“左手开火键”后左侧多一个开火键，可用且不挤占其他控件`, lay2.n === BTN_IDS.length + 1 && !lay2.off.length && !lay2.over.length && !lay2.hudOver.length && p1.bullets > 0, { lay2, bullets: p1.bullets });
      await shot(page, `play-${w}x${h}.png`);
      await page.evaluate(() => { __lj.app.cycle('leftFire', 1); });
      // 操炮键
      await cleanField(page, 3, 0.5, 28);
      await step(page, 4);
      const useVis = await page.evaluate(() => ({ hidden: document.getElementById('act-use').hidden, text: document.querySelector('#act-use span').textContent, prompt: document.getElementById('prompt').hidden }));
      const layU = await page.evaluate(layoutScript, BTN_IDS.concat(['act-use']));
      await tapBtn('#act-use'); const mn = await gs(page);
      const useText2 = await page.evaluate(() => document.querySelector('#act-use span').textContent);
      // 操炮时：摇杆右推转炮口、开火键开炮
      const [jx2, jy2] = await center(page, '#joy-base');
      const cy0 = await page.evaluate(() => __lj.game.cannon.aimYaw);
      await T.down(1, jx2, jy2); await T.move(1, jx2 + right[0] * 25, jy2 + right[1] * 25); await T.move(1, jx2 + right[0] * 50, jy2 + right[1] * 50); await step(page, 20); await T.end(); await step(page, 3);
      const cy1 = await page.evaluate(() => __lj.game.cannon.aimYaw);
      await T.down(5, fx, fy); await step(page, 4); await T.end(); await step(page, 4);
      const sh = await page.evaluate(() => __lj.game.cannon.shells);
      await shot(page, `cannon-${w}x${h}.png`);
      await tapBtn('#act-use'); const lv = await gs(page);
      check(`${tag}：炮位旁出现“操炮”键（不出现键盘提示），点击上炮；摇杆转炮口、开火键开炮；再点“离开炮位”`, !useVis.hidden && useVis.text === '操炮' && useVis.prompt && mn.manned && useText2 === '离开炮位' && cy1 < cy0 - 0.1 && sh === 7 && !lv.manned && !layU.off.length && !layU.over.length, { useVis, manned: mn.manned, useText2, cy0, cy1, sh, layU });
      // 右上角：切换人称（按下即触发）、暂停
      await cleanField(page, 1);
      const [vx, vy] = await center(page, '#btn-view');
      await T.down(6, vx, vy); await T.end(); await step(page, 3);
      const v1 = await gs(page);
      check(`${tag}：右上“切换人称”按下即切到第一人称`, v1.view === 1, { view: v1.view });
      const tip = await page.evaluate(() => document.getElementById('toast').textContent);
      check(`${tag}：切视角提示不含键盘字样`, !/Q\/E|Esc|Enter|鼠标|按 [A-Z]/.test(tip), { tip });
      await shot(page, `play-fp-${w}x${h}.png`);
      await T.down(6, vx, vy); await T.end(); await step(page, 3);
      const [px, py] = await center(page, '#btn-pause');
      await T.down(7, px, py); await T.end(); await page.waitForTimeout(60);
      const ps = await gs(page);
      const pf = await page.evaluate(fitScript, 'pause');
      check(`${tag}：暂停菜单完整显示`, ps.state === 'pause' && pf.out.length === 0 && !pf.scroll, pf);
      const kb2 = await page.evaluate(() => [...document.querySelectorAll('#pause kbd')].some((e) => e.getClientRects().length > 0));
      check(`${tag}：暂停菜单不出现键盘提示`, !kb2, null);
      await shot(page, `pause-${w}x${h}.png`);
      await page.evaluate(() => { __lj.app.resume(); const g = __lj.game; g.flags.loot = 1; g.finish(true); });
      await page.waitForTimeout(60);
      const rf = await page.evaluate(fitScript, 'result');
      check(`${tag}：结算面板完整显示`, rf.out.length === 0 && !rf.scroll, rf);
      await shot(page, `result-${w}x${h}.png`);
    }
    if (w === 844 && h === 390) {
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
