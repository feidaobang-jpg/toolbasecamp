// 玩家反馈回归：真实键鼠/CDP 多指输入 + 固定时钟判定；不代表手机真机性能。
// CD_BASE 可指向本地或已部署的网站。node qa/combat-feedback.js
const { launch, BASE, out, sleep } = require('./lib');
const fs = require('fs');
(async () => {
  const b = await launch(), results = [], errors = [];
  const ok = (name, pass, info) => { results.push({ name, pass: !!pass, info }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(info) || ''}`); };
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => errors.push(e.message));
  const C = (fn, arg) => page.evaluate(fn, arg), K = page.keyboard;
  const step = n => C(n => window.__CD_TEST__.step(n), n);
  const S = () => C(() => window.__CD_TEST__.snapshot());
  async function fresh(hero = 0) {
    await page.goto(BASE + '?test=1&seed=21');
    await page.locator('#menu [data-act=select]').click();
    await page.locator(`[data-hero="${hero}"]`).click(); if (await page.locator('#sel-go').isVisible()) await page.locator('#sel-go').click();
    await C(() => { const T = window.__CD_TEST__; T.manual(true); T.cheat.skipScript(); T.cheat.killAll(); T.step(120); T.cheat.G.player.invul = 999; });
  }
  async function reset() {
    await C(() => {
      const T = window.__CD_TEST__, G = T.cheat.G, p = G.player;
      for (const a of G.actors) if (a !== p) { a.alive = false; a.removed = true; a.model.root.visible = false; }
      G.waveOn = true; G.spawnQ = []; G.waveEnemies = [];
      Object.assign(p, { x: 7, z: 0, y: 0, vx: 0, vy: 0, vz: 0, face: Math.PI / 2, state: 'idle', st: 0, move: null, grab: null, sub: {}, hp: p.maxHp, invul: 999, hitstop: 0, weapon: null });
    });
  }
  async function dummy(dx = 1.1) {
    return C(dx => { const T = window.__CD_TEST__, id = T.cheat.enemy('ferris', dx, 0), e = T.cheat.G.actors.find(a => a.id === id); Object.assign(e, { hp: 300, maxHp: 300, cd: 999, state: 'idle', stun: 0, invul: 0 }); e.def = { ...e.def, aggr: 0, speed: 0 }; return id; }, dx);
  }
  const hp = id => C(id => window.__CD_TEST__.cheat.G.actors.find(a => a.id === id)?.hp, id);
  for (const [hero, move] of ['risingKick', 'rollingElbow', 'flipKick', 'rollingJump'].entries()) {
    await fresh(hero); await reset(); const id = await dummy();
    await K.press('KeyS'); await step(1); await K.press('KeyW'); await step(1); await K.press('KeyJ'); await step(1);
    ok(`英雄 ${hero} 下上拳触发独立招式`, await C(() => window.__CD_TEST__.cheat.G.player.move?.id) === move);
    await step(24); const damage = 300 - await hp(id);
    ok(`英雄 ${hero} 特殊技实际伤害且不扣血`, damage > 0 && (await S()).player.hp === 100, damage);
    await page.screenshot({ path: out(`feedback-special-${hero}.png`) }); await step(55);
    ok(`英雄 ${hero} 收招无反向翻转`, await C(() => Math.abs(Math.sin(window.__CD_TEST__.cheat.G.player.pose[0]))) < 0.1);
  }
  await fresh(2); await reset();
  await K.press('KeyS'); await sleep(650); await K.press('KeyW'); await K.press('KeyJ'); await step(1);
  ok('过期下上输入不会误出特殊技', !(await C(() => window.__CD_TEST__.cheat.G.player.move?.id === 'flipKick'))); await step(55);
  await reset(); const diveTarget = await dummy(1.5);
  await K.press('KeyK'); await step(13); await K.down('KeyD'); await K.press('KeyJ'); await step(1);
  ok('K→右→J 成为斜下踢而非必杀', await C(() => window.__CD_TEST__.cheat.G.player.sub.dive === true));
  await step(18); await K.up('KeyD');
  ok('斜下踢实际命中', (await hp(diveTarget)) < 300, await hp(diveTarget));
  for (const kind of ['gun', 'shotgun', 'smg', 'bazooka']) {
    await reset(); const id = await dummy(3);
    await C(kind => window.__CD_TEST__.cheat.give(kind), kind);
    const before = (await S()).player.weapon.ammo;
    await K.down('KeyJ'); await step(kind === 'smg' ? 36 : 1); await K.up('KeyJ');
    const after = (await S()).player.weapon.ammo;
    await step(42);
    ok(`${kind} 扣弹与命中`, before > after && (await hp(id)) < 300, { before, after, hp: await hp(id) });
    if (kind === 'smg') { await step(30); ok('冲锋枪松开停止连射', (await S()).player.weapon.ammo === after); }
  }
  await reset(); const rainTarget = await dummy(1.8);
  await C(() => { const p = window.__CD_TEST__.cheat.G.player; p.state = 'dead'; p.st = 1.3; p.hp = 0; p.alive = false; p.sub = {}; });
  await step(1);
  ok('死亡复活携带四发火箭筒并落下五枚火箭', (await S()).player.weapon?.kind === 'bazooka' && (await S()).player.weapon.ammo === 4 && await C(() => window.__CD_TEST__.cheat.G.projs.filter(p => p.kind === 'rocket' && p.rain).length) === 5);
  await step(22); await page.screenshot({ path: out('feedback-rocket-rain.png') }); await step(85);
  ok('火箭雨伤敌、不伤复活玩家、弹体清除', await hp(rainTarget) < 300 && (await S()).player.hp === 100 && await C(() => window.__CD_TEST__.cheat.G.projs.filter(p => p.kind === 'rocket' && p.rain).length) === 0);
  await C(() => { const T = window.__CD_TEST__; T.cheat.area(1); T.cheat.skipScript(); T.setCamera(1, 0); T.step(60); });
  await page.screenshot({ path: out('feedback-hall.png') });
  await page.close();

  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(), cdp = await ctx.newCDPSession(p);
  p.on('pageerror', e => errors.push(e.message));
  const M = fn => p.evaluate(fn), ms = n => p.evaluate(n => window.__CD_TEST__.step(n), n);
  const touch = async (type, points) => {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(pt => ({ ...pt, radiusX: 4, radiusY: 4, force: 1 })) });
    // Chromium 在下一显示帧派发合并后的 pointermove / capture 事件。
    await sleep(30);
  };
  const pos = async sel => { const r = await p.locator(sel).boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  await p.goto(BASE + '?test=1&seed=21');
  await p.locator('#menu [data-act=select]').click(); await p.locator('[data-hero="2"]').click(); if (await p.locator('#sel-go').isVisible()) await p.locator('#sel-go').click();
  await M(() => { const T = window.__CD_TEST__; T.manual(true); T.cheat.skipScript(); T.cheat.killAll(); T.step(120); T.cheat.G.player.invul = 999; });
  const joy = await pos('#joy-zone'), run = await pos('#btn-run'), atk = await pos('#btn-atk');
  const origin = { ...joy, id: 1 }, held = { x: joy.x + 55, y: joy.y, id: 1 };
  await touch('touchStart', [origin]); await touch('touchMove', [held]);
  await touch('touchStart', [held, { ...run, id: 2 }]); await ms(5);
  await touch('touchEnd', [{ ...run, id: 2 }]); await ms(30);
  ok('手机松开 I、摇杆持续推，仍在跑', await M(() => window.__CD_TEST__.snapshot().player.state === 'run'));
  await touch('touchStart', [held, { ...atk, id: 2 }]); await ms(1);
  ok('同一拇指从 I 移到 J 能发飞冲', await M(() => window.__CD_TEST__.cheat.G.player.move?.id === 'flyKick'), await M(() => window.__CD_TEST__.cheat.G.player.move?.id));
  await touch('touchEnd', []); await ms(85); await sleep(350);
  // 单独建立奔跑手势，验收摇杆回中；touchEnd 的点列是本次抬起的触点。
  await touch('touchStart', [origin]); await touch('touchMove', [held]);
  await touch('touchStart', [held, { ...run, id: 2 }]); await ms(4);
  await touch('touchEnd', [{ ...run, id: 2 }]); await ms(4);
  await touch('touchMove', [origin]); await ms(2);
  ok('摇杆回中立即停止奔跑', await M(() => window.__CD_TEST__.snapshot().player.state === 'idle'));
  await sleep(350); await touch('touchMove', [held]); await ms(3);
  ok('摇杆回中取消保持，再推恢复走路', await M(() => window.__CD_TEST__.snapshot().player.state === 'walk'), await M(() => window.__CD_TEST__.snapshot().player));
  await touch('touchEnd', []); await ms(30);
  await touch('touchStart', [origin]); await touch('touchMove', [{ ...origin, y: joy.y + 55 }]); await ms(1);
  await touch('touchMove', [{ ...origin, y: joy.y - 55 }]); await ms(1);
  await touch('touchStart', [{ ...origin, y: joy.y - 55 }, { ...atk, id: 2 }]); await ms(1);
  ok('手机摇杆下上 + J 触发特殊技', await M(() => window.__CD_TEST__.cheat.G.player.move?.id === 'flipKick'));
  await touch('touchEnd', []); await ms(70);
  await M(() => window.__CD_TEST__.setCamera(3, 0)); await ms(40);
  const axes0 = await M(() => window.__CD_TEST__.snapshot().cam.axes);
  await touch('touchStart', [{ x: 400, y: 110, id: 4 }]);
  await touch('touchMove', [{ x: 450, y: 110, id: 4 }]); await touch('touchMove', [{ x: 500, y: 110, id: 4 }]); await touch('touchEnd', []); await ms(15);
  const axes1 = await M(() => window.__CD_TEST__.snapshot().cam.axes);
  const dot = (axes1.fwd.x - axes0.fwd.x) * axes0.right.x + (axes1.fwd.z - axes0.fwd.z) * axes0.right.z;
  ok('第一人称右划，朝向朝屏幕右侧旋转', dot > 0.1, dot);
  await M(() => window.__CD_TEST__.setCamera(0, 0)); await ms(20);
  await touch('touchStart', [{ x: 400, y: 110, id: 4 }]); await touch('touchMove', [{ x: 500, y: 110, id: 4 }]); await touch('touchEnd', []); await ms(2);
  ok('侧视保留拖场景方向', await M(() => window.__CD_TEST__.snapshot().ui.yawOff > 0));
  ok('四个按钮无白色径向高光', await M(() => Array.from(document.querySelectorAll('.act')).every(e => !getComputedStyle(e).backgroundImage.includes('radial-gradient'))));
  await M(() => window.__CD_TEST__.setCamera(0, 0)); await ms(20); await p.screenshot({ path: out('feedback-mobile.png') });
  const beforeMode = await M(() => window.__CD_TEST__.snapshot());
  await p.locator('#btn-pause').click(); await p.locator('#pause [data-control-mode="hide"]').click();
  ok('切电脑隐藏虚拟键', await M(() => window.__CD_TEST__.snapshot().ui.touchHidden));
  await p.locator('#pause [data-control-mode="show"]').click(); await p.locator('#pause [data-act=resume]').click();
  ok('切回手机保留本局且输入清空', await M(() => { const s = window.__CD_TEST__.snapshot(); return !s.ui.touchHidden && s.input.stick.x === 0; }) && (await M(() => window.__CD_TEST__.snapshot().player.hp)) === beforeMode.player.hp);
  await ctx.close(); await b.close();
  ok('浏览器无运行错误', errors.length === 0, errors);
  const report = { date: new Date().toISOString(), base: BASE, results, errors, pass: results.filter(r => r.pass).length, total: results.length };
  fs.writeFileSync(out('combat-feedback.json'), JSON.stringify(report, null, 2));
  console.log(`${report.pass}/${report.total}`); if (report.pass !== report.total) process.exitCode = 1;
})().catch(e => { console.error(e); process.exit(1); });

